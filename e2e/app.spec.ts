import { test, expect, type Page } from '@playwright/test';

/**
 * Browser acceptance tests. They run against the production build in headless
 * Chromium (software WebGL via SwiftShader), so the app is forced to Low
 * quality and timings are generous.
 */

type GM = {
  engine: { time: number; count: number; bodies: { id: string; name: string; x: number; y: number; z: number; vx: number; vz: number; mass: number; kind: string }[]; getBody(id: string): { x: number; y: number; z: number; mass: number } | undefined };
  world: { getState(): Record<string, unknown> & { loadPreset(id: string): void; setTimeScale(t: number): void; focus(id: string): void; select(id: string | null): void; selectedId: string | null; paused: boolean; timeScale: number; presetId: string; worldName: string } };
  ui: { getState(): { setIntroDone(v: boolean): void; tool: string } };
};

const errors: string[] = [];

async function boot(page: Page) {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('godmode.settings.v1', JSON.stringify({ state: { quality: 'low', audioMuted: true }, version: 0 }));
    localStorage.setItem('godmode.hints.v1', '1');
  });
  await page.goto('/');
  await expect(page.getByTestId('universe-canvas')).toBeVisible();
  await page.waitForFunction(() => ((window as unknown as { __GODMODE__?: GM }).__GODMODE__?.engine.count ?? 0) > 0);
  await page.evaluate(() => (window as unknown as { __GODMODE__: GM }).__GODMODE__.ui.getState().setIntroDone(true));
}

/** Runs `fn` in the page with the app's debug handle (window.__GODMODE__). */
const gm = <T>(page: Page, fn: (g: GM) => T) => page.evaluate(`(${fn.toString()})(window.__GODMODE__)`) as Promise<T>;

async function screenPos(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((bodyId) => {
    const t = (window as unknown as { __GODMODE_THREE__: { overlay: { entries: Map<string, { x: number; y: number; visible: boolean }> } } }).__GODMODE_THREE__;
    const e = t.overlay.entries.get(bodyId);
    return e ? { x: e.x, y: e.y } : { x: -1, y: -1 };
  }, id);
}

test('1. launches into a working solar system with stable orbits', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('world-name')).toHaveText('Our Solar System');
  const count = await gm(page, (g) => g.engine.count);
  expect(count).toBeGreaterThanOrEqual(9);
  // 2. A planet orbits its star without flying away.
  await page.waitForFunction(() => (window as unknown as { __GODMODE__: GM }).__GODMODE__.engine.time > 0.15, null, { timeout: 60_000 });
  const r = await gm(page, (g) => {
    const e = g.engine.getBody('earth')!;
    const s = g.engine.getBody('sun')!;
    return Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z);
  });
  expect(r).toBeGreaterThan(0.95);
  expect(r).toBeLessThan(1.05);
});

test('3. camera orbits and zooms', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(1500);
  const before = (await page.evaluate(() => {
    const c = (window as unknown as { __GODMODE_THREE__: { camera: { position: { x: number; y: number; z: number } } } }).__GODMODE_THREE__.camera.position;
    return [c.x, c.y, c.z];
  })) as number[];
  await page.mouse.move(700, 500);
  await page.mouse.down();
  await page.mouse.move(900, 450, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(1500);
  const after = (await page.evaluate(() => {
    const c = (window as unknown as { __GODMODE_THREE__: { camera: { position: { x: number; y: number; z: number } } } }).__GODMODE_THREE__.camera.position;
    return [c.x, c.y, c.z];
  })) as number[];
  expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])).toBeGreaterThan(1);
});

test('4-5. clicking a planet selects it and shows its real data', async ({ page }) => {
  await boot(page);
  await gm(page, (g) => g.world.getState().focus('jupiter'));
  await page.waitForTimeout(6000);
  await gm(page, (g) => g.world.getState().select(null));
  await page.waitForTimeout(500);
  const p = await screenPos(page, 'jupiter');
  expect(p.x).toBeGreaterThan(0);
  await page.mouse.click(p.x, p.y);
  const panel = page.getByTestId('properties-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('body-name')).toHaveValue('Jupiter');
  await expect(page.getByTestId('prop-mass')).toContainText('317');
  await expect(page.getByTestId('prop-orbit')).toContainText('Sun');
});

test('6. adding a planet with the placement tool affects the simulation', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(2500);
  const before = await gm(page, (g) => g.engine.count);
  await page.keyboard.press('2');
  await expect(page.getByTestId('placement-panel')).toBeVisible();
  await page.getByTestId('type-jupiter').click();
  await page.mouse.move(900, 600);
  await page.waitForTimeout(1200);
  await page.mouse.click(900, 600);
  await expect.poll(() => gm(page, (g) => g.engine.count)).toBe(before + 1);
  const added = await gm(page, (g) => {
    const b = g.engine.bodies[g.engine.bodies.length - 1];
    return { kind: b.kind, speed: Math.hypot(b.vx, b.vz) };
  });
  expect(added.kind).toBe('gasGiant');
  expect(added.speed).toBeGreaterThan(0.5); // automatic circular orbit
  // Undo removes it again.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(() => gm(page, (g) => g.engine.count)).toBe(before);
});

test('7. editing mass changes the gravity in the engine', async ({ page }) => {
  await boot(page);
  await gm(page, (g) => g.world.getState().select('sun'));
  await expect(page.getByTestId('properties-panel')).toBeVisible();
  const field = page.getByTestId('edit-mass');
  await field.fill('3');
  await field.press('Enter');
  await expect.poll(() => gm(page, (g) => g.engine.getBody('sun')!.mass)).toBeCloseTo(3, 5);
});

test('8-9. pause stops time; fast-forward speeds it up', async ({ page }) => {
  await boot(page);
  await page.getByTestId('play-pause').click();
  const t0 = await gm(page, (g) => g.engine.time);
  await page.waitForTimeout(1500);
  const t1 = await gm(page, (g) => g.engine.time);
  expect(t1).toBe(t0);
  expect(await gm(page, (g) => g.world.getState().paused)).toBe(true);
  await page.getByTestId('play-pause').click();
  const ts0 = await gm(page, (g) => g.world.getState().timeScale);
  await page.getByTestId('faster').click();
  await page.getByTestId('faster').click();
  const ts1 = await gm(page, (g) => g.world.getState().timeScale);
  expect(ts1).toBeCloseTo(ts0 * 4, 6);
  const a = await gm(page, (g) => g.engine.time);
  await page.waitForTimeout(1500);
  const b = await gm(page, (g) => g.engine.time);
  expect(b).toBeGreaterThan(a);
  await expect(page.getByTestId('time-rate')).not.toHaveText('Paused');
});

test('10. the collision preset produces a real collision', async ({ page }) => {
  await boot(page);
  await gm(page, (g) => g.world.getState().loadPreset('collision'));
  await expect(page.getByTestId('world-name')).toHaveText('Planet Collision');
  await gm(page, (g) => g.world.getState().setTimeScale(0.02));
  await page.waitForFunction(() => !(window as unknown as { __GODMODE__: GM }).__GODMODE__.engine.getBody('theia'), null, { timeout: 80_000 });
  await expect(page.getByTestId('toasts')).toContainText(/Theia/);
  const gaia = await gm(page, (g) => g.engine.getBody('gaia')!.mass);
  expect(gaia).toBeGreaterThan(0);
});

test('11-12. black hole attracts and absorbs; its visuals render', async ({ page }) => {
  await boot(page);
  await gm(page, (g) => g.world.getState().loadPreset('blackhole'));
  await expect(page.getByTestId('world-name')).toHaveText('Black Hole');
  const m0 = await gm(page, (g) => g.engine.getBody('gargantua')!.mass);
  // Accretion disk, photon-ring billboard and lensing billboard exist in the scene.
  const visuals = await page.evaluate(() => {
    let disk = false;
    let halo = false;
    (window as unknown as { __GODMODE_THREE__: { scene: { traverse(fn: (o: { material?: { uniforms?: Record<string, unknown> } }) => void): void } } }).__GODMODE_THREE__.scene.traverse((o) => {
      const u = o.material?.uniforms;
      if (u && 'uBeta' in u) disk = true;
      if (u && 'uNormalView' in u) halo = true;
    });
    return { disk, halo };
  });
  expect(visuals).toEqual({ disk: true, halo: true });
  await gm(page, (g) => g.world.getState().setTimeScale(0.5));
  await page.waitForFunction(() => !(window as unknown as { __GODMODE__: GM }).__GODMODE__.engine.getBody('wanderer'), null, { timeout: 80_000 });
  const m1 = await gm(page, (g) => g.engine.getBody('gargantua')!.mass);
  expect(m1).toBeGreaterThan(m0);
});

test('13. switching presets resets state', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(1500);
  await page.getByTestId('preset-button').click();
  await page.getByTestId('preset-binary').click();
  await expect(page.getByTestId('world-name')).toHaveText('Binary Stars');
  const s = await gm(page, (g) => ({ count: g.engine.count, time: g.engine.time, selected: g.world.getState().selectedId }));
  expect(s.count).toBe(7);
  expect(s.time).toBeLessThan(0.05);
  expect(s.selected).toBeNull();
});

test('14. saving and loading restores a universe', async ({ page }) => {
  await boot(page);
  await gm(page, (g) => g.world.getState().loadPreset('binary'));
  await page.waitForTimeout(1500);
  const saved = await gm(page, (g) => ({ count: g.engine.count, names: g.engine.bodies.map((b) => b.name).sort() }));
  await page.getByTestId('open-save').click();
  await page.getByTestId('save-name').fill('E2E world');
  await page.getByTestId('save-confirm').click();
  await page.keyboard.press('Escape');
  await gm(page, (g) => g.world.getState().loadPreset('empty'));
  await expect.poll(() => gm(page, (g) => g.engine.count)).toBe(0);
  await page.getByTestId('open-load').click();
  await page.getByTestId('load-slot').first().click();
  await expect(page.getByTestId('world-name')).toHaveText('E2E world');
  const restored = await gm(page, (g) => ({ count: g.engine.count, names: g.engine.bodies.map((b) => b.name).sort() }));
  expect(restored).toEqual(saved);
});

test('15. core UI controls work without critical console errors', async ({ page }) => {
  await boot(page);
  await page.getByTestId('open-help').click();
  await expect(page.getByTestId('help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('toggle-grid').click();
  await page.waitForTimeout(800);
  await page.getByTestId('toggle-trails').click();
  await page.getByTestId('toggle-cinematic').click();
  await page.waitForTimeout(800);
  await page.keyboard.press('c');
  await page.getByTestId('tool-blackHole').click();
  await expect(page.getByTestId('placement-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('placement-panel')).toBeHidden();
  expect(errors).toEqual([]);
});
