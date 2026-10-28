// Shared helpers: text clean-up, dates, NRIC checks, word wrapping.

const up = s => (s ?? '').toString().replace(/\s+/g, ' ').trim().toUpperCase();
const digits = s => (s ?? '').toString().replace(/\D/g, '');
const isBlank = v => v === undefined || v === null || String(v).trim() === '';

// Accepts DD/MM/YYYY or YYYY-MM-DD. Returns {d,m,y} strings or null if invalid.
function parseDate(s) {
  s = (s || '').toString().trim();
  if (!s) return null;
  let m, d, mo, y;
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { d: String(d).padStart(2, '0'), m: String(mo).padStart(2, '0'), y: String(y) };
}

// Malaysian NRIC: YYMMDD-PB-###G. Last digit odd = male, even = female.
function nricInfo(n) {
  const x = digits(n);
  if (x.length !== 12) return null;
  return { yy: x.slice(0, 2), mm: x.slice(2, 4), dd: x.slice(4, 6), gender: (+x[11]) % 2 ? 'M' : 'F', digits: x };
}

// Wrap words into lines of at most `width` characters. Words longer than a line are split.
function wrap(text, width, maxLines) {
  const words = up(text).split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > width) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, width)); w = w.slice(width); }
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return { lines: lines.slice(0, maxLines), overflow: lines.length > maxLines };
}

// Address lines: keep the user's own line breaks when they fit, otherwise re-wrap.
function addressLines(addr, width, maxLines) {
  const given = [addr?.line1, addr?.line2, addr?.line3].map(up).filter(Boolean);
  if (given.length <= maxLines && given.every(l => l.length <= width)) return { lines: given, overflow: false };
  return wrap(given.join(', '), width, maxLines);
}

function mask(name, id) {
  const initials = up(name).split(' ').filter(Boolean).map(w => w[0]).join('');
  const tail = digits(id).slice(-4) || (id || '').toString().slice(-4);
  return `${initials || '?'} (***${tail})`;
}

function todayStr() {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
}

export { up, digits, isBlank, parseDate, nricInfo, wrap, addressLines, mask, todayStr };
