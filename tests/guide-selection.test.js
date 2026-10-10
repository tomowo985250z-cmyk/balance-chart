(async () => {
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use an isolated profile');
    const frame = document.createElement('iframe');
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const visible = () => run(`dotOverlay.querySelector('.direction-lines').style.opacity !== '0'`);
    for (const page of [0, 1]) for (const rank of [0, 1, 2]) {
      run(`adjustmentForecast=null;selectedAdjustmentTarget=null;learning.reset([]);dotSets.splice(0);
        currentChartPage=${page};guideCandidateIndex=${rank};pitchAutoMode=false;trimAutoMode=false;
        dotSets.push({learningId:newLearningId(),red:{...parseDotInput('2','0','0.5'),color:'red'},
          blue:{...parseDotInput('5','0','0.5'),color:'blue'},adjustments:[]});
        setGuidesVisible(true);renderDots();applySelectedGuideAdjustment();
        window.automaticValues=[...memoValues];window.learningBefore=JSON.stringify(learning.inspect());`);
      assert(visible(), 'automatic visible');
      for (const index of [0, 3]) {
        run(`openMemoPicker(${index});selectedMemoValue=${index === 0 ? "automaticValues[0]==='1'?'2':'1'" : "automaticValues[3]==='UP'?'DOWN':'UP'"};previewMemoSelection();`);
        assert(!visible(), 'manual preview hides '+page+'/'+rank+'/'+index);
        run(`selectedMemoValue=automaticValues[${index}];previewMemoSelection();`);
        assert(visible(), 'return preview restores');
        run(`selectedMemoValue=${index === 0 ? "automaticValues[0]==='1'?'2':'1'" : "automaticValues[3]==='UP'?'DOWN':'UP'"};confirmMemoPicker.click();`);
        assert(!visible(), 'confirmed change hides');
        run(`openMemoPicker(${index});selectedMemoValue=automaticValues[${index}];confirmMemoPicker.click();`);
        assert(visible(), 'confirmed return restores independently of direction history');
      }
      run(`openMemoPicker(0);selectedMemoValue=automaticValues[0]==='1'?'2':'1';confirmMemoPicker.click();
        openMemoPicker(3);selectedMemoValue=automaticValues[3]==='UP'?'DOWN':'UP';confirmMemoPicker.click();
        openMemoPicker(0);selectedMemoValue=automaticValues[0];confirmMemoPicker.click();`);
      assert(!visible(), 'restoring blade alone keeps changed direction hidden');
      run(`openMemoPicker(3);selectedMemoValue=automaticValues[3];confirmMemoPicker.click();`);
      assert(visible(), 'restoring both shows');
      run(`openMemoPicker(0);selectedMemoValue=automaticValues[0]==='1'?'2':'1';confirmMemoPicker.click();
        openMemoPicker(3);selectedMemoValue=automaticValues[3]==='UP'?'DOWN':'UP';confirmMemoPicker.click();
        openMemoPicker(3);selectedMemoValue=automaticValues[3];confirmMemoPicker.click();`);
      assert(!visible(), 'restoring direction alone keeps changed blade hidden');
      run(`openMemoPicker(0);selectedMemoValue=automaticValues[0];confirmMemoPicker.click();`);
      assert(visible(), 'restoring blade shows despite direction history');
      run(`openMemoPicker(0);selectedMemoValue=automaticValues[0]==='1'?'2':'1';previewMemoSelection();closeMemoPicker.click();`);
      assert(visible(), 'cancel restores');
      assert(run('JSON.stringify(learning.inspect())===learningBefore'), 'learning unchanged');
    }
    document.getElementById('results').textContent=`PASS: ${checks} checks`;document.title='PASS';
  } catch(error) { document.getElementById('results').textContent=error.stack;document.title='FAIL'; }
})();
