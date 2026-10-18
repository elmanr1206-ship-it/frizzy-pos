-- contar_compras_cliente ya no responde a cualquiera con la clave pública:
-- el admin con sesión cuenta directo; un cliente debe enviar el PIN del local.
-- Sin PIN no cuenta como intento (no bloquea a nadie); un PIN incorrecto sí cuenta, igual que en registrar_pedido_atomico.
drop function if exists public.contar_compras_cliente(character varying);

create or replace function public.contar_compras_cliente(p_nombre character varying, p_pin text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_pin text;
begin
    if not public.es_admin() then
        if private.pin_bloqueado() then return 0; end if;
        if btrim(coalesce(p_pin, '')) = '' then return 0; end if;
        v_pin := (select valor from public.configuracion_sistema where clave = 'cliente_pin');
        if coalesce(v_pin, '') = '' or v_pin <> btrim(p_pin) then
            perform private.registrar_fallo_pin();
            return 0;
        end if;
    end if;
    return (select count(*)::int from public.pedidos p join public.clientes c on c.id = p.cliente_id
            where lower(c.nombre) = lower(initcap(trim(coalesce(p_nombre, '')))));
end
$function$;

revoke execute on function public.contar_compras_cliente(character varying, text) from public;
grant execute on function public.contar_compras_cliente(character varying, text) to anon, authenticated;
