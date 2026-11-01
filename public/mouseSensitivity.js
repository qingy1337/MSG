const mouseSensitivitySettings = (() => {
  const PREFIX = 'blocks.mouseSensitivity.';
  const MIN = 40;
  const MAX = 200;
  let username = null;
  let percent = 100;

  function clamp(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(MIN, Math.min(MAX, Math.round(number / 5) * 5)) : 100;
  }

  function setUser(name) {
    username = typeof name === 'string' && name.trim() ? name.trim().toLowerCase() : null;
    percent = 100;
    if (username) {
      try {
        const saved = localStorage.getItem(PREFIX + username);
        if (saved !== null) percent = clamp(saved);
      } catch (_) { /* Private browsing may block storage. */ }
    }
    return percent;
  }

  function setPercent(value) {
    percent = clamp(value);
    if (username) {
      try { localStorage.setItem(PREFIX + username, String(percent)); }
      catch (_) { /* The setting still works until the page reloads. */ }
    }
    return percent;
  }

  return {
    setUser,
    setPercent,
    getPercent: () => percent,
    getSensitivity: () => MOVEMENT.mouseSensitivity * percent / 100,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = mouseSensitivitySettings;
