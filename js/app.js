import { ui } from './ui.js';
import { dbSync } from './dbSync.js';
import { api } from './api.js';

const DATA = {
    bowls: [{id:'papas', nombre:'Papas', precio:10000}, {id:'yuca', nombre:'Yuca', precio:8000}],
    acompanantes: [{id:'salchicha', nombre:'Salchicha', precio:3000}, {id:'chorizo', nombre:'Chorizo', precio:5000}],
    toppings: [{id:'queso', nombre:'Queso', precio:2000}, {id:'tocineta', nombre:'Tocineta', precio:2000}],
    pagos: [{id:'Efectivo', nombre:'Efectivo'}, {id:'Nequi', nombre:'Nequi'}, {id:'Llave', nombre:'Llave'}]
};

let estado = { bowl: null, acomp: {}, toppings: {}, pago: null, total: 0 };
let pedidosHoy = JSON.parse(localStorage.getItem('frizzy_pedidos')) || [];
let apartados = JSON.parse(localStorage.getItem('frizzy_apartados')) || [];

function calcularTotal() {
    let total = 0;
    const bowl = DATA.bowls.find(b => b.id === estado.bowl);
    if (bowl) total += bowl.precio;
    Object.entries(estado.acomp).forEach(([id, cant]) => total += DATA.acompanantes.find(a => a.id === id).precio * cant);
    Object.entries(estado.toppings).forEach(([id, cant]) => total += DATA.toppings.find(t => t.id === id).precio * cant);
    
    estado.total = total;
    document.getElementById('totalPedido').textContent = `$${total.toLocaleString('es-CO')}`;
    
    const isValid = document.getElementById('nombreCliente').value.trim().length > 0 
                 && document.getElementById('habeasData').checked 
                 && estado.bowl && estado.pago;
                 
    document.getElementById('btnGuardar').disabled = !isValid;
    document.getElementById('btnApartar').disabled = !isValid;
}

function updateUI() {
    ui.renderSingleChoice('bowlGrid', DATA.bowls, estado.bowl, (id) => { estado.bowl = id; updateUI(); });
    ui.renderSingleChoice('payGrid', DATA.pagos, estado.pago, (id) => { estado.pago = id; updateUI(); });
    ui.renderQtyChoice('acompGrid', DATA.acompanantes, estado.acomp, (id, val) => { val === 0 ? delete estado.acomp[id] : estado.acomp[id] = val; updateUI(); });
    ui.renderQtyChoice('toppingGrid', DATA.toppings, estado.toppings, (id, val) => { val === 0 ? delete estado.toppings[id] : estado.toppings[id] = val; updateUI(); });
    
    ui.renderApartados(apartados, confirmarApartado, cancelarApartado);
    ui.renderPedidosHoy(pedidosHoy);
    ui.renderCierreCaja(pedidosHoy, DATA.pagos);
    calcularTotal();
}

function generarObjetoPedido() {
    return {
        id: Date.now().toString(),
        cliente: document.getElementById('nombreCliente').value.trim(),
        bowl: estado.bowl,
        acomp: estado.acomp,
        toppings: estado.toppings,
        pago: estado.pago,
        total: estado.total,
        timestamp: new Date().toISOString()
    };
}

function resetForm() {
    estado = { bowl: null, acomp: {}, toppings: {}, pago: null, total: 0 };
    document.getElementById('orderForm').reset();
    updateUI();
}

// ---------------- LÓGICA DE APARTADOS ----------------
document.getElementById('btnApartar').addEventListener('click', () => {
    apartados.unshift(generarObjetoPedido());
    localStorage.setItem('frizzy_apartados', JSON.stringify(apartados));
    ui.mostrarToast('Pedido apartado temporalmente');
    resetForm();
});

function confirmarApartado(pedido) {
    apartados = apartados.filter(a => a.id !== pedido.id);
    localStorage.setItem('frizzy_apartados', JSON.stringify(apartados));
    procesarPedidoFinal(pedido);
}

function cancelarApartado(id) {
    if(confirm('¿Eliminar este apartado?')) {
        apartados = apartados.filter(a => a.id !== id);
        localStorage.setItem('frizzy_apartados', JSON.stringify(apartados));
        updateUI();
    }
}

// ---------------- LÓGICA CORE: GUARDAR Y SINCRONIZAR ----------------
document.getElementById('orderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    procesarPedidoFinal(generarObjetoPedido());
});

async function procesarPedidoFinal(pedido) {
    // 1. Guardar localmente para el cierre de caja de hoy
    pedidosHoy.unshift(pedido);
    localStorage.setItem('frizzy_pedidos', JSON.stringify(pedidosHoy));
    
    // 2. Offline-First: Cola de base de datos[cite: 5]
    await dbSync.saveToQueue(pedido);
    ui.mostrarToast('✅ Pedido guardado en cola local');
    resetForm();
    
    // 3. Intentar subir a Supabase
    sincronizarColaOffline();
}

async function sincronizarColaOffline() {
    if (!navigator.onLine) return;
    const cola = await dbSync.getQueue();
    for (let pedido of cola) {
        const success = await api.pushPedido(pedido);
        if (success) await dbSync.removeFromQueue(pedido.id);
    }
}

// ---------------- REPORTES Y EXPORTACIÓN[cite: 4] ----------------
document.getElementById('btnExcel').addEventListener('click', () => {
    if(pedidosHoy.length === 0) return ui.mostrarToast('No hay ventas para exportar');
    const filas = pedidosHoy.map(p => ({
        'Hora': new Date(p.timestamp).toLocaleTimeString(),
        'Cliente': p.cliente, 'Bowl': p.bowl, 'Medio Pago': p.pago, 'Total': p.total
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Pedidos');
    XLSX.writeFile(wb, `Frizzy_Ventas_${new Date().toLocaleDateString('es-CO')}.xlsx`);
    ui.mostrarToast('Excel exportado');
});

document.getElementById('btnImagen').addEventListener('click', () => {
    html2canvas(document.getElementById('summaryCapture'), { backgroundColor: '#F7EFDD' }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Cierre_${new Date().toLocaleDateString('es-CO')}.png`;
        link.href = canvas.toDataURL();
        link.click();
    });
});

document.getElementById('btnCerrarDia').addEventListener('click', () => {
    if(confirm('¿Cerrar el día? Esto limpiará la lista local (Asegúrate de que todo haya sincronizado a la nube).')) {
        pedidosHoy = []; apartados = [];
        localStorage.removeItem('frizzy_pedidos');
        localStorage.removeItem('frizzy_apartados');
        updateUI();
        ui.mostrarToast('Día reiniciado correctamente');
    }
});

// Inicialización
async function init() {
    await dbSync.init();
    document.getElementById('nombreCliente').addEventListener('input', calcularTotal);
    document.getElementById('habeasData').addEventListener('change', calcularTotal);
    window.addEventListener('online', sincronizarColaOffline);
    updateUI();
    sincronizarColaOffline();
}
document.addEventListener('DOMContentLoaded', init);