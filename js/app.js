import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import {
    api,
    normalizarNombreCliente,
    obtenerFechaBogotaISO,
    formatearHoraBogota,
    formatearFechaBogota
} from './api.js';

// Catálogo base inicial (se actualiza y amplía dinámicamente desde Supabase)
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

const PAGOS = [{ id: 'efectivo', nombre: 'Efectivo' }, { id: 'llave', nombre: 'Llave' }, { id: 'nequi', nombre: 'Nequi' }];

const COMBOS_RAPIDOS = [
    { id: 'combo_papas_full', icono: '🔥', nombre: 'Papas Full', bowl: 'papas', acomp: { salchicha: 1 }, toppings: { queso: 1, papachongo: 1 }, bebidas: {} },
    { id: 'combo_yuca_esp', icono: '⚡', nombre: 'Yuca + Chorizo', bowl: 'yuca', acomp: { chorizo: 1 }, toppings: { queso: 1 }, bebidas: {} },
    { id: 'combo_papas_vaso', icono: '🥤', nombre: 'Papas + Salchicha + Vaso', bowl: 'papas', acomp: { salchicha: 1 }, toppings: {}, bebidas: { vasito: 1 } },
    { id: 'combo_repetir_ultimo', icono: '🔄', nombre: 'Repetir Último Bowl', esRepetir: true }
];

const NOTAS_RAPIDAS = ['Sin cebolla', 'Para llevar', 'Salsas aparte', 'Sin salsas', 'Bien dorado', 'Extra servilletas'];

const WHATSAPP_ADMIN_PHONE = '573503129384';
// PIN para que tus clientes autorizados puedan entrar a armar y apartar su pedido sin que extraños con el link entren
const CLIENT_ACCESS_PIN = '1234';

function leerStorageSeguro(clave, defecto = []) {
    try {
        const raw = localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : defecto;
    } catch (e) {
        return defecto;
    }
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

let usuarioActual = leerStorageSeguro('fz_usuario_actual', null); // { rol: 'admin'|'cliente', nombre: '...' }
let pedidos = leerStorageSeguro('fz_pedidos', []);
let apartados = leerStorageSeguro('fz_apartados', []);
let clientesConocidos = leerStorageSeguro('fz_clientes_cache', []);
let fechaJornadaActiva = localStorage.getItem('fz_fecha_jornada') || obtenerFechaHoyStr();
let filtroPago = null;
let sincronizando = false;
let guardandoEnCurso = false;
let alarmasSilenciadas = new Set();
let audioCtx = null;

// Helpers dinámicos por categoría para soportar agregar/quitar productos en vivo
const getBowls = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'bowl');
const getAcomp = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'acompanante');
const getToppings = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'topping');
const getBebidas = () => catalogoMenu.filter((p) => normalizarCategoria(p.categoria) === 'bebida');

function saveState() {
    localStorage.setItem('fz_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('fz_apartados', JSON.stringify(apartados));
    localStorage.setItem('fz_catalogo_menu', JSON.stringify(catalogoMenu));
    localStorage.setItem('fz_fecha_jornada', fechaJornadaActiva);
}

// ---------------- SONIDO DE ALARMA WEB AUDIO API ----------------
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

// Revisa cada segundo los temporizadores de los pedidos apartados y dispara la alarma cuando llega la hora
function actualizarTemporizadoresYAlarmas() {
    // 1. Actualizar etiquetas de cuenta regresiva en las tarjetas visibles
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

    // 2. EXCLUSIVO ADMINISTRADOR: Los clientes NUNCA escuchan la alarma ni ven el banner rojo
    if (!usuarioActual || usuarioActual.rol !== 'admin') {
        if (banner) banner.style.display = 'none';
        return;
    }

    // 3. Verificar si algún apartado ya cumplió su hora de entrega (Solo Admin)
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

// Calcula la fecha/hora objetivo según el temporizador o la hora específica seleccionada
function calcularEntregaProgramadaISO() {
    const ahora = new Date();
    if (estado.apartadoHoraExacta) {
        const [hh, mm] = estado.apartadoHoraExacta.split(':').map(Number);
        if (Number.isFinite(hh) && Number.isFinite(mm)) {
            const fechaHoyBogota = obtenerFechaBogotaISO(ahora).slice(0, 10);
            const isoCandidato = `${fechaHoyBogota}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-05:00`;
            const dCandidato = new Date(isoCandidato);
            // Si la hora elegida ya pasó hoy, programar para mañana a esa hora
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
    if (!iso) {
        badge.textContent = 'Sin alarma (Solo apartar)';
    } else {
        badge.textContent = `🔔 Alarma a las ${formatearHoraBogota(iso)}`;
    }
}

// ---------------- GESTIÓN DE SESIÓN Y ROLES (ADMIN vs CLIENTE) ----------------
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

    // Si aún no hay usuario en memoria local, verificar si existe sesión activa de Supabase Auth (ej. al volver del Dashboard)
    if (!usuarioActual) {
        const sbSession = await api.getSession();
        if (sbSession) {
            usuarioActual = { rol: 'admin', nombre: sbSession.user.email || 'Administrador' };
            localStorage.setItem('fz_usuario_actual', JSON.stringify(usuarioActual));
        }
    }

    // Solo mostrar el modal si definitivamente no hay sesión iniciada
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

// ---------------- SINCRONIZACIÓN MULTI-DISPOSITIVO EN TIEMPO REAL ----------------
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
                    nombre: ref ? ref.nombre : d.producto_id,
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
        // Primero subir cualquier pedido local que esté en la cola de IndexedDB
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

        // Preservar los pedidos creados offline en este dispositivo que aún estén en cola
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
        saveState();
        renderAll();
    } catch (err) {
        console.warn('Error sincronizando dispositivos:', err);
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

// ---------------- WHATSAPP Y CORTE DE MEDIANOCHE ----------------
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

function verificarCorteAutomaticoMedianoche() {
    const hoyStr = obtenerFechaHoyStr();
    const pedidosDiaAnterior = pedidos.filter((p) => p.fechaLocal && p.fechaLocal !== hoyStr);

    if (fechaJornadaActiva !== hoyStr || pedidosDiaAnterior.length > 0) {
        if (pedidos.length > 0) {
            const listaParaReporte = pedidosDiaAnterior.length > 0 ? pedidosDiaAnterior : [...pedidos];
            const fechaReporte = listaParaReporte[0]?.fechaLocal || fechaJornadaActiva;
            const resumenTxt = construirMensajeWhatsApp(listaParaReporte, fechaReporte);

            localStorage.setItem('fz_ultimo_cierre_auto', JSON.stringify({
                fecha: fechaReporte,
                resumen: resumenTxt,
                cerradoEn: obtenerFechaBogotaISO()
            }));

            pedidos = pedidos.filter((p) => p.fechaLocal === hoyStr && pedidosDiaAnterior.length > 0);
            fechaJornadaActiva = hoyStr;
            saveState();
            renderAll();

            if (usuarioActual?.rol === 'admin') {
                const modalAuto = document.getElementById('autoCloseModal');
                const textoAuto = document.getElementById('autoCloseText');
                const btnWaAuto = document.getElementById('btnEnviarWhatsAppAuto');
                const btnCerrarAuto = document.getElementById('btnCerrarAutoModal');

                if (modalAuto && textoAuto && btnWaAuto) {
                    textoAuto.textContent = resumenTxt.replace(/\*/g, '');
                    modalAuto.style.display = 'flex';
                    btnWaAuto.onclick = () => {
                        abrirWhatsAppConReporte(resumenTxt);
                        modalAuto.style.display = 'none';
                    };
                    if (btnCerrarAuto) {
                        btnCerrarAuto.onclick = () => { modalAuto.style.display = 'none'; };
                    }
                }
            }
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

// Carga el catálogo completo de productos desde Supabase (incluyendo productos nuevos creados en el front)
async function cargarCatalogoProductos() {
    // Normalizar también lo que ya esté guardado en caché local
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

    document.getElementById('orderForm').reset();
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

    // Filtrar pedidos según privilegio de usuario (Admin ve todo; Cliente solo ve lo suyo)
    let pedidosVisibles = esAdmin
        ? pedidos
        : pedidos.filter((p) => String(p.nombre || '').toLowerCase() === nombreClienteActual);

    if (esAdmin && filtroPago) {
        pedidosVisibles = pedidosVisibles.filter((p) => (p.pago || '').toLowerCase() === filtroPago.toLowerCase());
    }

    const apartadosVisibles = esAdmin
        ? apartados
        : apartados.filter((a) => String(a.nombre || '').toLowerCase() === nombreClienteActual);

    ui.renderOrders(pedidosVisibles, 'ordersList', false, {
        onToggle: (id) => {
            const p = pedidos.find((x) => x.id === id);
            if (p) {
                p.abierto = !p.abierto;
                saveState();
                renderAll();
            }
        },
        onNewForClient: (pedidoBase) => {
            const pagoObj = PAGOS.find((pg) => pg.nombre.toLowerCase() === String(pedidoBase.pago || '').toLowerCase());
            prepararSiguienteBowlMismoCliente(pedidoBase.nombre, pagoObj ? pagoObj.id : 'efectivo');
            ui.mostrarToast(`🔒 Nombre fijado para agregar otro bowl a ${pedidoBase.nombre}`);
        },
        onDelete: (id) => {
            ui.confirmarAccion('¿Eliminar este pedido de la caja y de todos los dispositivos?', async () => {
                pedidos = pedidos.filter((x) => x.id !== id);
                saveState();
                renderAll();
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
        onDelete: (id) => {
            ui.confirmarAccion('¿Cancelar y eliminar este pedido apartado?', async () => {
                apartados = apartados.filter((x) => x.id !== id);
                alarmasSilenciadas.add(id);
                saveState();
                renderAll();
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
            if (bowlObj) itemsArray.push({ id: bowlObj.id, precio: bowlObj.precio, cantidad: 1 });
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

        if (esApartado) {
            apartados.forEach((a) => { a.abierto = false; });
            pedido.abierto = true;
            apartados.unshift(pedido);
        } else {
            pedidos.forEach((p) => { p.abierto = false; });
            pedido.abierto = true;
            pedidos.unshift(pedido);
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

// ---------------- MODAL ADMIN: AGREGAR, QUITAR Y EDITAR PRODUCTOS ----------------
function abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar) {
    if (btnGuardar) btnGuardar.style.display = 'block';
    const addSec = document.getElementById('adminAddProductSection');
    if (addSec) addSec.style.display = 'block';
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
            row.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; background:#FFFAEF; border:1px solid #E9DEC0; border-radius:12px; padding:10px 12px; margin-bottom:6px; gap:8px;';
            row.innerHTML = `
                <div style="flex:1 1 130px; min-width:0;">
                    <div style="color:#2A0E4F; font-weight:800; font-size:0.95rem;">${ui.esc(prod.nombre)}</div>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                        <button type="button" class="btn-toggle-stock" data-stock-id="${ui.esc(prod.id)}" data-disponible="${estaDisp ? 'true' : 'false'}"
                            style="min-height:32px; padding:3px 9px; border-radius:99px; border:none; font-weight:900; font-size:0.72rem; cursor:pointer; background:${estaDisp ? '#E6F4EA' : '#FDECEA'}; color:${estaDisp ? '#1E7E34' : '#D1272B'};">
                            ${estaDisp ? '🟢 Disponible' : '🔴 Agotado'}
                        </button>
                        <button type="button" class="btn-remove-prod" data-remove-id="${ui.esc(prod.id)}"
                            style="min-height:32px; padding:3px 9px; border-radius:99px; border:1px solid #F5C2C7; background:#FDECEA; color:#D1272B; font-weight:900; font-size:0.72rem; cursor:pointer;">
                            🗑️ Quitar
                        </button>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="btn-step-minus" style="width:38px; height:38px; border-radius:8px; border:1px solid #D3C4A3; background:#FFF; color:#2A0E4F; font-weight:900; cursor:pointer;">−500</button>
                    <div style="display:flex; align-items:center; background:#FFFFFF; border-radius:8px; padding:6px 10px; border:2px solid #2A0E4F;">
                        <span style="color:#2A0E4F; margin-right:4px; font-weight:900;">$</span>
                        <input type="number" min="100" step="100" data-id="${ui.esc(prod.id)}" value="${Number(prod.precio)}"
                            style="width:76px; text-align:right; border:none; background:transparent; font-size:16px; font-weight:800; color:#2A0E4F; outline:none;">
                    </div>
                    <button type="button" class="btn-step-plus" style="width:38px; height:38px; border-radius:8px; border:none; background:#F5A623; color:#1B0836; font-weight:900; cursor:pointer;">+500</button>
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

            // Botón para quitar producto del menú y sincronizar con Supabase
            row.querySelector('.btn-remove-prod').addEventListener('click', () => {
                ui.confirmarAccion(`¿Quitar "${prod.nombre}" del menú en todos los dispositivos?`, async () => {
                    const { error } = await api.eliminarProductoAdmin(prod.id);
                    if (error) {
                        return ui.mostrarToast('⚠️ Error al quitar en la nube. Verifica tu sesión Admin.');
                    }
                    catalogoMenu = catalogoMenu.filter((x) => x.id !== prod.id);
                    depurarSeleccionPorDisponibilidad();
                    saveState();
                    abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar);
                    renderAll();
                    ui.mostrarToast(`🗑️ ${prod.nombre} eliminado del menú`);
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

    // 1. Aplicar rol y ocultar login de inmediato sin esperar la red
    await aplicarVistaPorRol();

    // 2. Inicializar base de datos local y sincronizar nube en segundo plano
    await dbSync.init();
    await cargarCatalogoProductos();
    await sincronizarDesdeNubeMultiDispositivo();
    await sincronizarClientesConocidos();
    await actualizarBadgeSincronizacion();

    verificarCorteAutomaticoMedianoche();
    setInterval(verificarCorteAutomaticoMedianoche, 15000);
    // Reloj de 1 segundo para actualizar temporizadores de apartados y disparar alarmas
    setInterval(actualizarTemporizadoresYAlarmas, 1000);
    // Respaldo de sincronización multi-dispositivo cada 20 segundos
    setInterval(() => {
        if (navigator.onLine) sincronizarDesdeNubeMultiDispositivo();
    }, 20000);

    // Suscripción en tiempo real a cambios de otros dispositivos (Supabase Realtime)
    api.suscribirCambiosRealtime(async (tabla) => {
        if (tabla === 'productos') await cargarCatalogoProductos();
        if (tabla === 'pedidos') await sincronizarDesdeNubeMultiDispositivo();
    });

    // Eventos del Login Inicial (Cliente vs Administrador)
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
        const nombre = normalizarNombreCliente(document.getElementById('loginClienteNombre').value);
        const pin = document.getElementById('loginClienteCodigo').value.trim();

        if (!nombre) return;
        if (pin !== CLIENT_ACCESS_PIN) {
            if (gateErr) {
                gateErr.textContent = '🔒 Código PIN del local incorrecto. Solicítalo en caja.';
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

    // Silenciar alarma de apartados
    document.getElementById('btnStopAlarm')?.addEventListener('click', () => {
        apartados.forEach((ap) => {
            if (ap.entregaProgramadaISO && new Date(ap.entregaProgramadaISO).getTime() <= Date.now()) {
                alarmasSilenciadas.add(ap.id);
            }
        });
        document.getElementById('alarmBanner').style.display = 'none';
        ui.mostrarToast('🔇 Alarma silenciada');
    });

    // Programador de Temporizador y Hora Específica para Apartados
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

    // Guardado y Apartado
    document.getElementById('orderForm').addEventListener('submit', (e) => {
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

    document.getElementById('btnApartar').addEventListener('click', () => {
        procesarGuardado(construirPedido(true), { modoReset: 'completo', esApartado: true });
    });

    // Calculadora de devuelta
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

    // Modal Administrador: Crear, Quitar y Actualizar Productos
    const modal = document.getElementById('adminModal');
    const listaDiv = document.getElementById('adminListaProductos');
    const btnGuardarPrecios = document.getElementById('btnGuardarPrecios');

    document.getElementById('btnAdmin')?.addEventListener('click', () => {
        abrirEditorPreciosEnModal(modal, listaDiv, btnGuardarPrecios);
    });

    document.getElementById('btnCerrarAdmin')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Crear nuevo producto desde el Front
    document.getElementById('btnCrearProducto')?.addEventListener('click', async () => {
        const nomIn = document.getElementById('newProdNombre');
        const catIn = document.getElementById('newProdCat');
        const preIn = document.getElementById('newProdPrecio');

        const nombre = (nomIn?.value || '').trim();
        const categoria = catIn?.value || 'topping';
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
            return ui.mostrarToast('⚠️ Error guardando en Supabase. Verifica tu sesión Admin.');
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
        ui.mostrarToast(`✅ Producto "${nombre}" agregado al menú`);
    });

    btnGuardarPrecios?.addEventListener('click', async () => {
        const inputs = listaDiv.querySelectorAll('input[data-id]');
        btnGuardarPrecios.disabled = true;
        btnGuardarPrecios.textContent = 'Sincronizando...';
        let fallos = 0;

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

    document.getElementById('btnWhatsapp')?.addEventListener('click', () => {
        if (pedidos.length === 0) {
            const ultimoAuto = leerStorageSeguro('fz_ultimo_cierre_auto', null);
            if (ultimoAuto && ultimoAuto.resumen) {
                abrirWhatsAppConReporte(ultimoAuto.resumen);
                return;
            }
            return ui.mostrarToast('No hay pedidos hoy para reportar');
        }
        const msg = construirMensajeWhatsApp(pedidos, obtenerFechaHoyStr());
        abrirWhatsAppConReporte(msg);
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

    document.getElementById('btnImagen')?.addEventListener('click', () => {
        html2canvas(document.getElementById('summaryCapture'), { backgroundColor: '#F7EFDD', scale: 2 }).then((c) => {
            const link = document.createElement('a');
            link.download = `Frizzy_${obtenerFechaHoyStr().replaceAll('/', '-')}.png`;
            link.href = c.toDataURL();
            link.click();
        });
    });

    document.getElementById('btnCerrar')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('No hay ventas registradas para cerrar');
        ui.confirmarAccion('¿Cerrar el día, enviar resumen a WhatsApp y limpiar las ventas locales? (Los apartados se conservarán)', () => {
            const msg = construirMensajeWhatsApp(pedidos, obtenerFechaHoyStr());
            pedidos = [];
            fechaJornadaActiva = obtenerFechaHoyStr();
            saveState();
            renderAll();
            ui.mostrarToast('Día cerrado correctamente.');
            abrirWhatsAppConReporte(msg);
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