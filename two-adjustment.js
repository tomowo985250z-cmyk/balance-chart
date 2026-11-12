/* 表示専用の2段階探索。予測式・学習・正式順位を変更せず、既存の予測関数で比較する。 */
const BalanceTwoAdjustment = (() => {
  const TYPES = ['LINK', 'TAB'];
  const finite = p => p && [p.x, p.y].every(Number.isFinite);
  // 無限直線の交点を保持し、前向き・各色の移動上限・チャート内を区別する。
  function geometry(red, blue, center, radius) {
    const EPS = 1e-7, cross = (a, b) => a.x * b.y - a.y * b.x;
    if (![red?.start, blue?.start, center].every(finite) || !Number.isFinite(radius) || radius <= 0) return { valid: false, reasons: ['missing'] };
    if (![red.unit, blue.unit].every(finite)) return { valid: false, reasons: ['direction'] };
    const normalized = u => { const n = Math.hypot(u.x, u.y); return n > 0 ? { x: u.x / n, y: u.y / n } : null; };
    const u = normalized(red.unit), v = normalized(blue.unit);
    if (!u || !v) return { valid: false, reasons: ['direction'] };
    const delta = { x: blue.start.x - red.start.x, y: blue.start.y - red.start.y }, determinant = cross(u, v);
    if (Math.abs(determinant) < 1e-8) return { valid: false, determinant, reasons: [Math.abs(cross(delta, u)) <= EPS ? 'collinear' : 'parallel'] };
    const redTravel = cross(delta, v) / determinant, blueTravel = cross(delta, u) / determinant;
    const point = { x: red.start.x + redTravel * u.x, y: red.start.y + redTravel * u.y };
    const distance = Math.hypot(point.x - center.x, point.y - center.y) / radius, reasons = [];
    if (redTravel < -EPS) reasons.push('behindRed');
    if (blueTravel < -EPS) reasons.push('behindBlue');
    for (const [color, travel, code] of [['red', redTravel, 'rangeRed'], ['blue', blueTravel, 'rangeBlue']]) {
      const limit = (color === 'red' ? red : blue).maxTravel;
      if (!Number.isFinite(limit) || limit < 0 || travel > limit + EPS) reasons.push(code);
    }
    if (!Number.isFinite(distance) || distance > 1 + EPS / radius) reasons.push('chart');
    return { valid: !reasons.length, reasons, determinant, point, distance, redTravel, blueTravel };
  }
  function actions(type, amounts) {
    return [1, 2, 3].flatMap(blade => ['UP', 'DOWN'].flatMap(direction => amounts[type].map(amountText => ({ type, blade, direction, amountText }))));
  }
  function metrics(points, origin, center, radius, crossGap = Infinity) {
    if (!['red', 'blue'].every(c => finite(points?.[c]) && finite(origin?.[c]))) return null;
    const ips = {}, initial = {}, improvement = {}, worsened = {};
    for (const c of ['red', 'blue']) {
      ips[c] = Math.hypot(points[c].x - center.x, points[c].y - center.y) / radius;
      initial[c] = Math.hypot(origin[c].x - center.x, origin[c].y - center.y) / radius;
      improvement[c] = initial[c] - ips[c]; worsened[c] = improvement[c] < -1e-9;
    }
    const total = initial.red + initial.blue, final = ips.red + ips.blue;
    return { ips, initial, improvement, worsened, hovSafe: ips.red <= .2,
      worseningCount: Number(worsened.red) + Number(worsened.blue), max: Math.max(ips.red, ips.blue), sum: final,
      improvementRate: total > 0 ? (total - final) / total : null, crossGap };
  }
  function key(m) { return [m.hovSafe ? 0 : 1, m.hovSafe ? 0 : m.ips.red, m.max, m.sum, m.worseningCount, m.crossGap]; }
  function compareValues(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }
  function search({ start, origin = start, amounts, predict, legacyRank = () => [0], center, radius, fixed = [] }) {
    if (fixed.length === 2) return { winner: null, groups: [], evaluated: 0, rejected: 0, reason: 'LINK・TABとも確定済み・探索しません' };
    if (!['red', 'blue'].every(c => finite(start?.[c]) && finite(origin?.[c]))) return { winner: null, groups: [], evaluated: 0, rejected: 0, reason: '赤青両方の起点が必要です（欠測を0として計算しません）' };
    const available = TYPES.filter(type => !fixed.some(stage => stage.action.type === type));
    const orders = available.length === 2 ? [TYPES, [...TYPES].reverse()] : [available];
    const byType = Object.fromEntries(TYPES.map(type => [type, actions(type, amounts)])), groups = new Map();
    let winner = null, evaluated = 0, rejected = 0, worseningPlans = 0, hovSafePlans = 0, adverseExample = null;
    const better = (a, b) => {
      if (!b) return true;
      const result = compareValues(key(a.metrics), key(b.metrics));
      return result < 0 || (result === 0 && compareValues(legacyRank(a), legacyRank(b)) < 0);
    };
    function retain(stages, points) {
      const last = stages.at(-1), m = metrics(points, origin, center, radius, last.crossGap);
      if (!m) { rejected++; return; }
      evaluated++;
      const all = [...fixed, ...stages], plan = { stages: all, optimized: stages, final: points, metrics: m,
        order: all.map(s => s.action.type).join('→'), fixedCount: fixed.length };
      if (m.hovSafe) hovSafePlans++;
      if (m.worseningCount) { worseningPlans++; if (!adverseExample || m.sum > adverseExample.metrics.sum) adverseExample = plan; }
      const link = all.find(s => s.action.type === 'LINK')?.action.blade, tab = all.find(s => s.action.type === 'TAB')?.action.blade;
      const groupKey = plan.order + '/' + link + '/' + tab;
      if (better(plan, groups.get(groupKey))) groups.set(groupKey, plan);
      if (better(plan, winner)) winner = plan;
    }
    for (const order of orders) {
      for (const action of byType[order[0]]) {
        const first = predict(start, action); if (!first) { rejected++; continue; }
        if (order.length === 1) retain([first], first.points);
        else for (const next of byType[order[1]]) {
          const second = predict(first.points, next); if (!second) { rejected++; continue; }
          retain([first, second], second.points);
        }
      }
    }
    return { winner, groups: [...groups.values()].sort((a, b) => compareValues(key(a.metrics), key(b.metrics)) || compareValues(legacyRank(a), legacyRank(b))),
      evaluated, rejected, worseningPlans, hovSafePlans, adverseExample,
      reason: winner ? '参考予測・確定操作は行いません' : '既存計算で赤青の予測が揃う候補なし' };
  }
  return { actions, metrics, search, key, compareValues, geometry };
})();
