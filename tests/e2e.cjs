/**
 * End-to-end checks in a real browser against a running app with an EMPTY database.
 *
 *   BASE_URL=http://127.0.0.1:3000 SETUP_KEY=... DATABASE_URL=... node tests/e2e.cjs
 *
 * Needs Playwright (npm i -D playwright && npx playwright install chromium) and psql on PATH.
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SETUP_KEY = process.env.SETUP_KEY;
const OUT = path.join(__dirname, "output");
fs.mkdirSync(OUT, { recursive: true });

function q(sqlText) {
  return execFileSync("psql", [process.env.DATABASE_URL, "-tAc", sqlText]).toString().trim();
}
let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error("FAILED: " + label);
  passed++;
  console.log("  ok  " + label);
}

async function login(browser, username, password, viewport = { width: 1240, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button.primary")]);
  return page;
}
async function changePassword(page, current, next) {
  await page.waitForURL("**/password");
  await page.fill("#current", current);
  await page.fill("#new", next);
  await page.fill("#confirm", next);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/password")), page.click("button.primary")]);
}
async function addEntry(page, { date, title, work, hours = "7.5", category = "GIS & remote sensing" }) {
  await page.goto(BASE + "/entry");
  await page.fill("#date", date);
  await page.fill("#hours", hours);
  await page.selectOption("#category", category);
  await page.fill("#title", title);
  await page.fill("#work", work);
  await page.fill("#outputs", "varuna_drainage.shp");
  await Promise.all([page.waitForURL("**/entry?m=submitted**"), page.click("form button.primary")]);
}
async function status(page, url) {
  const r = await page.request.get(BASE + url, { maxRedirects: 0 });
  return r.status();
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("Setup");
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(BASE + "/");
    check(new URL(anon.url()).pathname === "/setup", "fresh site sends visitors to /setup");
    await anon.fill("#setup_key", "wrong-key");
    await anon.fill("#name", "Prof. Test PI");
    await anon.fill("#username", "pi");
    await anon.fill("#password", "Adminpass123");
    await anon.fill("#confirm", "Adminpass123");
    await anon.click("button.primary");
    await anon.waitForSelector(".errors");
    check((await anon.textContent(".errors")).includes("setup key is incorrect"), "wrong setup key is refused");
    await anon.fill("#setup_key", SETUP_KEY);
    await anon.fill("#password", "Adminpass123");
    await anon.fill("#confirm", "Adminpass123");
    await Promise.all([anon.waitForURL("**/admin"), anon.click("button.primary")]);
    check(true, "administrator created through /setup");
    await anon.goto(BASE + "/setup");
    check(new URL(anon.url()).pathname === "/login" || new URL(anon.url()).pathname === "/admin", "/setup closes once an admin exists");
    const admin = anon;

    console.log("Accounts");
    await admin.goto(BASE + "/admin/staff");
    await admin.click("text=Create accounts for the roster");
    await admin.waitForSelector(".creds table");
    const creds = {};
    for (const row of await admin.$$(".creds tbody tr")) {
      const cells = await row.$$eval("td", (tds) => tds.map((t) => t.textContent.trim()));
      creds[cells[1]] = cells[2];
    }
    check(Object.keys(creds).length === 5, "roster creates 5 staff accounts with temporary passwords");
    check(q("SELECT count(*) FROM users WHERE password_hash LIKE '$2%'") === "6", "passwords are stored as bcrypt hashes");

    console.log("Staff: Rajat");
    const rajat = await login(browser, "rajat", creds.rajat);
    await rajat.waitForURL("**/password", { timeout: 10000 });
    await rajat.goto(BASE + "/entry");
    check(new URL(rajat.url()).pathname === "/password", "temporary password forces a password change");
    await changePassword(rajat, creds.rajat, "Rajatpass123");
    await addEntry(rajat, { date: "2026-11-02", title: "Rajat private task", work: "Digitised the drainage network of the Varuna sub-basin." });
    check((await rajat.textContent(".flash")).includes("2 Nov 2026"), "entry saved with confirmation");
    await rajat.goto(BASE + "/entry");
    await rajat.$eval("#date", (el) => el.removeAttribute("max")); // skip the browser's own check to test the server's
    await rajat.fill("#date", "2999-01-01");
    await rajat.fill("#title", "Future");
    await rajat.fill("#work", "Something long enough to pass the check.");
    await rajat.click("form button.primary");
    await rajat.waitForSelector(".errors");
    check((await rajat.textContent(".errors")).includes("future"), "future dates are refused");

    await rajat.goto(BASE + "/profile");
    const png = await rajat.screenshot({ clip: { x: 0, y: 0, width: 300, height: 220 } }); // any real image will do
    await rajat.setInputFiles("#photo_file", { name: "me.png", mimeType: "image/png", buffer: png });
    await rajat.waitForSelector(".preview-note");
    await Promise.all([rajat.waitForURL("**/profile?m=profile"), rajat.click("form.panel button.primary")]);
    check(q("SELECT (photo IS NOT NULL) FROM users WHERE username='rajat'") === "t", "photo upload stored");

    console.log("Staff: Raj Kumar");
    const rajk = await login(browser, "rajk", creds.rajk);
    await changePassword(rajk, creds.rajk, "Rajkpass123");
    await addEntry(rajk, { date: "2026-11-03", title: "Rajk own task", work: "Calibrated the rainfall-runoff model for the upper catchment." });

    const rajatId = q("SELECT id FROM users WHERE username='rajat'");
    const rajatEntry = q("SELECT id FROM entries WHERE title='Rajat private task'");
    const rajkEntry = q("SELECT id FROM entries WHERE title='Rajk own task'");

    console.log("Privacy");
    await rajk.goto(BASE + "/my-progress?from=2026-11-01&to=2026-11-30");
    const rajkList = await rajk.textContent("main");
    check(rajkList.includes("Rajk own task") && !rajkList.includes("Rajat private task"), "staff see only their own entries");
    await rajk.goto(BASE + `/entry/${rajatEntry}/edit`);
    check((await rajk.textContent("main")).includes("Page not found"), "staff cannot open another person's entry");
    check((await status(rajk, `/reports/${rajatId}/pdf?from=2026-11-01&to=2026-11-30`)) === 404, "staff cannot download another person's PDF");
    check((await status(rajk, `/reports/${rajatId}/csv`)) === 404, "staff cannot download another person's CSV");
    check((await status(rajk, `/photo/${rajatId}`)) === 404, "staff cannot see another person's photo");
    check((await status(rajk, "/admin/backup")) === 404, "staff cannot download the backup");
    await rajk.goto(BASE + `/reports/${rajatId}/print`);
    check((await rajk.textContent("body")).includes("Page not found"), "staff cannot open another person's print view");
    for (const url of ["/admin", "/admin/log", "/admin/reports", "/admin/staff", `/admin/staff/${rajatId}`]) {
      await rajk.goto(BASE + url);
      check(new URL(rajk.url()).pathname === "/entry", `staff are turned away from ${url}`);
    }
    // forge: point Raj Kumar's own edit form at Rajat's entry
    await rajk.goto(BASE + `/entry/${rajkEntry}/edit`);
    await rajk.$eval('input[name="entry_id"]', (el, id) => (el.value = id), rajatEntry);
    await rajk.fill("#title", "HACKED");
    await rajk.click("form button.primary");
    await rajk.waitForURL("**/my-progress**");
    check(q(`SELECT title FROM entries WHERE id=${rajatEntry}`) === "Rajat private task", "a tampered form cannot change someone else's entry");
    check(q(`SELECT title FROM entries WHERE id=${rajkEntry}`) === "Rajk own task", "the tampered submission changed nothing");

    console.log("Admin review");
    await admin.goto(BASE + "/admin/log?from=2026-11-01&to=2026-11-30");
    const log = await admin.textContent("main");
    check(log.includes("Rajat private task") && log.includes("Rajk own task"), "admin sees everyone's entries");
    check((await status(admin, `/photo/${rajatId}`)) === 200, "admin can see staff photos");
    await admin.goto(BASE + `/admin/log?from=2026-11-01&to=2026-11-30&review_open=${rajatEntry}`);
    await admin.click(`#entry-${rajatEntry} button[value="revision"]`);
    await admin.waitForURL("**m=needremark**");
    check(true, "revision without a remark is refused");
    await admin.goto(BASE + `/admin/log?from=2026-11-01&to=2026-11-30&review_open=${rajatEntry}`);
    await admin.fill(`#remark-${rajatEntry}`, "Please add the output file location.");
    await Promise.all([admin.waitForURL("**m=revision**"), admin.click(`#entry-${rajatEntry} button[value="revision"]`)]);
    await rajat.goto(BASE + "/my-progress?from=2026-11-01&to=2026-11-30");
    check((await rajat.textContent("main")).includes("Please add the output file location."), "staff see the PI's remark");
    check((await rajat.$(`#entry-${rajatEntry} summary`)) === null, "entries under review can't be deleted");
    await admin.goto(BASE + "/admin/log?from=2026-11-01&to=2026-11-30");
    await Promise.all([admin.waitForURL("**m=reviewed**"), admin.click(`#entry-${rajatEntry} button:has-text("Mark reviewed")`)]);
    await rajat.goto(BASE + `/entry/${rajatEntry}/edit`);
    check(rajat.url().includes("m=locked"), "reviewed entries are locked for staff");

    console.log("Reports");
    const pdf = await admin.request.get(BASE + `/reports/${rajatId}/pdf?from=2026-11-01&to=2026-11-30`);
    const pdfBody = await pdf.body();
    check(pdf.status() === 200 && pdfBody.slice(0, 4).toString() === "%PDF" && pdfBody.length > 5000, "admin downloads a PDF report");
    fs.writeFileSync(path.join(OUT, "sample_report.pdf"), pdfBody);
    const own = await rajat.request.get(BASE + `/reports/${rajatId}/pdf?from=2026-11-01&to=2026-11-30`);
    check(own.status() === 200, "staff download their own PDF");
    const csv = await (await admin.request.get(BASE + `/reports/${rajatId}/csv?from=2026-11-01&to=2026-11-30`)).text();
    check(csv.includes("Rajat private task") && !csv.includes("Rajk own task"), "CSV holds only that person's entries");
    const backup = await (await admin.request.get(BASE + "/admin/backup")).text();
    check(backup.includes("Rajat private task") && !backup.includes("password_hash") && !backup.includes("$2b$"), "backup has all entries and no passwords");

    console.log("Account controls");
    await admin.goto(BASE + `/admin/staff/${q("SELECT id FROM users WHERE username='rajk'")}`);
    await admin.click("text=Reset password");
    await admin.waitForSelector(".creds");
    await rajk.goto(BASE + "/entry");
    check(new URL(rajk.url()).pathname === "/login", "a password reset signs the person out");
    await admin.click("text=Deactivate account");
    await admin.waitForURL("**m=deactivated**");
    const again = await browser.newContext();
    const p2 = await again.newPage();
    await p2.goto(BASE + "/login");
    await p2.fill("#username", "rajk");
    await p2.fill("#password", "Rajkpass123");
    await p2.click("button.primary");
    await p2.waitForSelector(".errors");
    check(true, "deactivated accounts cannot sign in");
    const submit = () => Promise.all([p2.waitForResponse((r) => r.request().method() === "POST"), p2.click("button.primary")]);
    for (let i = 0; i < 5; i++) {
      await p2.fill("#username", "anas");
      await p2.fill("#password", "wrong-password-" + i);
      await submit();
    }
    await p2.fill("#username", "anas");
    await p2.fill("#password", creds.anas);
    await submit();
    await p2.waitForSelector(".errors");
    check((await p2.textContent(".errors")).includes("Too many failed attempts"), "repeated wrong passwords lock the username");

    console.log("Screenshots");
    await admin.goto(BASE + "/admin");
    await admin.screenshot({ path: path.join(OUT, "admin.png"), fullPage: true });
    await admin.goto(BASE + `/reports/${rajatId}/print?from=2026-11-01&to=2026-11-30`);
    await admin.screenshot({ path: path.join(OUT, "print.png") });
    await rajat.goto(BASE + "/entry");
    await rajat.screenshot({ path: path.join(OUT, "staff.png") });
    const phone = await login(browser, "rajat", "Rajatpass123", { width: 390, height: 844 });
    await phone.waitForURL("**/entry");
    await phone.screenshot({ path: path.join(OUT, "phone.png") });

    console.log(`\nAll ${passed} checks passed.`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
