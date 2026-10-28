// Reads a PDF's printed text and drawn lines/boxes (positions in PDF points, origin bottom-left).
// Used by the basic fill to find the boxes next to labels like "Policy No." on forms that are not mapped by hand.
import { pdfjs } from './vendor.js';

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

async function analyse(bytes) {
  const lib = await pdfjs();
  const O = lib.OPS;
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const texts = (await page.getTextContent()).items.filter(i => i.str && i.str.trim())
      .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]), font: i.fontName, skew: Math.abs(i.transform[2]) > 0.01 }));
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const ap = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    const vs = [], hs = [], rects = [];
    const edge = (x1, y1, x2, y2, rect = false) => {
      if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) > 3) vs.push({ x: x1, y0: Math.min(y1, y2), y1: Math.max(y1, y2), rect });
      else if (Math.abs(y1 - y2) < 0.5 && Math.abs(x1 - x2) > 3) hs.push({ y: y1, x0: Math.min(x1, x2), x1: Math.max(x1, x2), rect });
    };
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm);
      else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.constructPath) {
        const [sub, args] = a; let k = 0, last = null;
        for (const s of sub) {
          if (s === O.rectangle) {
            const [x, y, w, h] = args.slice(k, k + 4); k += 4;
            const [X, Y] = ap(x, y), [X2, Y2] = ap(x + w, y + h);
            const r = { x: Math.min(X, X2), y: Math.min(Y, Y2), w: Math.abs(X2 - X), h: Math.abs(Y2 - Y) };
            if (r.h < 1.5 && r.w > 3) hs.push({ y: r.y, x0: r.x, x1: r.x + r.w });          // thin rect = line
            else if (r.w < 1.5 && r.h > 3) vs.push({ x: r.x, y0: r.y, y1: r.y + r.h });
            else { rects.push(r); edge(r.x, r.y, r.x, r.y + r.h, true); edge(r.x + r.w, r.y, r.x + r.w, r.y + r.h, true); edge(r.x, r.y, r.x + r.w, r.y, true); edge(r.x, r.y + r.h, r.x + r.w, r.y + r.h, true); }
          } else if (s === O.moveTo) { last = ap(args[k], args[k + 1]); k += 2; }
          else if (s === O.lineTo) { const p = ap(args[k], args[k + 1]); k += 2; if (last) edge(last[0], last[1], p[0], p[1]); last = p; }
          else if (s === O.curveTo) k += 6;
          else if (s === O.curveTo2 || s === O.curveTo3) k += 4;
        }
      }
    }
    // italic text = the Malay translation lines on GE forms (fonts are loaded once the page has been processed)
    for (const t of texts) { let name = ''; try { name = page.commonObjs.get(t.font)?.name || ''; } catch { /* font not loaded */ } t.italic = t.skew || /italic|oblique/i.test(name); }
    pages.push({ texts, vs, hs, rects });
  }
  await doc.destroy();
  return pages;
}

export { analyse };
