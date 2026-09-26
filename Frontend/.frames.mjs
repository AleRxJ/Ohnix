import puppeteer from 'puppeteer';
const OUT = process.argv[2];
const routes = process.argv.slice(3);
const browser = await puppeteer.launch({ headless: 'new' });
const sheetPage = await browser.newPage();
await sheetPage.setViewport({ width: 1560, height: 860 });
for (const r of routes) {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:5199' + r, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await new Promise(res => setTimeout(res, 1200));
  const frames = [];
  let y = 0;
  for (let i = 0; i < 40; i++) {
    await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
    await new Promise(res => setTimeout(res, 700));
    frames.push((await page.screenshot({ encoding: 'base64' })));
    const { sh, cur } = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, cur: window.scrollY }));
    if (cur + 812 >= sh - 2) break;
    y += 700;
  }
  const name = r === '/' ? 'home' : r.replace(/\//g, '_').slice(1);
  for (let s = 0; s < frames.length; s += 4) {
    const imgs = frames.slice(s, s + 4).map((f, i) => `<div style="display:inline-block;margin:4px;position:relative"><img src="data:image/png;base64,${f}" width=375 height=812><b style="position:absolute;top:0;left:0;background:red;color:#fff;font:14px sans-serif;padding:2px 5px">${s + i}</b></div>`).join('');
    await sheetPage.setContent(`<body style="margin:0;background:#888;white-space:nowrap">${imgs}</body>`);
    await sheetPage.screenshot({ path: `${OUT}/${name}_${String(s / 4).padStart(2, '0')}.png` });
  }
  console.log(r, frames.length);
  await page.close();
}
await browser.close();
