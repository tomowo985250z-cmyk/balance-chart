(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (value, message) => { if (!value) throw Error(message); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:375px;height:750px';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
    await tick();
    run(`dotSets.splice(0);for(let i=0;i<14;i++)dotSets.push({red:{color:'red',radius:0,angle:0,clock:'0:00'}});renderDots()`);
    await tick(); run('balanceFlushState()');
    const state = () => run(`(()=>{
      const storage=JSON.parse(appStorage.exportText()).records;
      // 実際のピンチは既存の表示状態保存を行うため、viewBoxだけ比較から除く。
      const ui=JSON.parse(storage[BalanceState.uiKey]);delete ui.viewBox;
      storage[BalanceState.uiKey]=JSON.stringify(ui);
      return JSON.stringify({dots:dotSets,learning:learning.inspect(),forecast:adjustmentForecast,storage});
    })()`);
    const before = state();
    const positions = () => run(`JSON.stringify([...dotOverlay.querySelectorAll('text[data-dot-x]')]
      .map(n=>[Number(n.getAttribute('x'))-Number(n.dataset.dotX),Number(n.getAttribute('y'))-Number(n.dataset.dotY)]))`);
    run(`window.numberLayoutCalls=0;const originalNumberLayout=layoutDotNumbers;
      layoutDotNumbers=function(){window.numberLayoutCalls++;return originalNumberLayout()}`);
    const touch = (type, points) => run(`(()=>{
      const svg=chartObject.contentDocument.documentElement;
      const event=new chartObject.contentWindow.Event('${type}',{bubbles:true,cancelable:true});
      Object.defineProperties(event,{touches:{value:${JSON.stringify(points)}},changedTouches:{value:[]}});
      svg.dispatchEvent(event);
    })()`);
    const pair = distance => [{clientX:100,clientY:200},{clientX:100+distance,clientY:200}];
    const verify = () => {
      const data = run(`(()=>{
        const nodes=[...dotOverlay.querySelectorAll('text[data-dot-x],circle,ellipse')];
        return nodes.map(n=>{const b=n.getBBox(),s=(parseFloat(getComputedStyle(n).strokeWidth)||0)/2;
          return {label:n.matches('text'),font:n.getAttribute('font-size'),x:b.x-s,y:b.y-s,w:b.width+2*s,h:b.height+2*s};});})()`);
      assert(data.filter(b => b.label).length === 14, 'all numbers visible');
      for (const [i, a] of data.entries()) {
        if (!a.label) continue;
        assert(a.font === '16', 'font size unchanged');
        for (const [j, b] of data.entries()) {
          if (i === j) continue;
          assert(!(a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y), 'no number overlap ' + JSON.stringify({a,b}));
        }
      }
    };
    verify();
    const initial = positions();
    run('window.numberLayoutCalls=0');
    touch('touchstart', pair(100));
    for (const distance of [130, 190, 260, 300]) {
      touch('touchmove', pair(distance)); await tick(60);
      assert(positions() === initial, 'pinch keeps number offsets');
    }
    await tick();
    assert(run('Number(dotOverlay.viewBox.baseVal.width) < 300'), 'pinch updates chart scale');
    assert(positions() === initial, 'pause during pinch keeps number offsets');
    assert(run('window.numberLayoutCalls') === 0, 'no layout search during pinch, including pauses');
    touch('touchend', []); await tick(); verify();
    assert(positions() === initial, 'collision-free zoom end preserves positions');
    // 高倍率で密集配置した後に縮小し、終了後だけ衝突を解消する。
    run('renderDots()'); await tick();
    const compact = positions();
    run('window.numberLayoutCalls=0');
    touch('touchstart', pair(300));
    for (const distance of [240, 190, 130, 100]) {
      touch('touchmove', pair(distance)); await tick(60);
      assert(positions() === compact, 'zoom out keeps number offsets');
    }
    await tick();
    assert(run('window.numberLayoutCalls') === 0, 'zoom out waits for gesture end');
    touch('touchend', []); await tick(); verify();
    assert(positions() !== compact, 'zoom end repairs collisions when needed');
    const repaired = positions();
    run('window.numberLayoutCalls=0');
    touch('touchstart', pair(100));
    touch('touchmove', pair(180)); await tick();
    assert(positions() === repaired, 'cancelled gesture keeps offsets while active');
    touch('touchcancel', []); await tick(); verify();
    assert(run('!dotNumberViewInteracting && window.numberLayoutCalls > 0'), 'touchcancel resumes collision checks');
    for (const view of ['265 375 265 374', '0 0 794 1123']) {
      run(`dotOverlay.setAttribute('viewBox','${view}')`); await tick(); verify();
    }
    const settled = positions();
    run('window.numberLayoutCalls=0');
    for (const width of [700, 600, 500, 400]) {
      run(`dotOverlay.setAttribute('viewBox','0 0 ${width} ${width*1123/794}')`); await tick(60);
      assert(positions() === settled, 'viewBox updates keep number offsets');
    }
    assert(run('window.numberLayoutCalls') === 0, 'viewBox changes debounce layout');
    await tick(); verify();
    assert(positions() === settled, 'collision-free viewBox changes preserve positions after settling');
    frame.style.width = '900px'; await tick(); verify();
    assert(state() === before, 'layout preserves calculation, learning and storage');
    run(`dotSets.splice(0);dotSets.push({red:{color:'red',radius:0,angle:0,clock:'0:00'}});renderDots()`);
    assert(run(`(()=>{const n=dotOverlay.querySelector('text[data-dot-x]'),b=n.getBBox();return Math.hypot(b.x+b.width/2-397,b.y+b.height/2-520)<25})()`), 'isolated number stays close');
    output.textContent = `PASS: ${checks} checks`; document.title = 'PASS';
  } catch (error) { output.textContent = 'FAIL: ' + error.stack; document.title = 'FAIL'; }
})();
