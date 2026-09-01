console.log("app.js loaded");
let hovAngle = 0;
let cruiseAngle = 0;

const CHART_CENTER_X = 397;
const CHART_CENTER_Y = 520;
const CHART_RADIUS = 240;
const chartObject = document.querySelector('object[data="chart.svg"]');
const dotOverlay = document.getElementById('dotOverlay');
const dotForm = document.getElementById('dotForm');
const hourInput = document.getElementById('hourInput');
const minuteInput = document.getElementById('minuteInput');
const valueInput = document.getElementById('valueInput');
const dotColor = document.getElementById('dotColor');
const addDotButton = document.getElementById('addDotButton');
const dotMessage = document.getElementById('dotMessage');
const dotList = document.getElementById('dotList');
const dots = [];

const DOT_COLORS = { red: '#d60000', blue: '#0066ff' };

function parseDotInput(hourValue, minuteValue, value) {
  const hours = Number(hourValue);
  const minutes = Number(minuteValue);
  const radius = Number(String(value).replace(',', '.'));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isFinite(radius)
    || hours < 0 || hours > 12 || minutes < 0 || minutes > 59 || radius < 0 || radius > 1
    || (hours === 12 && minutes !== 0)) return null;

  return { clock: `${hours}:${String(minutes).padStart(2, '0')}`, angle: (hours % 12) * 30 + minutes * 0.5, radius };
}

function renderDots() {
  dotList.replaceChildren(...dots.map((dot, index) => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = DOT_COLORS[dot.color];
    const label = document.createElement('span');
    label.textContent = `${dot.clock}  ${dot.radius}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `${label.textContent} のドットを削除`);
    remove.addEventListener('click', () => { dots.splice(index, 1); renderDots(); });
    item.append(swatch, label, remove);
    return item;
  }));

  const isFull = dots.length >= 10;
  addDotButton.disabled = isFull;
  if (isFull) dotMessage.textContent = 'ドットは最大10個まで追加できます。削除すると追加できます。';
  else if (dotMessage.textContent.startsWith('ドットは最大10個')) dotMessage.textContent = '';

  dotOverlay.replaceChildren();
  dots.forEach((dot) => {
    const angle = dot.angle * Math.PI / 180;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CHART_CENTER_X + dot.radius * CHART_RADIUS * Math.sin(angle)));
    circle.setAttribute('cy', String(CHART_CENTER_Y - dot.radius * CHART_RADIUS * Math.cos(angle)));
    circle.setAttribute('r', '6');
    circle.setAttribute('fill', DOT_COLORS[dot.color]);
    circle.setAttribute('stroke', '#ffffff');
    circle.setAttribute('stroke-width', '2');
    circle.style.pointerEvents = 'none';
    dotOverlay.append(circle);
  });

}

dotForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (dots.length >= 10) {
    dotMessage.textContent = 'ドットは最大10個まで追加できます。';
    return;
  }

  const parsed = parseDotInput(hourInput.value, minuteInput.value, valueInput.value);
  if (!parsed) {
    dotMessage.textContent = '時計角は時（0〜12）・分（0〜59）、数値は0〜1で入力してください。';
    return;
  }

  dots.push({ ...parsed, color: dotColor.value });
  hourInput.value = '';
  minuteInput.value = '';
  valueInput.value = '';
  dotMessage.textContent = '';
  renderDots();
  hourInput.focus();
});

function setGroupRotation(group, angle) {
  group.setAttribute('transform', `rotate(${angle} ${CHART_CENTER_X} ${CHART_CENTER_Y})`);
}

function setupRotationControls() {
  const svg = chartObject.contentDocument?.documentElement;
  const hovGroup = chartObject.contentDocument?.getElementById('hovGroup');
  const cruiseGroup = chartObject.contentDocument?.getElementById('cruiseGroup');

  if (!svg || !hovGroup || !cruiseGroup) return;

  renderDots();

  svg.style.touchAction = 'none';

  const groups = [
    { group: hovGroup, name: 'hov' },
    { group: cruiseGroup, name: 'cruise' }
  ];
  let activeRotation = null;

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

    activeRotation.group.style.cursor = 'grab';
    activeRotation = null;
  }

  groups.forEach((state) => {
    state.group.addEventListener('pointerdown', (event) => {
      event.preventDefault();

      activeRotation = {
        ...state,
        pointerId: event.pointerId,
        startPointerAngle: getPointerAngle(event),
        startGroupAngle: state.name === 'hov' ? hovAngle : cruiseAngle
      };

      svg.setPointerCapture(event.pointerId);
      state.group.style.cursor = 'grabbing';
    });
  });

  svg.addEventListener('pointermove', (event) => {
    if (!activeRotation || event.pointerId !== activeRotation.pointerId) return;

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

if (chartObject.contentDocument) {
  setupRotationControls();
} else {
  chartObject.addEventListener('load', setupRotationControls, { once: true });
}
