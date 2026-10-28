// Third-party libraries, loaded from the jsDelivr CDN at fixed versions.
// Only the program code is downloaded; no customer data is ever sent anywhere.
export { PDFDocument, StandardFonts, PDFName, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build';
let pdfjsP = null;
export function pdfjs() {
  pdfjsP ??= import(`${PDFJS}/pdf.min.mjs`).then(lib => { lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`; return lib; });
  return pdfjsP;
}

// Offline-style OCR: the model is downloaded once, then the screenshot is read inside the browser.
let tessP = null;
export function tesseract() {
  tessP ??= new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => bad(new Error('Could not load the screenshot reader. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return tessP;
}
export const TESS_LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
