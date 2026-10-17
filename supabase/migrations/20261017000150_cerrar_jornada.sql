-- Cierre de jornada + reporte a Telegram. El token se lee de Vault (secreto 'telegram_token').
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

    select coalesce(string_agg('• ' || medio_pago || ': <b>$' || to_char(sub_total, 'FM999G999G999') || '</b> (' || cant || ' ped.)', E'\n'), 'Sin pagos')
    into v_pagos_txt
    from (
        select medio_pago, sum(total) as sub_total, count(*) as cant from public.pedidos
        where (estado = 'completado' and (not p_solo_anteriores or (created_at at time zone 'America/Bogota')::date <= v_fecha_corte))
           or (estado = 'cerrado' and (created_at at time zone 'America/Bogota')::date = v_fecha_corte)
        group by medio_pago
    ) t;

    select coalesce(string_agg(pos || '. ' || nombre_prod || ': <b>' || uds || ' uds.</b>', E'\n'), 'Sin ítems')
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
