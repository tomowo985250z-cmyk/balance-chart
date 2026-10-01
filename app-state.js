/* 保存・復元と端末内ファイル移行のみを担当する。計算エンジンには触れない。 */
(() => {
  let ready = false, queued = false;
  let initialChartRotations = [null, null];
  const status = document.getElementById('storageStatus');
  const transferStatus = document.getElementById('transferStatus');
  const profileSelect = document.getElementById('stateProfile');
  const updateInitialPositionButton = () => {
    document.getElementById('registerInitialPosition').classList.toggle('is-registered', Boolean(initialChartRotations[currentChartPage]));
  };
  const capture = () => ({
    version: 1, measurements: JSON.stringify(dotSets),
    redInputs: redInputs.map(input => input.value), blueInputs: blueInputs.map(input => input.value),
    memoValues: [...memoValues], adjustmentSelections: adjustmentSelections.map(values => [...values]),
    currentChartPage, guideCandidateIndex, pitchAutoMode, trimAutoMode,
    hovAngle, cruiseAngle, pageRotations, manualPitchAngles, autoPitchAngles, initialChartRotations,
    manualTrimCruiseAngle, autoTrimCruiseAngle, manualLearningReference,
    rotationLocked: rotationLock.checked, guidesVisible: dotOverlay.classList.contains('guides-visible'),
    actualAdjustment: actualAdjustment.checked,
    selectedTarget: selectedAdjustmentTarget?.learningId ?? null,
    forecast: adjustmentForecast,
    forecastCache: [...forecastDisplayCache].map(([key, entry]) => [key, { ...entry, points: [...entry.points] }]),
    resultEdit: resultEdit ? { target: resultEdit.set.learningId, draft: resultEdit.draft } : null,
    adjustmentEdit: adjustmentEdit ? { target: adjustmentEdit.set.learningId,
      index: adjustmentEdit.set.adjustments.indexOf(adjustmentEdit.adjustment), draft: adjustmentEdit.draft,
      draftTarget: adjustmentEdit.draftTarget?.learningId ?? null } : null,
    cruiseTarget: cruiseAdditionTarget?.learningId ?? null, cruiseInputDraft,
    viewBox: dotOverlay.getAttribute('viewBox')
  });
  const updateStatus = () => {
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    status.textContent = appStorage.error
      ? `保存保護中：${appStorage.error} バックアップを保存してください。`
      : `現在の保存先：${standalone ? 'ホーム画面' : 'ブラウザ'}。入力と表示状態をこの保存先に自動保存します。`;
    if (standalone && !dotSets.length && !appStorage.error) {
      document.getElementById('stateTools').open = true;
      status.textContent += ' Safariの状態を使う場合は、Safariで保存したバックアップを読み込んでください。';
    }
    if (appStorage.error) {
      document.getElementById('stateTools').open = true;
      document.querySelectorAll('.app input, .app button, .app select')
        .forEach(control => { if (!control.closest('#stateTools')) control.disabled = true; });
      rotationLock.checked = true; updateRotationLock();
    }
  };
  function flush() {
    if (!ready || restoringAppState || appStorage.readOnly) return;
    try { appStorage.setItem(BalanceState.uiKey, JSON.stringify(capture())); }
    catch { updateStatus(); }
  }
  globalThis.balanceSaveState = () => {
    updateInitialPositionButton();
    if (!ready || restoringAppState || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; flush(); });
  };
  globalThis.balanceFlushState = flush;
  const restore = state => {
    BalanceState.validateUI(state);
    initialChartRotations = (state.initialChartRotations ?? [null, null]).map(value => value ? { ...value } : null);
    if (!dotSets.length && initialChartRotations.some(Boolean)) {
      const pages = state.pageRotations.map((value, index) => ({ ...(initialChartRotations[index] ?? value) }));
      const active = initialChartRotations[state.currentChartPage];
      state = { ...state, pageRotations: pages,
        ...(active ?? {}),
        ...(initialChartRotations[0] ? { manualPitchAngles: { ...pages[0] }, autoPitchAngles: { ...pages[0] } } : {}),
        ...(initialChartRotations[1] ? { manualTrimCruiseAngle: pages[1].cruiseAngle, autoTrimCruiseAngle: pages[1].cruiseAngle } : {}) };
    }
    const setFor = id => dotSets.find(set => set.learningId === id) ?? null;
    restoringAppState = true;
    try {
      currentChartPage = state.currentChartPage; guideCandidateIndex = state.guideCandidateIndex;
      pitchAutoMode = state.pitchAutoMode; trimAutoMode = state.trimAutoMode;
      pageRotations.splice(0, 2, ...state.pageRotations);
      for (const key of ['hovAngle', 'cruiseAngle']) {
        manualPitchAngles[key] = state.manualPitchAngles[key]; autoPitchAngles[key] = state.autoPitchAngles[key];
      }
      manualTrimCruiseAngle = state.manualTrimCruiseAngle; autoTrimCruiseAngle = state.autoTrimCruiseAngle;
      for (const type of ['LINK', 'TAB']) manualLearningReference[type] = { ...state.manualLearningReference[type] };
      memoValues.splice(0, 4, ...state.memoValues);
      adjustmentSelections.splice(0, 4, ...state.adjustmentSelections);
      redInputs.forEach((input, index) => { input.value = state.redInputs[index]; });
      blueInputs.forEach((input, index) => { input.value = state.blueInputs[index]; });
      selectedAdjustmentTarget = setFor(state.selectedTarget);
      rotationLock.checked = state.rotationLocked; actualAdjustment.checked = state.actualAdjustment;
      const matchingMeasurements = state.measurements === JSON.stringify(dotSets);
      if (matchingMeasurements) {
        adjustmentForecast = state.forecast;
        forecastDisplayCache.clear();
        for (const [key, entry] of state.forecastCache) forecastDisplayCache.set(key, { ...entry, points: new Map(entry.points) });
        if (state.resultEdit && setFor(state.resultEdit.target)) resultEdit = { set: setFor(state.resultEdit.target), draft: state.resultEdit.draft };
        const editSet = state.adjustmentEdit && setFor(state.adjustmentEdit.target);
        if (editSet?.adjustments[state.adjustmentEdit.index]) adjustmentEdit = { set: editSet,
          adjustment: editSet.adjustments[state.adjustmentEdit.index], draft: state.adjustmentEdit.draft,
          draftTarget: setFor(state.adjustmentEdit.draftTarget) };
        cruiseAdditionTarget = setFor(state.cruiseTarget); cruiseInputDraft = state.cruiseInputDraft;
      }
      dotOverlay.classList.toggle('trim-tab', currentChartPage === 1);
      guideCandidateToggle.textContent = `ガイド線${guideCandidateIndex + 1}`;
      guideCandidateToggle.setAttribute('aria-pressed', String(guideCandidateIndex === 1));
      chartTitle.textContent = chartNames[currentChartPage];
      chartPageButtons.forEach((button, index) => {
        button.classList.toggle('is-active', index === currentChartPage);
        if (index === currentChartPage) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      updateMemoButtons(); updateEditingUI(); updateCruiseAdditionUI();
      renderDots();
      applyChartRotation(state.hovAngle, state.cruiseAngle);
      renderDirectionLines();
      updatePitchModeUI(); updateTrimModeUI(); setGuidesVisible(state.guidesVisible);
      const view = typeof state.viewBox === 'string' ? state.viewBox.trim().split(/\s+/).map(Number) : [];
      if (view.length === 4 && view.every(Number.isFinite) && view[2] > 0 && view[3] > 0) {
        dotOverlay.setAttribute('viewBox', state.viewBox);
        const restoreView = () => chartObject.contentWindow?.postMessage({ type: 'balance-chart-restore-view', viewBox: view }, '*');
        restoreView(); chartObject.addEventListener('load', restoreView, { once: true });
      }
    } finally { restoringAppState = false; }
  };
  try {
    const saved = appStorage.getItem(BalanceState.uiKey);
    if (saved && !appStorage.readOnly) restore(JSON.parse(saved));
  } catch (error) { appStorage.protect(error); }
  ready = true;
  updateStatus();
  updateInitialPositionButton();
  const positionDialog = document.getElementById('initialPositionConfirmation');
  const positionStatus = document.getElementById('initialPositionStatus');
  let pendingInitialPosition = null;
  document.getElementById('registerInitialPosition').addEventListener('click', () => {
    if (appStorage.readOnly) return;
    pendingInitialPosition = { page: currentChartPage, angles: { hovAngle, cruiseAngle } };
    document.getElementById('initialPositionConfirmationTitle').textContent =
      `${currentChartPage === 0 ? 'ピッチリンク' : 'トリムタブ'}の現在の六角形位置を初期位置として登録しますか？`;
    positionDialog.returnValue = '';
    positionDialog.showModal();
  });
  positionDialog.addEventListener('close', () => {
    const pending = pendingInitialPosition;
    pendingInitialPosition = null;
    if (positionDialog.returnValue !== 'save' || !pending || appStorage.readOnly) return;
    const next = initialChartRotations.map(value => value ? { ...value } : null);
    next[pending.page] = pending.angles;
    try {
      appStorage.setItem(BalanceState.uiKey, JSON.stringify({ ...capture(), initialChartRotations: next }));
      initialChartRotations = next;
      updateInitialPositionButton();
      positionStatus.textContent = '初期位置を登録しました。';
    } catch {
      positionStatus.textContent = '保存できませんでした。登録位置は変更していません。';
      updateStatus();
    }
  });
  window.addEventListener('balance-storage-status', updateStatus);
  for (const name of ['input', 'change', 'click', 'submit']) document.addEventListener(name, balanceSaveState);
  window.addEventListener('message', event => { if (event.source === chartObject.contentWindow) balanceSaveState(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('pageshow', updateStatus);
  const refillProfiles = () => {
    try {
      profileSelect.replaceChildren(...appStorage.profiles().map(profile => {
        const option = document.createElement('option'); option.value = profile.id;
        option.textContent = profile.name; option.selected = profile.id === appStorage.profile; return option;
      }));
    } catch { profileSelect.disabled = true; }
  };
  refillProfiles();
  document.getElementById('exportState').addEventListener('click', () => {
    flush();
    const blob = new Blob([appStorage.exportText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `balance-chart-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    transferStatus.textContent = '保存したファイルを、もう一方の起動先で「バックアップを読み込む」から選んでください。';
    navigator.storage?.persist?.().catch(() => {});
  });
  document.getElementById('importState').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error('ファイルが大きすぎます。Balance Chartのバックアップを選んでください。');
      const text = await file.text();
      flush(); appStorage.importText(text); ready = false;
      location.reload();
    } catch (error) { transferStatus.textContent = `読み込めませんでした。元のデータは変更していません。${error.message}`; }
    event.target.value = '';
  });
  profileSelect.addEventListener('change', () => {
    try { flush(); appStorage.selectProfile(profileSelect.value); ready = false; location.reload(); }
    catch (error) { transferStatus.textContent = error.message; }
  });
})();
