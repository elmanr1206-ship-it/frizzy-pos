import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api, normalizarNombreCliente } from './api.js';

const BOWLS = [{id:'papas', nombre:'Papas', precio:10000, cat:'Bowls Base', disponible:true}, {id:'yuca', nombre:'Yuca', precio:8000, cat:'Bowls Base', disponible:true}];
const ACOMPANANTES = [{id:'salchicha', nombre:'Salchicha', precio:3000, cat:'Acompañantes', disponible:true}, {id:'chorizo', nombre:'Chorizo', precio:5000, cat:'Acompañantes', disponible:true}, {id:'pollo', nombre:'Pollo (Nuggets)', precio:4000, cat:'Acompañantes', disponible:true}, {id:'carne', nombre:'Carne', precio:5000, cat:'Acompañantes', disponible:true}];
const TOPPINGS = [{id:'papachongo', nombre:'Papa Chongo', precio:1000, cat:'Toppings', disponible:true}, {id:'lechuga', nombre:'Lechuga', precio:500, cat:'Toppings', disponible:true}, {id:'picodegallo', nombre:'Pico de Gallo', precio:1000, cat:'Toppings', disponible:true}, {id:'queso', nombre:'Queso', precio:2000, cat:'Toppings', disponible:true}, {id:'tocineta', nombre:'Salsa de Tocineta', precio:2000, cat:'Toppings', disponible:true}];
const BEBIDAS = [{id:'vasito', nombre:'Vasito', precio:1500, cat:'Bebidas', disponible:true}];
const PAGOS = [{id:'efectivo', nombre:'Efectivo'}, {id:'llave', nombre:'Llave'}, {id:'nequi', nombre:'Nequi'}];
const TODO_EL_MENU = [...BOWLS, ...ACOMPANANTES, ...TOPPINGS, ...BEBIDAS];

// IDEA 2: Definición de Combos Rápidos de 1-Toque
const COMBOS_RAPIDOS = [
    { id: 'combo_papas_full', icono: '🔥', nombre: 'Papas Full', bowl: 'papas', acomp: { salchicha: 1 }, toppings: { queso: 1, papachongo: 1 }, bebidas: {} },
    { id: 'combo_yuca_esp', icono: '⚡', nombre: 'Yuca + Chorizo', bowl: 'yuca', acomp: { chorizo: 1 }, toppings: { queso: 1 }, bebidas: {} },
    { id: 'combo_papas_vaso', icono: '🥤', nombre: 'Papas + Salchicha + Vaso', bowl: 'papas', acomp: { salchicha: 1 }, toppings: {}, bebidas: { vasito: 1 } },
    { id: 'combo_repetir_ultimo', icono: '🔄', nombre: 'Repetir Último Bowl', esRepetir: true }
];

// IDEA 4: Chips Táctiles de Notas Rápidas
const NOTAS_RAPIDAS = ['Sin cebolla', 'Para llevar', 'Salsas aparte', 'Sin salsas', 'Bien dorado', 'Extra servilletas'];

const WHATSAPP_ADMIN_PHONE = '3503129384';

function leerStorageSeguro(clave, defecto = []) {
    try {
        const raw = localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : defecto;
    } catch (e) {
        console.warn(`Error leyendo ${clave} en localStorage:`, e);
        return defecto;
    }
}

function obtenerFechaHoyStr() {
    return new Date().toLocaleDateString('es-CO');
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

let estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0, premioFidelidad: false, clienteBloqueado: false };
let pedidos = leerStorageSeguro('fz_pedidos', []);
let apartados = leerStorageSeguro('fz_apartados', []);
let clientesConocidos = leerStorageSeguro('fz_clientes_cache', []);
let fechaJornadaActiva = localStorage.getItem('fz_fecha_jornada') || obtenerFechaHoyStr();
let filtroPago = null;
let sincronizando = false;
let guardandoEnCurso = false;

function saveState() {
    localStorage.setItem('fz_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('fz_apartados', JSON.stringify(apartados));
    localStorage.setItem('fz_fecha_jornada', fechaJornadaActiva);
}

// IDEA 1: Lógica de la Calculadora de Devuelta en Efectivo
function actualizarCalculadoraEfectivo() {
    const panel = document.getElementById('cashCalcPanel');
    const display = document.getElementById('cashChangeDisplay');
    const inputRecibido = document.getElementById('cashReceivedInput');
    if (!panel || !display || !inputRecibido) return;

    if (estado.pago !== 'efectivo' || estado.total <= 0) {
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

// IDEA 2: Aplicar un Combo Rápido verificando disponibilidad
function aplicarComboRapido(combo) {
    if (combo.esRepetir) {
        if (pedidos.length === 0) {
            return ui.mostrarToast('Aún no hay un pedido anterior hoy para repetir');
        }
        const ultimo = pedidos[0];
        const nuevoBowl = ultimo.bowlId && ultimo.bowlId !== 'ninguno' ? ultimo.bowlId : null;
        if (nuevoBowl) {
            const refBowl = BOWLS.find((b) => b.id === nuevoBowl);
            if (refBowl && refBowl.disponible === false) {
                return ui.mostrarToast(`🚫 No se puede repetir: ${refBowl.nombre} está agotado`);
            }
        }
        estado.bowl = nuevoBowl;
        estado.acomp = {};
        estado.toppings = {};
        estado.bebidas = {};

        (ultimo.acompDetalle || []).forEach((i) => {
            const ref = ACOMPANANTES.find((x) => x.id === i.id);
            if (ref && ref.disponible !== false) estado.acomp[i.id] = i.cantidad;
        });
        (ultimo.toppingDetalle || []).forEach((i) => {
            const ref = TOPPINGS.find((x) => x.id === i.id);
            if (ref && ref.disponible !== false) estado.toppings[i.id] = i.cantidad;
        });
        (ultimo.bebidaDetalle || []).forEach((i) => {
            const ref = BEBIDAS.find((x) => x.id === i.id);
            if (ref && ref.disponible !== false) estado.bebidas[i.id] = i.cantidad;
        });

        renderAll();
        return ui.mostrarToast('🔄 Último bowl cargado en el formulario');
    }

    const bowlRef = BOWLS.find((b) => b.id === combo.bowl);
    if (bowlRef && bowlRef.disponible === false) {
        return ui.mostrarToast(`🚫 ${bowlRef.nombre} está marcado como AGOTADO`);
    }

    estado.bowl = combo.bowl || null;
    estado.acomp = {};
    estado.toppings = {};
    estado.bebidas = {};

    Object.entries(combo.acomp || {}).forEach(([id, cant]) => {
        const ref = ACOMPANANTES.find((x) => x.id === id);
        if (ref && ref.disponible !== false) estado.acomp[id] = cant;
    });
    Object.entries(combo.toppings || {}).forEach(([id, cant]) => {
        const ref = TOPPINGS.find((x) => x.id === id);
        if (ref && ref.disponible !== false) estado.toppings[id] = cant;
    });
    Object.entries(combo.bebidas || {}).forEach(([id, cant]) => {
        const ref = BEBIDAS.find((x) => x.id === id);
        if (ref && ref.disponible !== false) estado.bebidas[id] = cant;
    });

    renderAll();
    ui.mostrarToast(`⚡ ${combo.nombre} aplicado`);
}

// IDEA 4: Alternar Chips de Notas Rápidas sin usar el teclado
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
    const url = numLimpio
        ? `https://wa.me/${numLimpio}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
                cerradoEn: new Date().toISOString()
            }));

            pedidos = pedidos.filter((p) => p.fechaLocal === hoyStr && pedidosDiaAnterior.length > 0);
            fechaJornadaActiva = hoyStr;
            saveState();
            renderAll();

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
                    btnCerrarAuto.onclick = () => {
                        modalAuto.style.display = 'none';
                    };
                }
            } else {
                ui.mostrarToast(`🌙 Día ${fechaReporte} cerrado automáticamente (12:00 AM)`);
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
            badge.textContent = `🟠 Modo Offline · ${pendientes} en cola local`;
            badge.style.color = '#FBBB1E';
        } else if (pendientes > 0) {
            badge.textContent = `⏳ Sincronizando ${pendientes} pedido(s)...`;
            badge.style.color = '#FBBB1E';
        } else {
            badge.textContent = '🟢 En línea · Todo sincronizado';
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
        if (!estado.clienteBloqueado) {
            inputNombre.style.borderColor = '';
            inputNombre.style.boxShadow = '';
        }
    }
}

// IDEA 3: Limpiar del pedido en curso cualquier producto que haya sido marcado como Agotado
function depurarSeleccionPorDisponibilidad() {
    if (estado.bowl) {
        const b = BOWLS.find((x) => x.id === estado.bowl);
        if (b && b.disponible === false) estado.bowl = null;
    }
    Object.keys(estado.acomp).forEach((id) => {
        const item = ACOMPANANTES.find((x) => x.id === id);
        if (item && item.disponible === false) delete estado.acomp[id];
    });
    Object.keys(estado.toppings).forEach((id) => {
        const item = TOPPINGS.find((x) => x.id === id);
        if (item && item.disponible === false) delete estado.toppings[id];
    });
    Object.keys(estado.bebidas).forEach((id) => {
        const item = BEBIDAS.find((x) => x.id === id);
        if (item && item.disponible === false) delete estado.bebidas[id];
    });
}

async function cargarPreciosActualizados() {
    const cachePrecios = leerStorageSeguro('fz_precios', {});
    const cacheDisp = leerStorageSeguro('fz_disponibilidad', {});

    TODO_EL_MENU.forEach((item) => {
        if (Number.isFinite(cachePrecios[item.id]) && cachePrecios[item.id] > 0) {
            item.precio = cachePrecios[item.id];
        }
        if (typeof cacheDisp[item.id] === 'boolean') {
            item.disponible = cacheDisp[item.id];
        }
    });
    depurarSeleccionPorDisponibilidad();
    renderAll();

    if (navigator.onLine) {
        const remotos = await api.obtenerProductos();
        if (Array.isArray(remotos) && remotos.length > 0) {
            const mapaPrecios = {};
            const mapaDisp = { ...cacheDisp };
            remotos.forEach((r) => {
                const prod = TODO_EL_MENU.find((p) => p.id === r.id);
                const precioNum = Number(r.precio_actual);
                if (prod && Number.isFinite(precioNum) && precioNum > 0) {
                    prod.precio = precioNum;
                    mapaPrecios[prod.id] = precioNum;
                }
                if (prod && typeof r.disponible === 'boolean') {
                    prod.disponible = r.disponible;
                    mapaDisp[prod.id] = r.disponible;
                }
            });
            localStorage.setItem('fz_precios', JSON.stringify(mapaPrecios));
            localStorage.setItem('fz_disponibilidad', JSON.stringify(mapaDisp));
            depurarSeleccionPorDisponibilidad();
            renderAll();
        }
    }
}

function calcularTotal() {
    let t = 0;
    const bowl = BOWLS.find((b) => b.id === estado.bowl && b.disponible !== false);
    if (bowl) t += bowl.precio;

    Object.entries(estado.acomp).forEach(([id, c]) => {
        const item = ACOMPANANTES.find((x) => x.id === id && x.disponible !== false);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.toppings).forEach(([id, c]) => {
        const item = TOPPINGS.find((x) => x.id === id && x.disponible !== false);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.bebidas).forEach(([id, c]) => {
        const item = BEBIDAS.find((x) => x.id === id && x.disponible !== false);
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
}

function construirPedido() {
    const mapDetalle = (store, cat) =>
        Object.entries(store).map(([id, cant]) => {
            const item = cat.find((x) => x.id === id);
            return {
                id: item.id,
                nombre: item.nombre,
                cantidad: cant,
                precio: item.precio,
                subtotal: item.precio * cant
            };
        });

    const bowlObj = BOWLS.find((b) => b.id === estado.bowl);
    const ahora = new Date();
    let notasTexto = document.getElementById('notas').value.trim() || '';
    if (estado.premioFidelidad && !notasTexto.includes('[Premio Fidelidad')) {
        notasTexto = (notasTexto + ' [Premio Fidelidad: Topping Gratis]').trim();
    }

    return {
        id: generarUUID(),
        fechaISO: ahora.toISOString(),
        fechaLocal: ahora.toLocaleDateString('es-CO'),
        hora: ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        nombre: normalizarNombreCliente(document.getElementById('nombreCliente').value),
        notas: notasTexto,
        bowl: bowlObj ? bowlObj.nombre : 'Individual',
        bowlId: estado.bowl || 'ninguno',
        acompDetalle: mapDetalle(estado.acomp, ACOMPANANTES),
        toppingDetalle: mapDetalle(estado.toppings, TOPPINGS),
        bebidaDetalle: mapDetalle(estado.bebidas, BEBIDAS),
        pago: PAGOS.find((p) => p.id === estado.pago)?.nombre || 'Efectivo',
        total: estado.total,
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
    estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0, premioFidelidad: false, clienteBloqueado: false };
    document.getElementById('orderForm').reset();
    limpiarCalculadoraEfectivo();
    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        inputNombre.readOnly = false;
        inputNombre.style.backgroundColor = '';
        inputNombre.style.cursor = '';
        inputNombre.style.borderColor = '';
        inputNombre.style.boxShadow = '';
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
        clienteBloqueado: true
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
            ui.mostrarToast('Modo multi-bowl cancelado. Puedes escribir un cliente nuevo.');
        });
    }

    renderAll();
    verificarFidelidadCliente(nombreFijo);
    document.getElementById('bowlGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderAll() {
    ui.renderCombos('comboGrid', COMBOS_RAPIDOS, aplicarComboRapido);

    const inputNotas = document.getElementById('notas');
    ui.renderQuickNotes('quickNotesGrid', NOTAS_RAPIDAS, inputNotas ? inputNotas.value : '', alternarNotaRapida);

    ui.renderChoiceGrid('bowlGrid', BOWLS, estado.bowl, (id) => {
        estado.bowl = estado.bowl === id ? null : id;
        renderAll();
    });
    ui.renderChoiceGrid('payGrid', PAGOS, estado.pago, (id) => {
        estado.pago = id;
        renderAll();
    });
    ui.renderQtyGrid('acompGrid', ACOMPANANTES, estado.acomp, (id, v) => {
        v === 0 ? delete estado.acomp[id] : (estado.acomp[id] = v);
        renderAll();
    });
    ui.renderQtyGrid('toppingGrid', TOPPINGS, estado.toppings, (id, v) => {
        v === 0 ? delete estado.toppings[id] : (estado.toppings[id] = v);
        renderAll();
    });
    ui.renderQtyGrid('bebidaGrid', BEBIDAS, estado.bebidas, (id, v) => {
        v === 0 ? delete estado.bebidas[id] : (estado.bebidas[id] = v);
        renderAll();
    });

    const pedidosVisibles = filtroPago
        ? pedidos.filter((p) => (p.pago || '').toLowerCase() === filtroPago.toLowerCase())
        : pedidos;

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
            ui.confirmarAccion('¿Eliminar este pedido de la caja y de la nube?', async () => {
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
                } catch (err) {
                    console.error('Error propagando eliminación:', err);
                }
                actualizarBadgeSincronizacion();
                ui.mostrarToast('Pedido eliminado en caja y nube');
            });
        }
    });

    ui.renderOrders(apartados, 'apartadosList', true, {
        onToggle: (id) => {
            const p = apartados.find((x) => x.id === id);
            if (p) {
                p.abierto = !p.abierto;
                saveState();
                renderAll();
            }
        },
        onDelete: (id) => {
            apartados = apartados.filter((x) => x.id !== id);
            saveState();
            ui.mostrarToast('Apartado cancelado');
            renderAll();
        },
        onConfirm: async (p) => {
            apartados = apartados.filter((x) => x.id !== p.id);
            const ahora = new Date();
            p.abierto = true;
            p.fechaISO = ahora.toISOString();
            p.fechaLocal = ahora.toLocaleDateString('es-CO');
            p.hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            await procesarGuardado(p, { modoReset: 'ninguno' });
        }
    });

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
            ui.mostrarToast(filtroPago ? `Filtrando pedidos por: ${filtroPago}` : 'Mostrando todos los pedidos');
            renderAll();
        }
    );

    calcularTotal();
}

async function procesarGuardado(pedido, { modoReset = 'completo' } = {}) {
    if (guardandoEnCurso) return;
    guardandoEnCurso = true;
    calcularTotal();

    const pagoIdActual = estado.pago;

    try {
        verificarCorteAutomaticoMedianoche();

        const itemsArray = [];
        if (pedido.bowlId && pedido.bowlId !== 'ninguno') {
            const bowlObj = BOWLS.find((b) => b.id === pedido.bowlId);
            if (bowlObj) itemsArray.push({ id: bowlObj.id, precio: bowlObj.precio, cantidad: 1 });
        }

        const pedidoAdaptadoAPI = {
            id: pedido.id,
            cliente: pedido.nombre,
            pago: pedido.pago,
            total: pedido.total,
            notas: pedido.notas,
            fechaISO: pedido.fechaISO,
            items: [...itemsArray, ...pedido.acompDetalle, ...pedido.toppingDetalle, ...pedido.bebidaDetalle]
        };

        await dbSync.saveToQueue(pedidoAdaptadoAPI);

        pedidos.forEach((p) => { p.abierto = false; });
        pedido.abierto = true;

        pedidos.unshift(pedido);
        registrarClienteEnCache(pedido.nombre);
        saveState();

        if (modoReset === 'mismoCliente') {
            ui.mostrarToast(`✅ Bowl guardado (${ui.fmt(pedido.total)}) · Cliente ${pedido.nombre} bloqueado para el siguiente`);
            prepararSiguienteBowlMismoCliente(pedido.nombre, pagoIdActual);
        } else if (modoReset === 'completo') {
            ui.mostrarToast(`Pedido guardado — ${ui.fmt(pedido.total)}`);
            resetForm();
        } else {
            ui.mostrarToast(`Apartado confirmado — ${ui.fmt(pedido.total)}`);
            renderAll();
        }
    } catch (err) {
        console.error('Error crítico guardando en cola local:', err);
        ui.mostrarToast('⚠️ Error guardando en memoria local. Intenta de nuevo.');
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
            const localRef = pedidos.find((p) => p.id === pedidoCola.id);

            if (resultado.ok) {
                await dbSync.removeFromQueue(pedidoCola.id);
                if (localRef) {
                    localRef.sincronizado = true;
                    localRef.syncError = false;
                }
            } else if (resultado.permanent) {
                if (localRef) localRef.syncError = true;
                ui.mostrarToast(`⚠️ Pedido de ${pedidoCola.cliente} requiere revisión`);
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

// IDEA 3: Editor de Precios + Interruptor de Agotado Temporal en el Modal de Administrador
function abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar) {
    if (btnGuardar) btnGuardar.style.display = 'block';
    listaDiv.innerHTML = '';

    const categorias = ['Bowls Base', 'Acompañantes', 'Toppings', 'Bebidas'];
    categorias.forEach((catNombre) => {
        const productosCat = TODO_EL_MENU.filter((p) => p.cat === catNombre);
        if (productosCat.length === 0) return;

        const headerCat = document.createElement('div');
        headerCat.style.cssText = 'font-size:0.76rem; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; color:#1B0836; background:#F5A623; display:inline-block; padding:4px 10px; border-radius:99px; margin:10px 0 4px 0; align-self:flex-start;';
        headerCat.textContent = catNombre;
        listaDiv.appendChild(headerCat);

        productosCat.forEach((prod) => {
            const estaDisp = prod.disponible !== false;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; background:#FFFAEF; border:1px solid #E9DEC0; border-radius:12px; padding:10px 12px; margin-bottom:6px; gap:8px;';
            row.innerHTML = `
                <div style="flex:1 1 130px; min-width:0;">
                    <div style="color:#2A0E4F; font-weight:800; font-size:0.95rem;">${ui.esc(prod.nombre)}</div>
                    <button type="button" class="btn-toggle-stock" data-stock-id="${ui.esc(prod.id)}" data-disponible="${estaDisp ? 'true' : 'false'}"
                        style="margin-top:4px; min-height:34px; padding:4px 10px; border-radius:99px; border:none; font-weight:900; font-size:0.74rem; cursor:pointer; background:${estaDisp ? '#E6F4EA' : '#FDECEA'}; color:${estaDisp ? '#1E7E34' : '#D1272B'};">
                        ${estaDisp ? '🟢 Disponible' : '🔴 Agotado'}
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="btn-step-minus" style="width:40px; height:40px; border-radius:8px; border:1px solid #D3C4A3; background:#FFF; color:#2A0E4F; font-weight:900; cursor:pointer;">−500</button>
                    <div style="display:flex; align-items:center; background:#FFFFFF; border-radius:8px; padding:6px 10px; border:2px solid #2A0E4F;">
                        <span style="color:#2A0E4F; margin-right:4px; font-weight:900;">$</span>
                        <input type="number" min="100" step="100" data-id="${ui.esc(prod.id)}" value="${Number(prod.precio)}"
                            style="width:78px; text-align:right; border:none; background:transparent; font-size:16px; font-weight:800; color:#2A0E4F; outline:none;">
                    </div>
                    <button type="button" class="btn-step-plus" style="width:40px; height:40px; border-radius:8px; border:none; background:#F5A623; color:#1B0836; font-weight:900; cursor:pointer;">+500</button>
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

            listaDiv.appendChild(row);
        });
    });

    modal.style.display = 'flex';
}

function mostrarLoginEnModal(modal, listaDiv, btnGuardar) {
    if (btnGuardar) btnGuardar.style.display = 'none';
    listaDiv.innerHTML = `
        <div style="background:#FFFAEF; border:1px solid #E9DEC0; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px;">
            <p style="margin:0; font-size:0.9rem; color:#3B1766; font-weight:700;">
                🔒 Ingresa con tu cuenta de Administrador para modificar precios y disponibilidad.
            </p>
            <div>
                <label style="display:block; font-size:0.78rem; font-weight:800; color:#2A0E4F; margin-bottom:4px;">CORREO ELECTRÓNICO</label>
                <input type="email" id="adminLoginEmail" placeholder="elmanr248@gmail.com" autocomplete="username">
            </div>
            <div>
                <label style="display:block; font-size:0.78rem; font-weight:800; color:#2A0E4F; margin-bottom:4px;">CONTRASEÑA</label>
                <input type="password" id="adminLoginPass" placeholder="••••••••" autocomplete="current-password">
            </div>
            <button type="button" id="btnSubmitAdminLogin" class="btn-guardar">
                Desbloquear Panel Administrador
            </button>
        </div>
    `;
    modal.style.display = 'flex';

    document.getElementById('btnSubmitAdminLogin')?.addEventListener('click', async () => {
        const email = document.getElementById('adminLoginEmail')?.value.trim();
        const pass = document.getElementById('adminLoginPass')?.value;
        const btn = document.getElementById('btnSubmitAdminLogin');
        if (!email || !pass) return ui.mostrarToast('Completa correo y contraseña');

        btn.disabled = true;
        btn.textContent = 'Verificando...';
        const { error } = await api.loginAdmin(email, pass);
        if (error) {
            btn.disabled = false;
            btn.textContent = 'Desbloquear Panel Administrador';
            return ui.mostrarToast('🔒 Credenciales inválidas');
        }
        ui.mostrarToast('🔓 Sesión de Administrador iniciada');
        abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar);
    });
}

async function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW error:', err));
    }

    await dbSync.init();
    verificarCorteAutomaticoMedianoche();
    setInterval(verificarCorteAutomaticoMedianoche, 15000);

    await cargarPreciosActualizados();
    await sincronizarClientesConocidos();
    await actualizarBadgeSincronizacion();
    sincronizarCola();

    document.getElementById('orderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        procesarGuardado(construirPedido(), { modoReset: 'completo' });
    });

    document.getElementById('btnGuardarYOtro')?.addEventListener('click', () => {
        procesarGuardado(construirPedido(), { modoReset: 'mismoCliente' });
    });

    document.getElementById('btnApartar').addEventListener('click', () => {
        const nuevoApartado = construirPedido();
        apartados.forEach((a) => { a.abierto = false; });
        nuevoApartado.abierto = true;
        apartados.unshift(nuevoApartado);
        registrarClienteEnCache(nuevoApartado.nombre);
        saveState();
        ui.mostrarToast('Pedido apartado');
        resetForm();
    });

    // Eventos para la Calculadora de Devuelta en Efectivo (Idea 1)
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

    // Sincronizar chips de notas si el cajero escribe manualmente en el textarea (Idea 4)
    document.getElementById('notas')?.addEventListener('input', (e) => {
        ui.renderQuickNotes('quickNotesGrid', NOTAS_RAPIDAS, e.target.value, alternarNotaRapida);
    });

    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        inputNombre.addEventListener('input', (e) => {
            if (estado.clienteBloqueado) return;
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
            if (estado.clienteBloqueado) return;
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

    document.getElementById('btnAdmin')?.addEventListener('click', async () => {
        const session = await api.getSession();
        if (!session) {
            mostrarLoginEnModal(modal, listaDiv, btnGuardarPrecios);
        } else {
            abrirEditorPreciosEnModal(modal, listaDiv, btnGuardarPrecios);
        }
    });

    document.getElementById('btnCerrarAdmin')?.addEventListener('click', () => {
        modal.style.display = 'none';
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

        const cachePrecios = leerStorageSeguro('fz_precios', {});
        const cacheDisp = leerStorageSeguro('fz_disponibilidad', {});

        for (const inpt of inputs) {
            const id = inpt.getAttribute('data-id');
            const nuevoPrecio = Number(inpt.value);
            const btnStock = listaDiv.querySelector(`.btn-toggle-stock[data-stock-id="${id}"]`);
            const nuevaDisp = btnStock ? btnStock.getAttribute('data-disponible') === 'true' : true;
            const ref = TODO_EL_MENU.find((x) => x.id === id);

            if (ref) {
                const cambioPrecio = ref.precio !== nuevoPrecio;
                const cambioDisp = (ref.disponible !== false) !== nuevaDisp;

                ref.disponible = nuevaDisp;
                cacheDisp[id] = nuevaDisp;

                if (cambioPrecio || cambioDisp) {
                    if (navigator.onLine) {
                        const { error } = await api.actualizarProductoAdmin(id, {
                            precio_actual: nuevoPrecio,
                            disponible: nuevaDisp
                        });
                        if (error) {
                            fallos++;
                        } else {
                            ref.precio = nuevoPrecio;
                            cachePrecios[id] = nuevoPrecio;
                        }
                    } else {
                        ref.precio = nuevoPrecio;
                        cachePrecios[id] = nuevoPrecio;
                    }
                } else {
                    cachePrecios[id] = ref.precio;
                }
            }
        }

        localStorage.setItem('fz_precios', JSON.stringify(cachePrecios));
        localStorage.setItem('fz_disponibilidad', JSON.stringify(cacheDisp));
        depurarSeleccionPorDisponibilidad();

        modal.style.display = 'none';
        btnGuardarPrecios.disabled = false;
        btnGuardarPrecios.textContent = 'Guardar Cambios en Nube';
        renderAll();
        ui.mostrarToast(fallos === 0 ? '✅ Precios y stock actualizados' : `⚠️ Guardado con ${fallos} errores en nube`);
    });

    document.getElementById('btnWhatsapp')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('No hay pedidos hoy para reportar');
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
    cargarPreciosActualizados();
    sincronizarClientesConocidos();
    sincronizarCola();
});
window.addEventListener('offline', actualizarBadgeSincronizacion);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        verificarCorteAutomaticoMedianoche();
    }
});
document.addEventListener('DOMContentLoaded', init);