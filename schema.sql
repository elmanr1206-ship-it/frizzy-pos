-- ============================================================================
-- FRIZZY POS — ESQUEMA RELACIONAL 3NF, RPC ATÓMICO Y POLÍTICAS RLS (SUPABASE)
-- ============================================================================

-- 1. Extensiones necesarias para generación de UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla: productos (Catálogo maestro del menú)
CREATE TABLE IF NOT EXISTS public.productos (
    id VARCHAR(50) PRIMARY KEY,
    categoria VARCHAR(30) NOT NULL DEFAULT 'general',
    nombre VARCHAR(100) NOT NULL,
    precio_actual NUMERIC(12, 2) NOT NULL CHECK (precio_actual >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS categoria VARCHAR(30) DEFAULT 'general';
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS nombre VARCHAR(100);
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS precio_actual NUMERIC(12, 2) DEFAULT 0;

-- Semilla inicial e idempotente de productos de Frizzy
INSERT INTO public.productos (id, categoria, nombre, precio_actual) VALUES
    ('papas', 'bowl', 'Papas', 10000),
    ('yuca', 'bowl', 'Yuca', 8000),
    ('salchicha', 'acompanante', 'Salchicha', 3000),
    ('chorizo', 'acompanante', 'Chorizo', 5000),
    ('pollo', 'acompanante', 'Pollo (Nuggets)', 4000),
    ('carne', 'acompanante', 'Carne', 5000),
    ('papachongo', 'topping', 'Papa Chongo', 1000),
    ('lechuga', 'topping', 'Lechuga', 500),
    ('picodegallo', 'topping', 'Pico de Gallo', 1000),
    ('queso', 'topping', 'Queso', 2000),
    ('tocineta', 'topping', 'Salsa de Tocineta', 2000),
    ('vasito', 'bebida', 'Vasito', 1500)
ON CONFLICT (id) DO NOTHING;

-- 3. Tabla: clientes (Fidelización y cumplimiento Ley 1581 de 2012)
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalización de nombres previos y eliminación segura de duplicados
UPDATE public.clientes SET nombre = INITCAP(TRIM(nombre));

DELETE FROM public.clientes a USING public.clientes b
WHERE a.id > b.id AND LOWER(TRIM(a.nombre)) = LOWER(TRIM(b.nombre));

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_nombre_key;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_nombre_key UNIQUE (nombre);

-- 4. Tabla: pedidos (Cabecera transaccional de ventas)
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    medio_pago VARCHAR(40) NOT NULL,
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    notas TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS notas TEXT DEFAULT '';
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 5. Tabla: pedido_detalles (Líneas de pedido en 3NF con precio_unitario_historico)
CREATE TABLE IF NOT EXISTS public.pedido_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    producto_id VARCHAR(50) NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario_historico NUMERIC(12, 2) NOT NULL CHECK (precio_unitario_historico >= 0)
);

-- Limpiar posibles líneas duplicadas previas y aplicar restricción UNIQUE compuesta
DELETE FROM public.pedido_detalles a USING public.pedido_detalles b
WHERE a.ctid > b.ctid AND a.pedido_id = b.pedido_id AND a.producto_id = b.producto_id;

ALTER TABLE public.pedido_detalles DROP CONSTRAINT IF EXISTS pedido_detalles_pedido_producto_unique;
ALTER TABLE public.pedido_detalles ADD CONSTRAINT pedido_detalles_pedido_producto_unique UNIQUE (pedido_id, producto_id);

-- Garantizar ON DELETE CASCADE al eliminar un pedido desde la caja
ALTER TABLE public.pedido_detalles DROP CONSTRAINT IF EXISTS pedido_detalles_pedido_id_fkey;
ALTER TABLE public.pedido_detalles ADD CONSTRAINT pedido_detalles_pedido_id_fkey
    FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;

-- 6. Función RPC Transaccional y Atómica (ACID) para sincronización Offline-First
CREATE OR REPLACE FUNCTION public.registrar_pedido_atomico(
    p_pedido_id UUID,
    p_cliente_nombre VARCHAR,
    p_medio_pago VARCHAR,
    p_total NUMERIC,
    p_notas TEXT,
    p_created_at TIMESTAMPTZ,
    p_items JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cliente_id UUID;
    v_item JSONB;
    v_nombre_limpio VARCHAR;
BEGIN
    v_nombre_limpio := INITCAP(TRIM(p_cliente_nombre));

    -- 1. Upsert del cliente normalizado
    INSERT INTO public.clientes (nombre)
    VALUES (v_nombre_limpio)
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id INTO v_cliente_id;

    -- 2. Upsert de la cabecera del pedido respetando la hora real de venta en el iPad
    INSERT INTO public.pedidos (id, cliente_id, medio_pago, total, notas, created_at)
    VALUES (
        p_pedido_id,
        v_cliente_id,
        p_medio_pago,
        p_total,
        COALESCE(p_notas, ''),
        COALESCE(p_created_at, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        total = EXCLUDED.total,
        notas = EXCLUDED.notas,
        medio_pago = EXCLUDED.medio_pago;

    -- 3. Upsert idempotente de cada línea de detalle con su precio_unitario_historico
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.pedido_detalles (
            pedido_id,
            producto_id,
            cantidad,
            precio_unitario_historico
        )
        VALUES (
            p_pedido_id,
            v_item->>'id',
            (v_item->>'cantidad')::INT,
            (v_item->>'precio')::NUMERIC
        )
        ON CONFLICT (pedido_id, producto_id) DO UPDATE SET
            cantidad = EXCLUDED.cantidad,
            precio_unitario_historico = EXCLUDED.precio_unitario_historico;
    END LOOP;

    RETURN TRUE;
END;
$$;

-- 7. Políticas Row Level Security (RLS)
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_detalles ENABLE ROW LEVEL SECURITY;

-- Productos: lectura pública para el POS, actualización exclusiva para Administrador autenticado
DROP POLICY IF EXISTS "public_select_productos" ON public.productos;
CREATE POLICY "public_select_productos" ON public.productos
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_productos" ON public.productos;
CREATE POLICY "auth_update_productos" ON public.productos
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Clientes: lectura e inserción/actualización operativa desde el POS
DROP POLICY IF EXISTS "anon_select_clientes" ON public.clientes;
CREATE POLICY "anon_select_clientes" ON public.clientes
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_clientes" ON public.clientes;
CREATE POLICY "anon_insert_clientes" ON public.clientes
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_clientes" ON public.clientes;
CREATE POLICY "anon_update_clientes" ON public.clientes
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Pedidos: lectura, inserción, actualización y eliminación propagada
DROP POLICY IF EXISTS "anon_select_pedidos" ON public.pedidos;
CREATE POLICY "anon_select_pedidos" ON public.pedidos
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pedidos" ON public.pedidos;
CREATE POLICY "anon_insert_pedidos" ON public.pedidos
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pedidos" ON public.pedidos;
CREATE POLICY "anon_update_pedidos" ON public.pedidos
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_pedidos" ON public.pedidos;
CREATE POLICY "auth_delete_pedidos" ON public.pedidos
    FOR DELETE TO anon, authenticated USING (true);

-- Detalles de pedido: lectura, inserción y actualización
DROP POLICY IF EXISTS "anon_select_detalles" ON public.pedido_detalles;
CREATE POLICY "anon_select_detalles" ON public.pedido_detalles
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_detalles" ON public.pedido_detalles;
CREATE POLICY "anon_insert_detalles" ON public.pedido_detalles
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_detalles" ON public.pedido_detalles;
CREATE POLICY "anon_update_detalles" ON public.pedido_detalles
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS disponible BOOLEAN NOT NULL DEFAULT true;