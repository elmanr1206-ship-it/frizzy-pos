import { formatearHoraBogota } from './api.js';

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

    formatearCuentaRegresiva(entregaISO) {
        if (!entregaISO) return null;
        const target = new Date(entregaISO).getTime();
        if (Number.isNaN(target)) return null;

        const diffMs = target - Date.now();
        const horaObjetivo = formatearHoraBogota(entregaISO);

        if (diffMs <= 0) {
            return {
                vencido: true,
                urgente: true,
                texto: `🔔 Entregar (${horaObjetivo})`
            };
        }

        const totalSec = Math.floor(diffMs / 1000);
        const horas = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;

        const tiempoStr = horas > 0
            ? `${horas}h ${String(mins).padStart(2, '0')}m`
            : `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

        return {
            vencido: false,
            urgente: diffMs <= 5 * 60 * 1000,
            texto: `⏰ ${tiempoStr} · ${horaObjetivo}`
        };
    },

    renderCombos(containerId, combos, onSelectCombo) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';
        combos.forEach((cb) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'combo-chip';
            btn.innerHTML = `<span>${this.esc(cb.icono)}</span><span>${this.esc(cb.nombre)}</span>`;
            btn.addEventListener('click', () => onSelectCombo(cb));
            c.appendChild(btn);
        });
    },

    renderQuickNotes(containerId, tags, currentNoteText, onToggleTag) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';
        const textoActual = String(currentNoteText || '').toLowerCase();

        tags.forEach((tag) => {
            const activo = textoActual.includes(tag.toLowerCase());
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'note-chip' + (activo ? ' active' : '');
            btn.textContent = tag;
            btn.addEventListener('click', () => onToggleTag(tag));
            c.appendChild(btn);
        });
    },

    renderChoiceGrid(containerId, items, selectedIdOrFn, onSelect) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';
        const selectedId = typeof selectedIdOrFn === 'function' ? selectedIdOrFn() : selectedIdOrFn;

        items.forEach((it) => {
            const agotado = it.disponible === false;
            const isSelected = !agotado && selectedId === it.id;
            const div = document.createElement('div');
            div.className = 'choice-card' + (isSelected ? ' selected active' : '') + (agotado ? ' agotado' : '');
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', agotado ? '-1' : '0');

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                    <div>
                        <div class="name">${this.esc(it.nombre)}</div>
                        ${it.precio !== undefined ? `<div class="price">${this.fmt(it.precio)}</div>` : ''}
                    </div>
                    ${agotado
                        ? '<span class="badge-agotado">Agotado</span>'
                        : isSelected
                            ? '<span style="background:#2A0E4F; color:#FBBB1E; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:900;">✓</span>'
                            : ''}
                </div>
            `;

            const activar = () => {
                if (agotado) return this.mostrarToast(`🚫 ${it.nombre} está agotado`);
                onSelect(it.id);
            };
            div.addEventListener('click', activar);
            c.appendChild(div);
        });
    },

    renderQtyGrid(containerId, items, stateObj, onChange) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';

        items.forEach((it) => {
            const agotado = it.disponible === false;
            const cant = agotado ? 0 : (stateObj[it.id] || 0);
            const div = document.createElement('div');
            div.className = 'qty-card' + (cant > 0 ? ' active selected' : '') + (agotado ? ' agotado' : '');

            div.innerHTML = `
                <div class="info">
                    <div class="name" style="display:flex; align-items:center; gap:6px;">
                        <span>${this.esc(it.nombre)}</span>
                        ${agotado ? '<span class="badge-agotado">Agotado</span>' : ''}
                    </div>
                    <div class="price">${this.fmt(it.precio)}</div>
                </div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" ${agotado ? 'disabled' : ''}>−</button>
                    <span class="qty-num">${cant}</span>
                    <button type="button" class="qty-btn" ${agotado ? 'disabled' : ''}>+</button>
                </div>
            `;

            div.querySelector('.info').addEventListener('click', () => {
                if (!agotado) onChange(it.id, cant + 1);
            });

            const botones = div.querySelectorAll('.qty-btn');
            botones[0].addEventListener('click', (e) => {
                e.stopPropagation();
                if (!agotado) onChange(it.id, Math.max(0, cant - 1));
            });
            botones[1].addEventListener('click', (e) => {
                e.stopPropagation();
                if (!agotado) onChange(it.id, cant + 1);
            });

            c.appendChild(div);
        });
    },

    renderOrders(lista, containerId, esApartado, callbacks, esAdmin = true) {
        // Ocultar automáticamente todo el panel de Apartados cuando está vacío para dar limpieza visual
        if (esApartado) {
            const panelAp = document.getElementById('panelApartados');
            if (panelAp) {
                panelAp.style.display = (!lista || lista.length === 0) ? 'none' : 'block';
            }
        }

        const c = document.getElementById(containerId);
        if (!c) return;
        if (!lista || lista.length === 0) {
            c.innerHTML = `<p class="empty-msg">Sin pedidos registrados</p>`;
            return;
        }
        c.innerHTML = '';

        lista.forEach((p) => {
            const infoTimer = esApartado ? this.formatearCuentaRegresiva(p.entregaProgramadaISO) : null;
            const card = document.createElement('div');
            card.className = 'order-item' + (p.abierto ? ' open' : '') + (infoTimer?.vencido ? ' alarm-due' : '');

            const todosLosExtras = [
                ...(p.acompDetalle || []),
                ...(p.toppingDetalle || []),
                ...(p.bebidaDetalle || [])
            ];
            const cantExtras = todosLosExtras.reduce((acc, i) => acc + Number(i.cantidad || 0), 0);
            const resumenCorto = cantExtras > 0
                ? `${this.esc(p.bowl)} + ${cantExtras} ${cantExtras === 1 ? 'adición' : 'adiciones'}`
                : this.esc(p.bowl);

            const sumaExtras = todosLosExtras.reduce((acc, i) => acc + (Number(i.precio || 0) * Number(i.cantidad || 0)), 0);
            const precioBowl = p.precioBowl || (
                p.total - [
                    ...(p.acompDetalle || []),
                    ...(p.toppingDetalle || []),
                    ...(p.bebidaDetalle || [])
                ].reduce((s, x) => s + (x.subtotal || (x.precio * x.cantidad) || 0), 0)
            );

            const bowlLine = (p.bowl && p.bowl !== 'Compra Individual' && p.bowl !== 'Solo Extras / Bebida')
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

            const filasDetalleHTML = todosLosExtras.map((i) => `
                <div class="apple-receipt-row">
                    <span>${this.esc(i.nombre)} <strong class="apple-qty-tag">×${Number(i.cantidad)}</strong></span>
                    <strong>${this.fmt((i.precio || 0) * i.cantidad)}</strong>
                </div>
            `).join('');

            const badgeTimerHTML = infoTimer
                ? `<span class="timer-live-badge" data-entrega="${this.esc(p.entregaProgramadaISO)}" style="font-size:0.7rem; padding:2px 8px; border-radius:99px; font-weight:800; background:${infoTimer.vencido ? '#D1272B' : '#2A0E4F'}; color:${infoTimer.vencido ? '#FFF' : '#FBBB1E'};">
                    ${this.esc(infoTimer.texto)}
                   </span>`
                : '';

            // Punto minimalista de estado en lugar de texto largo
            const dotColor = p.syncError ? '#D1272B' : p.sincronizado ? '#3E9B5C' : '#F5A623';
            const dotTitle = p.syncError ? 'Error de red' : p.sincronizado ? 'Sincronizado' : 'En cola local';

            card.innerHTML = `
                <div class="order-head" role="button" tabindex="0" aria-expanded="${p.abierto ? 'true' : 'false'}">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                            <span style="width:7px; height:7px; border-radius:50%; background:${dotColor}; display:inline-block;" title="${dotTitle}"></span>
                            <span class="who">${this.esc(p.nombre)}</span>
                            <span class="meta">${this.esc(p.hora)}</span>
                            <span class="chip">${this.esc(p.pago)}</span>
                            ${badgeTimerHTML}
                        </div>
                        <div style="font-size:0.81rem; color:#653BA0; margin-top:3px; font-weight:600;">
                            ${resumenCorto}
                        </div>
                    </div>
                    <div class="right">
                        <div class="amt">${this.fmt(p.total)}</div>
                        <span class="apple-chevron">${p.abierto ? '⌃' : '⌄'}</span>
                    </div>
                </div>

                ${p.abierto ? `
                <div class="order-body open" style="display:block; padding:10px 15px 14px; border-top:1px solid #EFE6D5; background:#FFFFFF;">
                    <div class="apple-receipt-row" style="border-bottom:1px solid #F2ECE1;">
                        <span><strong>Base:</strong> ${this.esc(p.bowl)}</span>
                        <strong>${precioBowl > 0 ? this.fmt(precioBowl) : '—'}</strong>
                    </div>

                    ${filasDetalleHTML || '<div style="padding:6px 0; font-size:0.82rem; color:#999;">Sin adiciones</div>'}

                    ${p.notas ? `<div class="apple-note-box">📝 ${this.esc(p.notas)}</div>` : ''}

                    <!-- BARRA ÚNICA MINIMALISTA DE ACCIONES -->
                    <div class="apple-order-toolbar">
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${esAdmin && callbacks.onEditClientName ? `
                            <button type="button" class="apple-tool-pill btn-edit-name">✎ Nombre</button>` : ''}
                            ${esAdmin && callbacks.onCyclePayment ? `
                            <button type="button" class="apple-tool-pill btn-cycle-pay">💳 ${this.esc(p.pago)} ↻</button>` : ''}
                            ${callbacks.onShowWalletPass ? `
                            <button type="button" class="apple-tool-pill btn-wallet-pass">🎟️ Pase</button>` : ''}
                        </div>

                        <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
                            ${!esApartado && esAdmin && callbacks.onNewForClient ? `
                            <button type="button" class="apple-tool-pill primary btn-add-another">+ Otro bowl</button>` : ''}
                            ${esApartado && esAdmin ? `
                            <button type="button" class="apple-tool-pill success btn-confirm">✓ Cobrar</button>` : ''}
                            ${esAdmin ? `
                            <button type="button" class="apple-tool-pill danger btn-delete" title="Eliminar pedido">🗑️</button>` : ''}
                        </div>
                    </div>
                </div>` : ''}
            `;

            card.querySelector('.order-head').addEventListener('click', () => callbacks.onToggle(p.id));

            if (p.abierto) {
                card.querySelector('.btn-wallet-pass')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    callbacks.onShowWalletPass(p);
                });
                if (esAdmin) {
                    card.querySelector('.btn-edit-name')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        callbacks.onEditClientName(p);
                    });
                    card.querySelector('.btn-cycle-pay')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        callbacks.onCyclePayment(p);
                    });
                    card.querySelector('.btn-delete')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        callbacks.onDelete(p.id);
                    });
                    card.querySelector('.btn-confirm')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        callbacks.onConfirm(p);
                    });
                    card.querySelector('.btn-add-another')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        callbacks.onNewForClient(p);
                    });
                }
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

        box.innerHTML = coincidencias.map((nombre) => `
            <button type="button" class="sugerencia-item" data-nombre="${this.esc(nombre)}">
                <span>${this.esc(nombre)}</span>
                <span style="font-size:0.72rem; color:#653BA0; font-weight:700;">Cliente frecuente</span>
            </button>
        `).join('');
        box.style.display = 'block';

        box.querySelectorAll('.sugerencia-item').forEach((btn) => {
            const elegir = (e) => {
                e.preventDefault();
                onSelect(btn.getAttribute('data-nombre'));
                box.style.display = 'none';
            };
            btn.addEventListener('mousedown', elegir);
            btn.addEventListener('touchstart', elegir, { passive: false });
        });
    },

    renderSummary(pedidos, pagos, topItems, filtroPagoActivo = null, onFiltrarPago = null) {
        const totalDia = pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
        const clientesUnicos = new Set(
            pedidos.map((p) => String(p.nombre || '').toLowerCase().trim()).filter(Boolean)
        ).size;

        const elCount = document.getElementById('sumCount');
        const elClients = document.getElementById('sumClients');
        const elTotal = document.getElementById('sumTotal');

        if (elCount) elCount.textContent = String(pedidos.length);
        if (elClients) elClients.textContent = String(clientesUnicos);
        if (elTotal) elTotal.textContent = this.fmt(totalDia);

        const payContainer = document.getElementById('payBreakdown');
        if (payContainer) {
            payContainer.innerHTML = pagos.map((pg) => {
                const filtrados = pedidos.filter((p) => (p.pago || '').toLowerCase() === pg.nombre.toLowerCase());
                const subtotal = filtrados.reduce((s, p) => s + Number(p.total || 0), 0);
                const porcentaje = totalDia > 0 ? Math.round((subtotal / totalDia) * 100) : 0;
                const esActivo = filtroPagoActivo === pg.nombre;

                return `
                    <div class="pay-row" data-pago="${this.esc(pg.nombre)}"
                        style="cursor:${onFiltrarPago ? 'pointer' : 'default'}; border-color:${esActivo ? '#2A0E4F' : '#E6DAC0'}; background:${esActivo ? '#FFF6D9' : 'rgba(255,252,245,0.92)'};">
                        <div class="pay-row-top">
                            <div>
                                <div class="pn">${this.esc(pg.nombre)} ${esActivo ? '<span class="chip" style="margin-left:4px;">Filtro</span>' : ''}</div>
                                <div class="pc">${filtrados.length} ${filtrados.length === 1 ? 'pedido' : 'pedidos'} · ${porcentaje}%</div>
                            </div>
                            <div class="pv">${this.fmt(subtotal)}</div>
                        </div>
                        <div class="pay-progress-track">
                            <div class="pay-progress-fill" style="width:${porcentaje}%;"></div>
                        </div>
                    </div>
                `;
            }).join('');

            if (onFiltrarPago) {
                payContainer.querySelectorAll('.pay-row').forEach((row) => {
                    row.addEventListener('click', () => onFiltrarPago(row.getAttribute('data-pago')));
                });
            }
        }

        const topContainer = document.getElementById('topList');
        if (topContainer) {
            topContainer.innerHTML = topItems.length === 0
                ? '<p class="empty-msg" style="padding:12px;">Sin ventas hoy</p>'
                : topItems.map(([nombre, cant], idx) => `
                    <div class="top-row">
                        <span style="display:flex; align-items:center; gap:8px; font-weight:700;">
                            <span style="color:#653BA0; font-size:0.78rem; font-weight:900; width:16px;">${idx + 1}.</span>
                            ${this.esc(nombre)}
                        </span>
                        <span>${Number(cant)}</span>
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
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
    },

    confirmarAccion(mensaje, onAccept) {
        const overlay = document.getElementById('confirmOverlay');
        const msgEl = document.getElementById('confirmMsg');
        const btnSi = document.getElementById('confirmBtnSi');
        const btnNo = document.getElementById('confirmBtnNo');

        if (!overlay || !msgEl || !btnSi || !btnNo) {
            if (window.confirm(mensaje)) onAccept();
            return;
        }

        msgEl.textContent = mensaje;
        overlay.classList.add('show');

        const limpiar = () => {
            overlay.classList.remove('show');
            btnSi.onclick = null;
            btnNo.onclick = null;
        };

        btnNo.onclick = () => limpiar();
        btnSi.onclick = () => {
            limpiar();
            onAccept();
        };
    }
};