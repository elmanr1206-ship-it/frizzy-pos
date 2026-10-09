import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api } from './api.js';

const BOWLS = [{id:'papas', nombre:'Papas', precio:10000}, {id:'yuca', nombre:'Yuca', precio:8000}];
const ACOMPANANTES = [{id:'salchicha', nombre:'Salchicha', precio:3000}, {id:'chorizo', nombre:'Chorizo', precio:5000}, {id:'pollo', nombre:'Pollo (Nuggets)', precio:4000}, {id:'carne', nombre:'Carne', precio:5000}];
const TOPPINGS = [{id:'papachongo', nombre:'Papa Chongo', precio:1000}, {id:'lechuga', nombre:'Lechuga', precio:500}, {id:'queso', nombre:'Queso', precio:2000}];
const BEBIDAS = [{id:'vasito', nombre:'Vasito', precio:1500}];
const PAGOS = [{id:'efectivo', nombre:'Efectivo'}, {id:'llave', nombre:'Llave'}, {id:'nequi', nombre:'Nequi'}];
const TODO_EL_MENU = [...BOWLS, ...ACOMPANANTES, ...TOPPINGS, ...BEBIDAS];

let estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0 };
let pedidos = JSON.parse(localStorage.getItem('fz_pedidos')) || [];
let apartados = JSON.parse(localStorage.getItem('fz_apartados')) || [];

function saveState() {
    localStorage.setItem('fz_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('fz_apartados', JSON.stringify(apartados));
}

function calcularTotal() {
    let t = 0;
    const bowl = BOWLS.find(b => b.id === estado.bowl);
    if(bowl) t += bowl.precio;
    Object.entries(estado.acomp).forEach(([id, c]) => t += ACOMPANANTES.find(x => x.id === id).precio * c);
    Object.entries(estado.toppings).forEach(([id, c]) => t += TOPPINGS.find(x => x.id === id).precio * c);
    Object.entries(estado.bebidas).forEach(([id, c]) => t += BEBIDAS.find(x => x.id === id).precio * c);
    
    estado.total = t;
    document.getElementById('totalPedido').textContent = ui.fmt(t);
    
    // Validación justificada: Nombre NO vacío + Método de pago + Al menos 1 producto en cualquier categoría
    const nombreOk = document.getElementById('nombreCliente').value.trim().length > 0;
    const pagoOk = estado.pago !== null;
    const tieneItems = estado.bowl !== null || Object.keys(estado.acomp).length > 0 || Object.keys(estado.toppings).length > 0 || Object.keys(estado.bebidas).length > 0;
    
    const habilitado = nombreOk && pagoOk && tieneItems;
    document.getElementById('btnGuardar').disabled = !habilitado;
    document.getElementById('btnApartar').disabled = !habilitado;
}

function construirPedido() {
    const mapDetalle = (store, cat) => Object.entries(store).map(([id, cant]) => {
        const item = cat.find(x => x.id === id);
        return { id: item.id, nombre: item.nombre, cantidad: cant, precio: item.precio, subtotal: item.precio * cant };
    });

    const bowlObj = BOWLS.find(b => b.id === estado.bowl);

    return {
        id: crypto.randomUUID(),
        hora: new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'}),
        nombre: document.getElementById('nombreCliente').value.trim(),
        // Justificación: Si el input de notas está vacío, se envía un string vacío, no un null que rompa la tabla.
        notas: document.getElementById('notas').value.trim() || "", 
        bowl: bowlObj ? bowlObj.nombre : 'Individual', 
        bowlId: estado.bowl || 'ninguno', // Evita enviar null al array de items si no hay bowl
        acompDetalle: mapDetalle(estado.acomp, ACOMPANANTES),
        toppingDetalle: mapDetalle(estado.toppings, TOPPINGS),
        bebidaDetalle: mapDetalle(estado.bebidas, BEBIDAS),
        pago: PAGOS.find(p => p.id === estado.pago)?.nombre || 'Indefinido',
        total: estado.total,
        abierto: false
    };
}

function resetForm() {
    estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0 };
    document.getElementById('orderForm').reset();
    renderAll();
    calcularTotal(); // Justificación: Fuerza el re-bloqueo del botón al limpiar
}

function renderAll() {
    ui.renderChoiceGrid('bowlGrid', BOWLS, () => estado.bowl, (id) => { estado.bowl = (estado.bowl === id ? null : id); renderAll(); });
    ui.renderChoiceGrid('payGrid', PAGOS, () => estado.pago, (id) => { estado.pago = id; renderAll(); });
    ui.renderQtyGrid('acompGrid', ACOMPANANTES, estado.acomp, (id, v) => { v===0 ? delete estado.acomp[id] : estado.acomp[id]=v; renderAll(); });
    ui.renderQtyGrid('toppingGrid', TOPPINGS, estado.toppings, (id, v) => { v===0 ? delete estado.toppings[id] : estado.toppings[id]=v; renderAll(); });
    ui.renderQtyGrid('bebidaGrid', BEBIDAS, estado.bebidas, (id, v) => { v===0 ? delete estado.bebidas[id] : estado.bebidas[id]=v; renderAll(); });
    
    ui.renderOrders(pedidos, 'ordersList', false, {
        onToggle: (id) => { const p = pedidos.find(x => x.id === id); p.abierto = !p.abierto; renderAll(); },
        onDelete: (id) => { pedidos = pedidos.filter(x => x.id !== id); saveState(); ui.mostrarToast('Pedido eliminado'); renderAll(); }
    });
    
    // ... Código de apartados y summary igual ...
    const conteo = {};
    pedidos.forEach(p => { [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].forEach(i => conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad); });
    ui.renderSummary(pedidos, PAGOS, Object.entries(conteo).sort((a,b) => b[1]-a[1]).slice(0,6));
    calcularTotal();
}

async function procesarGuardado(pedido) {
    pedidos.unshift(pedido); saveState();
    
    const itemsArray = [];
    if (pedido.bowlId !== 'ninguno') {
        const bowlObj = BOWLS.find(b => b.id === pedido.bowlId);
        if (bowlObj) itemsArray.push({ id: bowlObj.id, precio: bowlObj.precio, cantidad: 1 });
    }

    const pedidoAdaptadoAPI = {
        id: pedido.id, cliente: pedido.nombre, pago: pedido.pago, total: pedido.total, notas: pedido.notas,
        items: [...itemsArray, ...pedido.acompDetalle, ...pedido.toppingDetalle, ...pedido.bebidaDetalle]
    };
    
    await dbSync.saveToQueue(pedidoAdaptadoAPI);
    ui.mostrarToast(`Pedido guardado — ${ui.fmt(pedido.total)}`);
    resetForm();
    if (navigator.onLine) sincronizarCola();
}

async function sincronizarCola() {
    const cola = await dbSync.getQueue();
    for (let pedido of cola) {
        if (await api.pushPedido(pedido)) await dbSync.removeFromQueue(pedido.id);
    }
}

// ---------------- EVENTOS y LÓGICA DE MODAL (Asignados en init) ----------------
async function init() {
    await dbSync.init();
    renderAll();
    sincronizarCola();
    
    document.getElementById('orderForm').addEventListener('submit', (e) => { e.preventDefault(); procesarGuardado(construirPedido()); });
    document.getElementById('btnApartar').addEventListener('click', () => { apartados.unshift(construirPedido()); saveState(); ui.mostrarToast('Pedido apartado'); resetForm(); });
    document.getElementById('nombreCliente').addEventListener('input', calcularTotal);
    
    // Asignación segura del Modal Admin
    const modal = document.getElementById('adminModal');
    const listaDiv = document.getElementById('adminListaProductos');
    
document.getElementById('btnAdmin')?.addEventListener('click', () => {
        listaDiv.innerHTML = '';
        TODO_EL_MENU.forEach(prod => {
            // Se inyecta el HTML con colores forzados para garantizar el contraste
            listaDiv.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items: center; border-bottom:1px solid #e0e0e0; padding: 12px 0; margin-bottom: 5px;">
                    <span style="color: #1A1A1A; font-weight: 600; font-size: 1rem;">${prod.nombre}</span>
                    <div style="display: flex; align-items: center; background: #f5f5f5; border-radius: 8px; padding: 4px 8px; border: 1px solid #ccc;">
                        <span style="color: #666; margin-right: 5px; font-weight: bold;">$</span>
                        <input type="number" data-id="${prod.id}" value="${prod.precio}" 
                            style="width: 80px; text-align: right; border: none; background: transparent; font-size: 1rem; color: #1A1A1A; outline: none; -webkit-appearance: none; margin: 0;">
                    </div>
                </div>`;
        });
        modal.style.display = 'flex';
    });

    document.getElementById('btnCerrarAdmin')?.addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('btnGuardarPrecios')?.addEventListener('click', async () => {
        const inputs = listaDiv.querySelectorAll('input');
        let fallos = 0;
        document.getElementById('btnGuardarPrecios').disabled = true;

        for(let inpt of inputs) {
            const id = inpt.getAttribute('data-id');
            const nuevo = parseFloat(inpt.value);
            const ref = TODO_EL_MENU.find(x => x.id === id);
            
            if(ref && ref.precio !== nuevo) {
                ref.precio = nuevo; // Cambia local
                const { error } = await api.actualizarPrecioProducto(id, nuevo); // Sincroniza Supabase
                if(error) fallos++;
            }
        }
        
        modal.style.display = 'none';
        document.getElementById('btnGuardarPrecios').disabled = false;
        ui.mostrarToast(fallos === 0 ? "Precios actualizados" : `Actualizados con ${fallos} errores`);
        calcularTotal();
    });
}

window.addEventListener('online', sincronizarCola);
document.addEventListener('DOMContentLoaded', init);