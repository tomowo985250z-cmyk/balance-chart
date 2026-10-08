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
    const tick = () => new Promise(resolve => setTimeout(resolve, 100));
    await tick();
    run(`dotSets.splice(0);for(let i=0;i<14;i++)dotSets.push({red:{color:'red',radius:0,angle:0,clock:'0:00'}});renderDots()`);
    await tick(); run('balanceFlushState()');
    const state = () => run('JSON.stringify({dots:dotSets,learning:learning.inspect(),forecast:adjustmentForecast,storage:JSON.parse(appStorage.exportText()).records})');
    const before = state();
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
    for (const view of ['265 375 265 374', '0 0 794 1123']) {
      run(`dotOverlay.setAttribute('viewBox','${view}')`); await tick(); verify();
    }
    frame.style.width = '900px'; await tick(); verify();
    assert(state() === before, 'layout preserves calculation, learning and storage');
    run(`dotSets.splice(0);dotSets.push({red:{color:'red',radius:0,angle:0,clock:'0:00'}});renderDots()`);
    assert(run(`(()=>{const n=dotOverlay.querySelector('text[data-dot-x]'),b=n.getBBox();return Math.hypot(b.x+b.width/2-397,b.y+b.height/2-520)<25})()`), 'isolated number stays close');
    output.textContent = `PASS: ${checks} checks`; document.title = 'PASS';
  } catch (error) { output.textContent = 'FAIL: ' + error.stack; document.title = 'FAIL'; }
})();
