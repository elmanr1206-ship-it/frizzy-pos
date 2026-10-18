export const SUPABASE_URL = 'https://satsdiydoeilmdruyiru.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhdHNkaXlkb2VpbG1kcnV5aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODM2NDMsImV4cCI6MjEwNjM1OTY0M30.YMDXmmBrwzeXYKiO2CAA_QR1xrDnGqzgXNhtMrfAvJE';

let supabaseInstance = null;
let supabaseInitPromise = null;

// Carga un script local (/vendor) solo cuando se necesita y devuelve su global
const libreriasCargadas = {};
export function cargarLibreria(src, global) {
    if (global && window[global]) return Promise.resolve(window[global]);
    if (!libreriasCargadas[src]) {
        libreriasCargadas[src] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve(global ? window[global] : true);
            s.onerror = () => {
                delete libreriasCargadas[src];
                s.remove();
                reject(new Error('No se pudo cargar ' + src));
            };
            document.head.appendChild(s);
        });
    }
    return libreriasCargadas[src];
}

export async function getSupabase() {
    if (supabaseInstance) return supabaseInstance;
    if (supabaseInitPromise) return supabaseInitPromise;

    supabaseInitPromise = (async () => {
        try {
            const { createClient } = await cargarLibreria('/vendor/supabase.js', 'supabase');
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

// Nombre y apellido: al menos 2 palabras de 2+ letras, sin números (misma regla que el servidor)
export function nombreCompletoValido(nombre) {
    return /^[^\p{N}\s]{2,}(\s+[^\p{N}\s]{2,})+$/u.test(String(nombre || '').trim());
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

    async obtenerProductos({ incluirInactivos = false } = {}) {
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
        return incluirInactivos ? (data || []) : (data || []).filter((p) => p.activo !== false);
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

        // Borrado lógico: la fila se conserva para que las ventas viejas mantengan nombre y categoría
        const { error } = await sb
            .from('productos')
            .update({ activo: false, disponible: false })
            .eq('id', productoId);

        return { error };
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
                p_entrega_programada_at: entregaProgramada,
                p_pin: pedidoLocal.pin || null
            });

            if (!rpcError && rpcOk) {
                return { ok: true, permanent: false };
            }
            if (!rpcError && rpcOk === false) {
                return { ok: false, permanent: true, pin: true, reason: 'PIN del local incorrecto o bloqueado' };
            }
            const esPermanente = Boolean(rpcError && ['23503', '22P02', '22023', '23514'].includes(rpcError.code));
            return { ok: false, permanent: esPermanente, reason: rpcError?.message || 'Error de red' };
        } catch (error) {
            console.error('Fallo al sincronizar con Supabase:', error);
            return { ok: false, permanent: false, reason: error?.message || 'Error de red' };
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
            p_api_key: apiKeyOpcional || null,
            p_solo_anteriores: soloAnteriores
        });

        if (error) return { data: null, error };
        return { data, error: null };
    },

    async deletePedido(pedidoId) {
        const sb = await getSupabase();
        if (!sb) return false;
        const { error } = await sb.from('pedidos').delete().eq('id', pedidoId);
        return !error;
    },

    async obtenerComprasCliente(nombreCliente, pin = null) {
        const sb = await getSupabase();
        if (!sb) return 0;
        const { data, error } = await sb.rpc('contar_compras_cliente', {
            p_nombre: normalizarNombreCliente(nombreCliente),
            p_pin: pin || null
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

        if (!rpcErr && rpcOk) return { error: null };
        return { error: rpcErr || { message: 'No se pudo actualizar el pedido' } };
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