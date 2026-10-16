-- ============================================================================
-- FRIZZY POS — ESQUEMA ACTUALIZADO (idempotente y NO destructivo)
-- ANTES de ejecutar: Supabase > Authentication > Sign In / Providers >
--   desactiva "Allow new users to sign up" (admin = cualquier usuario autenticado).
-- NO incluye cerrar_jornada_y_notificar (envía el reporte a Telegram): no se
--   redefine aquí para no pisar tu versión actual.
-- Tras ejecutarlo: entra como admin > Menú y Ajustes y define el PIN de clientes
--   (ya no hay PIN por defecto).
-- ============================================================================
create extension if not exists pgcrypto;

-- Admin = usuario autenticado. Para restringir a un correo:
--   select (auth.jwt()->>'email') = 'tu@correo.com'
create or replace function public.es_admin() returns boolean
language sql stable as $$ select auth.uid() is not null $$;

-- ---------- Tablas ----------
create table if not exists public.productos (
    id varchar(50) primary key,
    categoria varchar(30) not null default 'general',
    nombre varchar(100) not null,
    precio_actual numeric(12,2) not null check (precio_actual >= 0),
    updated_at timestamptz not null default now()
);
alter table public.productos add column if not exists disponible boolean not null default true;
alter table public.productos add column if not exists activo boolean not null default true;

insert into public.productos (id, categoria, nombre, precio_actual) values
    ('papas','bowl','Papas',10000), ('yuca','bowl','Yuca',8000),
    ('salchicha','acompanante','Salchicha',3000), ('chorizo','acompanante','Chorizo',5000),
    ('pollo','acompanante','Pollo (Nuggets)',4000), ('carne','acompanante','Carne',5000),
    ('papachongo','topping','Papa Chongo',1000), ('lechuga','topping','Lechuga',500),
    ('picodegallo','topping','Pico de Gallo',1000), ('queso','topping','Queso',2000),
    ('tocineta','topping','Salsa de Tocineta',2000), ('vasito','bebida','Vasito',1500)
on conflict (id) do nothing;

create table if not exists public.clientes (
    id uuid primary key default gen_random_uuid(),
    nombre varchar(120) not null,
    created_at timestamptz not null default now()
);
create unique index if not exists clientes_nombre_key on public.clientes (nombre);

create table if not exists public.pedidos (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references public.clientes(id) on delete restrict,
    medio_pago varchar(40) not null,
    total numeric(12,2) not null check (total >= 0),
    notas text default '',
    created_at timestamptz not null default now()
);
alter table public.pedidos add column if not exists estado text not null default 'completado';
alter table public.pedidos add column if not exists entrega_programada_at timestamptz;
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
    check (estado in ('completado','apartado','cerrado')) not valid;
-- Nota: si tu tabla tiene la columna extra "creado_en" y es NOT NULL sin default, dale un default now().

create table if not exists public.pedido_detalles (
    id uuid primary key default gen_random_uuid(),
    pedido_id uuid not null references public.pedidos(id) on delete cascade,
    producto_id varchar(50) not null references public.productos(id) on delete restrict,
    cantidad integer not null check (cantidad > 0),
    precio_unitario_historico numeric(12,2) not null check (precio_unitario_historico >= 0)
);
alter table public.pedido_detalles add column if not exists producto_nombre_historico text;
create unique index if not exists pedido_detalles_pedido_producto_unique
    on public.pedido_detalles (pedido_id, producto_id);

create table if not exists public.configuracion_sistema (
    clave text primary key,
    valor text not null default '',
    updated_at timestamptz not null default now()
);
insert into public.configuracion_sistema (clave, valor) values ('clientes_habilitados','true')
on conflict (clave) do nothing;

-- ---------- Funciones (se recrean sin dejar sobrecargas viejas) ----------
do $$ declare r record; begin
  for r in select oid::regprocedure as sig from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('registrar_pedido_atomico','actualizar_pedido_existente',
                             'contar_compras_cliente','acceso_clientes','estado_pedidos_cliente')
  loop execute 'drop function ' || r.sig; end loop;
end $$;

create function public.registrar_pedido_atomico(
    p_pedido_id uuid, p_cliente_nombre varchar, p_medio_pago varchar, p_total numeric,
    p_notas text, p_created_at timestamptz, p_items jsonb,
    p_estado text default 'completado', p_entrega_programada_at timestamptz default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
    v_cliente_id uuid; v_item jsonb; v_nombre varchar; v_actual text;
begin
    v_nombre := initcap(trim(coalesce(p_cliente_nombre, '')));
    if v_nombre = '' or length(v_nombre) > 120 then
        raise exception 'Nombre de cliente inválido' using errcode = '22023'; end if;
    if p_estado not in ('completado','apartado') then
        raise exception 'Estado inválido' using errcode = '22023'; end if;
    if p_total is null or p_total < 0 then
        raise exception 'Total inválido' using errcode = '22023'; end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) not between 1 and 60 then
        raise exception 'Ítems inválidos' using errcode = '22023'; end if;

    -- Con el acceso de clientes cerrado, solo el admin puede registrar pedidos
    if not public.es_admin() and coalesce((select valor from public.configuracion_sistema
            where clave = 'clientes_habilitados'), 'true') = 'false' then
        raise exception 'Recepción de pedidos cerrada' using errcode = '22023'; end if;

    select estado into v_actual from public.pedidos where id = p_pedido_id;
    if v_actual = 'cerrado' then return true; end if;   -- un día cerrado no se reescribe

    insert into public.clientes (nombre) values (v_nombre)
    on conflict (nombre) do update set nombre = excluded.nombre
    returning id into v_cliente_id;

    insert into public.pedidos (id, cliente_id, medio_pago, total, notas, created_at, estado, entrega_programada_at)
    values (p_pedido_id, v_cliente_id, p_medio_pago, p_total, coalesce(p_notas,''),
            coalesce(p_created_at, now()), p_estado, p_entrega_programada_at)
    on conflict (id) do update set
        total = excluded.total, notas = excluded.notas, medio_pago = excluded.medio_pago,
        estado = excluded.estado, entrega_programada_at = excluded.entrega_programada_at,
        created_at = excluded.created_at;

    for v_item in select * from jsonb_array_elements(p_items) loop
        insert into public.pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario_historico, producto_nombre_historico)
        values (p_pedido_id, v_item->>'id', (v_item->>'cantidad')::int,
                (v_item->>'precio')::numeric, v_item->>'nombre')
        on conflict (pedido_id, producto_id) do update set
            cantidad = excluded.cantidad,
            precio_unitario_historico = excluded.precio_unitario_historico,
            producto_nombre_historico = excluded.producto_nombre_historico;
    end loop;
    return true;
end $$;

create function public.actualizar_pedido_existente(
    p_pedido_id uuid, p_nuevo_nombre varchar, p_nuevo_pago varchar
) returns boolean
language plpgsql security definer set search_path = public as $$
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

create function public.contar_compras_cliente(p_nombre varchar) returns integer
language sql stable security definer set search_path = public as $$
    select count(*)::int from public.pedidos p join public.clientes c on c.id = p.cliente_id
    where lower(c.nombre) = lower(initcap(trim(coalesce(p_nombre,''))));
$$;

create function public.acceso_clientes(p_pin text) returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'habilitado', coalesce((select valor from public.configuracion_sistema where clave = 'clientes_habilitados'), 'true') <> 'false',
        'pin_ok', exists (select 1 from public.configuracion_sistema
                          where clave = 'cliente_pin' and valor <> '' and valor = btrim(coalesce(p_pin,''))));
$$;

-- El cliente consulta solo el estado de SUS pedidos, por id (UUID no adivinable)
create function public.estado_pedidos_cliente(p_ids uuid[])
returns table (id uuid, estado text, medio_pago varchar, created_at timestamptz, entrega_programada_at timestamptz)
language sql stable security definer set search_path = public as $$
    select p.id, p.estado, p.medio_pago, p.created_at, p.entrega_programada_at
    from public.pedidos p where p.id = any (p_ids[1:100]);
$$;
grant execute on function public.estado_pedidos_cliente(uuid[]) to anon, authenticated;

revoke all on function public.actualizar_pedido_existente(uuid, varchar, varchar) from public, anon;
grant execute on function public.actualizar_pedido_existente(uuid, varchar, varchar) to authenticated;
grant execute on function public.registrar_pedido_atomico(uuid, varchar, varchar, numeric, text, timestamptz, jsonb, text, timestamptz) to anon, authenticated;
grant execute on function public.contar_compras_cliente(varchar) to anon, authenticated;
grant execute on function public.acceso_clientes(text) to anon, authenticated;

-- ---------- RLS: se eliminan las políticas abiertas anteriores ----------
alter table public.productos enable row level security;
alter table public.clientes enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_detalles enable row level security;
alter table public.configuracion_sistema enable row level security;

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('productos','clientes','pedidos','pedido_detalles','configuracion_sistema')
  loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

-- Menú: lectura pública (el POS lo necesita); escritura solo admin
create policy menu_lectura on public.productos for select to anon, authenticated using (true);
create policy menu_admin on public.productos for all to authenticated
    using (public.es_admin()) with check (public.es_admin());
-- Todo lo demás: solo admin. Los clientes anónimos escriben únicamente vía RPC.
create policy clientes_admin on public.clientes for all to authenticated
    using (public.es_admin()) with check (public.es_admin());
create policy pedidos_admin on public.pedidos for all to authenticated
    using (public.es_admin()) with check (public.es_admin());
create policy detalles_admin on public.pedido_detalles for all to authenticated
    using (public.es_admin()) with check (public.es_admin());
create policy config_admin on public.configuracion_sistema for all to authenticated
    using (public.es_admin()) with check (public.es_admin());

-- Realtime (si la publicación existe)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.pedidos; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.productos; exception when duplicate_object then null; end;
  end if;
end $$;