import puppeteer from "puppeteer";

const FRONTEND = "http://localhost:5173";
const SHOT_DIR = "C:\\Users\\User\\AppData\\Local\\Temp\\claude\\c--Users-User-Documents-GitHub-Ohnix\\0e6dcfbb-44ff-4194-ba6b-c9308459175b\\scratchpad";

const run = async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const consoleErrors = [];
    const netEvents = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on("response", (res) => {
        if (res.status() >= 400) netEvents.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    });
    page.on("requestfailed", (req) => {
        netEvents.push(`FAILED ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
    });

    console.log("Navigating to login...");
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.screenshot({ path: `${SHOT_DIR}/01-login.png` });

    // Fill login form - antd Input renders auto-generated ids, so inspect all inputs
    await page.waitForSelector("input", { timeout: 10000 }).catch(() => {});
    const inputInfo = await page.$$eval("input", (els) =>
        els.map((el) => ({ id: el.id, type: el.type, name: el.name, placeholder: el.placeholder }))
    );
    console.log("Inputs found:", JSON.stringify(inputInfo));

    const emailSel = await page.$('input[type="text"], input[type="email"]');
    const passSel = await page.$('input[type="password"]');
    if (!emailSel || !passSel) {
        console.log("Could not find login fields, dumping HTML");
        const html = await page.content();
        console.log(html.slice(0, 3000));
        await browser.close();
        process.exit(1);
    }
    await emailSel.type("test@example.com");
    await passSel.type("Test1234!");
    await page.screenshot({ path: `${SHOT_DIR}/02-login-filled.png` });

    const submitBtn = await page.$('button[type="submit"]');
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
        submitBtn ? submitBtn.click() : page.keyboard.press("Enter"),
    ]);

    await new Promise((r) => setTimeout(r, 4000));
    console.log("Current URL after login:", page.url());
    await page.screenshot({ path: `${SHOT_DIR}/03-after-login.png`, fullPage: true });

    // Navigate to products page to see the blocked screen / banner (SPA nav, not full reload)
    const productsLink = await page.$('a[href="/products"]');
    if (productsLink) {
        await Promise.all([
            page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {}),
            productsLink.click(),
        ]);
    } else {
        await page.goto(`${FRONTEND}/products`, { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: `${SHOT_DIR}/04-products-page.png`, fullPage: true });

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("--- Body text snippet ---");
    console.log(bodyText.slice(0, 1500));

    console.log("--- Console errors ---");
    console.log(JSON.stringify(consoleErrors.slice(0, 20), null, 2));
    console.log("--- Network errors (status>=400 or failed) ---");
    console.log(JSON.stringify(netEvents.slice(0, 30), null, 2));

    await browser.close();
};

run().catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
});
