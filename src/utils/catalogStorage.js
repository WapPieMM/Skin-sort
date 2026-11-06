const DB_NAME = 'rov-sortskin-storage';
const DB_VERSION = 1;
const STORE_NAME = 'catalog';
const CATALOG_RECORD_KEY = 'heroes';

function openCatalogDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open database'));
    request.onblocked = () => reject(new Error('Database upgrade is blocked'));
  });
}

export async function loadCatalogFromIndexedDB() {
  const db = await openCatalogDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CATALOG_RECORD_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read catalog'));
      transaction.onabort = () => reject(transaction.error || new Error('Catalog read aborted'));
    });
  } finally {
    db.close();
  }
}

export async function saveCatalogToIndexedDB(heroes) {
  const db = await openCatalogDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(heroes, CATALOG_RECORD_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save catalog'));
      transaction.onabort = () => reject(transaction.error || new Error('Catalog save aborted'));
    });
  } finally {
    db.close();
  }
}
