(async () => {
  const output = document.getElementById('results'), params = new URLSearchParams(location.search);
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:375px;height:950px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const select = (index, value) => run(`openMemoPicker(${index});selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const reload = async () => {
      run('balanceFlushState()'); loaded = new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.location.reload(); await loaded;
    };
    const reset = () => run(`document.getElementById('resetLearning').click();
      deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'));`);
    const setup = (page, colors) => run(`
      adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');retainedGuideNumbers.fill(null);guideCandidateIndices.fill(0);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      redInputs.forEach((input,i)=>input.value=${colors.includes('red') ? "['2','0','0.4'][i]" : "''"});
      blueInputs.forEach((input,i)=>input.value=${colors.includes('blue') ? "['5','0','0.3'][i]" : "''"});
      addDotButton.click();setGuidesVisible(true);`);
    const verify = (count, label) => {
      assert(run(`dotList.querySelectorAll('.confirmed-adjustment-forecast').length===${count}`), label + ': only confirmed stages in results');
      assert(run(`adjustmentSequence.stages.every((stage,index)=>{
        const target=dotSets.findIndex(set=>set.learningId===stage.targetId);
        const rows=dotList.children[target].querySelectorAll('.dot-adjustment-row');
        const row=rows[stage.actionIndex],prediction=row.nextElementSibling;
        return row.textContent.includes('確定調整量:')
          && stage.values.every((value,field)=>row.textContent.includes(formatMemoValue(value,field,stage.values[1])))
          && prediction?.classList.contains('confirmed-adjustment-forecast')
          && Number(prediction.dataset.adjustment)===index+1
          && ['red','blue'].every(color=>{
            const point=stage.forecast.points.find(p=>p.color===color);
            const text=prediction.querySelector('[data-color='+color+']').textContent;
            return text.includes((color==='red'?'HOV':'巡航')+'確定予測')
              && (point?text.includes((Math.hypot(point.x-397,point.y-520)/240).toFixed(2)+' IPS'):text.includes('予測なし'));
          });
      })`), label + ': saved actions and exact saved endpoint values shown');
      assert(run('document.documentElement.scrollWidth<=innerWidth'), label + ': mobile fits');
    };
    for (const width of params.has('screenshot') ? [Number(params.get('width') || 375)] : [320,375,390,430]) {
      frame.style.width = width + 'px';
      for (const first of params.has('screenshot') ? [Number(params.get('page') || 0)] : [0,1]) {
        setup(first, ['red','blue']); const label = `${width}/${first ? 'TAB→LINK' : 'LINK→TAB'}`;
        const actual = run('JSON.stringify(dotSets)'), models = run('JSON.stringify([learning.inspect().models,learning.inspect().samples])');
        select(0,'1'); select(3,'UP'); select(2,first ? '1' : '1/4');
        assert(run('!dotList.querySelector(".confirmed-adjustment-forecast")'), label + ': draft is not confirmed');
        run('addAdjustmentButton.click()'); verify(1,label + '/first');
        const saved = run('dotList.querySelector(".confirmed-adjustment-forecast").outerHTML');
        run(`chartPageButtons[${1-first}].click()`); select(0,'2'); select(3,'DOWN'); select(2,first ? '1/2' : '2');
        verify(1,label + '/second draft');
        assert(run('dotList.querySelector(".confirmed-adjustment-forecast").outerHTML') === saved, label + ': second draft preserves first values');
        run(`chartPageButtons[${first}].click();chartPageButtons[${1-first}].click()`); verify(1,label + '/page round trip');
        await reload(); verify(1,label + '/reload pending');
        run('addAdjustmentButton.click()'); verify(2,label + '/second confirmed');
        assert(run('dotList.querySelector(".confirmed-adjustment-forecast").outerHTML') === saved, label + ': second confirmation preserves first values');
        run(`chartPageButtons[${first}].click()`); verify(2,label + '/first page');
        await reload(); verify(2,label + '/reload completed');
        assert(run('JSON.stringify(dotSets.map(set=>({...set,adjustments:[]})))') === actual, label + ': actual measurements unchanged');
        assert(run('JSON.stringify([learning.inspect().models,learning.inspect().samples])') === models, label + ': no forecast learning');
        if (params.has('screenshot')) {
          frame.style.height = '1100px';
          document.getElementById('results').hidden = true;
          run('scrollTo(0,document.getElementById("resultsHeading").offsetTop-10)');
          continue;
        }
        const history = run('JSON.stringify(dotSets)'); reset();
        verify(2,label + ': learning reset retains confirmed results');
        assert(run('JSON.stringify(dotSets)') === history, label + ': reset retains actual and adjustment history');
        await reload(); verify(2,label + ': confirmed results survive learning reset and reload');
      }
    }
    if (!params.has('screenshot')) {
      for (const first of [0,1]) {
        setup(first,['red','blue']); select(0,'1'); select(3,'UP'); select(2,first?'1':'1/4'); run('addAdjustmentButton.click()');
        run(`redInputs.forEach((input,i)=>input.value=['3','0','0.25'][i]);blueInputs.forEach(input=>input.value='');
          addDotButton.click();chartPageButtons[${1-first}].click()`);
        verify(1,'partial actual preserves first result');
        select(0,'1');select(3,'UP');select(2,first?'1/4':'1');run('addAdjustmentButton.click()');
        verify(2,'second result under its own measurement');
        assert(run('Array.from(dotList.children).every(row=>row.querySelectorAll(".confirmed-adjustment-forecast").length===1)'), 'partial measurements place each confirmed stage under its original result');
      }
      for (const colors of [['red'],['blue']]) {
        setup(1,colors); select(0,'1'); select(3,'UP'); select(2,'1'); run('addAdjustmentButton.click()'); verify(1,'single color/'+colors[0]);
        assert(run(`dotList.querySelector('.confirmed-adjustment-forecast [data-color=${colors[0]==='red'?'blue':'red'}]').textContent.includes('予測なし')`), 'missing measurement never shown as numeric forecast');
      }
      // A legacy confirmed action may have no calculable endpoint.
      run('adjustmentSequence.stages[0].forecast.points=[];renderDots()'); verify(1,'unavailable forecast');
      assert(run(`!dotList.querySelector('.confirmed-adjustment-forecast').textContent.includes('IPS')`), 'no invented forecast when endpoints unavailable');
      run(`dotList.lastElementChild.querySelector('.dot-adjustment-row button').click();
        deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'));`);
      assert(run('!dotList.querySelector(".confirmed-adjustment-forecast")'), 'deleting confirmation removes results');
      frame.remove();
    }
    output.textContent = `PASS: ${checks} checks — immediate first results, confirmed actions/endpoints, draft isolation, both orders, reload, reset, single color, missing estimates and four widths`;
    document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
