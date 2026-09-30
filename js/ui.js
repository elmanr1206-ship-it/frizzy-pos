export const ui = {
    renderSingleChoice(containerId, items, selectedId, onSelect) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const btn = document.createElement('div');
            btn.className = 'choice-card' + (selectedId === it.id ? ' selected' : '');
            btn.innerHTML = `<div class="card-name">${it.nombre}</div><div class="card-price">$${it.precio.toLocaleString('es-CO')}</div>`;
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
            card.className = 'qty-card';
            if(qty > 0) card.classList.add('selected');
            
            card.innerHTML = `
                <div><div class="card-name">${it.nombre}</div><div class="card-price">$${it.precio.toLocaleString('es-CO')}</div></div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn">−</button>
                    <span style="font-weight:bold;">${qty}</span>
                    <button type="button" class="qty-btn">+</button>
                </div>
            `;
            const btns = card.querySelectorAll('.qty-btn');
            btns[0].onclick = () => onChange(it.id, Math.max(0, qty - 1));
            btns[1].onclick = () => onChange(it.id, qty + 1);
            container.appendChild(card);
        });
    },

    renderApartados(apartados, onConfirmar, onCancelar) {
        const list = document.getElementById('apartadosList');
        if (!apartados || apartados.length === 0) {
            list.innerHTML = '<div style="color:var(--morado-700); padding:10px; text-align:center;">No hay apartados.</div>';
            return;
        }
        list.innerHTML = apartados.map(p => `
            <div class="order-item" style="padding: 10px;">
                <div class="order-head">
                    <div><div class="who">${p.cliente}</div><div class="meta">${p.bowl}</div></div>
                    <div class="right"><span class="chip">${p.pago}</span><span style="font-weight:900;">$${p.total.toLocaleString('es-CO')}</span></div>
                </div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button type="button" class="btn-guardar" id="conf-${p.id}" style="margin-top:0; padding:10px;">Confirmar</button>
                    <button type="button" class="btn-secundario" id="canc-${p.id}" style="margin-top:0; padding:10px;">Cancelar</button>
                </div>
            </div>
        `).join('');

        apartados.forEach(p => {
            document.getElementById(`conf-${p.id}`).onclick = () => onConfirmar(p);
            document.getElementById(`canc-${p.id}`).onclick = () => onCancelar(p.id);
        });
    },

    renderPedidosHoy(pedidos) {
        const list = document.getElementById('ordersList');
        if (!pedidos || pedidos.length === 0) {
            list.innerHTML = '<div style="color:var(--morado-700); padding:10px; text-align:center;">Sin pedidos aún.</div>';
            return;
        }
        list.innerHTML = pedidos.map(p => `
            <div class="order-item" style="padding: 15px;">
                <div class="order-head" style="padding:0;">
                    <div><div class="who">${p.cliente}</div><div class="meta">${new Date(p.timestamp).toLocaleTimeString()}</div></div>
                    <div class="right"><span class="chip">${p.pago}</span><span style="font-weight:900;">$${p.total.toLocaleString('es-CO')}</span></div>
                </div>
            </div>
        `).join('');
    },

    renderCierreCaja(pedidos, pagosPermitidos) {
        document.getElementById('statPedidos').textContent = pedidos.length;
        const total = pedidos.reduce((sum, p) => sum + p.total, 0);
        document.getElementById('statTotal').textContent = `$${total.toLocaleString('es-CO')}`;

        const paySummary = document.getElementById('paySummary');
        paySummary.innerHTML = pagosPermitidos.map(pg => {
            const pedidosMedio = pedidos.filter(p => p.pago === pg.id);
            const suma = pedidosMedio.reduce((sum, p) => sum + p.total, 0);
            return `
                <div style="display:flex; justify-content:space-between; background:var(--crema-2); padding:10px; border-radius:8px; border: 1px solid #E9DEC0; margin-bottom:5px;">
                    <div><strong>${pg.nombre}</strong><br><small style="color:var(--morado-700);">${pedidosMedio.length} pedidos</small></div>
                    <div style="font-weight:900;">$${suma.toLocaleString('es-CO')}</div>
                </div>
            `;
        }).join('');
    },

    mostrarToast(mensaje) {
        const toast = document.getElementById('toast');
        toast.textContent = mensaje;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};