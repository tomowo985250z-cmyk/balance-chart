console.log("app.js loaded");
let hovAngle = 0;
let cruiseAngle = 0;
let rotationLocked = false;
let rotationHandles = [];

const CHART_CENTER_X = 397;
const CHART_CENTER_Y = 520;
const CHART_RADIUS = 240;
const CENTER_DISTANCE_THRESHOLD = 0.2;
const chartObject = document.querySelector('object[type="image/svg+xml"]');
const chartWrap = document.querySelector('.chart-wrap');
const dotOverlay = document.getElementById('dotOverlay');
const rotationLock = document.getElementById('rotationLock');
const guideToggle = document.getElementById('guideToggle');
const guideToggleText = document.getElementById('guideToggleText');

function setGuidesVisible(visible) {
  dotOverlay.classList.toggle('guides-visible', visible);
  guideToggle.setAttribute('aria-pressed', String(visible));
  guideToggleText.textContent = visible ? 'ガイド ON' : 'ガイド OFF';
}

guideToggle.addEventListener('click', () => {
  setGuidesVisible(guideToggle.getAttribute('aria-pressed') !== 'true');
});
setGuidesVisible(false);
window.addEventListener('pageshow', () => setGuidesVisible(false));
const dotForm = document.getElementById('dotForm');
const adjustmentForm = document.getElementById('adjustmentForm');
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
  addDotButton.textContent = active ? `結果 ${index + 1} に巡航を追加` : 'ドットを追加';
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
const memoValues = ['', '', '', ''];
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

function updateMemoButtons() {
  memoButtons.forEach((button, index) => {
    button.textContent = `${index + 1}: ${memoValues[index] || '選択'}`;
  });
  const thirdOptions = getThirdMemoOptions();
  memoButtons[2].disabled = thirdOptions.length === 0;
  if (!thirdOptions.includes(memoValues[2])) memoValues[2] = '';
  memoButtons[2].textContent = `3: ${memoValues[2] || '選択'}`;
}

function renderMemoWheel(options, selected) {
  memoWheel.replaceChildren();
  options.forEach((value) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'time-wheel-option';
    option.dataset.value = value;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(value === selected));
    option.textContent = value;
    option.addEventListener('click', () => option.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    memoWheel.append(option);
    if (value === selected) requestAnimationFrame(() => option.scrollIntoView({ block: 'center' }));
  });
  memoWheel.onscroll = () => {
    cancelAnimationFrame(memoWheel.selectionFrame);
    memoWheel.selectionFrame = requestAnimationFrame(() => {
      const center = memoWheel.getBoundingClientRect().top + memoWheel.clientHeight / 2;
      let closest = null;
      let distance = Infinity;
      memoWheel.querySelectorAll('.time-wheel-option').forEach((option) => {
        const rect = option.getBoundingClientRect();
        const optionDistance = Math.abs(rect.top + rect.height / 2 - center);
        if (optionDistance < distance) { closest = option; distance = optionDistance; }
      });
      if (!closest) return;
      selectedMemoValue = closest.dataset.value;
      memoWheel.querySelectorAll('.time-wheel-option').forEach((option) => option.setAttribute('aria-selected', String(option === closest)));
    });
  };
}

function openMemoPicker(index) {
  const options = index === 2 ? getThirdMemoOptions() : MEMO_OPTIONS[index];
  if (!options.length) return;
  activeMemoIndex = index;
  const initialValue = index === 2 ? (memoValues[1] === 'LINK' ? '1/8' : '1') : options[0];
  selectedMemoValue = memoValues[index] || initialValue;
  memoPickerTitle.textContent = `調整量 ${index + 1} を選択`;
  renderMemoWheel(options, selectedMemoValue);
  memoPicker.hidden = false;
}

memoButtons.forEach((button, index) => button.addEventListener('click', () => openMemoPicker(index)));
closeMemoPicker.addEventListener('click', () => { memoPicker.hidden = true; });
confirmMemoPicker.addEventListener('click', () => {
  if (activeMemoIndex === null) return;
  memoValues[activeMemoIndex] = selectedMemoValue;
  if (activeMemoIndex === 1) memoValues[2] = '';
  updateMemoButtons();
  memoPicker.hidden = true;
});
memoPicker.addEventListener('click', (event) => { if (event.target === memoPicker) memoPicker.hidden = true; });
updateMemoButtons();

function loadRotation() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROTATION_STORAGE_KEY) || '{}');
    hovAngle = Number.isFinite(saved.hovAngle) ? saved.hovAngle : 0;
    cruiseAngle = Number.isFinite(saved.cruiseAngle) ? saved.cruiseAngle : 0;
  } catch {
    hovAngle = 0;
    cruiseAngle = 0;
  }
}

function saveRotation() {
  try {
    localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify({ hovAngle, cruiseAngle }));
  } catch {
    // 保存領域を利用できない場合は、この表示中だけ回転角を保持する。
  }
}

loadRotation();

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

populateTimeSelect(redInputs[0], 1, 12);
populateTimeSelect(redInputs[1], 0, 59);
populateTimeSelect(blueInputs[0], 1, 12);
populateTimeSelect(blueInputs[1], 0, 59);

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

createTimePickerTrigger(redInputs[0], redInputs[1]);
createTimePickerTrigger(blueInputs[0], blueInputs[1]);

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
  rotationLocked = rotationLock.checked;
  chartWrap.classList.toggle('is-rotation-locked', rotationLocked);
  const svg = chartObject.contentDocument?.documentElement;
  if (svg) svg.dataset.rotationLocked = String(rotationLocked);
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-rotation-lock', locked: rotationLocked }, '*');
  rotationHandles.forEach((handle) => {
    handle.style.pointerEvents = rotationLocked ? 'none' : 'stroke';
    handle.setAttribute('pointer-events', rotationLocked ? 'none' : 'stroke');
    handle.style.cursor = rotationLocked ? 'default' : 'grab';
  });
}

rotationLock.addEventListener('change', updateRotationLock);
rotationLock.addEventListener('input', updateRotationLock);
// 保存した回転角を復元した画面では、意図しない回転を防ぐためロックから開始する。
rotationLock.checked = true;
updateRotationLock();

function getStoredDot(dot, color) {
  if (!dot || dot.color !== color || !Number.isFinite(dot.angle) || !Number.isFinite(dot.radius)
    || dot.radius < 0 || typeof dot.clock !== 'string') return null;
  return { clock: dot.clock.replace(/^0:/, '12:'), angle: dot.angle, radius: dot.radius, color };
}

function loadDotSets() {
  try {
    const saved = JSON.parse(localStorage.getItem(DOT_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];

    return saved.reduce((sets, set) => {
      const restored = {
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
    localStorage.setItem(DOT_STORAGE_KEY, JSON.stringify(dotSets));
  } catch {
    // プライベートブラウズなど、端末の保存領域が使えない場合は何もしない。
  }
}

dotSets.push(...loadDotSets());

function parseDotInput(hourValue, minuteValue, value) {
  const hours = Number(hourValue);
  const minutes = Number(minuteValue);
  const radius = Number(String(value).replace(',', '.'));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isFinite(radius)
    || hours < 1 || hours > 12 || minutes < 0 || minutes > 59 || radius < 0) return null;

  return { clock: `${hours}:${String(minutes).padStart(2, '0')}`, angle: (hours % 12) * 30 + minutes * 0.5, radius };
}

function readDotInput(inputs, color) {
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

function getDirectionLine(dot, layer, adjustment, forcedNumber, forcedDirection) {
  const center = getDotCoordinates(dot);
  const rotation = layer === 'red' ? hovAngle : cruiseAngle;
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
  const arrowTip = { x: center.x + endT * vector.x, y: center.y + endT * vector.y };
  const centerDistance = (centerProgress >= 0
    ? Math.abs(vector.x * towardCenterY - vector.y * towardCenterX) / Math.sqrt(vectorLengthSquared)
    : Math.hypot(towardCenterX, towardCenterY)) / CHART_RADIUS;
  return {
    centerDistance,
    pointsTowardCenter: centerProgress >= 0,
    direction,
    number: segment.number,
    start: lineStart,
    end: arrowTip
  };
}

function appendDirectionArrowMarkers(target) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  [['red', DOT_COLORS.red], ['blue', DOT_COLORS.blue]].forEach(([name, color]) => {
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

function renderDirectionLines() {
  let guideLayer = dotOverlay.querySelector('.direction-lines');
  if (!guideLayer) {
    guideLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    guideLayer.setAttribute('class', 'direction-lines');
    dotOverlay.prepend(guideLayer);
  }
  guideLayer.replaceChildren();
  const redDots = [];
  const blueDots = [];
  // 基準線の候補は、現在の最終結果番号にある赤・青ドットだけに限定する。
  const finalIndex = dotSets.length - 1;
  const finalSet = dotSets[finalIndex];
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
  const candidates = redDots.flatMap((red) => blueDots
    .filter((blue) => red.line && blue.line
      && red.line.number === blue.line.number
      && red.line.direction === blue.line.direction)
    .map((blue) => ({
      redLine: red.line,
      blueLine: blue.line,
      bothTowardCenter: red.line.pointsTowardCenter && blue.line.pointsTowardCenter,
      withinCenterThreshold: red.line.centerDistance <= CENTER_DISTANCE_THRESHOLD
        && blue.line.centerDistance <= CENTER_DISTANCE_THRESHOLD,
      maxCenterDistance: Math.max(red.line.centerDistance, blue.line.centerDistance),
      distance: red.line.centerDistance + blue.line.centerDistance,
      distanceDifference: Math.abs(red.line.centerDistance - blue.line.centerDistance),
      redIndex: red.index,
      blueIndex: blue.index
    })))
    .sort((first, second) => Number(second.bothTowardCenter) - Number(first.bothTowardCenter)
      || Number(second.withinCenterThreshold) - Number(first.withinCenterThreshold)
      || first.maxCenterDistance - second.maxCenterDistance
      || first.distance - second.distance
      || first.distanceDifference - second.distanceDifference
      || first.redIndex - second.redIndex
      || first.blueIndex - second.blueIndex);
  // 同番号・同UP/DOWNの組を選び、中心への向きにかかわらず矢印を表示する。
  const selected = candidates[0];
  if (!selected) return;

  appendDirectionArrowMarkers(guideLayer);
  [{ line: selected.redLine, color: DOT_COLORS.red, marker: 'redDirectionLineArrow' }, { line: selected.blueLine, color: DOT_COLORS.blue, marker: 'blueDirectionLineArrow' }].forEach(({ line, color, marker }) => {
    const directionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    directionLine.setAttribute('class', 'guide-direction-line');
    directionLine.setAttribute('x1', String(line.start.x));
    directionLine.setAttribute('y1', String(line.start.y));
    directionLine.setAttribute('x2', String(line.end.x));
    directionLine.setAttribute('y2', String(line.end.y));
    directionLine.setAttribute('stroke', color);
    directionLine.setAttribute('stroke-width', '1.8');
    directionLine.setAttribute('stroke-dasharray', '9 7');
    directionLine.setAttribute('stroke-linecap', 'round');
    directionLine.setAttribute('opacity', '0.9');
    directionLine.setAttribute('marker-end', `url(#${marker})`);
    directionLine.style.pointerEvents = 'none';
    guideLayer.append(directionLine);
  });
}

function renderDots() {
  updateCruiseAdditionUI();
  dotList.replaceChildren(...dotSets.map((set, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `結果 ${index + 1}: `;
    [set.red, set.blue].filter(Boolean).forEach((dot, dotIndex) => {
      if (dotIndex) label.append(' ／ ');
      const dotLabel = document.createElement('span');
      dotLabel.className = `dot-label-${dot.color}`;
      dotLabel.textContent = `${dot.color === 'red' ? 'HOV' : '巡航'} ${dot.radius} ${dot.clock}`;
      label.append(dotLabel);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `セット${index + 1}を削除`);
    remove.addEventListener('click', () => { dotSets.splice(index, 1); saveDotSets(); renderDots(); });
    const resultRow = document.createElement('div');
    resultRow.className = 'dot-result-row';
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
      adjustmentLabel.textContent = `調整量: ${adjustment.join(' ／ ')}`;
      const deleteAdjustment = document.createElement('button');
      deleteAdjustment.type = 'button';
      deleteAdjustment.textContent = '削除';
      deleteAdjustment.setAttribute('aria-label', `結果${index + 1}の調整量${adjustmentIndex + 1}を削除`);
      deleteAdjustment.addEventListener('click', () => { set.adjustments.splice(adjustmentIndex, 1); saveDotSets(); renderDots(); });
      adjustmentRow.append(adjustmentLabel, deleteAdjustment);
      item.append(adjustmentRow);
    });
    return item;
  }));

  const isFull = getDotCount() >= MAX_DOTS;
  addDotButton.disabled = isFull;
  if (isFull) dotMessage.textContent = `ドットは最大${MAX_DOTS}個まで追加できます。削除すると追加できます。`;
  else if (dotMessage.textContent.startsWith('ドットは最大')) dotMessage.textContent = '';

  // chart.svg と同じ viewBox を受け取る外側レイヤーに描く。
  // object 内のDOMに直接アクセスできないブラウザでも動作する。
  dotOverlay.replaceChildren();
  renderDirectionLines();
  const labelBoxes = [];

  function getLabelPosition(dotX, dotY) {
    const labelWidth = 18;
    const labelHeight = 20;
    const angles = [-45, 0, 45, 90, 135, 180, 225, 270];
    for (let distance = 17; distance <= 101; distance += 14) {
      for (const degrees of angles) {
        const radians = degrees * Math.PI / 180;
        const x = dotX + Math.cos(radians) * distance;
        const y = dotY + Math.sin(radians) * distance + 5;
        const box = { left: x - labelWidth / 2, top: y - labelHeight / 2, right: x + labelWidth / 2, bottom: y + labelHeight / 2 };
        const overlaps = labelBoxes.some((other) => box.left < other.right && box.right > other.left
          && box.top < other.bottom && box.bottom > other.top);
        if (!overlaps) {
          labelBoxes.push(box);
          return { x, y };
        }
      }
    }
    // すべて近接候補が埋まった場合も、最後の候補へ置いて番号を失わないようにする。
    const x = dotX + 115;
    const y = dotY + 5;
    labelBoxes.push({ left: x - labelWidth / 2, top: y - labelHeight / 2, right: x + labelWidth / 2, bottom: y + labelHeight / 2 });
    return { x, y };
  }

  dotSets.forEach((set, index) => {
    [set.red, set.blue].filter(Boolean).forEach((dot) => {
      const { x, y } = getDotCoordinates(dot);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', DOT_COLORS[dot.color]);
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
      circle.style.pointerEvents = 'none';
      dotOverlay.append(circle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const labelPosition = getLabelPosition(x, y);
      label.setAttribute('x', String(labelPosition.x));
      label.setAttribute('y', String(labelPosition.y));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', DOT_COLORS[dot.color]);
      label.setAttribute('font-family', "Arial, 'Noto Sans JP', sans-serif");
      label.setAttribute('font-size', '14');
      label.setAttribute('font-weight', '700');
      label.setAttribute('stroke', '#ffffff');
      label.setAttribute('stroke-width', '3');
      label.setAttribute('paint-order', 'stroke');
      label.style.pointerEvents = 'none';
      label.textContent = String(index + 1);
      dotOverlay.append(label);
    });
  });

}

dotForm.addEventListener('submit', (event) => {
  event.preventDefault();
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

  dotSets.push({ red, blue, adjustments: [] });
  saveDotSets();
  [...redInputs, ...blueInputs].forEach((input) => {
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  dotMessage.textContent = '';
  renderDots();

  redInputs[0].focus();
});

adjustmentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!dotSets.length) {
    adjustmentMessage.textContent = '先にドットを追加して、結果を作成してください。';
    return;
  }
  if (memoValues.some((value) => !value)) {
    adjustmentMessage.textContent = '調整量の4項目をすべて選択してください。';
    return;
  }
  const latestSet = dotSets.at(-1);
  latestSet.adjustments ??= [];
  latestSet.adjustments.push([...memoValues]);
  saveDotSets();
  memoValues.fill('');
  updateMemoButtons();
  adjustmentMessage.textContent = '';
  renderDots();
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
  renderDots();

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
    const angle = activeRotation.startGroupAngle + getPointerAngle(pendingPointer) - activeRotation.startPointerAngle;
    pendingPointer = null;
    if (activeRotation.name === 'hov') hovAngle = angle;
    else cruiseAngle = angle;
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
      if (rotationLocked || rotationLock.checked || svg.dataset.pinching === 'true' || isZoomed) {
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
  if (message?.type === 'balance-chart-rotation'
    && Number.isFinite(message.hovAngle) && Number.isFinite(message.cruiseAngle)) {
    hovAngle = message.hovAngle;
    cruiseAngle = message.cruiseAngle;
    if (message.finished) saveRotation();
    renderDirectionLines();
  }
  if (message?.type === 'balance-chart-viewbox' && typeof message.viewBox === 'string') {
    dotOverlay.setAttribute('viewBox', message.viewBox);
  }
});

if (chartObject.contentDocument) {
  setupRotationControls();
} else {
  chartObject.addEventListener('load', setupRotationControls, { once: true });
}
chartObject.addEventListener('load', updateRotationLock);
function requestChartRotation() {
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-request-rotation' }, '*');
}
chartObject.addEventListener('load', requestChartRotation);
requestChartRotation();
