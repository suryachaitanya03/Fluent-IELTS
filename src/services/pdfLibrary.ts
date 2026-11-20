export type PdfDocument = {
  id: string;
  name: string;
  size: number;
  addedAt: string;
  cloudSynced?: boolean;
};

type PdfRecord = PdfDocument & { blob: Blob };
const databaseName = 'fluent-study-materials';
const storeName = 'pdfs';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the study-material library.'));
  });
}

export async function savePdf(file: File, id: string = crypto.randomUUID()): Promise<PdfDocument> {
  const item: PdfRecord = { id, name: file.name, size: file.size, addedAt: new Date().toISOString(), blob: file };
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(item);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Could not save this PDF.')); };
  });
  const { blob: _blob, ...metadata } = item;
  return metadata;
}

export async function loadPdf(id: string): Promise<File | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => {
      db.close();
      const record = request.result as PdfRecord | undefined;
      resolve(record ? new File([record.blob], record.name, { type: 'application/pdf', lastModified: Date.parse(record.addedAt) }) : null);
    };
    request.onerror = () => { db.close(); reject(request.error ?? new Error('Could not open this PDF.')); };
  });
}

export async function removePdf(id: string): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error ?? new Error('Could not remove this PDF.')); };
  });
}

export async function clearPdfCache(): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Could not clear the local PDF cache.')); };
  });
}
