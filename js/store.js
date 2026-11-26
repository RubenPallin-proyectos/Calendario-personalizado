// Almacenamiento local en IndexedDB (sin dependencias). Tres almacenes: kv, days, photos.

const NAME = 'dias';
const STORES = ['kv', 'days', 'photos'];
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => STORES.forEach((s) => req.result.createObjectStore(s));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const out = fn(tx);
    tx.oncomplete = () => resolve(typeof out === 'function' ? out() : out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function get(store, key) {
  return run(store, 'readonly', (tx) => {
    const r = tx.objectStore(store).get(key);
    return () => r.result;
  });
}

export const put = (store, key, value) =>
  run(store, 'readwrite', (tx) => { tx.objectStore(store).put(value, key); });

export const del = (store, key) =>
  run(store, 'readwrite', (tx) => { tx.objectStore(store).delete(key); });

/** Todas las parejas [clave, valor] de un almacén. */
export function entries(store) {
  return run(store, 'readonly', (tx) => {
    const s = tx.objectStore(store);
    const keys = s.getAllKeys();
    const values = s.getAll();
    return () => keys.result.map((k, i) => [k, values.result[i]]);
  });
}

/** Sustituye todo el contenido de los almacenes en una sola transacción. */
export function replaceAll({ kv, days, photos }) {
  return run(STORES, 'readwrite', (tx) => {
    STORES.forEach((s) => tx.objectStore(s).clear());
    for (const [k, v] of kv) tx.objectStore('kv').put(v, k);
    for (const [k, v] of days) tx.objectStore('days').put(v, k);
    for (const [k, v] of photos) tx.objectStore('photos').put(v, k);
  });
}

/** Pide al navegador que no borre los datos por falta de espacio. */
export function persist() {
  return navigator.storage?.persist?.().catch(() => false);
}
