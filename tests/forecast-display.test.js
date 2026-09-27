/* 専用ブラウザプロファイルで forecast-display.html?isolated=1 を開く。 */
(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    checks += 1;
  };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') {
      output.textContent = '専用テストプロファイルで ?isolated=1 を指定してください。';
      return;
    }
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1600px';
    const loaded = new Promise(resolve => { frame.onload = resolve; });
    frame.src = '../index.html';
    document.body.append(frame);
    await loaded;
    const run = code => frame.contentWindow.eval(code);
    for (const type of ['LINK', 'TAB']) {
      run(`
        adjustmentForecast=null; selectedAdjustmentTarget=null; learning.reset([]); dotSets.splice(0);
        currentChartPage=${type === 'LINK' ? 0 : 1}; pitchAutoMode=false; trimAutoMode=false;
        dotSets.push({learningId:newLearningId(),
          red:{...parseDotInput('2','0','0.5'),color:'red'},
          blue:{...parseDotInput('5','0','0.5'),color:'blue'},adjustments:[]});
        renderDots(); setGuidesVisible(true);
        updateAdjustmentForecast(['1','${type}','${type === 'LINK' ? '1/4' : '1'}','UP']);
        window.displaySnapshot=JSON.stringify(adjustmentForecast);
        window.learningSnapshot=JSON.stringify(learning.inspect());
        window.storageSnapshot=JSON.stringify({...localStorage});
        window.savedDisplayGuides={...forecastGuides};
      `);
      assert(run('adjustmentForecast.points.some(p=>p.color==="blue")'), type + ' real calculation generates Cruise');
      if (type === 'LINK') assert(run('adjustmentForecast.points.some(p=>p.color==="red")'), 'real calculation generates HOV');
      for (const phase of ['preview', 'fixed', 'comparison']) {
        for (const color of type === 'LINK' ? ['blue', 'red'] : ['blue']) {
          for (const condition of ['direction', 'blade', 'missing', 'hidden', 'transparent', 'removed']) {
            run(`
              adjustmentForecast.phase='${phase}';
              forecastGuides={...savedDisplayGuides};
              window.displayLine=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#${color}DirectionLineArrow)"]');
              window.lineParent=displayLine.parentNode;
              window.lineStyle=displayLine.getAttribute('style');
              if ('${condition}'==='direction') forecastGuides['${color}']={...forecastGuides['${color}'],direction:'DOWN'};
              if ('${condition}'==='blade') forecastGuides['${color}']={...forecastGuides['${color}'],blade:2};
              if ('${condition}'==='missing') delete forecastGuides['${color}'];
              if ('${condition}'==='hidden') displayLine.style.display='none';
              if ('${condition}'==='transparent') displayLine.style.opacity='0';
              if ('${condition}'==='removed') displayLine.remove();
              renderAdjustmentForecast();
            `);
            assert(run('dotOverlay.querySelectorAll(".forecast-body").length===adjustmentForecast.points.length'), `${type}/${phase}/${color}/${condition}: all generated dots rendered`);
            assert(run(`(()=>{const p=adjustmentForecast.points.find(p=>p.color==='${color}');
              const node=dotOverlay.querySelector('.adjustment-forecast [data-color=${color}]');
              const matrix=node.transform.baseVal.getItem(0).matrix;
              return Math.abs(matrix.e-p.x)<0.0001 && Math.abs(matrix.f-p.y)<0.0001;
            })()`), 'fallback preserves generated coordinates');
            assert(run('JSON.stringify({...adjustmentForecast,phase:"preview"})===displaySnapshot'), 'render preserves complete forecast');
            run('displayLine.setAttribute("style",lineStyle); if(!displayLine.parentNode) lineParent.append(displayLine);');
          }
        }
      }
      assert(run('JSON.stringify(learning.inspect())===learningSnapshot && JSON.stringify({...localStorage})===storageSnapshot'), 'render never changes learning or storage');
      run('dotOverlay.classList.remove("guides-visible"); renderAdjustmentForecast();');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'global guide OFF stays hidden');
      run('dotOverlay.classList.add("guides-visible"); renderAdjustmentForecast();');
      assert(run('dotOverlay.querySelectorAll(".forecast-body").length===adjustmentForecast.points.length'), 'global guide ON restores all dots');
      run('currentChartPage=1-currentChartPage; renderAdjustmentForecast();');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'other chart page stays hidden');
      run('currentChartPage=1-currentChartPage; renderAdjustmentForecast();');
    }
    output.textContent = `PASS: ${checks} checks — generated forecast display, real calculations, state unchanged`;
    document.title = 'PASS';
  } catch (error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}`;
    document.title = 'FAIL';
  }
})();
