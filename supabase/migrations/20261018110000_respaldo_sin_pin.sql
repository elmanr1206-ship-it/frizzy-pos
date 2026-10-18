-- El respaldo ya no incluye el PIN de clientes (cliente_pin). La restauración solo agrega lo que falta, así que no lo borra.
create or replace function public.exportar_respaldo(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'private', 'pg_temp'
as $$
declare v_hash text;
begin
    select token_hash into v_hash from private.respaldo_acceso where id = 1;
    if v_hash is null or p_token is null or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> v_hash then
        raise exception 'No autorizado' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'version', 1,
        'generado', now(),
        'productos', coalesce((select jsonb_agg(to_jsonb(x)) from public.productos x), '[]'::jsonb),
        -- el PIN de clientes no va en el respaldo: el repo es público y el PIN es la única barrera de los clientes
        'configuracion_sistema', coalesce((select jsonb_agg(to_jsonb(x)) from public.configuracion_sistema x where x.clave <> 'cliente_pin'), '[]'::jsonb),
        'clientes', coalesce((select jsonb_agg(to_jsonb(x)) from public.clientes x), '[]'::jsonb),
        'pedidos', coalesce((select jsonb_agg(to_jsonb(x)) from public.pedidos x), '[]'::jsonb),
        'pedido_detalles', coalesce((select jsonb_agg(to_jsonb(x)) from public.pedido_detalles x), '[]'::jsonb),
        'reportes_fallidos', coalesce((select jsonb_agg(to_jsonb(x)) from public.reportes_fallidos x), '[]'::jsonb)
    );
end $$;
