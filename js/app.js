import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api } from './api.js';

// Catálogo Frizzy
const DATA = {
    bowls: [
        {id:'papas', nombre:'Papas', precio:10000},
        {id:'yuca', nombre:'Yuca', precio:8000}
    ],
    acompanantes: [
        {id:'salchicha', nombre:'Salchicha', precio:3000},
        {id:'chorizo', nombre:'Chorizo', precio:5000},
        {id:'pollo', nombre:'Pollo (Nuggets)', precio:4000}
    ],
    toppings: [
        {id:'queso', nombre:'Queso', precio:2000},
        {id:'tocineta', nombre:'Tocineta', precio:2000},
        {id:'picodegallo', nombre:'Pico de Gallo', precio:1000}
    ],
    pagos: [
        {id:'efectivo', nombre:'Efectivo'},
        {id:'nequi', nombre:'Nequi'},
        {id:'llave', nombre:'Llave'}
    ]
};

// Estado reactivo del pedido actual
let estado = { bowl: null, acomp: {}, toppings: {}, pago: null, total: 0 };

function calcularTotal() {
    let total = 0;
    const bowl = DATA.bowls.find(b => b.id === estado.bowl);
    if (bowl) total += bowl.precio;
    
    Object.entries(estado.acomp).forEach(([id, cant]) => {
        total += DATA.acompanantes.find(a => a.id === id).precio * cant;
    });
    Object.entries(estado.toppings).forEach(([id, cant]) => {
        total += DATA.toppings.find(t => t.id === id).precio * cant;
    });
    
    estado.total = total;
    document.getElementById('totalPedido').textContent = `$${total.toLocaleString('es-CO')}`;
    
    // Validación de formulario
    const hasNombre = document.getElementById('nombreCliente').value.trim().length > 0;
    const hasHabeas = document.getElementById('habeasData').checked;
    document.getElementById('btnGuardar').disabled = !(hasNombre && hasHabeas && estado.bowl && estado.pago);
}

function renderAll() {
    ui.renderSingleChoice('bowlGrid', DATA.bowls, estado.bowl, (id) => { estado.bowl = id; updateUI(); });
    ui.renderSingleChoice('payGrid', DATA.pagos, estado.pago, (id) => { estado.pago = id; updateUI(); });
    
    ui.renderQtyChoice('acompGrid', DATA.acompanantes, estado.acomp, (id, val) => {
        if(val === 0) delete estado.acomp[id]; else estado.acomp[id] = val;
        updateUI();
    });
    ui.renderQtyChoice('toppingGrid', DATA.toppings, estado.toppings, (id, val) => {
        if(val === 0) delete estado.toppings[id]; else estado.toppings[id] = val;
        updateUI();
    });
}

function updateUI() {
    renderAll();
    calcularTotal();
}

async function sincronizarColaOffline() {
    if (!navigator.onLine) return; // Regla Offline-First
    const cola = await dbSync.getQueue();
    if(cola.length > 0) ui.mostrarToast('Sincronizando pedidos guardados sin conexión...');
    
    for (let pedido of cola) {
        const success = await api.pushPedido(pedido);
        if (success) await dbSync.removeFromQueue(pedido.id);
    }
}

async function init() {
    await dbSync.init(); // Inicializa IndexedDB
    
    // Listeners del DOM y Red[cite: 3]
    document.getElementById('nombreCliente').addEventListener('input', calcularTotal);
    document.getElementById('habeasData').addEventListener('change', calcularTotal);
    window.addEventListener('online', sincronizarColaOffline);
    
    updateUI();

    document.getElementById('orderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pedido = {
            id: Date.now().toString(),
            cliente: document.getElementById('nombreCliente').value,
            bowl: estado.bowl,
            acomp: estado.acomp,
            toppings: estado.toppings,
            pago: estado.pago,
            total: estado.total,
            timestamp: new Date().toISOString()
        };

        // Regla estricta: Guardar primero en IndexedDB[cite: 3]
        await dbSync.saveToQueue(pedido);
        ui.mostrarToast('✅ Pedido guardado localmente');
        
        // Resetear UI
        estado = { bowl: null, acomp: {}, toppings: {}, pago: null, total: 0 };
        document.getElementById('orderForm').reset();
        updateUI();
        
        // Intentar sincronizar inmediatamente si hay internet
        sincronizarColaOffline();
    });

    // Mostrar cola actual en UI
    async function actualizarListaOffline() {
        const cola = await dbSync.getQueue();
        ui.renderOrdersList(cola);
    }
    
    // Llamar esto después de guardar o sincronizar
    document.getElementById('orderForm').addEventListener('submit', async (e) => {
        // ... (tu código actual de submit) ...
        await actualizarListaOffline(); 
    });

    document.getElementById('btnSyncNow').addEventListener('click', () => {
        ui.mostrarToast('Intentando sincronizar con la nube...');
        sincronizarColaOffline().then(actualizarListaOffline);
    });

    actualizarListaOffline();
}

document.addEventListener('DOMContentLoaded', init);