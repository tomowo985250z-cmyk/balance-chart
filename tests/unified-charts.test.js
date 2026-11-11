(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const params = new URLSearchParams(location.search);
  try {
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:375px;height:900px;border:0';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 50));
    // Compare the rendered geometry, labels, markers and computed styles at the same angles.
    const geometry = () => run(`JSON.stringify(['hovLayer','cruiseLayer'].map(id=>{
      const layer=chartObject.contentDocument.getElementById(id);
      return [layer.outerHTML,...[layer,...layer.querySelectorAll('*')].map(node=>{
        const style=chartObject.contentWindow.getComputedStyle(node);
        const bounds=node.getBoundingClientRect();
        return [style.display,style.visibility,style.stroke,style.fill,style.strokeWidth,
          style.fontSize,bounds.x,bounds.y,bounds.width,bounds.height];
      }),...['hovArrowHead','cruiseArrowHead'].map(marker=>{
        const node=chartObject.contentDocument.getElementById(marker);
        return [node.outerHTML,chartObject.contentWindow.getComputedStyle(node.firstElementChild).fill];
      })];
    }))`);
    const setup = (page, learned = false) => run(`
      adjustmentLock=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);
      forecastDisplayCache.clear();adjustmentSelections.forEach(values=>values.fill(''));
      memoValues.fill('');retainedGuideNumbers.fill(null);guideCandidateIndices.fill(0);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;
      applyChartRotation(0,0);
      const dot=(x,y,color)=>({clock:'12:00',color,radius:Math.hypot(x-397,y-520)/240,
        angle:Math.atan2(x-397,520-y)*180/Math.PI});
      for(let i=0;i<${learned ? 4 : 1};i++) {
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*80,620+(3-i)*46.188,'red'),
          blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
          adjustments:i<${learned ? 3 : 0}?[['1','${page ? 'TAB' : 'LINK'}','1','UP']]:[]});
        if(${learned})learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      saveDotSets();updateMemoButtons();renderDots();setGuidesVisible(true);
      updatePitchModeUI();updateTrimModeUI();
    `);
    for (const width of [320,375,390,430]) {
      frame.style.width = width + 'px'; await tick();
      for (const angle of [0,37,-58]) {
        let expected;
        for (const page of [0,1]) {
          setup(page); run(`applyChartRotation(${angle},${-angle})`); await tick();
          assert(run(`['hovLayer','cruiseLayer'].every(id=>{
            const node=chartObject.contentDocument.getElementById(id);
            return node.checkVisibility() && node.getBoundingClientRect().width>0;
          })`), `${width}/${page}/${angle}: both hexagons visible`);
          if (page === 0) expected = geometry();
          else assert(geometry() === expected, `${width}/${angle}: identical rendered LINK/TAB geometry and colors`);
          assert(run(`document.documentElement.scrollWidth<=innerWidth &&
            [guideCandidateToggle,currentChartPage?trimModeToggle:pitchModeToggle,guideToggle,rotationLock.parentElement]
              .every(node=>{const r=node.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.height>=44;})`),
          `${width}/${page}: no horizontal overflow and controls fit`);
        }
      }
    }
    for (const learned of [false,true]) for (const page of [0,1]) {
      setup(page, learned);
      const type = page ? 'TAB' : 'LINK';
      const stored = run('JSON.stringify([dotSets,learning.inspect()])');
      const blades = [];
      const predictedColors = new Set();
      for (let rank=0;rank<3;rank++) {
        if (rank) run('guideCandidateToggle.click()');
        blades.push(run('Number(memoValues[0])'));
        assert(run(`memoValues[1]==='${type}' && memoButtons[1].disabled
          && guideCandidateToggle.textContent==='${type} No.'+memoValues[0]
          && getThirdMemoOptions().join(',')==='${page ? '3,2,1' : '3,2,1,3/4,2/3,1/2,1/3,1/4,1/8'}'`),
        `${type}/${learned}/${rank}: adjustment type and amounts remain dedicated`);
        run(`openMemoPicker(2);selectedMemoValue='${page ? '2' : '1/4'}';confirmMemoPicker.click()`);
        assert(run(`memoButtons[2].textContent.includes('${page ? '度' : 'フラット'}')
          && adjustmentForecast?.type==='${type}'
          && adjustmentForecast.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.distance))`),
        `${type}/${learned}/${rank}: finite predictions at the selected amount and original unit`);
        run('adjustmentForecast.points.map(point=>point.color)').forEach(color=>predictedColors.add(color));
        assert(run(`adjustmentForecast.points.every(point=>['red','blue'].includes(point.color))
          && Object.keys(forecastGuides).every(color=>['red','blue'].includes(color))`), `${type}: calculation targets preserved`);
        if (page) {
          assert(run(`(() => {
            const red=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#redDirectionLineArrow)"]');
            const blue=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#blueDirectionLineArrow)"]');
            if(!blue)return !red;
            const line=guideDisplayGeometry.get(red),guide=forecastGuides.blue;
            const expected=getDirectionLine(dotSets.at(-1).red,'red',null,guide.blade,guide.direction);
            return red?.dataset.selectionExcluded==='true' && !!forecastGuides.red
              && line.number===guide.blade && line.direction===guide.direction
              && JSON.stringify(line)===JSON.stringify(expected);
          })()`), `TAB/${learned}/${rank}: HOV forecast guide follows the selected No./direction`);
        }
        assert(run(`['red','blue'].every(color=>{
          const expected=color==='red'?'rgb(214, 0, 0)':'rgb(0, 102, 255)';
          const nodes=[...dotOverlay.querySelectorAll('.chart-dot-'+color+',.latest-ring-'+color+
            ',.guide-direction-line[marker-end="url(#'+color+'DirectionLineArrow)"],.adjustment-forecast [data-color="'+color+'"]')];
          return nodes.length && nodes.every(node=>{
            const style=getComputedStyle(node);
            return (node.matches('.chart-dot-'+color)?style.fill:node.matches('[data-color]')?style.color:style.stroke)===expected;
          });
        })`), `${type}: measured dots, rings, guides and forecasts share red/blue colors`);
        run('setGuidesVisible(false)');
        assert(run(`!dotOverlay.querySelector('.guide-direction-line')?.checkVisibility()
          && !dotOverlay.querySelector('.forecast-body')?.checkVisibility()
          && dotOverlay.querySelector('.chart-dot-red').checkVisibility()
          && dotOverlay.querySelector('.chart-dot-blue').checkVisibility()`), `${type}: guides OFF preserves measured dots`);
        run('setGuidesVisible(true);memoFour.click();selectedMemoValue=memoValues[3]==="UP"?"DOWN":"UP";confirmMemoPicker.click()');
        assert(run('adjustmentForecast.manualDirection && !!dotOverlay.querySelector(".forecast-body")'), `${type}: manual direction shows recalculated forecast`);
        run('applySelectedGuideAdjustment()');
      }
      assert(new Set(blades).size===3 && blades.every(blade=>blade>=1 && blade<=3), `${type}: cycles through all three Nos`);
      assert(predictedColors.has('blue') && predictedColors.has('red'), `${type}: real forecast generation covers both colors`);
      assert(run('JSON.stringify([dotSets,learning.inspect()])')===stored, `${type}: display operations preserve measurements and learning`);
    }
    setup(1,true);
    const cruiseBefore=run(`JSON.stringify([memoValues,guideNumberChoices,forecastGuides.blue,adjustmentForecast.points.filter(p=>p.color==='blue')])`);
    const redBefore=run(`JSON.stringify(guideDisplayGeometry.get(dotOverlay.querySelector('[data-selection-excluded="true"]')))`);
    run('applyChartRotation(hovAngle+45,cruiseAngle);renderDirectionLines(true)');
    assert(run(`JSON.stringify(guideDisplayGeometry.get(dotOverlay.querySelector('[data-selection-excluded="true"]')))`)!==redBefore,
      'TAB: rotating HOV updates its reference guide');
    assert(run(`JSON.stringify([memoValues,guideNumberChoices,forecastGuides.blue,adjustmentForecast.points.filter(p=>p.color==='blue')])`)===cruiseBefore,
      'TAB: HOV rotation preserves Cruise calculation, forecast and priority');
    run('delete dotSets.at(-1).red;renderDots()');
    assert(run(`!dotOverlay.querySelector('[data-selection-excluded="true"]') && !!dotOverlay.querySelector('.guide-direction-line')`),
      'TAB: missing HOV removes only its reference guide');
    output.textContent = `PASS: ${checks} checks — shared hexagons, LINK/TAB calculations, HOV reference guide, colors, controls and 320/375/390/430px`;
    document.title = 'PASS';
    if (params.has('screenshot')) {
      const width=Number(params.get('width'))||375;
      frame.style.cssText=`width:${width}px;height:900px;border:0;display:block`;
      document.body.style.cssText='margin:0';output.hidden=true;
      setup(Number(params.get('page'))||0);await tick();
      run('chartWrap.scrollIntoView()');
    } else frame.remove();
  } catch (error) { output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL'; }
})();
