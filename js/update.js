// Keeps the home-screen app up to date: each time it opens (or comes back to the front), it checks
// whether a newer version has been published and, if so, reloads itself. No data is sent anywhere.
(function () {
  const current = +(document.querySelector('meta[name="app-version"]')?.content || 0);
  let checking = false;
  async function check() {
    if (checking || !current) return;
    checking = true;
    try {
      const html = await (await fetch('./index.html?check=' + Date.now(), { cache: 'no-store' })).text();
      const latest = +((html.match(/name="app-version" content="(\d+)"/) || [])[1] || 0);
      if (latest > current) location.replace('./?v=' + latest);
    } catch { /* offline: keep using this version */ }
    checking = false;
  }
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
})();
