-- El bloqueo del PIN ahora es por IP (8 fallos en 15 min) con un tope global alto (100),
-- para que alguien malintencionado no pueda bloquear a todos los clientes.
alter table private.pin_intentos add column if not exists ip text;

create or replace function private.ip_cliente()
returns text language sql stable
as $$
    select coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(h ->> 'x-real-ip', ''),
                    nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), 'desconocida')
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) s
$$;

create or replace function private.pin_bloqueado()
returns boolean language sql stable
as $$
    select coalesce(count(*) filter (where ip = private.ip_cliente()) >= 8, false) or count(*) >= 100
    from private.pin_intentos where creado_en > now() - interval '15 minutes'
$$;

create or replace function private.registrar_fallo_pin()
returns void language sql
as $$
    delete from private.pin_intentos where creado_en < now() - interval '1 day';
    insert into private.pin_intentos (ip) values (private.ip_cliente());
$$;
