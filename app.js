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
const chartTitle = document.getElementById('chartTitle');
const chartPageButtons = [...document.querySelectorAll('.chart-page')];
const chartNames = ['現在の調整：ピッチリンク', '現在の調整：トリムタブ'];
let currentChartPage = 0;
const pageRotations = [{ hovAngle: 0, cruiseAngle: 0 }, { hovAngle: 0, cruiseAngle: 0 }];
const dotOverlay = document.getElementById('dotOverlay');
const rotationLock = document.getElementById('rotationLock');
const trimModeToggle = document.getElementById('trimModeToggle');
const pitchModeToggle = document.getElementById('pitchModeToggle');
let pitchAutoMode = false;
const pitchAutoReady = { red: false, blue: false };
const manualPitchAngles = { hovAngle: 0, cruiseAngle: 0 };
const autoPitchAngles = { hovAngle: 0, cruiseAngle: 0 };
let trimAutoMode = false;
let trimAutoReady = false;
let manualTrimCruiseAngle = 0;
let autoTrimCruiseAngle = 0;
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
function getNominalAdjustmentAngle(blade, direction) {
  const side = DIRECTION_ARROW_SEGMENTS.find(segment => segment.number === blade);
  const towardEnd = direction === 'UP' ? side.upAtEnd : !side.upAtEnd;
  return Math.atan2(towardEnd ? side.end.y - side.start.y : side.start.y - side.end.y,
    towardEnd ? side.end.x - side.start.x : side.start.x - side.end.x) * 180 / Math.PI;
}
const learning = BalanceLearning.create({
  storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  coordinates: getDotCoordinates, nominalAngle: getNominalAdjustmentAngle, radius: CHART_RADIUS
});
const manualLearningReference = { LINK: {}, TAB: {} };
let manualMessageChanges = { red: false, blue: false };
let guidePredictionDebug = { fallback: true };
window.balanceChartLearning = { inspect: () => ({ ...learning.inspect(), guides: structuredClone(guidePredictionDebug) }) };

function getSingleAdjustment(set, type) {
  const action = set?.adjustments?.length === 1 ? BalanceLearning.adjustment(set.adjustments[0]) : null;
  return action?.type === type ? action : null;
}

function getLearnedRotation(type, color) {
  const action = [...dotSets].reverse().map(set => getSingleAdjustment(set, type)).find(Boolean);
  return learning.rotation(type, color, action?.blade ?? 1, action?.direction ?? 'UP');
}

function recordManualLearning(color, angle) {
  const type = currentChartPage === 0 ? 'LINK' : 'TAB';
  const reference = manualLearningReference[type][color];
  if (Number.isFinite(reference)) learning.recordManual(type, color, reference, angle);
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

function updateMemoButtons() {
  memoButtons.forEach((button, index) => {
    button.textContent = `${index + 1}：\n${formatMemoInputValue(memoValues[index], index)}`;
  });
  const thirdOptions = getThirdMemoOptions();
  memoButtons[2].disabled = thirdOptions.length === 0;
  if (!thirdOptions.includes(memoValues[2])) memoValues[2] = '';
  memoButtons[2].textContent = `3：\n${formatMemoInputValue(memoValues[2], 2)}`;
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
  renderMemoWheel(options, selectedMemoValue, index);
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
  pageRotations[currentChartPage] = currentChartPage === 0
    ? { ...manualPitchAngles }
    : { hovAngle, cruiseAngle: manualTrimCruiseAngle };
  try {
    localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify({ pages: pageRotations }));
  } catch {
    // 保存領域を利用できない場合は、この表示中だけ回転角を保持する。
  }
}

loadRotation();
Object.assign(manualPitchAngles, pageRotations[0]);
manualTrimCruiseAngle = pageRotations[1].cruiseAngle;

function updatePitchModeUI() {
  pitchModeToggle.hidden = currentChartPage !== 0;
  const waiting = [!pitchAutoReady.red && 'HOV', !pitchAutoReady.blue && '巡航'].filter(Boolean);
  pitchModeToggle.textContent = pitchAutoMode
    ? `赤・青六角形：自動${waiting.length ? `（${waiting.join('・')}待ち）` : ''}`
    : '赤・青六角形：手動';
  pitchModeToggle.setAttribute('aria-pressed', String(pitchAutoMode));
  updateRotationLock();
}

pitchModeToggle.addEventListener('click', () => {
  manualMessageChanges = { red: false, blue: false };
  if (pitchAutoMode) Object.assign(manualLearningReference.LINK, { red: hovAngle, blue: cruiseAngle });
  else manualLearningReference.LINK = {};
  pitchAutoMode = !pitchAutoMode;
  if (pitchAutoMode) syncAutoPitchRotation();
  else applyChartRotation(manualPitchAngles.hovAngle, manualPitchAngles.cruiseAngle);
  updatePitchModeUI();
  renderDirectionLines();
});

function updateTrimModeUI() {
  trimModeToggle.hidden = currentChartPage !== 1;
  trimModeToggle.textContent = `紫六角形：${trimAutoMode ? (trimAutoReady ? '自動' : '自動（条件待ち）') : '手動'}`;
  trimModeToggle.setAttribute('aria-pressed', String(trimAutoMode));
  updateRotationLock();
}

trimModeToggle.addEventListener('click', () => {
  manualMessageChanges = { red: false, blue: false };
  manualLearningReference.TAB = trimAutoMode ? { blue: cruiseAngle } : {};
  trimAutoMode = !trimAutoMode;
  if (trimAutoMode) syncAutoTrimRotation();
  else applyCruiseRotation(manualTrimCruiseAngle);
  updateTrimModeUI();
  renderDirectionLines();
});

function showChartPage(page) {
  if (page < 0 || page >= chartNames.length || page === currentChartPage) return;
  saveRotation();
  manualMessageChanges = { red: false, blue: false };
  currentChartPage = page;
  dotOverlay.classList.toggle('trim-tab', page === 1);
  ({ hovAngle, cruiseAngle } = pageRotations[page]);
  if (page === 0 && pitchAutoMode) syncAutoPitchRotation();
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
  renderDirectionLines();
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
    const disabled = rotationLocked || (currentChartPage === 0 && pitchAutoMode)
      || (currentChartPage === 1 && trimAutoMode && handle.id === 'cruiseRotationHandle');
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
    const saved = JSON.parse(localStorage.getItem(DOT_STORAGE_KEY) || '[]');
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
    localStorage.setItem(DOT_STORAGE_KEY, JSON.stringify(dotSets));
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

function getLatestTrimSyncAngle() {
  for (let index = dotSets.length - 2; index >= 0; index -= 1) {
    const before = dotSets[index];
    const after = dotSets[index + 1];
    if (!before.blue || !after.blue) continue;
    if (!getSingleAdjustment(before, 'TAB')) continue;
    const adjustment = before.adjustments[0];
    const start = getDotCoordinates(before.blue);
    const end = getDotCoordinates(after.blue);
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
  const svgDocument = chartObject.contentDocument;
  if (svgDocument) {
    setGroupRotation(svgDocument.getElementById('hovGroup'), redAngle);
    setGroupRotation(svgDocument.getElementById('cruiseGroup'), blueAngle);
  }
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle, page: currentChartPage }, '*');
}

function syncAutoPitchRotation() {
  if (!pitchAutoMode) return;
  const nextAngles = { hovAngle, cruiseAngle };
  for (const [color, key] of [['red', 'hovAngle'], ['blue', 'cruiseAngle']]) {
    const angle = getLearnedRotation('LINK', color) ?? getLatestLinkSyncAngle(color);
    pitchAutoReady[color] = angle !== null;
    if (angle !== null) {
      autoPitchAngles[key] = angle;
      nextAngles[key] = autoPitchAngles[key];
    }
  }
  if (currentChartPage === 0) applyChartRotation(nextAngles.hovAngle, nextAngles.cruiseAngle);
  updatePitchModeUI();
}

function applyCruiseRotation(angle) {
  cruiseAngle = angle;
  const group = chartObject.contentDocument?.getElementById('cruiseGroup');
  if (group) setGroupRotation(group, angle);
  chartObject.contentWindow?.postMessage({ type: 'balance-chart-set-rotation', hovAngle, cruiseAngle: angle, page: currentChartPage }, '*');
}

function syncAutoTrimRotation() {
  if (!trimAutoMode) return;
  const angle = getLearnedRotation('TAB', 'blue') ?? getLatestTrimSyncAngle();
  trimAutoReady = angle !== null;
  if (angle !== null) autoTrimCruiseAngle = angle;
  if (currentChartPage === 1) applyCruiseRotation(autoTrimCruiseAngle);
  trimModeToggle.textContent = `紫六角形：${trimAutoReady ? '自動' : '自動（条件待ち）'}`;
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
    base: center,
    unit: { x: vector.x / Math.sqrt(vectorLengthSquared), y: vector.y / Math.sqrt(vectorLengthSquared) },
    maxTravel: Math.max(0, endT * Math.sqrt(vectorLengthSquared)),
    direction,
    number: segment.number,
    start: lineStart,
    end: arrowTip
  };
}

function getLatestPitchDistanceRatio() {
  // 隣接する結果だけを比較し、最新の算出可能な移動距離比を使う。
  for (let index = dotSets.length - 2; index >= 0; index -= 1) {
    const before = dotSets[index];
    const after = dotSets[index + 1];
    if (!getSingleAdjustment(before, 'LINK')) continue;
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

function getLearnedGuideLines(finalSet) {
  const type = currentChartPage === 0 ? 'LINK' : 'TAB';
  const automatic = currentChartPage === 0 ? pitchAutoMode : trimAutoMode;
  guidePredictionDebug = { type, fallback: true, reason: automatic ? 'insufficient-samples' : 'manual-mode' };
  if (!automatic || !finalSet) return null;
  // 既存の評価対象を維持する（TABは巡航のみ、LINKはHOVのみ／赤青ペア）。
  const colors = type === 'TAB' ? (finalSet.blue ? ['blue'] : [])
    : finalSet.red ? (finalSet.blue ? ['red', 'blue'] : ['red']) : [];
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
        const improvement = predictions.reduce((sum, prediction) => sum + prediction.improvement, 0);
        // 一方の改善で他方の悪化を相殺しない。線の延長ではなく実際の調整量の終点を評価する。
        const eligible = predictions.every(prediction => prediction.improvement >= -1e-6) && improvement > 1e-6;
        candidates.push({ type, blade, direction, amount, amountText, predictions, improvement, eligible,
          withinCenterThreshold: predictions.every(prediction => prediction.predictedDistance <= CENTER_DISTANCE_THRESHOLD),
          maxCenterDistance: Math.max(...predictions.map(prediction => prediction.predictedDistance)),
          distance: predictions.reduce((sum, prediction) => sum + prediction.predictedDistance, 0) });
      }
    }
  }
  const selected = candidates.filter(candidate => candidate.eligible).sort((first, second) =>
    Number(second.withinCenterThreshold) - Number(first.withinCenterThreshold)
    || first.maxCenterDistance - second.maxCenterDistance || first.distance - second.distance)[0];
  guidePredictionDebug = { type, fallback: false, reason: selected ? 'measured-vectors' : 'no-improving-candidate', selected, candidates };
  return selected ? selected.predictions.map(prediction => ({
    line: { base: prediction.start, start: prediction.start, end: prediction.position },
    color: prediction.color === 'red' ? DOT_COLORS.red : type === 'TAB' ? '#7b2cbf' : DOT_COLORS.blue,
    marker: `${prediction.color}DirectionLineArrow`
  })) : [];
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
  let selectedLines = getLearnedGuideLines(finalSet);
  if (selectedLines !== null) {
    // 学習済み候補が全て悪化する場合は、旧候補で上書きしない。
  } else if (currentChartPage === 1) {
    // トリムタブは巡航線だけを、矢印方向で到達できる中心距離で選ぶ。
    const selected = blueDots.sort((first, second) =>
      Number(second.line.centerDistance <= CENTER_DISTANCE_THRESHOLD) - Number(first.line.centerDistance <= CENTER_DISTANCE_THRESHOLD)
      || first.line.centerDistance - second.line.centerDistance)[0];
    if (!selected) return;
    selectedLines = [{ line: selected.line, color: '#7b2cbf', marker: 'blueDirectionLineArrow' }];
  } else if (redDots.length && !blueDots.length) {
    // 赤のみの場合はドットを起点に、矢印方向の線分上で中心に最も近い点を評価する。
    const centerDistance = (line) => {
      const dx = CHART_CENTER_X - line.base.x;
      const dy = CHART_CENTER_Y - line.base.y;
      const travel = Math.max(0, Math.min(line.maxTravel, dx * line.unit.x + dy * line.unit.y));
      return Math.hypot(dx - travel * line.unit.x, dy - travel * line.unit.y) / CHART_RADIUS;
    };
    const selected = redDots.map(({ line }) => ({ line, distance: centerDistance(line) }))
      .sort((first, second) =>
        Number(second.distance <= CENTER_DISTANCE_THRESHOLD) - Number(first.distance <= CENTER_DISTANCE_THRESHOLD)
        || first.distance - second.distance)[0];
    selectedLines = [{ line: selected.line, color: DOT_COLORS.red, marker: 'redDirectionLineArrow' }];
  } else {
    // 初期状態でもガイドを表示する。実測LINK比があれば固定比より優先する。
    const distanceRatio = getLatestPitchDistanceRatio() ?? { red: 1, blue: 2 };
    const candidates = redDots.flatMap((red) => blueDots
      .filter((blue) => red.line && blue.line
        && red.line.number === blue.line.number
        && red.line.direction === blue.line.direction)
      .map((blue) => ({
        redLine: red.line,
        blueLine: blue.line,
        guideDistances: getGuideDistances(red.line, blue.line, distanceRatio)
      })))
      .sort((first, second) => {
        return Number(second.guideDistances.withinCenterThreshold) - Number(first.guideDistances.withinCenterThreshold)
          || first.guideDistances.maxCenterDistance - second.guideDistances.maxCenterDistance
          || first.guideDistances.distance - second.guideDistances.distance;
      });
    // ピッチリンクは同番号・同UP/DOWNの赤青ペアを選ぶ。
    const selected = candidates[0];
    if (!selected) return;
    selectedLines = [
      { line: selected.redLine, color: DOT_COLORS.red, marker: 'redDirectionLineArrow' },
      { line: selected.blueLine, color: DOT_COLORS.blue, marker: 'blueDirectionLineArrow' }
    ];
  }

  appendDirectionArrowMarkers(guideLayer, currentChartPage === 1 ? '#7b2cbf' : DOT_COLORS.blue);
  selectedLines.forEach(({ line, color, marker }) => {
    // 範囲外では実際のドットから描画し、選択判定と既存の矢印先端は維持する。
    const start = Math.hypot(line.base.x - CHART_CENTER_X, line.base.y - CHART_CENTER_Y) > CHART_RADIUS
      ? line.base : line.start;
    const directionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    directionLine.setAttribute('class', 'guide-direction-line');
    directionLine.setAttribute('x1', String(start.x));
    directionLine.setAttribute('y1', String(start.y));
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
  confirmDeletion('自動補正の学習値だけを初期化しますか？測定結果・調整量・設定は残ります。', () => {
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
  const target = selectedAdjustmentTarget ?? dotSets.at(-1);
  adjustmentTarget.replaceChildren();
  adjustmentTarget.disabled = !dotSets.length;
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
  selectedAdjustmentTarget = dotSets[Number(adjustmentTarget.value)] ?? null;
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
}

function startResultEdit(set) {
  if (!dotSets.includes(set)) return;
  cancelEditing();
  if (cruiseAdditionTarget) finishCruiseAddition();
  resultEdit = { set, draft: [...redInputs, ...blueInputs].map(input => input.value) };
  [set.red, set.blue].forEach((dot, index) => {
    const values = dot ? [...dot.clock.split(':'), String(dot.radius)] : ['', '', ''];
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
  if (!dotSets.includes(set) || !set.adjustments?.includes(adjustment)) return;
  cancelEditing();
  if (cruiseAdditionTarget) finishCruiseAddition();
  adjustmentEdit = { set, adjustment, draft: [...memoValues], draftTarget: selectedAdjustmentTarget };
  memoValues.splice(0, 4, ...Array.from({ length: 4 }, (_, index) => adjustment[index] || ''));
  selectedAdjustmentTarget = set;
  updateMemoButtons();
  updateAdjustmentTarget();
  updateEditingUI();
  adjustmentForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
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

function renderDots() {
  learning.sync(dotSets, {
    LINK: {
      red: pitchAutoMode && pitchAutoReady.red ? autoPitchAngles.hovAngle : manualPitchAngles.hovAngle,
      blue: pitchAutoMode && pitchAutoReady.blue ? autoPitchAngles.cruiseAngle : manualPitchAngles.cruiseAngle
    },
    TAB: { red: pageRotations[1].hovAngle, blue: trimAutoMode ? autoTrimCruiseAngle : manualTrimCruiseAngle }
  });
  syncAutoPitchRotation();
  syncAutoTrimRotation();
  if ((resultEdit && !dotSets.includes(resultEdit.set)) ||
      (adjustmentEdit && (!dotSets.includes(adjustmentEdit.set) || !adjustmentEdit.set.adjustments?.includes(adjustmentEdit.adjustment)))) cancelEditing();
  updateEditingUI();
  updateAdjustmentTarget();
  updateCruiseAdditionUI();
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
      dotLabel.textContent = `${dot.color === 'red' ? 'HOV' : '巡航'} ${dot.radius} ${dot.clock}`;
      label.append(dotLabel);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `セット${index + 1}を削除`);
    remove.addEventListener('click', () => confirmDeletion(`結果${index + 1}を削除しますか？`, () => { dotSets.splice(index, 1); saveDotSets(); renderDots(); }));
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
      attachEditAction(adjustmentRow, 'この調整量を編集しますか？', () => startAdjustmentEdit(set, adjustment));
      const adjustmentLabel = document.createElement('span');
      adjustmentLabel.className = 'dot-memo';
      adjustmentLabel.textContent = `調整量: ${adjustment.map((value, fieldIndex) => formatMemoValue(value, fieldIndex, adjustment[1])).join(' ／ ')}`;
      const deleteAdjustment = document.createElement('button');
      deleteAdjustment.type = 'button';
      deleteAdjustment.textContent = '削除';
      deleteAdjustment.setAttribute('aria-label', `結果${index + 1}の調整量${adjustmentIndex + 1}を削除`);
      deleteAdjustment.addEventListener('click', () => confirmDeletion(`結果${index + 1}の調整量${adjustmentIndex + 1}を削除しますか？`, () => { set.adjustments.splice(adjustmentIndex, 1); saveDotSets(); renderDots(); }));
      adjustmentRow.append(adjustmentLabel, deleteAdjustment);
      item.append(adjustmentRow);
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
      circle.classList.add(`chart-dot-${dot.color}`);
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

}

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

  dotSets.push({ learningId: newLearningId(), red, blue, adjustments: [] });
  selectedAdjustmentTarget = null;
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
  const targetSet = dotSets.includes(selectedAdjustmentTarget) ? selectedAdjustmentTarget : dotSets.at(-1);
  if (adjustmentEdit) {
    const { set, adjustment } = adjustmentEdit;
    const index = set.adjustments?.indexOf(adjustment) ?? -1;
    if (!dotSets.includes(set) || index < 0) { cancelEditing(); return; }
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
  targetSet.adjustments ??= [];
  targetSet.adjustments.push([...memoValues]);
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
    if (rotationChanged) recordManualLearning(activeRotation.name === 'hov' ? 'red' : 'blue', activeRotation.name === 'hov' ? hovAngle : cruiseAngle);
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
        || (currentChartPage === 1 && trimAutoMode && state.name === 'cruise')
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
  if (message?.type === 'balance-chart-rotation'
    && Number.isFinite(message.hovAngle) && Number.isFinite(message.cruiseAngle)) {
    if ((currentChartPage === 0 && pitchAutoMode) || (currentChartPage === 1 && trimAutoMode)) return;
    manualMessageChanges.red ||= hovAngle !== message.hovAngle;
    manualMessageChanges.blue ||= cruiseAngle !== message.cruiseAngle;
    if (message.finished) {
      if (manualMessageChanges.red) recordManualLearning('red', message.hovAngle);
      if (manualMessageChanges.blue) recordManualLearning('blue', message.cruiseAngle);
      manualMessageChanges = { red: false, blue: false };
    }
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
    dotOverlay.setAttribute('viewBox', message.viewBox);
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
