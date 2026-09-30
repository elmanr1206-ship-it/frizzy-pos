import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Aquí pegas la clave "anon public" de tu imagen y la URL del proyecto
const supabase = createClient('https://satsdiydoeilmdruyiru.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhdHNkaXlkb2VpbG1kcnV5aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODM2NDMsImV4cCI6MjEwNjM1OTY0M30.YMDXmmBrwzeXYKiO2CAA_QR1xrDnGqzgXNhtMrfAvJE');

export const api = {
    async pushPedido(pedidoLocal) {
        try {
            // 1. Insertar Cliente (Asegura Habeas Data)
            const { data: cli, error: errCli } = await supabase.from('clientes')
                .insert({ nombre: pedidoLocal.cliente, acepta_habeas_data: true }).select().single();
            if (errCli) throw errCli;

            // 2. Insertar Pedido
            const { data: ped, error: errPed } = await supabase.from('pedidos')
                .insert({ cliente_id: cli.id, medio_pago: pedidoLocal.pago, total: pedidoLocal.total }).select().single();
            if (errPed) throw errPed;

            // 3. Insertar Detalles con precio_unitario_historico
            const detalles = pedidoLocal.items.map(i => ({
                pedido_id: ped.id,
                producto_id: i.id,
                cantidad: i.cantidad,
                precio_unitario_historico: i.precio
            }));
            await supabase.from('pedido_detalles').insert(detalles);
            return true;
        } catch (e) {
            console.error('Error sincronizando con Supabase:', e);
            return false;
        }
    }
};