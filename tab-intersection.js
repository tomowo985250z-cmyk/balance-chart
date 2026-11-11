/* 表示専用の交点評価。候補・選択・調整量・学習データは変更しない。 */
const BalanceTabIntersection = (() => {
  const EPS = 1e-7;
  const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  function intersect(red, blue, center, radius) {
    if (![red?.start, blue?.start, center, red?.unit, blue?.unit].every(finite)
      || !Number.isFinite(radius) || radius <= 0
      || ![red.maxTravel, blue.maxTravel].every(n => Number.isFinite(n) && n >= 0)) return null;
    const normalize = v => {
      const length = Math.hypot(v.x, v.y);
      return length > 0 ? { x: v.x / length, y: v.y / length } : null;
    };
    const u = normalize(red.unit), v = normalize(blue.unit);
    if (!u || !v) return null;
    const determinant = cross(u, v);
    if (Math.abs(determinant) < 1e-8) return null;
    const delta = { x: blue.start.x - red.start.x, y: blue.start.y - red.start.y };
    const redTravel = cross(delta, v) / determinant, blueTravel = cross(delta, u) / determinant;
    if (![redTravel, blueTravel].every(Number.isFinite) || redTravel < -EPS || blueTravel < -EPS
      || redTravel > red.maxTravel + EPS || blueTravel > blue.maxTravel + EPS) return null;
    const point = { x: red.start.x + Math.max(0, redTravel) * u.x, y: red.start.y + Math.max(0, redTravel) * u.y };
    const distance = Math.hypot(point.x - center.x, point.y - center.y) / radius;
    return distance <= 1 + EPS / radius
      ? { point, distance, redTravel: Math.max(0, redTravel), blueTravel: Math.max(0, blueTravel) } : null;
  }
  function evaluate(rows, legacyOrder, center, radius, sharedAmount) {
    let winner = null;
    const assessed = rows.map(row => {
      const intersection = intersect(row.red, row.blue, center, radius);
      const reaches = color => intersection && row[color]?.amounts?.some(p =>
        Number.isFinite(p.distance) && p.distance + EPS >= intersection[color + 'Travel']);
      const hov = row.red?.amounts?.find(p => p.amount === sharedAmount)?.ips;
      const eligible = Boolean(intersection && reaches('red') && reaches('blue') && Number.isFinite(hov) && hov <= 0.2);
      return { ...row, intersection, eligible };
    });
    const priority = row => {
      const index = legacyOrder.findIndex(old => old.blade === row.blade && old.direction === row.direction);
      return index < 0 ? legacyOrder.length + row.blade : index;
    };
    for (const row of assessed) {
      if (row.eligible && (!winner || row.intersection.distance < winner.intersection.distance
        || (row.intersection.distance === winner.intersection.distance && priority(row) < priority(winner)))) winner = row;
    }
    return { rows: assessed, winner };
  }
  return { intersect, evaluate };
})();
