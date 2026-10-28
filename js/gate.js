// Passcode screen. The page starts locked; the code is checked against a scrambled (SHA-256) copy,
// so the passcode itself is not written in the published code. Each device remembers it after one correct entry.
// To change the passcode: replace HASH with sha256('geff-passcode:' + newCode). Every device will then ask again.
(function () {
  const HASH = '22f7a79c3e5762027ac09a69dd3f647feb310276de9493c0efadca50ce7664fa';
  const KEY = 'geff.unlock';
  const $ = id => document.getElementById(id);
  const remembered = () => { try { return localStorage.getItem(KEY) === HASH; } catch { return false; } };
  const unlock = () => { document.body.classList.remove('locked'); $('gate').classList.add('hidden'); };
  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  if (remembered()) { unlock(); return; }
  $('gateCode').focus();
  $('gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (await sha('geff-passcode:' + $('gateCode').value.trim()) === HASH) {
      try { localStorage.setItem(KEY, HASH); } catch { /* private window: ask again next time */ }
      unlock();
    } else {
      $('gateMsg').textContent = 'Wrong passcode. Please try again.';
      $('gateCode').value = ''; $('gateCode').focus();
    }
  });
  window.geffLock = () => { try { localStorage.removeItem(KEY); } catch { /* nothing stored */ } location.reload(); };
})();
