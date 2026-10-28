// Basic fill for any form that has not been mapped by hand: finds the common labels
// (Proposal No., Policy No., customer name, NRIC) and writes into the boxes, line or field next to them.
// Anything it cannot place safely is left blank and reported.
import { up, digits, isBlank } from './util.js';
import { analyse } from './pdfshapes.js';

const TARGETS = [
  { key: 'proposalNo', label: 'Proposal No.', re: /proposal\s*(no|number)\b/i, every: true, value: d => up(d.policy.proposalNo) },
  { key: 'policyNo', label: 'Policy No.', re: /(^|[^a-z])policy\s*(no|number)\b/i, every: true, value: d => up(d.policy.policyNo) },
  { key: 'name', label: 'Customer name', every: false,
    re: /^\W*\d*\)?\s*(full\s*name|name\s+of\s+(the\s+)?(life\s+(to\s+be\s+)?assured|policy\s*owner|proposer|insured|assured|claimant|customer|deceased)|(policy\s*owner|proposer|customer|life\s+assured)'?s?\s+name|name\s+as\s+per)/i,
    value: (d, str) => up(/proposer|policy\s*owner/i.test(str) && d.proposer ? d.proposer.fullName : d.la.fullName) },
  { key: 'nric', label: 'NRIC', every: false, re: /^\W*\d*\)?\s*(new\s+)?(nric|i\/?c|mykad|identity\s+card)(\s*\(?12\s*digits\)?)?(\s*(\/\s*passport)?\s*(no|number)\b|\s*:|$)/i,
    value: d => ((d.la.idType || 'NRIC') === 'NRIC' ? digits(d.la.idNo) : up(d.la.idNo).replace(/\s/g, '')) },
];

// Boxes to the right of a label on the same row
function findCells(pg, lab) {
  const mid = lab.y + lab.h * 0.35, xEnd = lab.x + lab.w;
  const all = pg.vs.filter(v => v.y0 <= mid + 1 && v.y1 >= mid - 1 && v.y1 - v.y0 >= 6 && v.y1 - v.y0 <= 32 && v.x > xEnd - 3 && v.x < xEnd + 330);
  if (!all.length) return null;
  // Box dividers share the same top and bottom; other lines (label borders, frames) do not
  const key = v => `${Math.round(v.y0)}|${Math.round(v.y1)}`;
  const count = {}; all.forEach(v => { count[key(v)] = (count[key(v)] || 0) + 1; });
  const [modal] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const [my0, my1] = modal.split('|').map(Number);
  const vs = all.filter(v => Math.abs(v.y0 - my0) <= 1.5 && Math.abs(v.y1 - my1) <= 1.5);
  const xs = [...new Set(vs.map(v => Math.round(v.x * 10) / 10))].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1.5);
  // A gap with printed text in it (e.g. the "-" between NRIC box groups) is a separator, not a box
  const hasText = (x0, x1) => pg.texts.some(t => t.x + t.w / 2 > x0 && t.x + t.w / 2 < x1 && t.y > my0 - 2 && t.y < my1);
  const cells = [];
  for (let i = 0; i < xs.length - 1; i++) { const w = xs[i + 1] - xs[i]; if (w >= 7 && w <= 20 && !hasText(xs[i], xs[i + 1])) cells.push({ x0: xs[i], x1: xs[i + 1] }); }
  // first box after the label, with nothing printed in between
  const start = cells.findIndex(c => c.x0 - xEnd < 200 && !pg.texts.some(t => t !== lab && Math.abs(t.y - lab.y) < 6 && t.x > xEnd && t.x < c.x0));
  if (start < 0) return null;
  const run = [cells[start]];
  for (let i = start + 1; i < cells.length; i++) { if (cells[i].x0 - run.at(-1).x1 < 22) run.push(cells[i]); else break; }
  if (run.length < 3) return null;
  const span = vs.filter(v => v.x >= run[0].x0 - 0.5 && v.x <= run.at(-1).x1 + 0.5);
  const y0 = Math.max(...span.map(v => v.y0)), y1 = Math.min(...span.map(v => v.y1));
  return { cells: run, y: y0, h: y1 - y0 };
}
// Underline or empty box to the right of a label
function findLine(pg, lab) {
  const xEnd = lab.x + lab.w, mid = lab.y + lab.h * 0.35;
  const line = pg.hs.filter(h => h.y >= lab.y - 14 && h.y <= lab.y + 3 && h.x1 > xEnd + 30 && h.x0 > lab.x - 2 && h.x0 < xEnd + 60 && h.x1 - Math.max(h.x0, xEnd) >= 40)
    .filter(h => !pg.texts.some(t => t !== lab && t.y > h.y && t.y < lab.y - 1 && t.x < h.x0 + 30 && t.x + t.w > h.x0 - 5 && t.x > xEnd))
    .sort((a, b) => Math.abs(a.y - lab.y) - Math.abs(b.y - lab.y))[0];
  if (line) { const x = Math.max(line.x0, xEnd) + 3; return { x, y: line.y + 2, maxW: line.x1 - x - 2 }; }
  const box = pg.rects.filter(r => r.y <= mid && r.y + r.h >= mid && r.h >= 9 && r.h <= 32 && r.x > xEnd - 6 && r.x < xEnd + 60 && r.w >= 40)
    .sort((a, b) => a.x - b.x)[0];
  if (box) return { x: box.x + 3, y: box.y + box.h / 2 - 3, maxW: box.w - 6 };
  return null;
}
// Something already printed right after the label (e.g. a pre-filled value or another label) means it is not an empty answer space
const occupied = (pg, lab, x1) => pg.texts.some(t => t !== lab && Math.abs(t.y - lab.y) < 3 && t.x > lab.x + lab.w + 2 && t.x < x1 && /[a-z0-9]/i.test(t.str));

async function basicFill({ pdf, o, fonts, data, issues, bytes }) {
  issues.info('Basic fill', 'This form is not fully set up yet. Only Proposal No., Policy No., customer name and NRIC are filled where the app can find their boxes — please check them and complete the rest by hand.');
  const filled = {}, tooLong = {};
  const fields = pdf.getForm().getFields().filter(f => f.constructor.name === 'PDFTextField');

  if (fields.length) {
    // Fillable PDF: match the form's own field names
    const NAMES = { proposalNo: /propos/i, policyNo: /polic(y)?\s*no|policy$/i, name: /(^|\s)(full\s*)?name/i, nric: /nric|i\/?c\s*no|mykad/i };
    for (const t of TARGETS) {
      const v = t.value(data, ''); if (isBlank(v)) continue;
      for (const f of fields.filter(f => NAMES[t.key].test(f.getName()))) {
        if (!t.every && filled[t.key]) break;
        const max = f.getMaxLength();
        if (max && v.length > max) { tooLong[t.key] = true; continue; }
        f.setText(v); filled[t.key] = (filled[t.key] || 0) + 1;
      }
    }
  } else {
    const pages = await analyse(bytes);
    for (const t of TARGETS) {
      const v = t.value(data, '');
      if (isBlank(v)) continue;
      for (const [p, pg] of pages.entries()) {
        if (!t.every && filled[t.key]) break;
        for (const lab of pg.texts.filter(x => x.str.length <= 70 && t.re.test(x.str))) {
          if (!t.every && filled[t.key]) break;
          const val = t.value(data, lab.str);
          const c = findCells(pg, lab);
          if (c) {
            const chars = t.key === 'nric' ? val.replace(/-/g, '') : val;
            if (chars.length > c.cells.length) { tooLong[t.key] = true; continue; }
            [...chars].forEach((ch, i) => { const cell = c.cells[i]; o.cells(p, ch, { x: cell.x0, y: c.y, h: c.h, cw: cell.x1 - cell.x0, n: 1 }); });
          } else {
            const line = findLine(pg, lab);
            if (!line || occupied(pg, lab, line.x + 40)) continue;
            if (!o.text(p, val, { ...line, size: 9 })) { tooLong[t.key] = true; continue; }
          }
          filled[t.key] = (filled[t.key] || 0) + 1;
          if (t.every) break; // once per page for the header numbers
        }
      }
    }
  }
  for (const t of TARGETS) {
    const v = t.value(data, '');
    if (isBlank(v)) continue;
    if (filled[t.key]) issues.info(t.label, `${t.label} filled${filled[t.key] > 1 ? ` in ${filled[t.key]} places` : ''} — please check the position.`);
    else if (tooLong[t.key]) issues.warn(t.label, `${t.label} did not fit in the boxes — left blank, write by hand.`);
    else issues.warn(t.label, `Could not find where ${t.label} goes on this form — write by hand if needed.`);
  }
  if (fields.length) pdf.getForm().updateFieldAppearances(fonts.reg);
}

export { basicFill };
