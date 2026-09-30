import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Asegúrate de mantener tu URL y ANON_KEY reales aquí
const supabaseUrl = 'https://satsdiydoeilmdruyiru.supabase.co';
const supabaseKey = 'TU_ANON_KEY'; 
const supabase = createClient(supabaseUrl, supabaseKey);

export const api = {
    async pushPedido(pedidoLocal) {
        try {
            // 1. Filtro de seguridad: descartar pedidos corruptos o de versiones anteriores[cite: 6]
            if (!pedidoLocal.items || !Array.isArray(pedidoLocal.items)) {
                console.warn('Formato de pedido obsoleto o corrupto ignorado:', pedidoLocal);
                return true; // Retornamos true para que dbSync lo saque de la cola
            }

            // 2. Insertar el pedido principal
            const { error: pedidoError } = await supabase
                .from('pedidos')
                .insert([{
                    id: pedidoLocal.id, 
                    cliente: pedidoLocal.cliente,
                    medio_pago: pedidoLocal.pago,
                    total: pedidoLocal.total
                }]);

            // Si el error es 409 (23505 - Unique violation), significa que ya se había subido. Lo ignoramos.
            if (pedidoError && pedidoError.code !== '23505') {
                throw pedidoError;
            }

            // 3. Mapear y asegurar los campos obligatorios para el detalle (incluyendo precio_unitario_historico)[cite: 6]
            const detalles = pedidoLocal.items.map(item => ({
                pedido_id: pedidoLocal.id,
                producto_id: item.id,
                cantidad: item.cantidad,
                precio_unitario_historico: item.precio || 0
            }));

            // 4. Insertar los detalles
            const { error: detallesError } = await supabase
                .from('pedido_detalles')
                .insert(detalles);

            if (detallesError && detallesError.code !== '23505') {
                throw detallesError;
            }

            return true; // Inserción limpia

        } catch (error) {
            console.error("Fallo al sincronizar con Supabase:", error);
            // Retornamos false para que el pedido se quede seguro en IndexedDB y reintente más tarde[cite: 6]
            return false; 
        }
    }
};