/* Isolated comparison: original production functions are never replaced. */
(async () => {
  const output = document.getElementById('results'), P = LinkMaintenancePolicy, Q = LinkTwoStagePolicy;
  let checks = 0;
  const report = { basis: 'synthetic and screenshot-approximation; no imported device state',
    realWorldValidated: false, confirmedRecommendations: 0, fixtures: [] };
  const endpointVariants=[
    {id:'known-first',label:'中心向き内で既知終点優先',options:{protectNominalBoth:true,geometryPriority:true,cruiseEndpointPolicy:'known-first'}},
    {id:'improvement-first',label:'改善終点→欠測→悪化終点',options:{protectNominalBoth:true,geometryPriority:true,cruiseEndpointPolicy:'improvement-first'}}
  ];
  report.endpointVariants=endpointVariants;
  const twoStageVariants=[{id:'same-rule',label:'2段階・同一基準（対照）'},
    {id:'improvement-aware',label:'2段階・方向選択で改善予測と幾何可能性を区別'}];
  report.twoStageVariants=twoStageVariants;
  const assert = (condition, label) => { if (!condition) throw Error(label); checks++; };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const adjacent = (value, step) => {
    const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0, value);
    v.setBigUint64(0, v.getBigUint64(0) + BigInt(step)); return v.getFloat64(0);
  };
  const storageSnapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
  const nativeBefore = storageSnapshot();
  const read = url => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open('GET', url);
    request.onload = () => !request.status || request.status === 200 ? resolve(request.responseText) : reject(Error('Cannot read app'));
    request.onerror = () => reject(Error('Cannot read app; use HTTP server')); request.send();
  });
  async function loadApp() {
    const root = new URL('../', location.href).href;
    const source = await read(new URL('index.html', root));
    if (!source.includes('src="app.js')) throw Error('Unexpected original HTML');
    globalThis.linkTrialHost = {};
    const inert = source.replace(/<script src="([^"]+)"\s*><\/script>/g,
      '<script type="application/x-link-maintenance" data-maintenance-src="$1"><\/script>');
    const frame = document.createElement('iframe');
    const ready = new Promise((resolve, reject) => {
      globalThis.maintenanceReady = resolve; globalThis.maintenanceFailed = reject;
    });
    const bootstrap = `<base href="${root}"><script src="tests/link-ranking-trial-storage.js"><\/script>`;
    const loader = `<script>(async()=>{try{
      if(!globalThis.linkTrialMemoryStorage||localStorage!==linkTrialMemoryStorage)throw Error('Storage isolation failed');
      for(const node of document.querySelectorAll('script[data-maintenance-src]'))await new Promise((ok,no)=>{
        const s=document.createElement('script');s.src=node.dataset.maintenanceSrc;s.onload=ok;s.onerror=no;document.body.append(s);});
      parent.maintenanceReady();
    }catch(e){parent.maintenanceFailed(Error(String(e)));}})();<\/script>`;
    frame.srcdoc = inert.replace(/<head[^>]*>/i, '$&' + bootstrap).replace(/<\/body>/i, loader + '</body>');
    document.body.append(frame); await ready; return frame;
  }
  const key = c => c ? `${c.blade} ${c.direction} ${c.amountText ?? c.amount}` : null;
  function synthetic(blade, h, b, hu, bu, amount = .25, source = 'learned') {
    return { blade, direction: 'UP', amount,
      geometries: { red: P.geometry({x:0,y:.1},hu), blue: P.geometry({x:0,y:.35},bu) },
      predictions: [{color:'red',predictedDistance:h,source}, {color:'blue',predictedDistance:b,source}] };
  }
  try {
    const inward = {x:0,y:-1}, outward = {x:0,y:1}, tangent = {x:1,y:0};
    assert(P.geometry({x:0,y:0},outward).interval[1] === .2, 'at center every direction has finite maintenance range');
    const insideOut = P.geometry({x:0,y:.1},outward);
    assert(near(insideOut.minimumRadius,.1) && near(insideOut.interval[1],.1), 'outward ray from inside can maintain .2 for short travel');
    assert(P.geometry({x:0,y:.2},outward).interval[1] === 0, 'boundary outward permits zero travel only');
    assert(P.geometry({x:0,y:adjacent(.2,-1)},outward).positiveTravelPossible,
      'one ULP inside has a strictly positive outward maintenance range');
    assert(P.geometry({x:0,y:adjacent(.2,1)},outward).interval===null,
      'one ULP outside is not absorbed by a geometric tolerance');
    assert(!P.geometry({x:0,y:.2},tangent).positiveTravelPossible, 'boundary tangent has no positive maintenance travel');
    assert(near(P.geometry({x:0,y:.2},inward).interval[1],.4), 'boundary inward retains a positive interval');
    assert(P.geometry({x:0,y:.33},outward).interval === null, 'backward line intersection cannot qualify outward ray');
    assert(P.geometry({x:0,y:.33},tangent).interval === null, 'outside tangent misses disk');
    assert(P.geometry({x:0,y:.1},{x:0,y:0}) === null, 'zero vector is unknown');
    assert(P.geometry({x:NaN,y:.1},inward) === null, 'invalid geometry is unknown');
    for (const h of [adjacent(.2,-1),.2,adjacent(.2,1)]) {
      const c = synthetic(1,h,.1,outward,inward);
      assert(P.assess(c,.1,.35).hovMaintenancePredicted === (h <= .2), 'strict .2 endpoint, no rounding or epsilon expansion');
      for (const b of [adjacent(.2,-1),.2,adjacent(.2,1)]) {
        c.predictions[1].predictedDistance = b;
        assert(P.assess(c,.1,.35).nominalBothWithin === (h<=.2&&b<=.2), 'strict both endpoint boundary');
        assert(!P.assess(c,.1,.35).confirmedPass, 'even learned endpoints are not actual confirmed passes');
      }
    }
    const a = synthetic(1,.01,.5,inward,outward), b = synthetic(2,.19,.1,outward,inward);
    assert(P.rank([a,b],.1,.35).comparisonCandidate===b, 'HOV already inside: Cruise inward outranks greater HOV approach');
    for (const distance of [.001,.1,.199,.2]) {
      b.predictions[0].predictedDistance=distance;
      assert(P.rank([a,b],.1,.35).comparisonCandidate===b, 'in-range HOV distance never reorders Cruise direction priority');
    }
    b.predictions[0].predictedDistance=adjacent(.2,1);
    assert(P.rank([a,b],.1,.35).comparisonCandidate===a, 'known HOV outside cannot bypass predicted maintenance');
    const missing = synthetic(2,.19,null,outward,inward);
    const pairDown=synthetic(1,.15,null,outward,inward);pairDown.direction='DOWN';
    const pairUp=synthetic(1,.1,.45,inward,outward);
    const possible=Q.rank([pairUp,pairDown],.1,.35);
    assert(possible.directions[0].candidate===pairDown,
      'two-stage missing inward direction remains possible before known worsening');
    assert(possible.directions[0].assessment.cruiseEvidence==='geometry-only-improvement-possible'
      &&possible.directions[0].assessment.cruiseEndpoint===null
      &&!possible.directions[0].assessment.nominalBothWithin,
      'two-stage geometric improvement is not a forecast endpoint or attained goal');
    const knownOvershoot=synthetic(1,.15,.55,outward,inward);knownOvershoot.direction='DOWN';
    assert(Q.rank([pairUp,knownOvershoot],.1,.35).comparisonCandidate===pairUp,
      'two-stage direction choice compares known overshoot even against outward travel');
    const knownImprovement=synthetic(1,.19,.3,outward,inward);
    assert(Q.rank([knownImprovement,pairDown],.1,.35).comparisonCandidate===knownImprovement,
      'known improvement is preferred to a geometric-only possibility');
    const jointDirection=synthetic(1,.19,.19,outward,outward);
    assert(Q.rank([jointDirection,knownOvershoot],.1,.35).comparisonCandidate===jointDirection,
      'two-stage known joint forecast survives direction selection');
    const unsafeDirection=synthetic(1,.21,.01,inward,inward);unsafeDirection.direction='DOWN';
    assert(Q.rank([pairUp,unsafeDirection],.1,.35).comparisonCandidate===pairUp,
      'two-stage direction selection never drops available known HOV maintenance');
    const pairState=JSON.stringify([pairUp,pairDown]);Q.rank([pairUp,pairDown],.1,.35);
    assert(JSON.stringify([pairUp,pairDown])===pairState,'two-stage selection never mutates candidate evidence');
    let mixedRejected=false;
    try{Q.rank([pairUp,{...pairDown,amount:.5}],.1,.35);}catch{mixedRejected=true;}
    assert(mixedRejected,'two-stage cannot silently compare or select different shared amounts');
    assert(P.rank([a,missing],.1,.35).comparisonCandidate===missing, 'known inward Cruise direction remains a comparison when endpoint missing');
    assert(P.assess(missing,.1,.35).cruiseImprovementPredicted===null
      && !P.assess(missing,.1,.35).nominalBothWithin, 'unknown Cruise endpoint is not zero or a pass');
    const unknownH = synthetic(3,null,.1,outward,inward);
    assert(P.assess(unknownH,.1,.35).hovMaintenanceGeometricallyPossible
      && P.assess(unknownH,.1,.35).hovMaintenancePredicted===null, 'geometry-only HOV remains separate from prediction');
    assert(P.rank([unknownH,a],.1,.35).comparisonCandidate===a, 'geometry-only maintenance follows known nominal maintenance');
    const overshoot = synthetic(3,.15,.5,outward,inward);
    assert(P.assess(overshoot,.1,.35).cruiseInward && P.assess(overshoot,.1,.35).cruiseImprovementPredicted<0,
      'inward direction does not invent improvement after overshoot');
    const unknownDirection = synthetic(3,.15,.01,outward,{x:0,y:0});
    assert(P.assess(unknownDirection,.1,.35).cruiseInward===null, 'missing Cruise direction is not outward or inward');
    assert(P.rank([unknownDirection,missing],.1,.35).comparisonCandidate===missing, 'known inward direction precedes unknown direction');
    const snapshot = JSON.stringify([a,b,missing]); P.rank([a,b,missing],.1,.35);
    assert(snapshot===JSON.stringify([a,b,missing]), 'policy does not mutate forecasts');
    assert(P.rank([], .1,.35).comparisonCandidate===null && P.rank([],null,.35).comparisonCandidate===null, 'empty or unmeasured HOV safe');
    assert(!P.rank([a],.21,.35,()=>a).applicable && P.rank([a],.21,.35,()=>a).comparisonCandidate===a,
      'HOV outside retains existing policy via explicit fallback');
    const equalBlue = [synthetic(2,.001,.1,inward,inward),synthetic(1,.199,.1,outward,inward)];
    assert(P.rank(equalBlue,.1,.35).comparisonCandidate===equalBlue[1], 'equal Cruise uses stable No order, never smaller HOV');
    assert(P.rank(equalBlue,.1,null).comparisonCandidate===equalBlue[1], 'unmeasured Cruise does not restore HOV centering priority');
    assert(!P.assess(equalBlue[1],.1,null).nominalBothWithin,
      'unmeasured current Cruise never counts as joint attainment');
    assert(P.assess(a,.1,.35).uncertain===false && !P.assess(a,.1,.35).realWorldValidated,
      'learned availability and real-world validation are distinct');
    assert(P.assess(synthetic(1,.1,.1,inward,inward,.25,'prior'),.1,.35).uncertain,
      'prior remains uncertain even when both nominal endpoints are inside');
    const strongMissing=synthetic(1,.15,null,outward,inward);
    const weakKnown=synthetic(3,.1,.3,inward,{x:Math.sqrt(3)/2,y:-.5});
    assert(P.rank([weakKnown,strongMissing],.1,.35).comparisonCandidate===weakKnown,
      'sign-only comparator prefers a known Cruise endpoint within same direction class');
    assert(P.rank([weakKnown,strongMissing],.1,.35,undefined,{geometryPriority:true}).comparisonCandidate===strongMissing,
      'geometry comparator distinguishes reachable near-center ray from weak inward ray');
    assert(P.assess(strongMissing,.1,.35).cruiseEndpoint===null&&!P.assess(strongMissing,.1,.35).nominalBothWithin,
      'geometry priority does not fabricate missing Cruise endpoint or attainment');
    const physical=(blade,hTravel,bTravel,hu,bu,blueRadius=.1)=>{
      const predictions=[['red',hTravel,hu],['blue',bTravel,bu]].map(([color,travel,u])=>{
        const radius=color==='blue'?blueRadius:.1;
        const position=travel===null?null:{x:u.x*travel,y:radius+u.y*travel};
        return {color,start:{x:0,y:radius},position,predictedDistance:position?Math.hypot(position.x,position.y):null,
          source:travel===null?'missing':'learned'};
      });
      return P.attach({blade,direction:blade===1?'UP':'DOWN',amount:.25,predictions,
        units:{red:hu,blue:bu}},{x:0,y:0,radius:1});
    };
    const joint=physical(1,.05,.05,inward,outward),travelOvershoot=physical(2,.05,.4,outward,inward);
    const travelUnknown=physical(2,.05,null,outward,inward);
    report.policyTradeoffs=[];
    for(const alternative of [travelOvershoot,travelUnknown]){
      const strict=P.rank([joint,alternative],.1,.1);
      const guarded=P.rank([joint,alternative],.1,.1,undefined,{protectNominalBoth:true});
      assert(P.assess(joint,.1,.1).nominalBothWithin,'physical counterexample has an available nominal joint forecast');
      assert(strict.comparisonCandidate===alternative&&!P.assess(alternative,.1,.1).nominalBothWithin,
        'strict direction may lose a nominal joint forecast to overshoot or missing travel');
      assert(guarded.comparisonCandidate===joint,'joint forecast guard retains nominal joint candidate without HOV centering preference');
      assert(guarded.confirmedRecommendation===null&&!P.assess(joint,.1,.1).confirmedPass,
        'nominal joint guard does not certify real-world success');
      report.policyTradeoffs.push({basis:'physically consistent synthetic vectors',
        kind:alternative===travelOvershoot?'inward Cruise overshoot':'inward Cruise endpoint missing',
        currentHov:.1,currentCruise:.1,jointForecast:P.assess(joint,.1,.1),
        strictDirectionChoice:P.assess(alternative,.1,.1),guardedChoice:P.assess(joint,.1,.1)});
    }
    const nearInward=physical(3,.05,.05,outward,inward);
    for(const variant of endpointVariants){
      assert(P.rank([nearInward,travelOvershoot],.1,.1,undefined,variant.options).comparisonCandidate===nearInward,
        variant.id+' compares actual endpoints, not inward direction alone');
      assert(P.rank([nearInward,travelUnknown],.1,.1,undefined,variant.options).comparisonCandidate===nearInward,
        variant.id+' retains a known joint forecast ahead of unknown travel');
      assert(P.rank([joint,travelOvershoot],.1,.1,undefined,variant.options).comparisonCandidate===joint,
        variant.id+' preserves joint forecast priority even when Cruise points outward');
    }
    const worsening=physical(3,.05,.35,outward,inward);
    assert(P.rank([worsening,travelUnknown],.1,.1,undefined,endpointVariants[0].options).comparisonCandidate===worsening,
      'known-first retains a known worsening endpoint ahead of an unknown one in same direction class');
    assert(P.rank([worsening,travelUnknown],.1,.1,undefined,endpointVariants[1].options).comparisonCandidate===travelUnknown,
      'improvement-first may prefer unknown travel over known overshoot, but does not claim attainment');
    assert(!P.assess(travelUnknown,.1,.1).nominalBothWithin,'unknown overshoot alternative remains unqualified');
    const weakImproving=physical(1,.05,.1,inward,{x:Math.sqrt(3)/2,y:-.5},.35);
    const strongOvershoot=physical(2,.05,.8,outward,inward,.35);
    assert(P.rank([weakImproving,strongOvershoot],.1,.35,undefined,
      {protectNominalBoth:true,geometryPriority:true}).comparisonCandidate===strongOvershoot,
      'preceding geometry priority prefers a stronger ray even when predicted travel overshoots');
    for(const v of endpointVariants)assert(P.rank([weakImproving,strongOvershoot],.1,.35,undefined,v.options)
      .comparisonCandidate===weakImproving,v.id+' actually places endpoint before stronger geometric alignment');

    const frame = await loadApp(), run = code => frame.contentWindow.eval(code);
    assert(run('localStorage===linkTrialMemoryStorage'), 'app storage isolated before boot');
    assert(run('typeof linkRankingTrial')==='undefined', 'no trial adapter or production selector replacement');
    const sources = run('JSON.stringify([selectLinkGuideCandidate.toString(),learning.predict.toString(),BalanceDistancePrior.resolve.toString()])');
    const center = run('({x:CHART_CENTER_X,y:CHART_CENTER_Y,radius:CHART_RADIUS})');
    const amounts = run('BalanceLearning.amounts.LINK');
    const fixtures = [
      {id:'image',label:'今回の画像近似・未学習',h:.0858646622241277,ha:357.0643265535789,b:.34974248163560817,ba:198.321338},
      {id:'old-inside',label:'前回条件 HOV 0.19',h:.19,ha:112.5,b:.33,ba:165,hr:-41,br:-60},
      {id:'center',label:'HOV中心・未学習',h:0,ha:0,b:.35,ba:198.321338},
      {id:'boundary',label:'HOV境界0.2・未学習',h:.2,ha:357.0643265535789,b:.35,ba:198.321338}
    ].map(f=>({hr:-74,br:-97.5,...f}));
    const immutable = () => run(`JSON.stringify({learning:learning.inspect(),dots:dotSets,
      records:BalanceState.keys.map(k=>appStorage.getItem(k)),forecast:adjustmentForecast,
      guides:forecastGuides,choices:guideNumberChoices,memo:memoValues,selections:adjustmentSelections})`);
    async function collect(f, learned) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(v=>v.fill(''));memoValues.splice(0,4,'1','LINK','1/4','UP');
        pitchAutoMode=false;trimAutoMode=false;
        const makeDot=(x,y,color)=>({color,clock:'synthetic',radius:Math.hypot(x-397,y-520)/240,
          angle:Math.atan2(x-397,520-y)*180/Math.PI});
        ${learned ? `for(let i=0;i<4;i++){
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:makeDot(517+(3-i)*40,590+(3-i)*23,'red'),
            blue:makeDot(527+(3-i)*30,650+(3-i)*25,'blue'),adjustments:i<3?[['1','LINK','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);}` : ''}
        dotSets.push({learningId:newLearningId(),red:{radius:${f.h},angle:${f.ha},color:'red',clock:'fixture'},
          blue:${f.b===null?'null':`{radius:${f.b},angle:${f.ba},color:'blue',clock:'fixture'}`},adjustments:[]});
        ${learned ? `learning.sync(dotSets,{LINK:{red:${f.hr},blue:${f.br}},TAB:{red:0,blue:0}});` : ''}
        applyChartRotation(${f.hr},${f.br});`);
      if(learned)assert(run(`learning.inspect().samples.length>=6
        &&learning.predict('LINK','red',1,'UP',.25,{x:397,y:520})!==null
        &&learning.predict('LINK','blue',1,'UP',.25,{x:397,y:520})!==null`),
        'synthetic learned fixture has actual ready models for both colors');
      const fixture = { ...f, learnedSynthetic:learned, amounts:[] };
      for (const amountText of amounts) {
        run(`adjustmentSelections.slice(0,3).forEach(v=>v[2]='${amountText}');memoValues[2]='${amountText}';`);
        const before = immutable();
        const raw = run(`(()=>{
          const target=dotSets.at(-1),amount=BalanceLearning.adjustment(['1','LINK','${amountText}','UP']).amount;
          const candidates=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>{
            const predictions=['red','blue'].flatMap(color=>{
              if(!target[color])return [];
              const start=getDotCoordinates(target[color]);
              const p=learning.predict('LINK',color,blade,direction,amount,start);
              return p?[{color,start,...p}]:[];
            });
            // Use the same learned-vector branch as production when HOV is ready.
            return predictions.some(p=>p.color==='red')?{blade,direction,amountText:'${amountText}',predictions}
              :{blade,direction,predictions:[],line:getDirectionLine(target.red,'red',null,blade,direction),
                blue:target.blue?getDirectionLine(target.blue,'blue',null,blade,direction):null};
          }));
          for(const c of candidates)if(!c.line&&target.blue&&!c.predictions.some(p=>p.color==='blue')){
            const start=getDotCoordinates(target.blue),fallbackLine=getDirectionLine(target.blue,'blue',null,c.blade,c.direction);
            c.predictions.push({color:'blue',start,position:fallbackLine.end,fallbackLine});
          }
          return getLinkRankingCandidates(candidates).map(c=>({blade:c.blade,direction:c.direction,amount:c.amount,
            amountText:c.amountText,predictions:c.predictions,
            units:Object.fromEntries(c.predictions.map(p=>[p.color,c.line?getGuideMovementUnit(p.color==='red'?c.line:c.blue)
              :getGuideMovementUnit(getPredictionGuideLine(c.original.predictions.find(q=>q.color===p.color)))]))}));
        })()`);
        const cs = raw.map(c=>P.attach(c,center)), production = LinkRankingBeforeTwoStage;
        const expectedProduction=Q.rank(cs,f.h,f.b).ranked.map(row=>key(row.candidate));
        assert(frame.contentWindow.BalanceLinkRanking.rank(cs,f.h,f.b).ranked.map(key).join('|')===expectedProduction.join('|'),
          'production complete order matches independent two-stage fixture reference');
        const trial=P.rank(cs,f.h,f.b,(...args)=>production.select(...args)), current=production.select(cs,f.h,f.b);
        const guarded=P.rank(cs,f.h,f.b,undefined,{protectNominalBoth:true});
        const geometric=P.rank(cs,f.h,f.b,undefined,{geometryPriority:true});
        const geometricGuarded=P.rank(cs,f.h,f.b,undefined,{geometryPriority:true,protectNominalBoth:true});
        const numberOrder=select=>{
          let pool=[...cs];const order=[];
          while(pool.length){const c=select(pool);if(!c)break;order.push(key(c));pool=pool.filter(x=>x.blade!==c.blade);}
          return order;
        };
        const currentNumberOrder=numberOrder(pool=>production.select(pool,f.h,f.b));
        const newNumberOrder=numberOrder(pool=>P.rank(pool,f.h,f.b,undefined,
          {geometryPriority:true,protectNominalBoth:true}).comparisonCandidate);
        const endpointChoices=endpointVariants.map(v=>({id:v.id,label:v.label,
          choice:key(P.rank(cs,f.h,f.b,undefined,v.options).comparisonCandidate),
          numberOrder:numberOrder(pool=>P.rank(pool,f.h,f.b,undefined,v.options).comparisonCandidate)}));
        const twoStageChoices=twoStageVariants.map(v=>{
          const result=Q.rank(cs,f.h,f.b,{mode:v.id});
          assert(result.directions.length===3&&result.ranked.length===3,'two-stage keeps one candidate per No.');
          assert(result.ranked.every(row=>result.directions.some(d=>d.candidate===row.candidate)),
            'second stage only ranks the directions selected by the first stage');
          const numberOrder=result.ranked.map(row=>key(row.candidate));
          if(v.id==='same-rule')assert(numberOrder.join('|')===endpointChoices[0].numberOrder.join('|'),
            'same-rule two-stage fixture order equals flat known-first order');
          return {...v,choice:key(result.comparisonCandidate),numberOrder,
            directions:result.directions.map(d=>({blade:d.blade,choice:key(d.candidate),
              assessment:d.assessment,alternatives:d.alternatives.map(a=>({choice:key(a.candidate),assessment:a.assessment}))}))};
        });
        assert(currentNumberOrder.length===3&&newNumberOrder.length===3,'both policies retain all three distinct No choices');
        assert(cs.length===6,'all No and UP/DOWN present at '+amountText);
        assert(trial.confirmedRecommendation===null,'comparison never certifies a recommendation');
        for(const c of cs){
          const assessment=P.assess(c,f.h,f.b);
          assert(!assessment.confirmedPass&&!assessment.realWorldValidated,'no candidate is an actual validated pass');
          for(const p of c.predictions){
            const g=c.geometries[p.color];
            assert(!!g,'direction geometry available including center');
            if(learned)assert(p.source==='learned','learned fixture really uses learned forecasts, never a silent prior fallback');
            if(p.position){
              const reconstructed=Math.hypot((p.start.x-center.x)/center.radius+g.unit.x*p.predictedTravel,
                (p.start.y-center.y)/center.radius+g.unit.y*p.predictedTravel);
              assert(near(reconstructed,p.predictedDistance),'forecast endpoint reconstructed from actual source and travel');
            }else assert(p.predictedTravel===null&&p.predictedDistance===null,'missing endpoint remains missing');
          }
          const hov=c.predictions.find(p=>p.color==='red');
          if(hov.predictedDistance!==null)assert(assessment.hovMaintenancePredicted===(hov.predictedDistance<=.2),'strict app endpoint maintenance');
        }
        const maintained=cs.filter(c=>P.assess(c,f.h,f.b).hovMaintenancePredicted===true);
        if(maintained.length)assert(P.assess(trial.comparisonCandidate,f.h,f.b).hovMaintenancePredicted===true,'never discard available predicted HOV maintenance');
        if(maintained.some(c=>P.assess(c,f.h,f.b).cruiseInward===true))
          assert(P.assess(trial.comparisonCandidate,f.h,f.b).cruiseInward===true,'within maintained candidates prefer inward Cruise');
        assert(immutable()===before,'comparison leaves all production memory, predictions, records and selected amount unchanged');
        fixture.amounts.push({amountText,current:key(current),trial:key(trial.comparisonCandidate),trialStatus:trial.comparisonStatus,
          guarded:key(guarded.comparisonCandidate),guardedStatus:guarded.comparisonStatus,
          geometric:key(geometric.comparisonCandidate),geometricStatus:geometric.comparisonStatus,
          geometricGuarded:key(geometricGuarded.comparisonCandidate),
          currentNumberOrder,newNumberOrder,
          endpointChoices,
          twoStageChoices,
          ranked:trial.ranked.map(row=>key(row.candidate)),candidates:cs.map(c=>({...c,assessment:P.assess(c,f.h,f.b)}))});
      }
      const all=fixture.amounts.flatMap(a=>a.candidates);
      fixture.allAmountsComparison=key(P.rank(all,f.h,f.b).comparisonCandidate);
      fixture.no1AllAmountsComparison=key(P.rank(all.filter(c=>c.blade===1),f.h,f.b).comparisonCandidate);
      fixture.allAmountsGuardedComparison=key(P.rank(all,f.h,f.b,undefined,{protectNominalBoth:true}).comparisonCandidate);
      fixture.allAmountsGeometricComparison=key(P.rank(all,f.h,f.b,undefined,{geometryPriority:true}).comparisonCandidate);
      fixture.allAmountsGeometricGuardedComparison=key(P.rank(all,f.h,f.b,undefined,{geometryPriority:true,protectNominalBoth:true}).comparisonCandidate);
      return fixture;
    }
    for(const fixture of fixtures)report.fixtures.push(await collect(fixture,false));
    report.fixtures.push(await collect({...fixtures[0],id:'image-learned',label:'画像位置・合成学習済み'},true));
    report.fixtures.push(await collect({...fixtures[0],id:'hov-only',label:'画像HOV位置・巡航未測定',b:null},false));
    report.fixtures.push(await collect({...fixtures[0],id:'overshoot',label:'前回の巡航終点悪化例',h:.19,ha:60,b:.19,ba:60},false));

    // Compare the proposed ordering on all amounts and independent synthetic
    // positions. Temporarily vary fixture positions, then restore them exactly.
    // This counts nominal forecast selections, never actual achieved passes.
    const sweepBefore=immutable();
    globalThis.maintenanceAssert=assert;
    globalThis.maintenanceEndpointVariants=endpointVariants;
    globalThis.maintenanceTwoStageVariants=twoStageVariants;
    report.rankingSweep=run(`(()=>{
      const P=parent.LinkMaintenancePolicy,Q=parent.LinkTwoStagePolicy,check=parent.maintenanceAssert;
      const target=dotSets.at(-1),redBefore=target.red,blueBefore=target.blue;
      const selectionsBefore=adjustmentSelections.map(v=>[...v]),memoBefore=[...memoValues];
      const summary={cases:0,changed:0,currentNominalBothWithin:0,trialNominalBothWithin:0,
        lostNominalBothWithin:0,gainedNominalBothWithin:0,lostNominalHovMaintenance:0,
        currentCruiseInward:0,trialCruiseInward:0,currentCruiseMissing:0,trialCruiseMissing:0,
        no1DownSelections:0,lostBothExamples:[],newMissingExamples:[],confirmedPasses:0,
        guardedChanged:0,guardedNominalBothWithin:0,guardedLostNominalBothWithin:0,
        guardedCruiseInward:0,guardedCruiseMissing:0,casesWithNominalHovMaintenance:0,
        casesWithoutNominalHovMaintenance:0,maintainedDirectionChanged:0,
        maintainedCurrentCruiseInward:0,maintainedTrialCruiseInward:0,diagnosticOnlyChanged:0,
        geometricChanged:0,geometricNominalBothWithin:0,geometricLostNominalBothWithin:0,
        geometricCruiseMissing:0,geometricNo1DownSelections:0,
        geometricGuardedNominalBothWithin:0,geometricGuardedLostNominalBothWithin:0};
      const counters=()=>({cases:0,changed:0,currentBoth:0,newBoth:0,lostBoth:0,gainedBoth:0,
        currentCruiseMissing:0,newCruiseMissing:0,newlyMissing:0,recoveredMissing:0,
        currentCruiseInward:0,newCruiseInward:0,currentNo1Down:0,newNo1Down:0,
        hovEndpointWorse:0,bothEndpointsKnown:0,cruiseEndpointWorse:0,maximumWorse:0,totalWorse:0});
      const comparison={strategy:{protectNominalBoth:true,geometryPriority:true},
        all:counters(),maintenanceAvailable:counters(),diagnosticOnly:counters(),
        adverseExamples:{newMissing:[],hovWorseInside:[],cruiseWorse:[],maximumWorse:[]},
        worstKnownCruiseIncrease:null};
      summary.protectedComparison=comparison;
      const endpointComparisons=parent.maintenanceEndpointVariants.map(v=>({...v,
        all:counters(),maintenanceAvailable:counters(),diagnosticOnly:counters(),
        previous26:{cases:0,resolvedKnown:0,stillWorseKnown:0,becameMissing:0},
        remainingAdverseExamples:[],changedFromPriorExamples:[]}));
      summary.endpointComparisons=endpointComparisons;
      const twoCounters=()=>({...counters(),rankOrderChanged:0,numberOrderChanged:0,
        firstNumberChanged:0,firstDirectionChanged:0,perNumberDirectionChanges:0,
        changedFromFlatKnownFirst:0,lostHovMaintenance:0,selectedGeometricOnly:0,
        rankOrderChangedFromFlatKnownFirst:0,numberOrderChangedFromFlatKnownFirst:0,
        perNumberDirectionChangesFromFlatKnownFirst:0,
        perNumberHovMaintenanceLost:0,perNumberJointLost:0,
        perNumberCurrentCruiseMissing:0,perNumberNewCruiseMissing:0,
        perNumberNewlyMissing:0,perNumberRecoveredMissing:0,
        selectedKnownCruiseWorsening:0,selectedKnownCruiseImprovement:0,
        directionsGeometricOnly:0,perNumberCruiseWorse:0,perNumberCruiseBothKnown:0});
      const twoStageComparisons=parent.maintenanceTwoStageVariants.map(v=>({...v,
        all:twoCounters(),maintenanceAvailable:twoCounters(),diagnosticOnly:twoCounters(),
        adverseExamples:[],newMissingExamples:[],changedFromFlatExamples:[]}));
      summary.twoStageComparisons=twoStageComparisons;
      const compact=c=>({blade:c.blade,direction:c.direction,amountText:c.amountText,
        ...Q.evidence(c,target.red.radius,target.blue.radius)});
      const numberOrder=(pool,select)=>{
        const order=[];
        while(pool.length){const c=select(pool);order.push(c);pool=pool.filter(x=>x.blade!==c.blade);}
        return order;
      };
      const key=c=>c.blade+' '+c.direction;
      const accumulate=(counts,current,next,a,z)=>{
        counts.cases++;counts.changed+=current.blade!==next.blade||current.direction!==next.direction;
        counts.currentBoth+=a.nominalBothWithin;counts.newBoth+=z.nominalBothWithin;
        counts.lostBoth+=a.nominalBothWithin&&!z.nominalBothWithin;
        counts.gainedBoth+=!a.nominalBothWithin&&z.nominalBothWithin;
        counts.currentCruiseMissing+=a.cruiseEndpoint===null;counts.newCruiseMissing+=z.cruiseEndpoint===null;
        counts.newlyMissing+=a.cruiseEndpoint!==null&&z.cruiseEndpoint===null;
        counts.recoveredMissing+=a.cruiseEndpoint===null&&z.cruiseEndpoint!==null;
        counts.currentCruiseInward+=a.cruiseInward===true;counts.newCruiseInward+=z.cruiseInward===true;
        counts.currentNo1Down+=current.blade===1&&current.direction==='DOWN';
        counts.newNo1Down+=next.blade===1&&next.direction==='DOWN';
        counts.hovEndpointWorse+=a.hovEndpoint!==null&&z.hovEndpoint!==null&&z.hovEndpoint>a.hovEndpoint;
        if(a.cruiseEndpoint!==null&&z.cruiseEndpoint!==null&&a.hovEndpoint!==null&&z.hovEndpoint!==null){
          counts.bothEndpointsKnown++;
          counts.cruiseEndpointWorse+=z.cruiseEndpoint>a.cruiseEndpoint;
          counts.maximumWorse+=Math.max(z.hovEndpoint,z.cruiseEndpoint)>Math.max(a.hovEndpoint,a.cruiseEndpoint);
          counts.totalWorse+=z.hovEndpoint+z.cruiseEndpoint>a.hovEndpoint+a.cruiseEndpoint;
        }
      };
      try{
        for(const h of [0,.05,.19,.2])for(const b of [.19,.35])
          for(let ha=0;ha<360;ha+=60)for(let ba=0;ba<360;ba+=60)for(const amountText of BalanceLearning.amounts.LINK){
            target.red={radius:h,angle:ha,color:'red',clock:'synthetic-grid'};
            target.blue={radius:b,angle:ba,color:'blue',clock:'synthetic-grid'};
            adjustmentSelections.slice(0,3).forEach(v=>v[2]=amountText);memoValues[2]=amountText;
            const pool=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>({blade,direction,predictions:[],
              line:getDirectionLine(target.red,'red',null,blade,direction),
              blue:getDirectionLine(target.blue,'blue',null,blade,direction)})));
            const cs=getLinkRankingCandidates(pool).map(c=>P.attach({blade:c.blade,direction:c.direction,
              amount:c.amount,amountText:c.amountText,predictions:c.predictions,
              units:{red:getGuideMovementUnit(c.line),blue:getGuideMovementUnit(c.blue)}},
              {x:CHART_CENTER_X,y:CHART_CENTER_Y,radius:CHART_RADIUS}));
            const snapshot=JSON.stringify(cs),current=parent.LinkRankingBeforeTwoStage.select(cs,h,b),result=P.rank(cs,h,b);
            const trial=result.comparisonCandidate,a=P.assess(current,h,b),z=P.assess(trial,h,b);
            const guardedResult=P.rank(cs,h,b,undefined,{protectNominalBoth:true});
            const guarded=guardedResult.comparisonCandidate,guardedAssessment=P.assess(guarded,h,b);
            const geometricResult=P.rank(cs,h,b,undefined,{geometryPriority:true});
            const geometric=geometricResult.comparisonCandidate,gAssessment=P.assess(geometric,h,b);
            const ggResult=P.rank(cs,h,b,undefined,{geometryPriority:true,protectNominalBoth:true});
            const ggAssessment=P.assess(ggResult.comparisonCandidate,h,b);
            const maintained=cs.filter(c=>P.assess(c,h,b).hovMaintenancePredicted===true);
            const currentOrder=numberOrder([...cs],pool=>parent.LinkRankingBeforeTwoStage.select(pool,h,b));
            const flatOrder=numberOrder([...cs],pool=>P.rank(pool,h,b,undefined,Q.options).comparisonCandidate);
            for(const v of twoStageComparisons){
              const result=Q.rank(cs,h,b,{mode:v.id}),selected=result.comparisonCandidate;
              const assessment=Q.evidence(selected,h,b),order=result.ranked.map(row=>row.candidate);
              const directions=result.directions;
              if(v.id==='improvement-aware')check(BalanceLinkRanking.rank(cs,h,b).ranked.map(key).join('|')===order.map(key).join('|'),
                'production complete order matches independent two-stage grid reference');
              for(const counts of [v.all,maintained.length?v.maintenanceAvailable:v.diagnosticOnly]){
                accumulate(counts,current,selected,a,assessment);
                counts.rankOrderChanged+=order.map(key).join('|')!==currentOrder.map(key).join('|');
                counts.numberOrderChanged+=order.map(c=>c.blade).join('|')!==currentOrder.map(c=>c.blade).join('|');
                counts.firstNumberChanged+=current.blade!==selected.blade;
                counts.firstDirectionChanged+=current.direction!==selected.direction;
                counts.changedFromFlatKnownFirst+=key(selected)!==key(flatOrder[0]);
                counts.rankOrderChangedFromFlatKnownFirst+=order.map(key).join('|')!==flatOrder.map(key).join('|');
                counts.numberOrderChangedFromFlatKnownFirst+=order.map(c=>c.blade).join('|')!==flatOrder.map(c=>c.blade).join('|');
                counts.lostHovMaintenance+=a.hovMaintenancePredicted===true&&assessment.hovMaintenancePredicted!==true;
                counts.selectedGeometricOnly+=assessment.cruiseEvidence==='geometry-only-improvement-possible';
                counts.selectedKnownCruiseWorsening+=assessment.cruiseEvidence==='predicted-worsening';
                counts.selectedKnownCruiseImprovement+=assessment.cruiseEvidence==='predicted-improvement';
                for(const d of directions){
                  const previous=currentOrder.find(c=>c.blade===d.blade),old=Q.evidence(previous,h,b);
                  counts.perNumberDirectionChanges+=previous.direction!==d.candidate.direction;
                  counts.perNumberDirectionChangesFromFlatKnownFirst+=flatOrder.find(c=>c.blade===d.blade).direction!==d.candidate.direction;
                  counts.perNumberHovMaintenanceLost+=old.hovMaintenancePredicted===true&&d.assessment.hovMaintenancePredicted!==true;
                  counts.perNumberJointLost+=old.nominalBothWithin&&!d.assessment.nominalBothWithin;
                  counts.perNumberCurrentCruiseMissing+=old.cruiseEndpoint===null;
                  counts.perNumberNewCruiseMissing+=d.assessment.cruiseEndpoint===null;
                  counts.perNumberNewlyMissing+=old.cruiseEndpoint!==null&&d.assessment.cruiseEndpoint===null;
                  counts.perNumberRecoveredMissing+=old.cruiseEndpoint===null&&d.assessment.cruiseEndpoint!==null;
                  counts.directionsGeometricOnly+=d.assessment.cruiseEvidence==='geometry-only-improvement-possible';
                  if(old.cruiseEndpoint!==null&&d.assessment.cruiseEndpoint!==null){
                    counts.perNumberCruiseBothKnown++;
                    counts.perNumberCruiseWorse+=d.assessment.cruiseEndpoint>old.cruiseEndpoint;
                  }
                }
              }
              check(directions.length===3&&new Set(order.map(c=>c.blade)).size===3,'two-stage ranks exactly three distinct No.');
              check(order.every(c=>directions.some(d=>d.candidate===c)), 'two-stage cannot switch a fixed direction at stage two');
              if(v.id==='same-rule')check(order.map(key).join('|')===flatOrder.map(key).join('|'),
                'same-rule two-stage complete order equals flat ranking on every grid condition');
              for(const d of directions){
                const pair=cs.filter(c=>c.blade===d.blade);
                if(pair.some(c=>P.assess(c,h,b).nominalBothWithin))check(d.assessment.nominalBothWithin,
                  'per-No direction selection preserves an available joint forecast');
                if(pair.some(c=>P.assess(c,h,b).hovMaintenancePredicted===true))check(d.assessment.hovMaintenancePredicted===true,
                  'per-No direction selection preserves available HOV maintenance');
              }
              if(maintained.length)check(assessment.hovMaintenancePredicted===true,'two-stage top retains HOV maintenance');
              if(cs.some(c=>P.assess(c,h,b).nominalBothWithin))check(assessment.nominalBothWithin,'two-stage top protects both endpoint forecasts');
              check(assessment.cruiseEndpoint!==null||!assessment.nominalBothWithin,'two-stage missing never counts as both goals');
              check(result.confirmedRecommendation===null&&!assessment.confirmedPass&&!assessment.realWorldValidated,
                'two-stage never confirms unverified success');
              const example={h,b,ha,ba,amountText,maintenanceAvailable:!!maintained.length,
                current:compact(current),next:compact(selected),currentOrder:currentOrder.map(key),
                newOrder:order.map(key),directions:directions.map(d=>compact(d.candidate))};
              if(maintained.length&&a.cruiseEndpoint!==null&&assessment.cruiseEndpoint!==null
                &&assessment.cruiseEndpoint>a.cruiseEndpoint&&v.adverseExamples.length<3)v.adverseExamples.push(example);
              if(maintained.length&&a.cruiseEndpoint!==null&&assessment.cruiseEndpoint===null&&v.newMissingExamples.length<3)
                v.newMissingExamples.push(example);
              if(order.map(key).join('|')!==flatOrder.map(key).join('|')&&v.changedFromFlatExamples.length<3)
                v.changedFromFlatExamples.push({...example,flatKnownFirst:compact(flatOrder[0]),flatNumberOrder:flatOrder.map(key),
                  flatDirections:flatOrder.map(compact)});
            }
            const next=ggResult.comparisonCandidate;
            accumulate(comparison.all,current,next,a,ggAssessment);
            accumulate(maintained.length?comparison.maintenanceAvailable:comparison.diagnosticOnly,current,next,a,ggAssessment);
            for(const v of endpointComparisons){
              const result=P.rank(cs,h,b,undefined,v.options),selected=result.comparisonCandidate;
              const assessment=P.assess(selected,h,b);
              accumulate(v.all,current,selected,a,assessment);
              accumulate(maintained.length?v.maintenanceAvailable:v.diagnosticOnly,current,selected,a,assessment);
              const wasWorse=maintained.length&&a.cruiseEndpoint!==null&&ggAssessment.cruiseEndpoint!==null
                &&ggAssessment.cruiseEndpoint>a.cruiseEndpoint;
              if(wasWorse){
                v.previous26.cases++;
                if(assessment.cruiseEndpoint===null)v.previous26.becameMissing++;
                else if(assessment.cruiseEndpoint>a.cruiseEndpoint)v.previous26.stillWorseKnown++;
                else v.previous26.resolvedKnown++;
              }
              const describe=c=>({blade:c.blade,direction:c.direction,amountText:c.amountText,...P.assess(c,h,b)});
              if(maintained.length&&a.cruiseEndpoint!==null&&assessment.cruiseEndpoint!==null
                &&assessment.cruiseEndpoint>a.cruiseEndpoint&&v.remainingAdverseExamples.length<3)
                v.remainingAdverseExamples.push({h,b,ha,ba,amountText,current:describe(current),next:describe(selected)});
              if(maintained.length&&(selected.blade!==next.blade||selected.direction!==next.direction)
                &&v.changedFromPriorExamples.length<3)
                v.changedFromPriorExamples.push({h,b,ha,ba,amountText,prior:describe(next),next:describe(selected)});
              if(maintained.length)check(assessment.hovMaintenancePredicted===true,
                v.id+' retains available HOV maintenance');
              if(cs.some(c=>P.assess(c,h,b).nominalBothWithin))check(assessment.nominalBothWithin,
                v.id+' retains available joint attainment forecast');
              check(assessment.cruiseEndpoint!==null||!assessment.nominalBothWithin,
                v.id+' missing Cruise endpoint cannot count as attainment');
              check(result.confirmedRecommendation===null&&!assessment.confirmedPass&&!assessment.realWorldValidated,
                v.id+' does not invent real-world validation');
            }
            const describeProtected=c=>({blade:c.blade,direction:c.direction,amountText:c.amountText,
              ...P.assess(c,h,b),cruiseAngle:c.geometries.blue?.angleToCenter??null,
              cruiseRayMinimum:c.geometries.blue?.minimumRadius??null,
              sources:c.predictions.map(p=>({color:p.color,source:p.source}))});
            const protectedExample={h,b,ha,ba,amountText,maintenanceAvailable:!!maintained.length,
              current:describeProtected(current),next:describeProtected(next)};
            if(maintained.length){
              const examples=comparison.adverseExamples;
              if(a.cruiseEndpoint!==null&&ggAssessment.cruiseEndpoint===null&&examples.newMissing.length<3)
                examples.newMissing.push(protectedExample);
              if(ggAssessment.hovEndpoint>a.hovEndpoint&&examples.hovWorseInside.length<3)
                examples.hovWorseInside.push(protectedExample);
              if(a.cruiseEndpoint!==null&&ggAssessment.cruiseEndpoint!==null){
                if(ggAssessment.cruiseEndpoint>a.cruiseEndpoint){
                  if(examples.cruiseWorse.length<3)examples.cruiseWorse.push(protectedExample);
                  const increase=ggAssessment.cruiseEndpoint-a.cruiseEndpoint;
                  if(!comparison.worstKnownCruiseIncrease||increase>comparison.worstKnownCruiseIncrease.increase)
                    comparison.worstKnownCruiseIncrease={increase,...protectedExample};
                }
                if(Math.max(ggAssessment.hovEndpoint,ggAssessment.cruiseEndpoint)>Math.max(a.hovEndpoint,a.cruiseEndpoint)
                  &&examples.maximumWorse.length<3)examples.maximumWorse.push(protectedExample);
              }
            }
            summary.cases++;summary.changed+=current.blade!==trial.blade||current.direction!==trial.direction;
            summary.currentNominalBothWithin+=a.nominalBothWithin;summary.trialNominalBothWithin+=z.nominalBothWithin;
            summary.lostNominalBothWithin+=a.nominalBothWithin&&!z.nominalBothWithin;
            summary.gainedNominalBothWithin+=!a.nominalBothWithin&&z.nominalBothWithin;
            summary.lostNominalHovMaintenance+=a.hovMaintenancePredicted===true&&z.hovMaintenancePredicted!==true;
            summary.currentCruiseInward+=a.cruiseInward===true;summary.trialCruiseInward+=z.cruiseInward===true;
            summary.currentCruiseMissing+=a.cruiseEndpoint===null;summary.trialCruiseMissing+=z.cruiseEndpoint===null;
            summary.no1DownSelections+=trial.blade===1&&trial.direction==='DOWN';
            summary.confirmedPasses+=z.confirmedPass;
            summary.guardedChanged+=current.blade!==guarded.blade||current.direction!==guarded.direction;
            summary.guardedNominalBothWithin+=guardedAssessment.nominalBothWithin;
            summary.guardedLostNominalBothWithin+=a.nominalBothWithin&&!guardedAssessment.nominalBothWithin;
            summary.guardedCruiseInward+=guardedAssessment.cruiseInward===true;
            summary.guardedCruiseMissing+=guardedAssessment.cruiseEndpoint===null;
            summary.geometricChanged+=current.blade!==geometric.blade||current.direction!==geometric.direction;
            summary.geometricNominalBothWithin+=gAssessment.nominalBothWithin;
            summary.geometricLostNominalBothWithin+=a.nominalBothWithin&&!gAssessment.nominalBothWithin;
            summary.geometricCruiseMissing+=gAssessment.cruiseEndpoint===null;
            summary.geometricNo1DownSelections+=geometric.blade===1&&geometric.direction==='DOWN';
            summary.geometricGuardedNominalBothWithin+=ggAssessment.nominalBothWithin;
            summary.geometricGuardedLostNominalBothWithin+=a.nominalBothWithin&&!ggAssessment.nominalBothWithin;
            if(maintained.length){
              summary.casesWithNominalHovMaintenance++;
              summary.maintainedDirectionChanged+=current.blade!==trial.blade||current.direction!==trial.direction;
              summary.maintainedCurrentCruiseInward+=a.cruiseInward===true;
              summary.maintainedTrialCruiseInward+=z.cruiseInward===true;
            }else{
              summary.casesWithoutNominalHovMaintenance++;
              summary.diagnosticOnlyChanged+=current.blade!==trial.blade||current.direction!==trial.direction;
            }
            const describe=c=>({blade:c.blade,direction:c.direction,amountText:c.amountText,...P.assess(c,h,b)});
            const example={h,b,ha,ba,amountText,current:describe(current),trial:describe(trial)};
            if(a.nominalBothWithin&&!z.nominalBothWithin&&summary.lostBothExamples.length<3)summary.lostBothExamples.push(example);
            if(a.cruiseEndpoint!==null&&z.cruiseEndpoint===null&&summary.newMissingExamples.length<3)summary.newMissingExamples.push(example);
            if(maintained.length)check(z.hovMaintenancePredicted===true,'grid preserves available predicted HOV maintenance');
            if(maintained.some(c=>P.assess(c,h,b).cruiseInward===true))
              check(z.cruiseInward===true,'grid Cruise direction priority within nominal HOV maintenance');
            check(result.confirmedRecommendation===null&&!z.confirmedPass&&!z.realWorldValidated,
              'grid comparisons never become validated recommendations or passes');
            if(cs.some(c=>P.assess(c,h,b).nominalBothWithin))
              check(guardedAssessment.nominalBothWithin,'joint guard preserves any available nominal joint forecast');
            check(guardedResult.confirmedRecommendation===null&&!guardedAssessment.confirmedPass,
              'joint guard never confirms actual success');
            if(maintained.length)check(gAssessment.hovMaintenancePredicted===true&&ggAssessment.hovMaintenancePredicted===true,
              'geometric ordering preserves nominal HOV maintenance');
            if(cs.some(c=>P.assess(c,h,b).nominalBothWithin))check(ggAssessment.nominalBothWithin,
              'geometric ordering with joint guard preserves available nominal joint forecast');
            check(geometricResult.confirmedRecommendation===null&&ggResult.confirmedRecommendation===null
              &&!gAssessment.confirmedPass&&!ggAssessment.confirmedPass,'geometric priority never certifies real success');
            check(JSON.stringify(cs)===snapshot,'grid comparison does not modify endpoints or geometry');
          }
      }finally{
        target.red=redBefore;target.blue=blueBefore;
        adjustmentSelections.forEach((v,i)=>v.splice(0,v.length,...selectionsBefore[i]));
        memoValues.splice(0,memoValues.length,...memoBefore);
      }
      check(summary.cases===2592,'complete declared HOV-inside position and amount grid');
      check(summary.lostNominalHovMaintenance===0,'no available nominal HOV maintenance lost across grid');
      check(summary.confirmedPasses===0,'all grid results remain unvalidated');
      for(const counts of [comparison.all,comparison.maintenanceAvailable,comparison.diagnosticOnly]){
        check(counts.newCruiseMissing-counts.currentCruiseMissing===counts.newlyMissing-counts.recoveredMissing,
          'protected comparison missing counts reconcile, no missing endpoint is a pass');
        check(counts.lostBoth===0&&counts.currentBoth===counts.newBoth,'protected comparison preserves nominal joint count');
      }
      check(comparison.all.cases===comparison.maintenanceAvailable.cases+comparison.diagnosticOnly.cases,
        'maintenance and diagnostic comparison scopes partition the grid');
      check(comparison.maintenanceAvailable.cruiseEndpointWorse===26
        &&comparison.all.newCruiseMissing-comparison.all.currentCruiseMissing===266,
        'exact preceding 26 worsening and 266 missing increase baseline reproduced');
      for(const v of endpointComparisons){
        check(v.previous26.cases===26&&v.previous26.cases===v.previous26.resolvedKnown
          +v.previous26.stillWorseKnown+v.previous26.becameMissing,v.id+' tracks all original worsening cases without hiding them as missing');
        for(const counts of [v.all,v.maintenanceAvailable,v.diagnosticOnly]){
          check(counts.currentBoth===counts.newBoth&&counts.lostBoth===0,v.id+' preserves joint forecast count');
          check(counts.newCruiseMissing-counts.currentCruiseMissing===counts.newlyMissing-counts.recoveredMissing,
            v.id+' missing transitions reconcile');
        }
      }
      for(const v of twoStageComparisons){
        for(const counts of [v.all,v.maintenanceAvailable,v.diagnosticOnly]){
          check(counts.lostBoth===0&&counts.lostHovMaintenance===0,'two-stage joint and HOV protection across grid');
          check(counts.perNumberHovMaintenanceLost===0&&counts.perNumberJointLost===0,
            'two-stage protects existing joint and HOV forecasts separately for every No.');
          check(counts.perNumberNewCruiseMissing-counts.perNumberCurrentCruiseMissing
            ===counts.perNumberNewlyMissing-counts.perNumberRecoveredMissing,
            'two-stage missing counts for all three directions reconcile separately from first place');
          check(counts.newCruiseMissing-counts.currentCruiseMissing===counts.newlyMissing-counts.recoveredMissing,
            'two-stage missing transitions reconcile');
        }
        check(v.all.cases===v.maintenanceAvailable.cases+v.diagnosticOnly.cases,'two-stage scopes partition full grid');
        if(v.id==='same-rule')check(v.all.changedFromFlatKnownFirst===0&&v.all.rankOrderChangedFromFlatKnownFirst===0,
          'same-rule splitting alone cannot change the selected candidate or lower order');
      }
      return summary;
    })()`);
    assert(immutable()===sweepBefore,'grid restores fixture positions, amounts, forecasts, guides, learning and records');

    // Geometry grid independently checks the quadratic disk condition and ray minima.
    report.geometryGrid={cases:0};
    for(const radius of [0,.05,.19,.2,.21,.35])for(let angle=0;angle<360;angle+=30)for(let direction=0;direction<360;direction+=30){
      const r={x:radius*Math.cos(angle*Math.PI/180),y:radius*Math.sin(angle*Math.PI/180)};
      const u={x:Math.cos(direction*Math.PI/180),y:Math.sin(direction*Math.PI/180)};
      const g=P.geometry(r,u), t=Math.max(0,-(r.x*u.x+r.y*u.y));
      assert(near(g.minimumRadius,Math.hypot(r.x+t*u.x,r.y+t*u.y)),'grid forward minimum');
      for(const travel of [.001,.05,.15,.3,.6]){
        const distance=Math.hypot(r.x+travel*u.x,r.y+travel*u.y);
        const intervalContains=!!g.interval&&travel>=g.interval[0]&&travel<=g.interval[1];
        if(Math.abs(distance-.2)>1e-12)assert(intervalContains===(distance<=.2),'grid interval versus independent endpoint');
      }
      report.geometryGrid.cases++;
    }
    assert(run('JSON.stringify([selectLinkGuideCandidate.toString(),learning.predict.toString(),BalanceDistancePrior.resolve.toString()])')===sources,
      'original selectors and prediction functions never replaced');
    assert(storageSnapshot()===nativeBefore,'normal browser storage unchanged');
    const image=report.fixtures[0], eighth=image.amounts.find(a=>a.amountText==='1/8'), quarter=image.amounts.find(a=>a.amountText==='1/4');
    const down = row=>row.candidates.find(c=>c.blade===1&&c.direction==='DOWN');
    assert(down(eighth).assessment.hovMaintenancePredicted===true,'image No.1 DOWN eighth nominal HOV maintenance');
    assert(down(quarter).assessment.hovMaintenancePredicted===false,'image No.1 DOWN quarter nominal HOV outside');
    assert(down(eighth).assessment.cruiseInward===true&&down(eighth).assessment.cruiseEndpoint===null,
      'image No.1 DOWN Cruise direction is useful but endpoint remains unknown');
    assert(eighth.geometric==='1 DOWN 1/8'&&eighth.geometricGuarded==='1 DOWN 1/8',
      'image eighth geometric priority selects No.1 DOWN without claiming its unknown Cruise endpoint');
    assert(eighth.currentNumberOrder.join('|')==='3 UP 1/8|2 UP 1/8|1 UP 1/8'
      &&eighth.newNumberOrder.join('|')==='1 DOWN 1/8|3 UP 1/8|2 UP 1/8',
      'image No.1 changes from third UP choice to first DOWN choice under protected geometric comparison');
    for(const v of eighth.endpointChoices)assert(v.numberOrder.join('|')==='3 UP 1/8|2 UP 1/8|1 DOWN 1/8',
      v.id+' puts No.1 DOWN eighth third after known improving Cruise endpoints');
    for(const v of eighth.twoStageChoices){
      const no1=v.directions.find(d=>d.blade===1);
      assert(no1.choice==='1 DOWN 1/8'&&no1.assessment.cruiseEndpoint===null
        &&no1.assessment.cruiseEvidence==='geometry-only-improvement-possible'&&!no1.assessment.nominalBothWithin,
        v.id+' keeps image No.1 DOWN as a geometric possibility without inventing its endpoint');
      assert(v.numberOrder.join('|')==='3 UP 1/8|2 UP 1/8|1 DOWN 1/8',v.id+' ranks selected image No.1 DOWN third');
    }
    for(const v of report.fixtures.find(f=>f.id==='overshoot').amounts.find(a=>a.amountText==='1/2').endpointChoices)
      assert(v.choice==='1 UP 1/2',v.id+' resolves the preceding worst known overshoot example');
    report.checks=checks;
    globalThis.maintenanceReport=report;
    output.textContent=`PASS: ${checks} checks\n`+JSON.stringify(report,null,2);document.title='PASS';
    renderUI(report);
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}\n`+JSON.stringify(report,null,2);document.title='FAIL';}

  function renderUI(report){
    const fixtureSelect=document.getElementById('fixture'),amountSelect=document.getElementById('amount');
    report.fixtures.forEach((f,i)=>fixtureSelect.add(new Option(f.label,String(i))));
    report.fixtures[0].amounts.forEach(a=>amountSelect.add(new Option(a.amountText,a.amountText)));amountSelect.value='1/8';
    const num=x=>x===null||x===undefined?'欠測':Math.abs(x-.2)<1e-6?String(x):x.toFixed(6);
    const dir=g=>!g?'未知':g.angleToCenter===null?'中心（角度なし）':`${g.inwardProjection>0?'中心向き':'接線／外向き'} (${g.angleToCenter.toFixed(1)}°)`;
    const range=g=>g?.interval?g.interval.map(num).join(' ～ '):'なし';
    function draw(){
      const f=report.fixtures[Number(fixtureSelect.value)],a=f.amounts.find(a=>a.amountText===amountSelect.value);
      const status=a.trialStatus==='nominal-maintenance'?'HOVは名目上維持':a.trialStatus==='geometry-only'?'幾何学的可能性のみ':'診断のみ・HOV維持予測候補なし';
      document.getElementById('selection').textContent=`同量の現行選択：${a.current} ／ 方向符号優先：${a.trial} ／ 両予測圏内保護：${a.guarded} ／ 幾何重視：${a.geometric} ／ 幾何重視＋両予測圏内保護：${a.geometricGuarded}。${a.endpointChoices.map(v=>v.label+'：'+v.numberOrder.join(' → ')).join(' ／ ')}。${status}。いずれも合格確定・実調整推奨なし。`;
      document.getElementById('selection').textContent+=' '+a.twoStageChoices.map(v=>v.label+'：'+v.numberOrder.join(' → ')
        +'（方向選択：'+v.directions.map(d=>d.choice+' / '+d.assessment.cruiseEvidence).join('、')+'）').join(' ／ ');
      const table=document.getElementById('comparison');table.replaceChildren();
      const head=table.insertRow();['候補','HOV方向','HOV最短中心距離','HOV圏内の移動距離範囲','HOV予測移動','HOV予測終点','HOV予測維持','巡航方向','巡航最短中心距離','巡航0.2内の移動距離範囲','巡航予測移動','巡航予測終点','予測の由来／実測確認'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.append(th);});
      for(const c of a.candidates){
        const row=table.insertRow();if(c.blade===1&&c.direction==='DOWN')row.className='focus';
        const h=c.predictions.find(p=>p.color==='red'),b=c.predictions.find(p=>p.color==='blue');
        [key(c),dir(c.geometries.red),num(c.geometries.red.minimumRadius),range(c.geometries.red),num(h.predictedTravel),num(h.predictedDistance),
          c.assessment.hovMaintenancePredicted===null?'未予測':c.assessment.hovMaintenancePredicted?'名目上は維持':'名目上は圏外',
          dir(c.geometries.blue),num(c.geometries.blue?.minimumRadius),range(c.geometries.blue),num(b?.predictedTravel),num(b?.predictedDistance),
          `${h.source} / ${b?.source??'未測定'} ／ 実測未検証`].forEach(t=>row.insertCell().textContent=t);
      }
      const svg=document.getElementById('geometry');svg.replaceChildren();
      const ns='http://www.w3.org/2000/svg',node=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);svg.append(n);return n;};
      const scale=400,coord=p=>({x:260+p.x*scale,y:260+p.y*scale});
      for(const radius of [.2,.6])node('circle',{cx:260,cy:260,r:radius*scale,fill:'none',stroke:'#9aa7b7','stroke-width':radius===.2?2:1});
      node('path',{d:'M250 260h20M260 250v20',stroke:'#8b97a7'});
      for(const c of a.candidates.filter(c=>c.blade===1))for(const p of c.predictions){
        const g=c.geometries[p.color],color=p.color==='red'?'#d60000':'#0066ff';
        const r={x:(p.start.x-397)/240,y:(p.start.y-520)/240},start=coord(r);
        const end=coord({x:r.x+g.unit.x*.5,y:r.y+g.unit.y*.5}),dash=c.direction==='DOWN'?'6 5':'none';
        node('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,stroke:color,'stroke-dasharray':dash});
        const tip=coord({x:r.x+g.unit.x*.5,y:r.y+g.unit.y*.5});
        node('path',{d:`M${tip.x-g.unit.x*10-g.unit.y*4} ${tip.y-g.unit.y*10+g.unit.x*4}L${tip.x} ${tip.y}L${tip.x-g.unit.x*10+g.unit.y*4} ${tip.y-g.unit.y*10-g.unit.x*4}`,fill:'none',stroke:color});
        node('circle',{cx:start.x,cy:start.y,r:4,fill:color});
        const closest=coord({x:r.x+g.unit.x*g.closestTravel,y:r.y+g.unit.y*g.closestTravel});
        node('circle',{cx:closest.x,cy:closest.y,r:2,fill:'#777'});
        if(p.position){const e=coord({x:(p.position.x-397)/240,y:(p.position.y-520)/240});
          if(c.direction==='UP')node('rect',{x:e.x-4,y:e.y-4,width:8,height:8,fill:'white',stroke:color});
          else node('path',{d:`M${e.x} ${e.y-5}l5 5l-5 5l-5-5Z`,fill:'white',stroke:color});}
      }
    }
    fixtureSelect.onchange=draw;amountSelect.onchange=draw;draw();
    const download=document.getElementById('download');download.disabled=false;download.onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='link-maintenance-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }
})();
