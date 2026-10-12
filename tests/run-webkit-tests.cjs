// node tests/run-webkit-tests.cjs [path/to/playwright-core] [comma-separated suites | --capture-only]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { webkit, devices } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) response.writeHead(404).end();
    else response.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'text/plain') + '; charset=utf-8' }).end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
    const suites = process.argv[3] === '--capture-only' ? []
      : process.argv[3]?.split(',') || ['amount-preview', 'forecast-compact', 'candidate-scroll', 'ui-refinement'];
    for (const suite of suites) {
      assert.match(suite, /^[a-z-]+$/);
      const context = await browser.newContext({ ...devices['iPhone SE'] });
      const page = await context.newPage();
      await page.goto(`${base}/tests/${suite}.html?isolated=1`);
      await page.waitForFunction(() => /^(PASS:|FAIL)/.test(document.getElementById('results').textContent), null, { timeout: 90000 });
      const result = await page.locator('#results').textContent();
      assert.ok(result.startsWith('PASS:'), `${suite}: ${result}`);
      console.log(`WebKit/${suite}: ${result.split('\n')[0]}`);
      await context.close();
    }
    if (process.argv[3] && process.argv[3] !== '--capture-only') return;
    for (const [width, height, chartPage, isMobile] of [[320, 440, 0, true], [375, 667, 1, true], [320, 440, 0, false]]) {
      const context = await browser.newContext({ ...devices['iPhone SE'], viewport: { width, height }, deviceScaleFactor: 1, isMobile });
      const page = await context.newPage();
      await page.goto(`${base}/tests/amount-preview.html?isolated=1&screenshot=1&width=${width}&height=${height}&page=${chartPage}`);
      await page.waitForFunction(() => document.title === 'PASS' || document.title === 'FAIL', null, { timeout: 90000 });
      assert.equal(await page.title(), 'PASS', await page.locator('#results').textContent());
      const frame = page.frames().find(item => item.url().endsWith('/index.html'));
      const metrics = () => frame.evaluate(`JSON.stringify([scrollY,document.body.style.top,
        ...[adjustmentForm,chartWrap,...document.querySelectorAll('.forecast-result > span')].map(node=>{
          const rect=node.getBoundingClientRect();return [rect.x+rect.width/2,rect.y,rect.height];
        })])`);
      const before = await metrics();
      const fixed = async message => {
        const a=JSON.parse(before).flat(Infinity),b=JSON.parse(await metrics()).flat(Infinity);
        assert.ok(a.every((value,index)=>typeof value==='number'?Math.abs(value-b[index])<.1:value===b[index]),message);
      };
      if (isMobile) await frame.evaluate('scrollBy(0,200)');
      else {
        await page.mouse.move(8, 80);
        await page.mouse.wheel(0, 200);
      }
      await page.waitForTimeout(150);
      await fixed('Backdrop wheel must not move the page');
      const amount = await frame.evaluate('selectedMemoValue');
      if (isMobile) {
        const previous = await frame.locator('#memoWheel [aria-selected="true"]').evaluate(node => node.previousElementSibling.dataset.value);
        await frame.locator(`#memoWheel [data-value="${previous}"]`).tap();
      } else {
        const wheel = await frame.locator('#memoWheel').boundingBox();
        await page.mouse.move(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
        await page.mouse.wheel(0, -46);
      }
      await page.waitForTimeout(350);
      assert.notEqual(await frame.evaluate('selectedMemoValue'), amount, 'Native tap/wheel changes selected amount');
      assert.ok(await frame.evaluate('adjustmentForecast.values[2]===selectedMemoValue'), 'Native tap/wheel updates the forecast');
      await fixed('Native tap/wheel must keep background and forecast rows fixed');
      assert.ok(await frame.evaluate(`(() => {
        const start=new Event('touchstart',{bubbles:true});Object.defineProperty(start,'touches',{value:[{clientY:100}]});memoPicker.dispatchEvent(start);
        const move=new Event('touchmove',{bubbles:true,cancelable:true});Object.defineProperty(move,'touches',{value:[{clientY:150}]});memoPicker.dispatchEvent(move);
        return move.defaultPrevented;
      })()`), 'Backdrop touch drag must be prevented');
      const suffix = isMobile ? '' : '-desktop';
      const screenshot = path.join(os.tmpdir(), `balance-fixed-preview-webkit-${width}${suffix}.png`);
      await page.screenshot({ path: screenshot });
      await frame.locator('#closeMemoPicker').tap();
      assert.ok(await frame.evaluate('!document.documentElement.classList.contains("amount-selection-open")'), 'Tap releases background lock');
      const scroll = await frame.evaluate('scrollY');
      if (isMobile) await frame.evaluate('scrollBy(0,100)');
      else {
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.wheel(0, 100);
      }
      await page.waitForTimeout(200);
      assert.notEqual(await frame.evaluate('scrollY'), scroll, 'Native page scrolling resumes after close');
      const closedScreenshot = path.join(os.tmpdir(), `balance-compact-closed-webkit-${width}${suffix}.png`);
      await frame.locator('#adjustmentForm').screenshot({ path: closedScreenshot });
      console.log(`WebKit/${isMobile ? 'mobile tap' : 'desktop wheel'}/${chartPage ? 'TAB' : 'LINK'}/${width}x${height}: PASS touch guard, stable preview and scroll release; ${screenshot}`);
      console.log(`WebKit/compact closed layout: ${closedScreenshot}`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
