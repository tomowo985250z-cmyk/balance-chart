console.log("app.js loaded");
let hovAngle = 0;
let cruiseAngle = 0;
let rotationLocked = false;
let rotationHandles = [];

const CHART_CENTER_X = 397;
const CHART_CENTER_Y = 520;
const CHART_RADIUS = 240;
const chartObject = document.querySelector('object[data="chart.svg"]');
const chartWrap = document.querySelector('.chart-wrap');
const rotationLock = document.getElementById('rotationLock');
const dotForm = document.getElementById('dotForm');
const redInputs = ['redHourInput', 'redMinuteInput', 'redValueInput'].map((id) => document.getElementById(id));
const blueInputs = ['blueHourInput', 'blueMinuteInput', 'blueValueInput'].map((id) => document.getElementById(id));
const addDotButton = document.getElementById('addDotButton');
const dotMessage = document.getElementById('dotMessage');
const dotList = document.getElementById('dotList');
const dotSets = [];

const DOT_COLORS = { red: '#d60000', blue: '#0066ff' };
const DOT_STORAGE_KEY = 'balance-chart-dot-sets-v1';

function updateRotationLock() {
  rotationLocked = rotationLock.checked;
  chartWrap.classList.toggle('is-rotation-locked', rotationLocked);
  const svg = chartObject.contentDocument?.documentElement;
  if (svg) svg.dataset.rotationLocked = String(rotationLocked);
  rotationHandles.forEach((handle) => {
    handle.style.pointerEvents = rotationLocked ? 'none' : 'stroke';
    handle.setAttribute('pointer-events', rotationLocked ? 'none' : 'stroke');
    handle.style.cursor = rotationLocked ? 'default' : 'grab';
  });
}

rotationLock.addEventListener('change', updateRotationLock);
rotationLock.addEventListener('input', updateRotationLock);

function getStoredDot(dot, color) {
  if (!dot || dot.color !== color || !Number.isFinite(dot.angle) || !Number.isFinite(dot.radius)
    || dot.radius < 0 || dot.radius > 1 || typeof dot.clock !== 'string') return null;
  return { clock: dot.clock, angle: dot.angle, radius: dot.radius, color };
}

function loadDotSets() {
  try {
    const saved = JSON.parse(localStorage.getItem(DOT_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];

    return saved.reduce((sets, set) => {
      const restored = {
        red: getStoredDot(set?.red, 'red'),
        blue: getStoredDot(set?.blue, 'blue')
      };
      const currentCount = sets.reduce((count, item) => count + Number(Boolean(item.red)) + Number(Boolean(item.blue)), 0);
      const setCount = Number(Boolean(restored.red)) + Number(Boolean(restored.blue));
      if (setCount && currentCount + setCount <= 10) sets.push(restored);
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
    || hours < 0 || hours > 12 || minutes < 0 || minutes > 59 || radius < 0 || radius > 1
    || (hours === 12 && minutes !== 0)) return null;

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

function renderDots() {
  dotList.replaceChildren(...dotSets.map((set, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const values = [set.red, set.blue].filter(Boolean).map((dot) => `${dot.color === 'red' ? '赤' : '青'} ${dot.clock} ${dot.radius}`);
    label.textContent = `${index + 1}: ${values.join(' ／ ')}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `セット${index + 1}を削除`);
    remove.addEventListener('click', () => { dotSets.splice(index, 1); saveDotSets(); renderDots(); });
    item.append(label, remove);
    return item;
  }));

  const isFull = getDotCount() >= 10;
  addDotButton.disabled = isFull;
  if (isFull) dotMessage.textContent = 'ドットは最大10個まで追加できます。削除すると追加できます。';
  else if (dotMessage.textContent.startsWith('ドットは最大10個')) dotMessage.textContent = '';

  // ドットを chart.svg 内に描くことで、拡大・パン時の viewBox と必ず同じ座標系になる。
  const dotLayer = chartObject.contentDocument?.getElementById('dotLayer');
  if (!dotLayer) return;
  dotLayer.replaceChildren();
  dotSets.forEach((set, index) => {
    [set.red, set.blue].filter(Boolean).forEach((dot) => {
      const angle = dot.angle * Math.PI / 180;
      const x = CHART_CENTER_X + dot.radius * CHART_RADIUS * Math.sin(angle);
      const y = CHART_CENTER_Y - dot.radius * CHART_RADIUS * Math.cos(angle);
      const circle = dotLayer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', DOT_COLORS[dot.color]);
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
      circle.style.pointerEvents = 'none';
      dotLayer.append(circle);

      const label = dotLayer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x + 9));
      label.setAttribute('y', String(y - 9));
      label.setAttribute('fill', DOT_COLORS[dot.color]);
      label.setAttribute('font-family', "Arial, 'Noto Sans JP', sans-serif");
      label.setAttribute('font-size', '14');
      label.setAttribute('font-weight', '700');
      label.setAttribute('stroke', '#ffffff');
      label.setAttribute('stroke-width', '3');
      label.setAttribute('paint-order', 'stroke');
      label.style.pointerEvents = 'none';
      label.textContent = String(index + 1);
      dotLayer.append(label);
    });
  });

}

dotForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (getDotCount() >= 10) {
    dotMessage.textContent = 'ドットは最大10個まで追加できます。';
    return;
  }

  const red = readDotInput(redInputs, 'red');
  const blue = readDotInput(blueInputs, 'blue');
  if (red === undefined || blue === undefined || (!red && !blue)) {
    dotMessage.textContent = '赤または青の、時（0〜12）・分（0〜59）・数値（0〜1）をすべて入力してください。';
    return;
  }

  if (getDotCount() + Number(Boolean(red)) + Number(Boolean(blue)) > 10) {
    dotMessage.textContent = 'ドットは最大10個です。このセットを追加するには、先にドットを削除してください。';
    return;
  }

  dotSets.push({ red, blue });
  saveDotSets();
  [...redInputs, ...blueInputs].forEach((input) => { input.value = ''; });
  dotMessage.textContent = '';
  renderDots();

  redInputs[0].focus();
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

  renderDots();

  // 回転用リング以外では、モバイルの縦スクロールを優先する。
  svg.style.touchAction = 'pan-y';

  const groups = [
    { group: hovGroup, handle: hovHandle, name: 'hov' },
    { group: cruiseGroup, handle: cruiseHandle, name: 'cruise' }
  ];
  let activeRotation = null;

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

    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }

    activeRotation.handle.style.cursor = 'grab';
    activeRotation = null;
  }

  groups.forEach((state) => {
    state.handle.addEventListener('pointerdown', (event) => {
      const isZoomed = Number(svg.viewBox.baseVal.width) < 794;
      if (rotationLocked || rotationLock.checked || svg.dataset.pinching === 'true' || isZoomed) {
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();

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
    const angle = activeRotation.startGroupAngle + getPointerAngle(event) - activeRotation.startPointerAngle;

    if (activeRotation.name === 'hov') {
      hovAngle = angle;
    } else {
      cruiseAngle = angle;
    }

    setGroupRotation(activeRotation.group, angle);
  });

  svg.addEventListener('pointerup', finishRotation);
  svg.addEventListener('pointercancel', finishRotation);
}

renderDots();

if (chartObject.contentDocument) {
  setupRotationControls();
} else {
  chartObject.addEventListener('load', setupRotationControls, { once: true });
}
