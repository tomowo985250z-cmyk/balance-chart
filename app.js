console.log("app.js loaded");
let hovAngle = 0;
let cruiseAngle = 0;

const CHART_CENTER_X = 397;
const CHART_CENTER_Y = 520;
const chartObject = document.querySelector('object[data="chart.svg"]');

function setGroupRotation(group, angle) {
  group.setAttribute('transform', `rotate(${angle} ${CHART_CENTER_X} ${CHART_CENTER_Y})`);
}

function setupRotationControls() {
  const svg = chartObject.contentDocument?.documentElement;
  const hovGroup = chartObject.contentDocument?.getElementById('hovGroup');
  const cruiseGroup = chartObject.contentDocument?.getElementById('cruiseGroup');

  if (!svg || !hovGroup || !cruiseGroup) return;

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
