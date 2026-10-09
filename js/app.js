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
        notas: document.getElementById('notas').value.trim() || "", 
        bowl: bowlObj ? bowlObj.nombre : 'Individual', 
        bowlId: estado.bowl || 'ninguno', 
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
    calcularTotal();
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

// ---------------- EVENTOS y LÓGICA DE INTERFAZ ----------------
async function init() {
    await dbSync.init();
    renderAll();
    sincronizarCola();
    
    document.getElementById('orderForm').addEventListener('submit', (e) => { e.preventDefault(); procesarGuardado(construirPedido()); });
    document.getElementById('btnApartar').addEventListener('click', () => { apartados.unshift(construirPedido()); saveState(); ui.mostrarToast('Pedido apartado'); resetForm(); });
    
    const inputNombre = document.getElementById('nombreCliente');
    inputNombre.addEventListener('input', calcularTotal);
    
    // SISTEMA DE FIDELIZACIÓN: Verifica compras al salir del campo de texto
    inputNombre.addEventListener('blur', async (e) => {
        const nombre = e.target.value.trim();
        if (nombre.length > 0 && navigator.onLine) {
            const numeroCompras = await api.obtenerComprasCliente(nombre);
            if (numeroCompras > 0 && numeroCompras % 5 === 0) {
                ui.mostrarToast(`🌟 ¡Atención! ${nombre} lleva ${numeroCompras} compras. ¡Ofrécele un topping gratis!`);
                e.target.style.borderColor = "var(--dorado)";
                e.target.style.boxShadow = "0 0 8px rgba(255, 215, 0, 0.5)";
            } else {
                e.target.style.borderColor = "#ccc";
                e.target.style.boxShadow = "none";
            }
        }
    });
    
    // Lógica del Modal Admin
    const modal = document.getElementById('adminModal');
    const listaDiv = document.getElementById('adminListaProductos');
    
    document.getElementById('btnAdmin')?.addEventListener('click', () => {
        listaDiv.innerHTML = '';
        TODO_EL_MENU.forEach(prod => {
            listaDiv.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items: center; border-bottom:1px solid #e0e0e0; padding: 12px 0; margin-bottom: 5px;">
                    <span style="color: #1A1A1A; font-weight: 600; font-size: 1rem;">${prod.nombre}</span>
                    <div style="display: flex; align-items: center; background: #f5f5f5; border-radius: 8px; padding: 4px 8px; border: 1px solid #ccc;">
                        <span style="color: #666; margin-right: 5px; font-weight: bold;">$</span>
                        <input type="number" data-id="${prod.id}" value="${prod.precio}" 
                            style="width: 80px; text-align: right; border: none; background: transparent; font-size: 1rem; color: #1A1A1A; outline: none; margin: 0;">
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
                ref.precio = nuevo; 
                const { error } = await api.actualizarPrecioProducto(id, nuevo); 
                if(error) fallos++;
            }
        }
        
        modal.style.display = 'none';
        document.getElementById('btnGuardarPrecios').disabled = false;
        ui.mostrarToast(fallos === 0 ? "Precios actualizados" : `Actualizados con ${fallos} errores`);
        calcularTotal();
    });
}

// ---------------- EXPORTACIÓN Y CIERRE ----------------
document.getElementById('btnExcel').addEventListener('click', () => {
    if(pedidos.length === 0) return ui.mostrarToast('No hay pedidos');
    const f = new Date().toLocaleDateString('es-CO');
    
    const peds = XLSX.utils.json_to_sheet(pedidos.map(p => ({
        'Hora': p.hora, 'Cliente': p.nombre, 'Bowl': p.bowl,
        'Extras': [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].map(i => `${i.nombre} x${i.cantidad}`).join(', '),
        'Notas': p.notas, 'Pago': p.pago, 'Total': p.total
    })));
    peds['!cols'] = [{wch:8},{wch:18},{wch:10},{wch:40},{wch:20},{wch:14},{wch:10}];

    const totalDia = pedidos.reduce((s,p) => s + p.total, 0);
    const resArr = [{Concepto:'Fecha', Valor:f}, {Concepto:'Total pedidos', Valor:pedidos.length}, {Concepto:'Total ventas', Valor:totalDia}, {Concepto:'', Valor:''}];
    PAGOS.forEach(pg => {
        const d = pedidos.filter(p => p.pago === pg.nombre);
        resArr.push({Concepto: `${pg.nombre} pedidos`, Valor: d.length}, {Concepto: `${pg.nombre} total`, Valor: d.reduce((s,p) => s + p.total, 0)});
    });
    
    const conteo = {};
    pedidos.forEach(p => [...p.acompDetalle, ...p.toppingDetalle, ...p.bebidaDetalle].forEach(i => conteo[i.nombre] = (conteo[i.nombre]||0) + i.cantidad));
    const rnk = XLSX.utils.json_to_sheet(Object.entries(conteo).sort((a,b)=>b[1]-a[1]).map(([n,c]) => ({Producto:n, Vendidos:c})));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resArr, {skipHeader:true}), 'Resumen');
    XLSX.utils.book_append_sheet(wb, peds, 'Pedidos');
    XLSX.utils.book_append_sheet(wb, rnk, 'Ranking');
    XLSX.writeFile(wb, `Frizzy_${f.replaceAll('/','-')}.xlsx`);
});

document.getElementById('btnImagen').addEventListener('click', () => {
    html2canvas(document.getElementById('summaryCapture'), {backgroundColor:'#F7EFDD', scale:2}).then(c => {
        const link = document.createElement('a');
        link.download = `Frizzy_${new Date().toLocaleDateString('es-CO').replaceAll('/','-')}.png`;
        link.href = c.toDataURL(); link.click();
    });
});

document.getElementById('btnCerrar').addEventListener('click', () => {
    if(pedidos.length === 0) return ui.mostrarToast('No hay pedidos');
    ui.confirmarAccion('¿Cerrar el día y borrar ventas locales?', () => {
        pedidos = []; apartados = []; saveState(); renderAll(); ui.mostrarToast('Día cerrado.');
    });
});

window.addEventListener('beforeunload', (e) => { if(pedidos.length > 0 || apartados.length > 0) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('online', sincronizarCola);
document.addEventListener('DOMContentLoaded', init);