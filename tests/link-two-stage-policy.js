/* Trial only: one shared amount, choose UP/DOWN per No., then rank the winners. */
(() => {
  const P = LinkMaintenancePolicy;
  const options = Object.freeze({protectNominalBoth:true,geometryPriority:true,cruiseEndpointPolicy:'known-first'});
  const finite = value => Number.isFinite(value) && value >= 0;
  function evidence(candidate, hov, cruise) {
    const a=P.assess(candidate,hov,cruise), g=candidate.geometries?.blue;
    const status=!finite(cruise)?'unmeasured':a.cruiseEndpoint!==null
      ?a.cruiseEndpoint<cruise?'predicted-improvement':a.cruiseEndpoint===cruise?'predicted-equal':'predicted-worsening'
      :g?.inwardProjection>0?'geometry-only-improvement-possible':'unknown-no-inward-evidence';
    return {...a,cruiseEvidence:status,
      cruiseGeometricImprovementPossible:finite(cruise)&&g?g.inwardProjection>0:null,
      cruiseGeometric02Possible:finite(cruise)&&g?g.positiveTravelPossible:null,
      cruiseRayMinimum:g?.minimumRadius??null,cruiseAngle:g?.angleToCenter??null};
  }
  const maintenance = a => a.hovMaintenancePredicted===true?0
    :a.hovMaintenancePredicted===null&&a.hovMaintenanceGeometricallyPossible?1:2;
  // This is an ordering of available evidence, not a probability of success.
  // Unknown travel with an inward ray is eligible before known overshoot, while
  // a known endpoint decides between two known worsening directions.
  const evidenceTier = a => ({'predicted-improvement':0,'geometry-only-improvement-possible':1,
    'predicted-equal':2,'predicted-worsening':3,'unknown-no-inward-evidence':4,unmeasured:4})[a.cruiseEvidence];
  function chooseDirection(pair, hov, cruise) {
    const rows=pair.map(candidate=>({candidate,assessment:evidence(candidate,hov,cruise)}));
    rows.sort((x,y)=>{
      const a=x.assessment,b=y.assessment;
      const joint=Number(b.nominalBothWithin)-Number(a.nominalBothWithin);
      if(joint)return joint;
      const safe=maintenance(a)-maintenance(b);
      if(safe)return safe;
      if(finite(cruise)){
        const tier=evidenceTier(a)-evidenceTier(b);
        if(tier)return tier;
        if(a.cruiseEndpoint!==null&&b.cruiseEndpoint!==null&&a.cruiseEndpoint!==b.cruiseEndpoint)
          return a.cruiseEndpoint<b.cruiseEndpoint?-1:1;
        if(a.cruiseEvidence==='geometry-only-improvement-possible'){
          const reach=Number(b.cruiseGeometric02Possible)-Number(a.cruiseGeometric02Possible);
          if(reach)return reach;
          if(a.cruiseAngle!==b.cruiseAngle)return a.cruiseAngle-b.cruiseAngle;
        }
      }
      // Never use HOV centering inside the maintained class.
      return Number(x.candidate.direction==='DOWN')-Number(y.candidate.direction==='DOWN');
    });
    return rows[0]?.candidate??null;
  }
  function rank(candidates, hov, cruise, {mode='improvement-aware'}={}) {
    if(!['same-rule','improvement-aware'].includes(mode))throw RangeError('Unknown two-stage mode');
    if(candidates.some(c=>!finite(c.amount)||![1,2,3].includes(c.blade)||!['UP','DOWN'].includes(c.direction)))
      throw RangeError('Invalid trial candidate');
    if(new Set(candidates.map(c=>c.amount)).size>1)throw RangeError('Compare a single shared amount');
    if(new Set(candidates.map(c=>c.blade+':'+c.direction)).size!==candidates.length)
      throw RangeError('Duplicate direction at the same amount');
    if(!finite(hov)||hov>P.limit)return {applicable:false,mode,directions:[],ranked:[],
      comparisonCandidate:null,confirmedRecommendation:null,realWorldValidated:false};
    const directions=[1,2,3].flatMap(blade=>{
      const pair=candidates.filter(c=>c.blade===blade);
      if(!pair.length)return [];
      const candidate=mode==='same-rule'?P.rank(pair,hov,cruise,undefined,options).comparisonCandidate
        :chooseDirection(pair,hov,cruise);
      return [{blade,candidate,assessment:evidence(candidate,hov,cruise),
        alternatives:pair.map(c=>({candidate:c,assessment:evidence(c,hov,cruise)}))}];
    });
    const second=P.rank(directions.map(row=>row.candidate),hov,cruise,undefined,options);
    return {...second,mode,directions,realWorldValidated:false};
  }
  globalThis.LinkTwoStagePolicy=Object.freeze({evidence,rank,options});
})();
