(() => {
  'use strict';

  const counter = document.getElementById('visitorCounter');
  const endpoint = counter?.dataset.apiUrl;
  if (!endpoint) {
    if (counter) counter.title = '人数の保存先が未設定です';
    return;
  }

  const deviceKey = 'balance-chart-visitor-device-v1';
  const visitedKey = 'balance-chart-visitor-date-v1';
  let busy = false;
  let timer;

  async function request(method, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint, {
        method,
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        ...(body ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        } : {})
      });
      if (!response.ok) throw new Error('Counter API failed');
      const result = await response.json();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date)
        || !Number.isSafeInteger(result.count) || result.count < 0) {
        throw new Error('Invalid counter response');
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function sync() {
    let result = await request('GET');
    let storageAvailable = true;
    try {
      // 永続化できない環境では加算せず、共通人数の表示だけ行う。
      let deviceId = localStorage.getItem(deviceKey);
      if (!deviceId) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        deviceId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(deviceKey, deviceId);
      }
      if (localStorage.getItem(visitedKey) !== result.date) {
        localStorage.setItem(visitedKey, localStorage.getItem(visitedKey) || '');
        result = await request('POST', { deviceId });
        localStorage.setItem(visitedKey, result.date);
      }
    } catch (error) {
      if (!(error instanceof DOMException)
        || !['SecurityError', 'QuotaExceededError'].includes(error.name)) throw error;
      storageAvailable = false;
    }
    counter.textContent = `本日のお客様 ${result.count.toLocaleString('ja-JP')}人`;
    counter.title = storageAvailable ? '日本時間の本日の閲覧人数' : '端末に保存できないため、この訪問は加算していません';
  }

  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    clearTimeout(timer);
    try {
      if (navigator.locks?.request) {
        await navigator.locks.request(deviceKey, sync);
      } else {
        await sync();
      }
    } catch {
      counter.textContent = '本日のお客様 —人';
      counter.title = '人数を取得できませんでした。自動的に再試行します';
    } finally {
      busy = false;
      timer = setTimeout(refresh, 60000);
    }
  }

  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  refresh();
})();
