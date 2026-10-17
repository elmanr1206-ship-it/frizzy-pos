-- Baseline exportado de producción (proyecto frizzi). Tablas, restricciones, índices, RLS y políticas.
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.clientes (
  id uuid not null default uuid_generate_v4(),
  nombre character varying(100) not null,
  fecha_registro timestamp with time zone default now()
);
create table if not exists public.productos (
  id character varying(50) not null,
  categoria character varying(50) not null,
  nombre character varying(100) not null,
  precio_actual numeric(10,2) not null,
  disponible boolean not null default true,
  activo boolean not null default true
);
create table if not exists public.pedidos (
  id uuid not null default uuid_generate_v4(),
  cliente_id uuid,
  medio_pago character varying(50) not null,
  notas text,
  total numeric(10,2) not null,
  creado_en timestamp with time zone default now(),
  created_at timestamp with time zone not null default now(),
  estado character varying(20) not null default 'completado',
  entrega_programada_at timestamp with time zone
);
create table if not exists public.pedido_detalles (
  id uuid not null default uuid_generate_v4(),
  pedido_id uuid,
  producto_id character varying(50),
  cantidad integer not null,
  precio_unitario_historico numeric(10,2) not null,
  subtotal numeric(10,2) default ((cantidad)::numeric * precio_unitario_historico),
  producto_nombre_historico character varying(100)
);
create table if not exists public.configuracion_sistema (
  clave character varying(50) not null,
  valor text not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.clientes add constraint clientes_pkey primary key (id);
alter table public.clientes add constraint clientes_nombre_key unique (nombre);
alter table public.productos add constraint productos_pkey primary key (id);
alter table public.configuracion_sistema add constraint configuracion_sistema_pkey primary key (clave);
alter table public.pedidos add constraint pedidos_pkey primary key (id);
alter table public.pedidos add constraint pedidos_cliente_id_fkey foreign key (cliente_id) references public.clientes(id);
-- NOT VALID: producción tiene filas históricas que pueden no cumplirlo; se valida con VALIDATE CONSTRAINT.
alter table public.pedidos add constraint pedidos_estado_check
  check (estado::text = any (array['completado','apartado','cerrado']::text[])) not valid;
alter table public.pedido_detalles add constraint pedido_detalles_pkey primary key (id);
alter table public.pedido_detalles add constraint pedido_detalles_cantidad_check check (cantidad > 0);
alter table public.pedido_detalles add constraint pedido_detalles_pedido_id_fkey
  foreign key (pedido_id) references public.pedidos(id) on delete cascade;
alter table public.pedido_detalles add constraint pedido_detalles_pedido_producto_unique unique (pedido_id, producto_id);

create index if not exists pedidos_estado_created_idx on public.pedidos using btree (estado, created_at);
create index if not exists pedidos_created_at_idx on public.pedidos using btree (created_at);
create index if not exists pedidos_cliente_id_idx on public.pedidos using btree (cliente_id);

alter table public.clientes enable row level security;
alter table public.productos enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_detalles enable row level security;
alter table public.configuracion_sistema enable row level security;
