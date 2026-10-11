/* seed=91571の同じ400ケースを再現。実測・学習データではない。 */
(() => {
  function run(policy, legacySelector) {
    const epsilon = policy.epsilon, limit = policy.limit;
    const currentHov = .32, currentCruise = .33;
    let seed = 91571;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const action = c => c ? `No.${c.blade} ${c.direction}` : null;
    const summary = c => ({ action:action(c), towardCenter:c?.towardCenter,
      ...policy.assess(c,currentHov,currentCruise) });
    const goal = a => a.hov<=limit ? a.cruise<=limit?'both':'HOV-only'
      : a.cruise<=limit?'Cruise-only':'neither';
    const sign = delta => delta < -epsilon?'improved':delta>epsilon?'worsened':'unchanged';
    const delta = (before, after) => ({ hov:after.hov-before.hov, cruise:after.cruise-before.cruise,
      maximum:after.maximum-before.maximum,total:after.total-before.total });
    const variants = ['pareto','legacy-cap','unmet-no-regression','unmet-minimax','achieved-sum','combined-guard'];
    const cases = [];
    for(let i=0;i<400;i++) {
      const pool = [1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>{
        const h=random()*.45,b=random()*.45,towardCenter=random()>.5;
        return {blade,direction,amount:.25,towardCenter,maxCenterDistance:Math.max(h,b),distance:h+b,
          predictions:[{color:'red',predictedDistance:h,source:'learned'}, {color:'blue',predictedDistance:b,source:'learned'}]};
      }));
      const legacy = legacySelector(pool), selected = policy.select(pool,currentHov,currentCruise);
      const old = summary(legacy), next = summary(selected), difference = delta(old,next);
      const hasSafe = pool.some(c=>policy.endpoint(c,'red')<=limit);
      const hasBoth = pool.some(c=>policy.assess(c,currentHov,currentCruise).nominalGoalMet);
      const group = !hasBoth&&difference.maximum>epsilon ? 'maximum-52'
        : old.nominalGoalMet&&difference.total>epsilon ? 'total-11' : null;
      const reason = hasBoth?'joint-goal/maximum-before-total':hasSafe?'HOV-arrival-before-maximum':'HOV-improvement-before-maximum';
      const comparisons = Object.fromEntries(variants.map(name=>{
        const candidate=policy.selectComparison(pool,currentHov,currentCruise,name,legacy), result=summary(candidate);
        return [name,{...result,deltaFromOld:delta(old,result),deltaFromTarget:delta(next,result)}];
      }));
      cases.push({id:`S${String(i+1).padStart(3,'0')}`,group,old,next,difference,reason,
        oldGoal:goal(old),newGoal:goal(next),
        changeFromOld:`HOV-${sign(difference.hov)}/Cruise-${sign(difference.cruise)}`,
        changeFromCurrent:`HOV-${sign(next.hov-currentHov)}/Cruise-${sign(next.cruise-currentCruise)}`,
        excludedByLegacyDirection:!selected.towardCenter&&pool.some(c=>c.towardCenter),
        dominated:pool.some(c=>policy.endpoint(c,'red')<=next.hov&&policy.endpoint(c,'blue')<=next.cruise
          &&(policy.endpoint(c,'red')<next.hov-epsilon||policy.endpoint(c,'blue')<next.cruise-epsilon)),
        comparisons,pool});
    }
    const tally = (items, field) => items.reduce((counts,c)=>{const key=typeof field==='function'?field(c):c[field];counts[key]=(counts[key]??0)+1;return counts;},{});
    const stats = values => {
      const ordered=[...values].sort((a,b)=>a-b);
      return {minimum:ordered[0]??null,median:ordered.length?(ordered[(ordered.length-1)>>1]+ordered[ordered.length>>1])/2:null,
        maximum:ordered.at(-1)??null};
    };
    const groups = Object.fromEntries(['maximum-52','total-11'].map(name=>{
      const items=cases.filter(c=>c.group===name);
      return [name,{count:items.length,fromOld:tally(items,'changeFromOld'),fromCurrent:tally(items,'changeFromCurrent'),
        oldGoals:tally(items,'oldGoal'),newGoals:tally(items,'newGoal'),transitions:tally(items,c=>`${c.oldGoal}->${c.newGoal}`),
        reasons:tally(items,'reason'),excludedByLegacyDirection:items.filter(c=>c.excludedByLegacyDirection).length,
        dominated:items.filter(c=>c.dominated).length,
        deltas:Object.fromEntries(['hov','cruise','maximum','total'].map(field=>[field,stats(items.map(c=>c.difference[field]))]))}];
    }));
    const metrics = get => ({both:cases.filter(c=>get(c).nominalGoalMet).length,
      hovWithin:cases.filter(c=>get(c).hov<=limit).length,
      actualHovWorse:cases.filter(c=>get(c).hov>currentHov+epsilon).length,
      actualCruiseWorse:cases.filter(c=>get(c).cruise>currentCruise+epsilon).length,
      maximumWorseThanOld:cases.filter(c=>get(c).maximum>c.old.maximum+epsilon).length,
      totalWorseAmongOldAchieved:cases.filter(c=>c.old.nominalGoalMet&&get(c).total>c.old.total+epsilon).length,
      totalWorseThanOld:cases.filter(c=>get(c).total>c.old.total+epsilon).length});
    const comparison = Object.fromEntries(variants.map(name=>{
      const target=c=>c.comparisons[name];
      return [name,{...metrics(target),changed:cases.filter(c=>target(c).action!==c.next.action).length,
        resolvesMaximum52:cases.filter(c=>c.group==='maximum-52'&&target(c).maximum<=c.old.maximum+epsilon).length,
        resolvesTotal11:cases.filter(c=>c.group==='total-11'&&target(c).total<=c.old.total+epsilon).length,
        losesTargetHovArrival:cases.filter(c=>c.next.hov<=limit&&target(c).hov>limit).length,
        losesTargetJointGoal:cases.filter(c=>c.next.nominalGoalMet&&!target(c).nominalGoalMet).length,
        worsensTargetMaximum:cases.filter(c=>target(c).maximum>c.next.maximum+epsilon).length,
        worsensTargetHov:cases.filter(c=>target(c).hov>c.next.hov+epsilon).length,
        worsensTargetCruise:cases.filter(c=>target(c).cruise>c.next.cruise+epsilon).length}];
    }));
    return {basis:'synthetic endpoint fixtures; not actual learning data',seed:91571,count:400,currentHov,currentCruise,
      original:metrics(c=>c.old),target:metrics(c=>c.next),groups,comparison,affected:cases.filter(c=>c.group),cases};
  }
  function compareTargets(policy, inputs) {
    const key = c => c ? `${c.blade}/${c.direction}/${c.amount}` : null;
    const rank = (pool, select) => {
      let remaining=[...pool]; const result=[];
      while(remaining.length) {
        const c=select(remaining); if(!c)break;
        result.push(key(c));remaining=remaining.filter(other=>other.blade!==c.blade);
      }
      return result;
    };
    // 危険な単純置換も比較する。0.18を合格境界として扱う案で、実際のガイドには使用しない。
    const hardTarget = (pool, currentCruise) => {
      const h=c=>policy.endpoint(c,'red'), b=c=>policy.endpoint(c,'blue')??Infinity;
      const known=pool.filter(c=>h(c)!==null),safe=known.filter(c=>h(c)<=.18);
      const both=Number.isFinite(currentCruise)?safe.filter(c=>b(c)<=.18):[];
      const eligible=both.length?both:safe.length?safe:known;
      const max=c=>Math.max(h(c),b(c)),sum=c=>h(c)+b(c);
      const fields=!Number.isFinite(currentCruise)?[h]:both.length?[max,sum]:safe.length?[max,sum,h]:[h,max,sum];
      return [...eligible].sort((a,b)=>{
        for(const field of fields){const x=field(a),y=field(b);if(x===y||Math.abs(x-y)<=policy.epsilon)continue;return x<y?-1:1;}
        return a.blade-b.blade||Number(a.direction==='DOWN')-Number(b.direction==='DOWN')||a.amount-b.amount;
      })[0]??null;
    };
    const cases=inputs.map(row=>{
      const pool=row.pool,hov=row.next.currentHov,cruise=row.next.currentCruise;
      const select18=candidates=>policy.select(candidates,hov,cruise,.18);
      const select20=candidates=>policy.select(candidates,hov,cruise,.2);
      const chosen18=select18(pool),chosen20=select20(pool),chosenHard=hardTarget(pool,cruise);
      const summary=(c,target)=>({action:key(c),...policy.assess(c,hov,cruise,target)});
      return {id:row.id,currentHov:hov,currentCruise:cruise,
        target18:summary(chosen18,.18),target20:summary(chosen20,.2),hardTarget18:summary(chosenHard,.18),
        rank18:rank(pool,select18),rank20:rank(pool,select20),pool};
    });
    const metrics = name => ({
      bothPass:cases.filter(c=>c[name].nominalGoalMet).length,
      bothTarget18:cases.filter(c=>c[name].hov<=.18&&c[name].cruise<=.18).length,
      ownTargetMet:cases.filter(c=>c[name].nominalTargetMet).length,
      hovPass:cases.filter(c=>c[name].nominalHovWithin).length,
      hovTarget18:cases.filter(c=>c[name].hov<=.18).length,
      hovOnlyFallback:cases.filter(c=>!c[name].nominalGoalMet&&c[name].nominalHovWithin).length,
      hovImprovementFallback:cases.filter(c=>!c[name].nominalHovWithin).length
    });
    return {basis:'same synthetic 400 endpoint pools; fixed 0.2 pass boundary; not actual learning data',seed:91571,count:cases.length,
      target18:metrics('target18'),target20:metrics('target20'),hardTarget18:metrics('hardTarget18'),
      firstChanges:cases.filter(c=>c.target18.action!==c.target20.action).length,
      rankingChanges:cases.filter(c=>JSON.stringify(c.rank18)!==JSON.stringify(c.rank20)).length,
      losesPass:cases.filter(c=>c.target20.nominalGoalMet&&!c.target18.nominalGoalMet).length,
      losesHovPass:cases.filter(c=>c.target20.nominalHovWithin&&!c.target18.nominalHovWithin).length,
      hardTargetFirstChanges:cases.filter(c=>c.hardTarget18.action!==c.target20.action).length,
      hardTargetLosesPass:cases.filter(c=>c.target20.nominalGoalMet&&!c.hardTarget18.nominalGoalMet).length,
      hardTargetLossExamples:cases.filter(c=>c.target20.nominalGoalMet&&!c.hardTarget18.nominalGoalMet)
        .map(({id,target18,target20,hardTarget18})=>({id,target18,target20,hardTarget18})),cases};
  }
  globalThis.LinkRankingAnalysis=Object.freeze({run,compareTargets});
})();
