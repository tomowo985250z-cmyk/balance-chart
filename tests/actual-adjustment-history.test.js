(() => {
  let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  const near=(a,b,label)=>assert(Math.abs(a-b)<1e-10,label);
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use an isolated test profile');
    const data=BalanceActualAdjustmentHistory,raw=JSON.stringify(data.measurements),samples=JSON.stringify(data.samples);
    assert(data.measurements.length===6&&data.samples.length===6,'six results yield five HOV vectors and one Cruise vector');
    assert(data.samples.filter(s=>s.color==='red').length===5&&data.samples.filter(s=>s.color==='blue').length===1,'missing Cruise never bridged');
    assert(data.samples.filter(s=>s.type==='LINK').length===3&&data.samples.filter(s=>s.type==='TAB').length===3,'LINK and TAB separated');
    assert(data.samples.every(s=>s.afterResult===s.beforeResult+1),'only adjacent measurement results are linked');
    assert(!data.samples.some(s=>s.color==='blue'&&s.beforeResult!==3),'only result3→4 supplies a Cruise displacement');
    assert(data.measurements[5].action===null&&!data.samples.some(s=>s.beforeResult===6),'draft No.2 LINK and two-stage advice are excluded');
    assert(data.measurements.every(m=>!m.predictedIPS||!('clock' in m.predictedIPS)),'scalar predictions never supply coordinates');
    near(data.point({ips:1,clock:'12:00'}).x,0,'12h x');near(data.point({ips:1,clock:'12:00'}).y,-1,'12h y');
    near(data.point({ips:1,clock:'3:00'}).x,1,'3h x');near(data.point({ips:1,clock:'6:00'}).y,1,'6h y');
    assert(!data.point({ips:1,clock:'3:99'})&&!data.point({ips:-1,clock:'3:00'}),'invalid source points rejected');
    assert(data.samples.every(s=>s.provenance.singleAdjustmentConfirmed&&s.provenance.sameMeasurementConditionsConfirmed),'user confirmation retained as provenance');
    assert(data.samples.every(s=>!s.provenance.hexagonRotationKnown&&!s.provenance.predictedVectorKnown),'unknown hexagon and prediction orientation not guessed');
    assert(data.samples.every(s=>s.actualVector.distance>0&&Number.isFinite(s.actualVector.angle)),'all eligible measured vectors finite');
    assert(data.samples.filter(s=>s.historicalUIEligible).length===4,'existing historical UI accepts three LINK HOV plus one TAB Cruise sample');
    const expected=[.01,-.06,.02,0,.07,-.01,-.05];
    assert(data.residuals.length===expected.length,'seven scalar endpoint-IPS comparisons recorded');
    data.residuals.forEach((r,i)=>{
      near(r.signedRadialResidualIPS,expected[i],'signed IPS residual '+i);
      assert(r.angleError===null&&r.travelDistanceError===null&&r.endpointVectorError===null,'missing predicted XY stays unavailable');
    });
    assert(!data.residuals.some(r=>r.afterResult===5&&r.color==='blue'),'no comparison against missing result5 Cruise');
    const catalog=data.reconcile();
    assert(catalog.fresh.length===6&&catalog.duplicates.length===0,'source corpus contains no duplicate measured vectors');
    assert(Object.values(catalog.observedConditions).every(n=>n===1),'every exact No/direction/amount/color condition has only one independent event');
    assert(!data.applicationImportEnabled&&catalog.activeLearningAdditions===0,'reference registration never activates sparse models');
    const appSamples=data.samples.map(s=>({...s,key:'different-existing-key',before:{x:397+s.before.x*240,y:520+s.before.y*240},after:{x:397+s.after.x*240,y:520+s.after.y*240}}));
    assert(data.reconcile(appSamples).duplicates.length===6,'semantic duplication detected across application IDs and coordinate units');
    assert(data.reconcile([...appSamples,...appSamples]).fresh.length===0,'repeated import adds no duplicate');
    const partial=data.reconcile(appSamples.slice(0,2));assert(partial.duplicates.length===2&&partial.fresh.length===4,'partial duplicate detection is per observation');
    const changed=structuredClone(appSamples);changed[0].direction='UP';assert(data.reconcile(changed).fresh.length===1,'UP/DOWN are independent keys');
    assert(JSON.stringify(data.measurements)===raw&&JSON.stringify(data.samples)===samples,'queries and reconciliation leave original observations unchanged');
    const values=new Map(),engine=BalanceLearning.create({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},coordinates:p=>p,nominalAngle:()=>0,radius:1});
    const before=JSON.stringify(engine.inspect());data.reconcile(engine.inspect().samples);
    assert(JSON.stringify(engine.inspect())===before&&values.size===0,'catalog reads never write learning or history');
    assert(data.samples.every(s=>!BalanceDistancePrior.samples.some(p=>p.type===s.type&&p.color===s.color&&p.blade===s.blade&&p.direction===s.direction&&p.amount===s.amount&&Math.abs(p.distance-s.actualVector.distance)<1e-10)), 'no exact-distance collision with original 31 references');
    assert(Object.isFrozen(data.samples)&&data.samples.every(Object.isFrozen),'reference observations immutable');
    const req=new XMLHttpRequest();req.open('GET','../index.html',false);req.send();
    assert(!req.responseText.includes('actual-adjustment-history.js'),'application does not load experimental source data');
    document.getElementById('results').textContent=`PASS: ${checks} checks — confirmed provenance, adjacent-only vectors, missing Cruise, scalar-only residuals, semantic deduplication, sparse-data hold and no production activation`;
    document.title='PASS';
  }catch(error){document.getElementById('results').textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
