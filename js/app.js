import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api } from './api.js';

// NOTA: Con el nuevo modal admin, en el futuro estos precios base
// se podrían cargar directamente desde Supabase al iniciar la app.
const BOWLS = [{id:'papas', nombre:'Papas', precio:10000}, {id:'yuca', nombre:'Yuca', precio:8000}];
const ACOMPANANTES = [{id:'salchicha', nombre:'Salchicha', precio:3000}, {id:'chorizo', nombre:'Chorizo', precio:5000}, {id:'pollo', nombre:'Pollo (Nuggets)', precio:4000}, {id:'carne', nombre:'Carne', precio:5000}];
const TOPPINGS = [{id:'papachongo', nombre:'Papa Chongo', precio:1000}, {id:'lechuga', nombre:'Lechuga', precio:500}, {id:'queso', nombre:'Queso', precio:2000}];
const BEBIDAS = [{id:'vasito', nombre:'Vasito', precio:1500}];
const PAGOS = [{id:'efectivo', nombre:'Efectivo'}, {id:'llave', nombre:'Llave'}, {id:'nequi', nombre:'Nequi'}];

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
    
    const nombreOk = document.getElementById('nombreCliente').value.trim().length > 0;
    const pagoOk = estado.pago !== null;
    const tieneItems = estado.bowl || Object.keys(estado.acomp).length > 0 || Object.keys(estado.toppings).length > 0 || Object.keys(estado.bebidas).length > 0;
    
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
        notas: document.getElementById('notas').value.trim(),
        bowl: bowlObj ? bowlObj.nombre : 'Compra Individual', // <- Corrección 1
        bowlId: estado.bowl || null,
        acompDetalle: mapDetalle(estado.acomp, ACOMPANANTES),
        toppingDetalle: mapDetalle(estado.toppings, TOPPINGS),
        bebidaDetalle: mapDetalle(estado.bebidas, BEBIDAS),
        pago: PAGOS.find(p => p.id === estado.pago).nombre,
        total: estado.total,
        abierto: false
    };
}

function resetForm() {
    estado = { bowl: null, acomp: {}, toppings: {}, bebidas: {}, pago: null, total: 0 };
    document.getElementById('orderForm').reset();
    renderAll();
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
    
    ui.renderOrders(apartados, 'apartadosList', true, {
        onToggle: (id) => { const p = apartados.find(x => x.id === id); p.abierto = !p.abierto; renderAll(); },
        onDelete: (id) => { apartados = apartados.filter(x => x.id !== id); saveState(); ui.mostrarToast('Apartado cancelado'); renderAll(); },
        onConfirm: async (p) => { 
            apartados = apartados.filter(x => x.id !== p.id); 
            p.abierto = false; p.hora = new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'});
            procesarGuardado(p);
        }
    });

    const conteo = {};
    pedidos.forEach(p => {
        [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].forEach(i => conteo[i.nombre] = (conteo[i.nombre] || 0) + i.cantidad);
    });
    ui.renderSummary(pedidos, PAGOS, Object.entries(conteo).sort((a,b) => b[1]-a[1]).slice(0,6));
    calcularTotal();
}

async function procesarGuardado(pedido) {
    pedidos.unshift(pedido); saveState();
    
    // Corrección 2: Construir array de ítems de forma segura, exista o no un bowl.
    const itemsArray = [];
    if (pedido.bowlId) {
        const bowlObj = BOWLS.find(b => b.id === pedido.bowlId);
        if (bowlObj) itemsArray.push({ id: bowlObj.id, precio: bowlObj.precio, cantidad: 1 });
    }

    const pedidoAdaptadoAPI = {
        id: pedido.id, 
        cliente: pedido.nombre, 
        pago: pedido.pago, 
        total: pedido.total,
        notas: pedido.notas, 
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

// ---------------- EVENTOS PRINCIPALES ----------------
document.getElementById('orderForm').addEventListener('submit', (e) => { e.preventDefault(); procesarGuardado(construirPedido()); });
document.getElementById('btnApartar').addEventListener('click', () => { apartados.unshift(construirPedido()); saveState(); ui.mostrarToast('Pedido apartado'); resetForm(); });
document.getElementById('nombreCliente').addEventListener('input', calcularTotal);

// ---------------- MODAL ADMINISTRADOR (LÓGICA VISUAL) ----------------
const modal = document.getElementById('adminModal');
const btnCerrarAdmin = document.getElementById('btnCerrarAdmin');
const btnAdmin = document.getElementById('btnAdmin');
const listaProductosDiv = document.getElementById('adminListaProductos');
const btnGuardarPrecios = document.getElementById('btnGuardarPrecios');

// Unir todo el menú para el ciclo del modal
const TODO_EL_MENU = [...BOWLS, ...ACOMPANANTES, ...TOPPINGS, ...BEBIDAS];

if (btnAdmin) {
    btnAdmin.addEventListener('click', () => {
        // Limpiar lista anterior
        listaProductosDiv.innerHTML = '';
        
        // Generar inputs dinámicos por cada producto
        TODO_EL_MENU.forEach(prod => {
            const row = document.createElement('div');
            row.style.cssText = "display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;";
            
            row.innerHTML = `
                <span style="font-weight: bold;">${prod.nombre}</span>
                <div style="display:flex; align-items:center; gap:5px;">
                    <span style="color:#666;">$</span>
                    <input type="number" id="admin_input_${prod.id}" value="${prod.precio}" data-id="${prod.id}" style="width: 100px; padding: 5px; border-radius: 4px; border: 1px solid #ccc; text-align:right;">
                </div>
            `;
            listaProductosDiv.appendChild(row);
        });
        
        modal.style.display = 'flex'; // Mostrar Modal
    });
}

if (btnCerrarAdmin) {
    btnCerrarAdmin.addEventListener('click', () => modal.style.display = 'none');
}

if (btnGuardarPrecios) {
    btnGuardarPrecios.addEventListener('click', async () => {
        ui.mostrarToast("Sincronizando precios con la nube...");
        btnGuardarPrecios.disabled = true;
        btnGuardarPrecios.textContent = "Guardando...";

        let errores = 0;
        
        // Recorrer los inputs y enviarlos a la API uno por uno
        const inputs = listaProductosDiv.querySelectorAll('input[type="number"]');
        for (const input of inputs) {
            const idProducto = input.getAttribute('data-id');
            const nuevoPrecio = parseFloat(input.value);
            
            // Lógica para detectar si el precio cambió y actualizar el array local (CONSTANTES)
            const productoOriginal = TODO_EL_MENU.find(p => p.id === idProducto);
            if(productoOriginal && productoOriginal.precio !== nuevoPrecio) {
                productoOriginal.precio = nuevoPrecio; // Actualiza en local para la caja
                
                // Actualiza en Supabase
                const { error } = await api.actualizarPrecioProducto(idProducto, nuevoPrecio);
                if(error) errores++;
            }
        }

        btnGuardarPrecios.disabled = false;
        btnGuardarPrecios.textContent = "Guardar y Sincronizar Cambios";
        modal.style.display = 'none';

        if(errores > 0) {
            ui.mostrarToast(`Se guardó con ${errores} errores. Revisa la conexión.`);
        } else {
            ui.mostrarToast("¡Precios actualizados en todo el sistema!");
            calcularTotal(); // Recalcular si había pedido en curso
        }
    });
}

// ---------------- EXPORTACIÓN Y CIERRE ----------------
document.getElementById('btnExcel').addEventListener('click', () => {
    // ... tu código de Excel (sin cambios) ...
});
document.getElementById('btnImagen').addEventListener('click', () => {
    // ... tu código de Imagen (sin cambios) ...
});

document.getElementById('btnCerrar').addEventListener('click', () => {
    if(pedidos.length === 0) return ui.mostrarToast('No hay pedidos');
    ui.confirmarAccion('¿Cerrar el día y borrar ventas locales?', () => {
        pedidos = []; apartados = []; saveState(); renderAll(); ui.mostrarToast('Día cerrado.');
    });
});

window.addEventListener('beforeunload', (e) => { if(pedidos.length > 0 || apartados.length > 0) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('online', sincronizarCola);

async function init() { await dbSync.init(); renderAll(); sincronizarCola(); }
document.addEventListener('DOMContentLoaded', init);