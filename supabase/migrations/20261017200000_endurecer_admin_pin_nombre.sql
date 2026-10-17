-- 1) Admin real: solo usuarios con app_metadata.rol = 'admin' (no cualquier usuario autenticado).
--    app_metadata no puede ser modificado por el propio usuario.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol":"admin"}'::jsonb;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
    select coalesce(
        (select u.raw_app_meta_data ->> 'rol' = 'admin' from auth.users u where u.id = auth.uid()),
        false);
$$;
revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- 2) Límite de intentos de PIN (esquema privado, no expuesto por la API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.pin_intentos (
    id bigint generated always as identity primary key,
    creado_en timestamptz not null default now()
);

create or replace function private.pin_bloqueado()
returns boolean
language sql
stable
as $$
    select count(*) >= 15 from private.pin_intentos where creado_en > now() - interval '15 minutes';
$$;

create or replace function private.registrar_fallo_pin()
returns void
language sql
as $$
    delete from private.pin_intentos where creado_en < now() - interval '1 day';
    insert into private.pin_intentos default values;
$$;

-- 3) acceso_clientes: ahora cuenta intentos fallidos y bloquea tras 15 en 15 min
create or replace function public.acceso_clientes(p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    v_hab boolean;
    v_pin text;
    v_in  text := btrim(coalesce(p_pin, ''));
    v_ok  boolean;
begin
    v_hab := coalesce((select valor from public.configuracion_sistema where clave = 'clientes_habilitados'), 'true') <> 'false';
    v_pin := (select valor from public.configuracion_sistema where clave = 'cliente_pin');

    if v_in = '' then
        return jsonb_build_object('habilitado', v_hab, 'pin_ok', false);
    end if;
    if private.pin_bloqueado() then
        return jsonb_build_object('habilitado', v_hab, 'pin_ok', false, 'bloqueado', true);
    end if;

    v_ok := coalesce(v_pin, '') <> '' and v_pin = v_in;
    if not v_ok then perform private.registrar_fallo_pin(); end if;
    return jsonb_build_object('habilitado', v_hab, 'pin_ok', v_ok);
end $$;

-- 4) registrar_pedido_atomico: PIN obligatorio en el servidor + nombre y apellido para clientes
drop function if exists public.registrar_pedido_atomico(uuid, character varying, character varying, numeric, text, timestamptz, jsonb, text, timestamptz);

create or replace function public.registrar_pedido_atomico(
    p_pedido_id uuid, p_cliente_nombre character varying, p_medio_pago character varying, p_total numeric,
    p_notas text, p_created_at timestamptz, p_items jsonb, p_estado text default 'completado',
    p_entrega_programada_at timestamptz default null, p_pin text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    v_cliente_id uuid; v_item jsonb; v_nombre varchar; v_actual text; v_pin text;
    v_admin boolean := public.es_admin(); v_total numeric := 0; v_precio numeric; v_cant int;
begin
    v_nombre := initcap(trim(coalesce(p_cliente_nombre, '')));
    if v_nombre = '' or length(v_nombre) > 120 then raise exception 'Nombre de cliente inválido' using errcode = '22023'; end if;
    if not v_admin and v_nombre !~ '^[^[:digit:][:space:]]{2,}(\s+[^[:digit:][:space:]]{2,})+$' then
        raise exception 'Escribe nombre y apellido' using errcode = '22023'; end if;
    if p_estado not in ('completado','apartado') then raise exception 'Estado inválido' using errcode = '22023'; end if;
    if p_total is null or p_total < 0 then raise exception 'Total inválido' using errcode = '22023'; end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 60 then
        raise exception 'Ítems inválidos' using errcode = '22023'; end if;
    if (select count(distinct i->>'id') from jsonb_array_elements(p_items) i) <> jsonb_array_length(p_items) then
        raise exception 'Ítems repetidos' using errcode = '22023'; end if;

    if not v_admin then
        if coalesce((select valor from public.configuracion_sistema where clave = 'clientes_habilitados'), 'true') = 'false' then
            raise exception 'Recepción de pedidos cerrada' using errcode = '22023'; end if;
        if private.pin_bloqueado() then return false; end if;
        v_pin := (select valor from public.configuracion_sistema where clave = 'cliente_pin');
        if coalesce(v_pin, '') = '' or v_pin <> btrim(coalesce(p_pin, '')) then
            perform private.registrar_fallo_pin();
            return false;
        end if;
    end if;

    select estado into v_actual from public.pedidos where id = p_pedido_id;
    if v_actual = 'cerrado' then return true; end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
        v_cant := (v_item->>'cantidad')::int;
        if v_cant is null or v_cant < 1 or v_cant > 50 then raise exception 'Cantidad inválida' using errcode = '22023'; end if;
        if not v_admin then
            select precio_actual into v_precio from public.productos where id = v_item->>'id' and activo and disponible;
            if v_precio is null then raise exception 'Producto no disponible: %', v_item->>'id' using errcode = '22023'; end if;
            v_total := v_total + v_precio * v_cant;
        end if;
    end loop;
    if not v_admin then p_total := v_total; end if;

    insert into public.clientes (nombre) values (v_nombre)
    on conflict (nombre) do update set nombre = excluded.nombre returning id into v_cliente_id;

    insert into public.pedidos (id, cliente_id, medio_pago, total, notas, created_at, estado, entrega_programada_at)
    values (p_pedido_id, v_cliente_id, p_medio_pago, p_total, coalesce(p_notas,''), coalesce(p_created_at, now()), p_estado, p_entrega_programada_at)
    on conflict (id) do update set total = excluded.total, notas = excluded.notas, medio_pago = excluded.medio_pago,
        estado = excluded.estado, entrega_programada_at = excluded.entrega_programada_at, created_at = excluded.created_at;

    for v_item in select * from jsonb_array_elements(p_items) loop
        v_cant := (v_item->>'cantidad')::int;
        if v_admin then v_precio := (v_item->>'precio')::numeric;
        else select precio_actual into v_precio from public.productos where id = v_item->>'id'; end if;
        insert into public.pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario_historico, producto_nombre_historico)
        values (p_pedido_id, v_item->>'id', v_cant, v_precio, v_item->>'nombre')
        on conflict (pedido_id, producto_id) do update set cantidad = excluded.cantidad,
            precio_unitario_historico = excluded.precio_unitario_historico,
            producto_nombre_historico = excluded.producto_nombre_historico;
    end loop;
    return true;
end $function$;

revoke execute on function public.registrar_pedido_atomico(uuid, character varying, character varying, numeric, text, timestamptz, jsonb, text, timestamptz, text) from public;
grant execute on function public.registrar_pedido_atomico(uuid, character varying, character varying, numeric, text, timestamptz, jsonb, text, timestamptz, text) to anon, authenticated;

-- 5) cerrar_jornada_y_notificar: solo admin (el cron corre sin JWT y sigue funcionando)
do $$
declare v_def text; v_new text;
begin
    select pg_get_functiondef('public.cerrar_jornada_y_notificar(text, boolean)'::regprocedure) into v_def;
    v_new := replace(v_def,
        E'BEGIN\n    SELECT decrypted_secret',
        E'BEGIN\n    IF auth.uid() IS NOT NULL AND NOT public.es_admin() THEN RAISE EXCEPTION ''No autorizado'' USING ERRCODE = ''42501''; END IF;\n    SELECT decrypted_secret');
    if v_new = v_def then raise exception 'No se pudo parchear cerrar_jornada_y_notificar'; end if;
    execute v_new;
end $$;

-- 6) Restricción de estado ya validada contra los datos existentes
alter table public.pedidos validate constraint pedidos_estado_check;
