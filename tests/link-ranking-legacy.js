/* 採用前の自動順位。比較テスト専用。本番からは読み込まない。 */
globalThis.LinkRankingLegacy = function(candidates) {
  const epsilon = 1e-9;
  const inward = candidates.filter(candidate => candidate.towardCenter);
  let pool = inward.length ? inward : [...candidates];
  for (const field of ['maxCenterDistance', 'distance']) {
    const minimum = Math.min(...pool.map(candidate => candidate[field]));
    pool = pool.filter(candidate => candidate[field] <= minimum + epsilon);
  }
  return pool.sort((a, b) => a.blade - b.blade
    || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN') || a.amount - b.amount)[0];
};
