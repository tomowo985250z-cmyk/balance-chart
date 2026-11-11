/* 確定履歴の最新1件だけを、通常の調整ロックを外さずに更新する。 */
const confirmedEditDialog = document.getElementById('confirmedAdjustmentEditor');
const confirmedEditForm = document.getElementById('confirmedAdjustmentEditForm');
const confirmedEditType = document.getElementById('confirmedEditType');
const confirmedEditBlade = document.getElementById('confirmedEditBlade');
const confirmedEditDirection = document.getElementById('confirmedEditDirection');
const confirmedEditAmount = document.getElementById('confirmedEditAmount');
const confirmedEditError = document.getElementById('confirmedEditError');
let editingConfirmedAdjustment = null;

function latestConfirmedEditRecord() {
  if (adjustmentSequence?.stages.length) return adjustmentSequence.stages.at(-1);
  const source = dotSets.findLast(set => set.adjustments?.length);
  if (!source) return null;
  const values = source.adjustments.at(-1);
  return { targetId: source.learningId, actionIndex: source.adjustments.length - 1, values: [...values],
    page: values[1] === 'LINK' ? 0 : 1, rank: 0, guideBlade: values[0], actualAdjustment: false,
    origins: getOriginSnapshot(source), rotations: structuredClone(pageRotations), legacy: true };
}

function isLatestRecordedAdjustment(source, adjustment) {
  const latest = latestConfirmedEditRecord();
  return latest?.targetId === source?.learningId && source.adjustments?.indexOf(adjustment) === latest.actionIndex;
}

function isCurrentConfirmedEdit(confirmed) {
  const latest = latestConfirmedEditRecord();
  return confirmed && (confirmed === latest || (confirmed.legacy && latest?.legacy
    && confirmed.targetId === latest.targetId && confirmed.actionIndex === latest.actionIndex
    && JSON.stringify(confirmed.values) === JSON.stringify(latest.values)));
}

function appendLatestConfirmedEditButton(row, source, actionIndex) {
  const confirmed = latestConfirmedEditRecord();
  if (confirmed?.targetId !== source.learningId || confirmed.actionIndex !== actionIndex) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'edit-confirmed-adjustment'; button.textContent = '編集';
  button.addEventListener('click', () => openLatestConfirmedEdit(confirmed));
  row.append(button);
}

function updateConfirmedEditAmounts(selected = confirmedEditAmount.value) {
  const type = confirmedEditType.value;
  const amounts = type === 'LINK' ? ['3','2','1','3/4','2/3','1/2','1/3','1/4','1/8'] : ['3','2','1'];
  confirmedEditAmount.replaceChildren(...amounts.map(value => new Option(value, value)));
  confirmedEditAmount.value = amounts.includes(selected) ? selected : type === 'LINK' ? '1/4' : '1';
  document.getElementById('confirmedEditUnit').textContent = type === 'LINK' ? 'フラット' : '度';
}

function openLatestConfirmedEdit(confirmed) {
  if (appStorage.readOnly || !isCurrentConfirmedEdit(confirmed)) return;
  editingConfirmedAdjustment = confirmed;
  confirmedEditType.value = confirmed.values[1];
  for (const option of confirmedEditType.options) {
    const other = getSequenceStage(option.value === 'LINK' ? 0 : 1);
    option.disabled = Boolean(other && other !== confirmed);
  }
  confirmedEditBlade.value = confirmed.values[0];
  confirmedEditDirection.value = confirmed.values[3];
  updateConfirmedEditAmounts(confirmed.values[2]);
  confirmedEditError.textContent = '';
  confirmedEditDialog.showModal();
}

confirmedEditType.addEventListener('change', () => updateConfirmedEditAmounts());
document.getElementById('cancelConfirmedEdit').addEventListener('click', () => confirmedEditDialog.close());
confirmedEditDialog.addEventListener('close', () => { editingConfirmedAdjustment = null; });

// 編集によって、取得済みの学習記録・取得前に保存した予測を遡って書き換えない。
// 未取得の次の実測が登録された後は、修正した実際の調整条件で従来の処理に進む。
function getConfirmedEditLearningSets() {
  const stages = adjustmentSequence?.stages.filter(stage => stage.learningValues) ?? [];
  if (!stages.length) return dotSets;
  return dotSets.map((set, index) => {
    const frozen = stages.filter(stage => stage.targetId === set.learningId
      && (stage.learningAfterId || !dotSets[index + 1]));
    if (!frozen.length) return set;
    const adjustments = set.adjustments.map(values => [...values]);
    frozen.forEach(stage => { adjustments[stage.actionIndex] = [...stage.learningValues]; });
    return { ...set, adjustments };
  });
}

function clearConfirmedEditLearningValues(targetId = null) {
  adjustmentSequence?.stages.forEach(stage => {
    if (targetId && stage.targetId !== targetId) return;
    delete stage.learningValues;delete stage.learningAfterId;
  });
}

function calculateEditedConfirmedForecast(confirmed, values) {
  const source = dotSets.find(set => set.learningId === confirmed.targetId);
  const action = BalanceLearning.adjustment(values);
  if (!source || !action) return null;
  const start = confirmed.origins ? { ...source, red: confirmed.origins.red?.dot, blue: confirmed.origins.blue?.dot } : source;
  const previous = { page: currentChartPage, hovAngle, cruiseAngle };
  const page = action.type === 'LINK' ? 0 : 1;
  const rotations = confirmed.rotations ?? pageRotations;
  const guides = {}, points = [];
  try {
    currentChartPage = page;
    ({ hovAngle, cruiseAngle } = rotations[page]);
    const primary = action.type === 'TAB' ? (start.blue ? 'blue' : 'red') : 'red';
    const automatic = page === 0 ? pitchAutoMode : trimAutoMode;
    const learnedGuides = automatic && start[primary] && getLearnedRotation(action.type, primary) !== null;
    const samples = learning.inspect().samples;
    for (const color of ['red','blue']) {
      if (!start[color]) continue;
      const origin = getDotCoordinates(start[color]);
      const prediction = learning.predict(action.type, color, action.blade, action.direction, action.amount, origin);
      const estimate = resolveDisplayDistance(action, color, prediction, prediction ? [] : samples);
      const useLearned = learnedGuides && (action.type === 'LINK' || color === 'blue' || !start.blue);
      const line = useLearned && prediction ? getPredictionGuideLine({ start: origin, ...prediction })
        : getDirectionLine(start[color], color, null, action.blade, action.direction);
      if (!line || !estimate || !Number.isFinite(estimate.distance)) return null;
      const unit = getGuideMovementUnit(line);
      const x = origin.x + unit.x * estimate.distance, y = origin.y + unit.y * estimate.distance;
      if (![x,y].every(Number.isFinite)) return null;
      guides[color] = structuredClone(line);
      points.push({ color, x, y, distance: estimate.distance, ...estimate });
    }
    if (!points.length) return null;
    return { forecast: { targetId: source.learningId, type: action.type, values: [...values],
      phase: 'fixed', points, waiting: [], manualBlade: false, manualDirection: true }, guides };
  } finally {
    currentChartPage = previous.page; hovAngle = previous.hovAngle; cruiseAngle = previous.cruiseAngle;
  }
}

function renderEditedConfirmedGuides(confirmed) {
  const layer = dotOverlay.querySelector('.direction-lines');
  if (!layer) return;
  layer.replaceChildren();layer.style.opacity = '';
  appendDirectionArrowMarkers(layer);
  forecastGuides = {};
  for (const [color, line] of Object.entries(confirmed.editedGuides)) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const from = Math.hypot(line.base.x - CHART_CENTER_X, line.base.y - CHART_CENTER_Y) > CHART_RADIUS ? line.base : line.start;
    const end = line.displayEnd ?? line.end;
    for (const [name,value] of Object.entries({ class:'guide-direction-line', x1:from.x, y1:from.y, x2:end.x, y2:end.y,
      stroke:DOT_COLORS[color], 'stroke-width':1.8, 'stroke-dasharray':'9 7', 'marker-end':`url(#${color}DirectionLineArrow)` })) node.setAttribute(name,String(value));
    layer.append(node);guideDisplayGeometry.set(node,line);
    forecastGuides[color] = { targetId:confirmed.targetId, type:confirmed.values[1], blade:Number(confirmed.values[0]),
      direction:confirmed.values[3], unit:getGuideMovementUnit(line) };
  }
  updateGuideViewportEnds();
}

confirmedEditForm.addEventListener('submit', event => {
  event.preventDefault();
  const confirmed = editingConfirmedAdjustment;
  if (appStorage.readOnly || !isCurrentConfirmedEdit(confirmed)) return;
  const source = dotSets.find(set => set.learningId === confirmed.targetId);
  if (!source || JSON.stringify(source.adjustments[confirmed.actionIndex]) !== JSON.stringify(confirmed.values)) return;
  const values = [confirmedEditBlade.value, confirmedEditType.value, confirmedEditAmount.value, confirmedEditDirection.value];
  const page = values[1] === 'LINK' ? 0 : 1;
  const other = getSequenceStage(page);
  if (other && other !== confirmed) {
    confirmedEditError.textContent = 'この方式は確定済みです。現在の調整方式で編集してください。';return;
  }
  const calculation = calculateEditedConfirmedForecast(confirmed, values);
  if (!calculation) {
    confirmedEditError.textContent = '起点がある項目すべての予測を算出できる調整を選択してください。';return;
  }
  if (confirmed.legacy) {
    delete confirmed.legacy;
    adjustmentSequence = { targetId:source.learningId, currentTargetId:dotSets.at(-1).learningId,
      measurements:getMeasurementSignature(source), stages:[confirmed], active:{}, flow:true, draft:null };
  }
  if (!confirmed.learningValues || (!confirmed.learningAfterId && dotSets[dotSets.indexOf(source) + 1])) {
    confirmed.learningValues = [...confirmed.values];
    confirmed.learningAfterId = dotSets[dotSets.indexOf(source) + 1]?.learningId ?? null;
  }
  const activeIndex = adjustmentSequence.stages.indexOf(confirmed);
  const locked = adjustmentSequence.active[confirmed.page] === activeIndex;
  if (locked) { delete adjustmentSequence.active[confirmed.page]; adjustmentSequence.active[page] = activeIndex; }
  source.adjustments[confirmed.actionIndex] = [...values];
  confirmed.page = page; confirmed.values = [...values]; confirmed.rank = 0; confirmed.guideBlade = values[0];
  confirmed.forecast = calculation.forecast; confirmed.editedGuides = calculation.guides;
  saveConfirmedCarry(confirmed);
  adjustmentSequence.draft = null;forecastDisplayCache.clear();
  adjustmentLock = getSequenceStage();
  adjustmentForecast = adjustmentLock ? structuredClone(adjustmentLock.forecast) : null;
  confirmedEditDialog.close();
  saveDotSets();
  if (locked) showChartPage(page);
  updateMemoButtons();renderDots();renderDirectionLines();updatePitchModeUI();updateTrimModeUI();
  globalThis.balanceFlushState?.();
});
