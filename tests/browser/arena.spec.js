const { test, expect } = require('@playwright/test');

test('3D arena, controls, health, minimap privacy, effects, resizing and rematches', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  await page.goto('http://localhost:3001');
  await page.waitForFunction(() => typeof window.initGame === 'function');
  await page.evaluate(() => {
    authOverlay.classList.add('hidden'); setActiveScreen(gameScreen);
    socket.id = 'local';
    window.sent = [];
    socket.emit = (name, data) => { window.sent.push({ name, data }); };
    window.fixturePlayers = [
      { id: 'local', name: 'YOU', x: 300, y: 360, angle: 0, health: 100, alive: true, weapon: 'autoRifle', color: '#46cab6' },
      { id: 'enemy', name: 'RIVAL', x: 620, y: 300, angle: 2.5, health: 65, alive: true, weapon: 'sniper', color: '#ed8261' },
    ];
    window.fixtureWalls = [
      { x: 100, y: 130, width: 250, height: 26 }, { x: 450, y: 100, width: 24, height: 200 },
      { x: 600, y: 420, width: 180, height: 28 }, { x: 170, y: 440, width: 26, height: 100 },
      { x: 680, y: 100, width: 120, height: 22 }, { x: 80, y: 260, width: 24, height: 130 },
      { x: 400, y: 450, width: 120, height: 26 }, { x: 800, y: 220, width: 22, height: 130 },
    ];
    initGame(structuredClone(fixturePlayers), fixtureWalls);
  });
  await expect(page.locator('.character-health')).toHaveCount(2);
  await expect(page.locator('#render-error')).toBeHidden();
  await expect(page.locator('.character-health').nth(1)).toContainText('65');
  const mapBefore = await page.locator('#minimap').evaluate(c => c.toDataURL());
  await page.evaluate(() => {
    const state = structuredClone(fixturePlayers); state[1].x += 100; state[1].health = 20;
    socket.listeners('gameState').forEach(fn => fn(state));
  });
  await expect(page.locator('.character-health').nth(1)).toContainText('20');
  expect(await page.locator('#minimap').evaluate(c => c.toDataURL())).toBe(mapBefore);
  await page.keyboard.down('d'); await page.waitForTimeout(200); await page.keyboard.up('d');
  expect(await page.evaluate(() => sent.some(e => e.name === 'playerUpdate' && e.data.x > 300))).toBeTruthy();
  const canvas = await page.locator('#game-canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width * 0.65, canvas.y + canvas.height * 0.5);
  expect(await page.evaluate(() => sent.some(e => e.name === 'shoot' && Number.isFinite(e.data.angle)))).toBeTruthy();
  await page.evaluate(() => socket.listeners('shotFired').forEach(fn => fn({ playerId: 'local', x: 340, y: 360, endX: 620, endY: 300, hit: 'player' })));
  await page.locator('#raytracing-toggle').uncheck();
  await page.locator('#raytracing-toggle').check();
  await page.screenshot({ path: 'test-results/arena-desktop.png' });
  await page.setViewportSize({ width: 600, height: 850 });
  await page.screenshot({ path: 'test-results/arena-narrow.png' });
  await page.evaluate(() => {
    socket.listeners('playerKilled').forEach(fn => fn('local'));
  });
  await expect(page.locator('#game-message')).toContainText('Spectating');
  await expect(page.locator('.character-health').first()).toBeHidden();
  await page.evaluate(() => initGame(structuredClone(fixturePlayers), fixtureWalls));
  await expect(page.locator('.character-health')).toHaveCount(2);
  expect(errors).toEqual([]);
});
