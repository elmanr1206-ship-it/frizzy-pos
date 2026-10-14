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

        items.forEach((it) => {
            const div = document.createElement('div');
            const isSelected = selectedId === it.id;
            div.className = 'choice-card' + (isSelected ? ' selected active' : '');
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

            div.style.cssText = isSelected
                ? 'border: 2px solid #2B113F; background: linear-gradient(135deg, #FFFDF9 0%, #FFF5D6 100%); box-shadow: 0 6px 14px rgba(43,17,63,0.14); position: relative; transition: all 0.18s ease;'
                : 'border: 1px solid #E2D5B5; background: #FFF9EC; position: relative; transition: all 0.18s ease;';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                    <div>
                        <div class="choice-title" style="font-weight:800; color:#2B113F; font-size:0.98rem;">${this.esc(it.nombre)}</div>
                        ${it.precio !== undefined ? `<div class="choice-price" style="font-weight:700; color:#6D5E78; font-size:0.86rem; margin-top:2px;">${this.fmt(it.precio)}</div>` : ''}
                    </div>
                    ${isSelected
                        ? '<span style="background:#2B113F; color:#F4B41A; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:900; flex-shrink:0;">✓</span>'
                        : '<span style="border:2px solid #D3C4A3; width:22px; height:22px; border-radius:50%; display:inline-block; flex-shrink:0;"></span>'}
                </div>
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

        items.forEach((it) => {
            const cant = stateObj[it.id] || 0;
            const div = document.createElement('div');
            div.className = 'qty-card' + (cant > 0 ? ' active selected' : '');
            div.style.cssText = cant > 0
                ? 'border: 2px solid #2B113F; background: linear-gradient(135deg, #FFFDF9 0%, #FFF5D6 100%); box-shadow: 0 5px 12px rgba(43,17,63,0.12); transition: all 0.16s ease;'
                : 'border: 1px solid #E2D5B5; background: #FFF9EC; transition: all 0.16s ease;';

            div.innerHTML = `
                <div class="qty-info" style="cursor:pointer; flex:1;" title="Toca para sumar 1">
                    <div class="qty-title" style="font-weight:800; color:#2B113F;">${this.esc(it.nombre)}</div>
                    <div class="qty-price" style="color:#6D5E78; font-weight:700; font-size:0.85rem;">${this.fmt(it.precio)}</div>
                </div>
                <div class="qty-controls" style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="qty-btn" style="min-width:42px; min-height:42px; border-radius:50%; font-weight:900;" aria-label="Disminuir ${this.esc(it.nombre)}">−</button>
                    <span class="qty-val" style="min-width:24px; text-align:center; font-weight:900; font-size:1.02rem; color:#2B113F;">${cant}</span>
                    <button type="button" class="qty-btn" style="min-width:42px; min-height:42px; border-radius:50%; font-weight:900;" aria-label="Aumentar ${this.esc(it.nombre)}">+</button>
                </div>
            `;

            div.querySelector('.qty-info').addEventListener('click', () => {
                onChange(it.id, cant + 1);
            });

            const botones = div.querySelectorAll('.qty-btn');
            botones[0].addEventListener('click', (e) => {
                e.stopPropagation();
                onChange(it.id, Math.max(0, cant - 1));
            });
            botones[1].addEventListener('click', (e) => {
                e.stopPropagation();
                onChange(it.id, cant + 1);
            });

            c.appendChild(div);
        });
    },

    renderOrders(lista, containerId, esApartado, callbacks) {
        const c = document.getElementById(containerId);
        if (!c) return;
        if (!lista || lista.length === 0) {
            c.innerHTML = `<p class="empty-msg" style="text-align:center; padding:20px; color:#776B80; font-style:italic; background:#FFF9EC; border-radius:12px; border:1px dashed #D8C9A8;">${esApartado ? 'No hay pedidos apartados en este momento' : 'Aún no hay pedidos registrados hoy'}</p>`;
            return;
        }
        c.innerHTML = '';

        lista.forEach((p) => {
            const card = document.createElement('div');
            card.className = 'order-item order-card' + (p.abierto ? ' open' : '');
            card.style.cssText = 'background:#FFF9EC; border:1.5px solid #E2D5B5; border-radius:14px; padding:14px 16px; margin-bottom:10px; box-shadow:0 4px 10px rgba(43,17,63,0.06); transition:all 0.2s ease;';

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
                <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px dashed #E2D5B5; font-size:0.9rem; color:#2B113F;">
                    <span>• ${this.esc(i.nombre)} <strong style="background:#F4B41A; color:#2B113F; padding:1px 8px; border-radius:99px; font-size:0.76rem; margin-left:4px;">x${Number(i.cantidad)}</strong></span>
                    <strong style="font-weight:800;">${this.fmt((i.precio || 0) * i.cantidad)}</strong>
                </div>
            `).join('');

            const badgeSync = !esApartado
                ? `<span style="font-size:0.7rem; padding:2px 8px; border-radius:99px; font-weight:800; background:${p.syncError ? '#FDECEA' : p.sincronizado ? '#E6F4EA' : '#FFF4D6'}; color:${p.syncError ? '#B71C1C' : p.sincronizado ? '#1E7E34' : '#9A6700'};">
                    ${p.syncError ? '⚠️ Error' : p.sincronizado ? '☁️ Sincronizado' : '⏳ En cola'}
                   </span>`
                : '<span style="font-size:0.7rem; padding:2px 8px; border-radius:99px; font-weight:800; background:#EDE7F6; color:#4A148C;">📌 Apartado</span>';

            card.innerHTML = `
                <div class="order-head" role="button" tabindex="0" aria-expanded="${p.abierto ? 'true' : 'false'}" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                            <strong style="font-size:1.05rem; color:#2B113F;">${this.esc(p.nombre)}</strong>
                            <span style="font-size:0.8rem; color:#6D5E78; font-weight:600;">· ${this.esc(p.hora)}</span>
                            <span style="font-size:0.74rem; background:#2B113F; color:#F4B41A; padding:2px 8px; border-radius:6px; font-weight:800;">${this.esc(p.pago)}</span>
                            ${badgeSync}
                        </div>
                        <div style="font-size:0.85rem; color:#5A4B65; margin-top:4px; font-weight:600;">
                            🥣 ${resumenCorto}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                        <div class="order-total" style="font-size:1.12rem; font-weight:900; color:#2B113F;">${this.fmt(p.total)}</div>
                        <span style="font-size:0.76rem; color:#2B113F; font-weight:800; padding:6px 10px; background:#F4B41A; border-radius:8px; user-select:none;">
                            ${p.abierto ? '▲ Cerrar' : '▼ Ver'}
                        </span>
                    </div>
                </div>

                ${p.abierto ? `
                <div class="order-body open" style="display:block !important; margin-top:12px; padding:14px; background:#FFFFFF; border-radius:12px; border:1px solid #E6DEC8;">
                    <div style="font-size:0.74rem; text-transform:uppercase; letter-spacing:0.06em; color:#776B80; font-weight:800; margin-bottom:6px;">
                        Recibo de Preparación
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #EFE8D5; font-size:0.92rem; color:#2B113F;">
                        <span><strong>Base:</strong> ${this.esc(p.bowl)}</span>
                        <strong>${precioBowl > 0 ? this.fmt(precioBowl) : '—'}</strong>
                    </div>

                    ${filasDetalleHTML || '<div style="padding:6px 0; font-size:0.85rem; color:#888;">Sin adiciones extras</div>'}

                    ${p.notas ? `
                    <div style="background:#FFF8E1; border-left:4px solid #F4B41A; padding:8px 10px; border-radius:6px; margin-top:8px; font-size:0.88rem; color:#2B113F;">
                        <strong>📝 Nota:</strong> ${this.esc(p.notas)}
                    </div>` : ''}

                    <div class="order-actions" style="margin-top:12px; display:flex; justify-content:flex-end; gap:10px;">
                        ${esApartado ? `
                        <button type="button" class="btn-confirm" style="min-height:44px; padding:0 16px; background:#1E7E34; color:#FFFFFF; border:none; border-radius:8px; font-weight:800; cursor:pointer;">
                            ✅ Confirmar y Cobrar
                        </button>` : ''}
                        <button type="button" class="btn-delete" style="min-height:44px; padding:0 16px; background:#FDECEA; color:#B71C1C; border:1px solid #F5C2C7; border-radius:8px; font-weight:800; cursor:pointer;">
                            🗑️ Eliminar pedido
                        </button>
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
        let box = document.getElementById('sugerenciasClientes');
        if (!box) {
            const inputNombre = document.getElementById('nombreCliente');
            if (!inputNombre || !inputNombre.parentElement) return;
            inputNombre.parentElement.style.position = 'relative';
            box = document.createElement('div');
            box.id = 'sugerenciasClientes';
            box.setAttribute('role', 'listbox');
            box.style.cssText = 'display:none; position:absolute; top:100%; left:0; right:0; background:#FFFFFF; border:2px solid #2B113F; border-radius:12px; box-shadow:0 10px 24px rgba(43,17,63,0.2); z-index:200; margin-top:4px; overflow:hidden;';
            inputNombre.parentElement.appendChild(box);
        }

        if (!coincidencias || coincidencias.length === 0) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        box.innerHTML = coincidencias.map((nombre) => `
            <button type="button" class="sugerencia-item" data-nombre="${this.esc(nombre)}"
                style="width:100%; min-height:46px; text-align:left; padding:10px 14px; background:#fff; border:none; border-bottom:1px solid #EFE8D5; font-size:16px; color:#2B113F; font-weight:700; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                <span>👤 ${this.esc(nombre)}</span>
                <span style="font-size:0.75rem; background:#F4B41A; color:#2B113F; padding:3px 9px; border-radius:99px; font-weight:800;">Elegir cliente</span>
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

    _buscarElementoResumen(idsPosibles, textoEtiqueta) {
        for (const id of idsPosibles) {
            const el = document.getElementById(id);
            if (el) return el;
        }
        const root = document.getElementById('summaryCapture') || document;
        const todos = root.querySelectorAll('*');
        for (const nodo of todos) {
            const txt = nodo.textContent.trim().toUpperCase();
            if (nodo.children.length === 0 && txt === textoEtiqueta) {
                if (nodo.previousElementSibling) return nodo.previousElementSibling;
                if (nodo.parentElement && nodo.parentElement.firstElementChild !== nodo) {
                    return nodo.parentElement.firstElementChild;
                }
            }
            if (nodo.children.length === 1 && txt.endsWith(textoEtiqueta)) {
                return nodo.firstElementChild;
            }
        }
        return null;
    },

    _buscarContenedorPagos() {
        const ids = ['payBreakdown', 'paySummary', 'payList', 'mediosPago', 'pagoList', 'paymentBreakdown', 'payStats', 'resumenPagos'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) return el;
        }
        const root = document.getElementById('summaryCapture') || document;
        const todos = root.querySelectorAll('*');
        for (const nodo of todos) {
            if (nodo.children.length === 0 && nodo.textContent.trim().toUpperCase() === 'POR MEDIO DE PAGO') {
                const candidato = nodo.nextElementSibling || (nodo.parentElement ? nodo.parentElement.nextElementSibling : null);
                if (candidato && candidato.tagName === 'DIV') return candidato;
            }
        }
        return null;
    },

    renderSummary(pedidos, pagos, topItems, filtroPagoActivo = null, onFiltrarPago = null) {
        const totalDia = pedidos.reduce((s, p) => s + Number(p.total || 0), 0);

        const elCount = this._buscarElementoResumen(['sumCount', 'totalPedidos', 'kpiPedidos', 'pedidosHoy', 'sumPedidos', 'statPedidos'], 'PEDIDOS HOY');
        const elTotal = this._buscarElementoResumen(['sumTotal', 'totalVentas', 'kpiVentas', 'ventasHoy', 'sumVentas', 'statVentas'], 'VENTAS HOY');

        if (elCount) elCount.textContent = String(pedidos.length);
        if (elTotal) elTotal.textContent = this.fmt(totalDia);

        const payContainer = this._buscarContenedorPagos();
        if (payContainer) {
            const iconosPago = { Efectivo: '💵', Llave: '🔑', Nequi: '📱' };

            payContainer.innerHTML = pagos.map((pg) => {
                const filtrados = pedidos.filter((p) => (p.pago || '').toLowerCase() === pg.nombre.toLowerCase());
                const subtotal = filtrados.reduce((s, p) => s + Number(p.total || 0), 0);
                const porcentaje = totalDia > 0 ? Math.round((subtotal / totalDia) * 100) : 0;
                const esActivo = filtroPagoActivo === pg.nombre;
                const icono = iconosPago[pg.nombre] || '💳';

                // CORRECCIÓN: flex-direction: column !important evita que styles.css ponga la barra al lado del precio
                return `
                    <div class="pay-row" data-pago="${this.esc(pg.nombre)}"
                        style="display:flex !important; flex-direction:column !important; align-items:stretch !important; gap:10px !important; background:${esActivo ? '#FFF3D1' : '#FFF9EC'}; border:${esActivo ? '2px solid #2B113F' : '1px solid #E2D5B5'}; border-radius:14px; padding:14px 16px; margin-bottom:10px; cursor:${onFiltrarPago ? 'pointer' : 'default'}; box-shadow:0 2px 6px rgba(43,17,63,0.04); transition:all 0.18s ease;">
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px;">
                            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                                <span style="width:36px; height:36px; border-radius:10px; background:#F4E8C6; display:inline-flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">${icono}</span>
                                <div>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <strong style="color:#2B113F; font-size:1.02rem; font-weight:800;">${this.esc(pg.nombre)}</strong>
                                        ${esActivo ? '<span style="font-size:0.68rem; background:#2B113F; color:#F4B41A; padding:2px 7px; border-radius:99px; font-weight:800;">FILTRADO</span>' : ''}
                                    </div>
                                    <div style="font-size:0.82rem; color:#6D5E78; font-weight:600; margin-top:2px;">
                                        ${filtrados.length} ${filtrados.length === 1 ? 'pedido' : 'pedidos'}
                                    </div>
                                </div>
                            </div>

                            <div style="text-align:right; flex-shrink:0;">
                                <div style="font-weight:900; font-size:1.14rem; color:#2B113F; line-height:1.1;">${this.fmt(subtotal)}</div>
                                <span style="display:inline-block; margin-top:4px; font-size:0.75rem; font-weight:800; color:#2B113F; background:#F4B41A; padding:2px 8px; border-radius:99px;">
                                    ${porcentaje}% del total
                                </span>
                            </div>
                        </div>

                        <div style="width:100%; height:7px; background:#EAE0C8; border-radius:99px; overflow:hidden;">
                            <div style="width:${porcentaje}%; height:100%; background:linear-gradient(90deg, #F4B41A 0%, #E09900 100%); border-radius:99px; transition:width 0.35s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');

            if (onFiltrarPago) {
                payContainer.querySelectorAll('.pay-row').forEach((row) => {
                    row.addEventListener('click', () => {
                        const medio = row.getAttribute('data-pago');
                        onFiltrarPago(medio);
                    });
                });
            }
        }

        const topContainer = document.getElementById('topList');
        if (topContainer) {
            const maxCant = topItems.length > 0 ? Math.max(...topItems.map((x) => Number(x[1]) || 1)) : 1;
            const medallas = ['#F4B41A', '#C9C0D3', '#DFA878'];

            topContainer.innerHTML = topItems.length === 0
                ? '<p class="empty-msg" style="color:#776B80; font-style:italic; text-align:center; padding:12px;">Sin ventas registradas aún</p>'
                : topItems.map(([nombre, cant], idx) => {
                    const pct = Math.round((Number(cant) / maxCant) * 100);
                    const bgBadge = medallas[idx] || '#EAE0C8';
                    return `
                        <div class="top-row" style="display:flex; flex-direction:column; gap:5px; padding:9px 0; border-bottom:1px solid #EFE8D5;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="display:flex; align-items:center; gap:8px; font-weight:700; color:#2B113F; font-size:0.95rem;">
                                    <span style="background:${bgBadge}; color:#2B113F; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.76rem; font-weight:900;">${idx + 1}</span>
                                    ${this.esc(nombre)}
                                </span>
                                <strong style="color:#2B113F; font-weight:900; font-size:0.95rem;">${Number(cant)} uds.</strong>
                            </div>
                            <div style="width:100%; height:4px; background:#EAE0C8; border-radius:99px; overflow:hidden;">
                                <div style="width:${pct}%; height:100%; background:#2B113F; border-radius:99px;"></div>
                            </div>
                        </div>
                    `;
                }).join('');
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