export type ReferenceFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
};
export type RecentChat = { id: string; videoId: string; title: string };
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`chotu.web.${key}`) || "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(`chotu.web.${key}`, JSON.stringify(value));
  } catch {
    /* Private mode can disable storage. */
  }
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("chotu-web-references", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Your browser could not save this reference."));
  });
}
export async function storeFile(file: File): Promise<ReferenceFile> {
  const id = crypto.randomUUID();
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error("Not enough browser storage for this file."));
  });
  db.close();
  return {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    url: URL.createObjectURL(file),
  };
}
export async function restoreFiles(
  files: ReferenceFile[],
): Promise<ReferenceFile[]> {
  if (!files.length) return [];
  const db = await database();
  const result = await Promise.all(
    files.map(
      (file) =>
        new Promise<ReferenceFile>((resolve) => {
          const req = db.transaction("files").objectStore("files").get(file.id);
          req.onsuccess = () =>
            resolve({
              ...file,
              url: req.result ? URL.createObjectURL(req.result) : undefined,
            });
          req.onerror = () => resolve({ ...file, url: undefined });
        }),
    ),
  );
  db.close();
  return result;
}
export function fileMetadata(files: ReferenceFile[]) {
  return files.map(({ url: _url, ...file }) => file);
}
