console.log("app.js loaded");
const appStorage = BalanceState.open();
let restoringAppState = false;
let hovAngle = 0;
let cruiseAngle = 0;
let rotationLocked = false;
let rotationHandles = [];

const CHART_CENTER_X = 397;
const CHART_CENTER_Y = 520;
const CHART_RADIUS = 240;
const CENTER_DISTANCE_THRESHOLD = 0.15;
const chartObject = document.querySelector('object[type="image/svg+xml"]');
const chartWrap = document.querySelector('.chart-wrap');
const chartTitle = document.getElementById('chartTitle');
const chartPageButtons = [...document.querySelectorAll('.chart-page')];
const chartNames = ['現在の調整：ピッチリンク', '現在の調整：トリムタブ'];
const chartNote = document.getElementById('chartNote');
const CHART_NOTE_STORAGE_KEY = 'balance-chart-note-v1';
let currentChartPage = 0;
const pageRotations = [{ hovAngle: 0, cruiseAngle: 0 }, { hovAngle: 0, cruiseAngle: 0 }];
const dotOverlay = document.getElementById('dotOverlay');
const rotationLock = document.getElementById('rotationLock');
const trimModeToggle = document.getElementById('trimModeToggle');
const pitchModeToggle = document.getElementById('pitchModeToggle');
let pitchAutoMode = true;
const pitchAutoReady = { red: false, blue: false };
const manualPitchAngles = { hovAngle: 0, cruiseAngle: 0 };
let manualPitchInitialized = false;
let initialChartRotations = [null, null];
const autoPitchAngles = { hovAngle: 0, cruiseAngle: 0 };
let trimAutoMode = true;
let trimAutoReady = false;
let trimHovAutoReady = false;
let manualTrimCruiseAngle = 0;
let autoTrimCruiseAngle = 0;
// TABの両六角形は、同じ自動角度で表示位置を巻き戻さない。
const lastAutoRotation = { TAB: {} };
const guideToggle = document.getElementById('guideToggle');
const guideToggleText = document.getElementById('guideToggleText');
const guideCandidateToggle = document.getElementById('guideCandidateToggle');
let tabIntersectionCandidates = [];
let tabIntersectionHighlight = null;
let twoAdjustmentReference = null;
let twoAdjustmentReferenceKey = null;
let twoAdjustmentReferenceReady = false;
let twoAdjustmentReferenceError = null;
const twoAdjustmentNote = document.getElementById('twoAdjustmentNote');
let guideCandidateIndex = 0;
const guideCandidateIndices = [0, 0];
// 調整量の操作後は、順位ではなく現在のNoを次のNo操作まで追跡する。
const retainedGuideNumbers = [null, null];
let guideNumberChoices = [];
let selectingGuideNumber = false;
let adjustmentForecast = null; // 表示専用。学習・測定履歴には保存しない。
const forecastDisplayCache = new Map(); // 候補切替で失われない表示用の生成済み座標。
let forecastGuides = {}; // 描画済みの選択線だけを予想ドット表示へ渡す。
let renderingDirectionLines = false;
let evaluatedLinkAmount = null;
// 実測結果の登録まで、確定した画面だけを重複追加から保護する。
let adjustmentLock = null;
let adjustmentSequence = null;
// 表示・次回計算専用。実測履歴や学習用の測定には書き込まない。
let confirmedCarry = null;

function colorMeasurementSignature(dot) {
  return dot ? JSON.stringify([dot.clock, dot.angle, dot.radius]) : null;
}

function latestActualFor(color, target) {
  const index = dotSets.indexOf(target);
  const set = dotSets.slice(0, index + 1).findLast(item => item[color]);
  return set ? { id: set.learningId, dot: set[color], signature: colorMeasurementSignature(set[color]) } : null;
}

function saveConfirmedCarry(stage) {
  const target = dotSets.find(set => set.learningId === stage.targetId);
  confirmedCarry = { targetId: stage.targetId, actionIndex: stage.actionIndex, values: [...stage.values],
    points: structuredClone(stage.forecast.points), observed: {} };
  for (const color of ['red', 'blue']) {
    const actual = latestActualFor(color, target);
    confirmedCarry.observed[color] = actual ? { id: actual.id, signature: actual.signature } : null;
  }
  if (stage.observed) confirmedCarry.observed = structuredClone(stage.observed);
  else stage.observed = structuredClone(confirmedCarry.observed);
}

function restoreConfirmedCarry() {
  if (!confirmedCarry && adjustmentSequence?.stages.length) saveConfirmedCarry(adjustmentSequence.stages.at(-1));
}

function carriedStartSet(target) {
  if (!target || !confirmedCarry || dotSets.indexOf(target) < dotSets.findIndex(set => set.learningId === confirmedCarry.targetId)) return target;
  const result = { ...target, originSources: {} };
  for (const color of ['red', 'blue']) {
    const actual = latestActualFor(color, target), previous = confirmedCarry.observed[color];
    const sourceIndex = dotSets.findIndex(set => set.learningId === confirmedCarry.targetId);
    const fresh = actual && (actual.id === previous?.id ? actual.signature !== previous.signature
      : dotSets.findIndex(set => set.learningId === actual.id) >= sourceIndex);
    if (fresh) {
      result[color] = actual.dot;
      result.originSources[color] = { kind: 'actual', measurementId: actual.id };
    } else {
      const point = confirmedCarry.points.find(item => item.color === color);
      result[color] = point ? { clock: target[color]?.clock ?? '12:00', color,
        angle: Math.atan2(point.x - CHART_CENTER_X, CHART_CENTER_Y - point.y) * 180 / Math.PI,
        radius: Math.hypot(point.x - CHART_CENTER_X, point.y - CHART_CENTER_Y) / CHART_RADIUS } : null;
      if (point) result.originSources[color] = { kind: 'confirmed', measurementId: confirmedCarry.targetId };
    }
  }
  return result;
}

function getOriginSnapshot(start) {
  return Object.fromEntries(['red', 'blue'].filter(color => start?.[color]).map(color => [color, {
    kind: start.originSources?.[color]?.kind ?? 'actual',
    measurementId: start.originSources?.[color]?.measurementId ?? start.learningId,
    dot: structuredClone(start[color])
  }]));
}

function getSequenceTargetId() {
  return getSequenceStage()?.targetId ?? adjustmentSequence?.currentTargetId ?? adjustmentSequence?.targetId;
}

function renderAdjustmentOrigins() {
  const target = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  const start = getAdjustmentStartSet(target), origins = getOriginSnapshot(start);
  const status = document.getElementById('adjustmentOriginStatus');
  status.hidden = !Object.values(origins).some(origin => origin.kind === 'confirmed');
  status.textContent = status.hidden ? '' : '調整起点：' + ['red', 'blue'].map(color =>
    `${color === 'red' ? 'HOV' : '巡航'} ${origins[color]?.kind === 'confirmed' ? '確定予測を引継ぎ' : origins[color] ? '実測' : '未取得'}`).join(' ／ ');
  dotOverlay.querySelector('.inherited-origins')?.remove();
  if (status.hidden || !dotOverlay.classList.contains('guides-visible')) return;
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('class', 'inherited-origins');
  for (const [color, origin] of Object.entries(origins)) {
    if (origin.kind !== 'confirmed') continue;
    const point = getDotCoordinates(origin.dot);
    if (adjustmentSequence?.stages.some(stage => stage.forecast.points.some(saved => saved.color === color
      && Math.hypot(saved.x - point.x, saved.y - point.y) < 1e-8))) continue;
    const group = document.createElementNS(layer.namespaceURI, 'g');
    group.dataset.color = color; group.dataset.source = 'confirmed';
    group.setAttribute('transform', `translate(${point.x} ${point.y})`);
    group.style.color = DOT_COLORS[color];
    const title = document.createElementNS(layer.namespaceURI, 'title');
    title.textContent = `${color === 'red' ? 'HOV' : '巡航'}：確定予測から引き継いだ調整起点`;
    const body = document.createElementNS(layer.namespaceURI, 'path');
    body.setAttribute('d', 'M 0 -7 L 7 0 L 0 7 L -7 0 Z');body.setAttribute('class', 'first-stage-forecast-body');
    const ring = document.createElementNS(layer.namespaceURI, 'circle');
    ring.setAttribute('r', '12');ring.setAttribute('class', 'forecast-glow');
    group.append(title, ring, body);layer.append(group);
  }
  dotOverlay.append(layer);
}

function getSequenceStage(page = currentChartPage) {
  const index = adjustmentSequence?.active?.[page];
  return Number.isInteger(index) ? adjustmentSequence.stages[index] ?? null : null;
}

function restoreLegacyAdjustmentSequence() {
  if (adjustmentSequence) {
    if (!adjustmentSequence.flow) {
      adjustmentSequence.active = {};
      adjustmentSequence.stages.forEach((stage, index) => { adjustmentSequence.active[stage.page] = index; });
      adjustmentSequence.flow = true;
    }
    adjustmentLock = getSequenceStage();
    return;
  }
  if (!adjustmentLock) return;
  const target = dotSets.find(set => set.learningId === adjustmentLock.targetId);
  const actionIndex = target?.adjustments?.findLastIndex(values =>
    JSON.stringify(values) === JSON.stringify(adjustmentLock.values)) ?? -1;
  if (actionIndex < 0) return;
  const saved = adjustmentLock.forecast ?? adjustmentForecast;
  const forecast = saved?.targetId === target.learningId
    && JSON.stringify(saved.values) === JSON.stringify(adjustmentLock.values)
    ? { ...structuredClone(saved), phase: 'fixed' }
    : { targetId: target.learningId, type: adjustmentLock.values[1], values: [...adjustmentLock.values],
      phase: 'fixed', points: [], waiting: ['red', 'blue'] };
  adjustmentSequence = { targetId: target.learningId, measurements: getMeasurementSignature(target),
    stages: [{ ...adjustmentLock, actionIndex, forecast }], active: { [adjustmentLock.page]: 0 }, flow: true, draft: null };
  adjustmentLock = getSequenceStage();
  if (!adjustmentLock) {
    adjustmentForecast = null;
    restoreAdjustmentSelection();
  }
  updateEditingUI();
  updateSequenceMessage();
}

function getAdjustmentStartSet(target = dotSets.at(-1)) {
  const stage = getSequenceStage();
  if (stage) target = dotSets.find(set => set.learningId === stage.targetId) ?? target;
  if (stage?.origins) return { ...target, red: stage.origins.red?.dot ?? null, blue: stage.origins.blue?.dot ?? null,
    originSources: Object.fromEntries(Object.entries(stage.origins).map(([color, origin]) => [color, { kind: origin.kind, measurementId: origin.measurementId }])) };
  return stage ? target : carriedStartSet(target);
}

function saveSequenceDraft() {
  if (adjustmentSequence && !adjustmentLock && !restoringAppState) {
    adjustmentSequence.draft = { page: currentChartPage, forecast: structuredClone(adjustmentForecast) };
  }
}

function updateSequenceMessage() {
  if (!adjustmentSequence) return;
  const pages = Object.keys(adjustmentSequence.active ?? {});
  adjustmentMessage.textContent = pages.length === 2
    ? 'LINK・TABの調整を確定しました。次の実測結果を入力すると、新しい調整を開始できます。'
    : pages.length === 1
      ? `${pages[0] === '0' ? 'LINK' : 'TAB'}の調整を確定しました。必要なら${pages[0] === '0' ? 'TAB' : 'LINK'}も続けて調整できます。そのまま次の実測結果を入力してもかまいません。`
      : '新しい実測結果を起点に調整できます。未取得の項目は直前の確定予測を引き継ぎます。';
}

function getMeasurementSignature(set) {
  return JSON.stringify(['red', 'blue'].map(color => set?.[color]
    ? [set[color].clock, set[color].angle, set[color].radius] : null));
}

function renderFirstStageForecast() {
  dotOverlay.querySelector('.first-stage-forecast')?.remove();
  const stages = adjustmentSequence?.stages;
  if (!stages?.length) return;
  const ns = 'http://www.w3.org/2000/svg', layer = document.createElementNS(ns, 'g');
  layer.setAttribute('class', 'first-stage-forecast confirmed-forecast-history');
  layer.dataset.state = 'confirmed-history';
  stages.forEach((stage, index) => stage.forecast.points.forEach(({ color, x, y }) => {
    if (stage === adjustmentLock) return;
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('transform', `translate(${x} ${y})`);
    group.style.color = DOT_COLORS[color]; group.dataset.color = color;
    group.dataset.adjustment = String(index + 1);
    group.style.opacity = index === stages.length - 1 ? '1' : '.5';
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${stage.values[1]}の確定予測（調整${index + 1}／${color === 'red' ? 'HOV' : '巡航'}）`;
    const body = document.createElementNS(ns, 'path');
    body.setAttribute('d', 'M 0 -7 L 7 0 L 0 7 L -7 0 Z');
    body.setAttribute('class', 'first-stage-forecast-body');
    group.append(title);
    if (index === stages.length - 1) {
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('r', '12');
      ring.setAttribute('class', 'forecast-glow');
      group.append(ring);
    }
    group.append(body); layer.append(group);
  }));
  dotOverlay.append(layer);
}

function confirmSelectedForecast() {
  const target = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  const startSet = getAdjustmentStartSet(target), action = BalanceLearning.adjustment(memoValues);
  const savedGuides = forecastGuides;
  const previousForecast = adjustmentForecast;
  // 手動変更時の非表示は維持し、確定座標だけは確定したNo.・方向で求める。
  forecastGuides = { ...savedGuides };
  for (const color of ['red', 'blue']) {
    if (!startSet?.[color] || !action) continue;
    const guide = savedGuides[color];
    if (guide?.targetId === target.learningId && guide.blade === action.blade && guide.direction === action.direction) continue;
    const line = getDirectionLine(startSet[color], color, null, action.blade, action.direction);
    if (line) forecastGuides[color] = { targetId: target.learningId, type: action.type,
      blade: action.blade, direction: action.direction, unit: getGuideMovementUnit(line) };
  }
  try {
    // 手動変更直後の非表示プレビューを流用せず、確定条件で再計算する。
    adjustmentForecast = null;
    updateAdjustmentForecast(memoValues, true, Boolean(previousForecast?.manualBlade),
      Boolean(previousForecast?.manualDirection));
  }
  finally { forecastGuides = savedGuides; }
  return adjustmentForecast && structuredClone(adjustmentForecast);
}

try {
  chartNote.value = appStorage.getItem(CHART_NOTE_STORAGE_KEY) || '';
} catch (error) {
  console.warn('チャートメモを読み込めませんでした。', error);
}

chartNote.addEventListener('input', () => {
  try {
    appStorage.setItem(CHART_NOTE_STORAGE_KEY, chartNote.value);
  } catch (error) {
    console.warn('チャートメモを保存できませんでした。', error);
  }
});

function setGuidesVisible(visible) {
  dotOverlay.classList.toggle('guides-visible', visible);
  guideToggle.setAttribute('aria-pressed', String(visible));
  guideToggleText.textContent = visible ? 'ガイド ON' : 'ガイド OFF';
  renderAdjustmentForecast();
}

guideToggle.addEventListener('click', () => {
  const visible = guideToggle.getAttribute('aria-pressed') !== 'true';
  setGuidesVisible(visible);
  if (visible) applySelectedGuideAdjustment();
});
guideCandidateToggle.addEventListener('click', () => {
  if (adjustmentLock?.page === currentChartPage) return;
  if (adjustmentEdit) adjustmentEdit.retainedGuideNumber = null;
  else retainedGuideNumbers[currentChartPage] = null;
  saveAdjustmentSelection();
  guideCandidateIndex = (guideCandidateIndex + 1) % 3;
  guideCandidateIndices[currentChartPage] = guideCandidateIndex;
  restoreAdjustmentSelection();
  selectingGuideNumber = true;
  try { renderDirectionLines(); } finally { selectingGuideNumber = false; }
});

function updateTabIntersectionHighlight() {
  tabIntersectionHighlight = null;
  const target = currentChartPage === 1 ? getAdjustmentStartSet() : null;
  if (target?.red && target?.blue && tabIntersectionCandidates.length) {
    const amount = Number(getSharedAdjustmentAmount(1));
    const samples = learning.inspect().samples;
    const rows = [];
    for (const blade of [1, 2, 3]) for (const direction of ['UP', 'DOWN']) {
      const matching = tabIntersectionCandidates.filter(raw => raw.blade === blade && (raw.direction ?? raw.line?.direction) === direction);
      const raw = matching.find(item => Number(item.amountText) === amount) ?? matching[0];
      const row = { blade, direction, red: null, blue: null };
      for (const color of ['red', 'blue']) {
        if (!raw) continue;
        const start = getDotCoordinates(target[color]);
        const predictionGuide = raw.predictions?.find(p => p.color === color);
        const line = color === 'red' ? getDirectionLine(target.red, color, null, blade, direction)
          : raw.line ?? (predictionGuide ? getPredictionGuideLine(predictionGuide) : null);
        if (!line) continue;
        const vector = getGuideMovementUnit(line), length = Math.hypot(vector.x, vector.y);
        if (!(length > 0)) continue;
        const unit = { x: vector.x / length, y: vector.y / length };
        const amounts = BalanceLearning.amounts.TAB.flatMap(text => {
          const action = BalanceLearning.adjustment([String(blade), 'TAB', text, direction]);
          const prediction = learning.predict('TAB', color, blade, direction, action.amount, start);
          const estimate = resolveDisplayDistance(action, color, prediction, prediction ? [] : samples, CHART_RADIUS);
          if (!Number.isFinite(estimate?.distance) || estimate.distance < 0) return [];
          const x = start.x + unit.x * estimate.distance, y = start.y + unit.y * estimate.distance;
          return [{ amount: action.amount, distance: estimate.distance, ips: Math.hypot(x - CHART_CENTER_X, y - CHART_CENTER_Y) / CHART_RADIUS }];
        });
        const x = start.x - CHART_CENTER_X, y = start.y - CHART_CENTER_Y, projection = x * unit.x + y * unit.y;
        const discriminant = projection * projection - (x * x + y * y - CHART_RADIUS * CHART_RADIUS);
        const rayExit = discriminant < 0 ? 0 : Math.max(0, -projection + Math.sqrt(discriminant));
        row[color] = { start, unit, amounts, maxTravel: Math.min(line.maxTravel ?? rayExit, Math.max(0, ...amounts.map(p => p.distance))) };
      }
      rows.push(row);
    }
    const legacyOrder = guideNumberChoices.map(choice => ({ blade: choice.blade, direction: choice.candidate?.direction ?? choice.candidate?.line?.direction }));
    tabIntersectionHighlight = BalanceTabIntersection.evaluate(rows, legacyOrder, { x: CHART_CENTER_X, y: CHART_CENTER_Y }, CHART_RADIUS, amount);
  }
  const blade = adjustmentLock?.page === currentChartPage ? Number(adjustmentLock.guideBlade) : guideNumberChoices[guideCandidateIndex]?.blade;
  const best = currentChartPage === 1 && Boolean(tabIntersectionHighlight?.winner) && tabIntersectionHighlight.winner.blade === blade;
  guideCandidateToggle.dataset.intersectionBest = String(best);
  if (best) guideCandidateToggle.setAttribute('aria-description', '赤青の有効交点が最も中心に近い候補です。');
  else guideCandidateToggle.removeAttribute('aria-description');
  updateTwoAdjustmentReference();
}

// 表示用の参考予測。入力・正式順位・予測キャッシュ・確定履歴・学習には書き込まない。
function updateTwoAdjustmentReference() {
  if (!twoAdjustmentReferenceReady || restoringAppState) return;
  try {
    const input = BalanceTwoAdjustmentContext.inputs(), context = BalanceTwoAdjustmentContext.create();
    const key = JSON.stringify([input, context.rotations, context.shared, pitchAutoMode, trimAutoMode, learning.inspect(), currentChartPage]);
    if (key !== twoAdjustmentReferenceKey) {
      const reference = BalanceTwoAdjustment.search({ ...input, amounts: BalanceLearning.amounts,
        predict: context.predict, legacyRank: context.legacyRank,
        center: { x: CHART_CENTER_X, y: CHART_CENTER_Y }, radius: CHART_RADIUS });
      reference.input = input;
      twoAdjustmentReference = reference;
      twoAdjustmentReferenceKey = key;
    }
    twoAdjustmentReferenceError = null;
  } catch (error) {
    twoAdjustmentReference = null;
    twoAdjustmentReferenceKey = null;
    twoAdjustmentReferenceError = error.message;
    console.error('2段階の参考予測を算出できませんでした', error);
  }
  renderTwoAdjustmentReference();
}

function renderTwoAdjustmentReference() {
  const winner = twoAdjustmentReference?.winner, type = currentChartPage === 0 ? 'LINK' : 'TAB';
  const stage = winner?.optimized.find(item => item.action.type === type);
  const blade = adjustmentLock ? Number(adjustmentLock.guideBlade) : guideNumberChoices[guideCandidateIndex]?.blade;
  const best = Boolean(stage && !adjustmentLock && stage.action.blade === blade);
  guideCandidateToggle.dataset.twoAdjustmentBest = String(best);
  if (best) guideCandidateToggle.setAttribute('aria-description', 'LINK＋TABの2段階参考予測で選ばれたNo.です。');
  else guideCandidateToggle.removeAttribute('aria-description');
  twoAdjustmentNote.hidden = !winner;
  const worsening = winner ? ['red', 'blue'].filter(color => winner.metrics.worsened[color])
    .map(color => color === 'red' ? 'HOV悪化' : '巡航悪化').join('・') : '';
  twoAdjustmentNote.replaceChildren();
  if (winner) {
    const add = (tag, className, text, parent = twoAdjustmentNote) => {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      parent.append(element);
      return element;
    };
    const header = add('div', 'two-adjustment-header', '');
    add('h2', 'two-adjustment-title', '2段階の参考予測', header);
    add('p', 'two-adjustment-help', '実測ではない参考値', header);
    const order = add('ol', 'two-adjustment-order', '');
    winner.stages.forEach(item => {
      const action = item.action;
      const step = add('li', '', `${item.fixed ? '確定済み固定 ' : ''}${action.type} No.${action.blade} `, order);
      add('strong', 'two-adjustment-direction', action.direction, step);
      step.append(' ');
      const quantity = add('span', 'two-adjustment-quantity', '', step);
      add('strong', 'two-adjustment-amount', action.amountText, quantity);
      add('span', '', action.type === 'TAB' ? '°' : 'フラット', quantity);
    });
    const predictions = add('div', 'two-adjustment-predictions', '');
    for (const [color, label] of [['red', 'HOV'], ['blue', '巡航']]) {
      const prediction = add('div', `two-adjustment-prediction two-adjustment-${color}`, '', predictions);
      add('span', 'two-adjustment-label', label, prediction);
      const reading = add('span', 'two-adjustment-reading', '', prediction);
      add('strong', 'two-adjustment-value', winner.metrics.ips[color].toFixed(3), reading);
      add('span', 'two-adjustment-unit', ' IPS', reading);
    }
    if (worsening) add('p', 'two-adjustment-warning', `${worsening}（起点との比較）`);
    if (!winner.metrics.hovSafe) add('p', 'two-adjustment-warning', 'HOV 0.2 IPS以内に到達する候補はありません。');
  }
  dotOverlay.querySelector('.two-adjustment-reference-points')?.remove();
  if (!winner) return;
  const ns = 'http://www.w3.org/2000/svg', layer = document.createElementNS(ns, 'g');
  layer.setAttribute('class', 'two-adjustment-reference-points');
  for (const color of ['red', 'blue']) {
    const point = winner.final[color], rect = document.createElementNS(ns, 'rect');
    for (const [name, value] of Object.entries({ x: point.x - 9, y: point.y - 9, width: 18, height: 18,
      fill: 'none', stroke: DOT_COLORS[color], 'stroke-width': 2, 'stroke-dasharray': '4 3' })) rect.setAttribute(name, value);
    const title = document.createElementNS(ns, 'title');
    title.textContent = 'LINK＋TABの2段階参考予測・実測ではありません';
    rect.append(title); layer.append(rect);
  }
  dotOverlay.append(layer);
}

function updateGuideCandidateToggle() {
  const locked = adjustmentLock?.page === currentChartPage;
  const blade = locked ? adjustmentLock.guideBlade : guideNumberChoices[guideCandidateIndex]?.blade;
  const type = currentChartPage === 0 ? 'LINK' : 'TAB';
  guideCandidateToggle.textContent = `${type} No.${blade ?? '—'}`;
  guideCandidateToggle.setAttribute('aria-label', `${type} No.${blade ?? '未選択'}、優先順位${guideCandidateIndex + 1}位。${locked ? '次の測定結果登録まで固定' : '次のNoに切替'}`);
  guideCandidateToggle.disabled = locked || !guideNumberChoices.length;
  guideCandidateToggle.dataset.rank = String(guideCandidateIndex + 1);
}
setGuidesVisible(true);
const dotForm = document.getElementById('dotForm');
const adjustmentForm = document.getElementById('adjustmentForm');
// 旧バックアップの設定値は保持するが、自動学習の指定としては使わない。
let legacyActualAdjustment = false;
const redInputs = ['redHourInput', 'redMinuteInput', 'redValueInput'].map((id) => document.getElementById(id));
const blueInputs = ['blueHourInput', 'blueMinuteInput', 'blueValueInput'].map((id) => document.getElementById(id));
const addDotButton = document.getElementById('addDotButton');
const dotMessage = document.getElementById('dotMessage');
const adjustmentMessage = document.getElementById('adjustmentMessage');
const dotList = document.getElementById('dotList');
const timePicker = document.getElementById('timePicker');
const timePickerTitle = document.getElementById('timePickerTitle');
const hourWheel = document.getElementById('hourWheel');
const minuteWheel = document.getElementById('minuteWheel');
const closeTimePicker = document.getElementById('closeTimePicker');
const confirmTimePicker = document.getElementById('confirmTimePicker');
const dotSets = [];
let cruiseAdditionTarget = null;
let cruiseInputDraft = null;
let resultEdit = null;
let adjustmentEdit = null;
const cancelCruiseAddition = document.getElementById('cancelCruiseAddition');
const cruiseAdditionMessage = document.getElementById('cruiseAdditionMessage');
const hovFieldset = document.querySelector('.dot-set-red');

function updateCruiseAdditionUI() {
  const index = dotSets.indexOf(cruiseAdditionTarget);
  if (cruiseAdditionTarget && (index < 0 || !cruiseAdditionTarget.red || cruiseAdditionTarget.blue)) {
    finishCruiseAddition();
    return;
  }
  const active = Boolean(cruiseAdditionTarget);
  hovFieldset.disabled = active;
  cancelCruiseAddition.hidden = !active;
  cruiseAdditionMessage.hidden = !active;
  cruiseAdditionMessage.textContent = active ? `結果 ${index + 1} に巡航を追加します。巡航の数値・時計角を入力してください。` : '';
  addDotButton.textContent = resultEdit ? '結果を更新' : active ? `結果 ${index + 1} に巡航を追加` : 'ドットを追加';
}

function finishCruiseAddition() {
  cruiseAdditionTarget = null;
  if (cruiseInputDraft) {
    blueInputs.forEach((input, index) => {
      input.value = cruiseInputDraft[index];
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  cruiseInputDraft = null;
  dotMessage.textContent = '';
  updateCruiseAdditionUI();
}

function startCruiseAddition(set) {
  if (!dotSets.includes(set) || !set.red || set.blue || getDotCount() >= MAX_DOTS) return;
  cancelEditing();
  if (!cruiseAdditionTarget) cruiseInputDraft = blueInputs.map((input) => input.value);
  cruiseAdditionTarget = set;
  blueInputs.forEach((input) => {
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  dotMessage.textContent = '';
  updateCruiseAdditionUI();
  dotForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
  blueInputs[2].focus({ preventScroll: true });
}

cancelCruiseAddition.addEventListener('click', finishCruiseAddition);
const memoButtons = ['memoOne', 'memoTwo', 'memoThree', 'memoFour'].map((id) => document.getElementById(id));
const memoPicker = document.getElementById('memoPicker');
const memoPickerTitle = document.getElementById('memoPickerTitle');
const memoWheel = document.getElementById('memoWheel');
const closeMemoPicker = document.getElementById('closeMemoPicker');
const confirmMemoPicker = document.getElementById('confirmMemoPicker');
let activeTimeInputs = null;
let activeMemoIndex = null;
let selectedMemoValue = '';
let memoPickerManualDirection = false;
let memoPickerDirectionChanged = false;
let memoPickerScrollY = null;
let memoPickerBackground = null;
let memoPickerTouchY = 0;
const memoValues = ['', '', '', ''];
const adjustmentSelections = Array.from({ length: 6 }, () => ['', '', '', '']);
let selectedHour = 0;
let selectedMinute = 0;

const DOT_COLORS = { red: '#d60000', blue: '#0066ff' };
const DIRECTION_ARROW_SEGMENTS = [
  { number: 1, start: { x: 397, y: 170 }, end: { x: 700.1, y: 345 }, upAtEnd: false },
  { number: 2, start: { x: 700.1, y: 345 }, end: { x: 700.1, y: 695 }, upAtEnd: true },
  { number: 3, start: { x: 700.1, y: 695 }, end: { x: 397, y: 870 }, upAtEnd: false },
  { number: 1, start: { x: 397, y: 870 }, end: { x: 93.9, y: 695 }, upAtEnd: true },
  { number: 2, start: { x: 93.9, y: 695 }, end: { x: 93.9, y: 345 }, upAtEnd: false },
  { number: 3, start: { x: 93.9, y: 345 }, end: { x: 397, y: 170 }, upAtEnd: true }
];
function getNominalAdjustmentAngle(blade, direction) {
  const side = DIRECTION_ARROW_SEGMENTS.find(segment => segment.number === blade);
  const towardEnd = direction === 'UP' ? side.upAtEnd : !side.upAtEnd;
  return Math.atan2(towardEnd ? side.end.y - side.start.y : side.start.y - side.end.y,
    towardEnd ? side.end.x - side.start.x : side.start.x - side.end.x) * 180 / Math.PI;
}
const learning = BalanceLearning.create({
  storage: { getItem: key => appStorage.getItem(key), setItem: (key, value) => appStorage.setItem(key, value) },
  coordinates: getDotCoordinates, nominalAngle: getNominalAdjustmentAngle, radius: CHART_RADIUS
});
const manualLearningReference = { LINK: {}, TAB: {} };
let guidePredictionDebug = { fallback: true };
window.balanceChartLearning = { inspect: () => ({ ...learning.inspect(), guides: structuredClone(guidePredictionDebug) }) };

function getSingleAdjustment(set, type) {
  const action = set?.adjustments?.length === 1 ? BalanceLearning.adjustment(set.adjustments[0]) : null;
  return action?.type === type ? action : null;
}

function getLearnedRotation(type, color) {
  const action = learning.latestCondition(type, color);
  return learning.rotation(type, color, action?.blade ?? 1, action?.direction ?? 'UP');
}

const DOT_STORAGE_KEY = 'balance-chart-dot-sets-v1';
const ROTATION_STORAGE_KEY = 'balance-chart-rotation-v1';
const MAX_DOTS = 14;
const MEMO_OPTIONS = [
  ['1', '2', '3'],
  ['LINK', 'TAB'],
  [],
  ['UP', 'DOWN']
];

function getThirdMemoOptions() {
  return memoValues[1] === 'LINK' ? ['3', '2', '1', '3/4', '2/3', '1/2', '1/3', '1/4', '1/8'] : memoValues[1] === 'TAB' ? ['3', '2', '1'] : [];
}

function formatMemoValue(value, index, type) {
  if (!value) return '';
  if (index === 0) return `No.${value}`;
  if (index === 2 && type === 'TAB') return `${value} 度`;
  if (index === 2 && type === 'LINK') return `${value} フラット`;
  return value;
}

function formatMemoInputValue(value, index) {
  return formatMemoValue(value, index, memoValues[1]) || '選択';
}

function getAdjustmentSelectionIndex() {
  return currentChartPage * 3 + guideCandidateIndex;
}

function getSharedAdjustmentAmount(page = currentChartPage) {
  return adjustmentSelections[page * 3][2] || (page === 0 ? '1/4' : '1');
}

function resetSharedAdjustmentAmounts() {
  adjustmentSelections.forEach((values, index) => { values[2] = index < 3 ? '1/4' : '1'; });
  memoValues[2] = getSharedAdjustmentAmount();
}

function saveAdjustmentSelection() {
  if (adjustmentLock) return;
  const amount = memoValues[2] || getSharedAdjustmentAmount();
  adjustmentSelections[getAdjustmentSelectionIndex()] = [...memoValues];
  // No・方向は候補別、量だけは同じ種別のNo.1〜3で共有する。
  adjustmentSelections.slice(currentChartPage * 3, currentChartPage * 3 + 3)
    .forEach(values => { values[2] = amount; });
}

function restoreAdjustmentSelection() {
  if (adjustmentLock) { updateMemoButtons(); return; }
  memoValues.splice(0, 4, ...adjustmentSelections[getAdjustmentSelectionIndex()]);
  updateMemoButtons();
}

function renderMemoButton(button, index) {
  const number = document.createElement('span');
  number.className = 'memo-number';
  number.textContent = `${index + 1}：\n`;
  const selection = document.createElement('span');
  selection.className = 'memo-selection';
  const value = document.createElement('span');
  value.className = 'memo-value';
  const unit = document.createElement('span');
  unit.className = 'memo-unit';
  value.textContent = formatMemoInputValue(memoValues[index], index);
  if (index === 2 && memoValues[index]) {
    value.textContent = memoValues[index];
    unit.textContent = memoValues[1] === 'TAB' ? '度' : 'フラット';
  }
  selection.append(value, ...(unit.textContent ? [document.createTextNode(' ')] : []), unit);
  button.replaceChildren(number, selection);
}

function updateMemoButtons() {
  if (adjustmentLock) {
    memoValues.splice(0, 4, ...adjustmentLock.values);
    memoButtons.forEach((button, index) => {
      renderMemoButton(button, index);
      button.disabled = true;
    });
    return;
  }
  if (!dotSets.length) {
    memoValues[0] = memoValues[3] = '';
    adjustmentSelections.forEach(values => { values[0] = values[3] = ''; });
  }
  memoValues[1] = currentChartPage === 0 ? 'LINK' : 'TAB';
  memoButtons.forEach((button, index) => {
    renderMemoButton(button, index);
  });
  memoButtons[1].disabled = true;
  memoButtons[0].disabled = memoButtons[3].disabled = false;
  const thirdOptions = getThirdMemoOptions();
  memoButtons[2].disabled = false;
  if (!thirdOptions.includes(memoValues[2])) memoValues[2] = getSharedAdjustmentAmount();
  renderMemoButton(memoButtons[2], 2);
  saveAdjustmentSelection();
}

function getVisibleGuideAdjustment() {
  if (!dotOverlay.classList.contains('guides-visible')) return null;
  const line = [...dotOverlay.querySelectorAll('.guide-direction-line:not([data-selection-excluded])')].find((candidate) => {
    const style = getComputedStyle(candidate);
    return style.display !== 'none' && style.visibility !== 'hidden'
      && style.visibility !== 'collapse' && Number(style.opacity) !== 0;
  });
  if (!line) return null;
  return forecastGuides[line.getAttribute('marker-end') === 'url(#redDirectionLineArrow)' ? 'red' : 'blue'] ?? null;
}

function applySelectedGuideAdjustment(preserveFixed = false) {
  if (restoringAppState || adjustmentLock) return;
  const guide = selectingGuideNumber ? (forecastGuides.red ?? forecastGuides.blue) : getVisibleGuideAdjustment();
  if (!guide) return;
  [String(guide.blade), guide.type, guide.direction].forEach((value, position) => {
    const index = [0, 1, 3][position];
    if (index === 0 && getRetainedGuideNumber()) return;
    memoValues[index] = value;
    renderMemoButton(memoButtons[index], index);
  });
  const retainedForecast = preserveFixed && ['fixed', 'comparison'].includes(adjustmentForecast?.phase) && !selectingGuideNumber;
  memoValues[2] ||= getSharedAdjustmentAmount();
  renderMemoButton(memoButtons[2], 2);
  saveAdjustmentSelection();
  if (retainedForecast) return;
  updateAdjustmentForecast(memoValues, false, getRetainedGuideNumber() ? isManualBladeSelection(memoValues) : false,
    Boolean(adjustmentForecast?.manualDirection && !selectingGuideNumber));
}

function getRetainedGuideNumber() {
  if (adjustmentEdit) return adjustmentEdit.retainedGuideNumber;
  const retained = retainedGuideNumbers[currentChartPage];
  return retained?.targetId === dotSets.at(-1)?.learningId ? retained : null;
}

function isManualBladeSelection(values) {
  const guide = getVisibleGuideAdjustment();
  return Boolean(guide && !guide.manual && String(guide.blade) !== values[0]);
}

function updateGuideSelectionVisibility(values) {
  const layer = dotOverlay.querySelector('.direction-lines');
  const line = layer?.querySelector('.guide-direction-line:not([data-selection-excluded])');
  if (!line) return;
  const guide = forecastGuides[line.getAttribute('marker-end') === 'url(#redDirectionLineArrow)' ? 'red' : 'blue'];
  // 自動表示の番号・方向と個別に比較する。予測計算や手動方向の履歴には使わない。
  const bladeChanged = Boolean(guide && values[0] !== String(guide.blade));
  const directionChanged = Boolean(guide && values[3] !== guide.direction);
  // 子の表示状態は保ち、自動値の取得と既存の予測計算を維持する。
  layer.style.opacity = bladeChanged || directionChanged ? '0' : '';
}

function centerMemoOption(option, behavior = 'auto') {
  const wheel = memoWheel.getBoundingClientRect(), bounds = option.getBoundingClientRect();
  memoWheel.scrollTo({ top: memoWheel.scrollTop + bounds.top - wheel.top
    - (memoWheel.clientHeight - bounds.height) / 2, behavior });
}

function selectMemoOption(option) {
  selectedMemoValue = option.dataset.value;
  previewMemoSelection();
  memoWheel.querySelectorAll('.time-wheel-option').forEach(item => item.setAttribute('aria-selected', String(item === option)));
}

function renderMemoWheel(options, selected, index) {
  memoWheel.replaceChildren();
  options.forEach((value) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'time-wheel-option';
    option.dataset.value = value;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(value === selected));
    option.textContent = formatMemoInputValue(value, index);
    option.addEventListener('click', () => {
      const immediate = index === 2 || index === 3;
      if (immediate) selectMemoOption(option);
      centerMemoOption(option, immediate ? 'instant' : 'smooth');
    });
    memoWheel.append(option);
    if (value === selected) requestAnimationFrame(() => {
      if (!memoPicker.hidden && activeMemoIndex === index && selectedMemoValue === selected) centerMemoOption(option);
    });
  });
  memoWheel.onscroll = () => {
    if (memoPicker.hidden) return;
    const center = memoWheel.getBoundingClientRect().top + memoWheel.clientHeight / 2;
    let closest = null;
    let distance = Infinity;
    memoWheel.querySelectorAll('.time-wheel-option').forEach((option) => {
      const rect = option.getBoundingClientRect();
      const optionDistance = Math.abs(rect.top + rect.height / 2 - center);
      if (optionDistance < distance) { closest = option; distance = optionDistance; }
    });
    if (closest && closest.dataset.value !== selectedMemoValue) selectMemoOption(closest);
  };
}

function openMemoPicker(index) {
  if (adjustmentLock || index === 1) return;
  const options = index === 2 ? getThirdMemoOptions() : MEMO_OPTIONS[index];
  if (!options.length) return;
  if (index === 2 && dotSets.length && !getRetainedGuideNumber()) {
    const retained = {
      targetId: dotSets.at(-1).learningId,
      blade: guideNumberChoices[guideCandidateIndex]?.blade
    };
    if (adjustmentEdit) adjustmentEdit.retainedGuideNumber = retained;
    else retainedGuideNumbers[currentChartPage] = retained;
  }
  if (memoPickerBackground) hideMemoPicker();
  activeMemoIndex = index;
  memoPickerManualDirection = Boolean(adjustmentForecast?.manualDirection);
  memoPickerDirectionChanged = false;
  const guide = getVisibleGuideAdjustment();
  const guideValue = [guide?.blade, guide?.type, null, guide?.direction][index];
  const initialValue = index === 2 ? getSharedAdjustmentAmount()
    : options.includes(String(guideValue)) ? String(guideValue) : options[0];
  selectedMemoValue = memoValues[index] || initialValue;
  memoPickerTitle.textContent = `調整量 ${index + 1} を選択`;
  memoPicker.classList.toggle('memo-amount-picker', index === 2);
  memoPickerScrollY = index === 2 ? window.scrollY : null;
  renderMemoWheel(options, selectedMemoValue, index);
  memoPicker.hidden = false;
  previewMemoSelection();
  if (index === 2) {
    // 予測は既存の2列表示を使い、ホイールの上で見比べられる位置へ移す。
    const body = document.body;
    memoPickerBackground = { style: body.getAttribute('style'), x: window.scrollX };
    body.style.width = `${document.documentElement.clientWidth}px`;
    document.documentElement.classList.add('amount-selection-open');
    const bounds = document.querySelector('.forecast-results').getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + bounds.top - 16, behavior: 'instant' });
    // iOSでも背景をスクロールさせず、元の横幅・見た目を保持する。
    Object.assign(body.style, { position: 'fixed', top: `${-window.scrollY}px`,
      left: `${-window.scrollX}px`, overflow: 'hidden' });
  }
}

function hideMemoPicker() {
  memoPicker.hidden = true;
  if (memoPickerBackground) {
    if (memoPickerBackground.style === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', memoPickerBackground.style);
    document.documentElement.classList.remove('amount-selection-open');
  }
  if (memoPickerScrollY !== null) window.scrollTo({ left: memoPickerBackground?.x ?? window.scrollX,
    top: memoPickerScrollY, behavior: 'instant' });
  memoPickerBackground = null;
  memoPickerScrollY = null;
}

function previewMemoSelection() {
  if (adjustmentLock) return;
  const values = [...memoValues];
  values[activeMemoIndex] = selectedMemoValue;
  if (activeMemoIndex === 1 && values[1] !== memoValues[1]) values[2] = '';
  memoPickerDirectionChanged ||= activeMemoIndex === 3 && selectedMemoValue !== memoValues[3];
  updateAdjustmentForecast(values, false, isManualBladeSelection(values),
    memoPickerManualDirection || memoPickerDirectionChanged);
}

function syncManualDirectionGuides(values, restoreFixed = false) {
  if (adjustmentLock && !restoreFixed) return;
  const action = BalanceLearning.adjustment(values);
  const target = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  const startSet = getAdjustmentStartSet(target);
  if (!action || !startSet) return;
  for (const color of ['red', 'blue']) {
    const guide = forecastGuides[color];
    // HOV欠測のLINKは自動候補を作らず、明示的に選択した調整だけ表示する。
    const manual = action.type === 'LINK' && !startSet.red && color === 'blue';
    if (!startSet[color] || (!manual && (guide?.targetId !== target.learningId || guide.type !== action.type
      || guide.blade !== action.blade))) continue;
    let node = dotOverlay.querySelector(`.guide-direction-line[marker-end="url(#${color}DirectionLineArrow)"]`);
    if (!node && !manual) continue;
    // 自動候補と同じ既存処理で、選んだ方向の学習ベクトルまたは六角形の線を求める。
    const start = getDotCoordinates(startSet[color]);
    const usesLearned = !guidePredictionDebug.fallback
      && (action.type === 'LINK' || color === 'blue' || !startSet.blue);
    const prediction = usesLearned
      ? learning.predict(action.type, color, action.blade, action.direction, action.amount, start) : null;
    const line = prediction ? getPredictionGuideLine({ start, ...prediction })
      : getDirectionLine(startSet[color], color, null, action.blade, action.direction);
    if (!line) continue;
    if (!node) {
      const layer = dotOverlay.querySelector('.direction-lines');
      if (!layer) continue;
      if (!layer.querySelector('#blueDirectionLineArrow')) appendDirectionArrowMarkers(layer);
      node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      for (const [name, value] of Object.entries({ class: 'guide-direction-line', stroke: DOT_COLORS.blue,
        'stroke-width': '1.8', 'stroke-dasharray': '9 7', 'stroke-linecap': 'round', opacity: '0.9',
        'marker-end': 'url(#blueDirectionLineArrow)' })) node.setAttribute(name, value);
      node.style.pointerEvents = 'none';
      layer.append(node);
    }
    const from = Math.hypot(line.base.x - CHART_CENTER_X, line.base.y - CHART_CENTER_Y) > CHART_RADIUS
      ? line.base : line.start;
    const end = line.displayEnd ?? line.end;
    node.setAttribute('x1', String(from.x)); node.setAttribute('y1', String(from.y));
    node.setAttribute('x2', String(end.x)); node.setAttribute('y2', String(end.y));
    guideDisplayGeometry.set(node, line);
    forecastGuides[color] = { ...guide, targetId: target.learningId, type: action.type, blade: action.blade,
      direction: action.direction, unit: getGuideMovementUnit(line), ...(manual ? { manual: true } : {}) };
  }
  updateGuideViewportEnds();
}

function updateAdjustmentForecast(values = memoValues, fixed = false,
  manualBlade = Boolean(adjustmentForecast?.manualBlade && values[0] === adjustmentForecast.values[0]),
  manualDirection = Boolean(adjustmentForecast?.manualDirection && values[3] === adjustmentForecast.values[3]),
  refresh = false) {
  if (adjustmentLock && !refresh) { renderAdjustmentForecast(); return; }
  if (manualDirection || adjustmentForecast?.manualDirection) syncManualDirectionGuides(values);
  updateGuideSelectionVisibility(values);
  if (restoringAppState) { renderAdjustmentForecast(); return; }
  const target = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  const startSet = getAdjustmentStartSet(target);
  const action = BalanceLearning.adjustment(values);
  if (!target || !action) {
    if (!['fixed', 'comparison'].includes(adjustmentForecast?.phase)) adjustmentForecast = null;
  } else {
    const key = JSON.stringify([target.learningId, startSet.red, startSet.blue, values]);
    if (!fixed || adjustmentForecast?.phase !== 'preview' || adjustmentForecast.key !== key) {
      const waiting = [];
      const points = ['red', 'blue'].flatMap(color => {
        if (!startSet[color]) return [];
        const prediction = learning.predict(action.type, color, action.blade, action.direction, action.amount, getDotCoordinates(startSet[color]));
        const estimate = resolveDisplayDistance(action, color, prediction,
          prediction ? [] : learning.inspect().samples, CHART_RADIUS);
        if (!estimate) waiting.push(color);
        const guide = forecastGuides[color];
        const start = getDotCoordinates(startSet[color]);
        if (!estimate || !Number.isFinite(estimate.distance) || estimate.distance < 0
          || !guide || guide.type !== action.type || guide.targetId !== target.learningId
          || ![start.x, start.y].every(Number.isFinite)) return [];
        // 学習距離、完全一致実測、表示専用の参考・最近傍比例距離の順で採用する。
        const x = start.x + guide.unit.x * estimate.distance;
        const y = start.y + guide.unit.y * estimate.distance;
        return [x, y].every(Number.isFinite) ? [{ color, x, y, distance: estimate.distance,
          source: estimate.source, sampleCount: estimate.sampleCount, medianDistance: estimate.medianDistance,
          baseAmount: estimate.baseAmount, ratio: estimate.ratio,
          ...(estimate.source === 'reference-coefficient' ? { coefficient: estimate.coefficient,
            referenceConditions: estimate.referenceConditions } : {}) }] : [];
      });
      if (points.length || !['fixed', 'comparison'].includes(adjustmentForecast?.phase)) {
        // 表示可否だけを保持する。予測座標・距離・学習用データは変更しない。
        adjustmentForecast = { key, targetId: target.learningId, type: action.type, phase: 'preview', points, waiting, values: [...values], manualBlade, manualDirection };
        rememberForecastDisplay(adjustmentForecast);
      }
    }
    if (fixed && adjustmentForecast?.phase === 'preview' && adjustmentForecast.key === key) adjustmentForecast.phase = 'fixed';
  }
  renderAdjustmentForecast();
  // 確定した共有量が変わった時だけ再順位付けする。pickerの仮選択は対象外。
  if (!renderingDirectionLines && currentChartPage === 0 && pitchAutoMode
    && evaluatedLinkAmount !== getSharedAdjustmentAmount(0)) {
    renderDirectionLines(Boolean(adjustmentForecast?.manualBlade || adjustmentForecast?.manualDirection));
  }
  if (!renderingDirectionLines) updateTabIntersectionHighlight();
}

// 表示・確定予測だけの不足時補完。候補順位と既存の学習式には渡さない。
function resolveDisplayDistance(action, color, prediction, samples = [], radius = CHART_RADIUS) {
  const estimate = BalanceDistancePrior.resolve(action, color, prediction, samples, radius);
  if (estimate) return estimate;
  // 同じ方式・色・No.の移動距離のみを使う。方向は距離係数に含めず、既存ガイドで決める。
  const references = BalanceDistancePrior.samples.filter(sample => sample.type === action.type
    && sample.color === color && sample.blade === action.blade && sample.amount > 0
    && Number.isFinite(sample.distance) && sample.distance >= 0);
  if (!references.length) return null;
  const rates = references.map(sample => sample.distance / sample.amount).sort((a, b) => a - b);
  const middle = Math.floor(rates.length / 2);
  const coefficient = rates.length % 2 ? rates[middle] : (rates[middle - 1] + rates[middle]) / 2;
  return { distance: coefficient * action.amount * radius, source: 'reference-coefficient',
    coefficient, sampleCount: references.length,
    referenceConditions: references.map(({ id, direction, amount }) => ({ id, direction, amount })) };
}

function refreshAdjustmentForecastAfterDeletion() {
  if (adjustmentSequence && adjustmentLock) {
    adjustmentForecast = structuredClone(adjustmentLock.forecast);
    renderAdjustmentForecast(); return;
  }
  if (restoringAppState || memoValues[1] !== (currentChartPage === 0 ? 'LINK' : 'TAB')) return;
  const guide = forecastGuides.red ?? forecastGuides.blue;
  updateAdjustmentForecast(memoValues, Boolean(adjustmentLock), isManualBladeSelection(memoValues),
    Boolean(guide && memoValues[3] !== guide.direction), true);
}

function invalidateAdjustmentForecast() {
  adjustmentForecast = null;
  forecastDisplayCache.clear();
  dotOverlay.querySelector('.adjustment-forecast')?.remove();
  renderForecastStatus();
  renderForecastInformation(null, 'none');
}

function compareAdjustmentForecast(result) {
  if (adjustmentForecast?.phase !== 'fixed') return;
  const index = dotSets.findIndex(set => set.learningId === adjustmentForecast.targetId);
  if (index >= 0 && dotSets[index + 1] === result) adjustmentForecast.phase = 'comparison';
}

function forecastGuideMatches(guide, values) {
  const action = BalanceLearning.adjustment(values);
  return Boolean(action && guide && guide.blade === action.blade && guide.direction === action.direction);
}

function getForecastDisplayEntry(forecast, create = false) {
  // 編集・削除された測定や別の調整量へ、古い予測を流用しない。
  for (const [key, entry] of forecastDisplayCache) {
    const target = dotSets.find(set => set.learningId === entry.targetId);
    if (!target || entry.measurements !== JSON.stringify([target.red, target.blue])) forecastDisplayCache.delete(key);
  }
  const target = dotSets.find(set => set.learningId === forecast.targetId);
  if (!target) return null;
  const start = getAdjustmentStartSet(target);
  const originKey = JSON.stringify([start?.red, start?.blue]);
  const key = JSON.stringify([forecast.targetId, forecast.type, forecast.values[0], forecast.values[3], forecast.values[2],
    ...(originKey === JSON.stringify([target.red, target.blue]) ? [] : [originKey])]);
  if (create && !forecastDisplayCache.has(key)) {
    forecastDisplayCache.set(key, { targetId: forecast.targetId,
      measurements: JSON.stringify([target.red, target.blue]), points: new Map() });
  }
  return forecastDisplayCache.get(key);
}

function rememberForecastDisplay(forecast) {
  const entry = getForecastDisplayEntry(forecast, true);
  if (!entry) return;
  for (const point of forecast.points) {
    if ([point.x, point.y].every(Number.isFinite)) {
      entry.points.set(point.color, { ...point, savedValues: [...forecast.values] });
    }
  }
}

function getForecastDisplayPoints(forecast) {
  const saved = getForecastDisplayEntry(forecast);
  const points = [...forecast.points];
  if (forecast.phase === 'preview' && forecast.targetId !== dotSets.at(-1)?.learningId) return points;
  // 同じ測定・種別・No・方向・調整量の生成済み座標だけを復元する。
  // 計算結果や学習用データには混ぜず、表示層だけで補う。
  for (const point of saved?.points.values() ?? []) {
    if (!points.some(current => current.color === point.color)) points.push(point);
  }
  return points;
}

function hasVisibleForecastGuide(color) {
  const line = dotOverlay.querySelector(`.guide-direction-line[marker-end="url(#${color}DirectionLineArrow)"]`);
  if (!line || !dotOverlay.classList.contains('guides-visible')) return false;
  const style = getComputedStyle(line);
  return style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility)
    && Number(style.opacity) !== 0;
}

function getCurrentForecastContext() {
  const forecast = adjustmentForecast;
  if (!forecast) return null;
  const values = [...memoValues];
  if (!memoPicker.hidden && activeMemoIndex !== null) values[activeMemoIndex] = selectedMemoValue;
  const target = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  if (target?.learningId !== forecast.targetId
    || !values.every((value, index) => value && value === forecast.values[index])
    || (forecast.manualBlade && !isConfirmedSequenceForecast(forecast))
    || (!adjustmentLock && guideNumberChoices.length && !guideNumberChoices[guideCandidateIndex]?.candidate)) return null;
  return { forecast, target: getAdjustmentStartSet(target) };
}

function isConfirmedSequenceForecast(forecast = adjustmentForecast) {
  return Boolean(adjustmentLock?.forecast && getSequenceStage() === adjustmentLock && forecast?.phase === 'fixed');
}

function renderForecastStatus(context = getCurrentForecastContext()) {
  const status = document.getElementById('forecastStatus');
  let state = 'none';
  if (context) {
    const { forecast, target } = context;
    const colors = ['red', 'blue'];
    // 描画キャッシュではなく、現在の選択に対する算出結果と既存の学習済み判定だけを使う。
    const available = target.red && target.blue
      && ['red', 'blue'].every(color => {
        const point = getDotCoordinates(target[color]);
        return [point.x, point.y].every(Number.isFinite);
      })
      && colors.every(color => forecast.points.some(point => point.color === color
        && [point.x, point.y, point.distance].every(Number.isFinite) && point.distance >= 0));
    if (available) state = colors.every(color => forecast.points.some(point => point.color === color
      && point.source === 'learned')) ? 'learned' : 'reference';
  }
  const [icon, label] = state === 'learned' ? ['●', '予測あり']
    : state === 'reference' ? ['▲', '参考推定'] : ['—', '予測なし'];
  if (status.dataset.state === state) return state;
  status.dataset.state = state;
  status.querySelector('.forecast-status-icon').textContent = icon;
  status.querySelector('.forecast-status-label').textContent = label;
  return state;
}

function renderForecastInformation(context, state) {
  const forecast = context?.forecast, target = context?.target;
  const displayPoints = forecast ? getForecastDisplayPoints(forecast) : [];
  for (const [color, id] of [['red', 'hovForecastResult'], ['blue', 'cruiseForecastResult']]) {
    const result = document.getElementById(id);
    const arrow = result.querySelector('.forecast-trend-arrow');
    const change = result.querySelector('.forecast-change');
    const value = result.querySelector('.forecast-value');
    const limit = result.querySelector('.forecast-limit');
    const point = displayPoints.find(point => point.color === color && [point.x, point.y].every(Number.isFinite));
    // 表示だけで現在IPSと生成済み予測IPSを比較する。判定は丸める前の値を使う。
    const current = target?.[color]?.radius;
    const available = point && Number.isFinite(current);
    result.dataset.trend = 'none';
    change.textContent = '予測なし';
    arrow.textContent = value.textContent = limit.textContent = '';
    arrow.hidden = value.hidden = limit.hidden = !available;
    result.title = target && !target[color] ? '欠測' : '';
    if (available) {
      const endpoint = Math.hypot(point.x - CHART_CENTER_X, point.y - CHART_CENTER_Y) / CHART_RADIUS;
      const trend = endpoint < current ? ['improved', '↓', '改善']
        : endpoint > current ? ['worsened', '↑', '悪化'] : ['unchanged', '→', '変化なし'];
      result.dataset.trend = trend[0]; arrow.textContent = trend[1]; change.textContent = trend[2];
      value.textContent = `${endpoint.toFixed(2)} IPS`;
      // 0.2以内かどうかは増減と別の行に表示し、改善と合格を混同しない。
      limit.textContent = endpoint <= BalanceLinkRanking.limit ? '0.2 IPS以内' : '0.2 IPS超';
    }
  }
  const notice = document.getElementById('forecastSelectionNotice');
  notice.hidden = true;
  notice.textContent = '';
  const noticeColors = [...new Set([...(forecast?.waiting ?? []),
    ...displayPoints.filter(point => point.savedValues).map(point => point.color)])];
  if (forecast?.phase !== 'comparison' && noticeColors.length) {
    notice.replaceChildren(...noticeColors.map(color => {
      const saved = displayPoints.find(point => point.color === color)?.savedValues;
      const label = color === 'red' ? 'HOV（赤）' : '巡航（青）';
      const row = document.createElement('span');
      row.textContent = saved ? `${label}：No.${saved[0]} ${saved[3]}の保存済み予測を表示` : `${label}：算出不能（学習・参考係数なし）`;
      return row;
    }));
    notice.hidden = false;
  }
  document.getElementById('forecastCaution').textContent = (forecast && state !== 'learned'
    ? '予測不確実（学習不足・参考推定または欠測）。' : '')
    + '予測の実測精度は未検証です。'
    + (currentChartPage === 0 && pitchAutoMode ? '0.18 IPSは参考目標です。' : '');
}

function renderAdjustmentForecast() {
  saveSequenceDraft();
  renderFirstStageForecast();
  if (adjustmentForecast || confirmedCarry || adjustmentSequence) renderAdjustmentOrigins();
  else {
    document.getElementById('adjustmentOriginStatus').hidden = true;
    dotOverlay.querySelector('.inherited-origins')?.remove();
  }
  const context = getCurrentForecastContext();
  const state = renderForecastStatus(context);
  renderForecastInformation(context, state);
  globalThis.balanceSaveState?.();
  dotOverlay.querySelector('.adjustment-forecast')?.remove();
  if (!adjustmentLock && guideNumberChoices.length && !guideNumberChoices[guideCandidateIndex]?.candidate) return;
  if (!adjustmentForecast) return;
  const confirmed = isConfirmedSequenceForecast();
  if (adjustmentForecast.manualBlade && !confirmed) return;
  if (!dotSets.some(set => set.learningId === adjustmentForecast.targetId)) { adjustmentForecast = null; return; }
  const displayPoints = getForecastDisplayPoints(adjustmentForecast);
  if (adjustmentForecast.type !== (currentChartPage === 0 ? 'LINK' : 'TAB')) return;
  if (!dotOverlay.classList.contains('guides-visible')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(ns, 'g');
  layer.setAttribute('class', `adjustment-forecast ${adjustmentForecast.phase}`);
  if (confirmed) layer.dataset.confirmedStage = String(adjustmentSequence.stages.indexOf(adjustmentLock) + 1);
  layer.style.pointerEvents = 'none';
  // 生成済み座標をそのまま描画する。
  displayPoints.forEach(({ color, x, y, savedValues }) => {
    if (![x, y].every(Number.isFinite)) return;
    if (!hasVisibleForecastGuide(color)) return;
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('transform', `translate(${x} ${y})`);
    group.style.color = DOT_COLORS[color];
    group.dataset.color = color;
    const title = document.createElementNS(ns, 'title');
    title.textContent = confirmed
      ? `${adjustmentForecast.type}の確定予測（${color === 'red' ? 'HOV' : '巡航'}）`
      : `${color === 'red' ? 'HOV' : '巡航'}予想位置`;
    if (savedValues) title.textContent += `（保存済み：${savedValues.map((value, index) => formatMemoValue(value, index, savedValues[1])).join(' ／ ')}）`;
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('r', '12');
    ring.setAttribute('class', 'forecast-glow');
    const body = document.createElementNS(ns, 'path');
    body.setAttribute('d', 'M 0 -7 L 7 0 L 0 7 L -7 0 Z');
    body.setAttribute('class', 'forecast-body');
    group.append(title, ring, body);
    layer.append(group);
  });
  dotOverlay.append(layer);
}

memoButtons.forEach((button, index) => button.addEventListener('click', () => openMemoPicker(index)));
closeMemoPicker.addEventListener('click', () => { hideMemoPicker(); updateAdjustmentForecast(memoValues, false, isManualBladeSelection(memoValues), memoPickerManualDirection); });
confirmMemoPicker.addEventListener('click', () => {
  if (adjustmentLock || activeMemoIndex === null) return;
  if (activeMemoIndex === 0) {
    if (adjustmentEdit) adjustmentEdit.retainedGuideNumber = null;
    else retainedGuideNumbers[currentChartPage] = null;
  }
  const manualDirection = memoPickerManualDirection || memoPickerDirectionChanged || (activeMemoIndex === 3 && selectedMemoValue !== memoValues[3]);
  memoValues[activeMemoIndex] = selectedMemoValue;
  if (activeMemoIndex === 1) memoValues[2] = '';
  updateMemoButtons();
  hideMemoPicker();
  updateAdjustmentForecast(memoValues, false, isManualBladeSelection(memoValues), manualDirection);
});
memoPicker.addEventListener('click', (event) => { if (event.target === memoPicker) { hideMemoPicker(); updateAdjustmentForecast(memoValues, false, isManualBladeSelection(memoValues), memoPickerManualDirection); } });
memoPicker.addEventListener('touchstart', event => {
  if (event.touches.length === 1) memoPickerTouchY = event.touches[0].clientY;
}, { passive: true });
memoPicker.addEventListener('touchmove', event => {
  if (memoPicker.hidden || activeMemoIndex !== 2 || event.touches.length !== 1) return;
  const delta = event.touches[0].clientY - memoPickerTouchY;
  memoPickerTouchY = event.touches[0].clientY;
  if (!memoWheel.contains(event.target)
    || (delta > 0 && memoWheel.scrollTop <= 0)
    || (delta < 0 && memoWheel.scrollTop + memoWheel.clientHeight >= memoWheel.scrollHeight - 1)) event.preventDefault();
}, { passive: false });
memoPicker.addEventListener('wheel', event => {
  if (!memoPicker.hidden && activeMemoIndex === 2 && !memoWheel.contains(event.target)) event.preventDefault();
}, { passive: false });
new MutationObserver(() => {
  if (memoPicker.hidden && memoPickerBackground) hideMemoPicker();
}).observe(memoPicker, { attributes: true, attributeFilter: ['hidden'] });
updateMemoButtons();

function loadRotation() {
  try {
    const saved = JSON.parse(appStorage.getItem(ROTATION_STORAGE_KEY) || '{}');
    const pages = Array.isArray(saved.pages) ? saved.pages : [saved];
    pages.slice(0, 2).forEach((page, index) => {
      pageRotations[index].hovAngle = Number.isFinite(page?.hovAngle) ? page.hovAngle : 0;
      pageRotations[index].cruiseAngle = Number.isFinite(page?.cruiseAngle) ? page.cruiseAngle : 0;
    });
  } catch {
    // 保存値が壊れていても初期角度で表示する。
  }
  hovAngle = pageRotations[0].hovAngle;
  cruiseAngle = pageRotations[0].cruiseAngle;
}

function saveRotation() {
  if (currentChartPage === 0 && !pitchAutoMode) manualPitchInitialized = true;
  pageRotations[currentChartPage] = currentChartPage === 0
    ? { ...manualPitchAngles }
    : { hovAngle, cruiseAngle: manualTrimCruiseAngle };
  try {
    appStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify({ pages: pageRotations }));
  } catch {
    // 保存領域を利用できない場合は、この表示中だけ回転角を保持する。
  }
  globalThis.balanceSaveState?.();
}

loadRotation();
Object.assign(manualPitchAngles, pageRotations[0]);
manualPitchInitialized = appStorage.getItem(ROTATION_STORAGE_KEY) !== null;
manualTrimCruiseAngle = pageRotations[1].cruiseAngle;
Object.assign(autoPitchAngles, manualPitchAngles);
autoTrimCruiseAngle = manualTrimCruiseAngle;

function restoreManualPitchRotation() {
  if (!manualPitchInitialized) {
    Object.assign(manualPitchAngles, initialChartRotations[0] ?? { hovAngle: 0, cruiseAngle: 0 });
    manualPitchInitialized = true;
  }
  pageRotations[0] = { ...manualPitchAngles };
  if (currentChartPage === 0) applyChartRotation(manualPitchAngles.hovAngle, manualPitchAngles.cruiseAngle);
}

function setRotationModeLabel(button, label, waiting = '') {
  const main = document.createElement('span');
  main.textContent = label;
  button.replaceChildren(main);
  if (waiting) {
    const status = document.createElement('span');
    status.className = 'rotation-mode-status';
    status.textContent = `（${waiting}）`;
    button.append(status);
  }
}

function updatePitchModeUI() {
  pitchModeToggle.disabled = adjustmentLock?.page === 0;
  pitchModeToggle.hidden = currentChartPage !== 0;
  const waiting = [!pitchAutoReady.red && 'HOV', !pitchAutoReady.blue && '巡航'].filter(Boolean);
  setRotationModeLabel(pitchModeToggle, `赤・青六角形：${pitchAutoMode ? '自動' : '手動'}`,
    pitchAutoMode && waiting.length ? `${waiting.join('・')}待ち` : '');
  pitchModeToggle.setAttribute('aria-pressed', String(pitchAutoMode));
  updateRotationLock();
}

pitchModeToggle.addEventListener('click', () => {
  if (adjustmentLock?.page === 0) return;
  pitchAutoMode = !pitchAutoMode;
  if (pitchAutoMode) syncAutoPitchRotation();
  else restoreManualPitchRotation();
  updatePitchModeUI();
  renderDirectionLines();
});

function updateTrimModeUI() {
  trimModeToggle.disabled = adjustmentLock?.page === 1;
  trimModeToggle.hidden = currentChartPage !== 1;
  const waiting = [!trimHovAutoReady && 'HOV', !trimAutoReady && '巡航'].filter(Boolean);
  setRotationModeLabel(trimModeToggle, `赤・青六角形：${trimAutoMode ? '自動' : '手動'}`,
    trimAutoMode && waiting.length ? `${waiting.join('・')}待ち` : '');
  trimModeToggle.setAttribute('aria-pressed', String(trimAutoMode));
  updateRotationLock();
}

trimModeToggle.addEventListener('click', () => {
  if (adjustmentLock?.page === 1) return;
  manualTrimCruiseAngle = autoTrimCruiseAngle = cruiseAngle;
  lastAutoRotation.TAB.red = getLearnedRotation('TAB', 'red') ?? getLatestTrimSyncAngle('red');
  lastAutoRotation.TAB.blue = getLearnedRotation('TAB', 'blue') ?? getLatestTrimSyncAngle();
  trimAutoMode = !trimAutoMode;
  if (trimAutoMode) syncAutoTrimRotation();
  else applyCruiseRotation(manualTrimCruiseAngle);
  updateTrimModeUI();
  renderDirectionLines();
});

function showChartPage(page) {
  restoreLegacyAdjustmentSequence();
  restoreConfirmedCarry();
  if (page < 0 || page >= chartNames.length || page === currentChartPage) return;
  saveSequenceDraft();
  saveAdjustmentSelection();
  guideCandidateIndices[currentChartPage] = guideCandidateIndex;
  saveRotation();
  currentChartPage = page;
  if (adjustmentSequence) {
    adjustmentLock = getSequenceStage(page);
    selectedAdjustmentTarget = dotSets.find(set => set.learningId === getSequenceTargetId()) ?? null;
    adjustmentForecast = structuredClone(adjustmentLock?.forecast
      ?? (adjustmentSequence.draft?.page === page ? adjustmentSequence.draft.forecast : null));
  }
  guideCandidateIndex = guideCandidateIndices[page];
  restoreAdjustmentSelection();
  dotOverlay.classList.toggle('trim-tab', page === 1);
  ({ hovAngle, cruiseAngle } = pageRotations[page]);
  if (page === 0 && pitchAutoMode) syncAutoPitchRotation();
  if (page === 0 && !pitchAutoMode) restoreManualPitchRotation();
  if (page === 1 && trimAutoMode) syncAutoTrimRotation();
  const svgDocument = chartObject.contentDocument;
  if (svgDocument) {
    setGroupRotation(svgDocument.getElementById('hovGroup'), hovAngle);
    setGroupRotation(svgDocument.getElementById('cruiseGroup'), cruiseAngle);
  }
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle, page }, '*');
  updateTrimModeUI();
  updatePitchModeUI();
  chartTitle.textContent = chartNames[page];
  chartPageButtons.forEach((button, index) => {
    button.classList.toggle('is-active', index === page);
    if (index === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderDirectionLines(adjustmentSequence?.draft?.page === page);
  renderAdjustmentForecast();
  updateEditingUI();
  updateSequenceMessage();
  updateAdjustmentTarget();
}

chartPageButtons.forEach((button, index) => button.addEventListener('click', () => showChartPage(index)));

function populateTimeSelect(select, minimum, maximum) {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '';
  select.append(placeholder);

  for (let value = minimum; value <= maximum; value += 1) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  }

  select.classList.add('time-select-value');
}

function renderTimeWheel(wheel, minimum, maximum, selected, setSelected) {
  wheel.replaceChildren();
  for (let value = minimum; value <= maximum; value += 1) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'time-wheel-option';
    option.dataset.value = String(value);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(value === selected));
    option.textContent = String(value);
    // タップは補助操作。通常はリールをスクロールするだけで中央の数値が選ばれる。
    option.addEventListener('click', () => option.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    wheel.append(option);
    if (value === selected) {
      requestAnimationFrame(() => option.scrollIntoView({ block: 'center' }));
    }
  }

  wheel.onscroll = () => {
    cancelAnimationFrame(wheel.selectionFrame);
    wheel.selectionFrame = requestAnimationFrame(() => {
      const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
      let closest = null;
      let distance = Infinity;
      wheel.querySelectorAll('.time-wheel-option').forEach((option) => {
        const rect = option.getBoundingClientRect();
        const optionDistance = Math.abs(rect.top + rect.height / 2 - center);
        if (optionDistance < distance) {
          closest = option;
          distance = optionDistance;
        }
      });
      if (!closest) return;
      const value = Number(closest.dataset.value);
      setSelected(value);
      wheel.querySelectorAll('.time-wheel-option').forEach((option) => {
        option.setAttribute('aria-selected', String(option === closest));
      });
    });
  };
}

function createTimePickerTrigger(hourInput, minuteInput) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'time-wheel-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');

  const updateTrigger = () => {
    trigger.textContent = hourInput.value === '' || minuteInput.value === ''
      ? '選択'
      : `${hourInput.value}:${String(minuteInput.value).padStart(2, '0')}`;
  };
  trigger.addEventListener('click', () => openTimePicker(hourInput, minuteInput));
  hourInput.addEventListener('change', updateTrigger);
  minuteInput.addEventListener('change', updateTrigger);
  minuteInput.after(trigger);
  updateTrigger();
}

function openTimePicker(hourInput, minuteInput) {
  activeTimeInputs = { hourInput, minuteInput };
  selectedHour = hourInput.value === '' || Number(hourInput.value) === 0 ? 1 : Number(hourInput.value);
  selectedMinute = minuteInput.value === '' ? 0 : Number(minuteInput.value);
  renderTimeWheel(hourWheel, 1, 12, selectedHour, (value) => { selectedHour = value; });
  renderTimeWheel(minuteWheel, 0, 59, selectedMinute, (value) => { selectedMinute = value; });
  timePicker.hidden = false;
}

function setupClockInput(input, pad = false, nextInput = null) {
  input.addEventListener('input', (event) => {
    input.value = input.value.replace(/\D/g, '').slice(0, 2);
    const advances = pad ? /^(?:[6-9]|[0-5][0-9])$/.test(input.value)
      : /^[2-9]$/.test(input.value) || /^(10|11|12)$/.test(input.value);
    if (nextInput && advances && !String(event.inputType).startsWith('delete')) nextInput.focus({ preventScroll: true });
  });
  input.addEventListener('change', () => {
    if (input.value !== '' && pad) input.value = String(Number(input.value)).padStart(2, '0');
  });
}

function normalizeMeasurementValue(input) {
  if (input.value === '') return;
  const value = Number(input.value);
  if (Number.isFinite(value) && value >= 0) input.value = value.toFixed(2);
}

function setupMeasurementValueInput(input, nextInput) {
  input.addEventListener('beforeinput', (event) => {
    if (event.inputType === 'deleteContentBackward' && /^\d\.$/.test(input.value)) {
      event.preventDefault();
      input.value = '';
    }
  });
  input.addEventListener('input', (event) => {
    const digits = input.value.replace(/\D/g, '').slice(0, 3);
    input.value = digits ? `${digits[0]}.${digits.slice(1)}` : '';
    if (digits.length === 3 && !String(event.inputType).startsWith('delete')) nextInput.focus({ preventScroll: true });
  });
  input.addEventListener('change', () => normalizeMeasurementValue(input));
  input.addEventListener('blur', () => normalizeMeasurementValue(input));
}

[redInputs, blueInputs].forEach((inputs) => {
  setupClockInput(inputs[0], false, inputs[1]);
  setupClockInput(inputs[1], true, inputs === redInputs ? blueInputs[2] : null);
  setupMeasurementValueInput(inputs[2], inputs[0]);
});

closeTimePicker.addEventListener('click', () => { timePicker.hidden = true; });
confirmTimePicker.addEventListener('click', () => {
  if (!activeTimeInputs) return;
  activeTimeInputs.hourInput.value = String(selectedHour);
  activeTimeInputs.minuteInput.value = String(selectedMinute);
  activeTimeInputs.hourInput.dispatchEvent(new Event('change', { bubbles: true }));
  activeTimeInputs.minuteInput.dispatchEvent(new Event('change', { bubbles: true }));
  timePicker.hidden = true;
});
timePicker.addEventListener('click', (event) => {
  if (event.target === timePicker) timePicker.hidden = true;
});

function updateRotationLock() {
  rotationLocked = rotationLock.checked || adjustmentLock?.page === currentChartPage;
  chartWrap.classList.toggle('is-rotation-locked', rotationLocked);
  const svg = chartObject.contentDocument?.documentElement;
  if (svg) svg.dataset.rotationLocked = String(rotationLocked);
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-rotation-lock', locked: rotationLocked }, '*');
  rotationHandles.forEach((handle) => {
    const disabled = rotationLocked || (currentChartPage === 0 && pitchAutoMode)
      || (currentChartPage === 1 && trimAutoMode);
    handle.style.pointerEvents = disabled ? 'none' : 'stroke';
    handle.setAttribute('pointer-events', disabled ? 'none' : 'stroke');
    handle.style.cursor = disabled ? 'default' : 'grab';
  });
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-auto-mode',
    trimActive: currentChartPage === 1 && trimAutoMode,
    pitchActive: currentChartPage === 0 && pitchAutoMode }, '*');
}

rotationLock.addEventListener('change', updateRotationLock);
rotationLock.addEventListener('input', updateRotationLock);
// 保存した回転角を復元した画面では、意図しない回転を防ぐためロックから開始する。
rotationLock.checked = true;
updateRotationLock();
updatePitchModeUI();
updateTrimModeUI();

function getStoredDot(dot, color) {
  if (!dot || dot.color !== color || !Number.isFinite(dot.angle) || !Number.isFinite(dot.radius)
    || dot.radius < 0 || typeof dot.clock !== 'string') return null;
  return { clock: dot.clock.replace(/^0:/, '12:'), angle: dot.angle, radius: dot.radius, color };
}

function newLearningId() {
  return globalThis.crypto?.randomUUID?.() ?? `result-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadDotSets() {
  try {
    const saved = JSON.parse(appStorage.getItem(DOT_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];

    return saved.reduce((sets, set) => {
      const restored = {
        learningId: typeof set?.learningId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(set.learningId)
          && !sets.some(item => item.learningId === set.learningId) ? set.learningId : newLearningId(),
        red: getStoredDot(set?.red, 'red'),
        blue: getStoredDot(set?.blue, 'blue'),
        adjustments: Array.isArray(set?.adjustments)
          ? set.adjustments.map((values) => Array.isArray(values) ? values.map((value) => String(value || '')).slice(0, 4) : []).filter((values) => values.some(Boolean))
          : Array.isArray(set?.memo) && set.memo.some(Boolean) ? [set.memo.map((value) => String(value || '')).slice(0, 4)] : []
      };
      const currentCount = sets.reduce((count, item) => count + Number(Boolean(item.red)) + Number(Boolean(item.blue)), 0);
      const setCount = Number(Boolean(restored.red)) + Number(Boolean(restored.blue));
      if (setCount && currentCount + setCount <= MAX_DOTS) sets.push(restored);
      return sets;
    }, []);
  } catch {
    return [];
  }
}

function saveDotSets() {
  try {
    appStorage.setItem(DOT_STORAGE_KEY, JSON.stringify(dotSets));
  } catch {
    // プライベートブラウズなど、端末の保存領域が使えない場合は何もしない。
  }
}

dotSets.push(...loadDotSets());
// 既存の測定形式に任意IDだけを追加し、学習履歴と編集・削除を対応させる。
saveDotSets();

function parseDotInput(hourValue, minuteValue, value) {
  const hours = Number(hourValue);
  const minutes = Number(minuteValue);
  const radius = Number(String(value).replace(',', '.'));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isFinite(radius)
    || hours < 1 || hours > 12 || minutes < 0 || minutes > 59 || radius < 0) return null;

  return { clock: `${hours}:${String(minutes).padStart(2, '0')}`, angle: (hours % 12) * 30 + minutes * 0.5, radius };
}

function readDotInput(inputs, color) {
  normalizeMeasurementValue(inputs[2]);
  const values = inputs.map((input) => input.value);
  if (values.every((value) => value === '')) return null;
  const dot = parseDotInput(...values);
  return dot ? { ...dot, color } : undefined;
}

function getDotCount() {
  return dotSets.reduce((count, set) => count + Number(Boolean(set.red)) + Number(Boolean(set.blue)), 0);
}

function getDotCoordinates(dot) {
  const angle = dot.angle * Math.PI / 180;
  return {
    x: CHART_CENTER_X + dot.radius * CHART_RADIUS * Math.sin(angle),
    y: CHART_CENTER_Y - dot.radius * CHART_RADIUS * Math.cos(angle)
  };
}

function getLatestTrimSyncAngle(color = 'blue') {
  for (let index = dotSets.length - 2; index >= 0; index -= 1) {
    const before = dotSets[index];
    const after = dotSets[index + 1];
    if (!before[color] || !after[color]) continue;
    // 自動回転への利用は学習の実調整指定とは独立させる。
    if (!getSingleAdjustment(before, 'TAB')) continue;
    const adjustment = before.adjustments[0];
    const start = getDotCoordinates(before[color]);
    const end = getDotCoordinates(after[color]);
    if (Math.hypot(end.x - start.x, end.y - start.y) < 0.001) continue;
    const side = DIRECTION_ARROW_SEGMENTS.find((segment) => segment.number === Number(adjustment[0]));
    const towardEnd = adjustment[3] === 'UP' ? side.upAtEnd : !side.upAtEnd;
    const from = towardEnd ? side.start : side.end;
    const to = towardEnd ? side.end : side.start;
    return (Math.atan2(end.y - start.y, end.x - start.x)
      - Math.atan2(to.y - from.y, to.x - from.x)) * 180 / Math.PI;
  }
  return null;
}

function getLatestLinkSyncAngle(color) {
  for (let index = dotSets.length - 2; index >= 0; index -= 1) {
    const before = dotSets[index];
    const after = dotSets[index + 1];
    if (!before[color] || !after[color]) continue;
    // 自動回転への利用は学習の実調整指定とは独立させる。
    if (!getSingleAdjustment(before, 'LINK')) continue;
    const adjustment = before.adjustments[0];
    const start = getDotCoordinates(before[color]);
    const end = getDotCoordinates(after[color]);
    if (Math.hypot(end.x - start.x, end.y - start.y) < 0.001) continue;
    const side = DIRECTION_ARROW_SEGMENTS.find((segment) => segment.number === Number(adjustment[0]));
    const towardEnd = adjustment[3] === 'UP' ? side.upAtEnd : !side.upAtEnd;
    const from = towardEnd ? side.start : side.end;
    const to = towardEnd ? side.end : side.start;
    return (Math.atan2(end.y - start.y, end.x - start.x)
      - Math.atan2(to.y - from.y, to.x - from.x)) * 180 / Math.PI;
  }
  return null;
}

function applyChartRotation(redAngle, blueAngle) {
  hovAngle = redAngle;
  cruiseAngle = blueAngle;
  pageRotations[currentChartPage] = { hovAngle, cruiseAngle };
  const svgDocument = chartObject.contentDocument;
  if (svgDocument) {
    const hovGroup = svgDocument.getElementById('hovGroup');
    const cruiseGroup = svgDocument.getElementById('cruiseGroup');
    if (hovGroup) setGroupRotation(hovGroup, redAngle);
    if (cruiseGroup) setGroupRotation(cruiseGroup, blueAngle);
  }
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle, page: currentChartPage }, '*');
}

function syncAutoPitchRotation() {
  if (!pitchAutoMode) return;
  const nextAngles = { ...(initialChartRotations[0] ?? { hovAngle: 0, cruiseAngle: 0 }) };
  for (const [color, key] of [['red', 'hovAngle'], ['blue', 'cruiseAngle']]) {
    const angle = getLearnedRotation('LINK', color) ?? getLatestLinkSyncAngle(color);
    pitchAutoReady[color] = angle !== null;
    if (Number.isFinite(angle)) nextAngles[key] = angle;
  }
  if (restoringAppState) return;
  Object.assign(autoPitchAngles, nextAngles);
  pageRotations[0] = { ...nextAngles };
  if (currentChartPage === 0) applyChartRotation(nextAngles.hovAngle, nextAngles.cruiseAngle);
  updatePitchModeUI();
}

function applyCruiseRotation(angle) {
  cruiseAngle = angle;
  pageRotations[currentChartPage] = { hovAngle, cruiseAngle };
  const group = chartObject.contentDocument?.getElementById('cruiseGroup');
  if (group) setGroupRotation(group, angle);
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle: angle, page: currentChartPage }, '*');
}

function syncAutoTrimRotation() {
  if (!trimAutoMode) return;
  const nextAngles = { ...pageRotations[1] };
  for (const [color, key] of [['red', 'hovAngle'], ['blue', 'cruiseAngle']]) {
    const angle = getLearnedRotation('TAB', color) ?? getLatestTrimSyncAngle(color);
    if (color === 'red') trimHovAutoReady = angle !== null;
    else trimAutoReady = angle !== null;
    const changed = !restoringAppState && angle !== null && angle !== lastAutoRotation.TAB[color];
    lastAutoRotation.TAB[color] = angle;
    if (restoringAppState) continue;
    nextAngles[key] = changed ? angle : currentChartPage === 1
      ? (color === 'red' ? hovAngle : cruiseAngle) : pageRotations[1][key];
    if (color === 'blue' && changed) autoTrimCruiseAngle = angle;
  }
  if (restoringAppState) return;
  manualTrimCruiseAngle = nextAngles.cruiseAngle;
  Object.assign(pageRotations[1], nextAngles);
  if (currentChartPage === 1) applyChartRotation(nextAngles.hovAngle, nextAngles.cruiseAngle);
  updateTrimModeUI();
}

function rotateAroundChartCenter(point, angle) {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - CHART_CENTER_X;
  const y = point.y - CHART_CENTER_Y;
  return { x: CHART_CENTER_X + x * cosine - y * sine, y: CHART_CENTER_Y + x * sine + y * cosine };
}

function scaleAroundChartCenter(point, scale) {
  return {
    x: CHART_CENTER_X + (point.x - CHART_CENTER_X) * scale,
    y: CHART_CENTER_Y + (point.y - CHART_CENTER_Y) * scale
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function getDirectionLine(dot, layer, adjustment, forcedNumber, forcedDirection, angles = { hovAngle, cruiseAngle }) {
  const center = getDotCoordinates(dot);
  const rotation = layer === 'red' ? angles.hovAngle : angles.cruiseAngle;
  const layerScale = layer === 'red' ? 1.02 : 0.84;
  const selectedNumber = Number.isInteger(forcedNumber) ? forcedNumber : Number(adjustment?.[0]);
  const direction = forcedDirection ?? (adjustment?.[3] === 'DOWN' ? 'DOWN' : 'UP');
  // 指定番号の既存矢印から、同番号の左右2本のうちドットに近い方を採用する。
  const segmentSources = Number.isInteger(selectedNumber) && selectedNumber >= 1 && selectedNumber <= 3
    ? DIRECTION_ARROW_SEGMENTS.filter((source) => source.number === selectedNumber)
    : DIRECTION_ARROW_SEGMENTS;
  const segment = segmentSources.map((source) => ({
    ...source,
    start: rotateAroundChartCenter(scaleAroundChartCenter(source.start, layerScale), rotation),
    end: rotateAroundChartCenter(scaleAroundChartCenter(source.end, layerScale), rotation)
  })).sort((first, second) => distanceToSegment(center, first.start, first.end) - distanceToSegment(center, second.start, second.end))[0];
  if (!segment) return null;

  // UP/DOWNの既存矢印と同じ向き・同じ傾きをそのまま使う。
  const pointsTowardEnd = direction === 'UP' ? segment.upAtEnd : !segment.upAtEnd;
  const vector = pointsTowardEnd
    ? { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y }
    : { x: segment.start.x - segment.end.x, y: segment.start.y - segment.end.y };
  const vectorLengthSquared = vector.x * vector.x + vector.y * vector.y;
  if (vectorLengthSquared < 0.001) return null;
  const towardCenterX = CHART_CENTER_X - center.x;
  const towardCenterY = CHART_CENTER_Y - center.y;
  // 両色とも中心へ向かう組を優先するため、方向を記録する。
  const centerProgress = (vector.x * towardCenterX + vector.y * towardCenterY) / vectorLengthSquared;
  // 線はドットを通り、チャート外周まで延長する。
  const fromChartCenter = { x: center.x - CHART_CENTER_X, y: center.y - CHART_CENTER_Y };
  const projection = fromChartCenter.x * vector.x + fromChartCenter.y * vector.y;
  const discriminant = projection * projection - vectorLengthSquared
    * (fromChartCenter.x * fromChartCenter.x + fromChartCenter.y * fromChartCenter.y - CHART_RADIUS * CHART_RADIUS);
  const startT = discriminant >= 0
    ? (-projection - Math.sqrt(discriminant)) / vectorLengthSquared
    : -280 / Math.sqrt(vectorLengthSquared);
  const endT = discriminant >= 0
    ? (-projection + Math.sqrt(discriminant)) / vectorLengthSquared
    : 280 / Math.sqrt(vectorLengthSquared);
  const lineStart = { x: center.x + startT * vector.x, y: center.y + startT * vector.y };
  // 円との交点が後方にある場合も、表示する矢印は調整方向へ延ばす。
  // 候補の距離評価に使う endT / maxTravel は変更しない。
  const displayEndT = endT > 1e-9 ? endT : 280 / Math.sqrt(vectorLengthSquared);
  const arrowTip = { x: center.x + endT * vector.x, y: center.y + endT * vector.y };
  const displayEnd = { x: center.x + displayEndT * vector.x, y: center.y + displayEndT * vector.y };
  const centerDistance = (centerProgress >= 0
    ? Math.abs(vector.x * towardCenterY - vector.y * towardCenterX) / Math.sqrt(vectorLengthSquared)
    : Math.hypot(towardCenterX, towardCenterY)) / CHART_RADIUS;
  return {
    centerDistance,
    arrowTarget: pointsTowardEnd ? segment.end : segment.start,
    pointsTowardCenter: centerProgress >= 0,
    base: center,
    unit: { x: vector.x / Math.sqrt(vectorLengthSquared), y: vector.y / Math.sqrt(vectorLengthSquared) },
    maxTravel: Math.max(0, endT * Math.sqrt(vectorLengthSquared)),
    direction,
    number: segment.number,
    start: lineStart,
    end: arrowTip,
    displayEnd
  };
}

function getGuideMovementUnit(line) {
  if (line.unit) return line.unit;
  const dx = line.end.x - line.base.x, dy = line.end.y - line.base.y;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
}

function getGuidePathDistance(line) {
  const unit = getGuideMovementUnit(line);
  const x = line.base.x - CHART_CENTER_X, y = line.base.y - CHART_CENTER_Y;
  const travel = Math.max(0, -(x * unit.x + y * unit.y));
  return Math.hypot(x + travel * unit.x, y + travel * unit.y) / CHART_RADIUS;
}

function getPredictionGuideLine(prediction) {
  return prediction.fallbackLine ?? { base: prediction.start, start: prediction.start, end: prediction.position };
}

function getLatestPitchDistanceRatio() {
  // 隣接する結果だけを比較し、最新の算出可能な移動距離比を使う。
  for (let index = dotSets.length - 2; index >= 0; index -= 1) {
    const before = dotSets[index];
    const after = dotSets[index + 1];
    if (!getSingleAdjustment(before, 'LINK')) continue;
    if (!learning.isConfirmed(dotSets, after.learningId, 'red') || !learning.isConfirmed(dotSets, after.learningId, 'blue')) continue;
    if (!before.red || !before.blue || !after.red || !after.blue) continue;
    const distances = ['red', 'blue'].map((color) => {
      const start = getDotCoordinates(before[color]);
      const end = getDotCoordinates(after[color]);
      return Math.hypot(end.x - start.x, end.y - start.y);
    });
    const scale = Math.max(...distances);
    if (!distances.every(Number.isFinite) || scale === 0) continue;
    // 大きい方を1に正規化し、片方が0でも同じ比率で評価する。
    return { red: distances[0] / scale, blue: distances[1] / scale };
  }
  return null;
}

function getGuideDistances(redLine, blueLine, distanceRatio) {
  const { red: redSpeed, blue: blueSpeed } = distanceRatio;
  const red = { x: redLine.base.x - CHART_CENTER_X, y: redLine.base.y - CHART_CENTER_Y };
  const blue = { x: blueLine.base.x - CHART_CENTER_X, y: blueLine.base.y - CHART_CENTER_Y };
  const redProjection = red.x * redLine.unit.x + red.y * redLine.unit.y;
  const blueProjection = blue.x * blueLine.unit.x + blue.y * blueLine.unit.y;
  const redSquared = red.x * red.x + red.y * red.y;
  const blueSquared = blue.x * blue.x + blue.y * blue.y;
  const limit = Math.min(
    redSpeed > 0 ? redLine.maxTravel / redSpeed : Infinity,
    blueSpeed > 0 ? blueLine.maxTravel / blueSpeed : Infinity
  );
  const thresholdSquared = (CENTER_DISTANCE_THRESHOLD * CHART_RADIUS) ** 2;
  const interval = (projection, squared, speed) => {
    if (speed === 0) return squared <= thresholdSquared ? [-Infinity, Infinity] : null;
    const perpendicularSquared = squared - projection * projection;
    if (perpendicularSquared > thresholdSquared) return null;
    const offset = Math.sqrt(Math.max(0, thresholdSquared - perpendicularSquared)) / speed;
    return [-projection / speed - offset, -projection / speed + offset];
  };
  const redInterval = interval(redProjection, redSquared, redSpeed);
  const blueInterval = interval(blueProjection, blueSquared, blueSpeed);
  const lower = Math.max(0, redInterval?.[0] ?? Infinity, blueInterval?.[0] ?? Infinity);
  const upper = Math.min(limit, redInterval?.[1] ?? -Infinity, blueInterval?.[1] ?? -Infinity);
  const withinCenterThreshold = lower <= upper;
  const distancesAt = (travel) => {
    const redTravel = redSpeed * travel;
    const redDistance = Math.sqrt(Math.max(0, redSquared + 2 * redProjection * redTravel + redTravel * redTravel)) / CHART_RADIUS;
    const blueTravel = blueSpeed * travel;
    const blueDistance = Math.sqrt(Math.max(0, blueSquared + 2 * blueProjection * blueTravel + blueTravel * blueTravel)) / CHART_RADIUS;
    return { redDistance, blueDistance, maxCenterDistance: Math.max(redDistance, blueDistance), distance: redDistance + blueDistance };
  };
  // 赤・青を実測比率で進め、両点のうち遠い方の中心距離を最小化する。
  let left = withinCenterThreshold ? lower : 0;
  let right = withinCenterThreshold ? upper : limit;
  for (let step = 0; step < 48; step += 1) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    if (distancesAt(first).maxCenterDistance > distancesAt(second).maxCenterDistance) left = first;
    else right = second;
  }
  const travel = (left + right) / 2;
  return { ...distancesAt(travel), withinCenterThreshold };
}

function appendDirectionArrowMarkers(target, blueColor = DOT_COLORS.blue) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  [['red', DOT_COLORS.red], ['blue', blueColor]].forEach(([name, color]) => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `${name}DirectionLineArrow`);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('orient', 'auto');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', color);
    marker.append(arrow);
    defs.append(marker);
  });
  target.append(defs);
}

function getLinkRankingCandidates(candidates, target = getAdjustmentStartSet(), amountText = getSharedAdjustmentAmount(0), samples = null) {
  // 探索量・円周交点ではなく、表示する量・方向と既存の距離推定で評価する。
  return candidates.filter(c => !c.amountText || c.amountText === amountText).map(original => {
    const action = BalanceLearning.adjustment([String(original.blade), 'LINK', amountText, original.direction]);
    const predictions = ['red', 'blue'].flatMap(color => {
      if (!target?.[color]) return [];
      const start = getDotCoordinates(target[color]);
      const p = original.predictions.find(item => item.color === color);
      const guide = original.line ? color === 'red' ? original.line : original.blue
        : p ? getPredictionGuideLine(p) : null;
      const prediction = learning.predict('LINK', color, action.blade, action.direction, action.amount, start);
      const estimate = BalanceDistancePrior.resolve(action, color, prediction,
        prediction ? [] : samples ?? learning.inspect().samples, CHART_RADIUS);
      const unit = guide ? getGuideMovementUnit(guide) : null;
      const valid = estimate && Number.isFinite(estimate.distance) && estimate.distance >= 0
        && unit && Math.hypot(unit.x, unit.y) > 0;
      const position = valid ? { x: start.x + unit.x * estimate.distance, y: start.y + unit.y * estimate.distance } : null;
      const currentDistance = Math.hypot(start.x - CHART_CENTER_X, start.y - CHART_CENTER_Y) / CHART_RADIUS;
      const predictedDistance = position ? Math.hypot(position.x - CHART_CENTER_X, position.y - CHART_CENTER_Y) / CHART_RADIUS : null;
      // 前向きガイドの中心接近。移動量・予測終点・学習値とは独立した順位情報。
      const unitLength = unit ? Math.hypot(unit.x, unit.y) : 0;
      const inwardProjection = currentDistance > 0 && Number.isFinite(unitLength) && unitLength > 0
        ? -(((start.x - CHART_CENTER_X) / CHART_RADIUS) * (unit.x / unitLength)
          + ((start.y - CHART_CENTER_Y) / CHART_RADIUS) * (unit.y / unitLength)) : null;
      return [{ color, start, position, currentDistance, predictedDistance,
        inwardProjection, geometry: BalanceLinkRanking.geometry({x:(start.x-CHART_CENTER_X)/CHART_RADIUS,
          y:(start.y-CHART_CENTER_Y)/CHART_RADIUS},unit),
        improvement: position ? currentDistance - predictedDistance : null,
        source: valid ? estimate.source : 'missing', uncertain: !valid || estimate.source !== 'learned' }];
    });
    return { ...original, original, amount: action.amount, amountText, predictions };
  });
}

function selectLinkGuideCandidate(candidates, automatic = pitchAutoMode) {
  if (automatic) {
    const normalized = getLinkRankingCandidates(candidates), target = getAdjustmentStartSet();
    const selected = BalanceLinkRanking.select(normalized, target?.red?.radius, target?.blue?.radius);
    // 方向・予測とも評価不能ならNo順の診断表示。達成を示す予測は作らない。
    return (selected ?? normalized.sort((a, b) => a.blade - b.blade
      || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN'))[0])?.original;
  }
  const epsilon = 1e-9;
  // 予測HOVを0.15以内に保てる候補があれば、その制約を後段で覆さない。
  const hovSafe = candidates.filter(candidate => candidate.predictions[0].predictedDistance <= CENTER_DISTANCE_THRESHOLD + epsilon);
  let pool = hovSafe.length ? hovSafe : candidates;
  const paired = pool.filter(candidate => candidate.predictions.length === 2);
  const passing = paired.filter(candidate => candidate.hovPathDistance <= CENTER_DISTANCE_THRESHOLD + epsilon
    && candidate.cruisePathDistance <= CENTER_DISTANCE_THRESHOLD + epsilon);
  if (passing.length) pool = passing;
  const bothSafe = pool.filter(candidate => candidate.predictions.length === 2
    && candidate.predictions.every(prediction => prediction.predictedDistance <= CENTER_DISTANCE_THRESHOLD + epsilon));
  if (bothSafe.length) pool = bothSafe;
  const nearest = field => {
    const minimum = Math.min(...pool.map(candidate => candidate[field]));
    pool = pool.filter(candidate => candidate[field] <= minimum + epsilon);
  };
  // HOVを制約内にできない場合だけ、既存の有向線最接近評価へ戻る。
  if (!hovSafe.length && !passing.length) nearest('hovPathDistance');
  nearest('maxCenterDistance');
  nearest('distance');
  return pool.sort((first, second) => first.blade - second.blade
    || Number(first.direction === 'DOWN') - Number(second.direction === 'DOWN')
    || first.amount - second.amount)[0];
}

function selectRankedLinkGuideCandidate(candidates, rank = guideCandidateIndex) {
  let pool = [...candidates];
  let selected;
  for (let index = 0; index <= rank && pool.length; index += 1) {
    selected = selectLinkGuideCandidate(pool);
    if (index < rank) pool = pool.filter(candidate => candidate !== selected);
  }
  return selected;
}

// 表示候補だけをNoごとにまとめる。評価式・予測値は既存のものをそのまま使う。
function selectGuideNumberCandidate(candidates, selectBest) {
  if (currentChartPage === 1) tabIntersectionCandidates = candidates;
  let pool = [...candidates];
  const choices = [];
  if (pitchAutoMode && currentChartPage === 0 && selectBest === selectLinkGuideCandidate) {
    const target = getAdjustmentStartSet();
    const result = BalanceLinkRanking.rank(getLinkRankingCandidates(candidates),target?.red?.radius,target?.blue?.radius);
    choices.push(...result.ranked.map(candidate => ({blade:candidate.blade,candidate:candidate.original})));
    if (choices.length) pool = [];
  }
  while (pool.length) {
    const candidate = selectBest(pool);
    if (!candidate) break;
    choices.push({ blade: candidate.blade, candidate });
    pool = pool.filter(other => other.blade !== candidate.blade);
  }
  // 学習済みの改善候補がないNoも切替先に残し、予測を捏造しない。
  for (const blade of [1, 2, 3]) {
    if (!choices.some(choice => choice.blade === blade)) choices.push({ blade, candidate: null });
  }
  guideNumberChoices = candidates.length ? choices : [];
  const retained = getRetainedGuideNumber();
  const retainedIndex = retained ? guideNumberChoices.findIndex(choice => choice.blade === retained.blade) : -1;
  if (retainedIndex >= 0) {
    guideCandidateIndex = retainedIndex;
    guideCandidateIndices[currentChartPage] = retainedIndex;
    if (!restoringAppState) saveAdjustmentSelection();
  }
  updateGuideCandidateToggle();
  return choices[guideCandidateIndex]?.candidate;
}

function guideApproachesCenter(line) {
  const unit = getGuideMovementUnit(line);
  const x = CHART_CENTER_X - line.base.x, y = CHART_CENTER_Y - line.base.y;
  return Math.hypot(x, y) <= 1e-9 || x * unit.x + y * unit.y > 1e-9;
}

function getLearnedGuideLines(finalSet) {
  const type = currentChartPage === 0 ? 'LINK' : 'TAB';
  const automatic = currentChartPage === 0 ? pitchAutoMode : trimAutoMode;
  guidePredictionDebug = { type, fallback: true, reason: automatic ? 'insufficient-samples' : 'manual-mode' };
  if (!automatic || !finalSet) return null;
  // HOV予測を基準に候補を生成し、LINKは対応する巡航予測も評価する。
  const colors = type === 'TAB' ? (finalSet.blue ? ['blue'] : finalSet.red ? ['red'] : [])
    : finalSet.red ? ['red'] : [];
  if (!colors.length || colors.some(color => getLearnedRotation(type, color) === null)) return null;
  const candidates = [];
  for (const blade of [1, 2, 3]) {
    for (const direction of ['UP', 'DOWN']) {
      for (const amountText of BalanceLearning.amounts[type]) {
        const { amount } = BalanceLearning.adjustment([String(blade), type, amountText, direction]);
        const predictions = colors.map(color => {
          const start = getDotCoordinates(finalSet[color]);
          const prediction = learning.predict(type, color, blade, direction, amount, start);
          if (!prediction) return null;
          const currentDistance = Math.hypot(start.x - CHART_CENTER_X, start.y - CHART_CENTER_Y) / CHART_RADIUS;
          const predictedDistance = Math.hypot(prediction.position.x - CHART_CENTER_X, prediction.position.y - CHART_CENTER_Y) / CHART_RADIUS;
          return { color, start, ...prediction, currentDistance, predictedDistance, improvement: currentDistance - predictedDistance };
        });
        if (predictions.some(prediction => !prediction)) continue;
        if (type === 'LINK' && finalSet.blue) {
          const start = getDotCoordinates(finalSet.blue);
          const prediction = learning.predict(type, 'blue', blade, direction, amount, start);
          const fallbackLine = prediction ? null : getDirectionLine(finalSet.blue, 'blue', null, blade, direction);
          if (prediction || fallbackLine) {
            const position = prediction?.position ?? fallbackLine.end;
            const currentDistance = Math.hypot(start.x - CHART_CENTER_X, start.y - CHART_CENTER_Y) / CHART_RADIUS;
            const predictedDistance = Math.hypot(position.x - CHART_CENTER_X, position.y - CHART_CENTER_Y) / CHART_RADIUS;
            predictions.push({ color: 'blue', start, ...prediction, position, fallbackLine,
              currentDistance, predictedDistance, improvement: currentDistance - predictedDistance });
          }
        }
        const improvement = predictions.reduce((sum, prediction) => sum + prediction.improvement, 0);
        // LINKは悪化側も含めて順位付けする。TABは従来どおり。
        const eligible = type === 'LINK'
          || (predictions.every(prediction => prediction.improvement >= -1e-6) && improvement > 1e-6);
        candidates.push({ type, blade, direction, amount, amountText, predictions, improvement, eligible,
          withinCenterThreshold: predictions.every(prediction => prediction.predictedDistance <= CENTER_DISTANCE_THRESHOLD),
          maxCenterDistance: Math.max(...predictions.map(prediction => prediction.predictedDistance)),
          distance: predictions.reduce((sum, prediction) => sum + prediction.predictedDistance, 0) });
      }
    }
  }
  let selected;
  if (type === 'LINK') {
    const epsilon = 1e-9; // IPS単位の幾何判定誤差。
    for (const candidate of candidates) {
      candidate.towardCenter = candidate.predictions.every(prediction => guideApproachesCenter(getPredictionGuideLine(prediction)));
      const hov = candidate.predictions[0];
      const hovLine = getPredictionGuideLine(hov);
      const unit = getGuideMovementUnit(hovLine);
      candidate.hovDirectionVector = { dx: unit.x, dy: unit.y };
      const pathDistance = getGuidePathDistance(hovLine);
      candidate.hovPathDistance = pathDistance <= epsilon ? 0 : pathDistance;
      candidate.hovPathPasses = candidate.hovPathDistance <= CENTER_DISTANCE_THRESHOLD + epsilon;
      const cruise = candidate.predictions[1];
      if (cruise) {
        candidate.cruisePathDistance = getGuidePathDistance(getPredictionGuideLine(cruise));
      }
    }
    selected = selectGuideNumberCandidate(candidates, selectLinkGuideCandidate);
  } else {
    const ranked = candidates.filter(candidate => candidate.eligible).sort((first, second) =>
      Number(second.withinCenterThreshold) - Number(first.withinCenterThreshold)
      || first.maxCenterDistance - second.maxCenterDistance || first.distance - second.distance);
    selected = selectGuideNumberCandidate(candidates, pool => ranked.find(candidate => pool.includes(candidate)));
  }
  guidePredictionDebug = { type, fallback: false, reason: selected ? 'measured-vectors' : 'no-improving-candidate', selected, candidates };
  return selected ? selected.predictions.map(prediction => ({
    blade: selected.blade, direction: selected.direction,
    amountText: selected.amountText,
    line: getPredictionGuideLine(prediction),
    color: DOT_COLORS[prediction.color],
    marker: `${prediction.color}DirectionLineArrow`
  })) : [];
}

const guideDisplayGeometry = new WeakMap();

// 描画専用。候補評価・予測計算の線は変更しない。
function getGuideViewportEnd(line, bounds) {
  const original = line.displayEnd ?? line.end;
  const unit = getGuideMovementUnit(line);
  const x = line.base.x - CHART_CENTER_X, y = line.base.y - CHART_CENTER_Y;
  const projection = x * unit.x + y * unit.y;
  const discriminant = projection * projection - (x * x + y * y - CHART_RADIUS * CHART_RADIUS);
  if (discriminant >= -1e-8 && -projection + Math.sqrt(Math.max(0, discriminant)) >= 0) return original;
  let enter = 0, exit = Infinity;
  for (const [position, direction, minimum, maximum] of [
    [line.base.x, unit.x, bounds.left, bounds.right],
    [line.base.y, unit.y, bounds.top, bounds.bottom]
  ]) {
    if (Math.abs(direction) < 1e-12) {
      if (position < minimum || position > maximum) return original;
      continue;
    }
    const first = (minimum - position) / direction, second = (maximum - position) / direction;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
  }
  if (!Number.isFinite(exit) || exit <= enter) return original;
  return { x: line.base.x + unit.x * exit, y: line.base.y + unit.y * exit };
}

function updateGuideViewportEnds() {
  const matrix = dotOverlay.getScreenCTM();
  if (!matrix) return;
  const rect = dotOverlay.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = Math.max(rect.left, viewport?.offsetLeft ?? 0) + 12;
  const top = Math.max(rect.top, viewport?.offsetTop ?? 0) + 12;
  const right = Math.min(rect.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth)) - 12;
  const bottom = Math.min(rect.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight)) - 12;
  if (right <= left || bottom <= top) return;
  const inverse = matrix.inverse();
  const first = new DOMPoint(left, top).matrixTransform(inverse);
  const last = new DOMPoint(right, bottom).matrixTransform(inverse);
  const bounds = { left: first.x, top: first.y, right: last.x, bottom: last.y };
  dotOverlay.querySelectorAll('.guide-direction-line').forEach(node => {
    const line = guideDisplayGeometry.get(node);
    if (!line) return;
    const end = getGuideViewportEnd(line, bounds);
    node.setAttribute('x2', String(end.x));
    node.setAttribute('y2', String(end.y));
  });
}

new MutationObserver(updateGuideViewportEnds).observe(dotOverlay, { attributes: true, attributeFilter: ['viewBox'] });
window.addEventListener('resize', updateGuideViewportEnds);
window.addEventListener('scroll', updateGuideViewportEnds, { passive: true });
window.visualViewport?.addEventListener('resize', updateGuideViewportEnds);
window.visualViewport?.addEventListener('scroll', updateGuideViewportEnds);

function renderDirectionLines(preserveSelection = false) {
  renderingDirectionLines = true;
  try { drawDirectionLines(preserveSelection); }
  finally { renderingDirectionLines = false; evaluatedLinkAmount = getSharedAdjustmentAmount(0); }
  if (adjustmentLock?.editedGuides) {
    renderEditedConfirmedGuides(adjustmentLock);
    adjustmentForecast = structuredClone(adjustmentLock.forecast);
    renderAdjustmentForecast();
  }
  // 別チャート閲覧中の削除で破棄した固定予測は、追加側へ戻った時に生成し直す。
  if (adjustmentLock && !adjustmentForecast) refreshAdjustmentForecastAfterDeletion();
  updateTabIntersectionHighlight();
}

function drawDirectionLines(preserveSelection = false) {
  tabIntersectionCandidates = [];
  forecastGuides = {};
  guideNumberChoices = [];
  let guideLayer = dotOverlay.querySelector('.direction-lines');
  if (!guideLayer) {
    guideLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    guideLayer.setAttribute('class', 'direction-lines');
    dotOverlay.prepend(guideLayer);
  }
  guideLayer.replaceChildren();
  // 固定入力との不一致で隠した追加側ガイドの状態を、閲覧先へ持ち越さない。
  if (adjustmentLock && adjustmentLock.page !== currentChartPage) guideLayer.style.opacity = '';
  const redDots = [];
  const blueDots = [];
  // 基準線の候補は、現在の最終結果番号にある赤・青ドットだけに限定する。
  const finalIndex = dotSets.length - 1;
  const finalSet = getAdjustmentStartSet(dotSets[finalIndex]);
  if (finalSet) {
    // 結果に複数の調整量がある場合は、最後に追加した番号・方向を対応情報として使う。
    // 旧データの memo も読み取り、調整量が未登録なら同じ結果番号内で対応させる。
    const adjustment = finalSet.adjustments?.at(-1) ?? (Array.isArray(finalSet.memo) ? finalSet.memo : null);
    const getLines = (dot, layer) => [1, 2, 3].flatMap((number) => ['UP', 'DOWN']
      .map((direction) => getDirectionLine(dot, layer, adjustment, number, direction)))
      .filter(Boolean);
    if (finalSet.red) {
      getLines(finalSet.red, 'red').forEach((line) => redDots.push({ index: finalIndex, line }));
    }
    if (finalSet.blue) {
      getLines(finalSet.blue, 'blue').forEach((line) => blueDots.push({ index: finalIndex, line }));
    }
  }
  let selectedLines = getLearnedGuideLines(finalSet);
  if (selectedLines !== null) {
    // 学習済み候補が全て悪化する場合は、旧候補で上書きしない。
    if (!selectedLines.length && selectingGuideNumber && !restoringAppState) {
      memoValues.splice(0, 4, String(guideNumberChoices[guideCandidateIndex].blade), currentChartPage === 0 ? 'LINK' : 'TAB', '', '');
      updateMemoButtons();
    }
  } else if (currentChartPage === 1) {
    // トリムタブは巡航線だけを、矢印方向で到達できる中心距離で選ぶ。
    const sourceColor = blueDots.length ? 'blue' : 'red';
    const ranked = (blueDots.length ? blueDots : redDots).sort((first, second) =>
      Number(second.line.centerDistance <= CENTER_DISTANCE_THRESHOLD) - Number(first.line.centerDistance <= CENTER_DISTANCE_THRESHOLD)
      || first.line.centerDistance - second.line.centerDistance);
    const candidates = ranked.map(entry => ({ ...entry, blade: entry.line.number }));
    const selected = selectGuideNumberCandidate(candidates, pool => pool[0]);
    if (!selected) {
      if (adjustmentForecast?.phase === 'preview') updateAdjustmentForecast(adjustmentForecast.values);
      else renderAdjustmentForecast();
      return;
    }
    selectedLines = [{ line: selected.line, color: DOT_COLORS[sourceColor], marker: `${sourceColor}DirectionLineArrow` }];
  } else if (redDots.length) {
    // 学習不足時も表示量の推定終点を評価する。手動の有向線評価は維持する。
    const centerDistance = getGuidePathDistance;
    const ratio = getLatestPitchDistanceRatio() ?? { red: 1, blue: 2 };
    const candidates = redDots.map(({ line }) => {
      const blue = blueDots.find(candidate => candidate.line.number === line.number
        && candidate.line.direction === line.direction)?.line;
      const hovPathDistance = centerDistance(line);
      const distances = blue ? getGuideDistances(line, blue, ratio)
        : { redDistance: hovPathDistance, maxCenterDistance: hovPathDistance, distance: hovPathDistance };
      const predictions = [line, blue].filter(Boolean).map((guide, index) => {
        const currentDistance = Math.hypot(guide.base.x - CHART_CENTER_X, guide.base.y - CHART_CENTER_Y) / CHART_RADIUS;
        const predictedDistance = index === 0 ? distances.redDistance : distances.blueDistance;
        return { currentDistance, predictedDistance, improvement: currentDistance - predictedDistance };
      });
      return { line, blue, blade: line.number, direction: line.direction, amount: 0, predictions,
        towardCenter: [line, blue].filter(Boolean).every(guideApproachesCenter),
        hovPathDistance, cruisePathDistance: blue ? centerDistance(blue) : undefined,
        maxCenterDistance: distances.maxCenterDistance, distance: distances.distance };
    });
    const selected = selectGuideNumberCandidate(candidates, selectLinkGuideCandidate);
    if (!selected) { renderAdjustmentForecast(); return; }
    selectedLines = [{ line: selected.line, color: DOT_COLORS.red, marker: 'redDirectionLineArrow' }];
    if (selected.blue) selectedLines.push({ line: selected.blue, color: DOT_COLORS.blue, marker: 'blueDirectionLineArrow' });
  } else {
    updateGuideCandidateToggle();
    if (currentChartPage === 0 && finalSet?.blue && !finalSet.red) {
      const values = adjustmentLock?.values ?? adjustmentForecast?.values ?? memoValues;
      syncManualDirectionGuides(values, true);
      updateGuideSelectionVisibility(values);
    }
    if (adjustmentForecast?.phase === 'preview') updateAdjustmentForecast(adjustmentForecast.values);
    else renderAdjustmentForecast();
    return;
  }

  // TABの順位は巡航のまま、同じNo.・方向のHOVガイドを予測描画にも渡す。
  if (currentChartPage === 1 && finalSet?.red) {
    const cruise = selectedLines.find(entry => entry.marker === 'blueDirectionLineArrow');
    if (cruise) {
      const blade = cruise.blade ?? cruise.line.number;
      const direction = cruise.direction ?? cruise.line.direction;
      const line = getDirectionLine(finalSet.red, 'red', null, blade, direction);
      if (line) selectedLines.push({ line, color: DOT_COLORS.red, marker: 'redDirectionLineArrow', selectionExcluded: true });
    }
  }
  appendDirectionArrowMarkers(guideLayer, DOT_COLORS.blue);
  selectedLines.forEach(({ line, color, marker, blade = line.number, direction = line.direction, amountText, selectionExcluded = false }) => {
    // 引き継いだ起点でも通常と同じ円周間表示。計算の基準位置はline.baseのまま保持する。
    // 範囲外の点は従来どおりドットを始点とする。
    const start = Math.hypot(line.base.x - CHART_CENTER_X, line.base.y - CHART_CENTER_Y) > CHART_RADIUS
      ? line.base : line.start;
    const end = line.displayEnd ?? line.end;
    const directionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    directionLine.setAttribute('class', 'guide-direction-line');
    if (selectionExcluded) directionLine.dataset.selectionExcluded = 'true';
    directionLine.setAttribute('x1', String(start.x));
    directionLine.setAttribute('y1', String(start.y));
    directionLine.setAttribute('x2', String(end.x));
    directionLine.setAttribute('y2', String(end.y));
    directionLine.setAttribute('stroke', color);
    directionLine.setAttribute('stroke-width', '1.8');
    directionLine.setAttribute('stroke-dasharray', '9 7');
    directionLine.setAttribute('stroke-linecap', 'round');
    directionLine.setAttribute('opacity', '0.9');
    directionLine.setAttribute('marker-end', `url(#${marker})`);
    directionLine.style.pointerEvents = 'none';
    guideLayer.append(directionLine);
    guideDisplayGeometry.set(directionLine, line);
    const unit = getGuideMovementUnit(line);
    const length = Math.hypot(unit.x, unit.y);
    if (Number.isFinite(length) && length > 0) {
      forecastGuides[marker === 'redDirectionLineArrow' ? 'red' : 'blue'] = {
        targetId: finalSet.learningId, type: currentChartPage === 0 ? 'LINK' : 'TAB',
        blade, direction, amountText,
        unit
      };
    }
  });
  updateGuideViewportEnds();
  if (adjustmentLock ? adjustmentLock.page === currentChartPage
    : preserveSelection || (adjustmentForecast?.manualDirection
      && adjustmentForecast.type === (currentChartPage === 0 ? 'LINK' : 'TAB') && !selectingGuideNumber)) updateGuideSelectionVisibility(memoValues);
  else applySelectedGuideAdjustment(true);
  if (adjustmentForecast?.phase === 'preview') updateAdjustmentForecast(adjustmentForecast.values);
  else renderAdjustmentForecast();
}

const deleteConfirmation = document.getElementById('deleteConfirmation');
const deleteConfirmationTitle = document.getElementById('deleteConfirmationTitle');
let pendingDeletion = null;

function confirmDeletion(message, action) {
  if (deleteConfirmation.open) return;
  pendingDeletion = action;
  deleteConfirmationTitle.textContent = message;
  deleteConfirmation.returnValue = '';
  deleteConfirmation.showModal();
}

deleteConfirmation.addEventListener('close', () => {
  const action = pendingDeletion;
  pendingDeletion = null;
  if (deleteConfirmation.returnValue === 'delete') action?.();
});

document.getElementById('resetLearning').addEventListener('click', () => {
  confirmDeletion('自動補正の学習値だけを初期化しますか？測定結果・確定調整・設定は残ります。', () => {
    clearConfirmedEditLearningValues();
    learning.reset(dotSets);
    manualLearningReference.LINK = {};
    manualLearningReference.TAB = {};
    renderDots();
  });
});

const adjustmentTarget = document.getElementById('adjustmentTarget');
let selectedAdjustmentTarget = null;

function updateAdjustmentTarget() {
  if (!dotSets.includes(selectedAdjustmentTarget)) selectedAdjustmentTarget = null;
  const target = adjustmentLock ? dotSets.find(set => set.learningId === adjustmentLock.targetId)
    : selectedAdjustmentTarget ?? dotSets.at(-1);
  adjustmentTarget.replaceChildren();
  adjustmentTarget.disabled = Boolean(adjustmentLock || Object.keys(adjustmentSequence?.active ?? {}).length) || !dotSets.length;
  if (!dotSets.length) {
    const option = document.createElement('option');
    option.textContent = '結果なし';
    adjustmentTarget.append(option);
    return;
  }
  dotSets.forEach((set, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `結果${index + 1}の後に追加`;
    option.selected = set === target;
    adjustmentTarget.append(option);
  });
}

adjustmentTarget.addEventListener('change', () => {
  if (adjustmentLock || Object.keys(adjustmentSequence?.active ?? {}).length) { updateAdjustmentTarget(); return; }
  selectedAdjustmentTarget = dotSets[Number(adjustmentTarget.value)] ?? null;
  updateAdjustmentForecast();
});

const editConfirmation = document.getElementById('editConfirmation');
let pendingEdit = null;
const cancelResultEdit = document.getElementById('cancelResultEdit');
const cancelAdjustmentEdit = document.getElementById('cancelAdjustmentEdit');
const resultEditMessage = document.getElementById('resultEditMessage');
const adjustmentEditMessage = document.getElementById('adjustmentEditMessage');
const addAdjustmentButton = document.getElementById('addAdjustmentButton');

function restoreInputs(inputs, values) {
  inputs.forEach((input, index) => {
    input.value = values[index];
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function cancelEditing() {
  if (adjustmentForecast?.phase === 'preview') { adjustmentForecast = null; renderAdjustmentForecast(); }
  if (resultEdit) restoreInputs([...redInputs, ...blueInputs], resultEdit.draft);
  if (adjustmentEdit) {
    memoValues.splice(0, 4, ...adjustmentEdit.draft);
    selectedAdjustmentTarget = adjustmentEdit.draftTarget;
    updateMemoButtons();
  }
  resultEdit = null;
  adjustmentEdit = null;
  dotMessage.textContent = '';
  adjustmentMessage.textContent = '';
  updateEditingUI();
  updateAdjustmentTarget();
  updateCruiseAdditionUI();
  addDotButton.disabled = getDotCount() >= MAX_DOTS;
}

function updateEditingUI() {
  cancelResultEdit.hidden = !resultEdit;
  cancelAdjustmentEdit.hidden = !adjustmentEdit;
  resultEditMessage.hidden = !resultEdit;
  adjustmentEditMessage.hidden = !adjustmentEdit;
  resultEditMessage.textContent = resultEdit ? `結果${dotSets.indexOf(resultEdit.set) + 1}を編集中` : '';
  adjustmentEditMessage.textContent = adjustmentEdit ? `結果${dotSets.indexOf(adjustmentEdit.set) + 1}の調整量を編集中` : '';
  addAdjustmentButton.textContent = adjustmentEdit ? '調整量を更新' : '調整量を追加';
  addAdjustmentButton.disabled = Boolean(adjustmentLock);
  rotationLock.disabled = adjustmentLock?.page === currentChartPage;
}

function releaseAdjustmentLock() {
  if (!adjustmentLock && !adjustmentSequence) return;
  if (adjustmentSequence?.flow) {
    adjustmentSequence.active = {};
    adjustmentSequence.draft = null;
    adjustmentSequence.currentTargetId = dotSets.at(-1)?.learningId ?? adjustmentSequence.targetId;
  } else adjustmentSequence = null;
  adjustmentLock = null;
  resetSharedAdjustmentAmounts();
  restoreAdjustmentSelection();
  adjustmentMessage.textContent = '';
  updateEditingUI();
  updatePitchModeUI();
  updateTrimModeUI();
}

function startResultEdit(set) {
  if (!dotSets.includes(set)) return;
  cancelEditing();
  if (cruiseAdditionTarget) finishCruiseAddition();
  resultEdit = { set, draft: [...redInputs, ...blueInputs].map(input => input.value) };
  [set.red, set.blue].forEach((dot, index) => {
    const values = dot ? [...dot.clock.split(':'), dot.radius.toFixed(2)] : ['', '', ''];
    if (dot) {
      values[0] = String(Number(values[0]) || 12);
      values[1] = String(Number(values[1]));
    }
    restoreInputs(index === 0 ? redInputs : blueInputs, values);
  });
  updateEditingUI();
  updateCruiseAdditionUI();
  addDotButton.disabled = false;
  dotForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function startAdjustmentEdit(set, adjustment) {
  if (adjustmentLock || isConfirmedAdjustment(set, adjustment) || !isLatestRecordedAdjustment(set, adjustment)) return;
  if (!dotSets.includes(set) || !set.adjustments?.includes(adjustment)) return;
  cancelEditing();
  if (cruiseAdditionTarget) finishCruiseAddition();
  adjustmentEdit = { set, adjustment, draft: [...memoValues], draftTarget: selectedAdjustmentTarget };
  memoValues.splice(0, 4, ...Array.from({ length: 4 }, (_, index) => adjustment[index] || ''));
  selectedAdjustmentTarget = set;
  updateMemoButtons();
  updateAdjustmentForecast();
  updateAdjustmentTarget();
  updateEditingUI();
  adjustmentForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function isConfirmedAdjustment(set, adjustment) {
  const index = set?.adjustments?.indexOf(adjustment) ?? -1;
  return adjustmentSequence?.stages.some(stage => stage.targetId === set?.learningId && stage.actionIndex === index) ?? false;
}

function attachEditAction(row, message, action) {
  row.tabIndex = 0;
  row.setAttribute('aria-label', message);
  const request = () => {
    if (editConfirmation.open) return;
    pendingEdit = action;
    document.getElementById('editConfirmationTitle').textContent = message;
    editConfirmation.returnValue = '';
    editConfirmation.showModal();
  };
  row.addEventListener('click', event => {
    if (!event.target.closest('button, select, input')) request();
  });
  row.addEventListener('keydown', event => {
    if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      request();
    }
  });
}

editConfirmation.addEventListener('close', () => {
  const action = pendingEdit;
  pendingEdit = null;
  if (editConfirmation.returnValue === 'edit') action?.();
});
cancelResultEdit.addEventListener('click', cancelEditing);
cancelAdjustmentEdit.addEventListener('click', cancelEditing);

function renderHistoricalLearning() {
  const container = document.getElementById('historicalLearningCandidates');
  container.replaceChildren();
  const candidates = learning.historicalCandidates(dotSets);
  if (!candidates.length) {
    container.textContent = '確認待ちの対象履歴はありません。';
    return;
  }
  candidates.forEach(candidate => {
    const before = dotSets[candidate.index], after = dotSets[candidate.index + 1];
    const { type, blade, direction } = candidate.action;
    const target = type === 'TAB' ? 'TAB青（巡航）' : candidate.color === 'red' ? 'LINK赤（HOV）' : 'LINK青（巡航）';
    const measurement = dot => `${dot.clock} ／ ${dot.radius.toFixed(2)} IPS`;
    const row = document.createElement('div');
    row.className = 'historical-learning-row';
    const description = document.createElement('span');
    description.textContent = `${target} ／ BLD${blade} ／ ${direction} ／ ${formatMemoValue(before.adjustments[0][2], 2, type)}\n`
      + `調整前（結果${candidate.index + 1}）：${measurement(before[candidate.color])}\n`
      + `調整後（結果${candidate.index + 2}）：${measurement(after[candidate.color])}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '実調整として学習';
    button.setAttribute('aria-label', `${target} 結果${candidate.index + 1}→${candidate.index + 2}を実調整として学習`);
    button.addEventListener('click', () => {
      const accepted = learning.confirmHistorical(dotSets, candidate);
      if (accepted) clearConfirmedEditLearningValues(before.learningId);
      renderDots();
      document.getElementById('historicalLearningMessage').textContent = accepted
        ? learning.inspect().storageError ?? `${target}の実調整を学習に追加しました。`
        : '履歴が変更されています。内容を確認し直してください。';
    });
    row.append(description, button);
    container.append(row);
  });
}

function renderDots() {
  if (confirmedCarry) {
    const source = dotSets.find(set => set.learningId === confirmedCarry.targetId);
    if (!source || JSON.stringify(source.adjustments?.[confirmedCarry.actionIndex]) !== JSON.stringify(confirmedCarry.values)) confirmedCarry = null;
  }
  if (adjustmentSequence) {
    const active = Object.fromEntries(Object.entries(adjustmentSequence.active ?? {}).map(([page,index])=>[page,adjustmentSequence.stages[index]]));
    adjustmentSequence.stages = adjustmentSequence.stages.filter(stage =>
      JSON.stringify(dotSets.find(set => set.learningId === stage.targetId)?.adjustments?.[stage.actionIndex]) === JSON.stringify(stage.values));
    if (!adjustmentSequence.stages.length) { adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;updateMemoButtons(); }
    else {
      adjustmentSequence.targetId = adjustmentSequence.stages[0].targetId;
      adjustmentSequence.active = Object.fromEntries(Object.entries(active).map(([page,stage])=>[page,adjustmentSequence.stages.indexOf(stage)]).filter(([,index])=>index>=0));
      adjustmentLock = getSequenceStage();
      restoreConfirmedCarry();
    }
  }
  if (!dotSets.length) updateMemoButtons();
  if (!appStorage.readOnly) learning.sync(getConfirmedEditLearningSets(), {
    LINK: {
      red: pitchAutoMode && pitchAutoReady.red ? autoPitchAngles.hovAngle : manualPitchAngles.hovAngle,
      blue: pitchAutoMode && pitchAutoReady.blue ? autoPitchAngles.cruiseAngle : manualPitchAngles.cruiseAngle
    },
    TAB: { red: pageRotations[1].hovAngle, blue: trimAutoMode ? autoTrimCruiseAngle : manualTrimCruiseAngle }
  });
  syncAutoPitchRotation();
  syncAutoTrimRotation();
  renderHistoricalLearning();
  if ((resultEdit && !dotSets.includes(resultEdit.set)) ||
      (adjustmentEdit && (!dotSets.includes(adjustmentEdit.set) || !adjustmentEdit.set.adjustments?.includes(adjustmentEdit.adjustment)))) cancelEditing();
  updateEditingUI();
  updateAdjustmentTarget();
  updateCruiseAdditionUI();
  updateSequenceMessage();
  dotList.replaceChildren(...dotSets.map((set, index) => {
    const item = document.createElement('li');
    const hovWithin = Boolean(set.red && set.red.radius <= 0.2);
    const bothWithin = Boolean(hovWithin && set.blue && set.blue.radius <= 0.2);
    if (bothWithin) item.classList.add('result-within-limit');
    else if (hovWithin) item.classList.add('result-hov-within-limit');
    const label = document.createElement('span');
    label.textContent = `結果 ${index + 1}: `;
    [set.red, set.blue].filter(Boolean).forEach((dot, dotIndex) => {
      if (dotIndex) label.append(' ／ ');
      const dotLabel = document.createElement('span');
      dotLabel.className = `dot-label-${dot.color}`;
      const clock = document.createElement('span');
      clock.className = 'dot-clock-angle';
      clock.textContent = dot.clock;
      dotLabel.append(`${dot.color === 'red' ? 'HOV' : '巡航'} ${dot.radius.toFixed(2)} `, clock);
      label.append(dotLabel);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `セット${index + 1}を削除`);
    remove.addEventListener('click', () => confirmDeletion(`結果${index + 1}を削除しますか？`, () => {
      dotSets.splice(index, 1);
      invalidateAdjustmentForecast();
      if (confirmedCarry?.targetId === set.learningId || adjustmentLock?.targetId === set.learningId) releaseAdjustmentLock();
      saveDotSets();
      renderDots();
      refreshAdjustmentForecastAfterDeletion();
      globalThis.balanceFlushState?.();
    }));
    const resultRow = document.createElement('div');
    resultRow.className = 'dot-result-row';
    attachEditAction(resultRow, `結果${index + 1}を編集しますか？`, () => startResultEdit(set));
    resultRow.append(label, remove);
    if (set.red && !set.blue) {
      const addCruise = document.createElement('button');
      addCruise.type = 'button';
      addCruise.className = 'add-cruise-button';
      addCruise.textContent = '巡航を追加';
      addCruise.setAttribute('aria-label', `結果${index + 1}に巡航を追加`);
      addCruise.disabled = getDotCount() >= MAX_DOTS;
      addCruise.addEventListener('click', () => startCruiseAddition(set));
      resultRow.append(addCruise);
    }
    item.append(resultRow);
    set.adjustments?.forEach((adjustment, adjustmentIndex) => {
      const adjustmentRow = document.createElement('div');
      adjustmentRow.className = 'dot-adjustment-row';
      const adjustmentLabel = document.createElement('span');
      adjustmentLabel.className = 'dot-memo';
      adjustmentLabel.textContent = `調整量: ${adjustment.map((value, fieldIndex) => formatMemoValue(value, fieldIndex, adjustment[1])).join(' ／ ')}${learning.isArmed(set) ? '（実調整）' : ''}`;
      const stageIndex = adjustmentSequence?.stages.findIndex(stage =>
        stage.targetId === set.learningId && stage.actionIndex === adjustmentIndex) ?? -1;
      if (stageIndex >= 0) {
        adjustmentRow.classList.add('confirmed-adjustment-row');
        adjustmentLabel.prepend('確定');
      }
      const deleteAdjustment = document.createElement('button');
      deleteAdjustment.type = 'button';
      deleteAdjustment.textContent = '削除';
      deleteAdjustment.setAttribute('aria-label', `結果${index + 1}の調整量${adjustmentIndex + 1}を削除`);
      deleteAdjustment.addEventListener('click', () => confirmDeletion(`結果${index + 1}の調整量${adjustmentIndex + 1}を削除しますか？`, () => {
        // 固定対象は追加先の最後の調整。古い同内容の調整を削除しても解除しない。
        const releasesLock = adjustmentLock?.targetId === set.learningId && set.adjustments.at(-1) === adjustment;
        const stageDeleted = adjustmentSequence?.stages.some(stage => stage.targetId === set.learningId && stage.actionIndex === adjustmentIndex);
        const active = Object.fromEntries(Object.entries(adjustmentSequence?.active ?? {}).map(([page,index])=>[page,adjustmentSequence.stages[index]]));
        if (stageDeleted) adjustmentSequence.stages = adjustmentSequence.stages.filter(stage=>stage.targetId!==set.learningId || stage.actionIndex!==adjustmentIndex);
        adjustmentSequence?.stages.forEach(stage => {
          if (stage.targetId === set.learningId && stage.actionIndex > adjustmentIndex) stage.actionIndex--;
        });
        if (adjustmentSequence) adjustmentSequence.active = Object.fromEntries(Object.entries(active).map(([page,stage])=>[page,adjustmentSequence.stages.indexOf(stage)]).filter(([,index])=>index>=0));
        if (confirmedCarry?.targetId === set.learningId && confirmedCarry.actionIndex > adjustmentIndex) confirmedCarry.actionIndex--;
        set.adjustments.splice(adjustmentIndex, 1);
        invalidateAdjustmentForecast();
        if (releasesLock || stageDeleted) {
          adjustmentLock = getSequenceStage();
          if (!adjustmentLock) { resetSharedAdjustmentAmounts();restoreAdjustmentSelection(); }
        }
        saveDotSets();
        renderDots();
        refreshAdjustmentForecastAfterDeletion();
        globalThis.balanceFlushState?.();
      }));
      adjustmentRow.append(adjustmentLabel, deleteAdjustment);
      appendLatestConfirmedEditButton(adjustmentRow, set, adjustmentIndex);
      item.append(adjustmentRow);
      if (stageIndex >= 0) {
        const forecast = adjustmentSequence.stages[stageIndex].forecast;
        const summary = document.createElement('p');
        summary.className = 'confirmed-adjustment-forecast';
        summary.dataset.adjustment = String(stageIndex + 1);
        for (const color of ['red', 'blue']) {
          const point = forecast.points.find(point => point.color === color
            && [point.x, point.y].every(Number.isFinite));
          const value = document.createElement('span');
          value.dataset.color = color;
          value.textContent = `${color === 'red' ? 'HOV' : '巡航'}確定予測 `;
          if (point) {
            const endpoint = Math.hypot(point.x - CHART_CENTER_X, point.y - CHART_CENTER_Y) / CHART_RADIUS;
            value.textContent += `${endpoint.toFixed(2)} IPS${point.source === 'learned' ? '' : '（参考）'}`;
            value.dataset.source = point.source ?? 'unknown';
          } else value.textContent += '予測なし';
          summary.append(value);
        }
        item.append(summary);
      }
    });
    return item;
  }));

  const isFull = getDotCount() >= MAX_DOTS;
  addDotButton.disabled = isFull && !resultEdit;
  if (isFull) dotMessage.textContent = `ドットは最大${MAX_DOTS}個まで追加できます。削除すると追加できます。`;
  else if (dotMessage.textContent.startsWith('ドットは最大')) dotMessage.textContent = '';

  // chart.svg と同じ viewBox を受け取る外側レイヤーに描く。
  // object 内のDOMに直接アクセスできないブラウザでも動作する。
  dotOverlay.replaceChildren();
  renderDirectionLines();

  const latestDotIndex = {
    red: dotSets.findLastIndex(set => Boolean(set.red)),
    blue: dotSets.findLastIndex(set => Boolean(set.blue))
  };
  const addLatestRing = (x, y, radius, color, kind) => {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ring.setAttribute('cx', String(x));
    ring.setAttribute('cy', String(y));
    ring.setAttribute('rx', String(radius));
    ring.setAttribute('ry', String(radius));
    ring.setAttribute('class', `latest-ring latest-ring-${kind} latest-ring-${color}`);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', color === 'white' ? '#ffffff' : DOT_COLORS[color]);
    ring.setAttribute('stroke-width', '2');
    dotOverlay.append(ring);
  };
  dotSets.forEach((set, index) => {
    [set.red, set.blue].filter(Boolean).forEach((dot) => {
      const { x, y } = getDotCoordinates(dot);
      const latest = index === latestDotIndex[dot.color];
      if (latest) {
        addLatestRing(x, y, 6, 'white', 'inner');
        addLatestRing(x, y, 7, dot.color, 'outer');
      }
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', DOT_COLORS[dot.color]);
      circle.classList.add(`chart-dot-${dot.color}`);
      if (latest) circle.classList.add('latest-measured-dot');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
      circle.style.pointerEvents = 'none';
      dotOverlay.append(circle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      if (latest) {
        label.classList.add('latest-measured-number');
      }
      label.dataset.dotX = String(x);
      label.dataset.dotY = String(y);
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', DOT_COLORS[dot.color]);
      label.classList.add(`chart-dot-${dot.color}`);
      label.setAttribute('font-family', "Arial, 'Noto Sans JP', sans-serif");
      label.setAttribute('font-size', '16');
      label.setAttribute('font-weight', '700');
      label.setAttribute('stroke', '#ffffff');
      label.setAttribute('stroke-width', '3');
      label.setAttribute('paint-order', 'stroke');
      label.style.pointerEvents = 'none';
      label.textContent = String(index + 1);
      dotOverlay.append(label);
    });
  });
  if (adjustmentForecast?.phase === 'preview') updateAdjustmentForecast(adjustmentForecast.values);
  else renderAdjustmentForecast();
  layoutDotNumbers();
}

// 表示だけを再配置する。測定・予測・学習処理は呼び出さない。
function layoutDotNumbers() {
  if (dotNumberViewInteracting) return;
  const matrix = dotOverlay.getScreenCTM();
  if (!matrix || !matrix.a || !matrix.d) return;
  const gap = 2 / Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
  const boxes = [...dotOverlay.querySelectorAll('circle, ellipse')].map(node => {
    const box = node.getBBox();
    const stroke = parseFloat(getComputedStyle(node).strokeWidth) || 0;
    return { x: box.x - stroke / 2, y: box.y - stroke / 2,
      width: box.width + stroke, height: box.height + stroke };
  });
  const overlaps = (a, b) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  for (const label of dotOverlay.querySelectorAll('text[data-dot-x]')) {
    const current = label.getBBox();
    // ズームによる字体のピクセル丸めと移動後のBBox差も吸収する。
    const stroke = (parseFloat(getComputedStyle(label).strokeWidth) || 0) / 2 + 2;
    const width = current.width + 2 * stroke;
    const height = current.height + 2 * stroke;
    const currentBox = { x: current.x - stroke, y: current.y - stroke, width, height };
    // 衝突しない番号は座標に触れず、ズーム前の相対位置を保つ。
    if (!boxes.some(other => overlaps(currentBox, other))) {
      boxes.push(currentBox);
      continue;
    }
    const measured = { x: current.x - Number(label.getAttribute('x')),
      y: current.y - Number(label.getAttribute('y')) };
    const dotX = Number(label.dataset.dotX);
    const dotY = Number(label.dataset.dotY);
    let placed = false;
    // 距離の小さい順に全方向を探す。密集時も重なる固定位置へ逃がさない。
    for (let distance = 0; !placed; distance += 1) {
      for (let angle = -45; angle < 315; angle += 5) {
        const radians = angle * Math.PI / 180;
        const box = { x: dotX + Math.cos(radians) * distance - width / 2,
          y: dotY + Math.sin(radians) * distance - height / 2, width, height };
        if (boxes.some(other => overlaps(box, other))) continue;
        label.setAttribute('x', String(box.x - measured.x + stroke));
        label.setAttribute('y', String(box.y - measured.y + stroke));
        boxes.push(box);
        placed = true;
        break;
      }
    }
  }
}

let dotNumberLayoutFrame = null;
let dotNumberLayoutTimer = null;
let dotNumberViewInteracting = false;
function scheduleDotNumberLayout(delay = 0) {
  clearTimeout(dotNumberLayoutTimer);
  dotNumberLayoutTimer = null;
  if (dotNumberLayoutFrame !== null) cancelAnimationFrame(dotNumberLayoutFrame);
  dotNumberLayoutFrame = null;
  if (dotNumberViewInteracting) return;
  const enqueue = () => {
    dotNumberLayoutTimer = null;
    dotNumberLayoutFrame = requestAnimationFrame(() => {
      dotNumberLayoutFrame = null;
      layoutDotNumbers();
    });
  };
  if (delay) dotNumberLayoutTimer = setTimeout(enqueue, delay);
  else enqueue();
}
// viewBox・画面サイズの連続変化が止まってから、必要な番号だけ重なりを回避する。
const scheduleDotNumberViewportLayout = () => scheduleDotNumberLayout(180);
new MutationObserver(records => {
  if (records.some(record => record.attributeName === 'viewBox')) scheduleDotNumberViewportLayout();
  else scheduleDotNumberLayout();
}).observe(dotOverlay,
  { childList: true, subtree: true, attributes: true, attributeFilter: ['viewBox', 'class'] });
new ResizeObserver(scheduleDotNumberViewportLayout).observe(dotOverlay);
window.addEventListener('resize', scheduleDotNumberViewportLayout);
window.visualViewport?.addEventListener('resize', scheduleDotNumberViewportLayout);
document.fonts?.ready.then(() => scheduleDotNumberLayout());

dotForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (resultEdit) {
    const target = resultEdit.set;
    if (!dotSets.includes(target)) { cancelEditing(); return; }
    if ([redInputs, blueInputs].some(inputs => inputs.some(input => input.value === '') && inputs.some(input => input.value !== ''))) {
      dotMessage.textContent = 'HOV・巡航はそれぞれ時計角と数値をすべて入力するか、すべて空欄にしてください。';
      return;
    }
    const red = readDotInput(redInputs, 'red');
    const blue = readDotInput(blueInputs, 'blue');
    if (red === undefined || blue === undefined || (!red && !blue)) {
      dotMessage.textContent = 'HOVまたは巡航の時計角と0以上の数値をすべて入力してください。';
      return;
    }
    const count = getDotCount() - Number(Boolean(target.red)) - Number(Boolean(target.blue)) + Number(Boolean(red)) + Number(Boolean(blue));
    if (count > MAX_DOTS) {
      dotMessage.textContent = `ドットは最大${MAX_DOTS}個までです。`;
      return;
    }
    target.red = red;
    target.blue = blue;
    releaseAdjustmentLock();
    selectedAdjustmentTarget = target;
    saveDotSets();
    cancelEditing();
    renderDots();
    return;
  }
  if (cruiseAdditionTarget) {
    const target = cruiseAdditionTarget;
    if (!dotSets.includes(target) || !target.red || target.blue) {
      finishCruiseAddition();
      return;
    }
    if (getDotCount() >= MAX_DOTS) {
      dotMessage.textContent = `ドットは最大${MAX_DOTS}個まで追加できます。`;
      return;
    }
    const blue = readDotInput(blueInputs, 'blue');
    if (blueInputs.some((input) => input.value === '') || !blue) {
      dotMessage.textContent = '巡航の時計角（時間は1〜12、分は00〜59）と0以上の数値をすべて入力してください。';
      return;
    }
    target.blue = blue;
    compareAdjustmentForecast(target);
    releaseAdjustmentLock();
    selectedAdjustmentTarget = target;
    saveDotSets();
    finishCruiseAddition();
    renderDots();
    return;
  }
  if (getDotCount() >= MAX_DOTS) {
    dotMessage.textContent = `ドットは最大${MAX_DOTS}個まで追加できます。`;
    return;
  }

  const red = readDotInput(redInputs, 'red');
  const blue = readDotInput(blueInputs, 'blue');
  if (red === undefined || blue === undefined || (!red && !blue)) {
    dotMessage.textContent = '赤または青の、時計角（時間は1〜12、分は00〜59）と0以上の数値をすべて入力してください。';
    return;
  }

  if (getDotCount() + Number(Boolean(red)) + Number(Boolean(blue)) > MAX_DOTS) {
    dotMessage.textContent = `ドットは最大${MAX_DOTS}個です。このセットを追加するには、先にドットを削除してください。`;
    return;
  }

  restoreConfirmedCarry();
  dotSets.push({ learningId: newLearningId(), red, blue, adjustments: [] });
  compareAdjustmentForecast(dotSets.at(-1));
  releaseAdjustmentLock();
  selectedAdjustmentTarget = null;
  saveDotSets();
  [...redInputs, ...blueInputs].forEach((input) => {
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  dotMessage.textContent = '';
  renderDots();

  globalThis.balanceFlushState?.();
  redInputs[0].focus();
});

adjustmentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (adjustmentLock) {
    adjustmentMessage.textContent = '次の測定結果を登録するまで、調整量の操作・追加はできません。';
    return;
  }
  if (!dotSets.length) {
    adjustmentMessage.textContent = '先にドットを追加して、結果を作成してください。';
    return;
  }
  if (memoValues.some((value) => !value)) {
    adjustmentMessage.textContent = '調整量の4項目をすべて選択してください。';
    return;
  }
  const targetSet = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  if (adjustmentEdit) {
    const { set, adjustment } = adjustmentEdit;
    if (isConfirmedAdjustment(set, adjustment) || !isLatestRecordedAdjustment(set, adjustment)) { cancelEditing(); return; }
    const index = set.adjustments?.indexOf(adjustment) ?? -1;
    if (!dotSets.includes(set) || index < 0) { cancelEditing(); return; }
    updateAdjustmentForecast(memoValues, true);
    if (set === targetSet) set.adjustments.splice(index, 1, [...memoValues]);
    else {
      set.adjustments.splice(index, 1);
      targetSet.adjustments ??= [];
      targetSet.adjustments.push([...memoValues]);
    }
    saveDotSets();
    cancelEditing();
    renderDots();
    return;
  }
  const previousForecast = adjustmentForecast;
  const confirmedOrigins = getOriginSnapshot(getAdjustmentStartSet(targetSet));
  const confirmedForecast = confirmSelectedForecast();
  const requiredColors = Object.keys(confirmedOrigins);
  const completeForecast = confirmedForecast && requiredColors.length && requiredColors.every(color => confirmedForecast.points
    .some(point => point.color === color && [point.x, point.y, point.distance].every(Number.isFinite)));
  if (adjustmentSequence && !completeForecast) {
    adjustmentForecast = previousForecast;
    renderAdjustmentForecast();
    adjustmentMessage.textContent = '起点データがある項目すべての予測が必要です。算出可能な調整を選択してください。';
    return;
  }
  targetSet.adjustments ??= [];
  targetSet.adjustments.push([...memoValues]);
  saveAdjustmentSelection();
  const stage = { page: currentChartPage, values: [...memoValues], rank: guideCandidateIndex,
    guideBlade: String(guideNumberChoices[guideCandidateIndex]?.blade ?? '—'),
    targetId: targetSet.learningId, actualAdjustment: false,
    actionIndex: targetSet.adjustments.length - 1, origins: confirmedOrigins,
    rotations: structuredClone(pageRotations),
    forecast: confirmedForecast ?? { targetId: targetSet.learningId, type: memoValues[1], values: [...memoValues],
      phase: 'fixed', points: [], waiting: ['red', 'blue'] } };
  adjustmentSequence ??= { targetId: targetSet.learningId, measurements: getMeasurementSignature(targetSet), stages: [], draft: null, active: {}, flow: true };
  adjustmentSequence.flow = true;
  adjustmentSequence.active ??= {};
  adjustmentSequence.currentTargetId = targetSet.learningId;
  adjustmentSequence.stages.push(stage);
  adjustmentSequence.active[currentChartPage] = adjustmentSequence.stages.length - 1;
  adjustmentLock = stage;
  saveConfirmedCarry(adjustmentLock);
  adjustmentSequence.draft = null;
  forecastDisplayCache.clear();
  hideMemoPicker();
  activeMemoIndex = null;
  saveDotSets();
  updateMemoButtons();
  adjustmentMessage.textContent = '次の測定結果を登録するまで、追加した調整量を固定しています。';
  updateSequenceMessage();
  updatePitchModeUI();
  updateTrimModeUI();
  renderDots();
  globalThis.balanceFlushState?.();
});

function setGroupRotation(group, angle) {
  group.setAttribute('transform', `rotate(${angle} ${CHART_CENTER_X} ${CHART_CENTER_Y})`);
}

function setupRotationControls() {
  const svg = chartObject.contentDocument?.documentElement;
  const hovGroup = chartObject.contentDocument?.getElementById('hovGroup');
  const cruiseGroup = chartObject.contentDocument?.getElementById('cruiseGroup');
  const hovHandle = chartObject.contentDocument?.getElementById('hovRotationHandle');
  const cruiseHandle = chartObject.contentDocument?.getElementById('cruiseRotationHandle');

  if (!svg || !hovGroup || !cruiseGroup || !hovHandle || !cruiseHandle) return;

  // DOMへアクセスできる場合は、親ページだけで回転を処理する。
  svg.dataset.rotationManagedByParent = 'true';
  setGroupRotation(hovGroup, hovAngle);
  setGroupRotation(cruiseGroup, cruiseAngle);
  dotOverlay.setAttribute('viewBox', svg.getAttribute('viewBox') || '0 0 794 1123');
  new MutationObserver(() => {
    dotOverlay.setAttribute('viewBox', svg.getAttribute('viewBox') || '0 0 794 1123');
  }).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  // SVGの遅延読込で、復元済みの入力・予測を新しい候補で上書きしない。
  const wasRestoring = restoringAppState;
  restoringAppState = true;
  try { renderDots(); } finally { restoringAppState = wasRestoring; }

  // 回転用リング以外では、モバイルの縦スクロールを優先する。
  svg.style.touchAction = 'pan-y';

  const groups = [
    { group: hovGroup, handle: hovHandle, name: 'hov' },
    { group: cruiseGroup, handle: cruiseHandle, name: 'cruise' }
  ];
  let activeRotation = null;
  let rotationFrame = null;
  let pendingPointer = null;
  let rotationChanged = false;

  function flushRotation() {
    if (rotationFrame !== null) cancelAnimationFrame(rotationFrame);
    rotationFrame = null;
    if (!activeRotation || !pendingPointer) return;
    if (rotationLocked || rotationLock.checked || (currentChartPage === 0 && pitchAutoMode)
      || (currentChartPage === 1 && trimAutoMode)) {
      pendingPointer = null;
      return;
    }
    const angle = activeRotation.startGroupAngle + getPointerAngle(pendingPointer) - activeRotation.startPointerAngle;
    pendingPointer = null;
    if (activeRotation.name === 'hov') {
      hovAngle = angle;
      if (currentChartPage === 0) manualPitchAngles.hovAngle = angle;
    }
    else {
      cruiseAngle = angle;
      if (currentChartPage === 1) manualTrimCruiseAngle = angle;
      else manualPitchAngles.cruiseAngle = angle;
    }
    setGroupRotation(activeRotation.group, angle);
    renderDirectionLines();
    rotationChanged = true;
  }

  // 透明リング上だけは回転ドラッグ、それ以外は縦スクロールにする。
  groups.forEach((state) => {
    state.handle.style.touchAction = 'none';
    rotationHandles.push(state.handle);
  });
  updateRotationLock();

  function getPointerAngle(event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    return Math.atan2(svgPoint.y - CHART_CENTER_Y, svgPoint.x - CHART_CENTER_X) * (180 / Math.PI);
  }

  function finishRotation(event) {
    if (!activeRotation || event.pointerId !== activeRotation.pointerId) return;
    flushRotation();
    activeRotation.handle.style.cursor = 'grab';
    activeRotation = null;
    if (rotationChanged) saveRotation();
    rotationChanged = false;
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  }

  groups.forEach((state) => {
    state.handle.addEventListener('pointerdown', (event) => {
      const isZoomed = Number(svg.viewBox.baseVal.width) < 794;
      if (rotationLocked || rotationLock.checked || (currentChartPage === 0 && pitchAutoMode)
        || (currentChartPage === 1 && trimAutoMode)
        || svg.dataset.pinching === 'true' || isZoomed) {
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();

      if (activeRotation) finishRotation({ pointerId: activeRotation.pointerId });
      activeRotation = {
        ...state,
        pointerId: event.pointerId,
        startPointerAngle: getPointerAngle(event),
        startGroupAngle: state.name === 'hov' ? hovAngle : cruiseAngle
      };

      svg.setPointerCapture(event.pointerId);
      state.handle.style.cursor = 'grabbing';
    });
  });

  svg.addEventListener('pointermove', (event) => {
    if (!activeRotation || event.pointerId !== activeRotation.pointerId) return;

    if (svg.dataset.pinching === 'true') {
      finishRotation(event);
      return;
    }

    event.preventDefault();
    pendingPointer = { clientX: event.clientX, clientY: event.clientY };
    if (rotationFrame === null) rotationFrame = requestAnimationFrame(flushRotation);
  });

  svg.addEventListener('pointerup', finishRotation);
  svg.addEventListener('pointercancel', finishRotation);
  svg.addEventListener('lostpointercapture', finishRotation);
  window.addEventListener('pagehide', () => {
    if (activeRotation) finishRotation({ pointerId: activeRotation.pointerId });
  });
}

renderDots();

// chart.svg は viewBox を変えるたびに通知する。file:// などで object のDOMに
// 直接アクセスできない場合も、ドット表示を確実に同期できる。
window.addEventListener('message', (event) => {
  if (event.source !== chartObject.contentWindow) return;
  const message = event.data;
  // 初期SVGの応答は操作ではない。復元した親画面の角度を優先する。
  if (message?.type === 'balance-chart-rotation' && message.snapshot) {
    chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle, page: currentChartPage }, '*');
    return;
  }
  if (message?.type === 'balance-chart-rotation'
    && Number.isFinite(message.hovAngle) && Number.isFinite(message.cruiseAngle)) {
    if (rotationLocked || rotationLock.checked || adjustmentLock?.page === currentChartPage
      || (currentChartPage === 0 && pitchAutoMode) || (currentChartPage === 1 && trimAutoMode)) return;
    hovAngle = message.hovAngle;
    cruiseAngle = message.cruiseAngle;
    if (currentChartPage === 1) manualTrimCruiseAngle = cruiseAngle;
    else {
      manualPitchAngles.hovAngle = hovAngle;
      manualPitchAngles.cruiseAngle = cruiseAngle;
    }
    if (message.finished) saveRotation();
    renderDirectionLines();
  }
  if (message?.type === 'balance-chart-viewbox' && typeof message.viewBox === 'string') {
    dotNumberViewInteracting = message.interacting === true;
    dotOverlay.setAttribute('viewBox', message.viewBox);
    scheduleDotNumberViewportLayout();
  }
  if (message?.type === 'balance-chart-swipe' && (message.direction === -1 || message.direction === 1)) {
    showChartPage(currentChartPage + message.direction);
  }
});

if (chartObject.contentDocument?.getElementById('hovRotationHandle')
  && chartObject.contentDocument?.getElementById('cruiseRotationHandle')) {
  setupRotationControls();
} else {
  chartObject.addEventListener('load', setupRotationControls, { once: true });
}
chartObject.addEventListener('load', updateRotationLock);
chartObject.addEventListener('load', () => {
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle, page: currentChartPage }, '*');
  updateRotationLock();
});
function requestChartRotation() {
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-request-rotation' }, '*');
}
chartObject.addEventListener('load', requestChartRotation);
requestChartRotation();
// 独立した比較用iframeには正式表示を重ねない。
twoAdjustmentReferenceReady = !globalThis.tabIntersectionMemoryStorage;
document.body.dataset.twoAdjustmentEnabled = String(twoAdjustmentReferenceReady);
