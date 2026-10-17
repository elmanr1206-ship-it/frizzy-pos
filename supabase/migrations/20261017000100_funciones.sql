-- Funciones de la app (exportadas de producción).
create or replace function public.es_admin()
 returns boolean language sql stable
 set search_path to 'public', 'pg_temp'
as $$ select auth.uid() is not null $$;

create or replace function public.acceso_clientes(p_pin text)
 returns jsonb language sql stable security definer
 set search_path to 'public'
as $$
    select jsonb_build_object(
        'habilitado', coalesce((select valor from public.configuracion_sistema where clave = 'clientes_habilitados'), 'true') <> 'false',
        'pin_ok', exists (select 1 from public.configuracion_sistema
                          where clave = 'cliente_pin' and valor <> '' and valor = btrim(coalesce(p_pin,''))));
$$;

create or replace function public.contar_compras_cliente(p_nombre character varying)
 returns integer language sql stable security definer
 set search_path to 'public'
as $$
    select count(*)::int from public.pedidos p join public.clientes c on c.id = p.cliente_id
    where lower(c.nombre) = lower(initcap(trim(coalesce(p_nombre,''))));
$$;

create or replace function public.estado_pedidos_cliente(p_ids uuid[])
 returns table(id uuid, estado text, medio_pago character varying, created_at timestamp with time zone, entrega_programada_at timestamp with time zone)
 language sql stable security definer
 set search_path to 'public'
as $$
    select p.id, p.estado, p.medio_pago, p.created_at, p.entrega_programada_at
    from public.pedidos p where p.id = any (p_ids[1:100]);
$$;

create or replace function public.actualizar_pedido_existente(p_pedido_id uuid, p_nuevo_nombre character varying, p_nuevo_pago character varying)
 returns boolean language plpgsql security definer
 set search_path to 'public'
as $$
declare v_cliente_id uuid; v_nombre varchar;
begin
    if not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
    v_nombre := initcap(trim(coalesce(p_nuevo_nombre, '')));
    if v_nombre = '' then raise exception 'Nombre inválido' using errcode = '22023'; end if;
    insert into public.clientes (nombre) values (v_nombre)
    on conflict (nombre) do update set nombre = excluded.nombre
    returning id into v_cliente_id;
    update public.pedidos set cliente_id = v_cliente_id, medio_pago = p_nuevo_pago
    where id = p_pedido_id;
    return found;
end $$;

create or replace function public.registrar_pedido_atomico(p_pedido_id uuid, p_cliente_nombre character varying, p_medio_pago character varying, p_total numeric, p_notas text, p_created_at timestamp with time zone, p_items jsonb, p_estado text default 'completado', p_entrega_programada_at timestamp with time zone default null)
 returns boolean language plpgsql security definer
 set search_path to 'public'
as $$
declare
    v_cliente_id uuid; v_item jsonb; v_nombre varchar; v_actual text;
    v_admin boolean := public.es_admin(); v_total numeric := 0; v_precio numeric; v_cant int;
begin
    v_nombre := initcap(trim(coalesce(p_cliente_nombre, '')));
    if v_nombre = '' or length(v_nombre) > 120 then raise exception 'Nombre de cliente inválido' using errcode = '22023'; end if;
    if p_estado not in ('completado','apartado') then raise exception 'Estado inválido' using errcode = '22023'; end if;
    if p_total is null or p_total < 0 then raise exception 'Total inválido' using errcode = '22023'; end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 60 then
        raise exception 'Ítems inválidos' using errcode = '22023'; end if;
    if (select count(distinct i->>'id') from jsonb_array_elements(p_items) i) <> jsonb_array_length(p_items) then
        raise exception 'Ítems repetidos' using errcode = '22023'; end if;
    if not v_admin and coalesce((select valor from public.configuracion_sistema where clave = 'clientes_habilitados'), 'true') = 'false' then
        raise exception 'Recepción de pedidos cerrada' using errcode = '22023'; end if;

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
end $$;
