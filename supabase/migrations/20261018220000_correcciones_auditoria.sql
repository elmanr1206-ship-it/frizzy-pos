-- Correcciones de la auditoría (18/10/2026):
-- 1) La fidelidad (contar_compras_cliente) solo cuenta compras cobradas (completado / cerrado):
--    un apartado sin cobrar o cancelado ya no suma ni resta compras.
-- 2) Al borrar un pedido (o reasignarlo a otro cliente), el cliente que se queda sin pedidos se elimina:
--    ya no se acumulan clientes huérfanos. Se limpian también los que ya existían.
-- 3) medio_pago solo admite los medios que usa el POS.

-- 1) Fidelidad
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
            where p.estado in ('completado', 'cerrado')
              and lower(c.nombre) = lower(initcap(trim(coalesce(p_nombre, '')))));
end
$function$;

revoke execute on function public.contar_compras_cliente(character varying, text) from public;
grant execute on function public.contar_compras_cliente(character varying, text) to anon, authenticated;

-- 2) Clientes sin pedidos
create or replace function private.limpiar_cliente_huerfano()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
    if old.cliente_id is not null
       and (tg_op = 'DELETE' or old.cliente_id is distinct from new.cliente_id) then
        delete from public.clientes c
        where c.id = old.cliente_id
          and not exists (select 1 from public.pedidos p where p.cliente_id = c.id);
    end if;
    return null;
end
$function$;

revoke all on function private.limpiar_cliente_huerfano() from public, anon, authenticated;

drop trigger if exists trg_limpiar_cliente_huerfano_del on public.pedidos;
create trigger trg_limpiar_cliente_huerfano_del
    after delete on public.pedidos
    for each row execute function private.limpiar_cliente_huerfano();

drop trigger if exists trg_limpiar_cliente_huerfano_upd on public.pedidos;
create trigger trg_limpiar_cliente_huerfano_upd
    after update of cliente_id on public.pedidos
    for each row execute function private.limpiar_cliente_huerfano();

-- Limpieza única de los huérfanos que ya existían
delete from public.clientes c
where not exists (select 1 from public.pedidos p where p.cliente_id = c.id);

-- 3) Medios de pago válidos
alter table public.pedidos drop constraint if exists pedidos_medio_pago_check;
alter table public.pedidos
    add constraint pedidos_medio_pago_check check (medio_pago in ('Efectivo', 'Llave', 'Nequi'));
