import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://satsdiydoeilmdruyiru.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhdHNkaXlkb2VpbG1kcnV5aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODM2NDMsImV4cCI6MjEwNjM1OTY0M30.YMDXmmBrwzeXYKiO2CAA_QR1xrDnGqzgXNhtMrfAvJE'; 
const supabase = createClient(supabaseUrl, supabaseKey);

export const api = {
    async pushPedido(pedidoLocal) {
        try {
            if (!pedidoLocal.items || !Array.isArray(pedidoLocal.items)) {
                console.warn('Formato de pedido obsoleto o corrupto ignorado:', pedidoLocal);
                return true; 
            }

            const { data: clienteData, error: clienteError } = await supabase
                .from('clientes')
                .upsert([{ nombre: pedidoLocal.cliente }], { onConflict: 'nombre' })
                .select('id')
                .single();

            if (clienteError) throw clienteError;
            
            const clienteId = clienteData.id;

            const { error: pedidoError } = await supabase
               .from('pedidos')
               .insert([{
                   id: pedidoLocal.id, 
                   cliente_id: clienteId,
                   medio_pago: pedidoLocal.pago,
                   total: pedidoLocal.total,
                   notas: pedidoLocal.notas
               }]);

            if (pedidoError && pedidoError.code !== '23505') {
                throw pedidoError;
            }

            const detalles = pedidoLocal.items.map(item => ({
                pedido_id: pedidoLocal.id,
                producto_id: item.id,
                cantidad: item.cantidad,
                precio_unitario_historico: item.precio || 0
            }));

            const { error: detallesError } = await supabase
                .from('pedido_detalles')
                .insert(detalles);

            if (detallesError && detallesError.code !== '23505') {
                throw detallesError;
            }

            return true; 

        } catch (error) {
            console.error("Fallo al sincronizar con Supabase:", error);
            return false; 
        }
    },

    async actualizarPrecioProducto(productoId, nuevoPrecio) {
        const { error } = await supabase
            .from('productos')
            .update({ precio_actual: nuevoPrecio })
            .eq('id', productoId);
        return { error };
    }, // <-- Aquí faltaba esta coma

    async obtenerComprasCliente(nombreCliente) {
        try {
            const { data: cliente, error: errCli } = await supabase
                .from('clientes')
                .select('id')
                .eq('nombre', nombreCliente)
                .single();
                
            if (errCli || !cliente) return 0;

            const { count, error: errPed } = await supabase
                .from('pedidos')
                .select('*', { count: 'exact', head: true })
                .eq('cliente_id', cliente.id);
                
            return count || 0;
        } catch (error) {
            console.error("Error consultando fidelización:", error);
            return 0;
        }
    }
};