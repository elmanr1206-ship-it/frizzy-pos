-- Respaldo diario: una función protegida por token que devuelve todos los datos en JSON,
-- y otra (solo para el dueño, desde el SQL Editor) que restaura un respaldo.
create schema if not exists private;

create table if not exists private.respaldo_acceso (
    id int primary key default 1 check (id = 1),
    token_hash text not null,
    creado timestamptz not null default now()
);

-- Genera un token nuevo, guarda solo su hash y lo devuelve UNA vez. Ejecutar desde el SQL Editor:
--   select private.nuevo_token_respaldo();
create or replace function private.nuevo_token_respaldo()
returns text language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
    insert into private.respaldo_acceso (id, token_hash)
    values (1, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
    on conflict (id) do update set token_hash = excluded.token_hash, creado = now();
    return v_token;
end $$;

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
        'configuracion_sistema', coalesce((select jsonb_agg(to_jsonb(x)) from public.configuracion_sistema x), '[]'::jsonb),
        'clientes', coalesce((select jsonb_agg(to_jsonb(x)) from public.clientes x), '[]'::jsonb),
        'pedidos', coalesce((select jsonb_agg(to_jsonb(x)) from public.pedidos x), '[]'::jsonb),
        'pedido_detalles', coalesce((select jsonb_agg(to_jsonb(x)) from public.pedido_detalles x), '[]'::jsonb),
        'reportes_fallidos', coalesce((select jsonb_agg(to_jsonb(x)) from public.reportes_fallidos x), '[]'::jsonb)
    );
end $$;
revoke execute on function public.exportar_respaldo(text) from public;
grant execute on function public.exportar_respaldo(text) to anon, authenticated;

-- Restaura un respaldo (solo agrega lo que falta; no pisa filas existentes). Desde el SQL Editor:
--   select private.restaurar_respaldo('<pega aquí el JSON>'::jsonb);
create or replace function private.restaurar_respaldo(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare t text; cols text; n bigint; res jsonb := '{}'::jsonb;
begin
    foreach t in array array['productos', 'configuracion_sistema', 'clientes', 'pedidos', 'pedido_detalles', 'reportes_fallidos'] loop
        if p -> t is null then continue; end if;
        select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols
          from information_schema.columns where table_schema = 'public' and table_name = t and is_generated = 'NEVER';
        execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', t, cols, cols, t)
            using p -> t;
        get diagnostics n = row_count;
        res := res || jsonb_build_object(t, n);
    end loop;
    return res;
end $$;
