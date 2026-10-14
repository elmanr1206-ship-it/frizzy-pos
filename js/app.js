import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api, normalizarNombreCliente } from './api.js';

const BOWLS = [{id:'papas', nombre:'Papas', precio:10000, cat:'Bowls Base'}, {id:'yuca', nombre:'Yuca', precio:8000, cat:'Bowls Base'}];
const ACOMPANANTES = [{id:'salchicha', nombre:'Salchicha', precio:3000, cat:'Acompañantes'}, {id:'chorizo', nombre:'Chorizo', precio:5000, cat:'Acompañantes'}, {id:'pollo', nombre:'Pollo (Nuggets)', precio:4000, cat:'Acompañantes'}, {id:'carne', nombre:'Carne', precio:5000, cat:'Acompañantes'}];
const TOPPINGS = [{id:'papachongo', nombre:'Papa Chongo', precio:1000, cat:'Toppings'}, {id:'lechuga', nombre:'Lechuga', precio:500, cat:'Toppings'}, {id:'picodegallo', nombre:'Pico de Gallo', precio:1000, cat:'Toppings'}, {id:'queso', nombre:'Queso', precio:2000, cat:'Toppings'}, {id:'tocineta', nombre:'Salsa de Tocineta', precio:2000, cat:'Toppings'}];
const BEBIDAS = [{id:'vasito', nombre:'Vasito', precio:1500, cat:'Bebidas'}];
const PAGOS = [{id:'efectivo', nombre:'Efectivo'}, {id:'llave', nombre:'Llave'}, {id:'nequi', nombre:'Nequi'}];
const TODO_EL_MENU = [...BOWLS, ...ACOMPANANTES, ...TOPPINGS, ...BEBIDAS];

function leerStorageSeguro(clave, defecto = []) {
    try {
        const raw = localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : defecto;
    } catch (e) {
        console.warn(`Error leyendo ${clave} en localStorage:`, e);
        return defecto;
    }
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

let estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0, premioFidelidad: false };
let pedidos = leerStorageSeguro('fz_pedidos', []);
let apartados = leerStorageSeguro('fz_apartados', []);
let clientesConocidos = leerStorageSeguro('fz_clientes_cache', []);
let filtroPago = null;
let sincronizando = false;
let guardandoEnCurso = false;

function saveState() {
    localStorage.setItem('fz_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('fz_apartados', JSON.stringify(apartados));
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
        inputNombre.style.borderColor = '';
        inputNombre.style.boxShadow = '';
    }
}

async function cargarPreciosActualizados() {
    const cachePrecios = leerStorageSeguro('fz_precios', {});
    TODO_EL_MENU.forEach((item) => {
        if (Number.isFinite(cachePrecios[item.id]) && cachePrecios[item.id] > 0) {
            item.precio = cachePrecios[item.id];
        }
    });
    renderAll();

    if (navigator.onLine) {
        const remotos = await api.obtenerProductos();
        if (Array.isArray(remotos) && remotos.length > 0) {
            const mapa = {};
            remotos.forEach((r) => {
                const prod = TODO_EL_MENU.find((p) => p.id === r.id);
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
    const bowl = BOWLS.find((b) => b.id === estado.bowl);
    if (bowl) t += bowl.precio;

    Object.entries(estado.acomp).forEach(([id, c]) => {
        const item = ACOMPANANTES.find((x) => x.id === id);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.toppings).forEach(([id, c]) => {
        const item = TOPPINGS.find((x) => x.id === id);
        if (item) t += item.precio * c;
    });
    Object.entries(estado.bebidas).forEach(([id, c]) => {
        const item = BEBIDAS.find((x) => x.id === id);
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
    const btnApartar = document.getElementById('btnApartar');
    if (btnGuardar) btnGuardar.disabled = !habilitado;
    if (btnApartar) btnApartar.disabled = !habilitado;
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

function resetForm() {
    estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0, premioFidelidad: false };
    document.getElementById('orderForm').reset();
    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        inputNombre.style.borderColor = '';
        inputNombre.style.boxShadow = '';
    }
    ui.renderSugerenciasClientes([], () => {});
    renderAll();
}

function renderAll() {
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
        onDelete: async (id) => {
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
            ui.mostrarToast('Pedido eliminado en caja y nube');
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
            await procesarGuardado(p, { limpiarFormulario: false });
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

async function procesarGuardado(pedido, { limpiarFormulario = true } = {}) {
    if (guardandoEnCurso) return;
    guardandoEnCurso = true;
    calcularTotal();

    try {
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
    if (sincronizando || !navigator.onLine) return;
    sincronizando = true;

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
    }
}

// ---------------- PANEL ADMINISTRADOR VISUAL (SIN PROMPTS) ----------------
function abrirEditorPreciosEnModal(modal, listaDiv, btnGuardar) {
    if (btnGuardar) btnGuardar.style.display = 'block';
    listaDiv.innerHTML = '';

    const categorias = ['Bowls Base', 'Acompañantes', 'Toppings', 'Bebidas'];
    categorias.forEach((catNombre) => {
        const productosCat = TODO_EL_MENU.filter((p) => p.cat === catNombre);
        if (productosCat.length === 0) return;

        const headerCat = document.createElement('div');
        headerCat.style.cssText = 'font-size:0.76rem; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; color:#2B113F; background:#F4B41A; display:inline-block; padding:4px 10px; border-radius:99px; margin:10px 0 4px 0; align-self:flex-start;';
        headerCat.textContent = catNombre;
        listaDiv.appendChild(headerCat);

        productosCat.forEach((prod) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#FFF9EC; border:1px solid #E2D5B5; border-radius:12px; padding:10px 12px; margin-bottom:6px; gap:8px;';
            row.innerHTML = `
                <div style="flex:1; min-width:0;">
                    <div style="color:#2B113F; font-weight:800; font-size:0.95rem;">${ui.esc(prod.nombre)}</div>
                    <div style="color:#6D5E78; font-size:0.75rem;">ID: ${ui.esc(prod.id)}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="btn-step-minus" style="width:36px; height:36px; border-radius:8px; border:1px solid #D3C4A3; background:#FFF; color:#2B113F; font-weight:900; cursor:pointer;">−500</button>
                    <div style="display:flex; align-items:center; background:#FFFFFF; border-radius:8px; padding:6px 10px; border:2px solid #2B113F;">
                        <span style="color:#2B113F; margin-right:4px; font-weight:900;">$</span>
                        <input type="number" min="100" step="100" data-id="${ui.esc(prod.id)}" value="${Number(prod.precio)}"
                            style="width:82px; text-align:right; border:none; background:transparent; font-size:16px; font-weight:800; color:#2B113F; outline:none;">
                    </div>
                    <button type="button" class="btn-step-plus" style="width:36px; height:36px; border-radius:8px; border:none; background:#F4B41A; color:#2B113F; font-weight:900; cursor:pointer;">+500</button>
                </div>
            `;

            const input = row.querySelector('input');
            row.querySelector('.btn-step-minus').addEventListener('click', () => {
                input.value = Math.max(100, (Number(input.value) || 0) - 500);
            });
            row.querySelector('.btn-step-plus').addEventListener('click', () => {
                input.value = (Number(input.value) || 0) + 500;
            });

            listaDiv.appendChild(row);
        });
    });

    modal.style.display = 'flex';
}

function mostrarLoginEnModal(modal, listaDiv, btnGuardar) {
    if (btnGuardar) btnGuardar.style.display = 'none';
    listaDiv.innerHTML = `
        <div style="background:#FFF9EC; border:1px solid #E2D5B5; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px;">
            <p style="margin:0; font-size:0.9rem; color:#5A4B65; font-weight:600;">
                🔒 Ingresa con tu cuenta de Administrador para modificar los precios del menú en la nube.
            </p>
            <div>
                <label style="display:block; font-size:0.78rem; font-weight:800; color:#2B113F; margin-bottom:4px;">CORREO ELECTRÓNICO</label>
                <input type="email" id="adminLoginEmail" placeholder="elmanr248@gmail.com" autocomplete="username"
                    style="width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1.5px solid #C9B896; font-size:16px; color:#1A1A1A;">
            </div>
            <div>
                <label style="display:block; font-size:0.78rem; font-weight:800; color:#2B113F; margin-bottom:4px;">CONTRASEÑA</label>
                <input type="password" id="adminLoginPass" placeholder="••••••••" autocomplete="current-password"
                    style="width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1.5px solid #C9B896; font-size:16px; color:#1A1A1A;">
            </div>
            <button type="button" id="btnSubmitAdminLogin"
                style="width:100%; min-height:46px; background:#2B113F; color:#F4B41A; border:none; border-radius:10px; font-weight:900; font-size:0.98rem; cursor:pointer; margin-top:4px;">
                Desbloquear Panel de Precios
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
            btn.textContent = 'Desbloquear Panel de Precios';
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
    await cargarPreciosActualizados();
    await sincronizarClientesConocidos();
    sincronizarCola();

    document.getElementById('orderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        procesarGuardado(construirPedido(), { limpiarFormulario: true });
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

    const inputNombre = document.getElementById('nombreCliente');
    if (inputNombre) {
        inputNombre.addEventListener('input', (e) => {
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
        for (const inpt of inputs) {
            const id = inpt.getAttribute('data-id');
            const nuevo = Number(inpt.value);
            const ref = TODO_EL_MENU.find((x) => x.id === id);

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
        btnGuardarPrecios.disabled = false;
        btnGuardarPrecios.textContent = 'Guardar Cambios en Nube';
        renderAll();
        ui.mostrarToast(fallos === 0 ? '✅ Precios actualizados en caja y nube' : `⚠️ Guardado con ${fallos} errores`);
    });

    document.getElementById('btnExcel')?.addEventListener('click', () => {
        if (pedidos.length === 0) return ui.mostrarToast('No hay pedidos');
        const f = new Date().toLocaleDateString('es-CO');

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
        const resArr = [
            { Concepto: 'Fecha reporte', Valor: f },
            { Concepto: 'Total pedidos', Valor: pedidos.length },
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
            link.download = `Frizzy_${new Date().toLocaleDateString('es-CO').replaceAll('/', '-')}.png`;
            link.href = c.toDataURL();
            link.click();
        });
    });

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
    sincronizarClientesConocidos();
    sincronizarCola();
});
document.addEventListener('DOMContentLoaded', init);