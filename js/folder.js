// Picks the EPARNER FORM folder on your computer and lists its PDFs. The forms are read locally, never uploaded.
// Chrome/Edge: the folder is remembered (IndexedDB) and only needs one "Allow" click on later visits.
const DB = 'geff', STORE = 'handles';
function idb(mode, fn) {
  return new Promise((ok, bad) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => bad(req.error);
    req.onsuccess = () => { const tx = req.result.transaction(STORE, mode); const r = fn(tx.objectStore(STORE)); tx.oncomplete = () => ok(r?.result); tx.onerror = () => bad(tx.error); };
  });
}
const saveHandle = h => idb('readwrite', s => s.put(h, 'forms')).catch(() => {});
export const savedHandle = () => idb('readonly', s => s.get('forms')).catch(() => null);

async function walk(dir, prefix = '') {
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') out.push(...await walk(h, prefix + name + '/'));
    else if (/\.pdf$/i.test(name)) out.push({ path: prefix + name, file: await h.getFile() });
  }
  return out;
}

export const canRemember = 'showDirectoryPicker' in window;

// Ask for a folder (Chrome/Edge folder picker); returns [{ path, file }] and the folder name
export async function pickFolder() {
  const dir = await window.showDirectoryPicker({ id: 'geff-forms', mode: 'read' });
  await saveHandle(dir);
  return { name: dir.name, files: await walk(dir) };
}
// Re-open the remembered folder (needs a click: the browser asks to allow access again)
export async function reopen(handle) {
  if ((await handle.queryPermission({ mode: 'read' })) !== 'granted' && (await handle.requestPermission({ mode: 'read' })) !== 'granted') return null;
  return { name: handle.name, files: await walk(handle) };
}
// Fallback for other browsers: <input type="file" webkitdirectory> — paths start with the folder name
export function fromInput(fileList) {
  const list = [...fileList].filter(f => /\.pdf$/i.test(f.name));
  const root = list[0]?.webkitRelativePath.split('/')[0] || '';
  return { name: root, files: list.map(f => ({ path: f.webkitRelativePath.split('/').slice(1).join('/'), file: f })) };
}
