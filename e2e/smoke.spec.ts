import { resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type Request,
} from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;
let page: Page;

const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
const undefinedAssetUrls: string[] = [];

function trackRequest(request: Request): void {
  const url = request.url();
  if (url.endsWith("/undefined") || /\/assets\/undefined(?:\?|$)/.test(url)) {
    undefinedAssetUrls.push(url);
  }
}

test.beforeAll(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js")],
    cwd: appRoot,
    env,
  });
  page = await app.firstWindow();

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });
  page.on("request", trackRequest);

  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("boots into the editor shell with the toolbar and default level", async () => {
  await expect(page.getByTestId("app-brand")).toContainText("Studio");
  await expect(page.getByRole("button", { name: /Play|Stop/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Level menu" })).toBeVisible();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});

test("toolbar tooltip, level menu, and toggles work above Dockview", async () => {
  pageErrors.length = 0;
  consoleErrors.length = 0;

  const grid = page.getByRole("button", { name: "Grid", exact: true });
  await grid.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("Toggle grid (G)");
  // Portalled content must be the topmost element at its own center (not clipped by Dockview).
  // Tooltip layers are pointer-events:none, which elementFromPoint skips, so lift it for the probe.
  await expect
    .poll(() =>
      tooltip.evaluate((el) => {
        const positioner = el.parentElement!;
        positioner.style.pointerEvents = "auto";
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        positioner.style.pointerEvents = "";
        return positioner.contains(hit) && positioner.parentElement === document.body;
      }),
    )
    .toBe(true);

  const pressed = await grid.getAttribute("aria-pressed");
  expect(pressed === "true" || pressed === "false").toBe(true);
  const toggled = pressed === "true" ? "false" : "true";
  await grid.click();
  await expect(grid).toHaveAttribute("aria-pressed", toggled);
  await grid.click();
  await expect(grid).toHaveAttribute("aria-pressed", pressed!);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();

  const levelMenu = page.getByRole("button", { name: "Level menu" });
  const newLevel = page.getByRole("menuitem", { name: "New Level" });
  const openLevel = page.getByRole("menuitem", { name: /Open Level/ });
  await levelMenu.focus();
  await page.keyboard.press("Enter");
  await expect(newLevel).toBeVisible();
  await expect(openLevel).toBeVisible();
  await expect(levelMenu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[role=menuitem][data-highlighted]")).toHaveCount(1);
  // Arrow navigation refocuses the menu on the next frame; let it land before closing.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.keyboard.press("Escape");
  await expect(newLevel).toBeHidden();
  await expect(levelMenu).toBeFocused();

  await levelMenu.click();
  await expect(newLevel).toBeVisible();
  await levelMenu.click();
  await expect(newLevel).toBeHidden();

  // Selecting an item runs its editor command (fresh doc, so no discard confirm).
  await levelMenu.click();
  await newLevel.click();
  await expect(newLevel).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "New level created." })).toBeVisible();

  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toEqual([]);
});

test("renders non-empty palette sprite previews", async () => {
  const previews = page.locator(
    '[title="spawn"] img, [title="enemy.metool"] img, [title="enemy.bat"] img',
  );
  await expect(previews.first()).toBeVisible({ timeout: 15_000 });

  const count = await previews.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const img = previews.nth(i);
    await expect(img).toHaveAttribute("src", /^(?!.*\/undefined(?:\?|$)).+/);
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth * el.naturalHeight))
      .toBeGreaterThan(0);
  }
});

test("switches to the Scene tab and lists placed objects", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  await expect(page.locator("button[title]").first()).toBeVisible();
});

test("enters and exits Play mode without asset URL failures", async () => {
  pageErrors.length = 0;
  consoleErrors.length = 0;
  failedRequests.length = 0;
  undefinedAssetUrls.length = 0;

  const playButton = page.getByRole("button", { name: /^Play$/ });
  await expect(playButton).toBeVisible();
  await playButton.click();

  const playCanvas = page.locator("#play-canvas");
  await expect(playCanvas).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^Stop$/ })).toBeVisible();
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);

  await expect
    .poll(async () => playCanvas.evaluate((el: HTMLCanvasElement) => el.width * el.height))
    .toBeGreaterThan(0);

  expect(undefinedAssetUrls, `undefined asset URLs: ${undefinedAssetUrls.join("\n")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toEqual([]);

  const relevantConsole = consoleErrors.filter((line) =>
    /undefined|Failed to load|net::ERR_FILE_NOT_FOUND|Could not load sound/i.test(line),
  );
  expect(relevantConsole, `console errors: ${relevantConsole.join("\n")}`).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#play-canvas")).toHaveCount(0);
  await expect(page.locator("#viewport-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play$/ })).toBeVisible();
});

test("toggles developer tools from the Help menu", async () => {
  await page.getByRole("button", { name: "Help menu" }).click();
  await page.getByRole("menuitem", { name: /Toggle Developer Tools/ }).click();

  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.isDevToolsOpened(),
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Help menu" }).click();
  await page.getByRole("menuitem", { name: /Toggle Developer Tools/ }).click();

  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.isDevToolsOpened(),
      ),
    )
    .toBe(false);
});

test("title bar menus work by pointer and keyboard and return focus", async () => {
  pageErrors.length = 0;
  consoleErrors.length = 0;
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const initialTheme = await theme();

  const viewMenu = page.getByRole("button", { name: "View menu" });
  const darkTheme = page.getByRole("menuitemcheckbox", { name: /Dark theme/ });
  const zoomIn = page.getByRole("menuitem", { name: /Zoom In/ });
  const zoomLabel = page.getByText(/^Zoom · \d+%$/);

  // Pointer: open, read a shortcut, toggle the theme (checkbox items keep the menu open).
  await viewMenu.click();
  const zoomBefore = await zoomLabel.textContent();
  await expect(zoomIn.locator("kbd")).toHaveText(/^(Ctrl|⌘)\+=$/);
  await expect(darkTheme).toHaveAttribute("aria-checked", String(initialTheme === "dark"));
  // Portalled above Dockview: the item is the topmost element at its own center.
  await expect
    .poll(() =>
      zoomIn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    )
    .toBe(true);
  await darkTheme.click();
  await expect.poll(theme).not.toBe(initialTheme);
  await expect(darkTheme).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(darkTheme).toBeHidden();
  await expect(viewMenu).toBeFocused();

  // Keyboard: ArrowDown opens on the first item, Enter toggles the theme back.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeFocused();
  await expect(darkTheme).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
  await expect.poll(theme).toBe(initialTheme);
  await page.keyboard.press("Escape");
  await expect(darkTheme).toBeHidden();
  await expect(viewMenu).toBeFocused();

  // A regular item runs its command, closes the menu and refocuses the trigger.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeFocused();
  // Dark theme -> Fullscreen -> Grid -> Snap -> Zoom In (group labels are skipped).
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await expect(zoomIn).toHaveAttribute("data-highlighted", "");
  // Arrow navigation refocuses the menu on the next frame; a select before that frame loses focus to body.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.keyboard.press("Enter");
  await expect(zoomIn).toBeHidden();
  await expect(viewMenu).toBeFocused();
  await viewMenu.click();
  await expect(zoomLabel).not.toHaveText(zoomBefore!);
  await page.keyboard.press("Escape");
  await expect(viewMenu).toBeFocused();

  // Disabled state and labels survive in the File menu.
  const fileMenu = page.getByRole("button", { name: "File menu" });
  await fileMenu.click();
  await expect(page.getByRole("group", { name: "Project" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Export Project/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(fileMenu).toBeFocused();

  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toEqual([]);
});
