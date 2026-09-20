/* 表示専用の初期実測距離（IPS）。方向・時計角・回転角はモデルへ渡さない。
 * A〜Dの単一調整18区間（HOV18件＋Cruise11件）に、正式Cruise実測E1/E2を追加。
 * 欠測Cruiseはnull。Dの複数調整区間および前後ペアなしの参考値は含めない。
 * 行: ID, 種別, No., 方向, 調整量, HOV移動IPS, Cruise移動IPS。
 */
const BalanceDistancePrior = (() => {
  const rows = [
    ['A1', 'LINK', 1, 'UP', 0.5, 0.34561342317516075, null],
    ['A2', 'LINK', 1, 'UP', 2, 1.0951602030712921, null],
    ['A3', 'LINK', 1, 'DOWN', 0.5, 0.27568841840706326, null],
    ['A4', 'TAB', 2, 'DOWN', 1, 0.06676843386951678, 0.15177001696073375],
    ['A5', 'TAB', 2, 'DOWN', 2, 0.08604405839656547, 0.36000948835938007],
    ['B1', 'TAB', 1, 'DOWN', 1, 0.08058884601441074, 0.22722382565438554],
    ['B2', 'LINK', 2, 'DOWN', 0.25, 0.16150416138089613, 0.26078038535240095],
    ['B3', 'TAB', 3, 'DOWN', 1, 0.12234562347359308, 0.25083464888497375],
    ['B4', 'TAB', 3, 'DOWN', 1, 0.0204094035228159, 0.16443059545713223],
    ['B5', 'TAB', 2, 'UP', 1, 0.06560478917717313, 0.17902211413636812],
    ['C1', 'LINK', 3, 'UP', 0.25, 0.11281717958428707, null],
    ['C2', 'LINK', 3, 'UP', 0.25, 0.22625309674212263, null],
    ['C3', 'LINK', 2, 'UP', 0.25, 0.07809855326641321, null],
    ['C4', 'TAB', 2, 'UP', 2, 0.13098836890207852, 0.45599741007704253],
    ['C5', 'TAB', 1, 'UP', 2, 0.03128689300804617, 0.17027432495976993],
    ['C6', 'TAB', 3, 'DOWN', 1, 0.013080625846028638, 0.3251084496729846],
    ['D1', 'LINK', 1, 'UP', 0.5, 0.2501912778027389, null],
    ['D2', 'TAB', 1, 'UP', 1, 0.08379588496740036, 0.26481583744022225]
  ];
  // ユーザーが正式実測と指定した連続2区間。時計12時=上、時計回り、Y下向き。
  // getDotCoordinatesと同じ座標系をIPS単位で保持（中心平行移動は差分から消える）。
  const verifiedCruise = [
    { id: 'E1', blade: 1, before: { clock: '5:30', radius: 0.33 }, after: { clock: '6:31', radius: 0.35 } },
    { id: 'E2', blade: 3, before: { clock: '6:31', radius: 0.35 }, after: { clock: '7:09', radius: 0.19 } }
  ].map(({ id, blade, before, after }) => {
    const point = ({ clock, radius }) => {
      const [hour, minute] = clock.split(':').map(Number);
      const angle = ((hour % 12) * 30 + minute * 0.5) * Math.PI / 180;
      return Object.freeze({ x: radius * Math.sin(angle), y: -radius * Math.cos(angle) });
    };
    const start = point(before), end = point(after);
    const dx = end.x - start.x, dy = end.y - start.y, distance = Math.hypot(dx, dy);
    return Object.freeze({ id, type: 'LINK', color: 'blue', blade, direction: 'UP', amount: 0.25,
      source: 'verified-chart', before: Object.freeze(before), after: Object.freeze(after),
      start, end, actualVector: Object.freeze({ dx, dy, distance, angle: Math.atan2(dy, dx) * 180 / Math.PI }), distance });
  });
  const samples = Object.freeze([...rows.flatMap(([id, type, blade, direction, amount, red, blue]) =>
    [['red', red], ['blue', blue]].filter(([, distance]) => distance !== null)
      .map(([color, distance]) => Object.freeze({ id, type, blade, direction, amount, color, distance }))), ...verifiedCruise]);
  const keyFor = ({ type, blade, direction, amount }, color) => JSON.stringify([type, color, blade, direction, amount]);
  const grouped = new Map();
  for (const sample of samples) {
    const key = keyFor(sample, sample.color);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(sample.distance);
  }
  const models = new Map([...grouped].map(([key, values]) => {
    const sorted = [...values].sort((a, b) => a - b), count = sorted.length;
    const middle = Math.floor(count / 2);
    const distance = count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    // 少数サンプルなので全条件を低信頼扱い。ばらつきは隠さず保持する。
    return [key, Object.freeze({ distance, sampleCount: count, min: sorted[0], max: sorted.at(-1),
      range: sorted.at(-1) - sorted[0], confidence: 'low' })];
  }));
  function lookup(action, color) {
    return models.get(keyFor(action, color)) ?? null;
  }
  function resolve(action, color, prediction, confirmedSamples = [], radius = 240) {
    if (Number.isFinite(prediction?.distance) && prediction.distance >= 0) {
      return { distance: prediction.distance, source: 'learned' };
    }
    const prior = lookup(action, color);
    if (!prior) {
      // 参考値だけNo./方向を緩和。同色・同種別・同量の元実測のみを集計する。
      if (action.type === 'TAB' && color !== 'blue') return null;
      const values = samples.filter(sample => sample.type === action.type && sample.color === color
        // 新規Cruise LINKのUP実測はDOWNへ流用しない。他系統の既存集計は維持。
        && (!(action.type === 'LINK' && color === 'blue') || sample.direction === action.direction)
        && sample.amount === action.amount && Number.isFinite(sample.distance) && sample.distance > 0)
        .map(sample => sample.distance).sort((a, b) => a - b);
      if (values.length < 2) return null;
      const middle = Math.floor(values.length / 2);
      const medianDistance = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      return { distance: medianDistance * radius, source: 'reference-estimate',
        sampleCount: values.length, medianDistance, confidence: 'low' };
    }
    let distance = prior.distance * radius, actualCount = 0;
    // learning.sync()で実調整確認済みとなった実測だけ。履歴順に直近を強く反映。
    for (const sample of confirmedSamples) {
      if (keyFor(sample, sample.color) !== keyFor(action, color)) continue;
      const actual = sample.actualVector?.distance;
      if (!Number.isFinite(actual) || actual < 0) continue;
      distance *= BalanceLearning.distanceCorrection(distance, actual);
      actualCount += 1;
    }
    return { distance, source: actualCount ? 'prior-adjusted' : 'prior', actualCount, prior };
  }
  return Object.freeze({ samples, lookup, resolve });
})();
