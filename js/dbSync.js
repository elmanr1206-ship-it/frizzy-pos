export const dbSync = {
    db: null,
    async init() {
        return new Promise((resolve) => {
            const req = indexedDB.open('FrizzyDB', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('cola_pedidos')) {
                    db.createObjectStore('cola_pedidos', { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
        });
    },
    async saveToQueue(pedido) {
        const tx = this.db.transaction('cola_pedidos', 'readwrite');
        tx.objectStore('cola_pedidos').put(pedido);
        return new Promise(resolve => tx.oncomplete = resolve);
    },
    async getQueue() {
        return new Promise((resolve) => {
            const req = this.db.transaction('cola_pedidos').objectStore('cola_pedidos').getAll();
            req.onsuccess = () => resolve(req.result);
        });
    },
    async removeFromQueue(id) {
        this.db.transaction('cola_pedidos', 'readwrite').objectStore('cola_pedidos').delete(id);
    }
};