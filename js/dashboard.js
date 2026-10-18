import { getSupabase, api, formatearFechaBogota } from './api.js';

let pedidosCache = [];
let catalogoProductos = {};
// INICIA EN "HOY" POR DEFECTO
let rangoActivo = 'hoy';
let incluirBowlsEnTop = true;

let chartHorasInstance = null;
let chartProductosInstance = null;
let chartPagosInstance = null;

const CATALOGO_BASE = {
    papas: { nombre: 'Papas', categoria: 'bowl' },
    yuca: { nombre: 'Yuca', categoria: 'bowl' },
    salchicha: { nombre: 'Salchicha', categoria: 'acompanante' },
    chorizo: { nombre: 'Chorizo', categoria: 'acompanante' },
    pollo: { nombre: 'Pollo (Nuggets)', categoria: 'acompanante' },
    carne: { nombre: 'Carne', categoria: 'acompanante' },
    papachongo: { nombre: 'Papa Chongo', categoria: 'topping' },
    lechuga: { nombre: 'Lechuga', categoria: 'topping' },
    picodegallo: { nombre: 'Pico de Gallo', categoria: 'topping' },
    queso: { nombre: 'Queso', categoria: 'topping' },
    tocineta: { nombre: 'Salsa de Tocineta', categoria: 'topping' },
    vasito: { nombre: 'Vasito', categoria: 'bebida' }
};

function fmtMoneda(valor) {
    const numero = Math.round(Number(valor || 0));
    return '$' + numero.toLocaleString('es-CO');
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function obtenerHoraBogotaNum(isoStr) {
    if (!isoStr) return new Date().getHours();
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return new Date().getHours();
    const strHora = d.toLocaleTimeString('en-US', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        hour12: false
    });
    const parsed = parseInt(strHora, 10);
    return Number.isNaN(parsed) ? d.getHours() : (parsed === 24 ? 0 : parsed);
}

async function obtenerTodosLosPedidos(sb) {
    const LOTE = 1000;
    let desde = 0;
    let acumulado = [];

    while (true) {
        const respuesta = await sb
            .from('pedidos')
            .select('id, cliente_id, created_at, estado, medio_pago, total, notas, pedido_detalles (producto_id, producto_nombre_historico, cantidad, precio_unitario_historico)')
            .order('created_at', { ascending: false })
            .range(desde, desde + LOTE - 1);

        if (respuesta.error) {
            const respaldo = await sb
                .from('pedidos')
                .select('id, cliente_id, created_at, medio_pago, total, notas, pedido_detalles (producto_id, cantidad, precio_unitario_historico)')
                .order('created_at', { ascending: false })
                .range(desde, desde + LOTE - 1);

            if (respaldo.error) {
                throw respaldo.error;
            }
            return respaldo.data || [];
        }

        const filas = respuesta.data || [];
        if (filas.length === 0) break;

        acumulado = acumulado.concat(filas);
        if (filas.length < LOTE) break;
        desde += LOTE;
    }

    return acumulado.filter((p) => p.estado !== 'apartado');
}

function filtrarPedidosPorRango(lista, rango) {
    if (rango === 'todo') return lista;

    const ahora = new Date();
    const hoyBogotaStr = formatearFechaBogota(ahora);

    return lista.filter((p) => {
        if (!p.created_at) return rango === 'hoy';
        if (rango === 'hoy') {
            return formatearFechaBogota(p.created_at) === hoyBogotaStr;
        }
        const timestamp = new Date(p.created_at).getTime();
        if (Number.isNaN(timestamp)) return false;

        if (rango === '7d') return timestamp >= ahora.getTime() - 7 * 86400000;
        if (rango === '30d') return timestamp >= ahora.getTime() - 30 * 86400000;
        return true;
    });
}

function renderizarDashboard() {
    const ChartLib = window.Chart;
    const pedidos = filtrarPedidosPorRango(pedidosCache, rangoActivo);

    const etiquetasPeriodo = {
        hoy: `Reporte de Hoy (${formatearFechaBogota(new Date())})`,
        '7d': 'Últimos 7 Días',
        '30d': 'Últimos 30 Días',
        todo: 'Acumulado Histórico'
    };
    const tagEl = document.getElementById('dashPeriodTag');
    if (tagEl) tagEl.textContent = etiquetasPeriodo[rangoActivo] || 'Reporte Ejecutivo';

    let ingresosTotales = 0;
    let totalUnidades = 0;
    const conteoHoras = {};
    const metricasProductos = {};
    const ingresosPorPago = { Efectivo: 0, Nequi: 0, Llave: 0 };
    const clientesUnicosSet = new Set();

    let minHora = 10;
    let maxHora = 22;

    pedidos.forEach((pedido) => {
        if (pedido.created_at) {
            const h = obtenerHoraBogotaNum(pedido.created_at);
            if (h < minHora) minHora = h;
            if (h > maxHora) maxHora = h;
        }
    });

    for (let h = minHora; h <= maxHora; h++) {
        conteoHoras[h] = 0;
    }

    pedidos.forEach((pedido, index) => {
        const montoPedido = Number(pedido.total || 0);
        ingresosTotales += montoPedido;

        if (pedido.cliente_id) {
            clientesUnicosSet.add(pedido.cliente_id);
        } else {
            clientesUnicosSet.add('anon_' + (pedido.id || index));
        }

        const medio = pedido.medio_pago || 'Efectivo';
        ingresosPorPago[medio] = (ingresosPorPago[medio] || 0) + montoPedido;

        const hora = obtenerHoraBogotaNum(pedido.created_at);
        conteoHoras[hora] = (conteoHoras[hora] || 0) + 1;

        const detalles = pedido.pedido_detalles || [];
        detalles.forEach((det) => {
            const rawId = String(det.producto_id || '').toLowerCase().trim();
            const infoProd = catalogoProductos[rawId] || CATALOGO_BASE[rawId] || {
                nombre: det.producto_nombre_historico || det.producto_id || 'Otro',
                categoria: 'extra'
            };

            const cant = Number(det.cantidad || 0);
            const precioHist = Number(det.precio_unitario_historico || 0);
            const subtotalHist = cant * precioHist;

            totalUnidades += cant;

            if (!metricasProductos[rawId]) {
                metricasProductos[rawId] = {
                    id: rawId,
                    nombre: det.producto_nombre_historico || infoProd.nombre,
                    categoria: infoProd.categoria,
                    unidades: 0,
                    ingresos: 0
                };
            }
            metricasProductos[rawId].unidades += cant;
            metricasProductos[rawId].ingresos += subtotalHist;
        });
    });

    const ticketPromedio = pedidos.length > 0 ? ingresosTotales / pedidos.length : 0;

    const elIngresos = document.getElementById('kpiIngresos');
    const elClientes = document.getElementById('kpiClientes');
    const elPedidos = document.getElementById('kpiPedidos');
    const elTicket = document.getElementById('kpiTicket');
    const elUnidades = document.getElementById('kpiUnidades');

    if (elIngresos) elIngresos.textContent = fmtMoneda(ingresosTotales);
    if (elClientes) elClientes.textContent = String(clientesUnicosSet.size);
    if (elPedidos) elPedidos.textContent = String(pedidos.length);
    if (elTicket) elTicket.textContent = fmtMoneda(ticketPromedio);
    if (elUnidades) elUnidades.textContent = String(totalUnidades);

    if (!ChartLib) return;

    // 1. Gráfica de Horas Pico
    const canvasHoras = document.getElementById('chartHoras');
    if (canvasHoras) {
        if (chartHorasInstance) chartHorasInstance.destroy();

        const horasOrdenadas = Object.keys(conteoHoras)
            .map((h) => Number(h))
            .sort((a, b) => a - b);

        chartHorasInstance = new ChartLib(canvasHoras, {
            type: 'line',
            data: {
                labels: horasOrdenadas.map((h) => String(h).padStart(2, '0') + ':00'),
                datasets: [{
                    label: 'Pedidos por Hora',
                    data: horasOrdenadas.map((h) => conteoHoras[h]),
                    borderColor: '#2A0E4F',
                    backgroundColor: 'rgba(245, 166, 35, 0.30)',
                    pointBackgroundColor: '#F5A623',
                    pointBorderColor: '#2A0E4F',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: 5,
                        ticks: { stepSize: 1, precision: 0 }
                    }
                }
            }
        });
    }

    // 2. Gráfica de Productos Más Vendidos
    const canvasProductos = document.getElementById('chartProductos');
    if (canvasProductos) {
        if (chartProductosInstance) chartProductosInstance.destroy();

        const listaProd = Object.values(metricasProductos)
            .filter((p) => incluirBowlsEnTop || p.categoria !== 'bowl')
            .sort((a, b) => b.unidades - a.unidades)
            .slice(0, 8);

        chartProductosInstance = new ChartLib(canvasProductos, {
            type: 'bar',
            data: {
                labels: listaProd.length > 0 ? listaProd.map((item) => item.nombre) : ['Sin ventas hoy'],
                datasets: [{
                    label: 'Unidades Vendidas',
                    data: listaProd.length > 0 ? listaProd.map((item) => item.unidades) : [0],
                    backgroundColor: ['#2A0E4F', '#4E2286', '#F5A623', '#653BA0', '#E8930C', '#3B1766'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, precision: 0 }
                    }
                }
            }
        });
    }

    // 3. Gráfica de Medios de Pago
    const canvasPagos = document.getElementById('chartPagos');
    if (canvasPagos) {
        if (chartPagosInstance) chartPagosInstance.destroy();

        const etiquetasPago = Object.keys(ingresosPorPago);
        const valoresPago = etiquetasPago.map((k) => ingresosPorPago[k]);

        chartPagosInstance = new ChartLib(canvasPagos, {
            type: 'doughnut',
            data: {
                labels: etiquetasPago,
                datasets: [{
                    data: valoresPago,
                    backgroundColor: ['#2A0E4F', '#F5A623', '#653BA0'],
                    borderColor: '#FFFAEF',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // 4. Tabla de Rentabilidad Histórica
    const tbody = document.getElementById('tablaRentabilidadBody');
    if (tbody) {
        const rankingRentabilidad = Object.values(metricasProductos).sort((a, b) => b.ingresos - a.ingresos);
        const sumaIngresosDetalle = rankingRentabilidad.reduce((acc, item) => acc + item.ingresos, 0);

        if (rankingRentabilidad.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px; color:#6D5E78;">Sin ventas registradas en este periodo.</td></tr>';
        } else {
            tbody.innerHTML = rankingRentabilidad.map((item, idx) => {
                const pct = sumaIngresosDetalle > 0 ? Math.round((item.ingresos / sumaIngresosDetalle) * 100) : 0;
                const promUnitario = item.unidades > 0 ? item.ingresos / item.unidades : 0;
                return (
                    '<tr style="border-bottom:1px solid #E9DEC0;">' +
                        '<td style="padding:10px 12px; font-weight:800; color:#2A0E4F;">#' + (idx + 1) + ' ' + esc(item.nombre) + '</td>' +
                        '<td style="padding:10px 12px; text-transform:capitalize; color:#4E2286; font-weight:700;">' + esc(item.categoria) + '</td>' +
                        '<td style="padding:10px 12px; text-align:center; font-weight:800;">' + item.unidades + ' uds.</td>' +
                        '<td style="padding:10px 12px; text-align:right; color:#3B1766; font-weight:700;">' + fmtMoneda(promUnitario) + '</td>' +
                        '<td style="padding:10px 12px; text-align:right; font-weight:900; color:#1B0836;">' +
                            fmtMoneda(item.ingresos) +
                            ' <span style="font-size:0.75rem; background:#F5A623; color:#1B0836; padding:2px 7px; border-radius:99px; margin-left:6px;">' + pct + '%</span>' +
                        '</td>' +
                    '</tr>'
                );
            }).join('');
        }
    }
}

async function cargarDatosYRenderizar(sb) {
    mostrarReportesFallidos(sb);
    try {
        const resultados = await Promise.all([
            api.obtenerProductos(),
            obtenerTodosLosPedidos(sb)
        ]);

        const productosRemotos = resultados[0] || [];
        const pedidos = resultados[1] || [];

        catalogoProductos = Object.assign({}, CATALOGO_BASE);
        productosRemotos.forEach((p) => {
            const key = String(p.id || '').toLowerCase().trim();
            if (key) {
                catalogoProductos[key] = {
                    nombre: p.nombre || key,
                    categoria: p.categoria || 'extra'
                };
            }
        });

        pedidosCache = pedidos;
        renderizarDashboard();
    } catch (error) {
        console.error('Error cargando datos del dashboard:', error);
    }
}

function configurarControlesUI(sb) {
    const botonesRango = document.querySelectorAll('.filter-btn[data-range]');
    botonesRango.forEach((btn) => {
        btn.addEventListener('click', () => {
            botonesRango.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            rangoActivo = btn.getAttribute('data-range') || 'hoy';
            renderizarDashboard();
        });
    });

    const btnToggleBowls = document.getElementById('btnToggleBowls');
    if (btnToggleBowls) {
        btnToggleBowls.addEventListener('click', () => {
            incluirBowlsEnTop = !incluirBowlsEnTop;
            btnToggleBowls.textContent = incluirBowlsEnTop ? 'Mostrando: Todo el Menú' : 'Mostrando: Solo Adiciones';
            renderizarDashboard();
        });
    }

    const btnRefresh = document.getElementById('btnRefreshDash');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            btnRefresh.disabled = true;
            btnRefresh.textContent = '⏳ Actualizando...';
            await cargarDatosYRenderizar(sb);
            btnRefresh.disabled = false;
            btnRefresh.textContent = '🔄 Actualizar';
        });
    }

    const btnLogout = document.getElementById('btnLogoutDash');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (typeof api.logoutAdmin === 'function') {
                await api.logoutAdmin();
            }
            window.location.href = 'index.html';
        });
    }
}

async function mostrarReportesFallidos(sb) {
    try {
        const { data } = await sb.from('reportes_fallidos').select('id, creado, texto').order('creado', { ascending: false }).limit(10);
        document.getElementById('bannerReportesFallidos')?.remove();
        if (!data || !data.length) return;

        const caja = document.createElement('div');
        caja.id = 'bannerReportesFallidos';
        caja.style.cssText = 'margin:12px; padding:14px 16px; border-radius:14px; background:#FFF4E5; border:1.5px solid #F5A623; color:#5A3A00; font-weight:700;';
        const titulo = document.createElement('div');
        titulo.style.cssText = 'font-weight:900; margin-bottom:8px;';
        titulo.textContent = '⚠️ Hay reportes de Telegram que no se pudieron enviar:';
        caja.appendChild(titulo);

        const vistos = new Set();
        data.forEach((r) => {
            const texto = String(r.texto || '').replace(/<[^>]+>/g, '');
            if (vistos.has(texto)) return;
            vistos.add(texto);
            const pre = document.createElement('pre');
            pre.style.cssText = 'white-space:pre-wrap; margin:6px 0; font:inherit; font-size:0.85rem; font-weight:600;';
            pre.textContent = texto;
            caja.appendChild(pre);
        });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Ya los vi';
        btn.style.cssText = 'margin-top:6px; padding:8px 14px; border:none; border-radius:10px; background:#2B113F; color:#F4B41A; font-weight:900; cursor:pointer;';
        btn.addEventListener('click', async () => {
            await sb.from('reportes_fallidos').delete().in('id', data.map((r) => r.id));
            caja.remove();
        });
        caja.appendChild(btn);

        const cabecera = document.querySelector('.header');
        if (cabecera) cabecera.insertAdjacentElement('afterend', caja);
        else document.body.insertAdjacentElement('afterbegin', caja);
    } catch (err) {
        console.warn('No se pudieron consultar los reportes fallidos:', err);
    }
}

async function iniciarDashboard() {
    const sb = await getSupabase();
    if (!sb) {
        alert('No hay conexión con Supabase en este momento.');
        return;
    }

    configurarControlesUI(sb);

    const session = await api.getSession();
    const modal = document.getElementById('dashAuthModal');

    if (!session) {
        if (modal) modal.style.display = 'flex';
        const btnLogin = document.getElementById('btnDashLogin');
        if (btnLogin) {
            btnLogin.addEventListener('click', async () => {
                const inputEmail = document.getElementById('dashEmail');
                const inputPass = document.getElementById('dashPass');
                const errBox = document.getElementById('dashAuthError');

                const email = inputEmail ? inputEmail.value.trim() : '';
                const pass = inputPass ? inputPass.value : '';

                if (!email || !pass) {
                    if (errBox) {
                        errBox.textContent = 'Ingresa tu correo y contraseña de Administrador.';
                        errBox.style.display = 'block';
                    }
                    return;
                }

                btnLogin.disabled = true;
                btnLogin.textContent = 'Verificando...';

                const res = await api.loginAdmin(email, pass);
                if (res.error) {
                    btnLogin.disabled = false;
                    btnLogin.textContent = 'Entrar al Dashboard';
                    if (errBox) {
                        errBox.textContent = 'Credenciales inválidas.';
                        errBox.style.display = 'block';
                    }
                    return;
                }

                if (modal) modal.style.display = 'none';
                await cargarDatosYRenderizar(sb);
            });
        }
        return;
    }

    if (modal) modal.style.display = 'none';
    await cargarDatosYRenderizar(sb);
}

document.addEventListener('DOMContentLoaded', iniciarDashboard);