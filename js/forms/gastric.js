// Gastric/Stomach Disorder Questionnaire — NBZ-QGAS1-V05e-082025a (flat PDF, 3 pages). Positions measured from the V05e file.
import { up, isBlank, parseDate, digits } from '../util.js';

const CW = 14.39;
const date = (x1, x2, x3, y, h = 14) => ({ d: { x: x1, y, h, cw: 14.37, n: 2 }, m: { x: x2, y, h, cw: 14.37, n: 2 }, y: { x: x3, y, h, cw: 14.37, n: 4 } });
const yn = (p, y, yesX, noX) => ({ p, y, yesX, noX, s: 7.1 });
const ruled = (p, ys) => ({ p, x: 46, ys: ys.map(v => v + 2.5), maxW: 498 });

const L = {
  header: [
    { p: 0, prop: { x: 79.2, y: 756, h: 15, cw: CW, n: 10 }, pol: { x: 79.2, y: 734, h: 15, cw: CW, n: 10 } },
    { p: 1, prop: { x: 100.4, y: 773, h: 15, cw: CW, n: 10 }, pol: { x: 387.0, y: 773, h: 15, cw: CW, n: 10 } },
    { p: 2, prop: { x: 99.5, y: 774, h: 15, cw: CW, n: 10 }, pol: { x: 386.0, y: 774, h: 15, cw: CW, n: 10 } },
  ],
  nric: [{ x: 335.0, n: 6 }, { x: 435.8, n: 2 }, { x: 479.0, n: 4 }].map(g => ({ ...g, y: 756, h: 15, cw: 14.4 })),
  oldId: { x: 335.0, y: 734, h: 15, cw: CW, n: 16 },
  name: { x: 137, y: 547.5, maxW: 410 },
  q1: ruled(0, [447.7, 433.8, 419.6]),
  q2: date(56.3, 99.5, 142.7, 378),
  q3: date(56.3, 99.5, 142.7, 340),
  q4: { x: 57.0, y: 302, h: 14, cw: 14.37, n: 3 },
  q5a: yn(0, 271, 183.5, 222.6),
  q5b: yn(0, 253, 183.5, 222.6),
  q6: yn(0, 218, 56.3, 95.4),
  q6rows: { p: 0, tops: [165.7, 138.4, 111.2, 83.7], cols: [[47, 203], [256, 79], [341, 205]] },
  q7: yn(1, 723, 57.7, 96.7), q7d: ruled(1, [691.4, 677.5, 663.2]),
  q8: yn(1, 629, 57.7, 96.7),
  q8rows: { p: 1, tops: [579.3, 550.3, 521.1, 491.7], cols: [[44, 171], [220, 69], [295, 67], [368, 175]] },
  q9: yn(1, 456, 57.7, 96.7), q9d: ruled(1, [420.3, 406.4, 392.2]),
  q10: yn(1, 356, 57.7, 96.7), q10d: ruled(1, [325.3, 311.4, 297.1]),
  q11: yn(1, 261, 57.7, 96.7), q11d: ruled(1, [230.2, 216.3, 202.0]),
  q12: yn(1, 166, 57.7, 96.7), q12d: ruled(1, [134.6, 120.7, 106.5]),
  sign: date(233.5, 276.7, 319.9, 671),
  wName: { x: 369, y: 513.5, maxW: 136 },
  wNric: { x: 381, y: 495.8, maxW: 124 },
  wAddr: [{ x: 376, y: 477.6, maxW: 129 }, { x: 345, y: 464.6, maxW: 160 }, { x: 345, y: 451.9, maxW: 160 }],
};

const QUESTIONS = {
  q5a: 'Q5(a) Vomiting of blood', q5b: 'Q5(b) Blood in stool', q6: 'Q6 Medical advice', q7: 'Q7 Tests/investigations',
  q8: 'Q8 Hospitalised', q9: 'Q9 Further treatment', q10: 'Q10 Current treatment', q11: 'Q11 Operation', q12: 'Q12 Other disease',
};

export default {
  id: 'gastric',
  title: 'Gastric/Stomach Disorder Questionnaire',
  code: 'NBZ-QGAS1-V05e',
  file: 'New Business/Medical Questionnaires by Life to be Assured or Proposer/Gastric-Stomach Disorder Questionnaire to be completed by Life to be Assured - NBZ-QGAS1-V05e-082025a FPMS.pdf',
  kind: 'flat',
  QUESTIONS,

  fill({ o, data, issues }) {
    const { policy, la, agent } = data;
    const a = data.case.gastric || {};
    const cells = (p, text, box, field) => { if (!o.cells(p, text, box)) issues.error(field, `${field}: "${text}" is too long for the boxes — left blank.`); };
    const putDate = (p, s, box, field) => {
      if (isBlank(s)) return;
      const d = parseDate(s);
      if (!d) return issues.error(field, `${field}: "${s}" is not a valid date — left blank.`);
      o.cells(p, d.d, box.d); o.cells(p, d.m, box.m); o.cells(p, d.y, box.y);
    };
    const free = (box, text, field) => { if (!isBlank(text) && !o.lines(box.p, text, box)) issues.error(field, `${field}: answer too long for the lines — left blank. Attach a separate sheet.`); };

    if (isBlank(policy.proposalNo) && isBlank(policy.policyNo)) issues.error('Proposal/Policy No', 'Neither Proposal No. nor Policy No. entered.');
    for (const h of L.header) { cells(h.p, policy.proposalNo, h.prop, 'Proposal No'); cells(h.p, policy.policyNo, h.pol, 'Policy No'); }

    if (isBlank(la?.fullName)) issues.error('Name', 'Name of Life to be Assured is missing.');
    else if (!o.text(0, up(la.fullName), L.name)) issues.error('Name', 'Name too long for the line — left blank.');
    if ((la?.idType || 'NRIC') === 'NRIC') {
      const n = digits(la?.idNo);
      if (n.length === 12) { o.cells(0, n.slice(0, 6), L.nric[0]); o.cells(0, n.slice(6, 8), L.nric[1]); o.cells(0, n.slice(8), L.nric[2]); }
      else issues.error('NRIC', `NRIC "${la?.idNo || ''}" is not 12 digits — left blank.`);
      cells(0, la?.oldIc, L.oldId, 'Old NRIC');
    } else cells(0, la?.idNo, L.oldId, 'Passport No');

    // Medical answers come from the client. Blank answers stay blank for the client to complete.
    const answered = Object.keys(QUESTIONS).filter(k => a[k]).length + ['q1', 'q2', 'q3', 'q4'].filter(k => !isBlank(a[k])).length;
    if (!answered) issues.info('Medical answers', 'No medical answers entered — Q1–Q12 left blank for the client to complete in person.');
    else issues.info('Medical answers', 'Medical answers were filled in — the client must read and confirm every answer before signing.');

    free(L.q1, a.q1, 'Q1 Condition');
    putDate(0, a.q2, L.q2, 'Q2 First symptoms');
    putDate(0, a.q3, L.q3, 'Q3 Last attack');
    if (!isBlank(a.q4)) {
      if (!/^\d{1,3}$/.test(String(a.q4).trim())) issues.error('Q4 Attacks', `"${a.q4}" is not a number — left blank.`);
      else o.cells(0, String(a.q4).trim(), { ...L.q4, align: 'right' });
    }

    for (const k of Object.keys(QUESTIONS)) {
      const v = a[k]; if (!v) continue;
      const box = L[k];
      o.tick(box.p, { x: v === 'Yes' ? box.yesX : box.noX, y: box.y, s: box.s });
    }
    const needDetails = (q, has, label) => { if (a[q] === 'Yes' && !has) issues.warn(label, `${label} answered "Yes" but no details given.`); };

    const rows = (spec, list, keys, label) => {
      const filled = (list || []).filter(r => keys.some(k => !isBlank(r[k])));
      filled.slice(0, 3).forEach((r, i) => {
        const y = (spec.tops[i] + spec.tops[i + 1]) / 2 - 3;
        keys.forEach((k, j) => {
          const [x, maxW] = spec.cols[j];
          let v = r[k];
          if (k === 'date' && !isBlank(v)) {
            const d = parseDate(v);
            if (!d) return issues.error(label, `${label}: date "${v}" invalid — left blank.`);
            v = `${d.d}/${d.m}/${d.y}`;
          }
          if (!o.text(spec.p, v, { x, y, maxW, size: 8 })) issues.error(label, `${label}: "${v}" too long for the table cell — left blank.`);
        });
      });
      if (filled.length > 3) issues.warn(label, `${label}: only 3 rows fit on the form — attach the rest separately.`);
      return filled.length;
    };
    needDetails('q6', rows(L.q6rows, a.q6rows, ['name', 'date', 'treatment'], 'Q6 table'), 'Q6 Medical advice');
    needDetails('q7', !isBlank(a.q7d), 'Q7 Tests'); free(L.q7d, a.q7d, 'Q7 details');
    needDetails('q8', rows(L.q8rows, a.q8rows, ['name', 'date', 'duration', 'treatment'], 'Q8 table'), 'Q8 Hospitalised');
    for (const q of ['q9', 'q10', 'q11', 'q12']) { needDetails(q, !isBlank(a[q + 'd']), QUESTIONS[q]); free(L[q + 'd'], a[q + 'd'], QUESTIONS[q]); }

    putDate(2, data.case.signDate, L.sign, 'Signing date');
    // Witness: name from the page; NRIC and address only when the witness is you (from Settings)
    if (isBlank(agent.name)) issues.warn('Witness', 'Witness name missing — left blank.');
    o.text(2, up(agent.name), L.wName);
    o.text(2, digits(agent.nric), L.wNric);
    const addr = [agent.address1, agent.address2, agent.address3].map(up).filter(Boolean);
    if (agent.other) issues.info('Witness', 'Witness is another agent — write their NRIC and address by hand.');
    else if (!addr.length || isBlank(agent.nric)) issues.warn('Witness', 'Your NRIC or address is not set in Settings — left blank.');
    addr.slice(0, 3).forEach((l, i) => { if (!o.text(2, l, { ...L.wAddr[i], size: 8 })) issues.warn('Witness address', `Witness address line ${i + 1} too long — left blank.`); });
  },
};
