export const SUPABASE_URL = 'https://satsdiydoeilmdruyiru.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhdHNkaXlkb2VpbG1kcnV5aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODM2NDMsImV4cCI6MjEwNjM1OTY0M30.YMDXmmBrwzeXYKiO2CAA_QR1xrDnGqzgXNhtMrfAvJE';

let supabaseInstance = null;
let supabaseInitPromise = null;

export async function getSupabase() {
    if (supabaseInstance) return supabaseInstance;
    if (supabaseInitPromise) return supabaseInitPromise;

    supabaseInitPromise = (async () => {
        try {
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
            supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                    lock: async (_name, _acquireTimeout, fn) => await fn()
                }
            });
            return supabaseInstance;
        } catch (err) {
            console.warn('Supabase SDK no disponible offline:', err);
            supabaseInitPromise = null;
            return null;
        }
    })();

    return supabaseInitPromise;
}

export function normalizarNombreCliente(nombre) {
    // Mayúscula inicial por palabra, compatible con tildes (igual que initcap de Postgres)
    return String(nombre || '')
        .trim()
        .toLowerCase()
        .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, sep, letra) => sep + letra.toUpperCase());
}

// Genera timestamp ISO con el offset exacto de Colombia (-05:00) para evitar el desfase de 5 horas (4:00 UTC)
export function obtenerFechaBogotaISO(dateObj = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = {};
    fmt.formatToParts(dateObj).forEach((p) => { parts[p.type] = p.value; });
    const hora = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day}T${hora}:${parts.minute}:${parts.second}-05:00`;
}

export function formatearHoraBogota(isoOrDate) {
    if (!isoOrDate) return '';
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatearFechaBogota(isoOrDate = new Date()) {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
}

export const api = {
    async loginAdmin(email, password) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión a internet' } };
        return await sb.auth.signInWithPassword({ email, password });
    },

    async logoutAdmin() {
        const sb = await getSupabase();
        if (!sb) return;
        await sb.auth.signOut();
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
        const { data, error } = await sb
            .from('productos')
            .select('*')
            .order('nombre', { ascending: true });
        if (error) {
            console.error('Error leyendo productos:', error);
            return null;
        }
        // Filtrar los productos que no hayan sido desactivados/eliminados
        return (data || []).filter((p) => p.activo !== false);
    },

    async crearProductoAdmin(nuevoProd) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión a internet' } };

        const payload = {
            id: nuevoProd.id,
            nombre: nuevoProd.nombre,
            categoria: nuevoProd.categoria,
            precio_actual: Number(nuevoProd.precio),
            disponible: true,
            activo: true
        };

        let { data, error } = await sb
            .from('productos')
            .upsert([payload], { onConflict: 'id' })
            .select('*');

        if (error) {
            // Fallback por si la tabla aún no tiene las columnas disponible/activo
            const fallback = await sb
                .from('productos')
                .upsert([{
                    id: nuevoProd.id,
                    nombre: nuevoProd.nombre,
                    categoria: nuevoProd.categoria,
                    precio_actual: Number(nuevoProd.precio)
                }], { onConflict: 'id' })
                .select('*');
            data = fallback.data;
            error = fallback.error;
        }

        return { data: data?.[0] || null, error };
    },

    async eliminarProductoAdmin(productoId) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión a internet' } };

        // 1. Intentar borrado físico si nunca ha tenido ventas históricas
        const { error: delError } = await sb
            .from('productos')
            .delete()
            .eq('id', productoId);

        if (!delError) return { error: null };

        // 2. Si tiene ventas en pedido_detalles (FK 23503), desactivar con activo = false para conservar contabilidad histórica
        const { error: softErr } = await sb
            .from('productos')
            .update({ activo: false, disponible: false })
            .eq('id', productoId);

        return { error: softErr };
    },

    async actualizarProductoAdmin(productoId, cambios) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión' } };

        const payload = { precio_actual: cambios.precio_actual };
        if (typeof cambios.disponible === 'boolean') {
            payload.disponible = cambios.disponible;
        }

        let { data, error } = await sb
            .from('productos')
            .update(payload)
            .eq('id', productoId)
            .select('id, precio_actual');

        if (error && payload.disponible !== undefined) {
            const retry = await sb
                .from('productos')
                .update({ precio_actual: cambios.precio_actual })
                .eq('id', productoId)
                .select('id, precio_actual');
            data = retry.data;
            error = retry.error;
        }

        if (error) return { error };
        if (!data || data.length === 0) {
            return { error: { message: `No se pudo actualizar "${productoId}"` } };
        }
        return { error: null, data: data[0] };
    },

    async actualizarPrecioProducto(productoId, nuevoPrecio) {
        return await this.actualizarProductoAdmin(productoId, { precio_actual: nuevoPrecio });
    },

    async obtenerClientes() {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data, error } = await sb
            .from('clientes')
            .select('nombre')
            .order('nombre', { ascending: true });
        if (error) return null;
        return (data || []).map((c) => c.nombre);
    },

    async pushPedido(pedidoLocal) {
        const sb = await getSupabase();
        if (!sb) return { ok: false, permanent: false };

        if (!pedidoLocal || !Array.isArray(pedidoLocal.items) || pedidoLocal.items.length === 0) {
            return { ok: false, permanent: true, reason: 'Pedido sin ítems válidos' };
        }

        try {
            const nombreNormalizado = normalizarNombreCliente(pedidoLocal.cliente);
            const fechaVentaBogota = pedidoLocal.fechaISO || obtenerFechaBogotaISO();
            const estadoPedido = pedidoLocal.estado || 'completado';
            const entregaProgramada = pedidoLocal.entregaProgramadaISO || null;

            const { data: rpcOk, error: rpcError } = await sb.rpc('registrar_pedido_atomico', {
                p_pedido_id: pedidoLocal.id,
                p_cliente_nombre: nombreNormalizado,
                p_medio_pago: pedidoLocal.pago,
                p_total: pedidoLocal.total,
                p_notas: pedidoLocal.notas || '',
                p_created_at: fechaVentaBogota,
                p_items: pedidoLocal.items,
                p_estado: estadoPedido,
                p_entrega_programada_at: entregaProgramada
            });

            if (!rpcError && rpcOk) {
                return { ok: true, permanent: false };
            }
            if (rpcError && ['23503', '22P02', '22023', '23514'].includes(rpcError.code)) {
                return { ok: false, permanent: true, reason: rpcError.message };
            }

            // Respaldo con Upsert directo si el RPC aún no tiene los nuevos parámetros
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
                    created_at: fechaVentaBogota,
                    estado: estadoPedido,
                    entrega_programada_at: entregaProgramada
                }], { onConflict: 'id' });

            if (pedidoError) throw pedidoError;

            const detalles = pedidoLocal.items.map((item) => ({
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
            const esPermanente = error?.code === '23503' || error?.code === '22P02';
            return { ok: false, permanent: esPermanente, reason: error?.message || 'Error de red' };
        }
    },

    // Descarga todos los pedidos y apartados del día en Colombia para sincronizar todos los dispositivos
    async obtenerPedidosJornadaHoy() {
        const sb = await getSupabase();
        if (!sb) return null;

        const inicioHoyBogota = obtenerFechaBogotaISO().slice(0, 10) + 'T00:00:00-05:00';

        const { data, error } = await sb
            .from('pedidos')
            .select(`
                id,
                medio_pago,
                total,
                notas,
                created_at,
                estado,
                entrega_programada_at,
                clientes ( nombre ),
                pedido_detalles ( producto_id, producto_nombre_historico, cantidad, precio_unitario_historico )
            `)
            .in('estado', ['completado', 'apartado'])
            .or(`created_at.gte.${inicioHoyBogota},estado.eq.apartado`)
            .order('created_at', { ascending: false });

        if (error) {
            const retry = await sb
                .from('pedidos')
                .select(`
                    id,
                    medio_pago,
                    total,
                    notas,
                    created_at,
                    estado,
                    entrega_programada_at,
                    clientes ( nombre ),
                    pedido_detalles ( producto_id, cantidad, precio_unitario_historico )
                `)
                .in('estado', ['completado', 'apartado'])
                .or(`created_at.gte.${inicioHoyBogota},estado.eq.apartado`)
                .order('created_at', { ascending: false });
            if (retry.error) return null;
            return retry.data || [];
        }
        return data || [];
    },

    async cerrarJornadaServidor(apiKeyOpcional = '', { soloAnteriores = false } = {}) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión' } };

        const { data, error } = await sb.rpc('cerrar_jornada_y_notificar', {
            p_api_key: apiKeyOpcional || null
        });

        if (error) {
            // Respaldo directo si aún no se ha corrido el RPC
            let q = sb.from('pedidos').update({ estado: 'cerrado' }).eq('estado', 'completado');
            if (soloAnteriores) {
                q = q.lt('created_at', obtenerFechaBogotaISO().slice(0, 10) + 'T00:00:00-05:00');
            }
            const { error: updErr } = await q;
            return { data: null, error: updErr };
        }
        return { data, error: null };
    },

    async deletePedido(pedidoId) {
        const sb = await getSupabase();
        if (!sb) return false;
        const { error } = await sb.from('pedidos').delete().eq('id', pedidoId);
        return !error;
    },

    async obtenerComprasCliente(nombreCliente) {
        const sb = await getSupabase();
        if (!sb) return 0;
        const { data, error } = await sb.rpc('contar_compras_cliente', {
            p_nombre: normalizarNombreCliente(nombreCliente)
        });
        return error ? 0 : Number(data) || 0;
    },

    // El PIN se valida en el servidor; devuelve { habilitado, pin_ok } o null si falla
    async verificarAccesoCliente(pin) {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data, error } = await sb.rpc('acceso_clientes', { p_pin: String(pin || '').trim() });
        return error ? null : data;
    },

    // Corrige el nombre del cliente o cambia el medio de pago en un pedido ya guardado (Punto B + Idea 5)
    async actualizarPedidoExistente(pedidoId, { nuevoNombre, nuevoPago }) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión' } };

        const nombreNorm = normalizarNombreCliente(nuevoNombre);

        const { data: rpcOk, error: rpcErr } = await sb.rpc('actualizar_pedido_existente', {
            p_pedido_id: pedidoId,
            p_nuevo_nombre: nombreNorm,
            p_nuevo_pago: nuevoPago
        });

        if (!rpcErr && rpcOk) {
            return { error: null };
        }

        // Respaldo directo si aún no se ha ejecutado el RPC en Supabase
        try {
            const { data: cli, error: errCli } = await sb
                .from('clientes')
                .upsert([{ nombre: nombreNorm }], { onConflict: 'nombre' })
                .select('id')
                .single();

            if (errCli) throw errCli;

            const { error: errPed } = await sb
                .from('pedidos')
                .update({ cliente_id: cli.id, medio_pago: nuevoPago })
                .eq('id', pedidoId);

            return { error: errPed };
        } catch (err) {
            return { error: err };
        }
    },

    // true/false si se pudo comprobar la sesión de Supabase; null si no hay forma de comprobarla (offline)
    async haySesionAdminValida() {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data } = await sb.auth.getSession();
        return Boolean(data?.session);
    },

    // Estado actual de los pedidos del propio cliente (solo por id; los UUID no se pueden adivinar)
    async obtenerEstadoPedidosCliente(ids) {
        const sb = await getSupabase();
        if (!sb || !Array.isArray(ids) || ids.length === 0) return null;
        const { data, error } = await sb.rpc('estado_pedidos_cliente', { p_ids: ids.slice(0, 100) });
        return error ? null : (data || []);
    },

    async obtenerConfiguracionSistema() {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data, error } = await sb
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', ['cliente_pin', 'clientes_habilitados']);

        if (error || !data) return null;
        const mapa = {};
        data.forEach((row) => { mapa[row.clave] = row.valor; });
        return mapa;
    },

    async guardarConfiguracionSistema({ clientePin, clientesHabilitados }) {
        const sb = await getSupabase();
        if (!sb) return { error: { message: 'Sin conexión' } };

        const filas = [];
        if (clientePin !== undefined) {
            filas.push({ clave: 'cliente_pin', valor: String(clientePin).trim(), updated_at: new Date().toISOString() });
        }
        if (clientesHabilitados !== undefined) {
            filas.push({ clave: 'clientes_habilitados', valor: clientesHabilitados ? 'true' : 'false', updated_at: new Date().toISOString() });
        }

        const { error } = await sb
            .from('configuracion_sistema')
            .upsert(filas, { onConflict: 'clave' });

        return { error };
    },

    async suscribirCambiosRealtime(onChangeCallback) {
        const sb = await getSupabase();
        if (!sb) return null;
        return sb
            .channel('frizzy-multidevice-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => onChangeCallback('pedidos'))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => onChangeCallback('productos'))
            .subscribe();
    }
};