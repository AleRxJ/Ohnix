const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const f of fs.readdirSync('.').filter(f => /^\d\d-.*\.html$/.test(f))) {
    const h = f.startsWith('05') ? 1920 : 1080;
    const p = await b.newPage({ viewport: { width: 1080, height: h } });
    await p.goto('file://' + process.cwd() + '/' + f);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: f.replace('.html', '.png') });
    console.log(f);
  }
  await b.close();
})();
