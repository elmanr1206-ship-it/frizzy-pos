-- Correcciones de la revisión de seguridad (17/10/2026).
-- 1) Escape HTML en el reporte de Telegram (parse_mode HTML): medio_pago y nombres ya no pueden romperlo ni meter enlaces.
-- 2) Clientes: nombre del ítem tomado de `productos` (no del cliente), fecha acotada y notas <= 500 caracteres.
-- 3) PIN: sin PIN no cuenta como intento fallido; PIN nuevo de 6 a 12 dígitos (el actual de 4 sigue valiendo hasta que lo cambies).
-- 4) cerrar_jornada_y_notificar: solo admin (o cron), definida completa en vez de parchearla por reemplazo de texto.

create or replace function private.esc_html(p text)
returns text language sql immutable
set search_path to pg_catalog, pg_temp
as $$ select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;

alter function private.pin_bloqueado() set search_path to pg_catalog, pg_temp;
alter function private.registrar_fallo_pin() set search_path to pg_catalog, pg_temp;

-- NOT VALID: el PIN actual (4 dígitos) no cumple; el cambio de PIN en Ajustes ya exige la regla nueva.
alter table public.configuracion_sistema
  add constraint cliente_pin_formato check (clave <> 'cliente_pin' or valor ~ '^[0-9]{6,12}$') not valid;

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
    v_cliente_id uuid; v_item jsonb; v_nombre varchar; v_actual text; v_pin text; v_nom_prod text;
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
        -- Sin PIN no es un intento de adivinarlo: no cuenta para el bloqueo (evita que un dispositivo sin PIN bloquee a todos)
        if btrim(coalesce(p_pin, '')) = '' then return false; end if;
        v_pin := (select valor from public.configuracion_sistema where clave = 'cliente_pin');
        if coalesce(v_pin, '') = '' or v_pin <> btrim(coalesce(p_pin, '')) then
            perform private.registrar_fallo_pin();
            return false;
        end if;
    end if;

    -- Un cliente no puede fijar fechas arbitrarias ni notas gigantes
    if not v_admin and (p_created_at is null or p_created_at > now() + interval '5 minutes' or p_created_at < now() - interval '2 days') then
        p_created_at := now();
    end if;
    p_notas := left(coalesce(p_notas, ''), 500);

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
        if v_admin then v_precio := (v_item->>'precio')::numeric; v_nom_prod := left(v_item->>'nombre', 100);
        else select precio_actual, nombre into v_precio, v_nom_prod from public.productos where id = v_item->>'id'; end if;
        insert into public.pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario_historico, producto_nombre_historico)
        values (p_pedido_id, v_item->>'id', v_cant, v_precio, v_nom_prod)
        on conflict (pedido_id, producto_id) do update set cantidad = excluded.cantidad,
            precio_unitario_historico = excluded.precio_unitario_historico,
            producto_nombre_historico = excluded.producto_nombre_historico;
    end loop;
    return true;
end $function$;

create or replace function public.cerrar_jornada_y_notificar(p_api_key text default null, p_solo_anteriores boolean default false)
 returns jsonb language plpgsql security definer
 set "TimeZone" to 'America/Bogota'
 set search_path to 'public', 'pg_temp'
as $$
declare
    v_pedidos_abiertos int := 0; v_total_ventas numeric := 0; v_total_pedidos int := 0; v_personas int := 0;
    v_fecha_corte date; v_fecha_str text; v_pagos_txt text := ''; v_top_txt text := ''; v_mensaje text;
    v_token text := ''; v_chat_ids_raw text := ''; v_single_chat_id text;
begin
    if auth.uid() is not null and not public.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
    select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_token' limit 1;
    if v_token is null then
        select valor into v_token from public.configuracion_sistema where clave = 'telegram_token';
    end if;
    select valor into v_chat_ids_raw from public.configuracion_sistema where clave = 'telegram_chat_id';

    if p_solo_anteriores or (
        extract(hour from (now() at time zone 'America/Bogota')) = 0
        and extract(minute from (now() at time zone 'America/Bogota')) < 15
    ) then
        v_fecha_corte := ((now() at time zone 'America/Bogota') - interval '1 day')::date;
    else
        v_fecha_corte := (now() at time zone 'America/Bogota')::date;
    end if;
    v_fecha_str := to_char(v_fecha_corte, 'DD/MM/YYYY');

    select count(*) into v_pedidos_abiertos from public.pedidos
    where estado = 'completado'
      and (not p_solo_anteriores or (created_at at time zone 'America/Bogota')::date < (now() at time zone 'America/Bogota')::date);

    if v_pedidos_abiertos = 0 then
        return jsonb_build_object('cerrados', 0, 'mensaje', 'La caja ya estaba cerrada, sin ventas nuevas');
    end if;

    select count(*), coalesce(sum(total), 0), count(distinct cliente_id)
    into v_total_pedidos, v_total_ventas, v_personas
    from public.pedidos
    where (estado = 'completado' and (not p_solo_anteriores or (created_at at time zone 'America/Bogota')::date <= v_fecha_corte))
       or (estado = 'cerrado' and (created_at at time zone 'America/Bogota')::date = v_fecha_corte);

    select coalesce(string_agg('• ' || private.esc_html(medio_pago) || ': <b>$' || to_char(sub_total, 'FM999G999G999') || '</b> (' || cant || ' ped.)', E'\n'), 'Sin pagos')
    into v_pagos_txt
    from (
        select medio_pago, sum(total) as sub_total, count(*) as cant from public.pedidos
        where (estado = 'completado' and (not p_solo_anteriores or (created_at at time zone 'America/Bogota')::date <= v_fecha_corte))
           or (estado = 'cerrado' and (created_at at time zone 'America/Bogota')::date = v_fecha_corte)
        group by medio_pago
    ) t;

    select coalesce(string_agg(pos || '. ' || private.esc_html(nombre_prod) || ': <b>' || uds || ' uds.</b>', E'\n'), 'Sin ítems')
    into v_top_txt
    from (
        select row_number() over (order by sum(pd.cantidad) desc) as pos,
               coalesce(max(pd.producto_nombre_historico), max(pr.nombre), pd.producto_id, 'Producto') as nombre_prod,
               sum(pd.cantidad) as uds
        from public.pedido_detalles pd
        join public.pedidos p on p.id = pd.pedido_id
        left join public.productos pr on pr.id = pd.producto_id
        where (p.estado = 'completado' and (not p_solo_anteriores or (p.created_at at time zone 'America/Bogota')::date <= v_fecha_corte))
           or (p.estado = 'cerrado' and (p.created_at at time zone 'America/Bogota')::date = v_fecha_corte)
        group by coalesce(pd.producto_id, pd.producto_nombre_historico)
        order by sum(pd.cantidad) desc
        limit 5
    ) r;

    v_mensaje := '📊 <b>REPORTE DE CIERRE FRIZZY POS</b>' || E'\n' ||
                 '📅 <b>Fecha:</b> ' || v_fecha_str || E'\n' ||
                 '────────────────────' || E'\n' ||
                 '🧾 <b>Pedidos (Bowls):</b> ' || v_total_pedidos || E'\n' ||
                 '👥 <b>Personas atendidas:</b> ' || v_personas || E'\n' ||
                 '💰 <b>Total Ventas:</b> $' || to_char(v_total_ventas, 'FM999G999G999') || E'\n' ||
                 '────────────────────' || E'\n' ||
                 '💳 <b>Por Medio de Pago:</b>' || E'\n' || v_pagos_txt || E'\n' ||
                 '────────────────────' || E'\n' ||
                 '🏆 <b>Top Más Vendidos:</b>' || E'\n' || v_top_txt;

    if p_solo_anteriores then
        update public.pedidos set estado = 'cerrado'
        where estado = 'completado'
          and (created_at at time zone 'America/Bogota')::date < (now() at time zone 'America/Bogota')::date;
    else
        update public.pedidos set estado = 'cerrado' where estado = 'completado';
    end if;

    if v_token is not null and trim(v_token) <> '' and v_chat_ids_raw is not null then
        foreach v_single_chat_id in array string_to_array(v_chat_ids_raw, ',')
        loop
            v_single_chat_id := trim(v_single_chat_id);
            if v_single_chat_id <> '' then
                perform net.http_post(
                    url := 'https://api.telegram.org/bot' || trim(v_token) || '/sendMessage',
                    headers := jsonb_build_object('Content-Type', 'application/json'),
                    body := jsonb_build_object('chat_id', v_single_chat_id, 'text', v_mensaje, 'parse_mode', 'HTML'));
            end if;
        end loop;
    end if;

    return jsonb_build_object('cerrados', v_pedidos_abiertos, 'total', v_total_ventas, 'resumen', v_mensaje);
end $$;

-- create or replace conserva los permisos existentes; se reafirman por claridad
revoke execute on function public.cerrar_jornada_y_notificar(text, boolean) from public, anon;
revoke execute on function public.registrar_pedido_atomico(uuid, character varying, character varying, numeric, text, timestamptz, jsonb, text, timestamptz, text) from public;
grant execute on function public.registrar_pedido_atomico(uuid, character varying, character varying, numeric, text, timestamptz, jsonb, text, timestamptz, text) to anon, authenticated;
