import puppeteer from "puppeteer";

const FRONTEND = "http://localhost:5173";
const SHOT_DIR = "C:\\Users\\User\\AppData\\Local\\Temp\\claude\\c--Users-User-Documents-GitHub-Ohnix\\3c20a383-49b2-4c48-a3b7-a2aadb1e39f5\\scratchpad";

const login = async (page) => {
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector("input", { timeout: 10000 }).catch(() => {});
    const emailSel = await page.$('input[type="text"], input[type="email"]');
    const passSel = await page.$('input[type="password"]');
    await emailSel.type("test@example.com");
    await passSel.type("Test1234!");
    const submitBtn = await page.$('button[type="submit"]');
    await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
        submitBtn ? submitBtn.click() : page.keyboard.press("Enter"),
    ]);
    await new Promise((r) => setTimeout(r, 2000));
};

const getFab = (page) =>
    page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Asistente Ohnix")
    );

const run = async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await login(page);
    await page.goto(`${FRONTEND}/products`, { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    const fab1 = await getFab(page);
    await fab1.asElement().click();
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${SHOT_DIR}/20-floating-open.png`, fullPage: false });

    // Click a suggestion and wait for the real answer.
    const chip = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find((b) => b.textContent.includes("¿Cómo registro una venta?"))
    );
    await chip.asElement().click();
    await page.waitForFunction(
        () => {
            const el = document.querySelector(".assistant-panel-in");
            return el && !el.innerText.includes("Pensando");
        },
        { timeout: 25000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${SHOT_DIR}/21-floating-answer.png`, fullPage: false });
    const text = await page.evaluate(() => document.querySelector(".assistant-panel-in")?.innerText || "");
    console.log("--- Answer ---\n" + text);

    // Click outside the panel - should close.
    await page.mouse.click(200, 200);
    await new Promise((r) => setTimeout(r, 300));
    const stillOpenAfterOutsideClick = await page.evaluate(() => !!document.querySelector(".assistant-panel-in"));
    console.log("Panel still open after outside click (should be false):", stillOpenAfterOutsideClick);
    await page.screenshot({ path: `${SHOT_DIR}/22-after-outside-click.png`, fullPage: false });

    // Mobile check.
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 300));
    const fab2 = await getFab(page);
    await fab2.asElement().click();
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${SHOT_DIR}/23-mobile-open.png`, fullPage: false });

    console.log("--- Console errors ---");
    console.log(JSON.stringify(consoleErrors, null, 2));

    await browser.close();
};

run().catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
});
