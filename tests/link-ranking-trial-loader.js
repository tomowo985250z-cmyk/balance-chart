/* 分離済みStorageを確認するまで本番スクリプトを一つも実行しない。 */
(async () => {
  try {
    if (!globalThis.linkTrialMemoryStorage || localStorage !== linkTrialMemoryStorage
      || parent === window || !parent.linkTrialHost) throw Error('Trial storage unavailable');
    const load = src => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.onload = resolve; script.onerror = () => reject(Error('Script unavailable: ' + src));
      document.body.append(script);
    });
    for (const script of document.querySelectorAll('script[data-trial-src]')) await load(script.dataset.trialSrc);
    await load('tests/link-ranking-legacy.js');
    await load('tests/link-ranking-policy.js');
    await load('tests/link-ranking-trial-adapter.js');
  } catch(error) {
    const notice = document.createElement('p');
    notice.textContent = '試験環境の起動失敗：' + error.message;
    document.body.prepend(notice);
    if (parent !== window && parent.linkTrialHost) parent.showLinkTrialComparison({notice:notice.textContent,rows:null});
  }
})();
