export const ui = {
    fmt(n) {
        return '$' + Number(n || 0).toLocaleString('es-CO');
    },

    // Sanitizador contra XSS y etiquetas rotas (#13)
    esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    renderChoiceGrid(containerId, items, selectedIdOrFn, onSelect) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';
        // Soporta tanto valor directo como función (#7)
        const selectedId = typeof selectedIdOrFn === 'function' ? selectedIdOrFn() : selectedIdOrFn;

        items.forEach(it => {
            const div = document.createElement('div');
            const isSelected = selectedId === it.id;
            div.className = 'choice-card' + (isSelected ? ' selected' : '');
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

            div.innerHTML = `
                <div class="choice-title">${this.esc(it.nombre)}</div>
                ${it.precio !== undefined ? `<div class="choice-price">${this.fmt(it.precio)}</div>` : ''}
            `;

            const activar = () => onSelect(it.id);
            div.addEventListener('click', activar);
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activar();
                }
            });
            c.appendChild(div);
        });
    },

    renderQtyGrid(containerId, items, stateObj, onChange) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';
        items.forEach(it => {
            const cant = stateObj[it.id] || 0;
            const div = document.createElement('div');
            div.className = 'qty-card' + (cant > 0 ? ' active' : '');
            div.innerHTML = `
                <div class="qty-info">
                    <div class="qty-title">${this.esc(it.nombre)}</div>
                    <div class="qty-price">${this.fmt(it.precio)}</div>
                </div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" aria-label="Disminuir ${this.esc(it.nombre)}">−</button>
                    <span class="qty-val">${cant}</span>
                    <button type="button" class="qty-btn" aria-label="Aumentar ${this.esc(it.nombre)}">+</button>
                </div>
            `;
            const [btnMenos, btnMas] = div.querySelectorAll('.qty-btn');
            btnMenos.addEventListener('click', () => onChange(it.id, Math.max(0, cant - 1)));
            btnMas.addEventListener('click', () => onChange(it.id, cant + 1));
            c.appendChild(div);
        });
    },

    renderOrders(lista, containerId, esApartado, callbacks) {
        const c = document.getElementById(containerId);
        if (!c) return;
        if (!lista || lista.length === 0) {
            c.innerHTML = `<p class="empty-msg">${esApartado ? 'No hay pedidos apartados' : 'Aún no hay pedidos registrados'}</p>`;
            return;
        }
        c.innerHTML = '';
        lista.forEach(p => {
            const card = document.createElement('div');
            card.className = 'order-item';
            const extras = [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])]
                .map(i => `${this.esc(i.nombre)} x${Number(i.cantidad)}`)
                .join(', ');

            const badgeSync = !esApartado
                ? `<span style="font-size:0.7rem; padding:2px 6px; border-radius:99px; margin-left:6px; background:${p.syncError ? '#fdecea' : p.sincronizado ? '#e6f4ea' : '#fff8e1'}; color:${p.syncError ? '#b71c1c' : p.sincronizado ? '#1e7e34' : '#b26a00'};">
                    ${p.syncError ? '⚠️ Error Sync' : p.sincronizado ? '☁️ Sincronizado' : '⏳ Pendiente'}
                   </span>`
                : '';

            card.innerHTML = `
                <div class="order-head" style="cursor:pointer;">
                    <div>
                        <strong>${this.esc(p.nombre)}</strong>
                        <span class="order-meta"> · ${this.esc(p.fechaLocal || '')} ${this.esc(p.hora)} · ${this.esc(p.pago)}</span>
                        ${badgeSync}
                    </div>
                    <div class="order-total">${this.fmt(p.total)}</div>
                </div>
                ${p.abierto ? `
                <div class="order-body">
                    <div><strong>Base:</strong> ${this.esc(p.bowl)}</div>${extras ? `<div><strong>Extras:</strong> ${extras}</div>` : ''}
                    ${p.notas ? `<div><strong>Nota:</strong> ${this.esc(p.notas)}</div>` : ''}
                    <div class="order-actions" style="margin-top:8px; display:flex; gap:8px;">
                        ${esApartado ? `<button type="button" class="btn-confirm">Confirmar pago</button>` : ''}
                        <button type="button" class="btn-delete">Eliminar</button>
                    </div>
                </div>` : ''}
            `;

            card.querySelector('.order-head').addEventListener('click', () => callbacks.onToggle(p.id));
            if (p.abierto) {
                card.querySelector('.btn-delete')?.addEventListener('click', () => callbacks.onDelete(p.id));
                card.querySelector('.btn-confirm')?.addEventListener('click', () => callbacks.onConfirm(p));
            }
            c.appendChild(card);
        });
    },

    renderSummary(pedidos, pagos, topItems) {
        const elCount = document.getElementById('sumCount');
        const elTotal = document.getElementById('sumTotal');
        const totalDia = pedidos.reduce((s, p) => s + p.total, 0);
        if (elCount) elCount.textContent = pedidos.length;
        if (elTotal) elTotal.textContent = this.fmt(totalDia);

        const payContainer = document.getElementById('payBreakdown');
        if (payContainer) {
            payContainer.innerHTML = pagos.map(pg => {
                const filtrados = pedidos.filter(p => p.pago === pg.nombre);
                const subtotal = filtrados.reduce((s, p) => s + p.total, 0);
                return `
                    <div class="pay-row">
                        <div>
                            <strong>${this.esc(pg.nombre)}</strong>
                            <div class="pay-sub">${filtrados.length} pedidos</div>
                        </div>
                        <div class="pay-val">${this.fmt(subtotal)}</div>
                    </div>
                `;
            }).join('');
        }

        const topContainer = document.getElementById('topList');
        if (topContainer) {
            topContainer.innerHTML = topItems.length === 0
                ? '<p class="empty-msg">Sin ventas aún</p>'
                : topItems.map(([nombre, cant]) => `
                    <div class="top-row">
                        <span>${this.esc(nombre)}</span>
                        <strong>${Number(cant)} uds.</strong>
                    </div>
                `).join('');
        }
    },

    mostrarToast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    },

    confirmarAccion(mensaje, onAccept) {
        if (window.confirm(mensaje)) onAccept();
    }
};