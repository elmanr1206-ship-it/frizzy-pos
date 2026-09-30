export const ui = {
    fmt(n) { return '$' + n.toLocaleString('es-CO'); },

    renderChoiceGrid(containerId, items, selectedId, onSelect) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const btn = document.createElement('div');
            btn.className = 'choice-card' + (selectedId === it.id ? ' selected' : '');
            btn.innerHTML = `<div class="name">${it.nombre}</div>${it.precio ? `<div class="price">${this.fmt(it.precio)}</div>` : ''}`;
            btn.onclick = () => onSelect(it.id);
            container.appendChild(btn);
        });
    },

    renderQtyGrid(containerId, items, store, onChange) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const qty = store[it.id] || 0;
            const card = document.createElement('div');
            card.className = 'qty-card' + (qty > 0 ? ' active' : '');
            card.innerHTML = `
                <div class="info"><div class="name">${it.nombre}</div><div class="price">${this.fmt(it.precio)}</div></div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" aria-label="menos">−</button>
                    <span class="qty-num">${qty}</span>
                    <button type="button" class="qty-btn" aria-label="mas">+</button>
                </div>
            `;
            const btns = card.querySelectorAll('.qty-btn');
            btns[0].onclick = () => onChange(it.id, Math.max(0, qty - 1));
            btns[1].onclick = () => onChange(it.id, qty + 1);
            container.appendChild(card);
        });
    },

    renderOrders(pedidos, listId, isApartado, callbacks) {
        const list = document.getElementById(listId);
        if (pedidos.length === 0) {
            list.innerHTML = `<div class="empty-msg">${isApartado ? 'No hay pedidos apartados por ahora.' : 'Aún no hay pedidos hoy. ¡El primero está por llegar! 🍟'}</div>`;
            return;
        }
        list.innerHTML = '';
        pedidos.forEach(p => {
            const item = document.createElement('div');
            item.className = 'order-item';
            
            const mapDetalles = (arr) => (arr || []).map(x => `<li>${x.nombre} x${x.cantidad} — ${this.fmt(x.subtotal)}</li>`).join('');
            const extrasList = mapDetalles(p.acompDetalle) + mapDetalles(p.toppingDetalle) + mapDetalles(p.bebidaDetalle);

            item.innerHTML = `
                <div class="order-head">
                    <div><div class="who">${p.nombre}</div><div class="meta">${p.hora} · ${p.bowl}</div></div>
                    <div class="right">
                        <span class="chip">${p.pago}</span><span class="amt">${this.fmt(p.total)}</span>
                        <button type="button" class="icon-del-btn cancel-btn" aria-label="Eliminar">🗑</button>
                    </div>
                </div>
                <div class="order-body ${p.abierto ? 'open' : ''}">
                    <ul><li><strong>Bowl:</strong> ${p.bowl}</li>${extrasList}</ul>
                    ${p.notas ? `<div class="notes">Nota: ${p.notas}</div>` : ''}
                    ${isApartado 
                        ? `<div style="display:flex; gap:8px; margin-top:8px;"><button type="button" class="btn-guardar confirm-btn" style="flex:1; padding:9px;">Confirmar pedido</button><button type="button" class="del-btn cancel-btn" style="flex:1;">Cancelar</button></div>`
                        : `<button type="button" class="del-btn cancel-btn">Eliminar pedido</button>`}
                </div>
            `;
            
            item.querySelector('.order-head').addEventListener('click', (e) => {
                if(!e.target.closest('button')) callbacks.onToggle(p.id);
            });
            
            item.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmarAccion(isApartado ? `¿Cancelar el apartado de ${p.nombre}?` : `¿Eliminar el pedido de ${p.nombre}?`, () => callbacks.onDelete(p.id));
            }));

            if(isApartado) {
                item.querySelector('.confirm-btn').addEventListener('click', (e) => {
                    e.stopPropagation(); callbacks.onConfirm(p);
                });
            }
            list.appendChild(item);
        });
    },

    renderSummary(pedidos, pagos, topItems) {
        document.getElementById('statPedidos').textContent = pedidos.length;
        document.getElementById('statTotal').textContent = this.fmt(pedidos.reduce((s, p) => s + p.total, 0));

        const paySummary = document.getElementById('paySummary');
        paySummary.innerHTML = pagos.map(pg => {
            const delMedio = pedidos.filter(p => p.pago === pg.nombre);
            const suma = delMedio.reduce((s, p) => s + p.total, 0);
            return `<div class="pay-row"><div><div class="pn">${pg.nombre}</div><div class="pc">${delMedio.length} pedidos</div></div><div class="pv">${this.fmt(suma)}</div></div>`;
        }).join('');

        const topList = document.getElementById('topList');
        if(topItems.length === 0){
            topList.innerHTML = '<div class="empty-msg" style="padding:10px 0;">Sin datos todavía.</div>';
        } else {
            topList.innerHTML = topItems.map(([nombre, cant]) => `<div class="top-row"><span>${nombre}</span><span>${cant} uds.</span></div>`).join('');
        }
    },

    mostrarToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), 2400);
    },

    confirmarAccion(mensaje, onConfirm) {
        const overlay = document.getElementById('confirmOverlay');
        document.getElementById('confirmMsg').textContent = mensaje;
        overlay.classList.add('show');
        const btnSi = document.getElementById('confirmSi');
        const btnNo = document.getElementById('confirmNo');
        
        const cerrar = () => { overlay.classList.remove('show'); btnSi.replaceWith(btnSi.cloneNode(true)); btnNo.replaceWith(btnNo.cloneNode(true)); };
        
        document.getElementById('confirmSi').addEventListener('click', () => { cerrar(); onConfirm(); });
        document.getElementById('confirmNo').addEventListener('click', cerrar);
    }
};