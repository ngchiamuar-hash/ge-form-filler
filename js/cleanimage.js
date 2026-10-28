// Prepares a screenshot for reading: enlarge, black-and-white, and remove table grid lines
// (ePartner tables have borders that otherwise get read as letters like | [ I). Runs in the browser on a canvas.
async function cleanImage(blob, scale = 3) {
  const img = await createImageBitmap(blob);
  const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H);
  const d = px.data;

  // grayscale, then stretch contrast to the full range
  const g = new Uint8ClampedArray(W * H);
  let lo = 255, hi = 0;
  for (let i = 0; i < W * H; i++) { const v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; g[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = Math.max(1, hi - lo);
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) dark[i] = ((g[i] - lo) * 255) / range < 150 ? 1 : 0;

  // Long straight dark runs are grid lines, not text.
  const minH = Math.round(55 * scale), minV = Math.round(26 * scale);
  const kill = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && dark[y * W + x]) run++;
      else { if (run >= minH) for (let k = x - run; k < x; k++) kill[y * W + k] = 1; run = 0; }
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y <= H; y++) {
      if (y < H && dark[y * W + x]) run++;
      else { if (run >= minV) for (let k = y - run; k < y; k++) kill[k * W + x] = 1; run = 0; }
    }
  }
  for (let i = 0; i < W * H; i++) { const v = dark[i] && !kill[i] ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  ctx.putImageData(px, 0, 0);
  return canvas;
}

export { cleanImage };
