export const ui = {
    // Renderiza grillas de selección única (Bowls y Medio de Pago)
    renderSingleChoice(containerId, items, selectedId, onSelect) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'choice-card' + (selectedId === it.id ? ' selected' : '');
            btn.setAttribute('aria-pressed', selectedId === it.id);
            btn.innerHTML = `<strong>${it.nombre}</strong><br>${it.precio ? `$${it.precio}` : ''}`;
            btn.onclick = () => onSelect(it.id);
            container.appendChild(btn);
        });
    },

    // Renderiza grillas con contador de cantidad (Acompañantes, Toppings, Bebidas)
    renderQtyChoice(containerId, items, store, onChange) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(it => {
            const qty = store[it.id] || 0;
            const card = document.createElement('div');
            card.className = 'qty-card' + (qty > 0 ? ' active' : '');
            card.innerHTML = `
                <div><strong>${it.nombre}</strong><br>$${it.precio}</div>
                <div class="qty-controls">
                    <button type="button" class="qty-btn" aria-label="Quitar ${it.nombre}">−</button>
                    <span aria-live="polite">${qty}</span>
                    <button type="button" class="qty-btn" aria-label="Agregar ${it.nombre}">+</button>
                </div>
            `;
            
            const btns = card.querySelectorAll('.qty-btn');
            btns[0].onclick = () => {
                const newVal = Math.max(0, qty - 1);
                onChange(it.id, newVal);
            };
            btns[1].onclick = () => {
                onChange(it.id, qty + 1);
            };
            container.appendChild(card);
        });
    },

    mostrarToast(mensaje) {
        const toast = document.getElementById('toast');
        toast.textContent = mensaje;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};