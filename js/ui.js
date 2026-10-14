export const ui = {
    fmt(n) {
        return '$' + Number(n || 0).toLocaleString('es-CO');
    },

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
                <div class="qty-info" style="cursor:pointer; flex:1;" title="Toca para sumar 1">
                    <div class="qty-title">${this.esc(it.nombre)}</div>
                    <div class="qty-price">${this.fmt(it.precio)}</div>
                </div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" style="min-width:44px; min-height:44px;" aria-label="Disminuir ${this.esc(it.nombre)}">−</button>
                    <span class="qty-val">${cant}</span>
                    <button type="button" class="qty-btn" style="min-width:44px; min-height:44px;" aria-label="Aumentar ${this.esc(it.nombre)}">+</button>
                </div>
            `;
            // UX Rápida: tocar el nombre/precio del producto también suma +1 directamente
            div.querySelector('.qty-info').addEventListener('click', () => onChange(it.id, cant + 1));
            const [btnMenos, btnMas] = div.querySelectorAll('.qty-btn');
            btnMenos.addEventListener('click', (e) => { e.stopPropagation(); onChange(it.id, Math.max(0, cant - 1)); });
            btnMas.addEventListener('click', (e) => { e.stopPropagation(); onChange(it.id, cant + 1); });
            c.appendChild(div);
        });
    },

    renderOrders(lista, containerId, esApartado, callbacks) {
        const c = document.getElementById(containerId);
        if (!c) return;
        if (!lista || lista.length === 0) {
            c.innerHTML = `<p class="empty-msg">${esApartado ? 'No hay pedidos apartados' : 'Aún no hay pedidos registrados hoy'}</p>`;
            return;
        }
        c.innerHTML = '';
        lista.forEach(p => {
            const card = document.createElement('div');
            card.className = 'order-item';

            const todosLosExtras = [...(p.acompDetalle || []), ...(p.toppingDetalle || []), ...(p.bebidaDetalle || [])];
            const resumenCorto = todosLosExtras.length > 0
                ? `${this.esc(p.bowl)} + ${todosLosExtras.reduce((acc, i) => acc + Number(i.cantidad), 0)} extras`
                : this.esc(p.bowl);

            const filasDetalle = todosLosExtras.map(i => `
                <li style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed rgba(0,0,0,0.08);">
                    <span>${this.esc(i.nombre)} <strong>x${Number(i.cantidad)}</strong></span>
                    <span>${this.fmt((i.precio || 0) * i.cantidad)}</span>
                </li>
            `).join('');

            const badgeSync = !esApartado
                ? `<span style="font-size:0.72rem; padding:2px 7px; border-radius:99px; margin-left:6px; font-weight:700; background:${p.syncError ? '#fdecea' : p.sincronizado ? '#e6f4ea' : '#fff8e1'}; color:${p.syncError ? '#b71c1c' : p.sincronizado ? '#1e7e34' : '#b26a00'};">
                    ${p.syncError ? '⚠️ Error' : p.sincronizado ? '☁️ Nube' : '⏳ Local'}
                   </span>`
                : '';

            card.innerHTML = `
                <div class="order-head" role="button" tabindex="0" aria-expanded="${p.abierto ? 'true' : 'false'}" style="cursor:pointer; min-height:48px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                            <strong style="font-size:1rem;">${this.esc(p.nombre)}</strong>
                            <span class="order-meta"> · ${this.esc(p.hora)} · ${this.esc(p.pago)}</span>
                            ${badgeSync}
                        </div>
                        <div style="font-size:0.82rem; color:#666; margin-top:2px;">
                            ${resumenCorto}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="order-total" style="font-weight:800;">${this.fmt(p.total)}</div>
                        <span style="font-size:0.8rem; color:#5F2C82; font-weight:700; padding:4px 8px; background:rgba(95,44,130,0.08); border-radius:6px;">
                            ${p.abierto ? '▲ Ocultar' : '▼ Detalle'}
                        </span>
                    </div>
                </div>
                ${p.abierto ? `
                <div class="order-body" style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,0,0,0.1); font-size:0.92rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <span><strong>Base:</strong> ${this.esc(p.bowl)}</span>
                    </div>
                    ${filasDetalle ? `
                        <div style="margin-bottom:6px;">
                            <strong>Adiciones y Bebidas:</strong>
                            <ul style="list-style:none; padding:0; margin:4px 0 0 0;">${filasDetalle}</ul>
                        </div>
                    ` : ''}
                    ${p.notas ? `<div style="background:#fff8e1; padding:6px 10px; border-radius:6px; margin-top:6px;"><strong>📝 Nota:</strong> ${this.esc(p.notas)}</div>` : ''}
                    <div class="order-actions" style="margin-top:12px; display:flex; gap:10px;">
                        ${esApartado ? `<button type="button" class="btn-confirm" style="min-height:44px; padding:0 14px;">✅ Confirmar pago</button>` : ''}
                        <button type="button" class="btn-delete" style="min-height:44px; padding:0 14px;">🗑️ Eliminar</button>
                    </div>
                </div>` : ''}
            `;

            const head = card.querySelector('.order-head');
            head.addEventListener('click', () => callbacks.onToggle(p.id));
            head.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    callbacks.onToggle(p.id);
                }
            });

            if (p.abierto) {
                card.querySelector('.btn-delete')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    callbacks.onDelete(p.id);
                });
                card.querySelector('.btn-confirm')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    callbacks.onConfirm(p);
                });
            }
            c.appendChild(card);
        });
    },

    renderSugerenciasClientes(coincidencias, onSelect) {
        const box = document.getElementById('sugerenciasClientes');
        if (!box) return;
        if (!coincidencias || coincidencias.length === 0) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        box.innerHTML = coincidencias.map(nombre => `
            <button type="button" class="sugerencia-item" data-nombre="${this.esc(nombre)}"
                style="width:100%; min-height:44px; text-align:left; padding:10px 14px; background:#fff; border:none; border-bottom:1px solid #eee; font-size:16px; color:#1A1A1A; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                <span>👤 ${this.esc(nombre)}</span>
                <span style="font-size:0.78rem; color:#5F2C82; font-weight:700;">Tocar para elegir</span>
            </button>
        `).join('');
        box.style.display = 'block';

        box.querySelectorAll('.sugerencia-item').forEach(btn => {
            // mousedown / touchstart evita que el evento blur del input cierre la lista antes del clic
            const elegir = (e) => {
                e.preventDefault();
                onSelect(btn.getAttribute('data-nombre'));
                box.style.display = 'none';
            };
            btn.addEventListener('mousedown', elegir);
            btn.addEventListener('touchstart', elegir, { passive: false });
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