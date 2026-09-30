export const ui = {
    renderSingleChoice(containerId, items, selectedId, onSelect) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const btn = document.createElement('div');
            btn.className = 'choice-card' + (selectedId === it.id ? ' selected' : '');
            btn.innerHTML = `<div class="name">${it.nombre}</div>${it.precio ? `<div class="price">$${it.precio.toLocaleString('es-CO')}</div>` : ''}`;
            btn.onclick = () => onSelect(it.id);
            container.appendChild(btn);
        });
    },

    renderQtyChoice(containerId, items, store, onChange) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const qty = store[it.id] || 0;
            const card = document.createElement('div');
            card.className = 'qty-card' + (qty > 0 ? ' active' : '');
            card.innerHTML = `
                <div class="info">
                    <div class="name">${it.nombre}</div>
                    <div class="price">$${it.precio.toLocaleString('es-CO')}</div>
                </div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" aria-label="Quitar">>−</button>
                    <span class="qty-num">${qty}</span>
                    <button type="button" class="qty-btn" aria-label="Agregar">+</button>
                </div>
            `;
            
            const btns = card.querySelectorAll('.qty-btn');
            btns[0].onclick = () => onChange(it.id, Math.max(0, qty - 1));
            btns[1].onclick = () => onChange(it.id, qty + 1);
            container.appendChild(card);
        });
    },

    renderOrdersList(pedidos) {
        const list = document.getElementById('ordersList');
        if (pedidos.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--morado-700)">No hay pedidos en cola offline. Todo está sincronizado.</div>';
            return;
        }
        list.innerHTML = pedidos.map(p => `
            <div class="order-item">
                <div class="order-head">
                    <div>
                        <div class="who">${p.cliente}</div>
                        <div class="meta">${new Date(p.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <div class="right">
                        <span class="chip">${p.pago}</span>
                        <span style="font-weight:900; color:var(--morado-900);">$${p.total.toLocaleString('es-CO')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    mostrarToast(mensaje) {
        const toast = document.getElementById('toast');
        toast.textContent = mensaje;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};