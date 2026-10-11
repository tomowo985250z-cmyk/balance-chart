/* 専用ブラウザプロファイルで ?isolated=1 を指定する。 */
(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const trace = [], frames = [];
  const assert = (ok, message) => { if (!ok) throw Error(message); checks++; };
  const near = (a, b) => Math.abs(a - b) < 1e-8;
  const canonical = value => JSON.stringify(value, function(key, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])) : item;
  });
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nativeNote = localStorage.getItem('balance-chart-note-v1');
  const nativeSnapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
  async function load(src) {
    const frame = document.createElement('iframe'); frames.push(frame);
    frame.style.cssText = 'width:1000px;height:1800px';
    const ready = new Promise(resolve => { frame.onload = resolve; });
    frame.src = src; document.body.append(frame); await ready;
    return frame;
  }
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Isolated browser profile required');
    const original = await load('../index.html');
    const runOriginal = code => original.contentWindow.eval(code);
    const source = runOriginal('selectLinkGuideCandidate.toString()');
    localStorage.setItem('balance-chart-note-v1', 'native-store-sentinel');
    const host = await load('link-ranking-trial.html');
    for (let i = 0; i < 150 && !host.contentWindow.linkTrialHost?.ready; i++) await pause(100);
    assert(host.contentWindow.linkTrialHost.ready, 'isolated app starts successfully');
    const trial = host.contentDocument.getElementById('app');
    const run = code => trial.contentWindow.eval(code);
    assert(run('typeof linkRankingTrial')==='object','trial adapter fully loaded');
    assert(run('linkRankingTrial.mode') === 'target', 'test environment defaults to new mode');
    assert(run('localStorage === linkTrialMemoryStorage'), 'storage isolated before application initialization');
    assert(run('appStorage.getItem("balance-chart-note-v1")') === null, 'production data never read into trial');
    assert(runOriginal('typeof linkRankingTrial') === 'undefined', 'normal index never loads trial adapter');
    assert(run('linkRankingTrial.legacySelector===LinkRankingLegacy'), 'legacy comparison uses frozen test-only selector');
    const modeControl = host.contentDocument.getElementById('mode');
    for (const mode of ['legacy','target20','target']) {
      modeControl.value = mode; modeControl.dispatchEvent(new Event('change'));
      assert(run('linkRankingTrial.mode')===mode,'visible mode switch selects '+mode);
    }
    assert(run('linkRankingTrial.report.predictionTarget')===.18,'trial defaults to provisional 0.18 prediction target');
    await pause(100);
    const nativeBefore = nativeSnapshot();
    const predictSource = run('learning.predict.toString()'), resolveSource = run('BalanceDistancePrior.resolve.toString()');
    const immutable = () => run(`JSON.stringify({measurements:dotSets,learning:learning.inspect(),
      records:BalanceState.keys.map(key=>appStorage.getItem(key)),
      predictions:[1,2,3].flatMap(blade=>['UP','DOWN'].flatMap(direction=>['red','blue'].map(color=>
        learning.predict('LINK',color,blade,direction,.25,{x:500,y:600}))))})`);
    const signature = () => run(`JSON.stringify({memo:memoValues,choices:guideNumberChoices.map(c=>[c.blade,c.candidate?.direction,c.candidate?.amountText]),
      guides:forecastGuides,forecast:adjustmentForecast})`);
    const setup = (count, blue = true, hov = .19) => run(`
      learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
      selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;pitchAutoMode=true;
      adjustmentSelections.forEach(values=>values.fill(''));
      memoValues.splice(0,4,'1','LINK','1/4','UP'); updateMemoButtons();
      applyChartRotation(${count>1?0:-41},${count>1?0:-60});
      const makeTrialDot=(x,y,color)=>({color,clock:'synthetic',radius:Math.hypot(x-397,y-520)/240,
        angle:Math.atan2(x-397,520-y)*180/Math.PI});
      for(let i=0;i<${count};i++){
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),
          red:${count>1?"makeTrialDot(597+("+count+"-1-i)*80,620+("+count+"-1-i)*46.188,'red')":`{radius:${hov},angle:${hov===.32?100:112.5},color:'red',clock:'synthetic'}`},
          blue:${blue?count>1?"makeTrialDot(527+("+count+"-1-i)*46,670+("+count+"-1-i)*38.6,'blue')":"{radius:.33,angle:165,color:'blue',clock:'synthetic'}":"undefined"},
          adjustments:i<${count}-1?[['1','LINK','1','UP']]:[]});
        learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      setGuidesVisible(true); renderDots();
    `);
    const validateDisplay = label => {
      const result = run(`({selected:linkRankingTrial.report.selected,points:adjustmentForecast?.points??[],
        memo:[...memoValues],amount:getSharedAdjustmentAmount(0),notice:document.getElementById('trialPredictionUncertainty').textContent})`);
      assert(Boolean(result.selected), label + ': selected evaluated candidate');
      assert(result.selected.amountText === result.amount && result.memo[2] === result.amount, label + ': evaluated amount matches shared and displayed amount');
      for (const p of result.selected.predictions) {
        const point = result.points.find(item => item.color === p.color);
        assert(p.position ? Boolean(point) && near(p.position.x, point.x) && near(p.position.y, point.y) : !point,
          label + '/' + p.color + ': ranked endpoint equals existing forecast coordinates');
      }
      if (result.selected.predictions.some(p => p.source !== 'learned')) assert(result.notice.includes('予測不確実'), label + ': uncertainty visible beside forecast');
    };
    for (const fixture of [ {label:'unlearned/HOV .19',count:1,hov:.19}, {label:'unlearned/HOV .32',count:1,hov:.32},
      {label:'one sample',count:2}, {label:'both learned',count:4}, {label:'Cruise unmeasured/learned HOV',count:4,blue:false} ]) {
      setup(fixture.count,fixture.blue!==false,fixture.hov??.19);
      run("linkRankingTrial.setMode('legacy')");
      const old = signature(), data = immutable();
      run("linkRankingTrial.setMode('target')");
      assert(immutable() === data, fixture.label + ': ranking switch preserves learning, prediction outputs, measurement records');
      validateDisplay(fixture.label);
      const report = run('linkRankingTrial.report');
      trace.push({label:fixture.label,rows:report.rows,uncertain:report.actual.uncertain});
      const next = report.rows[1].assessment, previous = report.rows[0].assessment;
      assert(report.rows.length===9,fixture.label+': prediction targets and alternatives shown separately');
      assert(run('linkRankingTrial.report.rawSelected')?.blade===report.selected.blade,fixture.label+': diagnostic alternatives do not replace active selection');
      if (previous.nominalGoalMet) {
        assert(next.nominalGoalMet, fixture.label + ': no loss of achievable endpoint goal on identical pool');
        assert(next.maximum <= previous.maximum + 1e-9, fixture.label + ': maximum center distance does not worsen among achieved candidates');
        if (near(next.maximum,previous.maximum)) assert(next.total<=previous.total+1e-9,fixture.label+': equal maximum breaks by total');
      }
      for (const rank of [1,2,0]) {
        run(`while(guideCandidateIndex!==${rank})guideCandidateToggle.click()`);
        validateDisplay(fixture.label + '/No rank ' + rank);
        assert(immutable() === data, fixture.label + ': No switch leaves models and records unchanged');
      }
      run("linkRankingTrial.setMode('legacy')");
      assert(signature() === old, fixture.label + ': old -> new -> old restores exact choices, guides and prediction endpoints');
      run("memoValues[2]='1/2';updateMemoButtons();updateAdjustmentForecast()");
      assert(run('linkRankingTrial.report.notice.includes("調整量1/2")'),'legacy comparison updates when displayed amount changes');
      run("memoValues[2]='1/4';updateMemoButtons();updateAdjustmentForecast()");
      run("linkRankingTrial.setMode('target')");
      const target18Signature=signature();
      run("linkRankingTrial.setMode('target20')");
      assert(run('linkRankingTrial.report.predictionTarget')===.2,fixture.label+': visible 0.2 target selected');
      assert(immutable()===data,fixture.label+': prediction target switch preserves learning and existing predictions');
      run("linkRankingTrial.setMode('target')");
      assert(signature()===target18Signature,fixture.label+': 0.18 -> 0.2 -> 0.18 restores exact displayed result');
      for (const amount of ['1/2','1/4']) {
        run(`memoValues[2]='${amount}';updateMemoButtons();updateAdjustmentForecast()`);
        validateDisplay(fixture.label + '/amount ' + amount);
        assert(immutable() === data, fixture.label + ': amount change does not retrain');
      }
      run(`activeMemoIndex=2;selectedMemoValue='3/4';window.beforePreviewChoices=JSON.stringify(guideNumberChoices);
        previewMemoSelection();`);
      assert(run('JSON.stringify(guideNumberChoices)===beforePreviewChoices && getSharedAdjustmentAmount(0)==="1/4"'), fixture.label + ': picker preview does not commit amount or rerank');
      run('updateAdjustmentForecast()');
    }
    // 同一入力の旧規則は実アプリ関数、新規則は実際に導入したpolicyを呼ぶ。
    const controlled = (hov, cruise, specs) => {
      trial.contentWindow.controlledSpecs = specs;
      return run(`(()=>{const pool=controlledSpecs.map(([blade,direction,h,b,towardCenter=true])=>({blade,direction,amount:.25,towardCenter,
        maxCenterDistance:b===null?h:Math.max(h,b),distance:b===null?h:h+b,
        predictions:[{color:'red',predictedDistance:h,source:'learned'},...(b===null?[]:[{color:'blue',predictedDistance:b,source:'learned'}])]}));
        const next=LinkRankingPolicy.select(pool,${hov},${cruise});
        return {old:linkRankingTrial.legacySelector(pool),next,assessment:LinkRankingPolicy.assess(next,${hov},${cruise})};})()`);
    };
    let c = controlled(.1,.35,[[1,'UP',.18,.12,false],[2,'DOWN',.19,.19,true]]);
    assert(c.old.blade===2&&c.next.blade===1,'safe outward HOV allowed; better achieved maximum selected');
    c = controlled(.1,.35,[[1,'UP',.18,.17,true],[2,'DOWN',.1,.18,false]]);
    assert(c.next.blade===2&&near(c.assessment.total,.28),'equal maximum uses smaller total center distance');
    c = controlled(.3,null,[[1,'UP',.15,null,false],[2,'DOWN',.4,null,true]]);
    assert(c.next.blade===1,'Cruise unmeasured: HOV endpoint arrival beats overshoot and direction');
    for (const h of [.199999,.2,.2000000005,.200001]) for (const b of [.199999,.2,.2000000005,.200001]) {
      c = controlled(.2,.2,[[1,'UP',h,b,true],[2,'DOWN',.19,.19,false]]);
      assert(c.assessment.nominalGoalMet,'boundary candidates outside either limit never outrank jointly achieved alternative');
      assert(c.next.blade===2,'boundary: smaller achieved maximum remains preferred');
      const assessed = run(`LinkRankingPolicy.assess({predictions:[{color:'red',predictedDistance:${h},source:'learned'},
        {color:'blue',predictedDistance:${b},source:'learned'}]},.2,.2)`);
      assert(assessed.nominalGoalMet === (h<=.2&&b<=.2),'strict inclusive 0.2 boundary without tolerance or rounding');
      assert(assessed.nearBoundary,'near-boundary prediction explicitly marked');
    }
    // 決定的な生成ケース：同じ終点で旧が両方達成なら新の最大距離は悪化しない。
    let seed = 91571;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let achievedComparisons = 0, jointCandidateCases = 0, unmetMaximumIncreases = 0, achievedTotalIncreases = 0;
    for (let i=0;i<400;i++) {
      const specs = [1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>[blade,direction,random()*.45,random()*.45,random()>.5]));
      c = controlled(.32,.33,specs);
      const goalExists = specs.some(([, ,h,b])=>h<=.2&&b<=.2);
      if(goalExists)jointCandidateCases++;
      assert(c.assessment.nominalGoalMet===goalExists,'generated cases: any joint achievement must be selected');
      if(c.old.predictions.every(p=>p.predictedDistance<=.2)) {
        achievedComparisons++;
        if(c.assessment.total>c.old.distance+1e-9)achievedTotalIncreases++;
        assert(c.assessment.maximum<=c.old.maxCenterDistance+1e-9,'generated achieved cases: maximum does not worsen');
        if(near(c.assessment.maximum,c.old.maxCenterDistance))assert(c.assessment.total<=c.old.distance+1e-9,'generated achieved cases: total tie-break does not worsen');
      } else if (!goalExists && c.assessment.maximum>c.old.maxCenterDistance+1e-9) unmetMaximumIncreases++;
    }
    assert(achievedComparisons>0&&unmetMaximumIncreases>0,'regression includes successful comparisons and explicit unmet-goal distance tradeoffs');
    trace.push({generatedCases:400,jointCandidateCases,achievedComparisons,achievedTotalIncreases,unmetMaximumIncreases});
    const analysis = LinkRankingAnalysis.run(trial.contentWindow.LinkRankingPolicy,trial.contentWindow.linkRankingTrial.legacySelector);
    assert(analysis.groups['maximum-52'].count===52&&analysis.groups['total-11'].count===11,'reproduces exact 52 and 11 affected cases');
    assert(analysis.target.both===jointCandidateCases&&analysis.original.both===achievedComparisons,'independent replay matches original 400-case results');
    assert(analysis.groups['maximum-52'].reasons['HOV-arrival-before-maximum']===47
      &&analysis.groups['maximum-52'].reasons['HOV-improvement-before-maximum']===5,'maximum increases separated into HOV arrival and improvement priorities');
    assert(analysis.groups['maximum-52'].fromOld['HOV-improved/Cruise-worsened']===52,'all 52 improve HOV but worsen Cruise relative to old endpoints');
    assert(analysis.groups['maximum-52'].fromCurrent['HOV-improved/Cruise-worsened']===32
      &&analysis.groups['maximum-52'].fromCurrent['HOV-improved/Cruise-improved']===20,'old endpoint regression distinct from current measured value regression');
    assert(analysis.groups['total-11'].fromCurrent['HOV-improved/Cruise-improved']===11
      &&analysis.groups['total-11'].excludedByLegacyDirection===11,'11 sum increases preserve both goals and remove legacy direction exclusion');
    assert(analysis.affected.every(c=>!c.dominated),'no affected selection is dominated in both endpoints');
    assert(analysis.comparison.pareto.changed===0,'removing endpoint-dominated candidates alone cannot eliminate tradeoffs');
    assert(analysis.comparison['legacy-cap'].resolvesTotal11===11
      &&analysis.comparison['legacy-cap'].worsensTargetMaximum===11,'legacy cap removes sum increases at expense of strict maximum minimization');
    assert(analysis.comparison['unmet-no-regression'].resolvesMaximum52===5
      &&analysis.comparison['unmet-no-regression'].losesTargetHovArrival===0,'unmet non-regression resolves five without losing HOV attainment');
    assert(analysis.comparison['unmet-minimax'].resolvesMaximum52===52
      &&analysis.comparison['unmet-minimax'].losesTargetHovArrival===64,'minimax-only fallback loses HOV attainment in 64 cases');
    assert(analysis.comparison['achieved-sum'].totalWorseAmongOldAchieved===0
      &&analysis.comparison['achieved-sum'].maximumWorseThanOld===60,'sum-first creates new maximum-distance regressions');
    assert(analysis.comparison['combined-guard'].maximumWorseThanOld===47
      &&analysis.comparison['combined-guard'].totalWorseAmongOldAchieved===0,'combined comparison reduces 52/11 counts to 47/0');
    for(const row of analysis.cases) {
      for(const [name,comparison] of Object.entries(row.comparisons)) {
        assert(!row.next.nominalGoalMet||comparison.nominalGoalMet,name+': joint achievement preserved');
        if(['legacy-cap','combined-guard'].includes(name)&&row.old.nominalGoalMet) {
          assert(comparison.maximum<=row.old.maximum+1e-9&&comparison.total<=row.old.total+1e-9,name+': both legacy distance caps respected');
        }
        if(name==='combined-guard')assert(!(row.next.hov<=.2)||comparison.hov<=.2,'combined guard preserves all HOV arrival candidates');
      }
    }
    const inputPool=analysis.cases[0].pool;
    const inputBefore=JSON.stringify(inputPool);
    for(const variant of Object.keys(analysis.comparison))trial.contentWindow.LinkRankingPolicy.selectComparison(inputPool,.32,.33,variant,inputPool[0]);
    assert(JSON.stringify(inputPool)===inputBefore,'counterfactual selectors preserve input predictions');
    const uncertainPool=[{blade:1,direction:'UP',amount:.25,predictions:[{color:'red',predictedDistance:.18,source:'prior'},
      {color:'blue',predictedDistance:null,source:'missing'}]}];
    for(const variant of Object.keys(analysis.comparison)) {
      const policy=trial.contentWindow.LinkRankingPolicy;
      const selected=policy.selectComparison(uncertainPool,.32,.33,variant,uncertainPool[0]);
      assert(policy.assess(selected,.32,.33).uncertain&&!policy.assess(selected,.32,.33).nominalGoalMet,variant+': missing Cruise never proves joint goal');
      assert(policy.selectComparison(uncertainPool,.32,null,variant,uncertainPool[0])===policy.select(uncertainPool,.32,null),variant+': HOV-only behavior unchanged');
    }
    globalThis.linkRankingAnalysisResult=analysis;
    trace.push({analysis:{...analysis,cases:undefined,affected:undefined}});
    const analysisData=document.createElement('pre');
    analysisData.id='analysis-data';analysisData.hidden=true;
    analysisData.textContent=JSON.stringify({...analysis,cases:undefined},null,2);document.body.append(analysisData);
    const policy=trial.contentWindow.LinkRankingPolicy;
    const poolsBefore=JSON.stringify(analysis.cases.map(row=>row.pool));
    const targetComparison=LinkRankingAnalysis.compareTargets(policy,analysis.cases);
    assert(JSON.stringify(analysis.cases.map(row=>row.pool))===poolsBefore,'target comparison never alters input endpoint predictions');
    assert(targetComparison.target18.bothPass===targetComparison.target20.bothPass,'0.18 target preserves every joint 0.2 pass');
    assert(targetComparison.target18.hovPass===targetComparison.target20.hovPass,'0.18 target preserves HOV 0.2 protection');
    assert(targetComparison.losesPass===0&&targetComparison.losesHovPass===0,'no pass candidate lost to lower prediction target');
    assert(targetComparison.hardTargetLosesPass>0,'comparison demonstrates why simply replacing pass threshold with 0.18 is unsafe');
    for(const row of targetComparison.cases) {
      assert(!row.target20.nominalGoalMet||row.target18.nominalGoalMet,'every generated joint-pass candidate stays first at target 0.18');
      assert(row.target18.hov===row.target20.hov&&row.target18.cruise===row.target20.cruise,'400 fixtures: same selected endpoint with both targets');
      assert(JSON.stringify(row.rank18)===JSON.stringify(row.rank20),'400 fixtures: all No ranks remain identical');
    }
    const makeCandidate=(blade,h,b,source='learned')=>({blade,direction:'UP',amount:.25,towardCenter:blade===1,
      predictions:[{color:'red',predictedDistance:h,source},...(b===undefined?[]:[{color:'blue',predictedDistance:b,source}])]});
    // 隣接する浮動小数点数まで確認し、丸め・epsilonで境界を拡張しない。
    const adjacent=(value,step)=>{
      const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value);
      view.setBigUint64(0,view.getBigUint64(0)+BigInt(step));return view.getFloat64(0);
    };
    for(const goal of [.18,.2]) {
      const values=[adjacent(goal,-1),goal,adjacent(goal,1)];
      for(const h of values)for(const b of values) {
        const a=policy.assess(makeCandidate(1,h,b),.32,.33,goal);
        assert(a.nominalTargetMet===(h<=goal&&b<=goal),'prediction target uses exact unrounded inclusive boundary');
        assert(a.nominalGoalMet===(h<=.2&&b<=.2),'pass threshold fixed at exact 0.2 with either target');
      }
      const exact=makeCandidate(2,goal,goal),outside=makeCandidate(1,.01,adjacent(goal,1));
      assert(policy.select([outside,exact],.32,.33,goal)===(goal===.2?exact:outside),
        'strict 0.2 eligibility; 0.18 reference boundary does not affect ranking');
    }
    const previousCounterexample=[makeCandidate(1,.01,.2000000005),makeCandidate(2,.2,.2)];
    for(const goal of [.18,.2]) {
      assert(policy.select(previousCounterexample,.32,.33,goal)===previousCounterexample[1],'previous 1e-9 boundary counterexample fixed');
      assert(!policy.assess(previousCounterexample[0],.32,.33,goal).nominalGoalMet,'Cruise just above 0.2 explicitly fails');
    }
    host.contentWindow.showLinkTrialComparison({notice:'boundary presentation test',rows:[{
      label:'boundary',action:'test',assessment:policy.assess(previousCounterexample[0],.32,.33,.18)}]});
    const boundaryTable=host.contentDocument.getElementById('comparison').textContent;
    assert(boundaryTable.includes('0.2000000005')&&boundaryTable.includes('0.2未合格'),'boundary display preserves exact outside value and failed status');
    const jointlySafe=makeCandidate(2,.19,.19),hovTargetOnly=makeCandidate(1,.17,.4);
    assert(policy.select([hovTargetOnly,jointlySafe],.32,.33,.18)===jointlySafe,'both 0.2 pass outranks HOV-only 0.18 target');
    const fallbackSafe=makeCandidate(2,.19,.21);
    assert(policy.select([hovTargetOnly,fallbackSafe],.32,.33,.18)===fallbackSafe,'no joint pass: HOV 0.19 remains eligible before HOV 0.18-only optimization');
    const hovOnly=makeCandidate(2,.19),hovOutside=makeCandidate(1,.21);
    assert(policy.select([hovOutside,hovOnly],.32,null,.18)===hovOnly,'unmeasured Cruise: HOV 0.19 pass is not discarded');
    const onlyAssessment=policy.assess(hovOnly,.32,null,.18);
    assert(onlyAssessment.nominalGoalMet&&!onlyAssessment.nominalTargetMet,'HOV-only pass and target attainment remain distinct');
    const uncertainTarget=policy.assess(makeCandidate(1,.17,.17,'prior'),.32,.33,.18);
    assert(uncertainTarget.nominalTargetMet&&uncertainTarget.uncertain&&!uncertainTarget.learnedTargetMet,'nominal 0.18 prior prediction does not confirm target attainment');
    for(const missing of [null,NaN,Infinity,-.1]) {
      const unknown=makeCandidate(1,.1,missing);
      assert(policy.select([unknown,jointlySafe],.32,.33,.18)===jointlySafe,'missing or invalid Cruise endpoint cannot outrank joint pass');
    }
    const targetSummary={...targetComparison,cases:undefined};
    trace.push({targetComparison:targetSummary});
    const targetData=document.createElement('pre');targetData.id='target-comparison-data';targetData.hidden=true;
    targetData.textContent=JSON.stringify(targetSummary,null,2);document.body.append(targetData);
    // 予測欠測・priorは名目達成でも確認済みにしない。
    const uncertainty = run(`['prior','reference-estimate','proportional-estimate','missing'].map(source=>
      LinkRankingPolicy.assess({predictions:[{color:'red',predictedDistance:source==='missing'?null:.18,source},
        {color:'blue',predictedDistance:.19,source:'learned'}]},.3,.3))`);
    assert(uncertainty.every(a=>a.uncertain&&!a.learnedGoalMet),'uncertain and missing estimates never confirm achievement');
    // HOVのみ学習済み・巡航は測定済みだがモデルなし。
    setup(4,false);
    run("dotSets.at(-1).blue={radius:.33,angle:165,color:'blue'};renderDirectionLines();linkRankingTrial.setMode('target')");
    assert(run('linkRankingTrial.report.actual.uncertain'),'measured but unlearned Cruise prediction remains uncertain');
    validateDisplay('HOV learned/Cruise learning pending');
    // 確定予測は順位切替で上書きしない。
    setup(4,true);
    run("updateAdjustmentForecast(memoValues,true);window.fixedTrialForecast=JSON.stringify(adjustmentForecast)");
    assert(run('adjustmentForecast.phase')==='fixed','actual forecast fixed for preservation check');
    run("linkRankingTrial.setMode('legacy');linkRankingTrial.setMode('target20');linkRankingTrial.setMode('target')");
    assert(run('JSON.stringify(adjustmentForecast)===fixedTrialForecast'),'fixed forecast retained byte-for-byte across rank switches');
    for (const automatic of [true,false]) {
      run(`currentChartPage=1;trimAutoMode=${automatic};renderDirectionLines();`);
      const tab = signature();
      run("linkRankingTrial.setMode('legacy');linkRankingTrial.setMode('target')");
      assert(signature()===tab,'TAB mode unaffected/'+automatic);
    }
    run('currentChartPage=0;pitchAutoMode=false;renderDirectionLines()');
    const manual = signature();
    run("linkRankingTrial.setMode('legacy');linkRankingTrial.setMode('target')");
    assert(signature()===manual,'manual LINK unchanged');
    assert(run('learning.predict.toString()')===predictSource&&run('BalanceDistancePrior.resolve.toString()')===resolveSource,'prediction and distance engines never replaced');
    assert(runOriginal('selectLinkGuideCandidate.toString()')===source,'production selector still untouched');
    assert(nativeSnapshot()===nativeBefore,'all trial operations leave native production storage unchanged');
    // アプリ内バックアップ取込が再読込しても、親のメモリStorageを引き継ぐ。
    run('saveDotSets();balanceFlushState()');
    run("localStorage.setItem('trial-reload-sentinel','memory-only')");
    const backupRecords = run('JSON.parse(appStorage.exportText()).records');
    run('appStorage.importText(appStorage.exportText())');
    const oldBoot = run('linkTrialBootId');
    trial.contentWindow.location.reload();
    for(let i=0;i<100;i++){await pause(100);if(trial.contentWindow.linkRankingTrial&&trial.contentWindow.linkTrialBootId!==oldBoot)break;}
    assert(run('linkTrialBootId')!==oldBoot&&run('typeof linkRankingTrial')==='object','trial app actually restarted');
    assert(run('localStorage.getItem("trial-reload-sentinel")')==='memory-only','iframe reload retains trial-only memory data');
    assert(run('appStorage.profile')!=='original','backup import restores the trial-only copied profile');
    const restoredRecords = run('JSON.parse(appStorage.exportText()).records');
    for(const key of Object.keys(backupRecords).filter(key=>key!=='balance-chart-ui-v1')) {
      // 起動時の既存loadDotSetsはプロパティ順を正規化する。保存文字列でなく値を比較する。
      const value = raw => key==='balance-chart-note-v1'?raw:canonical(JSON.parse(raw));
      assert(value(restoredRecords[key])===value(backupRecords[key]),'backup import preserves record '+key+' in memory');
    }
    assert(nativeSnapshot()===nativeBefore,'reload never writes trial data into native storage');
    output.textContent = `PASS: ${checks} checks\n`+JSON.stringify(trace,null,2);
    document.title = 'PASS';
  } catch(error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}\n`+JSON.stringify(trace,null,2);
    document.title = 'FAIL';
  } finally {
    if(nativeNote===null)localStorage.removeItem('balance-chart-note-v1');else localStorage.setItem('balance-chart-note-v1',nativeNote);
  }
})();
