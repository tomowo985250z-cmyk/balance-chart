/* Comparison only. Never loaded by index.html; never generates learned data. */
(() => {
  const limit = .2;
  const finite = value => Number.isFinite(value) && value >= 0;
  const endpoint = (candidate, color) => {
    const p = candidate?.predictions?.find(p => p.color === color);
    return p && !p.fallbackLine && finite(p.predictedDistance) ? p.predictedDistance : null;
  };
  // Coordinates and travel are IPS. The closed interval is a geometric ray/disk
  // intersection, not a forecast, a confidence interval, or an amount in flats.
  function geometry(r, vector) {
    if (!r || !vector || ![r.x, r.y, vector.x, vector.y].every(Number.isFinite)) return null;
    const length = Math.hypot(vector.x, vector.y);
    if (!length) return null;
    const unit = { x: vector.x / length, y: vector.y / length };
    const radius = Math.hypot(r.x, r.y);
    const projection = -(r.x * unit.x + r.y * unit.y);
    const closestTravel = Math.max(0, projection);
    const minimumRadius = Math.hypot(r.x + closestTravel * unit.x, r.y + closestTravel * unit.y);
    const lineMinimum = Math.abs(r.x * unit.y - r.y * unit.x);
    let interval = null;
    if (lineMinimum <= limit) {
      const half = Math.sqrt((limit - lineMinimum) * (limit + lineMinimum));
      const lower = Math.max(0, projection - half), upper = projection + half;
      if (upper >= lower) interval = [lower, upper];
    }
    return { radius, unit, inwardProjection: projection,
      inwardCosine: radius ? projection / radius : null,
      angleToCenter: radius ? Math.acos(Math.max(-1, Math.min(1, projection / radius))) * 180 / Math.PI : null,
      closestTravel, minimumRadius, interval,
      positiveTravelPossible: !!interval && interval[1] > 0,
      maintenanceTravelUpper: radius <= limit && interval ? interval[1] : null };
  }
  function attach(candidate, center) {
    const geometries = {};
    const predictions = candidate.predictions.map(p => {
      const unit = candidate.units?.[p.color];
      const r = p.start ? { x: (p.start.x - center.x) / center.radius,
        y: (p.start.y - center.y) / center.radius } : null;
      geometries[p.color] = geometry(r, unit);
      return { ...p, predictedTravel: p.position && p.start && !p.fallbackLine
        ? Math.hypot(p.position.x - p.start.x, p.position.y - p.start.y) / center.radius : null };
    });
    return { ...candidate, predictions, geometries };
  }
  function assess(candidate, currentHov, currentCruise) {
    const h = endpoint(candidate, 'red'), b = endpoint(candidate, 'blue');
    const cruiseMeasured = finite(currentCruise), g = candidate?.geometries;
    const required = cruiseMeasured ? ['red', 'blue'] : ['red'];
    const uncertain = required.some(color => {
      const p = candidate?.predictions?.find(p => p.color === color);
      return endpoint(candidate, color) === null || p?.uncertain || p?.source !== 'learned';
    });
    return { hovEndpoint: h, cruiseEndpoint: b,
      hovMaintenancePredicted: finite(currentHov) && currentHov <= limit && h !== null ? h <= limit : null,
      hovMaintenanceGeometricallyPossible: finite(currentHov) && currentHov <= limit
        && !!g?.red?.positiveTravelPossible,
      nominalBothWithin: finite(currentHov) && h !== null && h <= limit
        && cruiseMeasured && b !== null && b <= limit,
      cruiseInward: cruiseMeasured && g?.blue ? g.blue.inwardProjection > 0 : null,
      cruiseImprovementPredicted: cruiseMeasured && b !== null ? currentCruise - b : null,
      hovBoundaryMargin: h === null ? null : limit - h,
      uncertain, realWorldValidated: false, confirmedPass: false };
  }
  const maintenanceTier = a => a.hovMaintenancePredicted === true ? 0
    : a.hovMaintenancePredicted === null && a.hovMaintenanceGeometricallyPossible ? 1 : 2;
  const cruiseTier = a => a.cruiseInward === true ? 0 : a.cruiseInward === false ? 1 : 2;
  function rank(candidates, currentHov, currentCruise, fallback,
    { protectNominalBoth = false, geometryPriority = false, cruiseEndpointPolicy = 'geometry' } = {}) {
    if(!['geometry','known-first','improvement-first'].includes(cruiseEndpointPolicy))throw RangeError('Unknown Cruise endpoint policy');
    if (!finite(currentHov)) return { applicable: false, ranked: [], comparisonCandidate: null, comparisonStatus:'unmeasured', confirmedRecommendation: null };
    if (currentHov > limit) return { applicable: false, ranked: [],
      comparisonCandidate: fallback?.(candidates, currentHov, currentCruise) ?? null, comparisonStatus:'outside-scope', confirmedRecommendation: null };
    const rows = candidates.map(candidate => ({ candidate, assessment: assess(candidate, currentHov, currentCruise) }));
    rows.sort((a, b) => {
      if (protectNominalBoth) {
        const joint = Number(b.assessment.nominalBothWithin) - Number(a.assessment.nominalBothWithin);
        if (joint) return joint;
      }
      const first = maintenanceTier(a.assessment) - maintenanceTier(b.assessment);
      if (first) return first;
      if (finite(currentCruise)) {
        const direction = cruiseTier(a.assessment) - cruiseTier(b.assessment);
        if (direction) return direction;
        if(cruiseEndpointPolicy!=='geometry'&&a.assessment.cruiseInward===true){
          const x=a.assessment.cruiseEndpoint,y=b.assessment.cruiseEndpoint;
          const tier=value=>cruiseEndpointPolicy==='known-first'?(value===null?1:0)
            :value===null?1:value<=currentCruise?0:2;
          const reliability=tier(x)-tier(y);
          if(reliability)return reliability;
          // A real forecast endpoint includes insufficient travel and overshoot.
          // Unknown travel remains unknown; it is never assigned an endpoint.
          if(x!==null&&y!==null&&x!==y)return x<y?-1:1;
        }
        if (geometryPriority && a.assessment.cruiseInward === true) {
          const x=a.candidate.geometries.blue,y=b.candidate.geometries.blue;
          const possible=Number(y.positiveTravelPossible)-Number(x.positiveTravelPossible);
          if(possible)return possible;
          if(x.inwardCosine!==y.inwardCosine)return x.inwardCosine>y.inwardCosine?-1:1;
        }
        // Compare Cruise endpoints only within the same direction class. No HOV
        // endpoint, inward sign, margin, or improvement is used as a tiebreaker.
        const x = a.assessment.cruiseEndpoint ?? Infinity, y = b.assessment.cruiseEndpoint ?? Infinity;
        if (x !== y) return x < y ? -1 : 1;
      }
      return a.candidate.amount - b.candidate.amount || a.candidate.blade - b.candidate.blade
        || Number(a.candidate.direction === 'DOWN') - Number(b.candidate.direction === 'DOWN');
    });
    return { applicable: true, ranked: rows, comparisonCandidate: rows[0]?.candidate ?? null,
      comparisonStatus: !rows.length ? 'none' : maintenanceTier(rows[0].assessment)===0 ? 'nominal-maintenance'
        : maintenanceTier(rows[0].assessment)===1 ? 'geometry-only' : 'diagnostic-no-maintenance-forecast',
      confirmedRecommendation: null };
  }
  globalThis.LinkMaintenancePolicy = Object.freeze({ limit, endpoint, geometry, attach, assess, rank });
})();
