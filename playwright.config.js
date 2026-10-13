const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm start', url: 'http://localhost:3001', reuseExistingServer: true },
});
