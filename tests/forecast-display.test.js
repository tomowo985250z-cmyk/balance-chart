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
          for (const condition of ['direction', 'blade', 'missing', 'hidden', 'transparent', 'removed', 'matching-rotated']) {
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
              if ('${condition}'==='matching-rotated') {
                const action=BalanceLearning.adjustment(adjustmentForecast.values);
                const guide=forecastGuides['${color}'];
                forecastGuides['${color}']={...guide,blade:action.blade,direction:action.direction,
                  unit:{x:-guide.unit.y,y:guide.unit.x}};
              }
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
      run(`memoValues.splice(0,4,...adjustmentForecast.values); updateMemoButtons(); applySelectedGuideAdjustment();
        window.directionLearning=JSON.stringify(learning.inspect());
        window.directionPoints=JSON.stringify(adjustmentForecast.points); memoFour.click();`);
      assert(run('Boolean(dotOverlay.querySelector(".forecast-body"))'), type + ' opening direction picker keeps automatic dots');
      run(`selectedMemoValue=memoValues[3]==='UP'?'DOWN':'UP'; previewMemoSelection();`);
      assert(run('!dotOverlay.querySelector(".forecast-body")'), type + ' manual direction preview hides dots');
      run('selectedMemoValue=memoValues[3]; previewMemoSelection();');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), type + ' returning direction within picker stays hidden');
      run('closeMemoPicker.click();');
      assert(run('Boolean(dotOverlay.querySelector(".forecast-body")) && JSON.stringify(adjustmentForecast.points)===directionPoints'), type + ' cancel restores original dots and coordinates');
      run(`memoFour.click(); selectedMemoValue=memoValues[3]==='UP'?'DOWN':'UP'; confirmMemoPicker.click();`);
      assert(run('!dotOverlay.querySelector(".forecast-body")'), type + ' confirmed manual direction hides dots');
      run('renderAdjustmentForecast();');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), type + ' redraw keeps manually changed dots hidden');
      run(`memoFour.click(); selectedMemoValue=memoValues[3]==='UP'?'DOWN':'UP'; confirmMemoPicker.click();`);
      assert(run('!dotOverlay.querySelector(".forecast-body")'), type + ' manually returning to original direction stays hidden');
      run('applySelectedGuideAdjustment();');
      assert(run('Boolean(dotOverlay.querySelector(".forecast-body"))'), type + ' recalculation restores dots');
      assert(run('JSON.stringify(learning.inspect())===directionLearning'), type + ' manual direction does not change learning');
      run('adjustmentForecast=JSON.parse(displaySnapshot); forecastGuides={...savedDisplayGuides}; renderAdjustmentForecast();');
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
