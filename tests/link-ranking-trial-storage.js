/* app.js / state-storage.jsより先に実行。失敗時は本体スクリプトを読み込まない。 */
(() => {
  if (parent === window || !parent.linkTrialHost) throw Error('Trial host required');
  const entries = new Map();
  const storage = parent.linkTrialHost.storage ?? {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(String(key)) ?? null; },
    setItem(key, value) { entries.set(String(key), String(value)); },
    removeItem(key) { entries.delete(String(key)); },
    clear() { entries.clear(); }
  };
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: false });
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: false });
    globalThis.linkTrialMemoryStorage = storage;
    globalThis.linkTrialBootId = Math.random();
    parent.linkTrialHost.storage = storage;
  } catch (error) {
    // 読込を停止し、通常Storageへのフォールバックを禁止する。
    window.stop();
    document.documentElement.replaceChildren(document.createTextNode('試験保存領域の分離に失敗しました'));
    throw error;
  }
})();
