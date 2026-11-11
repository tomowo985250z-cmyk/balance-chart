/* 旧キーは読取専用。測定・学習の変更は追記し、バックアップ取込は別データとして保存する。 */
const BalanceState = (() => {
  const prefix = 'balance-chart-state-v1:';
  const keys = ['balance-chart-learning-v1', 'balance-chart-dot-sets-v1', 'balance-chart-rotation-v1', 'balance-chart-note-v1'];
  const uiKey = 'balance-chart-ui-v1';
  const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function validateUI(data) {
    const strings = (value, length) => Array.isArray(value) && value.length === length && value.every(item => typeof item === 'string');
    const target = value => value === null || typeof value === 'string';
    const angles = value => object(value) && Number.isFinite(value.hovAngle) && Number.isFinite(value.cruiseAngle);
    const point = value => object(value) && ['red', 'blue'].includes(value.color)
      && [value.x, value.y, value.distance].every(Number.isFinite);
    const forecast = data?.forecast;
    const validForecast = value => object(value) && typeof value.targetId === 'string'
      && ['LINK', 'TAB'].includes(value.type) && ['preview', 'fixed', 'comparison'].includes(value.phase)
      && strings(value.values, 4) && Array.isArray(value.points) && value.points.every(point) && Array.isArray(value.waiting);
    const sequence = data?.adjustmentSequence;
    const origins = value => value === undefined || (object(value) && Object.entries(value).every(([color, origin]) =>
      ['red', 'blue'].includes(color) && object(origin) && ['actual', 'confirmed'].includes(origin.kind)
      && typeof origin.measurementId === 'string' && object(origin.dot) && origin.dot.color === color
      && typeof origin.dot.clock === 'string' && Number.isFinite(origin.dot.angle)
      && Number.isFinite(origin.dot.radius) && origin.dot.radius >= 0));
    const carry = data?.confirmedCarry;
    const validCarry = carry == null || (object(carry) && typeof carry.targetId === 'string'
      && Number.isInteger(carry.actionIndex) && carry.actionIndex >= 0 && strings(carry.values, 4)
      && Array.isArray(carry.points) && carry.points.every(point) && object(carry.observed)
      && ['red', 'blue'].every(color => carry.observed[color] === null || (object(carry.observed[color])
        && typeof carry.observed[color].id === 'string' && typeof carry.observed[color].signature === 'string')));
    const validSequence = sequence == null || (object(sequence) && typeof sequence.targetId === 'string'
      && typeof sequence.measurements === 'string' && Array.isArray(sequence.stages) && sequence.stages.length > 0
      && (sequence.flow === undefined || typeof sequence.flow === 'boolean')
      && (sequence.flow || [1, 2].includes(sequence.stages.length))
      && (!sequence.flow || (object(sequence.active) && Object.entries(sequence.active).every(([page,index]) =>
        ['0','1'].includes(page) && Number.isInteger(index) && index >= 0 && index < sequence.stages.length
        && sequence.stages[index]?.page === Number(page))))
      && (sequence.currentTargetId === undefined || typeof sequence.currentTargetId === 'string')
      && sequence.stages.every((stage, index) => object(stage) && [0, 1].includes(stage.page)
        && [0, 1, 2].includes(stage.rank) && strings(stage.values, 4) && stage.values.every(Boolean)
        && stage.values[1] === (stage.page === 0 ? 'LINK' : 'TAB') && typeof stage.targetId === 'string'
        && (index !== 0 || stage.targetId === sequence.targetId) && origins(stage.origins)
        && ['1', '2', '3', '—'].includes(stage.guideBlade) && typeof stage.actualAdjustment === 'boolean'
        && Number.isInteger(stage.actionIndex) && stage.actionIndex >= 0 && validForecast(stage.forecast)
        && (stage.rotations === undefined || (Array.isArray(stage.rotations) && stage.rotations.length === 2 && stage.rotations.every(angles)))
        && (stage.learningValues === undefined || (strings(stage.learningValues, 4) && target(stage.learningAfterId)))
        && (stage.editedGuides === undefined || (object(stage.editedGuides) && Object.entries(stage.editedGuides).every(([color,line]) =>
          ['red','blue'].includes(color) && object(line) && ['base','start','end'].every(key => object(line[key])
            && [line[key].x,line[key].y].every(Number.isFinite)))))
        && stage.forecast.targetId === stage.targetId && stage.forecast.type === stage.values[1]
        && JSON.stringify(stage.forecast.values) === JSON.stringify(stage.values) && stage.forecast.phase === 'fixed'
        && (index === 0 || (stage.origins ? Object.keys(stage.origins).length > 0
          && Object.keys(stage.origins).every(color => stage.forecast.points.some(item => item.color === color))
          : ['red', 'blue'].every(color => stage.forecast.points.some(item => item.color === color)))))
      && (sequence.flow || new Set(sequence.stages.map(stage => stage.page)).size === sequence.stages.length)
      && (sequence.draft == null || (object(sequence.draft) && [0, 1].includes(sequence.draft.page)
        && (sequence.draft.forecast === null || validForecast(sequence.draft.forecast)))));
    const valid = object(data) && validSequence && validCarry && data.version === 1 && typeof data.measurements === 'string'
      && strings(data.redInputs, 3) && strings(data.blueInputs, 3) && strings(data.memoValues, 4)
      && (data.adjustmentLock == null || (object(data.adjustmentLock)
        && [0, 1].includes(data.adjustmentLock.page) && [0, 1, 2].includes(data.adjustmentLock.rank)
        && strings(data.adjustmentLock.values, 4) && data.adjustmentLock.values.every(Boolean)
        && data.adjustmentLock.values[1] === (data.adjustmentLock.page === 0 ? 'LINK' : 'TAB')
        && ['1', '2', '3', '—'].includes(data.adjustmentLock.guideBlade)
        && typeof data.adjustmentLock.targetId === 'string' && typeof data.adjustmentLock.actualAdjustment === 'boolean'))
      && Array.isArray(data.adjustmentSelections) && [4, 6].includes(data.adjustmentSelections.length) && data.adjustmentSelections.every(value => strings(value, 4))
      && [0, 1].includes(data.currentChartPage) && [0, 1, 2].includes(data.guideCandidateIndex)
      && (data.guideCandidateIndices === undefined || (Array.isArray(data.guideCandidateIndices)
        && data.guideCandidateIndices.length === 2 && data.guideCandidateIndices.every(value => [0, 1, 2].includes(value))))
      && ['pitchAutoMode', 'trimAutoMode', 'rotationLocked', 'guidesVisible', 'actualAdjustment'].every(key => typeof data[key] === 'boolean')
      && [data.hovAngle, data.cruiseAngle, data.manualTrimCruiseAngle, data.autoTrimCruiseAngle].every(Number.isFinite)
      && angles(data.manualPitchAngles) && angles(data.autoPitchAngles)
      && (data.manualPitchInitialized === undefined || typeof data.manualPitchInitialized === 'boolean')
      && Array.isArray(data.pageRotations) && data.pageRotations.length === 2 && data.pageRotations.every(angles)
      && (data.initialChartRotations === undefined || (Array.isArray(data.initialChartRotations)
        && data.initialChartRotations.length === 2 && data.initialChartRotations.every(value => value === null || angles(value))))
      && object(data.manualLearningReference) && ['LINK', 'TAB'].every(type => object(data.manualLearningReference[type])
        && Object.entries(data.manualLearningReference[type]).every(([color, angle]) => ['red', 'blue'].includes(color) && Number.isFinite(angle)))
      && target(data.selectedTarget) && target(data.cruiseTarget) && (data.cruiseInputDraft === null || strings(data.cruiseInputDraft, 3))
      && (data.resultEdit === null || (object(data.resultEdit) && typeof data.resultEdit.target === 'string' && strings(data.resultEdit.draft, 6)))
      && (data.adjustmentEdit === null || (object(data.adjustmentEdit) && typeof data.adjustmentEdit.target === 'string'
        && Number.isInteger(data.adjustmentEdit.index) && data.adjustmentEdit.index >= 0 && strings(data.adjustmentEdit.draft, 4) && target(data.adjustmentEdit.draftTarget)))
      && (forecast === null || (object(forecast) && typeof forecast.targetId === 'string' && ['LINK', 'TAB'].includes(forecast.type)
        && ['preview', 'fixed', 'comparison'].includes(forecast.phase) && strings(forecast.values, 4)
        && Array.isArray(forecast.points) && forecast.points.every(point) && Array.isArray(forecast.waiting)))
      && Array.isArray(data.forecastCache) && data.forecastCache.every(entry => Array.isArray(entry) && entry.length === 2
        && typeof entry[0] === 'string' && object(entry[1]) && typeof entry[1].targetId === 'string' && typeof entry[1].measurements === 'string'
        && Array.isArray(entry[1].points) && entry[1].points.every(pair => Array.isArray(pair) && pair.length === 2
          && ['red', 'blue'].includes(pair[0]) && point(pair[1]) && strings(pair[1].savedValues, 4)));
    if (!valid) throw Error('画面の保存状態を読み取れません。原本は保持しています。');
  }
  function validateRecords(records) {
    if (!object(records) || Object.keys(records).some(key => ![...keys, uiKey].includes(key))) throw Error('バックアップの項目が不正です。');
    for (const [key, raw] of Object.entries(records)) {
      if (typeof raw !== 'string') throw Error('保存データの形式が不正です。');
      if (key === keys[3]) continue;
      const data = JSON.parse(raw);
      if (key === keys[0] && (!object(data) || ![1, 2].includes(data.version)
        || !['samples', 'order', 'blocked', 'excluded'].every(name => Array.isArray(data[name]))
        || !['pending', 'manual'].every(name => object(data[name])))) throw Error('学習データを読み取れません。原本は保持しています。');
      if (key === keys[1] && (!Array.isArray(data) || data.some(set => !object(set)))) throw Error('測定履歴を読み取れません。');
      if (key === keys[2] && !object(data)) throw Error('回転設定を読み取れません。');
      if (key === uiKey) validateUI(data);
    }
    const learned = records[keys[0]] && JSON.parse(records[keys[0]]);
    const measurements = records[keys[1]] ? JSON.parse(records[keys[1]]) : [];
    if (learned?.samples.length && (!measurements.length || learned.order.some(id => !measurements.some(set => set.learningId === id)))) {
      throw Error('学習データに対応する測定履歴がありません。原本を保護しています。');
    }
    return records;
  }
  function open(storage) {
    let profile = 'original', headRaw = null, head = { version: 1, name: '元のデータ', records: {}, ui: null };
    let data = {}, failure = null;
    const report = error => {
      failure = error instanceof Error ? error.message : String(error);
      globalThis.dispatchEvent?.(new Event('balance-storage-status'));
    };
    const read = () => {
      profile = storage.getItem(prefix + 'active') || 'original';
      if (!/^[a-zA-Z0-9-]+$/.test(profile)) throw Error('保存先情報を読み取れません。');
      data = {};
      if (profile === 'original') for (const key of keys) {
        const raw = storage.getItem(key);
        if (raw !== null) data[key] = raw;
      }
      headRaw = storage.getItem(prefix + profile + ':head');
      if (profile !== 'original' && headRaw === null) throw Error('選択した保存先が見つかりません。元のデータへ切り替えてください。');
      head = headRaw ? JSON.parse(headRaw) : { version: 1, name: '元のデータ', records: {}, ui: null };
      if (head.version !== 1 || !object(head.records) || (head.ui !== null && typeof head.ui !== 'string')) throw Error('保存先情報が不正です。');
      for (const key of keys) if (head.records[key]) {
        if (typeof head.records[key] !== 'string' || !head.records[key].startsWith(prefix + profile + ':record:')) throw Error('保存データの参照が不正です。');
        const record = JSON.parse(storage.getItem(head.records[key]));
        if (!record || record.key !== key || typeof record.value !== 'string') throw Error('保存済みデータを読み取れません。原本を保護しています。');
        data[key] = record.value;
      }
      if (head.ui !== null) data[uiKey] = head.ui;
      validateRecords(data);
    };
    try { storage ??= globalThis.localStorage; read(); } catch (error) { report(error); }
    const checkWriter = () => {
      if (failure) throw Error(failure);
      if ((storage.getItem(prefix + 'active') || 'original') !== profile
        || storage.getItem(prefix + profile + ':head') !== headRaw) {
        throw Error('別の画面でデータが更新されました。上書きせず保護しました。再読み込みしてください。');
      }
    };
    const write = (key, value) => {
      try {
        checkWriter();
        if (![...keys, uiKey].includes(key) || typeof value !== 'string') throw Error('保存する項目が不正です。');
        if (data[key] === value) return;
        const next = { ...head, records: { ...head.records } };
        if (key === uiKey) { validateUI(JSON.parse(value)); next.ui = value; }
        else {
          const recordKey = prefix + profile + ':record:' + id();
          if (storage.getItem(recordKey) !== null) throw Error('保存IDが重複しました。');
          storage.setItem(recordKey, JSON.stringify({ key, value }));
          next.records[key] = recordKey;
        }
        const serialized = JSON.stringify(next);
        storage.setItem(prefix + profile + ':head', serialized);
        head = next; headRaw = serialized; data[key] = value;
      } catch (error) { report(error); throw error; }
    };
    const exportText = () => JSON.stringify({ format: 'BalanceChartBackup', version: 1,
      exportedAt: new Date().toISOString(), records: { ...data } }, null, 2);
    const importText = text => {
      const backup = JSON.parse(text);
      if (backup?.format !== 'BalanceChartBackup' || backup.version !== 1) throw Error('Balance Chartのバックアップを選んでください。');
      const records = validateRecords(backup.records);
      const nextProfile = id();
      const nextHead = { version: 1, name: `読込 ${new Date().toLocaleString()}`, records: {}, ui: records[uiKey] ?? null };
      // 全項目を別の保存先へ書き終えた後だけ切り替える。失敗しても使用中データは変えない。
      for (const key of keys) if (records[key] !== undefined) {
        const recordKey = prefix + nextProfile + ':record:' + id();
        if (storage.getItem(recordKey) !== null) throw Error('保存IDが重複しました。');
        storage.setItem(recordKey, JSON.stringify({ key, value: records[key] }));
        nextHead.records[key] = recordKey;
      }
      const newHeadKey = prefix + nextProfile + ':head';
      if (storage.getItem(newHeadKey) !== null) throw Error('保存先が重複しました。');
      storage.setItem(newHeadKey, JSON.stringify(nextHead));
      storage.setItem(prefix + 'active', nextProfile);
      return nextProfile;
    };
    const profiles = () => {
      const result = [{ id: 'original', name: '元のデータ' }];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix) || !key.endsWith(':head')) continue;
        const profileId = key.slice(prefix.length, -5);
        if (profileId === 'original') continue;
        try { result.push({ id: profileId, name: JSON.parse(storage.getItem(key)).name }); } catch { /* 破損項目は消さず残す。 */ }
      }
      return result;
    };
    return { getItem: key => data[key] ?? null, setItem: write, exportText, importText, profiles, protect: report,
      get readOnly() { return failure !== null; }, get error() { return failure; }, get profile() { return profile; },
      selectProfile(next) {
        if (!profiles().some(item => item.id === next)) throw Error('保存先が見つかりません。');
        storage.setItem(prefix + 'active', next);
      }
    };
  }
  return { open, keys, uiKey, prefix, validateRecords, validateUI };
})();
