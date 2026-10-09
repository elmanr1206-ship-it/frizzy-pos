import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://satsdiydoeilmdruyiru.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhdHNkaXlkb2VpbG1kcnV5aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODM2NDMsImV4cCI6MjEwNjM1OTY0M30.YMDXmmBrwzeXYKiO2CAA_QR1xrDnGqzgXNhtMrfAvJE'; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function cargarReportes() {
    try {
        const { data: pedidos, error } = await supabase
            .from('pedidos')
            .select(`
                created_at, 
                total, 
                pedido_detalles (producto_id, cantidad, precio_unitario_historico)
            `);

        if (error) throw error;

        let ingresosTotales = 0;
        let conteoHoras = {};
        let conteoProductos = {};

        pedidos.forEach(pedido => {
            ingresosTotales += pedido.total;
            
            const hora = new Date(pedido.created_at).getHours();
            const etiquetaHora = `${hora}:00`;
            conteoHoras[etiquetaHora] = (conteoHoras[etiquetaHora] || 0) + 1;

            pedido.pedido_detalles.forEach(detalle => {
                const idProd = detalle.producto_id.toUpperCase();
                conteoProductos[idProd] = (conteoProductos[idProd] || 0) + detalle.cantidad;
            });
        });

        const ticketPromedio = pedidos.length > 0 ? ingresosTotales / pedidos.length : 0;
        document.getElementById('kpiIngresos').textContent = `$${ingresosTotales.toLocaleString('es-CO')}`;
        document.getElementById('kpiPedidos').textContent = pedidos.length;
        document.getElementById('kpiTicket').textContent = `$${ticketPromedio.toLocaleString('es-CO', {maximumFractionDigits: 0})}`;

        const topProductos = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1]);
        
        new Chart(document.getElementById('chartProductos'), {
            type: 'bar',
            data: {
                labels: topProductos.map(item => item[0]),
                datasets: [{
                    label: 'Unidades Vendidas',
                    data: topProductos.map(item => item[1]),
                    backgroundColor: '#5F2C82',
                    borderRadius: 6
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });

        const horasOrdenadas = Object.keys(conteoHoras).sort((a, b) => parseInt(a) - parseInt(b));
        
        new Chart(document.getElementById('chartHoras'), {
            type: 'line',
            data: {
                labels: horasOrdenadas,
                datasets: [{
                    label: 'Cantidad de Pedidos',
                    data: horasOrdenadas.map(h => conteoHoras[h]),
                    borderColor: '#F2C94C',
                    backgroundColor: 'rgba(242, 201, 76, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });

    } catch (error) {
        console.error("Error al cargar el dashboard:", error);
        alert("Hubo un problema al cargar los reportes. Revisa la consola.");
    }
}

document.addEventListener('DOMContentLoaded', cargarReportes);