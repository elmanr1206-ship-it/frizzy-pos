export const dbSync = {
    db: null,

    async init() {
        if (navigator.storage && navigator.storage.persist) {
            try { await navigator.storage.persist(); } catch (_) {}
        }

        return new Promise((resolve, reject) => {
            // Versión 3: incluye cola_pedidos y cola_eliminados
            const request = indexedDB.open('FrizzyDB', 3);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cola_pedidos')) {
                    db.createObjectStore('cola_pedidos', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('cola_eliminados')) {
                    db.createObjectStore('cola_eliminados', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('Error inicializando IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async saveToQueue(pedido) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cola_pedidos'], 'readwrite');
            const store = tx.objectStore('cola_pedidos');
            store.put(pedido);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    },

    async getQueue() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cola_pedidos'], 'readonly');
            const store = tx.objectStore('cola_pedidos');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    async removeFromQueue(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cola_pedidos'], 'readwrite');
            const store = tx.objectStore('cola_pedidos');
            store.delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },

    async saveDeleteToQueue(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cola_eliminados'], 'readwrite');
            tx.objectStore('cola_eliminados').put({ id, deletedAt: new Date().toISOString() });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },

    async getDeleteQueue() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cola_eliminados'], 'readonly');
            const req = tx.objectStore('cola_eliminados').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    async removeDeleteFromQueue(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cola_eliminados'], 'readwrite');
            tx.objectStore('cola_eliminados').delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
};