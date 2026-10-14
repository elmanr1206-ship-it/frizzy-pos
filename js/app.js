import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api, normalizarNombreCliente } from './api.js';

const BOWLS = [{id:'papas', nombre:'Papas', precio:10000}, {id:'yuca', nombre:'Yuca', precio:8000}];
const ACOMPANANTES = [{id:'salchicha', nombre:'Salchicha', precio:3000}, {id:'chorizo', nombre:'Chorizo', precio:5000}, {id:'pollo', nombre:'Pollo (Nuggets)', precio:4000}, {id:'carne', nombre:'Carne', precio:5000}];
const TOPPINGS = [{id:'papachongo', nombre:'Papa Chongo', precio:1000}, {id:'lechuga', nombre:'Lechuga', precio:500}, {id:'picodegallo', nombre:'Pico de Gallo', precio:1000}, {id:'queso', nombre:'Queso', precio:2000}, {id:'tocineta', nombre:'Salsa de Tocineta', precio:2000}];
const BEBIDAS = [{id:'vasito', nombre:'Vasito', precio:1500}];
const PAGOS = [{id:'efectivo', nombre:'Efectivo'}, {id:'llave', nombre:'Llave'}, {id:'nequi', nombre:'Nequi'}];
const TODO_EL_MENU = [...BOWLS, ...ACOMPANANTES, ...TOPPINGS, ...BEBIDAS];

// Lectura segura de localStorage con try/catch (#Almacenamiento)
function leerStorageSeguro(clave, defecto = []) {
    try {
        const raw = localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : defecto;
    } catch (e) {
        console.warn(`Error leyendo ${clave} en localStorage:`, e);
        return defecto;
    }
}

// 1. Mantener directorio local + nube de clientes para autocompletar al instante
let clientesConocidos = leerStorageSeguro('fz_clientes_cache', []);

function registrarClienteEnCache(nombre) {
    const limpio = normalizarNombreCliente(nombre);
    if (!limpio) return;
    if (!clientesConocidos.some(c => c.toLowerCase() === limpio.toLowerCase())) {
        clientesConocidos.push(limpio);
        clientesConocidos.sort((a, b) => a.localeCompare(b, 'es'));
        localStorage.setItem('fz_clientes_cache', JSON.stringify(clientesConocidos));
    }
}

async function sincronizarClientesConocidos() {
    // Unir clientes de pedidos locales actuales
    pedidos.forEach(p => registrarClienteEnCache(p.nombre));
    apartados.forEach(p => registrarClienteEnCache(p.nombre));

    if (navigator.onLine) {
        const remotos = await api.obtenerClientes();
        if (Array.isArray(remotos)) {
            remotos.forEach(nombre => registrarClienteEnCache(nombre));
        }
    }
}

// Quitar tildes y pasar a minúsculas para buscar sin importar mayúsculas/minúsculas
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

    // Priorizar nombres que empiezan por lo digitado, luego los que lo contienen
    const empiezan = [];
    const contienen = [];

    for (const nombre of clientesConocidos) {
        const norm = limpiarParaBusqueda(nombre);
        if (norm === query) continue; // Si ya está escrito idéntico, no estorbar
        if (norm.startsWith(query)) empiezan.push(nombre);
        else if (norm.includes(query)) contienen.push(nombre);
    }
    return [...empiezan, ...contienen].slice(0, 3);
}

// Generador UUID con fallback para entornos HTTP en red local (#UUID)
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

let estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0, premioFidelidad: false };
let pedidos = leerStorageSeguro('fz_pedidos', []);
let apartados = leerStorageSeguro('fz_apartados', []);
let sincronizando = false; // Candado de concurrencia (#3)
let guardandoEnCurso = false; // Evita doble toque en Guardar (#DobleToque)

function saveState() {
    localStorage.setItem('fz_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('fz_apartados', JSON.stringify(apartados));
}

// Cargar precios guardados en caché local y luego desde Supabase (#4)
async function cargarPreciosActualizados() {
    const cachePrecios = leerStorageSeguro('fz_precios', {});
    TODO_EL_MENU.forEach(item => {
        if (Number.isFinite(cachePrecios[item.id]) && cachePrecios[item.id] > 0) {
            item.precio = cachePrecios[item.id];
        }
    });
    renderAll();

    if (navigator.onLine) {
        const remotos = await api.obtenerProductos();
        if (Array.isArray(remotos) && remotos.length > 0) {
            const mapa = {};
            remotos.forEach(r => {
                const prod = TODO_EL_MENU.find(p => p.id === r.id);
                const precioNum = Number(r.precio_actual);
                if (prod && Number.isFinite(precioNum) && precioNum > 0) {
                    prod.precio = precioNum;
                    mapa[prod.id] = precioNum;
                }
            });
            localStorage.setItem('fz_precios', JSON.stringify(mapa));
            renderAll();
        }
    }
}

function calcularTotal() {
    let t = 0;
    const bowl = BOWLS.find(b => b.id === estado.bowl);
    if (bowl) t += bowl.precio;
    Object.entries(estado.acomp).forEach(([id, c]) => {
        const item = ACOMPANANTES.find(x => x.id === id);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.toppings).forEach(([id, c]) => {
        const item = TOPPINGS.find(x => x.id === id);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.bebidas).forEach(([id, c]) => {
        const item = BEBIDAS.find(x => x.id === id);
        if (item) t += item.precio * c;
    });

    estado.total = t;
    document.getElementById('totalPedido').textContent = ui.fmt(t);

    const nombreOk = document.getElementById('nombreCliente').value.trim().length > 0;
    const pagoOk = estado.pago !== null;
    const tieneItems = estado.bowl !== null || Object.keys(estado.acomp).length > 0 || Object.keys(estado.toppings).length > 0 || Object.keys(estado.bebidas).length > 0;

    const habilitado = nombreOk && pagoOk && tieneItems && !guardandoEnCurso;
    document.getElementById('btnGuardar').disabled = !habilitado;
    document.getElementById('btnApartar').disabled = !habilitado;
}

function construirPedido() {
    const mapDetalle = (store, cat) => Object.entries(store).map(([id, cant]) => {
        const item = cat.find(x => x.id === id);
        return { id: item.id, nombre: item.nombre, cantidad: cant, precio: item.precio, subtotal: item.precio * cant };
    });

    const bowlObj = BOWLS.find(b => b.id === estado.bowl);
    const ahora = new Date();
    let notasTexto = document.getElementById('notas').value.trim() || '';
    if (estado.premioFidelidad && !notasTexto.includes('[Premio Fidelidad')) {
        notasTexto = (notasTexto + ' [Premio Fidelidad: Topping Gratis]').trim();
    }

    return {
        id: generarUUID(),
        fechaISO: ahora.toISOString(), // Hora exacta de venta para Horas Pico (#10)
        fechaLocal: ahora.toLocaleDateString('es-CO'), // Fecha para reportes (#9)
        hora: ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        nombre: normalizarNombreCliente(document.getElementById('nombreCliente').value),
        notas: notasTexto,
        bowl: bowlObj ? bowlObj.nombre : 'Individual',
        bowlId: estado.bowl || 'ninguno',
        acompDetalle: mapDetalle(estado.acomp, ACOMPANANTES),
        toppingDetalle: mapDetalle(estado.toppings, TOPPINGS),
        bebidaDetalle: mapDetalle(estado.bebidas, BEBIDAS),
        pago: PAGOS.find(p => p.id === estado.pago)?.nombre || 'Efectivo',
        total: estado.total,
        abierto: false,
        sincronizado: false,
        syncError: false
    };
}

function resetForm() {
    estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0, premioFidelidad: false };
    document.getElementById('orderForm').reset();
    // Limpiar el brillo dorado de fidelización al resetear (#DetallesUI)
    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        inputNombre.style.borderColor = '';
        inputNombre.style.boxShadow = '';
    }
    renderAll();
}

function renderAll() {
    // Pasar valor directo de selección estado.bowl y estado.pago (#7)
    ui.renderChoiceGrid('bowlGrid', BOWLS, estado.bowl, (id) => {
        estado.bowl = (estado.bowl === id ? null : id);
        renderAll();
    });
    ui.renderChoiceGrid('payGrid', PAGOS, estado.pago, (id) => {
        estado.pago = id;
        renderAll();
    });
    ui.renderQtyGrid('acompGrid', ACOMPANANTES, estado.acomp, (id, v) => {
        v === 0 ? delete estado.acomp[id] : estado.acomp[id] = v;
        renderAll();
    });
    ui.renderQtyGrid('toppingGrid', TOPPINGS, estado.toppings, (id, v) => {
        v === 0 ? delete estado.toppings[id] : estado.toppings[id] = v;
        renderAll();
    });
    ui.renderQtyGrid('bebidaGrid', BEBIDAS, estado.bebidas, (id, v) => {
        v === 0 ? delete estado.bebidas[id] : estado.bebidas[id] = v;
        renderAll();
    });

    ui.renderOrders(pedidos, 'ordersList', false, {
        onToggle: (id) => {
            const p = pedidos.find(x => x.id === id);
            if (p) { p.abierto = !p.abierto; renderAll(); }
        },
        onDelete: async (id) => {
            // Propagar eliminación a localStorage, IndexedDB y Supabase (#2)
            pedidos = pedidos.filter(x => x.id !== id);
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
            ui.mostrarToast('Pedido eliminado en caja y nube');
        }
    });

    ui.renderOrders(apartados, 'apartadosList', true, {
        onToggle: (id) => {
            const p = apartados.find(x => x.id === id);
            if (p) { p.abierto = !p.abierto; renderAll(); }
        },
        onDelete: (id) => {
            apartados = apartados.filter(x => x.id !== id);
            saveState();
            ui.mostrarToast('Apartado cancelado');
            renderAll();
        },
        onConfirm: async (p) => {
            apartados = apartados.filter(x => x.id !== p.id);
            const ahora = new Date();
            p.abierto = false;
            p.fechaISO = ahora.toISOString();
            p.fechaLocal = ahora.toLocaleDateString('es-CO');
            p.hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            // No borrar el formulario que el cajero está llenando (#8)
            await procesarGuardado(p, { limpiarFormulario: false });
        }
    });

    const conteo = {};
    pedidos.forEach(p => {
        if (p.bowlId && p.bowlId !== 'ninguno') {
            conteo[p.bowl] = (conteo[p.bowl] || 0) + 1;
        }
        [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].forEach(i => {
            conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad;
        });
    });
    ui.renderSummary(pedidos, PAGOS, Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 6));
    calcularTotal();
}

async function procesarGuardado(pedido, { limpiarFormulario = true } = {}) {
    if (guardandoEnCurso) return;
    guardandoEnCurso = true;
    calcularTotal();

    try {
        const itemsArray = [];
        if (pedido.bowlId && pedido.bowlId !== 'ninguno') {
            const bowlObj = BOWLS.find(b => b.id === pedido.bowlId);
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

        // Primero asegurar en IndexedDB antes de confirmar (#5)
        await dbSync.saveToQueue(pedidoAdaptadoAPI);

        pedidos.unshift(pedido);
        saveState();
        ui.mostrarToast(`Pedido guardado — ${ui.fmt(pedido.total)}`);

        if (limpiarFormulario) resetForm();
        else renderAll();
    } catch (err) {
        console.error('Error crítico guardando en cola local:', err);
        ui.mostrarToast('⚠️ Error guardando en memoria local. Intenta de nuevo.');
    } finally {
        guardandoEnCurso = false;
        calcularTotal();
    }

    if (navigator.onLine) sincronizarCola();
}

async function sincronizarCola() {
    if (sincronizando || !navigator.onLine) return; // Candado activo (#3)
    sincronizando = true;

    try {
        // 1. Sincronizar pedidos pendientes
        const cola = await dbSync.getQueue();
        for (const pedidoCola of cola) {
            const resultado = await api.pushPedido(pedidoCola);
            const localRef = pedidos.find(p => p.id === pedidoCola.id);

            if (resultado.ok) {
                await dbSync.removeFromQueue(pedidoCola.id);
                if (localRef) {
                    localRef.sincronizado = true;
                    localRef.syncError = false;
                }
            } else if (resultado.permanent) {
                // Marcar error permanente en UI sin ciclar infinitamente (#5)
                if (localRef) localRef.syncError = true;
                ui.mostrarToast(`⚠️ Pedido de ${pedidoCola.cliente} requiere revisión`);
            }
        }

        // 2. Sincronizar eliminaciones pendientes (#2)
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
    }
}

async function init() {
    // 1. Registrar Service Worker (#1)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW error:', err));
    }

    await dbSync.init();
    await cargarPreciosActualizados();
    sincronizarCola();

    document.getElementById('orderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        procesarGuardado(construirPedido(), { limpiarFormulario: true });
    });

    document.getElementById('btnApartar').addEventListener('click', () => {
        apartados.unshift(construirPedido());
        saveState();
        ui.mostrarToast('Pedido apartado');
        resetForm();
    });

    await sincronizarClientesConocidos();

    const inputNombre = document.getElementById('nombreCliente');

    inputNombre.addEventListener('input', (e) => {
        calcularTotal();
        const top3 = obtenerTop3Clientes(e.target.value);
        ui.renderSugerenciasClientes(top3, (nombreElegido) => {
            inputNombre.value = nombreElegido;
            calcularTotal();
            verificarFidelidadCliente(nombreElegido);
        });
    });

    // Fidelización normalizando nombre y contando cola local + nube (#12)
inputNombre.addEventListener('blur', async (e) => {
        setTimeout(() => ui.renderSugerenciasClientes([], () => {}), 150);
        const raw = e.target.value.trim();
        if (!raw) return;
        const nombreNorm = normalizarNombreCliente(raw);
        e.target.value = nombreNorm;
        await verificarFidelidadCliente(nombreNorm);
    });

    // Modal Administrador protegido con Login (#6) y validación estricta (#4)
    const modal = document.getElementById('adminModal');
    const listaDiv = document.getElementById('adminListaProductos');

    document.getElementById('btnAdmin')?.addEventListener('click', async () => {
        const session = await api.getSession();
        if (!session) {
            const email = prompt('Correo de Administrador:');
            if (!email) return;
            const password = prompt('Contraseña de Administrador:');
            if (!password) return;
            const { error } = await api.loginAdmin(email.trim(), password);
            if (error) {
                return ui.mostrarToast('🔒 Acceso denegado: credenciales inválidas');
            }
        }

        listaDiv.innerHTML = '';
        TODO_EL_MENU.forEach(prod => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e0e0e0; padding:10px 0;';
            row.innerHTML = `
                <span style="color:#1A1A1A; font-weight:600; font-size:1rem;">${ui.esc(prod.nombre)}</span>
                <div style="display:flex; align-items:center; background:#f5f5f5; border-radius:8px; padding:4px 8px; border:1px solid #ccc;">
                    <span style="color:#666; margin-right:5px; font-weight:bold;">$</span>
                    <input type="number" min="100" step="100" data-id="${ui.esc(prod.id)}" value="${Number(prod.precio)}"
                        style="width:90px; text-align:right; border:none; background:transparent; font-size:16px; color:#1A1A1A; outline:none;">
                </div>
            `;
            listaDiv.appendChild(row);
        });
        modal.style.display = 'flex';
    });

    document.getElementById('btnCerrarAdmin')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnGuardarPrecios')?.addEventListener('click', async () => {
        const inputs = listaDiv.querySelectorAll('input');
        const btn = document.getElementById('btnGuardarPrecios');
        btn.disabled = true;
        let fallos = 0;

        // Primero validar todos los campos (#4)
        for (const inpt of inputs) {
            const val = Number(inpt.value);
            if (!Number.isFinite(val) || val <= 0) {
                btn.disabled = false;
                return ui.mostrarToast('⚠️ Todos los precios deben ser números mayores a 0');
            }
        }

        const cachePrecios = leerStorageSeguro('fz_precios', {});
        for (const inpt of inputs) {
            const id = inpt.getAttribute('data-id');
            const nuevo = Number(inpt.value);
            const ref = TODO_EL_MENU.find(x => x.id === id);

            if (ref && ref.precio !== nuevo) {
                const { error } = await api.actualizarPrecioProducto(id, nuevo);
                if (error) {
                    fallos++;
                } else {
                    ref.precio = nuevo;
                    cachePrecios[id] = nuevo;
                }
            } else if (ref) {
                cachePrecios[id] = ref.precio;
            }
        }

        localStorage.setItem('fz_precios', JSON.stringify(cachePrecios));
        modal.style.display = 'none';
        btn.disabled = false;
        renderAll(); // Re-renderizar tarjetas con el precio nuevo (#4)
        ui.mostrarToast(fallos === 0 ? '✅ Precios actualizados y persistidos' : `⚠️ Actualizados con ${fallos} errores`);
    });

    // Exportar Excel incluyendo fecha de cada pedido (#9)
    document.getElementById('btnExcel')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('No hay pedidos');
        const f = new Date().toLocaleDateString('es-CO');

        const peds = XLSX.utils.json_to_sheet(pedidos.map(p => ({
            'Fecha': p.fechaLocal || f,
            'Hora': p.hora,
            'Cliente': p.nombre,
            'Bowl': p.bowl,
            'Extras': [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].map(i => `${i.nombre} x${i.cantidad}`).join(', '),
            'Notas': p.notas,
            'Pago': p.pago,
            'Total': p.total
        })));
        peds['!cols'] = [{wch:12},{wch:8},{wch:18},{wch:12},{wch:40},{wch:24},{wch:12},{wch:12}];

        const totalDia = pedidos.reduce((s, p) => s + p.total, 0);
        const resArr = [
            { Concepto: 'Fecha reporte', Valor: f },
            { Concepto: 'Total pedidos', Valor: pedidos.length },
            { Concepto: 'Total ventas', Valor: totalDia },
            { Concepto: '', Valor: '' }
        ];
        PAGOS.forEach(pg => {
            const d = pedidos.filter(p => p.pago === pg.nombre);
            resArr.push(
                { Concepto: `${pg.nombre} pedidos`, Valor: d.length },
                { Concepto: `${pg.nombre} total`, Valor: d.reduce((s, p) => s + p.total, 0) }
            );
        });

        const conteo = {};
        pedidos.forEach(p => {
            if (p.bowlId && p.bowlId !== 'ninguno') conteo[p.bowl] = (conteo[p.bowl] || 0) + 1;
            [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].forEach(i => conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad);
        });
        const rnk = XLSX.utils.json_to_sheet(Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ Producto: n, Vendidos: c })));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resArr, { skipHeader: true }), 'Resumen');
        XLSX.utils.book_append_sheet(wb, peds, 'Pedidos');
        XLSX.utils.book_append_sheet(wb, rnk, 'Ranking');
        XLSX.writeFile(wb, `Frizzy_${f.replaceAll('/', '-')}.xlsx`);
    });

    document.getElementById('btnImagen')?.addEventListener('click', () => {
        html2canvas(document.getElementById('summaryCapture'), { backgroundColor: '#F7EFDD', scale: 2 }).then(c => {
            const link = document.createElement('a');
            link.download = `Frizzy_${new Date().toLocaleDateString('es-CO').replaceAll('/', '-')}.png`;
            link.href = c.toDataURL();
            link.click();
        });
    });

    // Cerrar día conserva los apartados vigentes (#9)
    document.getElementById('btnCerrar')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('No hay ventas registradas para cerrar');
        ui.confirmarAccion('¿Cerrar el día y limpiar el listado local de ventas? (Los pedidos apartados se conservarán)', () => {
            pedidos = [];
            saveState();
            renderAll();
            ui.mostrarToast('Día cerrado correctamente.');
        });
    });
}

window.addEventListener('online', () => {
    cargarPreciosActualizados();
    sincronizarCola();
});
document.addEventListener('DOMContentLoaded', init);