// Drawing helpers for flat (non-fillable) PDFs. Coordinates are PDF points, origin bottom-left.
import { rgb } from './vendor.js';
import { up } from './util.js';

const INK = rgb(0.05, 0.1, 0.45); // dark blue, as the forms ask for

function makeOverlay(pdf, fonts) {
  const page = i => pdf.getPage(i);
  return {
    // One character per box (align: 'right' for amounts). Returns false (and draws nothing) if the text does not fit.
    cells(p, text, { x, y, h, cw, n, align }, size = 9) {
      const s = up(text);
      if (!s) return true;
      if (s.length > n) return false;
      const start = align === 'right' ? n - s.length : 0;
      [...s].forEach((ch, j) => {
        const i = start + j;
        if (ch === ' ') return;
        const w = fonts.reg.widthOfTextAtSize(ch, size);
        page(p).drawText(ch, { x: x + i * cw + (cw - w) / 2, y: y + (h - size * 0.72) / 2, size, font: fonts.reg, color: INK });
      });
      return true;
    },
    // Free text on a line; shrinks down to 6pt to fit maxW. Returns false if it still won't fit.
    text(p, text, { x, y, maxW, size = 9 }) {
      const s = (text ?? '').toString().trim();
      if (!s) return true;
      let sz = size;
      while (sz > 6 && fonts.reg.widthOfTextAtSize(s, sz) > maxW) sz -= 0.5;
      if (fonts.reg.widthOfTextAtSize(s, sz) > maxW) return false;
      page(p).drawText(s, { x, y, size: sz, font: fonts.reg, color: INK });
      return true;
    },
    // Wrap free text across several ruled lines. Returns false if it overflows.
    lines(p, text, { x, ys, maxW, size = 9 }) {
      const words = (text ?? '').toString().trim().split(/\s+/).filter(Boolean);
      const out = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (fonts.reg.widthOfTextAtSize(t, size) <= maxW) cur = t; else { out.push(cur); cur = w; }
      }
      if (cur) out.push(cur);
      if (out.length > ys.length) return false;
      out.forEach((l, i) => page(p).drawText(l, { x, y: ys[i], size, font: fonts.reg, color: INK }));
      return true;
    },
    tick(p, { x, y, s }) {
      const size = s * 1.05;
      page(p).drawText('\u2714', { x: x + s * 0.08, y: y + s * 0.15, size, font: fonts.zapf, color: INK });
    },
  };
}

export { makeOverlay, INK };
