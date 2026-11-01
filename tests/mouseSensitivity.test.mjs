import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../public/mouseSensitivity.js', import.meta.url), 'utf8');

test('mouse sensitivity defaults to the current value and persists per user', () => {
  const values = new Map();
  const context = createContext({
    MOVEMENT: { mouseSensitivity: 0.0011 },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    module: { exports: {} },
  });
  runInContext(source, context);
  const settings = context.module.exports;

  assert.equal(settings.setUser('Qing'), 100);
  assert.equal(settings.getSensitivity(), 0.0011);
  assert.equal(settings.setPercent(65), 65);
  assert.equal(settings.getSensitivity(), 0.000715);
  assert.equal(settings.setUser('other'), 100);
  assert.equal(settings.setUser('qing'), 65);
  assert.equal(settings.setPercent(500), 200);
  assert.equal(settings.setPercent(100), 100);
  assert.equal(settings.getSensitivity(), 0.0011);
});
