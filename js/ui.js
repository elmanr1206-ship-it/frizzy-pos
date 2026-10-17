export const ui = {
    fmt: (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'),

    esc(str) {
        return String(str ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    formatearCuentaRegresiva(isoStr) {
        if (!isoStr) return null;
        const target = new Date(isoStr).getTime();
        if (Number.isNaN(target)) return null;
        const diffSeg = Math.floor((target - Date.now()) / 1000);

        if (diffSeg <= 0) {
            return { vencido: true, urgente: true, texto: '🔔 ¡LISTO PARA ENTREGAR!' };
        }
        const horas = Math.floor(diffSeg / 3600);
        const mins = Math.floor((diffSeg % 3600) / 60);
        const segs = diffSeg % 60;

        if (horas > 0) {
            return {
                vencido: false,
                urgente: false,
                texto: `⏳ En ${horas}h ${String(mins).padStart(2, '0')}m`
            };
        }
        return {
            vencido: false,
            urgente: mins < 5,
            texto: `⏳ ${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`
        };
    },

    renderCombos(containerId, combos, onSelectCombo) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        combos.forEach((c) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'combo-chip';
            btn.innerHTML = `<span>${this.esc(c.icono)}</span><span>${this.esc(c.nombre)}</span>`;
            btn.addEventListener('click', () => onSelectCombo(c));
            container.appendChild(btn);
        });
    },

    renderQuickNotes(containerId, notesList, currentText, onToggleNote) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const partesActuales = String(currentText || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        notesList.forEach((nota) => {
            const activo = partesActuales.includes(nota.toLowerCase());
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'note-chip' + (activo ? ' active' : '');
            chip.textContent = (activo ? '✓ ' : '+ ') + nota;
            chip.addEventListener('click', () => onToggleNote(nota));
            container.appendChild(chip);
        });
    },

    renderChoiceGrid(containerId, items, selectedId, onSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const idActivo = typeof selectedId === 'function' ? selectedId() : selectedId;
        const esPago = containerId === 'payGrid';

        items.forEach((it) => {
            const disponible = it.disponible !== false;
            const isSelected = Boolean(idActivo && idActivo === it.id && disponible);
            const card = document.createElement('div');
            card.className =
                (esPago ? 'choice-card pay-card' : 'choice-card') +
                (isSelected ? ' selected' : '') +
                (!disponible ? ' agotado' : '');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', disponible ? '0' : '-1');
            card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            card.setAttribute('aria-disabled', !disponible ? 'true' : 'false');

            const badgeAgotado = !disponible
                ? `<span style="display:inline-block; background:#D1272B; color:#FFF; font-size:0.65rem; font-weight:900; padding:2px 7px; border-radius:99px; margin-top:4px; width:fit-content;">AGOTADO</span>`
                : '';

            card.innerHTML = it.precio
                ? `<span class="name">${this.esc(it.nombre)}</span><span class="price">${this.fmt(it.precio)}</span>${badgeAgotado}`
                : `<span class="name">${this.esc(it.nombre)}</span>${badgeAgotado}`;

            if (disponible) {
                const activar = () => onSelect(it.id);
                card.addEventListener('click', activar);
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activar();
                    }
                });
            }
            container.appendChild(card);
        });
    },

    renderQtyGrid(containerId, items, stateObj, onChange) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        items.forEach((it) => {
            const disponible = it.disponible !== false;
            const cant = disponible ? (stateObj[it.id] || 0) : 0;
            const card = document.createElement('div');
            card.className = 'qty-card' + (cant > 0 ? ' active' : '') + (!disponible ? ' agotado' : '');

            card.innerHTML = `
                <div class="info">
                    <span class="name">${this.esc(it.nombre)}</span>
                    <span class="price">${disponible ? this.fmt(it.precio) : '<strong style="color:#D1272B;">AGOTADO</strong>'}</span>
                </div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" aria-label="Disminuir ${this.esc(it.nombre)}" ${!disponible ? 'disabled' : ''}>−</button>
                    <span class="qty-num" aria-live="polite">${cant}</span>
                    <button type="button" class="qty-btn" aria-label="Aumentar ${this.esc(it.nombre)}" ${!disponible ? 'disabled' : ''}>+</button>
                </div>
            `;

            if (disponible) {
                const [btnMinus, btnPlus] = card.querySelectorAll('.qty-btn');
                btnMinus.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onChange(it.id, Math.max(0, cant - 1));
                });
                btnPlus.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onChange(it.id, cant + 1);
                });
            }
            container.appendChild(card);
        });
    },

    renderSugerenciasClientes(sugerencias, onSelect) {
        let box = document.getElementById('sugerenciasClientes');
        const input = document.getElementById('nombreCliente');
        if (!input) return;

        if (!box) {
            box = document.createElement('div');
            box.id = 'sugerenciasClientes';
            box.setAttribute('role', 'listbox');
            input.parentElement.style.position = 'relative';
            input.parentElement.appendChild(box);
        }

        if (!sugerencias || sugerencias.length === 0) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        box.innerHTML = '';
        box.style.display = 'block';

        sugerencias.forEach((nombre) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'sugerencia-item';
            item.innerHTML = `
                <span>👤 ${this.esc(nombre)}</span>
                <span style="font-size:0.75rem; color:var(--morado-700); font-weight:800;">Elegir ↵</span>
            `;
            const elegir = (e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(nombre);
                box.style.display = 'none';
            };
            item.addEventListener('mousedown', elegir);
            item.addEventListener('touchstart', elegir, { passive: false });
            box.appendChild(item);
        });
    },

    renderOrders(list, containerId, isApartado, callbacks, isAdmin = true) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const panelApartados = document.getElementById('panelApartados');
        if (isApartado && panelApartados) {
            panelApartados.style.display = 'block';
        }

        if (!list || list.length === 0) {
            container.innerHTML = `<div class="empty">${
                isApartado ? 'No hay pedidos apartados en este momento.' : 'Aún no hay pedidos registrados.'
            }</div>`;
            return;
        }

        container.innerHTML = '';
        list.forEach((p) => {
            const item = document.createElement('div');
            const isOpen = Boolean(p.abierto);
            item.className = 'order-item' + (isOpen ? ' open' : '');

            const todosExtras = [
                ...(p.acompDetalle || []),
                ...(p.toppingDetalle || []),
                ...(p.bebidaDetalle || [])
            ];

            const numAdiciones = todosExtras.reduce((s, x) => s + Number(x.cantidad || 1), 0);
            const resumenCorto = numAdiciones > 0
                ? `${this.esc(p.bowl)} + ${numAdiciones} ${numAdiciones === 1 ? 'adición' : 'adiciones'}`
                : this.esc(p.bowl);

            const syncDot = p.syncError
                ? `<span title="Error de sincronización" style="color:#D1272B;">⚠️</span>`
                : p.sincronizado
                ? `<span title="Sincronizado en la nube" style="color:#12B76A; font-size:0.7rem;">●</span>`
                : `<span title="Pendiente por subir" style="color:#F5A623; font-size:0.7rem;">●</span>`;

            let timerBadgeHTML = '';
            if (isApartado && p.entregaProgramadaISO) {
                const infoTimer = this.formatearCuentaRegresiva(p.entregaProgramadaISO);
                if (infoTimer) {
                    const bg = infoTimer.vencido ? '#D1272B' : infoTimer.urgente ? '#F5A623' : '#2A0E4F';
                    const fg = infoTimer.vencido ? '#FFFFFF' : infoTimer.urgente ? '#1B0836' : '#FBBB1E';
                    timerBadgeHTML = `<span class="timer-live-badge" data-entrega="${this.esc(p.entregaProgramadaISO)}" style="background:${bg}; color:${fg}; padding:3px 9px; border-radius:999px; font-size:0.7rem; font-weight:900;">${this.esc(infoTimer.texto)}</span>`;
                }
            }

            const sumaExtras = todosExtras.reduce((s, x) => s + (x.subtotal || ((x.precio || 0) * (x.cantidad || 1)) || 0), 0);
            const precioBowl = p.precioBowl !== undefined ? p.precioBowl : Math.max(0, Number(p.total || 0) - sumaExtras);

            const bowlLine = (p.bowl && p.bowl !== 'Individual' && p.bowl !== 'Compra Individual' && p.bowl !== 'Solo Extras / Bebida')
                ? `<div class="apple-receipt-row is-base">
                     <div class="receipt-item-left">
                       <span class="receipt-badge base">BASE</span>
                       <span class="receipt-item-name">${this.esc(p.bowl)}</span>
                     </div>
                     <span class="receipt-item-price">${precioBowl > 0 ? this.fmt(precioBowl) : ''}</span>
                   </div>`
                : '';

            const mapDetalles = (arr) => (arr || []).map((x) => {
                const sub = x.subtotal || ((x.precio || 0) * (x.cantidad || 1));
                const cant = Number(x.cantidad || 1);
                return `<div class="apple-receipt-row">
                          <div class="receipt-item-left">
                            <span class="receipt-badge ${cant > 1 ? 'multi' : ''}">${cant}×</span>
                            <span class="receipt-item-name">${this.esc(x.nombre)}</span>
                          </div>
                          <span class="receipt-item-price">${this.fmt(sub)}</span>
                        </div>`;
            }).join('');

            const extrasList = mapDetalles(p.acompDetalle) + mapDetalles(p.toppingDetalle) + mapDetalles(p.bebidaDetalle);

            let toolbarHTML = '';
            if (isAdmin) {
                toolbarHTML = `
                    <div class="apple-order-toolbar">
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button type="button" class="apple-tool-pill" data-action="edit-name" title="Corregir nombre">✏️ Nombre</button>
                            <button type="button" class="apple-tool-pill" data-action="cycle-pay" title="Cambiar medio de pago">💳 ${this.esc(p.pago)} ↻</button>
                            <button type="button" class="apple-tool-pill" data-action="wallet-pass" title="Ver Ticket">🎟️ Ticket</button>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            ${isApartado
                                ? `<button type="button" class="apple-tool-pill success" data-action="confirm">✓ Cobrar y Entregar</button>`
                                : `<button type="button" class="apple-tool-pill primary" data-action="new-bowl">+ Otro bowl</button>`
                            }
                            <button type="button" class="apple-tool-pill danger" data-action="delete" title="Eliminar pedido">🗑️</button>
                        </div>
                    </div>
                `;
            } else {
                toolbarHTML = `
                    <div class="apple-order-toolbar">
                        <button type="button" class="apple-tool-pill primary" data-action="wallet-pass" style="width:100%; justify-content:center;">
                            🎟️ Ver mi Ticket de Caja
                        </button>
                    </div>
                `;
            }

            item.innerHTML = `
                <div class="order-head" role="button" tabindex="0" aria-expanded="${isOpen}">
                    <div style="min-width:0;">
                        <div class="who">
                            ${syncDot} ${this.esc(p.nombre)}
                            <span style="font-weight:700; font-size:0.74rem; color:var(--morado-700); margin-left:4px;">${this.esc(p.hora || '')}</span>
                            <span class="chip" style="margin-left:4px;">${this.esc(p.pago)}</span>
                            ${timerBadgeHTML}
                        </div>
                        <div class="meta">${resumenCorto}</div>
                    </div>
                    <div class="right">
                        <span class="amt">${this.fmt(p.total)}</span>
                        <span class="apple-chevron">${isOpen ? '▴' : '▾'}</span>
                    </div>
                </div>
                <div class="order-body ${isOpen ? 'open' : ''}">
                    <div style="padding-top:6px;">
                        ${bowlLine}
                        ${extrasList}
                        ${p.notas ? `<div class="apple-note-box">📝 <span>${this.esc(p.notas)}</span></div>` : ''}
                    </div>
                    ${toolbarHTML}
                </div>
            `;

            const head = item.querySelector('.order-head');
            head.addEventListener('click', () => callbacks.onToggle(p.id));

            item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                callbacks.onDelete(p.id);
            });
            item.querySelector('[data-action="confirm"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (callbacks.onConfirm) callbacks.onConfirm(p);
            });
            item.querySelector('[data-action="new-bowl"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (callbacks.onNewForClient) callbacks.onNewForClient(p);
            });
            item.querySelector('[data-action="edit-name"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (callbacks.onEditClientName) callbacks.onEditClientName(p);
            });
            item.querySelector('[data-action="cycle-pay"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (callbacks.onCyclePayment) callbacks.onCyclePayment(p);
            });
            item.querySelector('[data-action="wallet-pass"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (callbacks.onShowWalletPass) callbacks.onShowWalletPass(p);
            });

            container.appendChild(item);
        });
    },

    renderSummary(pedidos, pagosList, topVendidos, filtroPagoActivo, onToggleFiltroPago) {
        const total = pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
        const personasUnicas = new Set(
            pedidos.map((p) => String(p.nombre || '').toLowerCase().trim()).filter(Boolean)
        ).size;

        const elCount = document.getElementById('sumCount') || document.getElementById('statPedidos');
        const elClients = document.getElementById('sumClients') || document.getElementById('statPersonas');
        const elTotal = document.getElementById('sumTotal') || document.getElementById('statTotal');

        if (elCount) elCount.textContent = String(pedidos.length);
        if (elClients) elClients.textContent = String(personasUnicas);
        if (elTotal) elTotal.textContent = this.fmt(total);

        const elPay = document.getElementById('payBreakdown');
        if (elPay) {
            elPay.innerHTML = pagosList.map((pg) => {
                const filtrados = pedidos.filter((p) => (p.pago || '').toLowerCase() === pg.nombre.toLowerCase());
                const sub = filtrados.reduce((s, p) => s + Number(p.total || 0), 0);
                const pct = total > 0 ? Math.round((sub / total) * 100) : 0;
                const activo = filtroPagoActivo && filtroPagoActivo.toLowerCase() === pg.nombre.toLowerCase();

                return `
                    <div class="pay-row" data-pago="${this.esc(pg.nombre)}" style="${activo ? 'border-color:var(--dorado); background:#FFF6D6;' : ''}">
                        <div class="pay-row-top">
                            <div>
                                <div class="pn">${this.esc(pg.nombre)} ${activo ? '✓' : ''}</div>
                                <div class="pc">${filtrados.length} ${filtrados.length === 1 ? 'pedido' : 'pedidos'} · ${pct}%</div>
                            </div>
                            <div class="pv">${this.fmt(sub)}</div>
                        </div>
                        <div class="pay-progress-track">
                            <div class="pay-progress-fill" style="width:${pct}%;"></div>
                        </div>
                    </div>
                `;
            }).join('');

            if (typeof onToggleFiltroPago === 'function') {
                elPay.querySelectorAll('.pay-row').forEach((row) => {
                    row.addEventListener('click', () => onToggleFiltroPago(row.getAttribute('data-pago')));
                });
            }
        }

        const elTop = document.getElementById('topList') || document.getElementById('topSold');
        if (elTop) {
            elTop.innerHTML = topVendidos.length
                ? topVendidos.map(([n, c], i) => `
                    <div class="top-row">
                        <span><strong>${i + 1}.</strong> ${this.esc(n)}</span>
                        <strong>${c} ${c === 1 ? 'ud.' : 'uds.'}</strong>
                    </div>
                `).join('')
                : '<div class="empty">Sin ventas registradas hoy</div>';
        }
    },

    confirmarAccion(mensaje, onConfirm) {
        const overlay = document.getElementById('confirmOverlay');
        const msgEl = document.getElementById('confirmMsg');
        const btnSi = document.getElementById('confirmBtnSi') || document.getElementById('confirmSi');
        const btnNo = document.getElementById('confirmBtnNo') || document.getElementById('confirmNo');

        if (!overlay || !msgEl || !btnSi || !btnNo) {
            if (window.confirm(mensaje)) onConfirm();
            return;
        }

        msgEl.textContent = mensaje;
        overlay.classList.add('show');

        const cerrar = () => {
            overlay.classList.remove('show');
            btnSi.onclick = null;
            btnNo.onclick = null;
        };

        btnNo.onclick = cerrar;
        btnSi.onclick = () => {
            cerrar();
            onConfirm();
        };
    },

    mostrarToast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }
};