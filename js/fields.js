// Finds the questions on any form automatically, from what is printed on it:
//  • tick boxes (small squares)            → tick option, labelled with the text to its right
//  • rows of small character boxes        → answer box (date / NRIC / amount groups are merged)
//  • empty table cells                     → answer box, labelled "row label — column header"
//  • answer lines (underlines)             → answer box, labelled with the text to the left / below
// Positions are PDF points (origin bottom-left), as returned by pdfshapes.analyse().

const near = (a, b, d) => Math.abs(a - b) <= d;
const clip = s => s.replace(/\s+/g, ' ').trim().replace(/[:：]$/, '').slice(0, 90);
const punct = s => /^[\s/\-,.:()%]*$/.test(s);
const isMalay = t => t.italic; // second-language lines are printed in italics on GE forms

function textsIn(pg, x0, x1, y0, y1) {
  return pg.texts.filter(t => t.x + Math.min(t.w, 4) > x0 && t.x < x1 && t.y + t.h * 0.3 > y0 && t.y + t.h * 0.3 < y1);
}
// Closest label to the left on the same row, else just above
function labelFor(pg, x0, y0, y1, skip = []) {
  const mid = (y0 + y1) / 2;
  const left = pg.texts.filter(t => !skip.includes(t) && !punct(t.str) && !isMalay(t) && t.x + t.w <= x0 + 3 && t.x + t.w > x0 - 260 && Math.abs(t.y + t.h * 0.35 - mid) < Math.max(6, (y1 - y0) / 2 + 2))
    .sort((a, b) => (b.x + b.w) - (a.x + a.w));
  if (left.length) {
    // join the pieces of the same label (e.g. "Policy" "No."), stopping at a wide gap
    const row = [left[0]];
    for (const t of left.slice(1)) { if (Math.abs(t.y - row[0].y) < 2 && row.at(-1).x - (t.x + t.w) < 12) row.push(t); }
    const lab = clip(row.reverse().map(t => t.str).join(' '));
    if (lab.length > 3) return lab;
    // very short labels like "F" or "RM": add the column title above
    const head = pg.texts.filter(t => !isMalay(t) && !punct(t.str) && t.y > y1 + 2 && t.y < y1 + 60 && t.x < x0 + 60 && t.x + t.w > x0 - 80).sort((a, b) => a.y - b.y)[0];
    return clip(head ? head.str + ' — ' + lab : lab);
  }
  const above = pg.texts.filter(t => !skip.includes(t) && !punct(t.str) && !isMalay(t) && t.y > y1 - 1 && t.y < y1 + 28 && t.x < x0 + 120 && t.x + t.w > x0 - 40)
    .sort((a, b) => a.y - b.y);
  return above.length ? clip(above[0].str) : '';
}

function detectFields(pages) {
  const fields = [];
  pages.forEach((pg, p) => {
    const corner = r => (r.x < 50 || r.x > 535) && (r.y < 55 || r.y > 785);
    // ── tick boxes ──
    const squares = [];
    for (const r of pg.rects) {
      if (r.w >= 5 && r.w <= 16 && Math.abs(r.w - r.h) < 2.5 && !corner(r) && !squares.some(s => near(s.x, r.x, 2) && near(s.y, r.y, 2))) squares.push(r);
    }
    // squares drawn with four lines
    const vs = pg.vs.filter(v => v.y1 - v.y0 >= 5 && v.y1 - v.y0 <= 16);
    for (const a of vs) for (const b of vs) {
      const w = b.x - a.x;
      if (w >= 5 && w <= 16 && near(a.y0, b.y0, 1) && near(a.y1, b.y1, 1) && near(w, a.y1 - a.y0, 2.5)
        && pg.hs.some(h => near(h.y, a.y1, 1) && h.x0 <= a.x + 1 && h.x1 >= b.x - 1 && h.x1 - h.x0 < 20)
        && !corner({ x: a.x, y: a.y0 }) && !squares.some(s => near(s.x, a.x, 2) && near(s.y, a.y0, 2))) squares.push({ x: a.x, y: a.y0, w, h: a.y1 - a.y0 });
    }
    // a "square" with neighbours at box spacing on both sides is part of a character-box row, not a tick box
    const boxRowXs = new Set();
    for (const s of squares) {
      const cy = s.y + s.h / 2;
      const label = pg.texts.filter(t => !punct(t.str) && !isMalay(t) && t.x >= s.x + s.w - 1 && t.x < s.x + s.w + 30 && Math.abs(t.y + t.h * 0.35 - cy) < 8)
        .sort((a, b) => Math.abs(a.y + a.h * 0.35 - cy) - Math.abs(b.y + b.h * 0.35 - cy) || a.x - b.x)[0];
      if (!label) { boxRowXs.add(s); continue; }
      const row = pg.texts.filter(t => !isMalay(t) && Math.abs(t.y - label.y) < 2 && t.x >= label.x && t.x < label.x + 260).sort((a, b) => a.x - b.x);
      let text = '', lastEnd = label.x;
      for (const t of row) { if (t.x - lastEnd > 14) break; text += (text ? ' ' : '') + t.str; lastEnd = t.x + t.w; }
      fields.push({ type: 'tick', page: p, x: s.x, y: s.y, s: Math.min(s.w, s.h), label: clip(text), labelText: label });
    }

    // ── character-box rows ──
    const clusters = [];
    for (const v of pg.vs.filter(v => v.y1 - v.y0 >= 7 && v.y1 - v.y0 <= 30).sort((a, b) => a.y0 - b.y0)) {
      const c = clusters.find(c => near(c.y0, v.y0, 1.3) && near(c.y1, v.y1, 1.3));
      if (c) c.xs.push(v.x); else clusters.push({ y0: v.y0, y1: v.y1, xs: [v.x] });
    }
    const runs = [];
    for (const { y0, y1, xs: xsRaw } of clusters) {
      const xs = [...new Set(xsRaw.map(x => Math.round(x * 10) / 10))].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1.5);
      let run = [];
      const flush = () => { if (run.length >= 2) runs.push({ y0, y1, cells: run }); run = []; };
      for (let i = 0; i < xs.length - 1; i++) {
        const w = xs[i + 1] - xs[i];
        const cell = { x0: xs[i], x1: xs[i + 1] };
        if (w >= 7 && w <= 20 && !textsIn(pg, cell.x0 + 1, cell.x1 - 1, y0, y1).some(t => !punct(t.str))) {
          if (run.length && cell.x0 - run.at(-1).x1 > 0.5) flush();
          if (!textsIn(pg, cell.x0 + 1, cell.x1 - 1, y0, y1).length) run.push(cell);
        } else flush();
      }
      flush();
    }
    // merge runs on the same row separated only by "/", "-", "," or "." (dates, NRIC, amounts)
    runs.sort((a, b) => b.y0 - a.y0 || a.cells[0].x0 - b.cells[0].x0);
    const merged = [];
    for (const r of runs) {
      const prev = merged.at(-1);
      const gapX0 = prev?.cells.at(-1).x1, gapX1 = r.cells[0].x0;
      if (prev && near(prev.y0, r.y0, 1.5) && near(prev.y1, r.y1, 1.5) && gapX1 - gapX0 < 30 && gapX1 > gapX0
        && textsIn(pg, gapX0, gapX1, r.y0 - 3, r.y1 + 3).every(t => punct(t.str))) {
        prev.sep.push(prev.cells.length); prev.cells.push(...r.cells);
      } else merged.push({ ...r, sep: [] });
    }
    for (const r of merged) {
      // tiny two-box runs that are really tick squares were handled above
      if (r.cells.length < 2) continue;
      fields.push({ type: 'cells', page: p, y: r.y0, h: r.y1 - r.y0, cells: r.cells, groups: r.sep,
        label: labelFor(pg, r.cells[0].x0, r.y0, r.y1) });
    }
    const inRun = (x, y) => merged.some(r => y >= r.y0 - 1 && y <= r.y1 + 1 && x >= r.cells[0].x0 - 1 && x <= r.cells.at(-1).x1 + 1);

    // ── empty table cells (grid made of lines) ──
    const tall = pg.vs.filter(v => v.y1 - v.y0 > 10);
    const colXs = [...new Set(tall.map(v => Math.round(v.x)))].sort((a, b) => a - b);
    for (let i = 0; i < colXs.length - 1; i++) {
      const x0 = colXs[i], x1 = colXs[i + 1];
      if (x1 - x0 < 30) continue;
      const left = tall.filter(v => near(v.x, x0, 0.8)), right = tall.filter(v => near(v.x, x1, 0.8));
      const rows = [...new Set(pg.hs.filter(h => h.x0 <= x0 + 1.5 && h.x1 >= x1 - 1.5).map(h => Math.round(h.y * 2) / 2))].sort((a, b) => b - a);
      for (let j = 0; j < rows.length - 1; j++) {
        const yt = rows[j], yb = rows[j + 1], ch = yt - yb;
        if (ch < 10 || ch > 48) continue;
        const mid = (yt + yb) / 2;
        if (!left.some(v => v.y0 <= mid && v.y1 >= mid) || !right.some(v => v.y0 <= mid && v.y1 >= mid)) continue;
        if (textsIn(pg, x0 + 1, x1 - 1, yb, yt).length) continue;              // something printed inside: not an answer space
        if (squares.some(s => s.x > x0 && s.x < x1 && s.y > yb && s.y < yt)) continue;
        if (inRun(x0 + 2, yb + 2) || inRun(x1 - 2, yb + 2)) continue;
        // row label: nearest printed cell to the left; column header: nearest printed text above in this column
        const rowLab = labelFor(pg, x0, yb, yt);
        const head = pg.texts.filter(t => !isMalay(t) && !punct(t.str) && t.x >= x0 - 2 && t.x < x1 && t.y > yt && t.y < yt + 160).sort((a, b) => a.y - b.y)[0];
        const label = clip([rowLab, head && head.str !== rowLab ? head.str : ''].filter(Boolean).join(' — '));
        fields.push({ type: 'box', page: p, x: x0 + 3, y: yb + ch / 2 - 3, maxW: x1 - x0 - 6, h: ch, label });
      }
    }
    const inBox = (x, y) => fields.some(f => f.type === 'box' && f.page === p && x >= f.x - 4 && x <= f.x + f.maxW + 4 && Math.abs(y - f.y) < f.h / 2 + 2);

    // ── answer lines ──
    for (const h of pg.hs.filter(h => !h.rect && h.x1 - h.x0 >= 40 && h.y > 60)) {      // y > 60: page footer rule
      if (pg.vs.some(v => (near(v.x, h.x0, 1.2) || near(v.x, h.x1, 1.2)) && v.y0 <= h.y + 1 && v.y1 >= h.y - 1 && v.y1 - v.y0 > 4)) continue; // a table border
      if (inBox(h.x0 + 5, h.y + 4)) continue;
      const on = textsIn(pg, h.x0 + 2, h.x1 - 2, h.y - 1, h.y + 10);
      if (on.some(t => !punct(t.str))) continue;                                 // already has printed text on it
      const below = pg.texts.filter(t => t.y < h.y && t.y > h.y - 14 && t.x >= h.x0 - 5 && t.x < h.x1);
      if (below.some(t => /signature|tandatangan|cop |stamp/i.test(t.str))) continue; // signature line: stays for a pen
      let label = labelFor(pg, h.x0, h.y, h.y + 10);
      if (!label && below.length) label = clip(below.filter(t => !isMalay(t)).sort((a, b) => b.y - a.y || a.x - b.x)[0]?.str || '');
      const x = h.x0 + 2;
      fields.push({ type: 'line', page: p, x, y: h.y + 2, maxW: h.x1 - x - 2, label });
    }
  });

  // reading order, ids, and readable labels
  fields.sort((a, b) => a.page - b.page || (b.y - a.y > 4 ? 1 : a.y - b.y > 4 ? -1 : (a.x ?? a.cells?.[0].x0) - (b.x ?? b.cells?.[0].x0)));
  fields.forEach((f, i) => { f.id = 'q' + i; if (!f.label) f.label = f.type === 'tick' ? 'Option' : 'Answer'; delete f.labelText; });
  return fields;
}

// Group tick boxes that belong to one question: same column (stacked, close together) or same row (side by side).
// The question is the label to the left of the group, else the nearest heading above it.
function groupForDisplay(fields, pages) {
  const ticks = fields.filter(f => f.type === 'tick');
  const parent = new Map(ticks.map(t => [t, t]));
  const find = t => (parent.get(t) === t ? t : find(parent.get(t)));
  for (const a of ticks) for (const b of ticks) {
    if (a === b || a.page !== b.page) continue;
    const sameCol = near(a.x, b.x, 15) && Math.abs(a.y - b.y) < 40;
    const sameRow = near(a.y, b.y, 4) && Math.abs(a.x - b.x) < 160;
    if (sameCol || sameRow) parent.set(find(a), find(b));
  }
  const groups = new Map();
  for (const t of ticks) { const r = find(t); (groups.get(r) ?? groups.set(r, []).get(r)).push(t); }
  const optionTexts = new Set(ticks.map(t => t.label));
  const out = [], done = new Set();
  for (const f of fields) {
    if (f.type !== 'tick') { out.push(f); continue; }
    const g = groups.get(find(f));
    if (done.has(g)) continue;
    done.add(g);
    const pg = pages[f.page];
    const top = g.reduce((a, b) => (b.y > a.y ? b : a)), minX = Math.min(...g.map(t => t.x)), maxX = Math.max(...g.map(t => t.x));
    let heading = labelFor(pg, minX, top.y, top.y + top.s);
    if (!heading || optionTexts.has(heading)) {
      const above = pg.texts.filter(t => !t.italic && !punct(t.str) && !optionTexts.has(clip(t.str)) && t.y > top.y + top.s && t.y < top.y + 70 && t.x < maxX + 60 && t.x + t.w > minX - 200)
        .sort((a, b) => a.y - b.y)[0];
      heading = above ? clip(above.str) : '';
    }
    out.push({ type: 'ticks', page: f.page, heading, items: g });
  }
  return out;
}

export { detectFields, groupForDisplay };
