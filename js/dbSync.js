export const dbSync = {
    db: null,
    
    init() {
        return new Promise((resolve, reject) => {
            // El número 1 es la versión de la base de datos. 
            // Si en el futuro necesitas más tablas, lo cambias a 2.
            const request = indexedDB.open('FrizzyDB', 1);

            // Este evento es el único lugar donde IndexedDB permite crear o modificar "tablas"
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cola_pedidos')) {
                    db.createObjectStore('cola_pedidos', { keyPath: 'id' });
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
            const transaction = this.db.transaction(['cola_pedidos'], 'readwrite');
            const store = transaction.objectStore('cola_pedidos');
            // Usamos 'put' en lugar de 'add' para evitar errores si el ID ya existe
            const request = store.put(pedido); 
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getQueue() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cola_pedidos'], 'readonly');
            const store = transaction.objectStore('cola_pedidos');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    async removeFromQueue(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cola_pedidos'], 'readwrite');
            const store = transaction.objectStore('cola_pedidos');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};