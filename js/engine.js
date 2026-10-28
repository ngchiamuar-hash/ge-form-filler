// Lists the forms in the folder you picked, fills one, and returns the PDF bytes plus any issues.
// Forms mapped by hand (forms/*.js) are filled completely; every other form gets the basic fill (generic.js).
import { PDFDocument, StandardFonts } from './vendor.js';
import { Issues } from './issues.js';
import { makeOverlay } from './overlay.js';
import { basicFill } from './generic.js';
import nomination from './forms/nomination.js';
import amendment from './forms/amendment.js';
import gastric from './forms/gastric.js';

const FORMS = [nomination, amendment, gastric];

// files: [{ path: 'New Business/Other Forms/x.pdf', file: File }] — paths relative to the EPARNER FORM folder
function listForms(files) {
  return files.filter(f => /\.pdf$/i.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map(f => {
    const parts = f.path.split('/');
    const base = parts.at(-1).replace(/\.pdf$/i, '');
    const cut = base.lastIndexOf(' - ');
    const mapped = FORMS.find(m => m.file === f.path);
    return {
      id: mapped ? mapped.id : 'f:' + f.path,
      category: parts.length > 1 ? parts[0] : 'Other',
      group: parts.length > 2 ? parts.slice(1, -1).join(' / ') : '',
      title: cut > 0 ? base.slice(0, cut) : base,
      code: cut > 0 ? base.slice(cut + 3) : '',
      file: f.path,
      full: !!mapped,
    };
  });
}

function getForm(list, id) {
  const mapped = FORMS.find(f => f.id === id);
  if (mapped) return mapped;
  const info = list.find(f => f.id === id);
  return info ? { id, title: info.title, code: info.code, file: info.file, kind: 'basic', fill: basicFill } : null;
}

async function fillForm(files, form, data) {
  const issues = new Issues(form.title);
  const src = files.find(f => f.path === form.file);
  if (!src) {
    issues.error('Blank form', `Blank form not found in your forms folder: "${form.file}".`);
    return { bytes: null, issues: issues.list };
  }
  const bytes = new Uint8Array(await src.file.arrayBuffer());
  let pdf;
  try { pdf = await PDFDocument.load(bytes); }
  catch (e) { issues.error('Blank form', `This PDF cannot be opened for filling (${e.message}).`); return { bytes: null, issues: issues.list }; }
  const fonts = { reg: await pdf.embedFont(StandardFonts.Helvetica), zapf: await pdf.embedFont(StandardFonts.ZapfDingbats) };
  try {
    await form.fill({ pdf, o: makeOverlay(pdf, fonts), fonts, data, issues, bytes });
  } catch (e) {
    issues.error('Engine', `Unexpected problem while filling: ${e.message}. Nothing saved for this form.`);
    return { bytes: null, issues: issues.list };
  }
  pdf.setTitle(`${form.title} (draft)`);
  return { bytes: await pdf.save(), issues: issues.list };
}

export { FORMS, listForms, getForm, fillForm };
