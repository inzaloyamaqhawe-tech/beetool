/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   portfolio-store.js — local binary storage for uploaded Portfolio of
   Evidence PDFs.

   Why this exists: localStorage (used by everything else in js/data.js) can
   only hold a few MB of text and is the wrong tool for multi-megabyte PDF
   files. IndexedDB is the browser's actual binary-capable local database, so
   uploaded files live here, keyed by "<scorecardId>:<personId>". Everything
   ELSE about a person's portfolio (status, filename, size, timestamps,
   rejection note) stays on the person object in STATE as usual, so it saves/
   loads/exports exactly like every other field in this app — only the raw
   file bytes get the special treatment.

   Once a backend exists, this store becomes a local cache/staging area: the
   real bytes go to the server via Api.uploadPersonPortfolio() (see
   js/api.js) and the server returns a URL, at which point this local copy is
   just a "last thing I uploaded, for the preview button" convenience.
   ========================================================================== */

const PSTORE_DB_NAME = 'centenaryBeePortfolios';
const PSTORE_STORE_NAME = 'files';

function pstoreOpen() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(PSTORE_DB_NAME, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(PSTORE_STORE_NAME)) {
        req.result.createObjectStore(PSTORE_STORE_NAME);
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function portfolioKey(scorecardId, personId) { return scorecardId + ':' + personId; }

async function pstoreSaveBlob(key, blob) {
  const db = await pstoreOpen();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(PSTORE_STORE_NAME, 'readwrite');
    tx.objectStore(PSTORE_STORE_NAME).put(blob, key);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
  });
}

async function pstoreGetBlob(key) {
  const db = await pstoreOpen();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(PSTORE_STORE_NAME, 'readonly');
    const req = tx.objectStore(PSTORE_STORE_NAME).get(key);
    req.onsuccess = function () { resolve(req.result || null); };
    req.onerror = function () { reject(req.error); };
  });
}

async function pstoreDeleteBlob(key) {
  const db = await pstoreOpen();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(PSTORE_STORE_NAME, 'readwrite');
    tx.objectStore(PSTORE_STORE_NAME).delete(key);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
  });
}
