import { getSupabase, api } from './api.js';

async function obtenerTodosLosPedidos(sb) {
    const LOTE = 1000;
    let desde = 0;
    let acumulado = [];

    while (true) {
        const { data, error } = await sb
            .from('pedidos')
            .select(`
                created_at,
                total,
                pedido_detalles (producto_id, cantidad, precio_unitario_historico)
            `)
            .order('created_at', { ascending: false })
            .range(desde, desde + LOTE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        acumulado = acumulado.concat(data);
        if (data.length < LOTE) break;
        desde += LOTE;
    }
    return acumulado;
}

async function cargarReportes() {
    try {
        const sb = await getSupabase();
        if (!sb) throw new Error('Sin conexión a Supabase');

        // Protección por login (#6)
        let session = await api.getSession();
        if (!session) {
            const email = prompt('Ingresa correo de Administrador para ver el Dashboard:');
            const password = email ? prompt('Contraseña:') : null;
            if (!email || !password) {
                window.location.href = 'index.html';
                return;
            }
            const { error: authErr } = await api.loginAdmin(email.trim(), password);
            if (authErr) {
                alert('Credenciales inválidas');
                window.location.href = 'index.html';
                return;
            }
        }

        const [productosLista, pedidos] = await Promise.all([
            api.obtenerProductos(),
            obtenerTodosLosPedidos(sb)
        ]);

        const mapaNombres = {};
        (productosLista || []).forEach(p => { mapaNombres[p.id] = p.nombre; });

        let ingresosTotales = 0;
        const conteoHoras = {};
        const conteoProductos = {};

        pedidos.forEach(pedido => {
            ingresosTotales += Number(pedido.total || 0);

            const hora = new Date(pedido.created_at).getHours();
            const etiquetaHora = `${String(hora).padStart(2, '0')}:00`;
            conteoHoras[etiquetaHora] = (conteoHoras[etiquetaHora] || 0) + 1;

            (pedido.pedido_detalles || []).forEach(detalle => {
                const nombreProd = mapaNombres[detalle.producto_id] || detalle.producto_id;
                conteoProductos[nombreProd] = (conteoProductos[nombreProd] || 0) + Number(detalle.cantidad || 0);
            });
        });

        const ticketPromedio = pedidos.length > 0 ? ingresosTotales / pedidos.length : 0;
        document.getElementById('kpiIngresos').textContent = `$${ingresosTotales.toLocaleString('es-CO')}`;
        document.getElementById('kpiPedidos').textContent = pedidos.length;
        document.getElementById('kpiTicket').textContent = `$${ticketPromedio.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

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
        console.error('Error al cargar el dashboard:', error);
        alert('No se pudieron cargar los reportes. Verifica tu conexión.');
    }
}

document.addEventListener('DOMContentLoaded', cargarReportes);