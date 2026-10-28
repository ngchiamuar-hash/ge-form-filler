// GE Form Filler — web version. Runs entirely in the browser: forms, screenshots and customer details stay on this computer.
// Flow: pick forms folder → choose a form → upload customer info (blank every time) → answer only that form's questions → fill → review → approve (download).
import { api, setFiles, logCsv } from './localapi.js';
import { pickFolder, reopen, savedHandle, fromInput, canRemember } from './folder.js';
const $ = s => document.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── Read/write values by dotted key (data-k="a.b.c") ──
const getPath = (o, k) => k.split('.').reduce((v, p) => v?.[p], o);
const setPath = (o, k, v) => { const ps = k.split('.'); let t = o; ps.slice(0, -1).forEach(p => { t = t[p] ??= {}; }); t[ps.at(-1)] = v; };
function collect(root, attr = 'k', skip = '.person') {
  const out = {};
  $$(`[data-${attr}]`, root).forEach(el => {
    if (skip && el.closest(skip) && el.closest(skip) !== root && root.contains(el.closest(skip))) return; // people are collected separately
    const k = el.dataset[attr];
    if (el.type === 'checkbox') setPath(out, k, el.checked);
    else if (el.type === 'radio') { if (el.checked) setPath(out, k, el.value); else if (getPath(out, k) === undefined) setPath(out, k, ''); }
    else setPath(out, k, el.value.trim());
  });
  return out;
}
function setEl(el, v) {
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.type === 'radio') el.checked = v === el.value;
  else el.value = v ?? '';
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function fillIn(root, obj, attr = 'k') { $$(`[data-${attr}]`, root).forEach(el => setEl(el, getPath(obj || {}, el.dataset[attr]))); }
// Only set keys present in obj and mark them yellow ("from upload — please check")
function applyRead(root, obj) {
  let n = 0;
  $$('[data-k]', root).forEach(el => {
    const v = getPath(obj, el.dataset.k);
    if (v === undefined || v === '') return;
    setEl(el, v);
    (el.closest('.chips') || el).classList.add('auto');
    if (el.type !== 'radio' || el.checked) n++;
  });
  return n;
}
document.addEventListener('input', e => e.target.classList.remove('auto'));
document.addEventListener('change', e => { if (e.isTrusted) (e.target.closest('.chips') || e.target).classList.remove('auto'); });

// ── Tick buttons (radio). Click a ticked one again to untick it. ──
let uid = 0;
function chips(label, k, options) {
  const name = 'c' + (++uid);
  return `<div class="field">${label ? `<span class="flabel">${label}</span>` : ''}<div class="chips">${options.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<label class="chip-opt"><input type="radio" name="${name}" data-k="${k}" value="${esc(v)}"><span>${esc(t)}</span></label>`;
  }).join('')}</div></div>`;
}
document.addEventListener('pointerdown', e => { const r = e.target.closest('.chip-opt')?.querySelector('input'); if (r) r.dataset.was = r.checked ? '1' : ''; });
document.addEventListener('click', e => {
  const r = e.target.closest('.chip-opt')?.querySelector('input');
  if (r && e.target === r && r.dataset.was === '1') { r.checked = false; r.dataset.was = ''; r.dispatchEvent(new Event('change', { bubbles: true })); }
});

// ── Person fields: each form asks only for what it needs ──
const inp = (label, k, extra = '', cls = '') => `<label class="${cls}">${label}<input data-k="${k}" ${extra}></label>`;
const ADDRESS = `<div class="addr"><div class="grid3">
  ${inp('Address line 1', 'address.line1')}${inp('Address line 2', 'address.line2')}${inp('Address line 3', 'address.line3')}
  ${inp('Postcode', 'address.postcode', 'maxlength="5" inputmode="numeric"')}${inp('Town', 'address.town')}${inp('Country', 'address.country', 'placeholder="Malaysia"')}</div></div>`;
const FIELD = {
  fullName: () => inp('Full name (as per NRIC)', 'fullName'),
  idNo: () => inp('NRIC / Passport No.', 'idNo', 'placeholder="e.g. 880412-10-5528"'),
  dob: () => inp('Date of birth', 'dob', 'type="date"'),
  passportExpiry: () => inp('Passport expiry', 'passportExpiry', 'type="date"', 'ponly'),
  oldIc: () => inp('Old IC (if any)', 'oldIc'),
  nationality: () => inp('Nationality', 'nationality', 'placeholder="Malaysian"'),
  countryOfBirth: () => inp('Country of birth', 'countryOfBirth', 'placeholder="Malaysia"'),
  phone: () => inp('Phone', 'phone'),
  share: () => inp('% of share', 'share', 'inputmode="decimal"'),
  relationshipOther: () => inp('State relationship', 'relationshipOther', '', 'othersonly'),
  idType: () => chips('ID type', 'idType', ['NRIC', 'Passport']),
  gender: () => chips('Gender', 'gender', [['M', 'Male'], ['F', 'Female']]),
  muslim: () => chips('Muslim?', 'muslim', ['No', 'Yes']),
  maritalStatus: () => chips('Marital status', 'maritalStatus', ['Married', 'Single', 'Divorced', 'Widowed']),
  children: () => chips('No. of children', 'children', ['0', '1', '2', '3', '4', '5', '6']),
  phoneType: () => chips('Phone type', 'phoneType', ['Handphone', 'House', 'Office']),
  relationship: () => chips('Relationship', 'relationship', ['Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Others']),
  addressSameAsOwner: () => `<label class="check"><input type="checkbox" data-k="addressSameAsOwner"> Same address as policyowner</label>`,
  address: () => ADDRESS,
};
const CHIP_KEYS = ['idType', 'gender', 'muslim', 'maritalStatus', 'children', 'phoneType', 'relationship'];
function personFields(keys) {
  const text = keys.filter(k => !CHIP_KEYS.includes(k) && !['address', 'addressSameAsOwner'].includes(k));
  const ticks = keys.filter(k => CHIP_KEYS.includes(k));
  return `<div class="grid3">${text.map(k => FIELD[k]()).join('')}</div>
    <div class="chiprow">${ticks.map(k => FIELD[k]()).join('')}</div>
    ${keys.includes('addressSameAsOwner') ? FIELD.addressSameAsOwner() : ''}${keys.includes('address') ? ADDRESS : ''}`;
}
// Show passport expiry only for passports, "state relationship" only for Others, address only when not "same as owner"
function refreshVisibility(root) {
  $$('.ponly', root).forEach(el => { const box = el.closest('.person, #clientFields, #proposerBox') || root; el.classList.toggle('hidden', box.querySelector('[data-k="idType"]:checked')?.value !== 'Passport'); });
  $$('.othersonly', root).forEach(el => el.classList.toggle('hidden', el.closest('.person').querySelector('[data-k="relationship"]:checked')?.value !== 'Others'));
  $$('[data-k="addressSameAsOwner"]', root).forEach(cb => cb.closest('.person').querySelector('.addr')?.classList.toggle('hidden', cb.checked));
}
document.addEventListener('change', () => refreshVisibility(document));

// What each form needs from the customer (and from a different policyowner, if any)
const NEEDS = {
  nomination: { client: ['fullName', 'idNo', 'passportExpiry', 'idType', 'muslim', 'maritalStatus', 'children', 'address'], owner: true },
  amendment: { client: ['fullName'], owner: true, ownerFields: ['fullName'] },
  gastric: { client: ['fullName', 'idNo', 'passportExpiry', 'oldIc', 'idType'], owner: false },
  basic: { client: ['fullName', 'idNo', 'idType'], owner: true, ownerFields: ['fullName'] }, // any form not set up by hand
};
const NEED_NAMES = { fullName: 'Name', idNo: 'NRIC/Passport', muslim: 'Muslim?', maritalStatus: 'Marital status', children: 'No. of children', address: 'Address' };
const NOMINEE = ['fullName', 'idNo', 'dob', 'passportExpiry', 'nationality', 'share', 'relationshipOther', 'idType', 'gender', 'relationship', 'addressSameAsOwner', 'address'];
const TRUSTEE = ['fullName', 'idNo', 'dob', 'passportExpiry', 'nationality', 'countryOfBirth', 'phone', 'idType', 'gender', 'phoneType', 'addressSameAsOwner', 'address'];
const NEW_PERSON = { idType: 'NRIC', nationality: 'Malaysian', countryOfBirth: 'Malaysia', address: { country: 'Malaysia' } };

// ── Upload: screenshot or photo → offline reader ──
function fileToDataUrl(file) { return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(file); }); }
async function readImage(file) { return api('/api/read-screenshot', { image: await fileToDataUrl(file) }); }
let activeZone = null;
function makeDrop(zone, onRead) {
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/bmp', multiple: true, hidden: true });
  zone.after(picker);
  zone.insertAdjacentHTML('beforeend', '<span class="upbtn">📤 Upload screenshot / photo</span>');
  const label = zone.querySelector('b').textContent;
  const handle = async files => {
    for (const file of [...files].filter(f => f.type.startsWith('image/'))) {
      zone.classList.add('busy'); zone.querySelector('b').textContent = 'Reading…';
      try { onRead(await readImage(file)); } catch (e) { onRead({ error: e.message }); }
    }
    zone.classList.remove('busy'); zone.querySelector('b').textContent = label;
  };
  zone.addEventListener('focus', () => { activeZone = zone; });
  zone.addEventListener('click', () => picker.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter') picker.click(); });
  picker.onchange = () => { handle(picker.files); picker.value = ''; };
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('active'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('active'); handle(e.dataTransfer.files); });
  zone._handle = handle;
}
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile());
  if (!files.length || $('#afterForm').classList.contains('hidden')) return;
  e.preventDefault();
  const zone = document.activeElement?.classList.contains('drop') ? document.activeElement : (activeZone?.isConnected ? activeZone : $('#clientDrop'));
  zone._handle(files);
});
function showRead(box, r, filled, append) {
  const html = r.error ? `<p class="bad">${esc(r.error)}</p>` :
    `<p class="${filled ? 'ok' : 'bad'}">${filled ? `Read ${filled} detail(s). <span class="autokey">Yellow</span> = from upload, please check.` : 'No details recognised in this image. Try a clearer or larger screenshot.'}</p>
    ${r.missing?.length ? `<p class="hint">Not in this image: ${r.missing.map(esc).join(', ')}.</p>` : ''}
    ${(r.notes || []).map(n => `<p class="hint">⚠ ${esc(n)}</p>`).join('')}
    <details><summary>Show what was read (quality ${r.confidence}%)</summary><pre>${esc(r.text)}</pre></details>`;
  box.innerHTML = append ? box.innerHTML + html : html;
}
// "Photo" button next to a free-text box: put the text read from a photo into the box
function photoToText(btn) {
  const target = btn.closest('label').querySelector('textarea');
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  picker.onchange = async () => {
    btn.textContent = 'Reading…';
    try {
      const r = await readImage(picker.files[0]);
      const t = r.text.replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
      target.value = [target.value, t].filter(Boolean).join('\n');
      target.classList.add('auto');
    } catch (e) { alert(e.message); }
    btn.textContent = '📷 From photo';
  };
  picker.click();
}
document.addEventListener('click', e => { const b = e.target.closest('.photobtn'); if (b) { e.preventDefault(); photoToText(b); } });
const textBox = (label, k, rows = 2) => `<label>${label} <button class="link photobtn">📷 From photo</button><textarea data-k="${k}" rows="${rows}"></textarea></label>`;

// ── Tabs ──
$$('.tab').forEach(b => b.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === b));
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') loadLog();
  if (b.dataset.tab === 'settings') loadSettings();
});

// ── Step 1: choose form ──
let formId = '', formInfo = null, lastRead = null, allForms = [];
const needs = () => NEEDS[formId] || NEEDS.basic;
async function loadForms() {
  allForms = await api('/api/forms');
  const cats = [...new Set(allForms.map(f => f.category))];
  const keep = $('#categorySelect').value;
  $('#categorySelect').innerHTML = '<option value="">— Choose a category —</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)} (${allForms.filter(f => f.category === c).length})</option>`).join('');
  if (keep) { $('#categorySelect').value = keep; fillFormList(); }
}
// Forms of the chosen category, grouped by sub-folder; fully set-up forms marked ★
function fillFormList() {
  const cat = $('#categorySelect').value;
  const list = allForms.filter(f => f.category === cat);
  const groups = [...new Set(list.map(f => f.group))];
  const opt = f => `<option value="${esc(f.id)}">${f.full ? '★ ' : ''}${esc(f.title)}${f.code ? ' — ' + esc(f.code) : ''}</option>`;
  $('#formSelect').disabled = !cat;
  $('#formSelect').innerHTML = `<option value="">${cat ? '— Choose a form —' : '— Choose a category first —'}</option>` +
    groups.map(g => g ? `<optgroup label="${esc(g)}">${list.filter(f => f.group === g).map(opt).join('')}</optgroup>` : list.filter(f => !f.group).map(opt).join('')).join('');
  if (list.some(f => f.id === formId)) $('#formSelect').value = formId;
}
$('#categorySelect').onchange = () => { fillFormList(); $('#formSelect').dispatchEvent(new Event('change')); };
$('#formSelect').onchange = e => {
  formInfo = allForms.find(f => f.id === e.target.value) || null;
  const keep = formId ? collect($('#clientFields')) : NEW_PERSON;
  formId = e.target.value;
  $('#afterForm').classList.toggle('hidden', !formId);
  if (!formId) return;
  $('#clientFields').innerHTML = personFields(needs().client);
  fillIn($('#clientFields'), keep);
  if (lastRead) applyRead($('#clientFields'), lastRead.person);
  $('#ownerBox').classList.toggle('hidden', !needs().owner);
  buildProposer();
  buildFormSection();
  buildWitness();
  $('#review').classList.add('hidden'); $('#genMsg').textContent = '';
  $('#clientRead').innerHTML = '';
  refreshVisibility(document);
};

// ── Step 2: customer (blank each time) ──
makeDrop($('#clientDrop'), r => {
  if (r.error) return showRead($('#clientRead'), r, 0, true);
  const digitsOf = s => String(s || '').replace(/\D/g, '');
  const had = digitsOf($('#clientFields [data-k="idNo"]')?.value || lastRead?.person?.idNo), got = digitsOf(r.person?.idNo);
  if (had && got && had !== got)
    return showRead($('#clientRead'), { error: 'This upload shows a different NRIC from the customer above, so nothing was changed. Click "Start new customer" first if this is a new customer.' }, 0, true);
  lastRead = { person: { ...(lastRead?.person || {}), ...r.person }, current: { ...(lastRead?.current || {}), ...r.current } };
  let n = applyRead($('#clientFields'), r.person);
  for (const k of ['proposalNo', 'policyNo']) if (r.policy?.[k] && !$('#' + k).value) { setEl($('#' + k), r.policy[k]); $('#' + k).classList.add('auto'); n++; }
  if (r.proposer && needs().owner) {
    $('#diffOwner').checked = true; $('#diffOwner').dispatchEvent(new Event('change'));
    applyRead($('#proposerBox'), r.proposer);
  }
  // Only report what this form still needs
  const c = collect($('#clientFields'), 'k', null), need = needs().client;
  r.missing = Object.entries(NEED_NAMES).filter(([k]) => need.includes(k) && !(k === 'address' ? c.address?.line1 : c[k])).map(([, v]) => v);
  showRead($('#clientRead'), r, n, true);
  prefillAuto();
  showCurrent();
});
$('#newCustomer').onclick = () => {
  lastRead = null;
  $('#clientRead').innerHTML = '';
  fillIn($('#clientFields'), NEW_PERSON);
  for (const k of ['proposalNo', 'policyNo', 'signDate']) $('#' + k).value = '';
  $('#diffOwner').checked = false; buildProposer();
  buildFormSection();
  buildWitness();
  $('#review').classList.add('hidden'); $('#genMsg').textContent = '';
  $$('.auto').forEach(el => el.classList.remove('auto'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('#today').onclick = e => { e.preventDefault(); const t = new Date(); $('#signDate').value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function buildProposer() {
  const keys = needs().ownerFields || needs().client;
  $('#proposerBox').innerHTML = `<div class="drop small" tabindex="0"><b>Upload policyowner info</b><span>(optional)</span></div><div class="readout"></div>${personFields(keys)}`;
  fillIn($('#proposerBox'), NEW_PERSON);
  makeDrop($('#proposerBox .drop'), r => showRead($('#proposerBox .readout'), r, r.error ? 0 : applyRead($('#proposerBox'), r.person)));
  $('#proposerBox').classList.toggle('hidden', !$('#diffOwner').checked);
}
$('#diffOwner').onchange = e => $('#proposerBox').classList.toggle('hidden', !e.target.checked);

// ── Step 3: only the chosen form's questions ──
function buildFormSection() {
  const sec = $('#formSection');
  if (formId === 'nomination') {
    sec.innerHTML = `<h2><span class="step">3</span> Nominees</h2>
      <div id="nominees"></div>
      <div class="actions"><button class="secondary" id="addNominee">+ Add nominee</button><button class="secondary" id="splitShares">Split shares equally</button></div>
      <div class="flabel">Part 2 — Trustee</div>
      <div class="column" id="trusteeOption">${chips('', 'nomination.trusteeOption', [['', 'No trustee (skip Part 2)'], ['1', 'Appoint the following person(s) to be trustee(s)'],
        ['2', 'Appoint trustee(s) in addition to existing trustee(s)'], ['3', 'Revoke existing trustee(s) and appoint the following'], ['4', 'Revoke all existing trustee(s)']])}</div>
      <div id="trustees"></div><button class="secondary hidden" id="addTrustee">+ Add trustee</button>`;
    $('#addNominee').onclick = () => addPerson('#nominees', 'nominee');
    $('#addTrustee').onclick = () => addPerson('#trustees', 'trustee');
    $('#splitShares').onclick = () => {
      const boxes = $$('#nominees [data-k="share"]'); if (!boxes.length) return;
      const each = Math.floor(10000 / boxes.length) / 100;
      boxes.forEach((b, i) => { b.value = i === boxes.length - 1 ? +(100 - each * (boxes.length - 1)).toFixed(2) : each; });
    };
    $('#trusteeOption').addEventListener('change', () => {
      const show = ['1', '2', '3'].includes($('#trusteeOption input:checked')?.value);
      $('#addTrustee').classList.toggle('hidden', !show); $('#trustees').classList.toggle('hidden', !show);
      if (show && !$('#trustees').children.length) addPerson('#trustees', 'trustee');
    });
    addPerson('#nominees', 'nominee');
  } else if (formId === 'amendment') {
    sec.innerHTML = `<h2><span class="step">3</span> What is changing? <small>Tick only what changes</small></h2>
      <p class="hint" id="currentHint"></p>
      ${chips('Change mode of payment to', 'amendment.mode', ['Yearly', 'Half-Yearly', 'Quarterly', 'Monthly'])}
      ${chips('Change method of payment to', 'amendment.method', ['Credit Card', 'GIRO', "Banker's Order", 'Cheque', 'Cash'])}
      <div class="grid3">
        <label>Change premium to (RM)<input data-k="amendment.premium" inputmode="decimal" placeholder="blank = no change"></label>
        <label>Change commencement date to<input type="date" data-k="amendment.commencementDate"></label>
      </div>
      <label class="check"><input type="checkbox" data-k="amendment.addressChange" id="addrChange"> Change address</label>
      <div id="addrBox" class="hidden indent">
        ${chips('Address type', 'amendment.addressType', ['Residential', 'Mailing'])}
        <div class="drop small" tabindex="0"><b>Upload photo of new address</b><span>(optional)</span></div><div class="readout"></div>
        <div data-scope="amendment">${ADDRESS}</div>
      </div>
      ${textBox('Other changes', 'amendment.otherChanges')}`;
    $('#addrChange').addEventListener('change', e => $('#addrBox').classList.toggle('hidden', !e.target.checked));
    makeDrop($('#addrBox .drop'), r => showRead($('#addrBox .readout'), r, r.error ? 0 : applyRead($('#addrBox [data-scope]'), { address: r.person.address })));
    showCurrent();
  } else if (formId === 'gastric') {
    const yn = (k, label) => `<div class="yn"><span>${label}</span>${chips('', 'gastric.' + k, ['Yes', 'No'])}</div>`;
    const table = (k, cols) => `<table class="mini"><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>${[0, 1, 2].map(i =>
      `<tr>${cols.map(c => `<td><input data-k="gastric.${k}.${i}.${c[0]}" ${c[0] === 'date' ? 'type="date"' : ''}></td>`).join('')}</tr>`).join('')}</table>`;
    const only = (q, html) => `<div class="ifyes" data-q="${q}">${html}</div>`;
    sec.innerHTML = `<h2><span class="step">3</span> Gastric questionnaire</h2>
      <p class="hint warnline">Answers must come from the client. Leave blank for the client to fill in, or tick what the client told you. They must confirm before signing.</p>
      ${chips('1. Nature of condition', 'gastric.q1pick', ['Gastritis', 'Peptic Ulcer', 'Gastric Ulcer', 'Duodenal Ulcer', 'Gastroesophageal Reflux Disease', 'Reflux Oesophagitis'])}
      ${textBox('Other condition / details', 'gastric.q1')}
      <div class="grid3">${inp('2. First experienced symptoms', 'gastric.q2', 'type="date"')}${inp('3. Last attack', 'gastric.q3', 'type="date"')}</div>
      ${chips('4. Attacks per year', 'gastric.q4', ['1', '2', '3', '4', '5', '6', '8', '10', '12'])}
      <button class="secondary" id="allNo">Tick "No" for Q5–Q12</button>
      ${yn('q5a', '5(a) Vomiting of blood')}${yn('q5b', '5(b) Passing out blood in stool')}
      ${yn('q6', '6. Sought medical advice?')}${only('q6', table('q6rows', [['name', 'Doctor / hospital / clinic'], ['date', 'Date of consultation'], ['treatment', 'Treatment prescribed']]))}
      ${yn('q7', '7. Any tests or investigations?')}${only('q7', textBox('Test, result', 'gastric.q7d'))}
      ${yn('q8', '8. Ever hospitalised for this?')}${only('q8', table('q8rows', [['name', 'Doctor / hospital / clinic'], ['date', 'Date of admission'], ['duration', 'Duration'], ['treatment', 'Treatment']]))}
      ${yn('q9', '9. Further treatment discussed?')}${only('q9', textBox('Details', 'gastric.q9d'))}
      ${yn('q10', '10. Currently on treatment / medication?')}${only('q10', textBox('Details', 'gastric.q10d'))}
      ${yn('q11', '11. Operation done or advised?')}${only('q11', textBox('Nature of surgery', 'gastric.q11d'))}
      ${yn('q12', '12. Other underlying disease?')}${only('q12', textBox('Diagnosis, treatment', 'gastric.q12d'))}`;
    // Detail boxes appear only when the answer is "Yes"
    const sync = () => $$('.ifyes', sec).forEach(d => d.classList.toggle('hidden', $(`#formSection [data-k="gastric.${d.dataset.q}"]:checked`)?.value !== 'Yes'));
    sec.addEventListener('change', sync); sync();
    $('#allNo').onclick = e => { e.preventDefault(); $$('.yn input[value="No"]', sec).forEach(r => { r.checked = true; }); sync(); };
  } else {
    // Any other form: the questions are found on the form automatically
    sec.innerHTML = `<h2><span class="step">3</span> ${esc(formInfo?.title || 'Form')}</h2>
      <p class="hint" id="autoNote">Reading the form to find its questions…</p>
      <div id="autoFields"></div>`;
    buildAutoFields();
  }
  // Two ways to give the answers: fill in here, or upload a screenshot/photo and check what was read
  const tip = { nomination: 'e.g. the ePartner nominee page — all nominees are filled at once',
    amendment: 'e.g. the customer\'s change request — the NEW payment mode, method, premium or address',
    gastric: 'e.g. the doctor\'s letter or medical report — the condition is picked up; tick Yes/No yourself' }[formId]
    || 'e.g. the customer\'s answers or an ePartner page — answers are matched to the questions by their wording';
  sec.querySelector('h2').insertAdjacentHTML('afterend', `<div class="modepick">${chips('How do you want to give the answers?', '_mode', [['fill', '✍ Fill in here'], ['upload', '📷 Upload screenshot']])}</div>
    <div class="drop hidden" id="sectionDrop" tabindex="0"><b>Upload screenshot for this form</b><span>${esc(tip)}</span></div>
    <div class="readout" id="sectionRead"></div>`);
  const modes = $$('.modepick input', sec);
  modes[0].checked = true;
  $('.modepick', sec).addEventListener('change', () => {
    if (!modes.some(m => m.checked)) modes[0].checked = true;
    $('#sectionDrop').classList.toggle('hidden', !modes[1].checked);
  });
  makeDrop($('#sectionDrop'), sectionRead);
  refreshVisibility(sec);
}
// Put what was read from a form-content upload into this form's questions (yellow = please check)
function sectionRead(r) {
  const box = $('#sectionRead');
  if (r.error) return showRead(box, r, 0, true);
  let n = 0;
  const notes = [];
  if (formId === 'nomination') {
    const people = r.people?.length ? r.people : (r.person?.fullName ? [r.person] : []);
    for (const p of people) {
      let card = $$('#nominees .person').find(c => !c.querySelector('[data-k="fullName"]').value);
      if (!card) { if ($$('#nominees .person').length >= 4) { notes.push('Only 4 nominees fit on the form — the rest were not added.'); break; } addPerson('#nominees', 'nominee'); card = $$('#nominees .person').at(-1); }
      n += applyRead(card, p);
    }
    if (people.length) notes.push(`${people.length} nominee(s) added from the upload.`);
  } else if (formId === 'amendment') {
    const c = r.current || {};
    const change = { mode: c.mode, method: c.method, premium: c.premium?.replace(/,/g, '') };
    n += applyRead($('#formSection'), { amendment: change });
    if (r.person?.address?.line1) {
      if (!$('#addrChange').checked) $('#addrChange').click();
      n += applyRead($('#addrBox [data-scope]'), { address: r.person.address });
    }
    const cur = lastRead?.current || {};
    if (n && ['mode', 'method'].some(k => c[k] && c[k] === cur[k])) notes.push('Some values match the customer\'s CURRENT policy. Untick anything that is not actually changing.');
    else if (n) notes.push('Check these are the NEW values the customer wants.');
  } else if (formId === 'gastric') {
    if (r.conditions?.length) {
      n += applyRead($('#formSection'), { gastric: { q1pick: r.conditions[0] } });
      if (r.conditions.length > 1) n += applyRead($('#formSection'), { gastric: { q1: r.conditions.slice(1).join(', ') } });
    }
    notes.push('Yes/No answers are not ticked from a photo — please tick them with the client.');
  } else if (!NEEDS[formId]) {
    n = matchAnswers(r.text || '');
    notes.push('Answers were matched by the question wording — please check each yellow one.');
  }
  showRead(box, { ...r, missing: [], notes }, n, true);
}

// ── Forms not set up by hand: questions found on the form ──
let autoItems = [];
async function buildAutoFields() {
  const myForm = formId, box = $('#autoFields');
  try {
    const { items } = await api('/api/form-fields', { formId });
    if (formId !== myForm) return;
    autoItems = items;
    const pages = [...new Set(items.map(i => i.page))];
    const count = items.reduce((n, i) => n + (i.type === 'ticks' ? i.items.length : 1), 0);
    const itemHtml = i => i.type === 'ticks'
      ? `<div class="field"><span class="flabel">${esc(i.heading || 'Tick where it applies')}</span><div class="chips">${i.items.map(t =>
          `<label class="chip-opt"><input type="checkbox" data-q="${t.id}"><span>${esc(t.label)}</span></label>`).join('')}</div></div>`
      : `<label>${esc(i.label)}${i.type === 'cells' ? ` <small>(${i.cells.length} boxes)</small>` : ''}<input data-q="${i.id}"></label>`;
    box.innerHTML = pages.map((p, k) => {
      const list = items.filter(i => i.page === p);
      return `<details class="qpage" ${k < 2 || count <= 60 ? 'open' : ''}><summary>Page ${p + 1} <small>(${list.length} item${list.length > 1 ? 's' : ''})</small></summary>${list.map(itemHtml).join('')}</details>`;
    }).join('') || '<p class="hint">No answer boxes were found on this form.</p>';
    $('#autoNote').textContent = count
      ? `Found ${count} questions and answer spaces on this form. Tick or type only what applies, or upload a screenshot of the answers. Blank ones stay blank.`
      : 'This form has no answer spaces the app can recognise.';
    prefillAuto();
  } catch (e) { if (formId === myForm) $('#autoNote').textContent = 'Could not read this form: ' + e.message; }
}
// Put the customer's details into matching questions (only empty ones; yellow = please check)
function prefillAuto() {
  if (NEEDS[formId] || !autoItems.length) return;
  const c = collect($('#clientFields'), 'k', null);
  const d = c.dob ? c.dob.split('-').reverse().join('/') : '';
  const rules = [
    [/proposal\s*no/i, $('#proposalNo').value, true], [/policy\s*no/i, $('#policyNo').value, true],
    [/^(\W*\d*\)?\s*)?(full\s*name|name\s+of\s+(the\s+)?(life\s+(to\s+be\s+)?assured|policy\s*owner|proposer|insured|assured|claimant|customer)|name\s+as\s+per)/i, (c.fullName || '').toUpperCase(), false],
    [/^(?!.*\bold\b)(?!.*policy).*\b(nric|i\/c|ic\s*no|mykad)\b/i, String(c.idNo || '').replace(/\D/g, '').length === 12 ? String(c.idNo).replace(/\D/g, '') : c.idNo, false],
    [/date of birth|\bdob\b/i, d, false],
    [/^date\b(?!.*(birth|admi|disch|surgery|join|incid|death))/i, $('#signDate').value ? $('#signDate').value.split('-').reverse().join('/') : '', true],
  ];
  // name, NRIC and date of birth go only in the first matching place (later ones belong to other people)
  const used = new Set($$('#autoFields [data-rule]').map(el => el.dataset.rule));
  for (const i of autoItems) {
    if (i.type === 'ticks') continue;
    const input = $(`#autoFields [data-q="${i.id}"]`);
    if (!input || input.value) continue;
    // header items (policy no., date) once per page; personal details once per form
    const key = (k, every) => every ? k + '|' + i.page : String(k);
    const r = rules.findIndex(([re, v, every], k) => v && re.test(i.label) && !used.has(key(k, every)));
    if (r < 0) continue;
    input.value = rules[r][1]; input.classList.add('auto'); input.dataset.rule = key(r, rules[r][2]); used.add(key(r, rules[r][2]));
  }
}
// Match an uploaded screenshot's text to the questions: "Question label: answer" → answer; option text present → tick
function matchAnswers(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const norm = s => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  const loose = s => new RegExp(norm(s).split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9%]+'), 'i');
  let n = 0;
  for (const i of autoItems) {
    if (i.type === 'ticks') {
      for (const t of i.items) {
        const key = norm(t.label).split(' ').slice(0, 5).join(' ');
        if (key.length < 4 || !lines.some(l => norm(l).includes(key))) continue;
        const cb = $(`#autoFields [data-q="${t.id}"]`);
        if (cb && !cb.checked) { cb.checked = true; cb.closest('.chips').classList.add('auto'); n++; }
      }
      continue;
    }
    const [rawKey, col] = i.label.split(' — ');
    const key = rawKey.replace(/^\W*(\(?[a-z0-9]{1,3}[).]\s*)+/i, '');   // drop numbering like "b)", "2.", "(iv)"
    if (norm(key).length < 3) continue;
    const re = loose(key);
    for (const l of lines) {
      const m = l.match(re);
      if (!m) continue;
      let v = l.slice(m.index + m[0].length).replace(/^[\s:：=\-–]+/, '').trim();
      if (col && /percent|%|amount|rm/i.test(col)) v = (v.match(/[\d.,]+\s*%?/) || [''])[0].replace(/\s/g, '');
      if (!v) continue;
      const input = $(`#autoFields [data-q="${i.id}"]`);
      if (input) { input.value = v; input.classList.add('auto'); n++; }
      break;
    }
  }
  return n;
}
function showCurrent() {
  const c = lastRead?.current, h = $('#currentHint');
  if (!h) return;
  h.textContent = c && Object.keys(c).length ? `Current (from upload): ${[c.mode, c.method, c.premium && 'RM ' + c.premium].filter(Boolean).join(' · ')}` : '';
}
function addPerson(listSel, kind) {
  const box = $(listSel);
  if (box.children.length >= (kind === 'nominee' ? 4 : 2)) return;
  const el = document.createElement('div');
  el.className = 'person';
  el.innerHTML = `<div class="personhead"><b></b><button class="link remove">Remove</button></div>
    <div class="drop small" tabindex="0"><b>Upload ${kind}'s IC / screenshot</b><span>(optional)</span></div>
    <div class="readout"></div>${personFields(kind === 'nominee' ? NOMINEE : TRUSTEE)}`;
  box.appendChild(el);
  const renumber = () => $$(listSel + ' .personhead b').forEach((b, i) => b.textContent = `${kind === 'nominee' ? 'Nominee' : 'Trustee'} ${i + 1}`);
  renumber();
  el.querySelector('.remove').onclick = () => { el.remove(); renumber(); };
  makeDrop(el.querySelector('.drop'), r => showRead(el.querySelector('.readout'), r, r.error ? 0 : applyRead(el, r.person)));
  fillIn(el, { ...NEW_PERSON, addressSameAsOwner: kind === 'nominee' });
  refreshVisibility(el);
}

// ── Collect everything for the server ──
function collectCase() {
  const sec = collect($('#formSection'));
  const caseData = { policy: { proposalNo: $('#proposalNo').value.trim(), policyNo: $('#policyNo').value.trim() }, signDate: $('#signDate').value };
  if (formId === 'nomination') caseData.nomination = { trusteeOption: sec.nomination?.trusteeOption || '',
    nominees: $$('#nominees .person').map(el => collect(el, 'k', null)), trustees: $$('#trustees .person').map(el => collect(el, 'k', null)) };
  if (formId === 'amendment') caseData.amendment = { ...sec.amendment, ...collect($('#addrBox [data-scope]'), 'k', null), addressSameAsClient: false };
  if (formId === 'gastric') {
    const g = sec.gastric || {};
    for (const k of ['q6rows', 'q8rows']) g[k] = Object.values(g[k] || {});
    g.q1 = [g.q1pick, g.q1].filter(Boolean).join('. ');
    caseData.gastric = g;
  }
  if (!NEEDS[formId]) {
    prefillAuto();
    caseData.answers = Object.fromEntries($$('#autoFields [data-q]').map(el => [el.dataset.q, el.type === 'checkbox' ? el.checked : el.value.trim()]));
  }
  return caseData;
}

// ── Step 4: fill + review + approve ──
$('#generate').onclick = async () => {
  if (formId === 'nomination' && !$$('#nominees .person').length) return flash('#genMsg', 'Add at least one nominee.', true);
  $('#generate').disabled = true; flash('#genMsg', 'Filling…');
  try {
    const run = await api('/api/generate', { formId, client: collect($('#clientFields'), 'k', null),
      proposer: $('#diffOwner').checked && needs().owner ? collect($('#proposerBox'), 'k', null) : null, witness: collectWitness(), caseData: collectCase() });
    renderReview(run);
    flash('#genMsg', 'Draft ready — please review below.');
    $('#review').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { flash('#genMsg', e.message, true); }
  $('#generate').disabled = false;
};
function renderReview(run) {
  const errs = run.results.flatMap(r => r.issues).filter(i => i.level === 'error').length;
  const label = { error: 'Left blank', warn: 'Please check', info: 'Note' };
  const pdfUrl = r => r.url;
  $('#review').innerHTML = `<div class="card review">
    <h2><span class="step">5</span> Review before approving</h2>
    <p class="hint">Nothing is final yet. Open the PDF, compare it with ePartner, then approve.</p>
    ${run.results.map(r => {
      const e = r.issues.filter(i => i.level === 'error').length, w = r.issues.filter(i => i.level === 'warn').length;
      return `<div class="result">
        <div class="resulthead"><b>${esc(r.title)}</b>
          <span class="chip ${e ? 'bad' : w ? 'mid' : 'good'}">${e ? e + ' blank' : w ? w + ' to check' : 'Looks complete'}</span>
          ${r.file ? `<a href="${pdfUrl(r)}" target="_blank">Open PDF ↗</a>` : '<span class="bad">Not created</span>'}</div>
        ${r.issues.length ? `<ul class="issues">${r.issues.map(i => `<li class="${i.level}"><span>${label[i.level]}</span>${esc(i.msg)}</li>`).join('')}</ul>` : ''}
        ${r.file ? `<iframe src="${pdfUrl(r)}#view=FitH" loading="lazy"></iframe>` : ''}
      </div>`;
    }).join('')}
    <div class="approve">
      <label class="check"><input type="checkbox" id="chkReviewed"> I have checked the form against ePartner</label>
      ${errs ? `<label class="check"><input type="checkbox" id="chkBlank"> I will complete the ${errs} blank field(s) by hand</label>` : ''}
      <div class="actions">
        <button id="approve">Approve and save final copy</button>
        <button id="reject" class="secondary">Send back — I'll correct and re-fill</button>
        <span id="approveMsg" class="msg"></span>
      </div>
    </div></div>`;
  $('#review').classList.remove('hidden');
  $('#approve').onclick = async () => {
    if (!$('#chkReviewed').checked) return flash('#approveMsg', 'Please tick that you have checked the form.', true);
    try {
      const r = await api('/api/approve', { runId: run.runId, acceptErrors: $('#chkBlank')?.checked });
      $('#review .approve').innerHTML = `<p class="ok">Approved ✓ <code>${esc(r.file)}</code> was downloaded to ${esc(r.folder)}.</p>
        <div class="actions"><button id="nextCustomer">Next customer</button></div>`;
      $('#nextCustomer').onclick = () => $('#newCustomer').click();
    } catch (e) { flash('#approveMsg', e.message, true); }
  };
  $('#reject').onclick = async () => {
    await api('/api/reject', { runId: run.runId });
    $('#review').innerHTML = ''; $('#review').classList.add('hidden');
    flash('#genMsg', 'Draft sent back. Correct the details above and press "Fill the form" again.');
  };
}

// ── Log ──
async function loadLog() {
  const rows = await api('/api/log');
  $('#logTable tbody').innerHTML = rows.map(r => `<tr><td>${esc(r.time)}</td><td>${esc(r.client)}</td><td>${esc(r.forms)}</td><td>${esc(r.errors)}</td><td>${esc(r.warnings)}</td>
    <td><span class="chip ${r.status === 'APPROVED' ? 'good' : r.status === 'REJECTED' ? 'bad' : 'mid'}">${esc(r.status)}</span></td><td>${esc(r.note)}</td></tr>`).join('') || '<tr><td colspan="7">No runs yet.</td></tr>';
}

// ── Settings ──
// ── Witness: name + agent ID, filled with your Settings details and editable for each form ──
let agentInfo = {};
const WITNESS_NOTE = {
  nomination: 'The name goes in the witness signature area and the Agent ID in the IAC No. box (pages 3 and 4).',
  amendment: 'The name goes in the witness section. The NRIC line uses your NRIC from Settings when you are the witness; otherwise it is left blank to write by hand.',
  gastric: 'The name goes in the witness section. NRIC and address use your Settings when you are the witness; otherwise they are left blank to write by hand.',
};
function buildWitness() {
  $('#witnessCard').classList.toggle('hidden', !NEEDS[formId]); // basic fill does not write the witness
  $('#witnessChoice').innerHTML = `<div class="grid3">
    <label>Witness name<input id="witnessName"></label>
    <label>Agent ID (IAC No.)<input id="witnessIac" maxlength="7"></label>
    <label>&nbsp;<button class="secondary small" id="witnessMe">Use my details</button></label></div>`;
  const me = () => { $('#witnessName').value = agentInfo.name || ''; $('#witnessIac').value = agentInfo.iac || ''; };
  me();
  $('#witnessMe').onclick = e => { e.preventDefault(); me(); };
  $('#witnessNote').textContent = (agentInfo.name ? '' : 'Tip: save your own name and Agent ID in Settings so they are filled in here automatically. ') + (WITNESS_NOTE[formId] || '');
}
function collectWitness() {
  return { name: $('#witnessName')?.value.trim() || '', iac: $('#witnessIac')?.value.trim() || '' };
}

async function loadSettings() { fillIn($('#tab-settings'), await api('/api/settings'), 's'); }
$('#saveSettings').onclick = async () => {
  await api('/api/settings', collect($('#tab-settings'), 's'));
  flash('#settingsMsg', 'Saved ✓');
  agentInfo = (await api('/api/settings')).agent || {};
  if (formId) buildWitness();
};
$('#downloadLog').onclick = () => Object.assign(document.createElement('a'), {
  href: URL.createObjectURL(new Blob([logCsv()], { type: 'text/csv' })), download: 'ge-form-filler-run-log.csv' }).click();

function flash(sel, text, bad) { const el = $(sel); el.textContent = text; el.classList.toggle('bad', !!bad); }

// ── Forms folder: chosen once, read on this computer ──
async function useFolder(res) {
  if (!res) return flash('#folderMsg', 'Access to the folder was not allowed.', true);
  setFiles(res.files);
  await loadForms();
  const n = res.files.filter(f => /\.pdf$/i.test(f.path)).length;
  flash('#folderMsg', n ? `✓ ${res.name}: ${n} forms ready` : `No PDF forms found in "${res.name}". Please choose the EPARNER FORM folder.`, !n);
  $('#formStep').classList.toggle('hidden', !n);
  $('#reopenFolder').classList.add('hidden');
}
$('#pickFolder').onclick = async () => {
  try {
    if (canRemember) await useFolder(await pickFolder());
    else $('#folderInput').click();
  } catch (e) { if (e.name !== 'AbortError') flash('#folderMsg', e.message, true); }
};
$('#folderInput').onchange = e => useFolder(fromInput(e.target.files));
window.geffUseFiles = files => useFolder({ name: 'EPARNER FORM', files }); // used by automated tests

(async () => {
  if (canRemember) {
    const h = await savedHandle();
    if (h) {
      $('#reopenFolder').textContent = `Open my forms folder (${h.name})`;
      $('#reopenFolder').classList.remove('hidden');
      $('#reopenFolder').onclick = async () => { try { await useFolder(await reopen(h)); } catch (e) { flash('#folderMsg', e.message, true); } };
    }
  }
  const s = await api('/api/settings');
  agentInfo = s.agent || {};
  if (!s.agent?.name || /test agent/i.test(s.agent.name)) flash('#genMsg', 'Tip: put your own name, NRIC and IAC No. in Settings — they go in the witness section.');
})();
