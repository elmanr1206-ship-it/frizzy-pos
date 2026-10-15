import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import {
    api,
    normalizarNombreCliente,
    obtenerFechaBogotaISO,
    formatearHoraBogota,
    formatearFechaBogota
} from './api.js';

const MENU_INICIAL = [
    { id: 'papas', nombre: 'Papas', precio: 10000, categoria: 'bowl', disponible: true },
    { id: 'yuca', nombre: 'Yuca', precio: 8000, categoria: 'bowl', disponible: true },
    { id: 'salchicha', nombre: 'Salchicha', precio: 3000, categoria: 'acompanante', disponible: true },
    { id: 'chorizo', nombre: 'Chorizo', precio: 5000, categoria: 'acompanante', disponible: true },
    { id: 'pollo', nombre: 'Pollo (Nuggets)', precio: 4000, categoria: 'acompanante', disponible: true },
    { id: 'carne', nombre: 'Carne', precio: 5000, categoria: 'acompanante', disponible: true },
    { id: 'papachongo', nombre: 'Papa Chongo', precio: 1000, categoria: 'topping', disponible: true },
    { id: 'lechuga', nombre: 'Lechuga', precio: 500, categoria: 'topping', disponible: true },
    { id: 'picodegallo', nombre: 'Pico de Gallo', precio: 1000, categoria: 'topping', disponible: true },
    { id: 'queso', nombre: 'Queso', precio: 2000, categoria: 'topping', disponible: true },
    { id: 'tocineta', nombre: 'Salsa de Tocineta', precio: 2000, categoria: 'topping', disponible: true },
    { id: 'vasito', nombre: 'Vasito', precio: 1500, categoria: 'bebida', disponible: true }
];

const PAGOS = [
    { id: 'efectivo', nombre: 'Efectivo' },
    { id: 'llave', nombre: 'Llave' },
    { id: 'nequi', nombre: 'Nequi' }
];

const COMBOS_RAPIDOS = [
    { id: 'combo_papas_full', icono: '🔥', nombre: 'Papas Full', bowl: 'papas', acomp: { salchicha: 1 }, toppings: { queso: 1, papachongo: 1 }, bebidas: {} },
    { id: 'combo_yuca_esp', icono: '⚡', nombre: 'Yuca + Chorizo', bowl: 'yuca', acomp: { chorizo: 1 }, toppings: { queso: 1 }, bebidas: {} },
    { id: 'combo_papas_vaso', icono: '🥤', nombre: 'Papas + Salchicha + Vaso', bowl: 'papas', acomp: { salchicha: 1 }, toppings: {}, bebidas: { vasito: 1 } },
    { id: 'combo_repetir_ultimo', icono: '🔄', nombre: 'Repetir Último Bowl', esRepetir: true }
];

const NOTAS_RAPIDAS = ['Sin cebolla', 'Para llevar', 'Salsas aparte', 'Sin salsas', 'Bien dorado', 'Extra servilletas'];

const WHATSAPP_ADMIN_PHONE = '573503129384';
const CLIENT_ACCESS_PIN = '1234';

function leerStorageSeguro(clave, defecto = []) {
    try {
        const raw = localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : defecto;
    } catch (e) {
        return defecto;
    }
}

function normalizarCategoria(cat) {
    const limpia = String(cat || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    if (limpia.startsWith('acomp')) return 'acompanante';
    if (limpia.startsWith('bowl')) return 'bowl';
    if (limpia.startsWith('bebida')) return 'bebida';
    return 'topping';
}

function obtenerFechaHoyStr() {
    return formatearFechaBogota(new Date());
}

function generarUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ---------------- VARIABLES DE ESTADO GLOBALES ----------------
let catalogoMenu = leerStorageSeguro('fz_catalogo_menu', MENU_INICIAL);
let estado = {
    bowl: null,
    acomp: {},
    toppings: {},
    bebidas: {},
    pago: null,
    total: 0,
    premioFidelidad: false,
    clienteBloqueado: false,
    apartadoMinutos: 0,
    apartadoHoraExacta: ''
};

let usuarioActual = leerStorageSeguro('fz_usuario_actual', null);
let pedidos = leerStorageSeguro('fz_pedidos', []);
let apartados = leerStorageSeguro('fz_apartados', []);
let clientesConocidos = leerStorageSeguro('fz_clientes_cache', []);
let fechaJornadaActiva = localStorage.getItem('fz_fecha_jornada') || obtenerFechaHoyStr();
let filtroPago = null;
let textoBusquedaPedidos = '';
let configClientes = leerStorageSeguro('fz_config_clientes', {
    pin: '1234',
    habilitado: true
});
let sincronizando = false;
let guardandoEnCurso = false;
let alarmasSilenciadas = new Set();
let audioCtx = null;

// Variables del Mazo de Notificaciones estilo Apple iOS
let idsPedidosConocidos = new Set(leerStorageSeguro('fz_ids_pedidos_conocidos', []));
let colaCartasVerdes = leerStorageSeguro('fz_cola_cartas_verdes', []);
let cargaInicialCompletada = false;

const getBowls = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'bowl');
const getAcomp = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'acompanante');
const getToppings = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'topping');
const getBebidas = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'bebida');

function saveState() {
    try {
        const idsArray = Array.from(idsPedidosConocidos || []).slice(-300);
        idsPedidosConocidos = new Set(idsArray);

        localStorage.setItem('fz_pedidos', JSON.stringify(pedidos));
        localStorage.setItem('fz_apartados', JSON.stringify(apartados));
        localStorage.setItem('fz_catalogo_menu', JSON.stringify(catalogoMenu));
        localStorage.setItem('fz_fecha_jornada', fechaJornadaActiva);
        localStorage.setItem('fz_ids_pedidos_conocidos', JSON.stringify(idsArray));
        localStorage.setItem('fz_cola_cartas_verdes', JSON.stringify(colaCartasVerdes || []));
    } catch (e) {
        console.warn('Error guardando estado local:', e);
    }
}

// ---------------- MAZO DE NOTIFICACIONES VERDES TIPO APPLE (SOLO ADMIN) ----------------
function obtenerContenedorStack() {
    let center = document.getElementById('appleNotificationCenter');
    if (!center) {
        center = document.createElement('div');
        center.id = 'appleNotificationCenter';
        document.body.prepend(center);
    }

    const alarmBanner = document.getElementById('alarmBanner');
    if (alarmBanner && alarmBanner.parentElement !== center) {
        center.prepend(alarmBanner);
    }

    let stack = document.getElementById('incomingOrderStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'incomingOrderStack';
        stack.setAttribute('aria-live', 'polite');
        center.appendChild(stack);
    } else if (stack.parentElement !== center) {
        center.appendChild(stack);
    }

    return stack;
}

function encolarNotificacionVerdeNuevoPedido(pedidoObj) {
    if (!pedidoObj || !pedidoObj.id) return;
    if (idsPedidosConocidos.has(pedidoObj.id)) return;

    idsPedidosConocidos.add(pedidoObj.id);

    if (!cargaInicialCompletada) {
        saveState();
        return;
    }

    if (!colaCartasVerdes.some((c) => c.id === pedidoObj.id)) {
        const extrasList = [
            ...(pedidoObj.acompDetalle || []),
            ...(pedidoObj.toppingDetalle || []),
            ...(pedidoObj.bebidaDetalle || [])
        ].map((i) => `${i.nombre} x${i.cantidad}`).join(', ');

        colaCartasVerdes.push({
            id: pedidoObj.id,
            cliente: pedidoObj.nombre,
            hora: pedidoObj.hora,
            bowl: pedidoObj.bowl,
            extras: extrasList || 'Sin adiciones extras',
            notas: pedidoObj.notas || '',
            pago: pedidoObj.pago,
            total: pedidoObj.total,
            esApartado: pedidoObj.estado === 'apartado',
            horaEntrega: pedidoObj.entregaProgramadaISO ? formatearHoraBogota(pedidoObj.entregaProgramadaISO) : null
        });
        saveState();
        renderizarPilaNotificacionesVerdes();
    }
}

function renderizarPilaNotificacionesVerdes() {
    const stackContainer = obtenerContenedorStack();
    if (!stackContainer) return;

    if (!usuarioActual || usuarioActual.rol !== 'admin' || colaCartasVerdes.length === 0) {
        stackContainer.innerHTML = '';
        return;
    }

    const totalCartas = colaCartasVerdes.length;

    stackContainer.innerHTML = colaCartasVerdes.map((carta, index) => {
        const posAttr = index === 0 ? '0' : index === 1 ? '1' : index === 2 ? '2' : 'hidden';
        const etiquetaTipo = carta.esApartado
            ? `📌 NUEVO APARTADO${carta.horaEntrega ? ` · ${carta.horaEntrega}` : ''}`
            : '🍏 NUEVO PEDIDO DE CLIENTE';

        return `
            <div class="green-order-card" data-stack-pos="${posAttr}" data-card-id="${ui.esc(carta.id)}">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                    <span class="green-card-badge">${ui.esc(etiquetaTipo)}</span>
                    <span style="font-size:0.74rem; font-weight:900; background:rgba(0,0,0,0.28); color:#A8F0C0; padding:3px 9px; border-radius:999px;">
                        ${index + 1} de ${totalCartas}
                    </span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:4px;">
                    <div style="font-size:1.1rem; font-weight:900; color:#FFFFFF;">
                        👤 ${ui.esc(carta.cliente)}
                    </div>
                    <div style="font-family:'Fredoka',sans-serif; font-size:1.2rem; font-weight:700; color:#FBBB1E;">
                        ${ui.fmt(carta.total)}
                    </div>
                </div>
                <div style="font-size:0.85rem; color:#E8F8F5; font-weight:700; line-height:1.38;">
                    <div>🥣 <strong>Base:</strong> ${ui.esc(carta.bowl)} · <span style="color:#A8F0C0;">${ui.esc(carta.pago)}</span></div>
                    <div>✨ <strong>Extras:</strong> ${ui.esc(carta.extras)}</div>
                    ${carta.notas ? `<div style="margin-top:5px; background:rgba(0,0,0,0.24); padding:5px 9px; border-radius:8px;">📝 ${ui.esc(carta.notas)}</div>` : ''}
                </div>
                <button type="button" class="green-card-close-btn" data-close-card="${ui.esc(carta.id)}">
                    ✓ Quitar Notificación ${totalCartas > 1 ? `(Siguiente: #2 de ${totalCartas})` : ''}
                </button>
            </div>
        `;
    }).join('');

    const btnCerrarPrimero = stackContainer.querySelector('.green-order-card[data-stack-pos="0"] .green-card-close-btn');
    if (btnCerrarPrimero) {
        btnCerrarPrimero.addEventListener('click', () => {
            const idCerrar = btnCerrarPrimero.getAttribute('data-close-card');
            colaCartasVerdes = colaCartasVerdes.filter((c) => c.id !== idCerrar);
            saveState();
            renderizarPilaNotificacionesVerdes();
        });
    }
}

// ---------------- ALARMA SONORA EXCLUSIVA PARA APARTADOS (SOLO ADMIN) ----------------
function reproducirBeepAlarma() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const ahora = audioCtx.currentTime;
        [0, 0.25, 0.5].forEach((offset) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ahora + offset);
            gain.gain.setValueAtTime(0.25, ahora + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, ahora + offset + 0.18);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(ahora + offset);
            osc.stop(ahora + offset + 0.2);
        });
    } catch (_) {}
}

function actualizarTemporizadoresYAlarmas() {
    document.querySelectorAll('.timer-live-badge').forEach((badge) => {
        const iso = badge.getAttribute('data-entrega');
        const info = ui.formatearCuentaRegresiva(iso);
        if (info) {
            badge.textContent = info.texto;
            badge.style.background = info.vencido ? '#D1272B' : info.urgente ? '#F5A623' : '#2A0E4F';
            badge.style.color = info.vencido ? '#FFFFFF' : info.urgente ? '#1B0836' : '#FBBB1E';
        }
    });

    const banner = document.getElementById('alarmBanner');

    if (!usuarioActual || usuarioActual.rol !== 'admin') {
        if (banner) banner.style.display = 'none';
        return;
    }

    const vencidosNoSilenciados = apartados.filter((ap) => {
        if (!ap.entregaProgramadaISO || alarmasSilenciadas.has(ap.id)) return false;
        const t = new Date(ap.entregaProgramadaISO).getTime();
        return !Number.isNaN(t) && Date.now() >= t;
    });

    const bannerTxt = document.getElementById('alarmBannerText');

    if (vencidosNoSilenciados.length > 0) {
        const primero = vencidosNoSilenciados[0];
        if (banner && bannerTxt) {
            bannerTxt.textContent = `Pedido de ${primero.nombre} (${primero.bowl}) programado para las ${formatearHoraBogota(primero.entregaProgramadaISO)}`;
            banner.style.display = 'flex';
        }
        if (Math.floor(Date.now() / 1000) % 5 === 0) {
            reproducirBeepAlarma();
        }
    } else if (banner) {
        banner.style.display = 'none';
    }
}

function calcularEntregaProgramadaISO() {
    const ahora = new Date();
    if (estado.apartadoHoraExacta) {
        const [hh, mm] = estado.apartadoHoraExacta.split(':').map(Number);
        if (Number.isFinite(hh) && Number.isFinite(mm)) {
            const fechaHoyBogota = obtenerFechaBogotaISO(ahora).slice(0, 10);
            const isoCandidato = `${fechaHoyBogota}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-05:00`;
            const dCandidato = new Date(isoCandidato);
            if (dCandidato.getTime() < ahora.getTime() - 60000) {
                return obtenerFechaBogotaISO(new Date(dCandidato.getTime() + 86400000));
            }
            return isoCandidato;
        }
    }
    if (estado.apartadoMinutos > 0) {
        return obtenerFechaBogotaISO(new Date(ahora.getTime() + estado.apartadoMinutos * 60000));
    }
    return null;
}

function actualizarPreviewProgramador() {
    const badge = document.getElementById('schedulePreviewBadge');
    if (!badge) return;
    const iso = calcularEntregaProgramadaISO();
    badge.textContent = iso ? `🔔 Alarma a las ${formatearHoraBogota(iso)}` : 'Sin alarma (Solo apartar)';
}

// ---------------- GESTIÓN DE ROLES (ADMIN vs CLIENTE) ----------------
async function aplicarVistaPorRol() {
    const gate = document.getElementById('authGateModal');
    const adminAside = document.getElementById('adminAsideColumn');
    const adminButtons = document.getElementById('adminOrderButtons');
    const mainGrid = document.getElementById('mainAppGrid');
    const sessionBadge = document.getElementById('userSessionBadge');
    const loyaltyBanner = document.getElementById('clienteLoyaltyBanner');
    const loyaltyTitle = document.getElementById('clienteLoyaltyTitle');
    const loyaltySub = document.getElementById('clienteLoyaltySub');
    const inputNombre = document.getElementById('nombreCliente');
    const bannerPedidos = document.getElementById('bannerPedidosTitle');
    const bannerApartados = document.getElementById('bannerApartadosTitle');

    if (!usuarioActual) {
        const sbSession = await api.getSession();
        if (sbSession) {
            usuarioActual = { rol: 'admin', nombre: sbSession.user.email || 'Administrador' };
            localStorage.setItem('fz_usuario_actual', JSON.stringify(usuarioActual));
        }
    }

    if (!usuarioActual) {
        if (gate) gate.style.display = 'flex';
        return;
    }

    if (gate) gate.style.display = 'none';

    if (usuarioActual.rol === 'admin') {
        if (adminAside) adminAside.style.display = 'block';
        if (adminButtons) adminButtons.style.display = 'block';
        if (mainGrid) mainGrid.style.gridTemplateColumns = '';
        if (loyaltyBanner) loyaltyBanner.style.display = 'none';
        if (sessionBadge) sessionBadge.textContent = `🔐 Admin: ${usuarioActual.nombre}`;
        if (bannerPedidos) bannerPedidos.textContent = 'Pedidos de Hoy (Todos los Dispositivos)';
        if (bannerApartados) bannerApartados.textContent = 'Apartados Activos (Con Temporizador)';
        if (inputNombre && !estado.clienteBloqueado) {
            inputNombre.readOnly = false;
            inputNombre.style.backgroundColor = '';
        }
    } else {
        const nombreCli = normalizarNombreCliente(usuarioActual.nombre);
        if (adminAside) adminAside.style.display = 'none';
        if (adminButtons) adminButtons.style.display = 'none';
        if (mainGrid) mainGrid.style.gridTemplateColumns = '1fr';
        if (sessionBadge) sessionBadge.textContent = `👤 Cliente: ${nombreCli}`;
        if (bannerPedidos) bannerPedidos.textContent = `Mis Pedidos de Hoy (${nombreCli})`;
        if (bannerApartados) bannerApartados.textContent = `Mis Pedidos Apartados (${nombreCli})`;

        if (inputNombre) {
            inputNombre.value = nombreCli;
            inputNombre.readOnly = true;
            inputNombre.style.backgroundColor = '#EFE4C8';
        }

        if (loyaltyBanner && loyaltyTitle && loyaltySub) {
            loyaltyBanner.style.display = 'block';
            const compras = navigator.onLine ? await api.obtenerComprasCliente(nombreCli) : 0;
            const faltan = 5 - (compras % 5);
            loyaltyTitle.textContent = `¡Hola, ${nombreCli}! 🌟 Llevas ${compras} ${compras === 1 ? 'compra registrada' : 'compras registradas'}`;
            loyaltySub.textContent = compras > 0 && compras % 5 === 0
                ? '🎉 ¡Felicidades! En este pedido tienes un TOPPING GRATIS incluido.'
                : `Te faltan ${faltan} ${faltan === 1 ? 'compra' : 'compras'} para tu próximo topping gratis. ¡Arma tu bowl y apártalo con temporizador!`;
        }
    }

    renderAll();
    renderizarPilaNotificacionesVerdes();
}

// ---------------- SINCRONIZACIÓN MULTI-DISPOSITIVO ----------------
function reconstruirPedidoDesdeNube(row) {
    const detalles = row.pedido_detalles || [];
    const bowlDetalle = detalles.find((d) => getBowls().some((b) => b.id === d.producto_id));
    const bowlObj = bowlDetalle ? getBowls().find((b) => b.id === bowlDetalle.producto_id) : null;

    const mapCat = (listaCat) =>
        detalles
            .filter((d) => listaCat.some((x) => x.id === d.producto_id))
            .map((d) => {
                const ref = listaCat.find((x) => x.id === d.producto_id);
                const precio = Number(d.precio_unitario_historico || ref?.precio || 0);
                const cantidad = Number(d.cantidad || 1);
                return {
                    id: d.producto_id,
                    nombre: d.producto_nombre_historico || (ref ? ref.nombre : d.producto_id),
                    cantidad,
                    precio,
                    subtotal: precio * cantidad
                };
            });

    return {
        id: row.id,
        fechaISO: row.created_at,
        fechaLocal: formatearFechaBogota(row.created_at),
        hora: formatearHoraBogota(row.created_at),
        nombre: normalizarNombreCliente(row.clientes?.nombre || 'Cliente'),
        notas: row.notas || '',
        bowl: bowlObj ? bowlObj.nombre : 'Individual',
        bowlId: bowlObj ? bowlObj.id : 'ninguno',
        acompDetalle: mapCat(getAcomp()),
        toppingDetalle: mapCat(getToppings()),
        bebidaDetalle: mapCat(getBebidas()),
        pago: row.medio_pago || 'Efectivo',
        total: Number(row.total || 0),
        estado: row.estado || 'completado',
        entregaProgramadaISO: row.entrega_programada_at || null,
        abierto: false,
        sincronizado: true,
        syncError: false
    };
}

async function sincronizarDesdeNubeMultiDispositivo() {
    if (!navigator.onLine) return;
    try {
        await sincronizarCola();

        const remotos = await api.obtenerPedidosJornadaHoy();
        if (!Array.isArray(remotos)) return;

        const colaPendiente = await dbSync.getQueue();
        const idsEnCola = new Set(colaPendiente.map((x) => x.id));

        const hoyStr = obtenerFechaHoyStr();
        const nuevosPedidos = [];
        const nuevosApartados = [];

        remotos.forEach((row) => {
            const reconstruido = reconstruirPedidoDesdeNube(row);
            encolarNotificacionVerdeNuevoPedido(reconstruido);

            if (reconstruido.estado === 'apartado') {
                const prev = apartados.find((a) => a.id === reconstruido.id);
                if (prev) reconstruido.abierto = prev.abierto;
                nuevosApartados.push(reconstruido);
            } else if (reconstruido.fechaLocal === hoyStr) {
                const prev = pedidos.find((p) => p.id === reconstruido.id);
                if (prev) reconstruido.abierto = prev.abierto;
                nuevosPedidos.push(reconstruido);
            }
        });

        pedidos.forEach((localPed) => {
            if (idsEnCola.has(localPed.id) && !nuevosPedidos.some((x) => x.id === localPed.id)) {
                nuevosPedidos.unshift(localPed);
            }
        });
        apartados.forEach((localAp) => {
            if (idsEnCola.has(localAp.id) && !nuevosApartados.some((x) => x.id === localAp.id)) {
                nuevosApartados.unshift(localAp);
            }
        });

        pedidos = nuevosPedidos;
        apartados = nuevosApartados;
        cargaInicialCompletada = true;
        saveState();
        renderAll();
    } catch (err) {
        console.warn('Error sincronizando dispositivos:', err);
    }
}

// ---------------- EXPORTAR IMAGEN DEL DASHBOARD DE HOY ----------------
function obtenerLienzoDashboardReporte() {
    let lienzo = document.getElementById('dashboardReportCapture');
    if (!lienzo) {
        lienzo = document.createElement('div');
        lienzo.id = 'dashboardReportCapture';
        lienzo.style.cssText = 'position:fixed; left:-9999px; top:0; width:1080px; background:#F7EFDD; color:#2A0E4F; padding:32px; font-family:Nunito,sans-serif; border-radius:24px;';
        document.body.appendChild(lienzo);
    }
    return lienzo;
}

async function exportarImagenDashboardEjecutivo() {
    const fechaHoy = obtenerFechaHoyStr();
    const pedidosDeHoy = pedidos.filter((p) => !p.fechaLocal || p.fechaLocal === fechaHoy);

    if (pedidosDeHoy.length === 0) {
        return ui.mostrarToast('No hay pedidos registrados hoy para generar el Dashboard');
    }

    const lienzo = obtenerLienzoDashboardReporte();
    ui.mostrarToast('📊 Generando imagen del Dashboard de Hoy...');

    const ingresosTotales = pedidosDeHoy.reduce((s, p) => s + Number(p.total || 0), 0);
    const personasUnicas = new Set(
        pedidosDeHoy.map((p) => String(p.nombre || '').toLowerCase().trim()).filter(Boolean)
    ).size;
    const ticketPromedio = pedidosDeHoy.length > 0 ? Math.round(ingresosTotales / pedidosDeHoy.length) : 0;

    let totalUnidades = 0;
    const conteoProductos = {};
    const ingresosProductos = {};
    const conteoHoras = {};

    for (let h = 10; h <= 22; h++) conteoHoras[h] = 0;

    pedidosDeHoy.forEach((p) => {
        const d = p.fechaISO ? new Date(p.fechaISO) : new Date();
        const strH = d.toLocaleTimeString('en-US', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false });
        const h = Number.isNaN(parseInt(strH, 10)) ? d.getHours() : (parseInt(strH, 10) === 24 ? 0 : parseInt(strH, 10));
        conteoHoras[h] = (conteoHoras[h] || 0) + 1;

        if (p.bowlId && p.bowlId !== 'ninguno') {
            const bRef = getBowls().find((b) => b.id === p.bowlId);
            const sumaEx = [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])]
                .reduce((acc, i) => acc + (Number(i.precio || 0) * Number(i.cantidad || 1)), 0);
            const precioB = bRef ? bRef.precio : Math.max(0, Number(p.total || 0) - sumaEx);

            conteoProductos[p.bowl] = (conteoProductos[p.bowl] || 0) + 1;
            ingresosProductos[p.bowl] = (ingresosProductos[p.bowl] || 0) + precioB;
            totalUnidades += 1;
        }

        [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])].forEach((i) => {
            const cant = Number(i.cantidad || 1);
            totalUnidades += cant;
            conteoProductos[i.nombre] = (conteoProductos[i.nombre] || 0) + cant;
            ingresosProductos[i.nombre] = (ingresosProductos[i.nombre] || 0) + (Number(i.precio || 0) * cant);
        });
    });

    const topProd = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maxProd = topProd.length > 0 ? Math.max(...topProd.map((x) => x[1])) : 1;

    const horasActivas = Object.entries(conteoHoras).sort((a, b) => Number(a[0]) - Number(b[0]));
    const maxHoraPedidos = Math.max(1, ...horasActivas.map((x) => x[1]));

    const barrasProductosHTML = topProd.map(([nom, cant]) => {
        const pct = Math.round((cant / maxProd) * 100);
        const ing = ingresosProductos[nom] || 0;
        return `
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-size:0.88rem; font-weight:800; margin-bottom:4px;">
                    <span>${ui.esc(nom)}</span>
                    <span>${cant} uds. · ${ui.fmt(ing)}</span>
                </div>
                <div style="width:100%; height:10px; background:#E9DEC0; border-radius:99px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #2A0E4F, #653BA0); border-radius:99px;"></div>
                </div>
            </div>
        `;
    }).join('');

    const barrasHorasHTML = horasActivas.map(([h, cant]) => {
        const alturaPct = Math.round((cant / maxHoraPedidos) * 100);
        return `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:150px;">
                <span style="font-size:0.74rem; font-weight:900; color:#2A0E4F; margin-bottom:4px;">${cant > 0 ? cant : ''}</span>
                <div style="width:24px; height:${Math.max(6, alturaPct)}%; background:${cant > 0 ? 'linear-gradient(180deg, #F5A623, #2A0E4F)' : '#E9DEC0'}; border-radius:7px 7px 0 0;"></div>
                <span style="font-size:0.7rem; font-weight:800; color:#4E2286; margin-top:6px;">${String(h).padStart(2, '0')}h</span>
            </div>
        `;
    }).join('');

    const tarjetasPagosHTML = PAGOS.map((pg) => {
        const filtrados = pedidosDeHoy.filter((p) => (p.pago || '').toLowerCase() === pg.nombre.toLowerCase());
        const sub = filtrados.reduce((s, p) => s + Number(p.total || 0), 0);
        const pct = ingresosTotales > 0 ? Math.round((sub / ingresosTotales) * 100) : 0;
        return `
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:14px; padding:12px 16px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:1rem; color:#2A0E4F;">${ui.esc(pg.nombre)}</strong>
                        <div style="font-size:0.8rem; color:#4E2286; font-weight:700;">${filtrados.length} pedidos · ${pct}%</div>
                    </div>
                    <strong style="font-size:1.15rem; font-family:'Fredoka',sans-serif; color:#1B0836;">${ui.fmt(sub)}</strong>
                </div>
                <div style="width:100%; height:7px; background:#E9DEC0; border-radius:99px; margin-top:8px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:#F5A623; border-radius:99px;"></div>
                </div>
            </div>
        `;
    }).join('');

    lienzo.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #E9DEC0; padding-bottom:18px; margin-bottom:22px;">
            <div>
                <span style="background:#F5A623; color:#1B0836; font-weight:900; font-size:0.8rem; padding:5px 14px; border-radius:99px; text-transform:uppercase;">DASHBOARD DEL DÍA (HOY)</span>
                <h1 style="margin:8px 0 0 0; font-family:'Fredoka',sans-serif; font-size:2rem; color:#2A0E4F;">📊 FRIZZY REPORTE DE HOY — ${ui.esc(fechaHoy)}</h1>
            </div>
            <div style="text-align:right; font-weight:800; color:#4E2286; font-size:0.9rem;">
                Corte generado: ${ui.esc(formatearHoraBogota(new Date()))}<br/>Bogotá, Colombia (UTC-5)
            </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:14px; margin-bottom:24px;">
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:16px; padding:16px;">
                <span style="font-size:0.75rem; font-weight:900; color:#4E2286;">💰 VENTAS DE HOY</span>
                <div style="font-family:'Fredoka',sans-serif; font-size:1.7rem; font-weight:700; color:#2A0E4F; margin-top:4px;">${ui.fmt(ingresosTotales)}</div>
            </div>
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:16px; padding:16px;">
                <span style="font-size:0.75rem; font-weight:900; color:#4E2286;">👥 PERSONAS HOY</span>
                <div style="font-family:'Fredoka',sans-serif; font-size:1.7rem; font-weight:700; color:#2A0E4F; margin-top:4px;">${personasUnicas}</div>
            </div>
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:16px; padding:16px;">
                <span style="font-size:0.75rem; font-weight:900; color:#4E2286;">🧾 PEDIDOS HOY</span>
                <div style="font-family:'Fredoka',sans-serif; font-size:1.7rem; font-weight:700; color:#2A0E4F; margin-top:4px;">${pedidosDeHoy.length}</div>
            </div>
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:16px; padding:16px;">
                <span style="font-size:0.75rem; font-weight:900; color:#4E2286;">📈 TICKET PROM. HOY</span>
                <div style="font-family:'Fredoka',sans-serif; font-size:1.7rem; font-weight:700; color:#2A0E4F; margin-top:4px;">${ui.fmt(ticketPromedio)}</div>
            </div>
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:16px; padding:16px;">
                <span style="font-size:0.75rem; font-weight:900; color:#4E2286;">🥣 UNIDADES HOY</span>
                <div style="font-family:'Fredoka',sans-serif; font-size:1.7rem; font-weight:700; color:#2A0E4F; margin-top:4px;">${totalUnidades}</div>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1.15fr 1fr; gap:20px;">
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:18px; padding:20px;">
                <h3 style="margin:0 0 14px 0; font-family:'Fredoka',sans-serif; color:#2A0E4F;">🏆 Productos Más Vendidos Hoy</h3>
                ${barrasProductosHTML || '<p>Sin datos hoy</p>'}
            </div>
            <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:18px; padding:20px;">
                <h3 style="margin:0 0 14px 0; font-family:'Fredoka',sans-serif; color:#2A0E4F;">💳 Medios de Pago de Hoy</h3>
                ${tarjetasPagosHTML}
            </div>
        </div>

        <div style="background:#FFFAEF; border:2px solid #E9DEC0; border-radius:18px; padding:20px; margin-top:20px;">
            <h3 style="margin:0 0 14px 0; font-family:'Fredoka',sans-serif; color:#2A0E4F;">⏰ Horas Pico de Hoy</h3>
            <div style="display:flex; align-items:flex-end; gap:8px; padding-top:10px; border-bottom:2px solid #E9DEC0;">
                ${barrasHorasHTML}
            </div>
        </div>
    `;

    try {
        const canvas = await html2canvas(lienzo, {
            backgroundColor: '#F7EFDD',
            scale: 2,
            windowWidth: 1120,
            scrollX: 0,
            scrollY: 0
        });
        const link = document.createElement('a');
        link.download = `Frizzy_Dashboard_Hoy_${fechaHoy.replaceAll('/', '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        ui.mostrarToast('✅ Imagen del Dashboard de Hoy descargada');
    } catch (err) {
        console.error('Error generando imagen del Dashboard:', err);
        ui.mostrarToast('⚠️ No se pudo generar la imagen');
    }
}

// ---------------- CALCULADORA DE DEVUELTA, COMBOS Y NOTAS ----------------
function actualizarCalculadoraEfectivo() {
    const panel = document.getElementById('cashCalcPanel');
    const display = document.getElementById('cashChangeDisplay');
    const inputRecibido = document.getElementById('cashReceivedInput');
    if (!panel || !display || !inputRecibido) return;

    if (usuarioActual?.rol === 'cliente' || estado.pago !== 'efectivo' || estado.total <= 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    const recibido = Number(inputRecibido.value || 0);

    if (!recibido || recibido <= 0) {
        display.textContent = 'Selecciona billete o digita monto';
        display.style.color = '#2A0E4F';
        display.style.background = '#FFFFFF';
        return;
    }

    const diferencia = recibido - estado.total;
    if (diferencia >= 0) {
        display.textContent = `Devuelta: ${ui.fmt(diferencia)}`;
        display.style.color = '#1E7E34';
        display.style.background = '#E6F4EA';
    } else {
        display.textContent = `Faltan: ${ui.fmt(Math.abs(diferencia))}`;
        display.style.color = '#B71C1C';
        display.style.background = '#FDECEA';
    }
}

function aplicarComboRapido(combo) {
    if (combo.esRepetir) {
        if (pedidos.length === 0) {
            return ui.mostrarToast('Aún no hay un pedido anterior hoy para repetir');
        }
        const ultimo = pedidos[0];
        const nuevoBowl = ultimo.bowlId && ultimo.bowlId !== 'ninguno' ? ultimo.bowlId : null;
        if (nuevoBowl) {
            const refBowl = getBowls().find((b) => b.id === nuevoBowl);
            if (refBowl && refBowl.disponible === false) {
                return ui.mostrarToast(`🚫 No se puede repetir: ${refBowl.nombre} está agotado`);
            }
        }
        estado.bowl = nuevoBowl;
        estado.acomp = {};
        estado.toppings = {};
        estado.bebidas = {};

        (ultimo.acompDetalle || []).forEach((i) => {
            const ref = getAcomp().find((x) => x.id === i.id);
            if (ref && ref.disponible !== false) estado.acomp[i.id] = i.cantidad;
        });
        (ultimo.toppingDetalle || []).forEach((i) => {
            const ref = getToppings().find((x) => x.id === i.id);
            if (ref && ref.disponible !== false) estado.toppings[i.id] = i.cantidad;
        });
        (ultimo.bebidaDetalle || []).forEach((i) => {
            const ref = getBebidas().find((x) => x.id === i.id);
            if (ref && ref.disponible !== false) estado.bebidas[i.id] = i.cantidad;
        });

        renderAll();
        return ui.mostrarToast('🔄 Último bowl cargado');
    }

    const bowlRef = getBowls().find((b) => b.id === combo.bowl);
    if (bowlRef && bowlRef.disponible === false) {
        return ui.mostrarToast(`🚫 ${bowlRef.nombre} está marcado como AGOTADO`);
    }

    estado.bowl = combo.bowl || null;
    estado.acomp = {};
    estado.toppings = {};
    estado.bebidas = {};

    Object.entries(combo.acomp || {}).forEach(([id, cant]) => {
        const ref = getAcomp().find((x) => x.id === id);
        if (ref && ref.disponible !== false) estado.acomp[id] = cant;
    });
    Object.entries(combo.toppings || {}).forEach(([id, cant]) => {
        const ref = getToppings().find((x) => x.id === id);
        if (ref && ref.disponible !== false) estado.toppings[id] = cant;
    });
    Object.entries(combo.bebidas || {}).forEach(([id, cant]) => {
        const ref = getBebidas().find((x) => x.id === id);
        if (ref && ref.disponible !== false) estado.bebidas[id] = cant;
    });

    renderAll();
    ui.mostrarToast(`⚡ ${combo.nombre} aplicado`);
}

function alternarNotaRapida(etiqueta) {
    const inputNotas = document.getElementById('notas');
    if (!inputNotas) return;

    const partes = inputNotas.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const idx = partes.findIndex((p) => p.toLowerCase() === etiqueta.toLowerCase());
    if (idx >= 0) {
        partes.splice(idx, 1);
    } else {
        partes.push(etiqueta);
    }

    inputNotas.value = partes.join(', ');
    ui.renderQuickNotes('quickNotesGrid', NOTAS_RAPIDAS, inputNotas.value, alternarNotaRapida);
}

// ---------------- WHATSAPP Y CORTE AUTOMÁTICO DE MEDIANOCHE ----------------
function construirMensajeWhatsApp(listaPedidos, fechaEtiqueta) {
    const totalVentas = listaPedidos.reduce((s, p) => s + Number(p.total || 0), 0);
    const personasUnicas = new Set(
        listaPedidos.map((p) => String(p.nombre || '').toLowerCase().trim()).filter(Boolean)
    ).size;

    const desglosePagos = PAGOS.map((pg) => {
        const filtrados = listaPedidos.filter((p) => (p.pago || '').toLowerCase() === pg.nombre.toLowerCase());
        const sub = filtrados.reduce((s, p) => s + Number(p.total || 0), 0);
        return `• ${pg.nombre}: ${ui.fmt(sub)} (${filtrados.length} ped.)`;
    }).join('\n');

    const conteo = {};
    listaPedidos.forEach((p) => {
        if (p.bowlId && p.bowlId !== 'ninguno') conteo[p.bowl] = (conteo[p.bowl] || 0) + 1;
        [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])].forEach((i) => {
            conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad;
        });
    });

    const topTexto = Object.entries(conteo)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([nom, cant], i) => `${i + 1}. ${nom}: ${cant} uds.`)
        .join('\n') || 'Sin ítems';

    return (
        `📊 *REPORTE DE CIERRE FRIZZY POS*\n` +
        `📅 *Fecha:* ${fechaEtiqueta}\n` +
        `────────────────────\n` +
        `🧾 *Pedidos (Bowls):* ${listaPedidos.length}\n` +
        `👥 *Personas atendidas:* ${personasUnicas}\n` +
        `💰 *Total Ventas:* ${ui.fmt(totalVentas)}\n` +
        `────────────────────\n` +
        `💳 *Por Medio de Pago:*\n${desglosePagos}\n` +
        `────────────────────\n` +
        `🏆 *Top Más Vendidos:*\n${topTexto}`
    );
}

function abrirWhatsAppConReporte(mensaje) {
    const encoded = encodeURIComponent(mensaje);
    const numLimpio = String(WHATSAPP_ADMIN_PHONE || '').replace(/\D/g, '');
    const url = `https://api.whatsapp.com/send?phone=${numLimpio}&text=${encoded}`;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function verificarCorteAutomaticoMedianoche() {
    const hoyStr = obtenerFechaHoyStr();
    const pedidosDiaAnterior = pedidos.filter((p) => p.fechaLocal && p.fechaLocal !== hoyStr);

    if (fechaJornadaActiva !== hoyStr || pedidosDiaAnterior.length > 0) {
        if (pedidos.length > 0) {
            const listaParaReporte = pedidosDiaAnterior.length > 0 ? pedidosDiaAnterior : [...pedidos];
            const fechaReporte = listaParaReporte[0]?.fechaLocal || fechaJornadaActiva;
            const resumenTxt = construirMensajeWhatsApp(listaParaReporte, fechaReporte);
            const apiKeyGuardada = localStorage.getItem('fz_whatsapp_apikey') || '';

            if (navigator.onLine) {
                await api.cerrarJornadaServidor(apiKeyGuardada);
                if (apiKeyGuardada) {
                    await api.enviarWhatsAppAutomaticoCloud(WHATSAPP_ADMIN_PHONE, resumenTxt, apiKeyGuardada);
                }
            }

            pedidos = pedidos.filter((p) => p.fechaLocal === hoyStr && pedidosDiaAnterior.length > 0);
            fechaJornadaActiva = hoyStr;
            idsPedidosConocidos.clear();
            colaCartasVerdes = [];
            saveState();
            renderAll();
            renderizarPilaNotificacionesVerdes();
            ui.mostrarToast(`🌙 Corte automático de medianoche completado`);
        } else {
            fechaJornadaActiva = hoyStr;
            saveState();
        }
    }
}

async function actualizarBadgeSincronizacion() {
    const badge = document.getElementById('syncStatusBadge');
    if (!badge) return;
    try {
        const cola = await dbSync.getQueue();
        const pendientes = cola.length;
        if (!navigator.onLine) {
            badge.textContent = `🟠 Offline · ${pendientes} en cola`;
            badge.style.color = '#FBBB1E';
        } else if (pendientes > 0) {
            badge.textContent = `⏳ Subiendo ${pendientes} pedido(s)...`;
            badge.style.color = '#FBBB1E';
        } else {
            badge.textContent = '🟢 En línea · Multi-dispositivo activo';
            badge.style.color = '#A8F0C0';
        }
    } catch (_) {}
}

function registrarClienteEnCache(nombre) {
    const limpio = normalizarNombreCliente(nombre || '');
    if (!limpio) return;
    if (!clientesConocidos.some((c) => c.toLowerCase() === limpio.toLowerCase())) {
        clientesConocidos.push(limpio);
        clientesConocidos.sort((a, b) => a.localeCompare(b, 'es'));
        localStorage.setItem('fz_clientes_cache', JSON.stringify(clientesConocidos));
    }
}

async function sincronizarClientesConocidos() {
    pedidos.forEach((p) => registrarClienteEnCache(p.nombre));
    apartados.forEach((p) => registrarClienteEnCache(p.nombre));

    if (navigator.onLine && typeof api.obtenerClientes === 'function') {
        const remotos = await api.obtenerClientes();
        if (Array.isArray(remotos)) {
            remotos.forEach((nombre) => registrarClienteEnCache(nombre));
        }
    }
}

function limpiarParaBusqueda(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function obtenerTop3Clientes(textoDigitado) {
    const query = limpiarParaBusqueda(textoDigitado);
    if (!query) return [];

    const empiezan = [];
    const contienen = [];

    for (const nombre of clientesConocidos) {
        const norm = limpiarParaBusqueda(nombre);
        if (norm === query) continue;
        if (norm.startsWith(query)) empiezan.push(nombre);
        else if (norm.includes(query)) contienen.push(nombre);
    }
    return [...empiezan, ...contienen].slice(0, 3);
}

async function verificarFidelidadCliente(nombreNorm) {
    const inputNombre = document.getElementById('nombreCliente');
    if (!nombreNorm || !inputNombre) return;

    const pendientesLocales = pedidos.filter(
        (p) => !p.sincronizado && normalizarNombreCliente(p.nombre) === nombreNorm
    ).length;
    const remotas = navigator.onLine ? await api.obtenerComprasCliente(nombreNorm) : 0;
    const totalCompras = remotas + pendientesLocales;

    if (totalCompras > 0 && totalCompras % 5 === 0) {
        estado.premioFidelidad = true;
        ui.mostrarToast(`🌟 ¡${nombreNorm} lleva ${totalCompras} compras! Topping gratis incluido en nota.`);
        inputNombre.style.borderColor = 'var(--dorado)';
        inputNombre.style.boxShadow = '0 0 8px rgba(255, 215, 0, 0.5)';
    } else {
        estado.premioFidelidad = false;
        if (!estado.clienteBloqueado && usuarioActual?.rol === 'admin') {
            inputNombre.style.borderColor = '';
            inputNombre.style.boxShadow = '';
        }
    }
}

function depurarSeleccionPorDisponibilidad() {
    if (estado.bowl) {
        const b = getBowls().find((x) => x.id === estado.bowl);
        if (!b || b.disponible === false) estado.bowl = null;
    }
    Object.keys(estado.acomp).forEach((id) => {
        const item = getAcomp().find((x) => x.id === id);
        if (!item || item.disponible === false) delete estado.acomp[id];
    });
    Object.keys(estado.toppings).forEach((id) => {
        const item = getToppings().find((x) => x.id === id);
        if (!item || item.disponible === false) delete estado.toppings[id];
    });
    Object.keys(estado.bebidas).forEach((id) => {
        const item = getBebidas().find((x) => x.id === id);
        if (!item || item.disponible === false) delete estado.bebidas[id];
    });
}

async function cargarCatalogoProductos() {
    catalogoMenu = catalogoMenu.map((item) => ({
        ...item,
        categoria: normalizarCategoria(item.categoria)
    }));

    if (navigator.onLine) {
        const remotos = await api.obtenerProductos();
        if (Array.isArray(remotos) && remotos.length > 0) {
            catalogoMenu = remotos.map((r) => ({
                id: r.id,
                nombre: r.nombre,
                precio: Number(r.precio_actual || 0),
                categoria: normalizarCategoria(r.categoria),
                disponible: r.disponible !== false
            }));
            saveState();
        }
    }
    depurarSeleccionPorDisponibilidad();
    renderAll();
}

function calcularTotal() {
    let t = 0;
    const bowl = getBowls().find((b) => b.id === estado.bowl && b.disponible !== false);
    if (bowl) t += bowl.precio;

    Object.entries(estado.acomp).forEach(([id, c]) => {
        const item = getAcomp().find((x) => x.id === id && x.disponible !== false);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.toppings).forEach(([id, c]) => {
        const item = getToppings().find((x) => x.id === id && x.disponible !== false);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.bebidas).forEach(([id, c]) => {
        const item = getBebidas().find((x) => x.id === id && x.disponible !== false);
        if (item) t += item.precio * c;
    });

    estado.total = t;
    const elTotal = document.getElementById('totalPedido');
    if (elTotal) elTotal.textContent = ui.fmt(t);

    const inputNombre = document.getElementById('nombreCliente');
    const nombreOk = inputNombre && inputNombre.value.trim().length > 0;
    const pagoOk = estado.pago !== null;
    const tieneItems =
        estado.bowl !== null ||
        Object.keys(estado.acomp).length > 0 ||
        Object.keys(estado.toppings).length > 0 ||
        Object.keys(estado.bebidas).length > 0;

    const habilitado = Boolean(nombreOk && pagoOk && tieneItems && !guardandoEnCurso);
    const btnGuardar = document.getElementById('btnGuardar');
    const btnGuardarYOtro = document.getElementById('btnGuardarYOtro');
    const btnApartar = document.getElementById('btnApartar');

    if (btnGuardar) btnGuardar.disabled = !habilitado;
    if (btnGuardarYOtro) btnGuardarYOtro.disabled = !habilitado;
    if (btnApartar) btnApartar.disabled = !habilitado;

    actualizarCalculadoraEfectivo();
    actualizarPreviewProgramador();
}

function construirPedido(esApartado = false) {
    const mapDetalle = (store, catList) =>
        Object.entries(store).map(([id, cant]) => {
            const item = catList.find((x) => x.id === id);
            return {
                id: item.id,
                nombre: item.nombre,
                cantidad: cant,
                precio: item.precio,
                subtotal: item.precio * cant
            };
        });

    const bowlObj = getBowls().find((b) => b.id === estado.bowl);
    const ahora = new Date();
    const isoBogota = obtenerFechaBogotaISO(ahora);
    const entregaISO = esApartado ? calcularEntregaProgramadaISO() : null;

    let notasTexto = document.getElementById('notas').value.trim() || '';
    if (estado.premioFidelidad && !notasTexto.includes('[Premio Fidelidad')) {
        notasTexto = (notasTexto + ' [Premio Fidelidad: Topping Gratis]').trim();
    }

    return {
        id: generarUUID(),
        fechaISO: isoBogota,
        fechaLocal: formatearFechaBogota(ahora),
        hora: formatearHoraBogota(ahora),
        nombre: normalizarNombreCliente(document.getElementById('nombreCliente').value),
        notas: notasTexto,
        bowl: bowlObj ? bowlObj.nombre : 'Individual',
        bowlId: estado.bowl || 'ninguno',
        acompDetalle: mapDetalle(estado.acomp, getAcomp()),
        toppingDetalle: mapDetalle(estado.toppings, getToppings()),
        bebidaDetalle: mapDetalle(estado.bebidas, getBebidas()),
        pago: PAGOS.find((p) => p.id === estado.pago)?.nombre || 'Efectivo',
        total: estado.total,
        estado: esApartado ? 'apartado' : 'completado',
        entregaProgramadaISO: entregaISO,
        abierto: true,
        sincronizado: false,
        syncError: false
    };
}

function limpiarCalculadoraEfectivo() {
    const inputRecibido = document.getElementById('cashReceivedInput');
    if (inputRecibido) inputRecibido.value = '';
    document.querySelectorAll('.bill-chip').forEach((b) => b.classList.remove('active'));
}

function resetForm() {
    const esCliente = usuarioActual?.rol === 'cliente';
    const nombreFijoCliente = esCliente ? normalizarNombreCliente(usuarioActual.nombre) : '';

    estado = {
        bowl: null,
        acomp: {},
        toppings: {},
        bebidas: {},
        pago: null,
        total: 0,
        premioFidelidad: false,
        clienteBloqueado: esCliente,
        apartadoMinutos: 0,
        apartadoHoraExacta: ''
    };

    document.getElementById('orderForm')?.reset();
    limpiarCalculadoraEfectivo();

    const timeInput = document.getElementById('apartadoTimeInput');
    if (timeInput) timeInput.value = '';
    document.querySelectorAll('.timer-chip').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-mins') === '0');
    });

    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        if (esCliente) {
            inputNombre.value = nombreFijoCliente;
            inputNombre.readOnly = true;
            inputNombre.style.backgroundColor = '#EFE4C8';
        } else {
            inputNombre.readOnly = false;
            inputNombre.style.backgroundColor = '';
            inputNombre.style.cursor = '';
            inputNombre.style.borderColor = '';
            inputNombre.style.boxShadow = '';
        }
    }
    const multiBadge = document.getElementById('multiOrderBadge');
    if (multiBadge) multiBadge.style.display = 'none';
    ui.renderSugerenciasClientes([], () => {});
    renderAll();
}

function prepararSiguienteBowlMismoCliente(nombreCliente, pagoIdOpcional = null) {
    const nombreFijo = normalizarNombreCliente(nombreCliente);
    const pagoConservado = pagoIdOpcional || estado.pago || 'efectivo';
    estado = {
        bowl: null,
        acomp: {},
        toppings: {},
        bebidas: {},
        pago: pagoConservado,
        total: 0,
        premioFidelidad: false,
        clienteBloqueado: true,
        apartadoMinutos: 0,
        apartadoHoraExacta: ''
    };

    limpiarCalculadoraEfectivo();
    const inputNombre = document.getElementById('nombreCliente');
    const inputNotas = document.getElementById('notas');
    if (inputNombre) {
        inputNombre.value = nombreFijo;
        inputNombre.readOnly = true;
        inputNombre.style.backgroundColor = '#EFE4C8';
        inputNombre.style.borderColor = '#2A0E4F';
        inputNombre.style.cursor = 'not-allowed';
    }
    if (inputNotas) inputNotas.value = '';
    ui.renderSugerenciasClientes([], () => {});

    const multiBadge = document.getElementById('multiOrderBadge');
    if (multiBadge) {
        multiBadge.innerHTML = `
            <span>🔒 Cliente fijado: <strong>${ui.esc(nombreFijo)}</strong></span>
            <button type="button" id="btnCancelarMultiCliente" style="margin-left:8px; background:#D1272B; color:#FFF; border:none; border-radius:99px; padding:2px 8px; font-size:0.72rem; font-weight:900; cursor:pointer;">
                ✖ Cambiar cliente
            </button>
        `;
        multiBadge.style.display = 'inline-flex';
        multiBadge.style.alignItems = 'center';

        document.getElementById('btnCancelarMultiCliente')?.addEventListener('click', () => {
            resetForm();
            ui.mostrarToast('Modo multi-bowl cancelado.');
        });
    }

    renderAll();
    verificarFidelidadCliente(nombreFijo);
    document.getElementById('bowlGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Sincroniza el PIN de clientes y si el local acepta pedidos de clientes desde Supabase (Punto C)
async function cargarConfiguracionClientes() {
    if (!navigator.onLine || typeof api.obtenerConfiguracionSistema !== 'function') return;
    const cfg = await api.obtenerConfiguracionSistema();
    if (cfg) {
        if (cfg.cliente_pin) configClientes.pin = String(cfg.cliente_pin).trim();
        if (cfg.clientes_habilitados !== undefined) {
            configClientes.habilitado = cfg.clientes_habilitados !== 'false';
        }
        if (cfg.telegram_chat_id) {
            localStorage.setItem('fz_whatsapp_apikey', cfg.telegram_chat_id);
        }
        localStorage.setItem('fz_config_clientes', JSON.stringify(configClientes));
    }
}

// IDEA 4: Mostrar el Ticket estilo Apple Wallet al cliente o admin
function mostrarPaseAppleWallet(pedido) {
    const modal = document.getElementById('walletPassModal');
    if (!modal || !pedido) return;

    const codigoCorto = '#FZ-' + String(pedido.id || '0000').slice(0, 4).toUpperCase();
    document.getElementById('walletPassCode').textContent = codigoCorto;
    document.getElementById('walletPassClient').textContent = pedido.nombre || 'Cliente';
    document.getElementById('walletPassPay').textContent = pedido.pago || 'Efectivo';
    document.getElementById('walletPassTotal').textContent = ui.fmt(pedido.total);

    const elTime = document.getElementById('walletPassTime');
    if (pedido.entregaProgramadaISO) {
        elTime.textContent = `⏰ ${formatearHoraBogota(pedido.entregaProgramadaISO)}`;
    } else {
        elTime.textContent = `⚡ ${pedido.hora || 'En caja'}`;
    }

    const extras = [
        ...(pedido.acompDetalle || []),
        ...(pedido.toppingDetalle || []),
        ...(pedido.bebidaDetalle || [])
    ];
    const htmlItems = [
        `<div>🥣 <strong>Base:</strong> ${ui.esc(pedido.bowl)}</div>`,
        ...extras.map((i) => `<div>• ${ui.esc(i.nombre)} <strong>x${Number(i.cantidad)}</strong> (${ui.fmt((i.precio || 0) * i.cantidad)})</div>`),
        pedido.notas ? `<div style="margin-top:6px; color:#653BA0; font-style:italic;">📝 "${ui.esc(pedido.notas)}"</div>` : ''
    ].join('');

    document.getElementById('walletPassItems').innerHTML = htmlItems;
    document.getElementById('walletPassDate').textContent = `${pedido.fechaLocal || obtenerFechaHoyStr()} · Muestra este pase en caja`;

    modal.style.display = 'flex';
}

// PUNTO B: Corregir nombre mal escrito en un pedido ya guardado
async function corregirNombreEnPedido(pedidoObj) {
    const nuevoRaw = window.prompt('Corregir nombre del cliente:', pedidoObj.nombre);
    if (!nuevoRaw) return;
    const nuevoNombre = normalizarNombreCliente(nuevoRaw);
    if (!nuevoNombre || nuevoNombre === pedidoObj.nombre) return;

    const nombreAnterior = pedidoObj.nombre;
    pedidoObj.nombre = nuevoNombre;
    registrarClienteEnCache(nuevoNombre);
    saveState();
    renderAll();

    if (navigator.onLine && typeof api.actualizarPedidoExistente === 'function') {
        const { error } = await api.actualizarPedidoExistente(pedidoObj.id, {
            nuevoNombre,
            nuevoPago: pedidoObj.pago
        });
        if (error) {
            ui.mostrarToast('⚠️ Guardado en caja (se sincronizará al reconectar)');
        } else {
            ui.mostrarToast(`✏️ Nombre corregido: ${nombreAnterior} ➔ ${nuevoNombre}`);
        }
    } else {
        ui.mostrarToast(`✏️ Nombre corregido localmente a ${nuevoNombre}`);
    }
}

// IDEA 5: Cambiar el Medio de Pago en 1 Toque (Efectivo -> Nequi -> Llave)
async function rotarMedioPagoPedido(pedidoObj) {
    const ordenPagos = ['Efectivo', 'Nequi', 'Llave'];
    const idxActual = ordenPagos.findIndex((x) => x.toLowerCase() === String(pedidoObj.pago || '').toLowerCase());
    const nuevoPago = ordenPagos[(idxActual + 1) % ordenPagos.length];

    pedidoObj.pago = nuevoPago;
    saveState();
    renderAll();

    if (navigator.onLine && typeof api.actualizarPedidoExistente === 'function') {
        const { error } = await api.actualizarPedidoExistente(pedidoObj.id, {
            nuevoNombre: pedidoObj.nombre,
            nuevoPago
        });
        if (!error) {
            ui.mostrarToast(`💳 Pago cambiado a ${nuevoPago} (Caja y Nube)`);
            return;
        }
    }
    ui.mostrarToast(`💳 Pago cambiado a ${nuevoPago}`);
}

// IDEA 3: Función de filtrado por el Buscador Instantáneo
function coincideConBusqueda(pedidoObj, queryRaw) {
    const q = limpiarParaBusqueda(queryRaw);
    if (!q) return true;
    const extrasTxt = [
        ...(pedidoObj.acompDetalle || []),
        ...(pedidoObj.toppingDetalle || []),
        ...(pedidoObj.bebidaDetalle || [])
    ].map((i) => i.nombre).join(' ');

    const todoElTexto = limpiarParaBusqueda(
        `${pedidoObj.nombre} ${pedidoObj.bowl} ${pedidoObj.pago} ${pedidoObj.notas || ''} ${extrasTxt}`
    );
    return todoElTexto.includes(q);
}

function renderAll() {
    const esAdmin = usuarioActual?.rol !== 'cliente';
    const nombreClienteActual = usuarioActual?.rol === 'cliente'
        ? normalizarNombreCliente(usuarioActual.nombre).toLowerCase()
        : null;

    ui.renderCombos('comboGrid', COMBOS_RAPIDOS, aplicarComboRapido);

    const inputNotas = document.getElementById('notas');
    ui.renderQuickNotes('quickNotesGrid', NOTAS_RAPIDAS, inputNotas ? inputNotas.value : '', alternarNotaRapida);

    ui.renderChoiceGrid('bowlGrid', getBowls(), estado.bowl, (id) => {
        estado.bowl = estado.bowl === id ? null : id;
        renderAll();
    });
    ui.renderChoiceGrid('payGrid', PAGOS, estado.pago, (id) => {
        estado.pago = id;
        renderAll();
    });
    ui.renderQtyGrid('acompGrid', getAcomp(), estado.acomp, (id, v) => {
        v === 0 ? delete estado.acomp[id] : (estado.acomp[id] = v);
        renderAll();
    });
    ui.renderQtyGrid('toppingGrid', getToppings(), estado.toppings, (id, v) => {
        v === 0 ? delete estado.toppings[id] : (estado.toppings[id] = v);
        renderAll();
    });
    ui.renderQtyGrid('bebidaGrid', getBebidas(), estado.bebidas, (id, v) => {
        v === 0 ? delete estado.bebidas[id] : (estado.bebidas[id] = v);
        renderAll();
    });

let pedidosVisibles = esAdmin
        ? pedidos
        : pedidos.filter((p) => String(p.nombre || '').toLowerCase() === nombreClienteActual);

    if (esAdmin && filtroPago) {
        pedidosVisibles = pedidosVisibles.filter((p) => (p.pago || '').toLowerCase() === filtroPago.toLowerCase());
    }

    if (textoBusquedaPedidos) {
        pedidosVisibles = pedidosVisibles.filter((p) => coincideConBusqueda(p, textoBusquedaPedidos));
    }

    const apartadosVisibles = (esAdmin
        ? apartados
        : apartados.filter((a) => String(a.nombre || '').toLowerCase() === nombreClienteActual)
    ).filter((a) => coincideConBusqueda(a, textoBusquedaPedidos));

    ui.renderOrders(pedidosVisibles, 'ordersList', false, {
        onToggle: (id) => {
            const p = pedidos.find((x) => x.id === id);
            if (p) {
                p.abierto = !p.abierto;
                saveState();
                renderAll();
            }
        },
        onEditClientName: (p) => corregirNombreEnPedido(p),
        onCyclePayment: (p) => rotarMedioPagoPedido(p),
        onShowWalletPass: (p) => mostrarPaseAppleWallet(p),
        onNewForClient: (pedidoBase) => {
            const pagoObj = PAGOS.find((pg) => pg.nombre.toLowerCase() === String(pedidoBase.pago || '').toLowerCase());
            prepararSiguienteBowlMismoCliente(pedidoBase.nombre, pagoObj ? pagoObj.id : 'efectivo');
            ui.mostrarToast(`🔒 Nombre fijado para agregar otro bowl a ${pedidoBase.nombre}`);
        },
        onDelete: (id) => {
            ui.confirmarAccion('¿Eliminar este pedido de la caja y de todos los dispositivos?', async () => {
                pedidos = pedidos.filter((x) => x.id !== id);
                colaCartasVerdes = colaCartasVerdes.filter((c) => c.id !== id);
                saveState();
                renderAll();
                renderizarPilaNotificacionesVerdes();
                try {
                    await dbSync.removeFromQueue(id);
                    if (navigator.onLine) {
                        const borradoRemoto = await api.deletePedido(id);
                        if (!borradoRemoto) await dbSync.saveDeleteToQueue(id);
                    } else {
                        await dbSync.saveDeleteToQueue(id);
                    }
                } catch (_) {}
                actualizarBadgeSincronizacion();
                ui.mostrarToast('Pedido eliminado en todos los dispositivos');
            });
        }
    }, esAdmin);

    ui.renderOrders(apartadosVisibles, 'apartadosList', true, {
        onToggle: (id) => {
            const p = apartados.find((x) => x.id === id);
            if (p) {
                p.abierto = !p.abierto;
                saveState();
                renderAll();
            }
        },
        onEditClientName: (p) => corregirNombreEnPedido(p),
        onCyclePayment: (p) => rotarMedioPagoPedido(p),
        onShowWalletPass: (p) => mostrarPaseAppleWallet(p),
        onDelete: (id) => {
            ui.confirmarAccion('¿Cancelar y eliminar este pedido apartado?', async () => {
                apartados = apartados.filter((x) => x.id !== id);
                colaCartasVerdes = colaCartasVerdes.filter((c) => c.id !== id);
                alarmasSilenciadas.add(id);
                saveState();
                renderAll();
                renderizarPilaNotificacionesVerdes();
                await dbSync.removeFromQueue(id);
                if (navigator.onLine) await api.deletePedido(id);
                else await dbSync.saveDeleteToQueue(id);
                ui.mostrarToast('Apartado cancelado');
            });
        },
        onConfirm: async (p) => {
            apartados = apartados.filter((x) => x.id !== p.id);
            alarmasSilenciadas.add(p.id);
            const ahora = new Date();
            p.estado = 'completado';
            p.entregaProgramadaISO = null;
            p.abierto = true;
            p.fechaISO = obtenerFechaBogotaISO(ahora);
            p.fechaLocal = formatearFechaBogota(ahora);
            p.hora = formatearHoraBogota(ahora);
            await procesarGuardado(p, { modoReset: 'ninguno', esApartado: false });
        }
    }, esAdmin);

    ui.renderOrders(apartadosVisibles, 'apartadosList', true, {
        onToggle: (id) => {
            const p = apartados.find((x) => x.id === id);
            if (p) {
                p.abierto = !p.abierto;
                saveState();
                renderAll();
            }
        },
        onDelete: (id) => {
            ui.confirmarAccion('¿Cancelar y eliminar este pedido apartado?', async () => {
                apartados = apartados.filter((x) => x.id !== id);
                colaCartasVerdes = colaCartasVerdes.filter((c) => c.id !== id);
                alarmasSilenciadas.add(id);
                saveState();
                renderAll();
                renderizarPilaNotificacionesVerdes();
                await dbSync.removeFromQueue(id);
                if (navigator.onLine) await api.deletePedido(id);
                else await dbSync.saveDeleteToQueue(id);
                ui.mostrarToast('Apartado cancelado');
            });
        },
        onConfirm: async (p) => {
            apartados = apartados.filter((x) => x.id !== p.id);
            alarmasSilenciadas.add(p.id);
            const ahora = new Date();
            p.estado = 'completado';
            p.entregaProgramadaISO = null;
            p.abierto = true;
            p.fechaISO = obtenerFechaBogotaISO(ahora);
            p.fechaLocal = formatearFechaBogota(ahora);
            p.hora = formatearHoraBogota(ahora);
            await procesarGuardado(p, { modoReset: 'ninguno', esApartado: false });
        }
    }, esAdmin);

    if (esAdmin) {
        const conteo = {};
        pedidos.forEach((p) => {
            if (p.bowlId && p.bowlId !== 'ninguno') {
                conteo[p.bowl] = (conteo[p.bowl] || 0) + 1;
            }
            [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])].forEach((i) => {
                conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad;
            });
        });

        ui.renderSummary(
            pedidos,
            PAGOS,
            Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 6),
            filtroPago,
            (medioSeleccionado) => {
                filtroPago = filtroPago === medioSeleccionado ? null : medioSeleccionado;
                ui.mostrarToast(filtroPago ? `Filtrando por: ${filtroPago}` : 'Mostrando todos los pedidos');
                renderAll();
            }
        );
    }

    calcularTotal();
}

async function procesarGuardado(pedido, { modoReset = 'completo', esApartado = false } = {}) {
    if (guardandoEnCurso) return;
    guardandoEnCurso = true;
    calcularTotal();

    const pagoIdActual = estado.pago;

    try {
        verificarCorteAutomaticoMedianoche();

        const itemsArray = [];
        if (pedido.bowlId && pedido.bowlId !== 'ninguno') {
            const bowlObj = getBowls().find((b) => b.id === pedido.bowlId);
            if (bowlObj) itemsArray.push({ id: bowlObj.id, nombre: bowlObj.nombre, precio: bowlObj.precio, cantidad: 1 });
        }

        const pedidoAdaptadoAPI = {
            id: pedido.id,
            cliente: pedido.nombre,
            pago: pedido.pago,
            total: pedido.total,
            notas: pedido.notas,
            fechaISO: pedido.fechaISO,
            estado: esApartado ? 'apartado' : 'completado',
            entregaProgramadaISO: pedido.entregaProgramadaISO || null,
            items: [...itemsArray, ...pedido.acompDetalle, ...pedido.toppingDetalle, ...pedido.bebidaDetalle]
        };

        await dbSync.saveToQueue(pedidoAdaptadoAPI);

        if (usuarioActual?.rol === 'cliente') {
            cargaInicialCompletada = true;
            encolarNotificacionVerdeNuevoPedido(pedido);
        } else {
            idsPedidosConocidos.add(pedido.id);
        }

        if (esApartado) {
            apartados.forEach((a) => { a.abierto = false; });
            pedido.abierto = true;
            apartados.unshift(pedido);
        } else {
            pedidos.forEach((p) => { p.abierto = false; });
            pedido.abierto = true;
            pedidos.unshift(pedido);
        }

        if (esApartado) {
            const msgHora = pedido.entregaProgramadaISO
                ? ` con alarma para las ${formatearHoraBogota(pedido.entregaProgramadaISO)}`
                : '';
            ui.mostrarToast(`📌 Pedido apartado${msgHora}`);
            resetForm();
            // Si quien apartó es el Cliente, abrirle automáticamente su Pase estilo Apple Wallet
            if (usuarioActual?.rol === 'cliente') {
                mostrarPaseAppleWallet(pedido);
            }
        }

        registrarClienteEnCache(pedido.nombre);
        saveState();

        if (esApartado) {
            const msgHora = pedido.entregaProgramadaISO
                ? ` con alarma para las ${formatearHoraBogota(pedido.entregaProgramadaISO)}`
                : '';
            ui.mostrarToast(`📌 Pedido apartado${msgHora}`);
            resetForm();
        } else if (modoReset === 'mismoCliente') {
            ui.mostrarToast(`✅ Bowl guardado (${ui.fmt(pedido.total)}) · Arma el siguiente para ${pedido.nombre}`);
            prepararSiguienteBowlMismoCliente(pedido.nombre, pagoIdActual);
        } else if (modoReset === 'completo') {
            ui.mostrarToast(`✅ Pedido guardado — ${ui.fmt(pedido.total)}`);
            resetForm();
        } else {
            ui.mostrarToast(`✅ Apartado entregado y cobrado — ${ui.fmt(pedido.total)}`);
            renderAll();
        }

    } catch (err) {
        console.error('Error guardando en cola local:', err);
        ui.mostrarToast('⚠️ Error guardando en memoria local.');
    } finally {
        guardandoEnCurso = false;
        calcularTotal();
        actualizarBadgeSincronizacion();
    }

    if (navigator.onLine) sincronizarCola();
}

async function sincronizarCola() {
    if (sincronizando || !navigator.onLine) {
        actualizarBadgeSincronizacion();
        return;
    }
    sincronizando = true;
    actualizarBadgeSincronizacion();

    try {
        const cola = await dbSync.getQueue();
        for (const pedidoCola of cola) {
            const resultado = await api.pushPedido(pedidoCola);
            const localRef = pedidos.find((p) => p.id === pedidoCola.id) || apartados.find((a) => a.id === pedidoCola.id);

            if (resultado.ok) {
                await dbSync.removeFromQueue(pedidoCola.id);
                if (localRef) {
                    localRef.sincronizado = true;
                    localRef.syncError = false;
                }
            } else if (resultado.permanent) {
                if (localRef) localRef.syncError = true;
            }
        }

        const eliminados = await dbSync.getDeleteQueue();
        for (const item of eliminados) {
            if (await api.deletePedido(item.id)) {
                await dbSync.removeDeleteFromQueue(item.id);
            }
        }

        saveState();
        renderAll();
    } finally {
        sincronizando = false;
        actualizarBadgeSincronizacion();
    }
}

// ---------------- MODAL ADMIN: CREAR, BORRAR DE BD Y EDITAR PRODUCTOS ----------------
function abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar) {
    if (btnGuardar) btnGuardar.style.display = 'block';
    const addSec = document.getElementById('adminAddProductSection');
    if (addSec) addSec.style.display = 'block';

    const inputApiKey = document.getElementById('adminWhatsappApiKey');
        if (inputApiKey) {
            inputApiKey.value = localStorage.getItem('fz_whatsapp_apikey') || '';
            inputApiKey.onchange = (e) => {
            localStorage.setItem('fz_whatsapp_apikey', e.target.value.trim());
        };

        // Crear botón para probar el envío automático a WhatsApp en cualquier momento
        if (!document.getElementById('btnTestWhatsappAuto')) {
            const btnTest = document.createElement('button');
            btnTest.type = 'button';
            btnTest.id = 'btnTestWhatsappAuto';
            btnTest.textContent = '🧪 Probar WhatsApp';
            btnTest.style.cssText = 'min-height:36px; padding:6px 12px; border-radius:8px; border:none; background:#25D366; color:#1B0836; font-weight:900; font-size:0.75rem; cursor:pointer;';
            inputApiKey.parentElement.appendChild(btnTest);

            btnTest.addEventListener('click', async () => {
                const key = inputApiKey.value.trim();
                localStorage.setItem('fz_whatsapp_apikey', key);
                const msgPrueba = construirMensajeWhatsApp(pedidos, obtenerFechaHoyStr() + ' (PRUEBA)');
                if (key) {
                    btnTest.disabled = true;
                    btnTest.textContent = 'Enviando...';
                    await api.enviarWhatsAppAutomaticoCloud(WHATSAPP_ADMIN_PHONE, msgPrueba, key);
                    btnTest.disabled = false;
                    btnTest.textContent = '🧪 Probar WhatsApp';
                    ui.mostrarToast('📲 Petición automática enviada a +57 3503129384');
                } else {
                    abrirWhatsAppConReporte(msgPrueba);
                }
            });
        }
    }

    listaDiv.innerHTML = '';

    const mapaCategorias = [
        { codigo: 'bowl', titulo: 'Bowls Base' },
        { codigo: 'acompanante', titulo: 'Acompañantes' },
        { codigo: 'topping', titulo: 'Toppings' },
        { codigo: 'bebida', titulo: 'Bebidas' }
    ];

    mapaCategorias.forEach((catInfo) => {
        const productosCat = catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === catInfo.codigo);
        if (productosCat.length === 0) return;

        const headerCat = document.createElement('div');
        headerCat.style.cssText = 'font-size:0.76rem; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; color:#1B0836; background:#F5A623; display:inline-block; padding:4px 10px; border-radius:99px; margin:10px 0 4px 0; align-self:flex-start;';
        headerCat.textContent = catInfo.titulo;
        listaDiv.appendChild(headerCat);

        productosCat.forEach((prod) => {
            const estaDisp = prod.disponible !== false;
            const row = document.createElement('div');
            row.className = 'admin-prod-row';
            row.innerHTML = `
                <div style="flex:1 1 180px; min-width:0;">
                    <div style="color:#2A0E4F; font-weight:800; font-size:1rem;">${ui.esc(prod.nombre)}</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
                        <button type="button" class="btn-toggle-stock" data-stock-id="${ui.esc(prod.id)}" data-disponible="${estaDisp ? 'true' : 'false'}"
                            style="min-height:34px; padding:4px 11px; border-radius:99px; border:none; font-weight:900; font-size:0.74rem; cursor:pointer; background:${estaDisp ? '#E6F4EA' : '#FDECEA'}; color:${estaDisp ? '#1E7E34' : '#D1272B'};">
                            ${estaDisp ? '🟢 Disponible' : '🔴 Agotado'}
                        </button>
                        <button type="button" class="btn-remove-prod" data-remove-id="${ui.esc(prod.id)}"
                            style="min-height:34px; padding:4px 11px; border-radius:99px; border:1px solid #F5C2C7; background:#FDECEA; color:#D1272B; font-weight:900; font-size:0.74rem; cursor:pointer;">
                            🗑️ Borrar de BD
                        </button>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="btn-step-minus">−500</button>
                    <div style="display:flex; align-items:center; justify-content:center; background:#FFFFFF; border-radius:11px; padding:6px 12px; border:2px solid #2A0E4F; min-width:118px;">
                        <span style="color:#2A0E4F; margin-right:4px; font-weight:900;">$</span>
                        <input type="number" min="100" step="100" data-id="${ui.esc(prod.id)}" value="${Number(prod.precio)}"
                            style="width:84px; text-align:center; border:none; background:transparent; font-size:16px; font-weight:900; color:#2A0E4F; outline:none;">
                    </div>
                    <button type="button" class="btn-step-plus">+500</button>
                </div>
            `;

            const input = row.querySelector('input');
            row.querySelector('.btn-step-minus').addEventListener('click', () => {
                input.value = Math.max(100, (Number(input.value) || 0) - 500);
            });
            row.querySelector('.btn-step-plus').addEventListener('click', () => {
                input.value = (Number(input.value) || 0) + 500;
            });

            const btnStock = row.querySelector('.btn-toggle-stock');
            btnStock.addEventListener('click', () => {
                const actual = btnStock.getAttribute('data-disponible') === 'true';
                const nuevoEstado = !actual;
                btnStock.setAttribute('data-disponible', nuevoEstado ? 'true' : 'false');
                btnStock.textContent = nuevoEstado ? '🟢 Disponible' : '🔴 Agotado';
                btnStock.style.background = nuevoEstado ? '#E6F4EA' : '#FDECEA';
                btnStock.style.color = nuevoEstado ? '#1E7E34' : '#D1272B';
            });

            const btnRemove = row.querySelector('.btn-remove-prod');
            btnRemove.addEventListener('click', () => {
                ui.confirmarAccion(`¿Eliminar definitivamente "${prod.nombre}" de la base de datos y del menú?`, async () => {
                    btnRemove.disabled = true;
                    btnRemove.textContent = 'Borrando...';

                    const { error } = await api.eliminarProductoAdmin(prod.id);
                    if (error) {
                        btnRemove.disabled = false;
                        btnRemove.textContent = '🗑️ Borrar de BD';
                        return ui.mostrarToast(`⚠️ ${error.message || 'Error al borrar en Supabase'}`);
                    }

                    catalogoMenu = catalogoMenu.filter((x) => x.id !== prod.id);
                    depurarSeleccionPorDisponibilidad();
                    saveState();
                    abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar);
                    renderAll();
                    ui.mostrarToast(`🗑️ "${prod.nombre}" eliminado de la base de datos y del front`);
                });
            });

            listaDiv.appendChild(row);
        });
    });

    modal.style.display = 'flex';
}

async function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    obtenerContenedorStack();
    await aplicarVistaPorRol();
    await dbSync.init();

    await verificarCorteAutomaticoMedianoche();

    await cargarCatalogoProductos();
    await sincronizarDesdeNubeMultiDispositivo();
    await sincronizarClientesConocidos();
    await actualizarBadgeSincronizacion();

    verificarCorteAutomaticoMedianoche();
    setInterval(verificarCorteAutomaticoMedianoche, 15000);
    setInterval(actualizarTemporizadoresYAlarmas, 1000);
    setInterval(() => {
        if (navigator.onLine) sincronizarDesdeNubeMultiDispositivo();
    }, 15000);

    api.suscribirCambiosRealtime(async (tabla) => {
        if (tabla === 'productos') await cargarCatalogoProductos();
        if (tabla === 'pedidos') await sincronizarDesdeNubeMultiDispositivo();
    });

    const tabCli = document.getElementById('tabRoleCliente');
    const tabAdm = document.getElementById('tabRoleAdmin');
    const formCli = document.getElementById('formLoginCliente');
    const formAdm = document.getElementById('formLoginAdminGate');
    const gateErr = document.getElementById('authGateError');

    tabCli?.addEventListener('click', () => {
        tabCli.classList.add('active');
        tabAdm.classList.remove('active');
        formCli.style.display = 'block';
        formAdm.style.display = 'none';
        if (gateErr) gateErr.style.display = 'none';
    });

    tabAdm?.addEventListener('click', () => {
        tabAdm.classList.add('active');
        tabCli.classList.remove('active');
        formAdm.style.display = 'block';
        formCli.style.display = 'none';
        if (gateErr) gateErr.style.display = 'none';
    });

    formCli?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await cargarConfiguracionClientes();
        const nombre = normalizarNombreCliente(document.getElementById('loginClienteNombre').value);
        const pin = document.getElementById('loginClienteCodigo').value.trim();

        if (!nombre) return;
        if (!configClientes.habilitado) {
            if (gateErr) {
                gateErr.textContent = '🌙 En este momento la recepción de pedidos para clientes está cerrada.';
                gateErr.style.display = 'block';
            }
            return;
        }
        if (pin !== String(configClientes.pin || CLIENT_ACCESS_PIN)) {
            if (gateErr) {
                gateErr.textContent = '🔒 Código PIN del local incorrecto. Solicita el PIN de hoy en caja.';
                gateErr.style.display = 'block';
            }
            return;
        }

        usuarioActual = { rol: 'cliente', nombre };
        localStorage.setItem('fz_usuario_actual', JSON.stringify(usuarioActual));
        registrarClienteEnCache(nombre);
        resetForm();
        await aplicarVistaPorRol();
        ui.mostrarToast(`¡Bienvenido(a), ${nombre}!`);
    });

    const searchInput = document.getElementById('searchOrdersInput');
    const btnClearSearch = document.getElementById('btnClearSearch');
    searchInput?.addEventListener('input', (e) => {
        textoBusquedaPedidos = e.target.value;
        if (btnClearSearch) {
            btnClearSearch.style.display = textoBusquedaPedidos ? 'inline-flex' : 'none';
        }
        renderAll();
    });
    btnClearSearch?.addEventListener('click', () => {
        textoBusquedaPedidos = '';
        if (searchInput) searchInput.value = '';
        btnClearSearch.style.display = 'none';
        renderAll();
    });

    document.getElementById('btnCloseWalletModal')?.addEventListener('click', () => {
        document.getElementById('walletPassModal').style.display = 'none';
    });
    document.getElementById('btnSaveWalletImage')?.addEventListener('click', async () => {
        const passEl = document.getElementById('walletPassCapture');
        if (!passEl) return;
        ui.mostrarToast('Guardando pase en tus imágenes...');
        const canvas = await html2canvas(passEl, { backgroundColor: null, scale: 2 });
        const link = document.createElement('a');
        link.download = `Pase_Frizzy_${Date.now().toString().slice(-4)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    const btnToggleAccess = document.getElementById('btnToggleClientAccess');
    const pinInputAdmin = document.getElementById('adminClientPinInput');
    if (pinInputAdmin) pinInputAdmin.value = configClientes.pin || '1234';
    if (btnToggleAccess) {
        const pintarEstadoAcceso = (abierto) => {
            btnToggleAccess.setAttribute('data-enabled', abierto ? 'true' : 'false');
            btnToggleAccess.textContent = abierto ? '🟢 Acceso Clientes: ABIERTO' : '🔴 Acceso Clientes: CERRADO';
            btnToggleAccess.style.background = abierto ? '#E6F4EA' : '#FDECEA';
            btnToggleAccess.style.color = abierto ? '#1E7E34' : '#D1272B';
        };
        pintarEstadoAcceso(configClientes.habilitado);
        btnToggleAccess.addEventListener('click', () => {
            const actual = btnToggleAccess.getAttribute('data-enabled') === 'true';
            pintarEstadoAcceso(!actual);
        });
    }

    formAdm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('gateAdminEmail').value.trim();
        const pass = document.getElementById('gateAdminPass').value;
        const btn = document.getElementById('btnSubmitGateAdmin');

        btn.disabled = true;
        btn.textContent = 'Verificando...';
        const { error } = await api.loginAdmin(email, pass);
        btn.disabled = false;
        btn.textContent = '🔓 Iniciar Sesión Admin';

        if (error) {
            if (gateErr) {
                gateErr.textContent = '🔒 Credenciales de Administrador inválidas.';
                gateErr.style.display = 'block';
            }
            return;
        }

        usuarioActual = { rol: 'admin', nombre: email };
        localStorage.setItem('fz_usuario_actual', JSON.stringify(usuarioActual));
        resetForm();
        await aplicarVistaPorRol();
        await sincronizarDesdeNubeMultiDispositivo();
        ui.mostrarToast('🔓 Sesión de Administrador activa');
    });

    document.getElementById('btnLogoutApp')?.addEventListener('click', async () => {
        await api.logoutAdmin();
        usuarioActual = null;
        localStorage.removeItem('fz_usuario_actual');
        resetForm();
        await aplicarVistaPorRol();
    });

    document.getElementById('btnRefreshCloud')?.addEventListener('click', async () => {
        ui.mostrarToast('🔄 Sincronizando con otros dispositivos...');
        await cargarCatalogoProductos();
        await sincronizarDesdeNubeMultiDispositivo();
        ui.mostrarToast('☁️ Dispositivos sincronizados');
    });

    document.getElementById('btnStopAlarm')?.addEventListener('click', () => {
        apartados.forEach((ap) => {
            if (ap.entregaProgramadaISO && new Date(ap.entregaProgramadaISO).getTime() <= Date.now()) {
                alarmasSilenciadas.add(ap.id);
            }
        });
        document.getElementById('alarmBanner').style.display = 'none';
        ui.mostrarToast('🔇 Alarma silenciada');
    });

    document.querySelectorAll('.timer-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.timer-chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            estado.apartadoMinutos = Number(chip.getAttribute('data-mins') || 0);
            estado.apartadoHoraExacta = '';
            const timeInput = document.getElementById('apartadoTimeInput');
            if (timeInput) timeInput.value = '';
            actualizarPreviewProgramador();
        });
    });

    document.getElementById('apartadoTimeInput')?.addEventListener('input', (e) => {
        estado.apartadoHoraExacta = e.target.value;
        if (estado.apartadoHoraExacta) {
            estado.apartadoMinutos = 0;
            document.querySelectorAll('.timer-chip').forEach((c) => c.classList.remove('active'));
        }
        actualizarPreviewProgramador();
    });

    document.getElementById('orderForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (usuarioActual?.rol === 'cliente') {
            procesarGuardado(construirPedido(true), { modoReset: 'completo', esApartado: true });
        } else {
            procesarGuardado(construirPedido(false), { modoReset: 'completo', esApartado: false });
        }
    });

    document.getElementById('btnGuardarYOtro')?.addEventListener('click', () => {
        procesarGuardado(construirPedido(false), { modoReset: 'mismoCliente', esApartado: false });
    });

    document.getElementById('btnApartar')?.addEventListener('click', () => {
        procesarGuardado(construirPedido(true), { modoReset: 'completo', esApartado: true });
    });

    document.querySelectorAll('.bill-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bill-chip').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const billVal = btn.getAttribute('data-bill');
            const inputRecibido = document.getElementById('cashReceivedInput');
            if (inputRecibido) {
                inputRecibido.value = billVal === 'exacto' ? String(estado.total) : billVal;
                actualizarCalculadoraEfectivo();
            }
        });
    });

    document.getElementById('cashReceivedInput')?.addEventListener('input', () => {
        document.querySelectorAll('.bill-chip').forEach((b) => b.classList.remove('active'));
        actualizarCalculadoraEfectivo();
    });

    document.getElementById('notas')?.addEventListener('input', (e) => {
        ui.renderQuickNotes('quickNotesGrid', NOTAS_RAPIDAS, e.target.value, alternarNotaRapida);
    });

    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        inputNombre.addEventListener('input', (e) => {
            if (estado.clienteBloqueado || usuarioActual?.rol === 'cliente') return;
            calcularTotal();
            const top3 = obtenerTop3Clientes(e.target.value);
            ui.renderSugerenciasClientes(top3, (nombreElegido) => {
                inputNombre.value = nombreElegido;
                calcularTotal();
                verificarFidelidadCliente(nombreElegido);
            });
        });

        inputNombre.addEventListener('blur', async (e) => {
            setTimeout(() => ui.renderSugerenciasClientes([], () => {}), 150);
            if (estado.clienteBloqueado || usuarioActual?.rol === 'cliente') return;
            const raw = e.target.value.trim();
            if (!raw) return;
            const nombreNorm = normalizarNombreCliente(raw);
            e.target.value = nombreNorm;
            await verificarFidelidadCliente(nombreNorm);
        });
    }

    const modal = document.getElementById('adminModal');
    const listaDiv = document.getElementById('adminListaProductos');
    const btnGuardarPrecios = document.getElementById('btnGuardarPrecios');

    document.getElementById('btnAdmin')?.addEventListener('click', () => {
        abrirEditorPreciosEnModal(modal, listaDiv, btnGuardarPrecios);
    });

    document.getElementById('btnCerrarAdmin')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnCrearProducto')?.addEventListener('click', async () => {
        const nomIn = document.getElementById('newProdNombre');
        const catIn = document.getElementById('newProdCat');
        const preIn = document.getElementById('newProdPrecio');

        const nombre = (nomIn?.value || '').trim();
        const categoria = normalizarCategoria(catIn?.value || 'topping');
        const precio = Number(preIn?.value || 0);

        if (!nombre || !Number.isFinite(precio) || precio <= 0) {
            return ui.mostrarToast('⚠️ Escribe un nombre y un precio mayor a $0');
        }

        const idSlug = limpiarParaBusqueda(nombre).replace(/[^a-z0-9]/g, '') || ('prod_' + Date.now());
        const btn = document.getElementById('btnCrearProducto');
        btn.disabled = true;
        btn.textContent = 'Creando...';

        const { error } = await api.crearProductoAdmin({ id: idSlug, nombre, categoria, precio });
        btn.disabled = false;
        btn.textContent = '➕ Crear y Sincronizar Producto';

        if (error) {
            return ui.mostrarToast('⚠️ Error guardando en Supabase.');
        }

        const existente = catalogoMenu.find((x) => x.id === idSlug);
        if (existente) {
            existente.nombre = nombre;
            existente.categoria = categoria;
            existente.precio = precio;
            existente.disponible = true;
        } else {
            catalogoMenu.push({ id: idSlug, nombre, precio, categoria, disponible: true });
        }

        if (nomIn) nomIn.value = '';
        if (preIn) preIn.value = '';
        saveState();
        abrirEditorPreciosEnModal(modal, listaDiv, btnGuardarPrecios);
        renderAll();
        ui.mostrarToast(`✅ Producto "${nombre}" agregado a la base de datos y al front`);
    });

    btnGuardarPrecios?.addEventListener('click', async () => {
        const nuevoPinCli = (document.getElementById('adminClientPinInput')?.value || '1234').trim();
        const nuevoAccesoCli = document.getElementById('btnToggleClientAccess')?.getAttribute('data-enabled') !== 'false';
        const chatIdsTelegram = (document.getElementById('adminWhatsappApiKey')?.value || '7412641484').trim();

        configClientes = { pin: nuevoPinCli, habilitado: nuevoAccesoCli };
        localStorage.setItem('fz_config_clientes', JSON.stringify(configClientes));
        localStorage.setItem('fz_whatsapp_apikey', chatIdsTelegram);

        if (navigator.onLine && typeof api.guardarConfiguracionSistema === 'function') {
            await api.guardarConfiguracionSistema({
                clientePin: nuevoPinCli,
                clientesHabilitados: nuevoAccesoCli,
                telegramChatIds: chatIdsTelegram
            });
        }
        const inputs = listaDiv.querySelectorAll('input[data-id]');
        btnGuardarPrecios.disabled = true;
        btnGuardarPrecios.textContent = 'Sincronizando...';
        let fallos = 0;

        const inputApiKey = document.getElementById('adminWhatsappApiKey');
        if (inputApiKey) {
            localStorage.setItem('fz_whatsapp_apikey', inputApiKey.value.trim());
        }

        for (const inpt of inputs) {
            const val = Number(inpt.value);
            if (!Number.isFinite(val) || val <= 0) {
                btnGuardarPrecios.disabled = false;
                btnGuardarPrecios.textContent = 'Guardar Cambios en Nube';
                return ui.mostrarToast('⚠️ Todos los precios deben ser mayores a $0');
            }
        }

        for (const inpt of inputs) {
            const id = inpt.getAttribute('data-id');
            const nuevoPrecio = Number(inpt.value);
            const btnStock = listaDiv.querySelector(`.btn-toggle-stock[data-stock-id="${id}"]`);
            const nuevaDisp = btnStock ? btnStock.getAttribute('data-disponible') === 'true' : true;
            const ref = catalogoMenu.find((x) => x.id === id);

            if (ref) {
                const cambioPrecio = ref.precio !== nuevoPrecio;
                const cambioDisp = (ref.disponible !== false) !== nuevaDisp;
                ref.disponible = nuevaDisp;

                if (cambioPrecio || cambioDisp) {
                    const { error } = await api.actualizarProductoAdmin(id, {
                        precio_actual: nuevoPrecio,
                        disponible: nuevaDisp
                    });
                    if (error) fallos++;
                    else ref.precio = nuevoPrecio;
                }
            }
        }

        saveState();
        depurarSeleccionPorDisponibilidad();
        modal.style.display = 'none';
        btnGuardarPrecios.disabled = false;
        btnGuardarPrecios.textContent = 'Guardar Cambios en Nube';
        renderAll();
        ui.mostrarToast(fallos === 0 ? '✅ Menú sincronizado en todos los dispositivos' : `⚠️ Guardado con ${fallos} errores`);
    });

    document.getElementById('btnWhatsapp')?.addEventListener('click', async () => {
        if (pedidos.length === 0) {
            const ultimoAuto = leerStorageSeguro('fz_ultimo_cierre_auto', null);
            if (ultimoAuto && ultimoAuto.resumen) {
                abrirWhatsAppConReporte(ultimoAuto.resumen);
                return;
            }
            return ui.mostrarToast('No hay pedidos hoy para reportar');
        }
        const msg = construirMensajeWhatsApp(pedidos, obtenerFechaHoyStr());
        const apiKeyGuardada = localStorage.getItem('fz_whatsapp_apikey') || '';
        if (apiKeyGuardada && navigator.onLine && typeof api.enviarWhatsAppAutomaticoCloud === 'function') {
            await api.enviarWhatsAppAutomaticoCloud(WHATSAPP_ADMIN_PHONE, msg, apiKeyGuardada);
            ui.mostrarToast('📲 Reporte enviado automáticamente a tu WhatsApp (+57 3503129384)');
        } else {
            abrirWhatsAppConReporte(msg);
        }
    });

    document.getElementById('btnExcel')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('No hay pedidos');
        const f = obtenerFechaHoyStr();

        const peds = XLSX.utils.json_to_sheet(pedidos.map((p) => ({
            'Fecha': p.fechaLocal || f,
            'Hora': p.hora,
            'Cliente': p.nombre,
            'Bowl': p.bowl,
            'Extras': [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])].map((i) => `${i.nombre} x${i.cantidad}`).join(', '),
            'Notas': p.notas,
            'Pago': p.pago,
            'Total': p.total
        })));
        peds['!cols'] = [{wch:12},{wch:8},{wch:18},{wch:12},{wch:40},{wch:24},{wch:12},{wch:12}];

        const totalDia = pedidos.reduce((s, p) => s + p.total, 0);
        const personasUnicas = new Set(pedidos.map((p) => String(p.nombre || '').toLowerCase().trim()).filter(Boolean)).size;

        const resArr = [
            { Concepto: 'Fecha reporte', Valor: f },
            { Concepto: 'Total pedidos (bowls)', Valor: pedidos.length },
            { Concepto: 'Personas atendidas (clientes únicos)', Valor: personasUnicas },
            { Concepto: 'Total ventas', Valor: totalDia },
            { Concepto: '', Valor: '' }
        ];
        PAGOS.forEach((pg) => {
            const d = pedidos.filter((p) => p.pago === pg.nombre);
            resArr.push(
                { Concepto: `${pg.nombre} pedidos`, Valor: d.length },
                { Concepto: `${pg.nombre} total`, Valor: d.reduce((s, p) => s + p.total, 0) }
            );
        });

        const conteo = {};
        pedidos.forEach((p) => {
            if (p.bowlId && p.bowlId !== 'ninguno') conteo[p.bowl] = (conteo[p.bowl] || 0) + 1;
            [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])].forEach((i) => {
                conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad;
            });
        });
        const rnk = XLSX.utils.json_to_sheet(Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ Producto: n, Vendidos: c })));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resArr, { skipHeader: true }), 'Resumen');
        XLSX.utils.book_append_sheet(wb, peds, 'Pedidos');
        XLSX.utils.book_append_sheet(wb, rnk, 'Ranking');
        XLSX.writeFile(wb, `Frizzy_${f.replaceAll('/', '-')}.xlsx`);
    });

    document.getElementById('btnImagen')?.addEventListener('click', exportarImagenDashboardEjecutivo);

    document.getElementById('btnCerrar')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('La caja ya está en cero');
        ui.confirmarAccion('¿Cerrar el día y reiniciar la caja en todos los dispositivos? (El reporte se envía en segundo plano y los datos quedan en el Dashboard)', async () => {
            const msg = construirMensajeWhatsApp(pedidos, obtenerFechaHoyStr());
            const apiKeyGuardada = localStorage.getItem('fz_whatsapp_apikey') || '';

            // 1. Subir cualquier pedido pendiente antes de cerrar
            if (navigator.onLine) {
                await sincronizarCola();
                // 2. Marcar como 'cerrado' en Supabase y disparar WhatsApp desde el servidor
                await api.cerrarJornadaServidor(apiKeyGuardada);
                if (apiKeyGuardada) {
                    await api.enviarWhatsAppAutomaticoCloud(WHATSAPP_ADMIN_PHONE, msg, apiKeyGuardada);
                }
            }

            // 3. Reiniciar inmediatamente la caja local a 0 (sin abrir links externos)
            pedidos = [];
            colaCartasVerdes = [];
            filtroPago = null;
            fechaJornadaActiva = obtenerFechaHoyStr();
            saveState();
            renderAll();
            renderizarPilaNotificacionesVerdes();
            ui.mostrarToast('✅ Día cerrado y caja reiniciada en todos los dispositivos.');
        });
    });
}

window.addEventListener('online', () => {
    actualizarBadgeSincronizacion();
    cargarCatalogoProductos();
    sincronizarDesdeNubeMultiDispositivo();
    sincronizarClientesConocidos();
});
window.addEventListener('offline', actualizarBadgeSincronizacion);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        verificarCorteAutomaticoMedianoche();
        if (navigator.onLine) sincronizarDesdeNubeMultiDispositivo();
    }
});
document.addEventListener('DOMContentLoaded', init);