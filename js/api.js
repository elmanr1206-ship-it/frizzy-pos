export const SUPABASE_URL = 'https://satsdiydoeilmdruyiru.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhdHNkaXlkb2VpbG1kcnV5aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODM2NDMsImV4cCI6MjEwNjM1OTY0M30.YMDXmmBrwzeXYKiO2CAA_QR1xrDnGqzgXNhtMrfAvJE';

let supabaseInstance = null;

// Carga resiliente con versión fija (#1): si inicia sin internet y sin caché del CDN, no rompe el POS
export async function getSupabase() {
    if (supabaseInstance) return supabaseInstance;
    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
        supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabaseInstance;
    } catch (err) {
        console.warn('Supabase SDK no disponible offline:', err);
        return null;
    }
}

export function normalizarNombreCliente(nombre) {
    return nombre
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (l) => l.toUpperCase());
}

export const api = {
    async loginAdmin(email, password) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión a internet' } };
        return await sb.auth.signInWithPassword({ email, password });
    },

    async getSession() {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data } = await sb.auth.getSession();
        return data?.session || null;
    },

    async obtenerProductos() {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data, error } = await sb.from('productos').select('id, categoria, nombre, precio_actual');
        if (error) {
            console.error('Error leyendo productos:', error);
            return null;
        }
        return data;
    },

    async pushPedido(pedidoLocal) {
        const sb = await getSupabase();
        if (!sb) return { ok: false, permanent: false };

        if (!pedidoLocal || !Array.isArray(pedidoLocal.items) || pedidoLocal.items.length === 0) {
            return { ok: false, permanent: true, reason: 'Pedido sin ítems válidos' };
        }

        try {
            const nombreNormalizado = normalizarNombreCliente(pedidoLocal.cliente);

            // Intento 1: Usar el RPC transaccional atómico (#3 y #10)
            const { data: rpcOk, error: rpcError } = await sb.rpc('registrar_pedido_atomico', {
                p_pedido_id: pedidoLocal.id,
                p_cliente_nombre: nombreNormalizado,
                p_medio_pago: pedidoLocal.pago,
                p_total: pedidoLocal.total,
                p_notas: pedidoLocal.notas || '',
                p_created_at: pedidoLocal.fechaISO || new Date().toISOString(),
                p_items: pedidoLocal.items
            });

            if (!rpcError && rpcOk) {
                return { ok: true, permanent: false };
            }

            // Respaldo con Upsert idempotente si el RPC aún no ha sido creado en Supabase
            const { data: clienteData, error: clienteError } = await sb
                .from('clientes')
                .upsert([{ nombre: nombreNormalizado }], { onConflict: 'nombre' })
                .select('id')
                .single();

            if (clienteError) throw clienteError;

            const { error: pedidoError } = await sb
                .from('pedidos')
                .upsert([{
                    id: pedidoLocal.id,
                    cliente_id: clienteData.id,
                    medio_pago: pedidoLocal.pago,
                    total: pedidoLocal.total,
                    notas: pedidoLocal.notas || '',
                    created_at: pedidoLocal.fechaISO || new Date().toISOString()
                }], { onConflict: 'id' });

            if (pedidoError) throw pedidoError;

            const detalles = pedidoLocal.items.map(item => ({
                pedido_id: pedidoLocal.id,
                producto_id: item.id,
                cantidad: item.cantidad,
                precio_unitario_historico: item.precio || 0
            }));

            const { error: detallesError } = await sb
                .from('pedido_detalles')
                .upsert(detalles, { onConflict: 'pedido_id,producto_id' });

            if (detallesError) throw detallesError;

            return { ok: true, permanent: false };
        } catch (error) {
            console.error('Fallo al sincronizar con Supabase:', error);
            // Códigos 23503 (FK inexistente) o 22P02 (sintaxis inválida) son errores permanentes (#5)
            const esPermanente = error?.code === '23503' || error?.code === '22P02';
            return { ok: false, permanent: esPermanente, reason: error?.message || 'Error de red' };
        }
    },

    async deletePedido(pedidoId) {
        const sb = await getSupabase();
        if (!sb) return false;
        const { error } = await sb.from('pedidos').delete().eq('id', pedidoId);
        return !error;
    },

    async actualizarPrecioProducto(productoId, nuevoPrecio) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión' } };

        // Usar .select() para confirmar que la fila realmente existe y fue modificada (#4)
        const { data, error } = await sb
            .from('productos')
            .update({ precio_actual: nuevoPrecio })
            .eq('id', productoId)
            .select('id, precio_actual');

        if (error) return { error };
        if (!data || data.length === 0) {
            return { error: { message: `No se pudo actualizar "${productoId}" (verifica permisos RLS o ID).` } };
        }
        return { error: null, data: data[0] };
    },

    async obtenerComprasCliente(nombreCliente) {
        const sb = await getSupabase();
        if (!sb) return 0;
        try {
            const nombreLimpio = normalizarNombreCliente(nombreCliente);
            const { data: cliente, error: errCli } = await sb
                .from('clientes')
                .select('id')
                .ilike('nombre', nombreLimpio)
                .maybeSingle();

            if (errCli || !cliente) return 0;

            const { count, error: errPed } = await sb
                .from('pedidos')
                .select('*', { count: 'exact', head: true })
                .eq('cliente_id', cliente.id);

            if (errPed) return 0;
            return count || 0;
        } catch (error) {
            console.error('Error consultando fidelización:', error);
            return 0;
        }
    }
};