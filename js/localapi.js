// Everything the desktop app's server did, done inside the browser instead.
// Settings and the run log are kept in this browser (localStorage); customer details are never stored or sent anywhere.
import { listForms, getForm, fillForm } from './engine.js';
import { readScreenshot } from './screenshot.js';
import { mask, isBlank } from './util.js';

const SETTINGS_KEY = 'geff.settings', LOG_KEY = 'geff.log';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: settings just won't be remembered */ } };

let files = [];          // [{ path, file }] from the forms folder you picked
const runs = new Map();  // drafts of this session: runId -> run (with PDF blob URLs)

export function setFiles(list) { files = list; }
export function formCount() { return listForms(files).length; }

const stamp = () => { const t = new Date(); const p = n => String(n).padStart(2, '0'); return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`; };
const safeId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
function log(row) {
  const all = read(LOG_KEY, []);
  all.push({ time: new Date().toLocaleString('en-MY'), ...row });
  write(LOG_KEY, all.slice(-500));
}

const routes = {
  'GET /api/settings': () => ({ agent: {}, ...read(SETTINGS_KEY, {}) }),
  'POST /api/settings': body => { const s = { ...routes['GET /api/settings'](), ...body }; write(SETTINGS_KEY, s); return s; },
  'GET /api/forms': () => listForms(files),
  'GET /api/log': () => read(LOG_KEY, []).slice().reverse(),

  'POST /api/read-screenshot': async body => {
    const blob = await (await fetch(body.image)).blob();
    return readScreenshot(blob);
  },

  'POST /api/generate': async ({ formId, client, proposer = null, witness = null, caseData = {} }) => {
    const form = getForm(listForms(files), formId);
    if (!form) throw new Error('Please choose a form.');
    if (!client || isBlank(client.fullName)) throw new Error('Customer name is missing — upload the ePartner screenshot or type the name.');
    const me = routes['GET /api/settings']().agent || {};
    // Witness = name + agent ID typed on the page. If it is you, your NRIC/address from Settings are used too.
    const isMe = !witness || isBlank(witness.name) || witness.name.trim().toUpperCase() === String(me.name || '').trim().toUpperCase();
    const agent = isMe ? { ...me, ...(witness && !isBlank(witness.iac) ? { iac: witness.iac } : {}) } : { name: witness.name, iac: witness.iac, other: true };
    const data = { policy: caseData.policy || {}, la: client, proposer: proposer && !isBlank(proposer.fullName) ? proposer : null, agent, case: caseData };
    const { bytes, issues } = await fillForm(files, form, data);
    const runId = `${stamp()}_${safeId(client.fullName).slice(0, 20)}`;
    const file = `${safeId(form.code || form.title).toUpperCase().slice(0, 40)}_${safeId(client.fullName).toUpperCase()}.pdf`;
    const url = bytes ? URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) : null;
    const run = { runId, client: mask(client.fullName, client.idNo), results: [{ id: form.id, title: form.title, file: bytes ? file : null, url, issues }], status: 'DRAFT', code: form.code || form.title };
    runs.set(runId, run);
    log({ runId, client: run.client, forms: run.code, errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warn').length, status: 'DRAFT', note: 'Draft created, waiting for review' });
    return run;
  },

  // Approval: only now is the PDF saved — as a download
  'POST /api/approve': ({ runId, acceptErrors, note }) => {
    const run = runs.get(runId);
    if (!run) throw new Error('Draft not found. Please fill the form again.');
    if (run.status !== 'DRAFT') throw new Error(`This draft is already ${run.status}.`);
    const errors = run.results.flatMap(r => r.issues).filter(i => i.level === 'error').length;
    if (errors && !acceptErrors) throw new Error(`${errors} field(s) were left blank. Tick "I will complete the blank fields by hand" to approve anyway.`);
    for (const r of run.results) if (r.url) Object.assign(document.createElement('a'), { href: r.url, download: r.file }).click();
    run.status = 'APPROVED';
    log({ runId, client: run.client, forms: run.code, errors, warnings: run.results.flatMap(r => r.issues).filter(i => i.level === 'warn').length,
      status: 'APPROVED', note: (errors ? 'Approved with blank fields to complete by hand. ' : '') + (note || '') });
    return { ok: true, folder: 'your Downloads folder', file: run.results[0]?.file };
  },
  'POST /api/reject': ({ runId, note }) => {
    const run = runs.get(runId);
    if (run) { run.status = 'REJECTED'; run.results.forEach(r => r.url && URL.revokeObjectURL(r.url)); }
    log({ runId, client: run?.client || '', forms: run?.code || '', errors: '', warnings: '', status: 'REJECTED', note: note || 'Sent back for correction' });
    return { ok: true };
  },
};

// Same call shape the page already uses: api(url) for reads, api(url, body) for actions
export async function api(url, body) {
  const route = routes[`${body ? 'POST' : 'GET'} ${url.split('?')[0]}`];
  if (!route) throw new Error(`Unknown action ${url}`);
  return route(body);
}

export function logCsv() {
  const rows = read(LOG_KEY, []);
  const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return ['Time,Run ID,Client,Forms,Errors,Warnings,Status,Note', ...rows.map(r => [r.time, r.runId, r.client, r.forms, r.errors, r.warnings, r.status, r.note].map(csv).join(','))].join('\n');
}
