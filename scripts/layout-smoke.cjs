const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { MeetingStore, localDate } = require('../src/main/store.cjs');

async function run() {
  const tempBase = path.resolve(__dirname, '../tmp');
  await fs.mkdir(tempBase, { recursive: true });
  const root = await fs.mkdtemp(path.join(tempBase, 'layout-smoke-'));
  const store = new MeetingStore(path.join(root, 'documents', 'Isaszeg Replay'));
  const meeting = await store.load(localDate());
  await fs.copyFile(path.resolve(__dirname, '../test/fixtures/sample.mp4'), path.join(store.folder(meeting.date), 'sample.mp4'));
  for (let i = 1; i <= 12; i++) {
    meeting.items.push(
      { id: `race-${i}`, title: `Race ${String(i).padStart(2, '0')}`, kind: 'race', file: 'sample.mp4', mediaType: 'video', raceNumber: i, raceId: null, enabled: true },
      { id: `banner-${i}`, title: `Track banner ${i}`, kind: 'banner', builtin: 'park', enabled: true, seconds: 120 },
      { id: `sponsor-${i}`, title: `Race-day partner ${i}`, kind: 'ad', builtin: i % 2 ? 'redmills' : 'pedro', enabled: true, seconds: 120 }
    );
  }
  await store.save(meeting);
  const errors = [];
  const app = await electron.launch({ args: [path.join(__dirname, 'smoke-entry.cjs'), '--no-sandbox'], env: { ...process.env, ISASZEG_SMOKE_HOME: root } });
  const results = path.resolve(__dirname, '../test-results');
  await fs.mkdir(results, { recursive: true });
  try {
    const desk = await app.firstWindow();
    desk.on('pageerror', error => errors.push(error.message));
    await desk.waitForSelector('#playlist .queue-item');
    for (const [page, label] of Object.entries({ desk: 'Race desk', registration: 'Races & dogs', creative: 'Banners', sponsors: 'Sponsors', settings: 'Settings' })) {
      await desk.locator(`[data-page="${page}"]`).click();
      await expect(desk.locator('.topbar h1')).toHaveText(label);
      for (const selector of ['#display-select', '#output-button', '#meeting-date', '#import-button', '#clock']) await expect(desk.locator(`.topbar ${selector}`)).toBeVisible();
      await expect(desk.getByRole('button', { name: 'Import media', exact: true })).toHaveCount(1);
    }
    await expect(desk.locator('.page-heading, .breadcrumb, .offline-pill, .sidebar-note, .lower-grid, .registration-overview, .section-toolbar')).toHaveCount(0);
    await desk.locator('#meeting-date').fill('2026-01-02');
    await desk.locator('#meeting-date').dispatchEvent('change');
    await expect(desk.locator('#queue-count')).toHaveText('1');
    await desk.locator('#meeting-date').fill(meeting.date);
    await desk.locator('#meeting-date').dispatchEvent('change');
    await expect(desk.locator('#queue-count')).toHaveText('25');
    await desk.locator('#output-button').click();
    await expect(desk.locator('#output-button')).toHaveAttribute('aria-pressed', 'true');
    await desk.locator('#output-button').click();
    await expect(desk.locator('#output-button')).toHaveAttribute('aria-pressed', 'false');
    const inList = selector => desk.locator(selector).evaluate(list => {
      const row = list.querySelector('.current');
      if (!row) return false;
      const item = row.getBoundingClientRect(), bounds = list.getBoundingClientRect();
      return item.top >= bounds.top && item.bottom <= bounds.bottom;
    });
    await desk.locator('[data-page="desk"]').click();
    const previewTop = await desk.locator('#preview').evaluate(el => el.getBoundingClientRect().top);
    await desk.evaluate(() => window.replay.command({ type: 'play', id: 'race-12' }));
    await expect.poll(() => inList('#playlist')).toBe(true);
    assert.equal(await desk.locator('#preview').evaluate(el => el.getBoundingClientRect().top), previewTop, 'Following the replay only scrolls its list');
    await desk.evaluate(() => window.replay.command({ type: 'toggle' }));
    await expect(desk.locator('#play-pause')).toHaveAttribute('aria-label', 'Play');
    await desk.locator('#playlist').evaluate(el => { el.scrollTop = 0; });
    await desk.waitForTimeout(600);
    assert.equal(await desk.locator('#playlist').evaluate(el => el.scrollTop), 0, 'Progress reports allow manual browsing');
    await desk.locator('[data-page="settings"]').click();
    await desk.locator('[data-page="desk"]').click();
    await expect.poll(() => inList('#playlist')).toBe(true);
    await desk.screenshot({ path: path.join(results, 'studio-desk.png'), fullPage: true });
    await desk.evaluate(() => window.replay.command({ type: 'play', id: 'sponsor-12' }));
    await expect.poll(() => inList('#sponsor-playlist')).toBe(true);
    await desk.locator('[data-page="sponsors"]').click();
    await expect(desk.locator('#sponsor-grid [aria-current="true"]')).toBeInViewport();
    assert.ok(await desk.evaluate(() => scrollY > 0), 'Returning to sponsors follows the playing card');
    await desk.screenshot({ path: path.join(results, 'studio-sponsors.png'), fullPage: true });
    await desk.evaluate(() => window.replay.command({ type: 'play', id: 'sponsor-1' }));
    await expect(desk.locator('#sponsor-grid [data-item="sponsor-1"]')).toHaveAttribute('aria-current', 'true');
    await expect(desk.locator('#sponsor-grid [aria-current="true"]')).toBeInViewport();
    await desk.evaluate(() => window.replay.command({ type: 'play', id: 'banner-12' }));
    await desk.locator('[data-page="creative"]').click();
    await expect(desk.locator('#creative-grid [aria-current="true"]')).toBeInViewport();
    const backgrounds = await desk.evaluate(() => ({
      preview: getComputedStyle(document.querySelector('#preview')).backgroundColor,
      media: getComputedStyle(document.querySelector('#creative-grid img')).backgroundColor,
      monitor: getComputedStyle(document.querySelector('.monitor-panel')).backgroundColor,
      monitorBorder: getComputedStyle(document.querySelector('.monitor-panel')).borderWidth,
      shell: getComputedStyle(document.body).backgroundColor
    }));
    assert.deepEqual(backgrounds, { preview: 'rgb(0, 0, 0)', media: 'rgb(0, 0, 0)', monitor: 'rgba(0, 0, 0, 0)', monitorBorder: '0px', shell: 'rgb(17, 17, 19)' });
    await desk.locator('[data-page="registration"]').click();
    await desk.screenshot({ path: path.join(results, 'studio-registration.png'), fullPage: true });
    await desk.locator('[data-page="settings"]').click();
    await desk.screenshot({ path: path.join(results, 'studio-settings.png'), fullPage: true });
    for (const width of [1480, 1280, 1040, 800, 620, 375]) {
      await app.evaluate(({ BrowserWindow }, width) => {
        const control = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/index.html'));
        control.setMinimumSize(320, 640); control.setSize(width, 900);
      }, width);
      for (const page of ['desk', 'registration', 'creative', 'sponsors', 'settings']) {
        await desk.locator(`[data-page="${page}"]`).click();
        if (await desk.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
          await desk.screenshot({ path: path.join(results, `overflow-${page}-${width}.png`), fullPage: true });
          console.error(await desk.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth).slice(0, 15).map(el => ({ tag: el.tagName, id: el.id, className: el.className, right: el.getBoundingClientRect().right, viewport: innerWidth }))));
        }
        assert.equal(await desk.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${page} fits at ${width}px`);
      }
      await desk.locator('[data-page="desk"]').click();
      await desk.evaluate(() => scrollTo(0, 0));
      if ([1480, 1040, 375].includes(width)) await desk.screenshot({ path: path.join(results, `studio-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Layout smoke passed: shared toolbar, date and display controls, black media, borderless preview, playback following, manual scrolling, and all views at six widths.');
  } finally {
    await app.close();
    if (path.dirname(root) !== tempBase) throw new Error('Unexpected layout-test cleanup path');
    await fs.rm(root, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
