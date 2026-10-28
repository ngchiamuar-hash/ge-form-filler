// Reads an ePartner screenshot inside the browser (the image never leaves your computer) and picks out client details.
// Two layouts are understood: "Label  value" pairs, and tables with a header row (e.g. the
// ePartner Policy Detail page: Insured | Name | Gender | ID No | ID Type | DOB | Religion ...).
// Nothing is guessed: a detail is only returned if its label (or an unmistakable pattern like an NRIC) is found.
import { tesseract, TESS_LANG_PATH } from './vendor.js';
import { digits, parseDate } from './util.js';
import { cleanImage } from './cleanimage.js';

let workerP = null;
function worker() {
  workerP ??= (async () => {
    const T = await tesseract();
    const w = await T.createWorker('eng', 1, { langPath: TESS_LANG_PATH });
    await w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
    return w;
  })();
  return workerP;
}

// Label words as they may appear on screen. Longer labels win over shorter ones ("Mailing Address" over "Address").
const LABELS = {
  proposalNo: ['proposal no', 'proposal number', 'application no'],
  policyNo: ['policy no', 'policy number', 'contract no', 'p/n'],
  idType: ['id type', 'identification type'],
  idNo: ['new nric no', 'nric no', 'new ic no', 'ic no', 'id no', 'id number', 'identification no', 'nric', 'mykad no', 'passport no'],
  oldIc: ['old ic no', 'old nric no', 'old ic'],
  fullName: ['customer name', 'client name', 'policyowner name', 'policy owner name', 'life assured name', 'insured name', 'full name', 'name'],
  dob: ['date of birth', 'birth date', 'dob'],
  gender: ['gender', 'sex'],
  nationality: ['nationality', 'citizenship'],
  countryOfBirth: ['country of birth', 'birth country'],
  maritalStatus: ['marital status', 'marital'],
  religion: ['religion'],
  relationship: ['relationship to policyowner', 'relationship', 'relation'],
  share: ['% of share', 'share %', 'percentage of share', 'share'],
  phone: ['mobile no', 'mobile phone', 'mobile', 'handphone no', 'handphone', 'hp no', 'contact no', 'phone no', 'tel no'],
  address: ['mailing address', 'correspondence address', 'residential address', 'home address', 'address line 1', 'address 1', 'address'],
  address2: ['address line 2', 'address 2'],
  address3: ['address line 3', 'address 3'],
  postcode: ['postcode', 'postal code', 'post code', 'poskod', 'zip code'],
  town: ['city', 'town', 'bandar'],
  state: ['state', 'negeri'],
  country: ['country'],
  // current policy details (shown as a reminder, never ticked as a change)
  currentMode: ['payment frequency', 'payment mode', 'premium mode'],
  currentMethod: ['payment method', 'method of payment'],
  currentPremium: ['total installment premium', 'total instalment premium', 'installment premium', 'instalment premium', 'modal premium'],
  // labels we recognise only so their values don't leak into the field before them
  _ignore: ['agent name', 'nominee name', 'trustee name', 'beneficiary name', 'payor name', 'email', 'e-mail', 'occupation', 'race', 'smoker id',
    'smoker', 'income', 'employer', 'agent', 'office no', 'house no', 'fax', 'insured', 'age at entry', 'proof of age', 'vc indicator',
    'policy status', 'premium status', 'currency', 'discount type', 'next due date', 'credit card no', 'last payment date', 'stamp duty',
    'policy issue date', 'risk commencement date', 'lapse date', 'termination date', 'service tax ind', 'status'],
};
const ALL = Object.entries(LABELS).flatMap(([k, ls]) => ls.map(l => ({ k, l }))).sort((a, b) => b.l.length - a.l.length);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Common OCR slips: "1D" for "ID"; table borders read as | [ ]
const clean = t => t.replace(/\b1D\b/g, 'ID').replace(/[|[\]{}]/g, ' ').replace(/[ \t]+/g, ' ');

function splitByLabels(line) {
  const low = line.toLowerCase();
  const hits = [];
  for (const { k, l } of ALL) {
    const re = new RegExp(`(^|[^a-z])${reEsc(l)}(?![a-z])\\.?\\s*:?`, 'g');
    let m;
    while ((m = re.exec(low))) {
      const start = m.index + m[1].length, end = m.index + m[0].length;
      if (!hits.some(h => start < h.end && end > h.start)) hits.push({ k, start, end });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits.map((h, i) => ({ k: h.k, v: line.slice(h.end, hits[i + 1]?.start ?? line.length).trim() }));
}

// Table with a header row: assign each word in the rows below to the header column it sits under.
const TABLE_COLS = { fullName: ['name'], gender: ['gender', 'sex'], idNo: ['id no', 'nric no', 'ic no', 'nric'], idType: ['id type'], dob: ['dob', 'date of birth'], religion: ['religion'] };
const ROLES = [['lifeAssured', /^life\s*assured/i], ['proposer', /^(proposer|policy\s*owner|owner|payor)/i]];
function parseTables(lines) {
  const rows = {};
  for (let i = 0; i < lines.length; i++) {
    const ws = lines[i].words.map(w => ({ t: clean(w.text).trim(), ...w.bbox })).filter(w => w.t);
    const lows = ws.map(w => w.t.toLowerCase());
    if (!lows.includes('name') || !(lows.includes('gender') || lows.includes('dob'))) continue;
    const h = Math.max(...ws.map(w => w.y1 - w.y0));
    const cols = [];
    for (const w of ws) {
      const prev = cols.at(-1);
      if (prev && w.x0 - prev.x1 < h * 1.2) { prev.label += ' ' + w.t.toLowerCase(); prev.x1 = w.x1; }
      else cols.push({ label: w.t.toLowerCase(), x0: w.x0, x1: w.x1 });
    }
    for (const line of lines.slice(i + 1, i + 6)) {
      const rws = line.words.map(w => ({ t: clean(w.text).trim(), ...w.bbox })).filter(w => w.t);
      if (!rws.length) continue;
      const cells = cols.map(() => []);
      for (const w of rws) {
        let ci = 0;
        cols.forEach((c, j) => { if (c.x0 <= w.x0 + h * 0.6) ci = j; });
        cells[ci].push(w.t);
      }
      const role = ROLES.find(([, re]) => re.test(cells[0].join(' ')))?.[0];
      if (!role || rows[role]) continue;
      const r = {};
      for (const [k, labels] of Object.entries(TABLE_COLS)) {
        const ci = cols.findIndex(c => labels.includes(c.label.replace(/\./g, '')));
        if (ci >= 0 && cells[ci].length) r[k] = cells[ci].join(' ');
      }
      rows[role] = r;
    }
  }
  return rows;
}

// Nominee-style tables (Name | NRIC | Relationship | Share % ...): every row below the header is one person.
const PEOPLE_COLS = {
  fullName: ['nominee name', 'trustee name', 'full name', 'name'], idNo: ['nric/passport no', 'nric no', 'id no', 'ic no', 'id number', 'nric', 'passport no'],
  dob: ['date of birth', 'dob', 'birth date'], gender: ['gender', 'sex'], relationship: ['relationship', 'relation'],
  share: ['% of share', 'share %', 'percentage', 'share', '%'], nationality: ['nationality'],
};
function parsePeople(lines) {
  const people = [];
  for (let i = 0; i < lines.length; i++) {
    const ws = lines[i].words.map(w => ({ t: clean(w.text).trim(), ...w.bbox })).filter(w => w.t);
    const lineLow = ws.map(w => w.t.toLowerCase()).join(' ');
    if (!/\bname\b/.test(lineLow) || !/relation|share|percent|%/.test(lineLow)) continue;
    const h = Math.max(...ws.map(w => w.y1 - w.y0));
    const cols = [];
    for (const w of ws) {
      const prev = cols.at(-1);
      if (prev && w.x0 - prev.x1 < h * 1.2) { prev.label += ' ' + w.t.toLowerCase(); prev.x1 = w.x1; }
      else cols.push({ label: w.t.toLowerCase(), x0: w.x0, x1: w.x1 });
    }
    const colKey = cols.map(c => Object.entries(PEOPLE_COLS).find(([, syn]) => syn.some(s => c.label.replace(/\./g, '').includes(s)))?.[0]);
    for (const line of lines.slice(i + 1, i + 9)) {
      const rws = line.words.map(w => ({ t: clean(w.text).trim(), ...w.bbox })).filter(w => w.t);
      if (!rws.length) continue;
      const cells = cols.map(() => []);
      for (const w of rws) { let ci = 0; cols.forEach((c, j) => { if (c.x0 <= w.x0 + h * 0.6) ci = j; }); cells[ci].push(w.t); }
      const r = {};
      colKey.forEach((k, j) => { if (k && cells[j].length && !r[k]) r[k] = cells[j].join(' '); });
      if (!r.fullName || !/[a-z]{2}/i.test(r.fullName)) break; // end of table
      people.push(r);
    }
    if (people.length) break;
  }
  return people;
}
const RELATIONS = ['Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
function normaliseExtra(raw, out) {
  const rel = (raw.relationship || '').trim();
  if (rel) {
    const hit = RELATIONS.find(r => rel.toLowerCase().replace(/[^a-z]/g, '').startsWith(r.toLowerCase()));
    if (hit) out.relationship = hit; else { out.relationship = 'Others'; out.relationshipOther = rel; }
  }
  const sh = (raw.share || '').match(/\d+(\.\d+)?/);
  if (sh && +sh[0] > 0 && +sh[0] <= 100) out.share = sh[0];
  return out;
}

// Gastric conditions named on a medical letter or the client's notes
const CONDITIONS = [['Gastroesophageal Reflux Disease', /gastro-?o?esophageal reflux|\bgerd\b|\bgord\b/i], ['Reflux Oesophagitis', /reflux o?esophagitis/i],
  ['Duodenal Ulcer', /duodenal ulcer/i], ['Gastric Ulcer', /gastric ulcer/i], ['Peptic Ulcer', /peptic ulcer/i], ['Gastritis', /gastritis/i]];

function normalise(raw) {
  const out = {}, notes = [];
  const val = k => (raw[k] || '').trim();
  if (val('fullName')) out.fullName = val('fullName').replace(/[^A-Za-z@'\/.\- ]/g, '').replace(/\s+/g, ' ').trim();
  // ID: label first, otherwise any NRIC-shaped number on the page
  let id = val('idNo');
  if (!id) { const m = raw._text.match(/\b\d{6}\s?-\s?\d{2}\s?-\s?\d{4}\b/); if (m) { id = m[0]; notes.push('NRIC found by its pattern (no label) — please check.'); } }
  if (id) {
    const d = digits(id);
    const passport = /passport/i.test(val('idType')) || (/[a-z]/i.test(id) && d.length !== 12);
    out.idType = passport ? 'Passport' : 'NRIC';
    out.idNo = passport ? id.replace(/\s/g, '').toUpperCase() : (d.length === 12 ? `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : id);
    if (!passport && d.length !== 12) notes.push(`ID "${id}" is not 12 digits — screenshot may be unclear.`);
  }
  if (val('oldIc')) out.oldIc = val('oldIc').replace(/\s/g, '');
  const dob = val('dob');
  if (dob) {
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    let p = parseDate(dob.replace(/\s/g, ''));
    const m = !p && dob.match(/(\d{1,2})\s*[-\s]?\s*([a-z]{3})[a-z]*\s*[-\s]?\s*(\d{4})/i);
    if (m && months[m[2].toLowerCase()]) p = parseDate(`${m[1]}/${months[m[2].toLowerCase()]}/${m[3]}`);
    if (p) out.dob = `${p.y}-${p.m}-${p.d}`; else notes.push(`Date of birth "${dob}" could not be read.`);
  }
  const g = val('gender').toLowerCase();
  if (/^(f|female|perempuan)\b/.test(g)) out.gender = 'F'; else if (/^(m|male|lelaki)\b/.test(g)) out.gender = 'M';
  if (val('nationality')) out.nationality = /malaysia/i.test(val('nationality')) ? 'Malaysian' : val('nationality');
  if (val('countryOfBirth')) out.countryOfBirth = val('countryOfBirth');
  const ms = val('maritalStatus').toLowerCase();
  out.maritalStatus = ['married', 'single', 'divorced', 'widowed'].find(s => ms.startsWith(s.slice(0, 4)))?.replace(/^./, c => c.toUpperCase());
  if (!out.maritalStatus) delete out.maritalStatus;
  // "Non-Muslim" must not be read as Muslim
  const rel = val('religion').toLowerCase().replace(/[^a-z]/g, '');
  if (rel) {
    if (/^non(muslim|islam)/.test(rel)) out.muslim = 'No';
    else if (/^(muslim|islam)/.test(rel)) out.muslim = 'Yes';
    else if (/^(buddhis|christian|hindu|sikh|taois|others?|none|freethinker)/.test(rel)) out.muslim = 'No';
    else notes.push(`Religion "${val('religion')}" not recognised — please tick Muslim Yes/No.`);
  }
  if (val('phone')) out.phone = val('phone').replace(/[^\d+\- ]/g, '').trim();
  // Address: join the address lines, then split at commas into lines of up to 32 characters (the nomination form width)
  let addr = [val('address'), val('address2'), val('address3')].filter(Boolean).join(', ');
  // No "Address" label (e.g. a screenshot of just the address): find a line with a 5-digit Malaysian postcode
  if (!addr && !val('postcode')) {
    const lines = (raw._text || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const i = lines.findIndex(l => /(^|[\s,])\d{5}([\s,]|$)/.test(l) && /[a-z]{3}/i.test(l) && !/policy|proposal|nric|i\/?c|passport|tel|phone|mobile|\d{6,}/i.test(l));
    if (i >= 0) {
      const m = lines[i].match(/^(.*?)[\s,]*(\d{5})[\s,]*(.*)$/);
      // address lines just above the postcode line (NO 12, JALAN..., TAMAN...) belong to the same address
      const before = [];
      for (let j = i - 1; j >= 0 && before.length < 2 && /^(no\.?|lot|jalan|jln|taman|tmn|kg|kampung|lorong|lrg|blok|block|unit|lebuh|persiaran|\d)/i.test(lines[j]); j--) before.unshift(lines[j]);
      addr = [...before, m[1]].filter(Boolean).join(', ');
      raw.postcode = m[2];
      if (m[3] && !val('town')) raw.town = m[3].replace(/[^A-Za-z .'-]/g, '').trim();
      notes.push('Address found without a label — please check it.');
    }
  }
  if (addr) {
    const parts = addr.split(/\s*,\s*/).filter(Boolean), lines = [];
    for (const p of parts) { const last = lines.at(-1); if (last && (last + ', ' + p).length <= 32) lines[lines.length - 1] = last + ', ' + p; else lines.push(p); }
    out.address = { line1: lines[0] || '', line2: lines[1] || '', line3: lines.slice(2).join(', ') };
  }
  const pc = digits(val('postcode')) || (addr.match(/\b\d{5}\b/) || [])[0];
  const town = val('town'), country = val('country');
  if (pc || town || country) {
    out.address ??= {};
    if (pc) out.address.postcode = pc.slice(0, 5);
    if (town) out.address.town = town;
    out.address.country = country ? country.replace(/^./, c => c.toUpperCase()) : 'Malaysia';
  }
  const policy = {};
  const num = v => (v.match(/[A-Z0-9]{6,}/i) || [''])[0].toUpperCase();
  if (val('proposalNo')) policy.proposalNo = num(val('proposalNo'));
  if (val('policyNo')) policy.policyNo = num(val('policyNo'));
  const current = {};
  if (val('currentMode')) current.mode = ['Yearly', 'Half-Yearly', 'Quarterly', 'Monthly'].find(m => val('currentMode').toLowerCase().replace(/[^a-z]/g, '').startsWith(m.toLowerCase().replace(/[^a-z]/g, ''))) || val('currentMode');
  if (val('currentMethod')) current.method = val('currentMethod');
  if (val('currentPremium')) current.premium = (val('currentPremium').match(/[\d,]+\.\d{2}/) || [val('currentPremium')])[0];
  return { person: out, policy, current, notes };
}

const FIELD_NAMES = { fullName: 'Name', idNo: 'NRIC/Passport', dob: 'Date of birth', gender: 'Gender', nationality: 'Nationality', maritalStatus: 'Marital status', muslim: 'Religion (Muslim?)', phone: 'Phone', address: 'Address' };

async function readScreenshot(blob) {
  const w = await worker();
  const { data } = await w.recognize(await cleanImage(blob));
  const text = clean(data.text || '');
  const raw = { _text: text };
  // Table rows first: on the Policy Detail page the Life Assured row is the client
  const rows = parseTables(data.lines || []);
  const main = rows.lifeAssured || rows.proposer;
  if (main) Object.assign(raw, main);
  for (const line of text.split('\n')) for (const { k, v } of splitByLabels(line)) if (k !== '_ignore' && v && !raw[k]) raw[k] = v;
  const res = normalise(raw);
  if (rows.lifeAssured && rows.proposer) {
    const prop = normalise({ ...rows.proposer, _text: '' }).person;
    if (prop.idNo && res.person.idNo && digits(prop.idNo) !== digits(res.person.idNo)) {
      res.proposer = prop;
      res.notes.push(`The Proposer (${prop.fullName || 'name unclear'}) is a different person from the Life Assured. Details shown are the Life Assured's — save the Proposer as a separate client and choose them under "Policyowner / Proposer".`);
    }
  }
  normaliseExtra(raw, res.person);
  const people = parsePeople(data.lines || []).map(p => normaliseExtra(p, normalise({ ...p, _text: '' }).person));
  const conditions = CONDITIONS.filter(([, re]) => re.test(text)).map(([c]) => c);
  const missing = Object.keys(FIELD_NAMES).filter(k => !res.person[k]).map(k => FIELD_NAMES[k]);
  return { ...res, people, conditions, missing, text, confidence: Math.round(data.confidence || 0), layout: main ? 'table' : 'labels' };
}

export { readScreenshot, splitByLabels, normalise };
