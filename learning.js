/* 実測XYによる調整支援。調整の実行・確定は行わない。 */
const BalanceLearning = (() => {
  const VERSION = 2;
  const STORAGE_KEY = 'balance-chart-learning-v1';
  // 指数重み：最新60%、1つ前24%、2つ前9.6%。3件で93.6%を占める。
  const RATE = 0.60;
  const MIN_SAMPLES = 3;
  const DETAIL_SAMPLES = 2;
  const AMOUNTS = { LINK: ['1/8', '1/4', '1/3', '1/2', '2/3', '3/4', '1', '2', '3'], TAB: ['1', '2', '3'] };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;
  const copy = value => JSON.parse(JSON.stringify(value));

  function adjustment(values) {
    if (!Array.isArray(values)) return null;
    const [blade, type, amountText, direction] = values;
    if (!['1', '2', '3'].includes(blade) || !['LINK', 'TAB'].includes(type) || !AMOUNTS[type].includes(amountText)
      || !['UP', 'DOWN'].includes(direction)) return null;
    const [numerator, denominator = '1'] = amountText.split('/');
    return { type, blade: Number(blade), direction, amount: Number(numerator) / Number(denominator) };
  }

  function create({ storage, coordinates, nominalAngle, radius = 240 }) {
    const empty = () => ({ version: VERSION, models: {}, samples: [], pending: {}, manual: {}, confirmed: {}, armed: {}, order: [], blocked: [], excluded: [] });
    let state = empty();
    let signature = '';
    let storageError = null;
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
      if ([1, VERSION].includes(saved?.version) && Array.isArray(saved.samples) && Array.isArray(saved.order)
        && Array.isArray(saved.blocked) && Array.isArray(saved.excluded)
        && saved.pending && typeof saved.pending === 'object' && saved.manual && typeof saved.manual === 'object') {
        state = { ...empty(), ...saved, version: VERSION, models: {},
          // 旧版の自動収集データを実調整と推定しない。測定履歴はそのまま残す。
          confirmed: saved.version === VERSION && saved.confirmed && typeof saved.confirmed === 'object' ? saved.confirmed : {},
          armed: saved.version === VERSION && saved.armed && typeof saved.armed === 'object' ? saved.armed : {},
          samples: saved.samples.filter(sample => sample && typeof sample.key === 'string').slice(-120),
          order: saved.order.filter(id => typeof id === 'string'),
          blocked: saved.blocked.filter(pair => typeof pair === 'string'),
          excluded: saved.excluded.filter(pair => typeof pair === 'string') };
      }
    } catch { storageError = '学習値を読み込めませんでした。'; }
    const save = () => {
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); storageError = null; }
      catch { storageError = '学習値を保存できません。この表示中だけ保持します。'; }
    };
    const keyFor = (type, color, blade, direction) => `${type}:${color}${blade ? `:${blade}:${direction}` : ''}`;
    const pairKey = (before, after) => `${before.learningId}/${after.learningId}`;
    const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
    const stamp = set => JSON.stringify([['red', 'blue'].map(color => {
      const point = set[color] && coordinates(set[color]);
      return point ? [point.x, point.y] : null;
    }), set.adjustments]);
    const singleAdjustment = set => set.adjustments?.length === 1 ? adjustment(set.adjustments[0]) : null;
    const validPrediction = prediction => prediction && Number.isFinite(prediction.angle)
      && (prediction.distance === null || (Number.isFinite(prediction.distance) && prediction.distance >= 0)) ? prediction : null;

    function confirmation(sets, afterId) {
      const index = sets.findIndex(set => set.learningId === afterId);
      if (index < 1) return null;
      const before = sets[index - 1], after = sets[index];
      const action = singleAdjustment(before), pair = pairKey(before, after);
      if (!action || state.blocked.includes(pair)) return null;
      const fingerprints = {};
      for (const color of ['red', 'blue']) {
        if (!before[color] || !after[color]) continue;
        const start = coordinates(before[color]), end = coordinates(after[color]);
        if (!finitePoint(start) || !finitePoint(end)) continue;
        fingerprints[color] = JSON.stringify([start, end, action]);
      }
      const colors = Object.keys(fingerprints);
      if (!colors.length) return null;
      return { pair, action, fingerprints, confirmed: colors.every(color =>
        state.confirmed[pair]?.fingerprints?.[color] === fingerprints[color]) };
    }

    function arm(sets, beforeId) {
      const before = sets.at(-1);
      if (before?.learningId !== beforeId || !singleAdjustment(before)) return false;
      state.armed[beforeId] = { stamp: stamp(before), nextId: null, captured: [], recordedAt: new Date().toISOString() };
      delete state.pending[beforeId];
      signature = '';
      save();
      return true;
    }

    // 新規測定の確定時だけ呼ぶ。編集・再描画からは呼ばない。
    function acceptMeasurement(sets, afterId, colors = ['red', 'blue']) {
      const entry = confirmation(sets, afterId);
      if (!entry) return false;
      const before = sets[sets.findIndex(set => set.learningId === afterId) - 1];
      const armed = state.armed[before.learningId];
      if (!armed || !Array.isArray(armed.captured) || armed.stamp !== stamp(before)
        || (armed.nextId && armed.nextId !== afterId)) return false;
      armed.nextId = afterId;
      const fingerprints = { ...state.confirmed[entry.pair]?.fingerprints };
      for (const color of ['red', 'blue']) {
        if (!colors.includes(color) || armed.captured.includes(color) || !entry.fingerprints[color]) continue;
        fingerprints[color] = entry.fingerprints[color];
        armed.captured.push(color);
      }
      state.confirmed[entry.pair] = { fingerprints, confirmedAt: new Date().toISOString() };
      signature = '';
      save();
      return true;
    }

    function modelFor(type, color, blade, direction, ready = true) {
      const enough = (model, count) => model && (!ready || (model.sampleCount >= count && model.angleSampleCount >= 2));
      const detail = state.models[keyFor(type, color, blade, direction)];
      const parent = state.models[keyFor(type, color)];
      if (blade && enough(detail, DETAIL_SAMPLES)) return detail;
      return enough(parent, MIN_SAMPLES) ? parent : null;
    }

    function predict(type, color, blade, direction, amount, start, ready = true) {
      const model = modelFor(type, color, blade, direction, ready);
      if (!model || !finitePoint(start) || !Number.isFinite(amount) || amount <= 0) return null;
      const manual = state.manual[keyFor(type, color)];
      // 手動修正は最大3度未満の補助情報。実測が増えるほど影響を弱める。
      const auxiliary = Number.isFinite(manual?.manualAngleCorrection)
        ? clamp(manual.manualAngleCorrection, -30, 30) * 0.1 / (1 + model.sampleCount) : 0;
      const baseAngle = nominalAngle(blade, direction) + model.baseRotation;
      const angleCorrection = model.angleCorrection + auxiliary;
      const angle = wrap(baseAngle + angleCorrection);
      const baseDistance = model.baseDistance * amount;
      const distance = baseDistance * model.distanceCorrection;
      const radians = angle * Math.PI / 180;
      const dx = distance * Math.cos(radians), dy = distance * Math.sin(radians);
      if (![baseDistance, distance, dx, dy, start.x + dx, start.y + dy].every(Number.isFinite)) return null;
      return { model: model.key, sampleCount: model.sampleCount, baseAngle: wrap(baseAngle), angleCorrection,
        angle, baseDistance, distanceCorrection: model.distanceCorrection, distance, dx, dy,
        position: { x: start.x + dx, y: start.y + dy }, rotation: wrap(model.baseRotation + angleCorrection), fallback: false };
    }

    function train(sample, detailed) {
      const { type, color, blade, direction, amount, actualVector: actual } = sample;
      const key = keyFor(type, color, detailed ? blade : null, direction);
      let model = state.models[key];
      const shortMovement = radius * 0.02;
      if (!model) {
        if (actual.distance < shortMovement || !Number.isFinite(actual.distance / amount)) return;
        model = state.models[key] = { key, type, color, blade: detailed ? blade : null,
          direction: detailed ? direction : null, sampleCount: 0, angleSampleCount: 0,
          baseRotation: wrap((sample.prediction?.prospective ? sample.prediction.angle : actual.angle) - nominalAngle(blade, direction)),
          baseDistance: actual.distance / amount,
          angleCorrection: 0, distanceCorrection: 1, lastUpdated: sample.lastUpdated };
      }
      if (actual.distance >= shortMovement) {
        const expectedAngle = nominalAngle(blade, direction) + model.baseRotation + model.angleCorrection;
        const error = wrap(actual.angle - expectedAngle);
        // 直近を優先しても、1件あたり最大13.5度という上限は維持する。
        const angleRate = RATE * Math.min(1, actual.distance / (radius * 0.1));
        model.angleCorrection = wrap(model.angleCorrection + clamp(error * angleRate, -13.5, 13.5));
      }
      const predictedDistance = model.baseDistance * amount * model.distanceCorrection;
      const ratio = clamp(actual.distance / predictedDistance, 0.5, 2);
      // 古い初回距離の倍率上限に張り付かないよう、前回予測を次回の基準にする。
      model.baseDistance = predictedDistance / amount;
      model.distanceCorrection = clamp(1 + RATE * (ratio - 1), 0.85, 1.3);
      model.sampleCount += 1;
      if (actual.distance >= shortMovement) model.angleSampleCount += 1;
      model.lastUpdated = sample.lastUpdated;
    }

    function rebuild() {
      state.models = {};
      for (const sample of state.samples) {
        // モデルは実測から再構成するため、編集・削除・再読込で重複学習しない。
        const prior = predict(sample.type, sample.color, sample.blade, sample.direction, sample.amount, sample.before, false);
        sample.prediction ??= prior ? { ...prior, prospective: false } : null;
        sample.angleError = sample.prediction && sample.actualVector.distance >= radius * 0.02
          ? wrap(sample.actualVector.angle - sample.prediction.angle) : null;
        sample.distanceRatio = sample.prediction?.distance > 0
          ? sample.actualVector.distance / sample.prediction.distance : null;
        train(sample, false);
        train(sample, true);
      }
    }

    function sync(sets, rotations) {
      const nextSignature = JSON.stringify(sets);
      if (signature === nextSignature) return;
      signature = nextSignature;
      const now = new Date().toISOString();
      const ids = sets.map(set => set.learningId);
      const oldOrder = state.order;
      const blocked = new Set(state.blocked);
      const excluded = new Set(state.excluded);
      const oldSamples = new Map(state.samples.map(sample => [sample.key, sample]));
      const samples = [];
      for (let index = 0; index < sets.length - 1; index += 1) {
        const before = sets[index], after = sets[index + 1];
        const pair = pairKey(before, after);
        const oldIndex = oldOrder.indexOf(before.learningId);
        if (oldIndex >= 0 && oldOrder.includes(after.learningId) && oldOrder[oldIndex + 1] !== after.learningId) blocked.add(pair);
        if (blocked.has(pair) || excluded.has(pair)) continue;
        const action = singleAdjustment(before);
        // 複数調整の合成移動を特定のLINK/TAB・BLDの効果と見なさない。
        if (!action) continue;
        for (const color of ['red', 'blue']) {
          if (!before[color] || !after[color]) continue;
          const start = coordinates(before[color]), end = coordinates(after[color]);
          if (!finitePoint(start) || !finitePoint(end)) continue;
          const dx = end.x - start.x, dy = end.y - start.y;
          const distance = Math.hypot(dx, dy);
          if (!Number.isFinite(distance)) continue;
          const key = `${pair}:${color}`;
          const fingerprint = JSON.stringify([start, end, action]);
          // 入力・編集だけでは学習しない。確認した値と一致する色だけが対象。
          if (state.confirmed[pair]?.fingerprints?.[color] !== fingerprint) continue;
          const previous = oldSamples.get(key);
          const pending = state.pending[before.learningId];
          const prediction = pending?.stamp === stamp(before) ? pending.predictions?.[color] : null;
          samples.push({
            key, fingerprint, ...action, color, before: start, after: end,
            actualVector: { dx, dy, distance, angle: Math.atan2(dy, dx) * 180 / Math.PI },
            prediction: validPrediction(previous?.fingerprint === fingerprint ? previous.prediction : prediction),
            lastUpdated: previous?.fingerprint === fingerprint && typeof previous.lastUpdated === 'string' ? previous.lastUpdated : now
          });
        }
      }
      state.samples = samples;
      state.order = ids;
      const alivePair = pair => pair.split('/').every(id => ids.includes(id));
      state.blocked = [...blocked].filter(alivePair);
      state.excluded = [...excluded].filter(alivePair);
      state.confirmed = Object.fromEntries(Object.entries(state.confirmed).filter(([pair]) => alivePair(pair)));
      state.armed = Object.fromEntries(Object.entries(state.armed).filter(([id]) => ids.includes(id)));
      state.pending = Object.fromEntries(Object.entries(state.pending).filter(([id]) => ids.includes(id)));
      rebuild();
      // 調整を記録した時点の予測を固定し、後の測定を見て予測を書き換えない。
      for (let index = 0; index < sets.length; index += 1) {
        const set = sets[index], after = sets[index + 1];
        const action = singleAdjustment(set);
        if (!action || (after?.red && after?.blue)) continue;
        const currentStamp = stamp(set);
        if (state.pending[set.learningId]?.stamp === currentStamp) continue;
        const predictions = {};
        for (const color of ['red', 'blue']) {
          if (!set[color] || after?.[color]) continue;
          const start = coordinates(set[color]);
          const prediction = predict(action.type, color, action.blade, action.direction, action.amount, start);
          predictions[color] = prediction ? { ...prediction, prospective: true } : {
            angle: wrap(nominalAngle(action.blade, action.direction) + rotations[action.type][color]),
            distance: null, prospective: true, fallback: true
          };
        }
        state.pending[set.learningId] = { stamp: currentStamp, predictions };
      }
      save();
    }

    function reset(sets) {
      state = empty();
      state.order = sets.map(set => set.learningId);
      state.excluded = sets.slice(0, -1).map((set, index) => pairKey(set, sets[index + 1]));
      signature = '';
      save();
    }

    function recordManual(type, color, autoAngle, manualFinalAngle) {
      if (!['LINK', 'TAB'].includes(type) || !['red', 'blue'].includes(color)
        || !Number.isFinite(autoAngle) || !Number.isFinite(manualFinalAngle)) return;
      state.manual[keyFor(type, color)] = { type, color, autoAngle, manualFinalAngle,
        manualAngleCorrection: wrap(manualFinalAngle - autoAngle), lastUpdated: new Date().toISOString() };
      save();
    }

    return { sync, predict, reset, recordManual, arm, acceptMeasurement,
      isArmed(set) { return state.armed[set.learningId]?.stamp === stamp(set); },
      disarm(beforeId) {
        delete state.armed[beforeId];
        for (const pair of Object.keys(state.confirmed)) if (pair.startsWith(`${beforeId}/`)) delete state.confirmed[pair];
        signature = '';
        save();
      },
      isConfirmed(sets, afterId, color) {
        const entry = confirmation(sets, afterId);
        return Boolean(entry?.fingerprints[color] && state.confirmed[entry.pair]?.fingerprints?.[color] === entry.fingerprints[color]);
      },
      latestCondition(type, color) { return copy(state.samples.findLast(sample => sample.type === type && sample.color === color) ?? null); },
      rotation(type, color, blade, direction) { return predict(type, color, blade, direction, 1, { x: 0, y: 0 })?.rotation ?? null; },
      inspect() { return copy({ ...state, storageError }); }
    };
  }

  return { create, adjustment, wrap, amounts: AMOUNTS, storageKey: STORAGE_KEY };
})();
