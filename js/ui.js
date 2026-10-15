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
            const minVencidos = Math.floor(Math.abs(diffMs) / 60000);
            return {
                vencido: true,
                urgente: true,
                texto: `🔔 ¡ENTREGAR YA! (${horaObjetivo}${minVencidos > 0 ? ` · hace ${minVencidos}m` : ''})`
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
            urgente: diffMs <= 5 * 60 * 1000, // Menos de 5 minutos
            texto: `⏰ Falta ${tiempoStr} (Entrega ${horaObjetivo})`
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
            btn.textContent = (activo ? '✓ ' : '+ ') + tag;
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
            div.setAttribute('aria-disabled', agotado ? 'true' : 'false');
            div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                    <div>
                        <div class="name">${this.esc(it.nombre)}</div>
                        ${it.precio !== undefined ? `<div class="price">${this.fmt(it.precio)}</div>` : ''}
                    </div>
                    ${agotado
                        ? '<span class="badge-agotado">Agotado</span>'
                        : isSelected
                            ? '<span style="background:#2A0E4F; color:#FBBB1E; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:900; flex-shrink:0;">✓</span>'
                            : '<span style="border:2px solid #D3C4A3; width:22px; height:22px; border-radius:50%; display:inline-block; flex-shrink:0;"></span>'}
                </div>
            `;

            const activar = () => {
                if (agotado) {
                    this.mostrarToast(`🚫 ${it.nombre} está marcado como AGOTADO`);
                    return;
                }
                onSelect(it.id);
            };
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

        items.forEach((it) => {
            const agotado = it.disponible === false;
            const cant = agotado ? 0 : (stateObj[it.id] || 0);
            const div = document.createElement('div');
            div.className = 'qty-card' + (cant > 0 ? ' active selected' : '') + (agotado ? ' agotado' : '');

            div.innerHTML = `
                <div class="info" title="${agotado ? 'Producto agotado' : 'Toca para sumar 1'}">
                    <div class="name" style="display:flex; align-items:center; gap:6px;">
                        <span>${this.esc(it.nombre)}</span>
                        ${agotado ? '<span class="badge-agotado">Agotado</span>' : ''}
                    </div>
                    <div class="price">${this.fmt(it.precio)}</div>
                </div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" ${agotado ? 'disabled' : ''} aria-label="Disminuir ${this.esc(it.nombre)}">−</button>
                    <span class="qty-num">${cant}</span>
                    <button type="button" class="qty-btn" ${agotado ? 'disabled' : ''} aria-label="Aumentar ${this.esc(it.nombre)}">+</button>
                </div>
            `;

            div.querySelector('.info').addEventListener('click', () => {
                if (agotado) {
                    this.mostrarToast(`🚫 ${it.nombre} está marcado como AGOTADO`);
                    return;
                }
                onChange(it.id, cant + 1);
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
        const c = document.getElementById(containerId);
        if (!c) return;
        if (!lista || lista.length === 0) {
            c.innerHTML = `<p class="empty-msg">${esApartado ? 'No hay pedidos apartados en este momento' : 'Aún no hay pedidos registrados hoy'}</p>`;
            return;
        }
        c.innerHTML = '';

        const conteoPorCliente = {};
        lista.forEach((item) => {
            const k = String(item.nombre || '').toLowerCase().trim();
            if (k) conteoPorCliente[k] = (conteoPorCliente[k] || 0) + 1;
        });

        lista.forEach((p) => {
            const infoTimer = esApartado ? this.formatearCuentaRegresiva(p.entregaProgramadaISO) : null;
            const card = document.createElement('div');
            card.className = 'order-item' + (p.abierto ? ' open' : '') + (infoTimer?.vencido ? ' alarm-due' : '');

            const acomp = p.acompDetalle || [];
            const top = p.toppingDetalle || [];
            const beb = p.bebidaDetalle || [];
            const todosLosExtras = [...acomp, ...top, ...beb];
            const cantExtras = todosLosExtras.reduce((acc, i) => acc + Number(i.cantidad || 0), 0);

            const resumenCorto = cantExtras > 0
                ? `${this.esc(p.bowl)} + ${cantExtras} ${cantExtras === 1 ? 'adición' : 'adiciones'}`
                : this.esc(p.bowl);

            const sumaExtras = todosLosExtras.reduce((acc, i) => acc + (Number(i.precio || 0) * Number(i.cantidad || 0)), 0);
            const precioBowl = Math.max(0, Number(p.total || 0) - sumaExtras);

            const filasDetalleHTML = todosLosExtras.map((i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px dashed #E2D5B5; font-size:0.88rem; color:#2A0E4F;">
                    <span>• ${this.esc(i.nombre)} <strong style="background:#F5A623; color:#1B0836; padding:1px 8px; border-radius:99px; font-size:0.75rem; margin-left:4px;">x${Number(i.cantidad)}</strong></span>
                    <strong style="font-weight:800;">${this.fmt((i.precio || 0) * i.cantidad)}</strong>
                </div>
            `).join('');

            const pedidosDeEsteCliente = conteoPorCliente[String(p.nombre || '').toLowerCase().trim()] || 1;
            const badgeMulti = pedidosDeEsteCliente > 1
                ? `<span style="font-size:0.68rem; padding:2px 7px; border-radius:99px; font-weight:800; background:#EDE7F6; color:#4E2286;">🥣 ${pedidosDeEsteCliente} pedidos hoy</span>`
                : '';

            const badgeTimerHTML = infoTimer
                ? `<span class="timer-live-badge" data-entrega="${this.esc(p.entregaProgramadaISO)}" style="font-size:0.72rem; padding:3px 9px; border-radius:99px; font-weight:900; background:${infoTimer.vencido ? '#D1272B' : infoTimer.urgente ? '#F5A623' : '#2A0E4F'}; color:${infoTimer.vencido ? '#FFF' : infoTimer.urgente ? '#1B0836' : '#FBBB1E'};">
                    ${this.esc(infoTimer.texto)}
                   </span>`
                : '';

            const badgeSync = `<span style="font-size:0.68rem; padding:2px 8px; border-radius:99px; font-weight:800; background:${p.syncError ? '#FDECEA' : p.sincronizado ? '#E6F4EA' : '#FFF4D6'}; color:${p.syncError ? '#B71C1C' : p.sincronizado ? '#1E7E34' : '#9A6700'};">
                ${p.syncError ? '⚠️ Error' : p.sincronizado ? '☁️ Sincronizado' : '⏳ En cola'}
               </span>`;

            card.innerHTML = `
                <div class="order-head" role="button" tabindex="0" aria-expanded="${p.abierto ? 'true' : 'false'}">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                            <span class="who">${this.esc(p.nombre)}</span>
                            <span class="meta">· ${this.esc(p.hora)}</span>
                            <span class="chip">${this.esc(p.pago)}</span>
                            ${badgeMulti}
                            ${badgeTimerHTML}
                            ${badgeSync}
                        </div>
                        <div style="font-size:0.84rem; color:#4E2286; margin-top:4px; font-weight:700;">
                            🥣 ${resumenCorto}
                        </div>
                    </div>
                    <div class="right">
                        <div class="amt">${this.fmt(p.total)}</div>
                        <span style="font-size:0.75rem; color:#1B0836; font-weight:800; padding:6px 10px; background:#F5A623; border-radius:8px; user-select:none;">
                            ${p.abierto ? '▲ Cerrar' : '▼ Ver'}
                        </span>
                    </div>
                </div>

                ${p.abierto ? `
                <div class="order-body open" style="display:block; padding:12px 15px 15px; border-top:1px solid #E9DEC0; background:#FFFFFF;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #EFE8D5; font-size:0.9rem; color:#2A0E4F;">
                        <span><strong>Base:</strong> ${this.esc(p.bowl)}</span>
                        <strong>${precioBowl > 0 ? this.fmt(precioBowl) : '—'}</strong>
                    </div>

                    ${filasDetalleHTML || '<div style="padding:6px 0; font-size:0.84rem; color:#888;">Sin adiciones extras</div>'}

                    ${p.notas ? `
                    <div style="background:#FFF8E1; border-left:4px solid #F5A623; padding:8px 10px; border-radius:6px; margin-top:8px; font-size:0.86rem; color:#2A0E4F;">
                        <strong>📝 Nota:</strong> ${this.esc(p.notas)}
                    </div>` : ''}

                    <div style="margin-top:12px; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px;">
                        ${!esApartado && esAdmin && callbacks.onNewForClient ? `
                        <button type="button" class="btn-add-another" style="min-height:42px; padding:0 14px; background:#FFF3D2; color:#2A0E4F; border:2px solid #F5A623; border-radius:10px; font-weight:800; cursor:pointer;">
                            ➕ Otro bowl para ${this.esc(p.nombre)}
                        </button>` : ''}
                        ${esApartado && esAdmin ? `
                        <button type="button" class="btn-confirm" style="min-height:42px; padding:0 16px; background:#3E9B5C; color:#FFFFFF; border:none; border-radius:10px; font-weight:800; cursor:pointer;">
                            ✅ Entregar y Cobrar
                        </button>` : ''}
                        ${esAdmin ? `
                        <button type="button" class="btn-delete" style="min-height:42px; padding:0 14px; background:#FDECEA; color:#D1272B; border:1px solid #F5C2C7; border-radius:10px; font-weight:800; cursor:pointer;">
                            🗑️ Eliminar
                        </button>` : ''}
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

            if (p.abierto && esAdmin) {
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
                <span>👤 ${this.esc(nombre)}</span>
                <span style="font-size:0.74rem; background:#F5A623; color:#1B0836; padding:3px 9px; border-radius:99px; font-weight:800;">Elegir</span>
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
            pedidos
                .map((p) => String(p.nombre || '').toLowerCase().trim())
                .filter(Boolean)
        ).size;

        const elCount = document.getElementById('sumCount');
        const elClients = document.getElementById('sumClients');
        const elTotal = document.getElementById('sumTotal');

        if (elCount) elCount.textContent = String(pedidos.length);
        if (elClients) elClients.textContent = String(clientesUnicos);
        if (elTotal) elTotal.textContent = this.fmt(totalDia);

        const payContainer = document.getElementById('payBreakdown');
        if (payContainer) {
            const iconosPago = { Efectivo: '💵', Llave: '🔑', Nequi: '📱' };

            payContainer.innerHTML = pagos.map((pg) => {
                const filtrados = pedidos.filter((p) => (p.pago || '').toLowerCase() === pg.nombre.toLowerCase());
                const subtotal = filtrados.reduce((s, p) => s + Number(p.total || 0), 0);
                const porcentaje = totalDia > 0 ? Math.round((subtotal / totalDia) * 100) : 0;
                const esActivo = filtroPagoActivo === pg.nombre;
                const icono = iconosPago[pg.nombre] || '💳';

                return `
                    <div class="pay-row" data-pago="${this.esc(pg.nombre)}"
                        style="cursor:${onFiltrarPago ? 'pointer' : 'default'}; border-color:${esActivo ? '#2A0E4F' : '#E9DEC0'}; background:${esActivo ? '#FFF3D2' : 'var(--crema-2)'};">
                        <div class="pay-row-top">
                            <div>
                                <div class="pn">${icono} ${this.esc(pg.nombre)} ${esActivo ? '<span class="chip" style="margin-left:6px;">Activo</span>' : ''}</div>
                                <div class="pc">${filtrados.length} ${filtrados.length === 1 ? 'pedido' : 'pedidos'} · ${porcentaje}% del día</div>
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
                    row.addEventListener('click', () => {
                        onFiltrarPago(row.getAttribute('data-pago'));
                    });
                });
            }
        }

        const topContainer = document.getElementById('topList');
        if (topContainer) {
            topContainer.innerHTML = topItems.length === 0
                ? '<p class="empty-msg">Sin ventas registradas aún</p>'
                : topItems.map(([nombre, cant], idx) => `
                    <div class="top-row">
                        <span style="display:flex; align-items:center; gap:8px; font-weight:700;">
                            <span style="background:${idx === 0 ? '#F5A623' : '#E9DEC0'}; color:#1B0836; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.74rem; font-weight:900;">${idx + 1}</span>
                            ${this.esc(nombre)}
                        </span>
                        <span>${Number(cant)} uds.</span>
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