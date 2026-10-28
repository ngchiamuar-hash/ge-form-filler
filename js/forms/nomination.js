// Appointment / Change of Nominee(s) / Trustee(s) — NBZ-FNOMI-V07-082025, New Business copy (flat PDF, 5 pages).
// Box positions are in nomination-nb-layout.json (measured from the New Business file).
import { up, isBlank, parseDate, digits, wrap, addressLines } from '../util.js';
import { checkPerson } from '../person.js';
import L from './nomination-nb-layout.js';

const RELATIONSHIPS = ['Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Others'];
const STATUS = ['Married', 'Single', 'Divorced', 'Widowed'];
const PHONE_TYPES = ['House', 'Handphone', 'Office'];
const TRUST_RELATIONS = ['Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother'];

export default {
  id: 'nomination',
  title: 'Appointment / Change of Nominee(s) / Trustee(s)',
  code: 'NBZ-FNOMI-V07',
  file: 'New Business/Other Forms/Appointment-Change of Nominee(S) - NBZ-FNOMI-V07-082025.pdf',
  kind: 'flat',
  RELATIONSHIPS, STATUS, PHONE_TYPES,

  fill({ o, data, issues }) {
    const { policy, agent } = data;
    const owner = data.proposer || data.la; // the policyowner makes the nomination
    const c = data.case.nomination || {};

    const cells = (text, box, label) => {
      if (isBlank(text)) return true;
      if (o.cells(box.p, text, box)) return true;
      issues.error(label, `${label}: "${text}" is longer than the ${box.n} boxes — left blank.`);
      return false;
    };
    const tick = b => o.tick(b.p, b);
    const putDate = (s, boxes, label, fourDigitYear = false) => {
      const d = parseDate(s);
      if (!d) { if (!isBlank(s)) issues.error(label, `${label}: "${s}" is not a valid date — left blank.`); return; }
      o.cells(boxes[0].p, d.d, boxes[0]); o.cells(boxes[1].p, d.m, boxes[1]);
      o.cells(boxes[2].p, fourDigitYear ? d.y : d.y.slice(2), boxes[2]);
    };
    const putName = (rows, name, label) => {
      const { lines, overflow } = wrap(name, rows[0].n, rows.length);
      if (overflow) return issues.error(label, `${label}: name does not fit in ${rows.length} rows of ${rows[0].n} boxes — left blank.`);
      lines.forEach((l, i) => o.cells(rows[i].p, l, rows[i]));
    };
    const putId = (L, p, label) => {
      if ((p.idType || 'NRIC') === 'NRIC') { const n = digits(p.idNo); if (n.length === 12) cells(n, L.nric, `${label} NRIC`); }
      else {
        cells(up(p.idNo).replace(/\s/g, ''), L.nric, `${label} Passport`);
        if (parseDate(p.passportExpiry)) putDate(p.passportExpiry, L.passportExpiry, `${label} passport expiry`);
        else issues.warn(`${label} passport expiry`, `${label}: passport expiry date missing or invalid.`);
      }
      putDate(p.dob, L.dob, `${label} date of birth`);
      if (p.gender) tick(L.gender[p.gender === 'M' ? 0 : 1]);
    };
    const putChoiceOrOther = (nat, ticks, otherBox, label, what) => {
      if (isBlank(nat)) return issues.error(`${label} ${what}`, `${label}: ${what.toLowerCase()} missing.`);
      if (/^malaysian?$/i.test(nat.trim())) tick(ticks[0]);
      else { tick(ticks[1]); cells(up(nat), otherBox, `${label} ${what}`); }
    };
    const putAddress = (L, addr, label) => {
      if (!addr || isBlank(addr.line1)) return issues.error(`${label} address`, `${label}: mailing address missing.`);
      const { lines, overflow } = addressLines(addr, L.Mailing1.n, 3);
      if (overflow) issues.error(`${label} address`, `${label}: address does not fit in 3 rows of ${L.Mailing1.n} boxes — left blank.`);
      else lines.forEach((l, i) => o.cells(L['Mailing' + (i + 1)].p, l, L['Mailing' + (i + 1)]));
      if (digits(addr.postcode).length === 5) cells(digits(addr.postcode), L.postcode, `${label} postcode`);
      else issues.warn(`${label} postcode`, `${label}: postcode "${addr.postcode || ''}" is not 5 digits — left blank.`);
      cells(up(addr.town), L.town, `${label} town`);
      cells(up(addr.country || 'Malaysia'), L.country, `${label} country`);
    };

    // Header on every page
    if (isBlank(policy.proposalNo) && isBlank(policy.policyNo)) issues.error('Proposal/Policy No', 'Neither Proposal No. nor Policy No. entered.');
    for (const [label, boxes, v] of [['Proposal No', L.proposalNo, up(policy.proposalNo)], ['Policy No', L.policyNo, up(policy.policyNo)]])
      if (cells(v, boxes[0], label)) boxes.slice(1).forEach(b => o.cells(b.p, v, b));

    // Proposer / policyowner
    checkPerson(owner, 'Policyowner', issues, { needDob: false, needGender: false });
    if (!isBlank(owner?.fullName)) {
      if (up(owner.fullName).length > L.ownerName.n) issues.error('Policyowner name', `Policyowner name is longer than the ${L.ownerName.n} boxes — left blank. Please write by hand.`);
      else o.cells(0, up(owner.fullName), L.ownerName);
    }
    if ((owner?.idType || 'NRIC') === 'NRIC') { const n = digits(owner?.idNo); if (n.length === 12) cells(n, L.ownerNric, 'Policyowner NRIC'); }
    else cells(up(owner?.idNo).replace(/\s/g, ''), L.ownerNric, 'Policyowner passport');
    if (owner?.muslim === 'Yes') tick(L.muslim[1]);
    else if (owner?.muslim === 'No') tick(L.muslim[0]);
    else issues.error('Muslim', 'Policyowner: "Are you a Muslim?" not answered.');
    const si = STATUS.indexOf(owner?.maritalStatus);
    if (si >= 0) tick(L.status[si]); else issues.error('Status', 'Policyowner: marital status not selected.');
    const kids = parseInt(owner?.children, 10);
    if (isBlank(owner?.children)) issues.error('Children', 'Policyowner: number of children not entered (tick 0 if none).');
    else if (kids === 0) tick(L.hasChildren[0]);
    else if (kids > 0) { tick(L.hasChildren[1]); o.cells(0, String(kids), { ...L.children, align: 'right' }); }
    else issues.error('Children', `Policyowner: number of children "${owner.children}" is not a number.`);

    // Nominees: slot 1 on page 1, slots 2–4 on page 2
    const nominees = (c.nominees || []).filter(n => !isBlank(n.fullName) || !isBlank(n.idNo));
    if (!nominees.length) issues.error('Nominees', 'No nominee entered.');
    if (nominees.length > 4) issues.error('Nominees', 'Only 4 nominees fit on this form — nominees 5+ were not filled.');
    let total = 0;
    nominees.slice(0, 4).forEach((n, i) => {
      const B = L.nominees[i], label = `Nominee ${i + 1}`;
      checkPerson(n, label, issues);
      putName(B.name, n.fullName, label);
      putId(B, n, label);
      putChoiceOrOther(n.nationality, B.nationality, B.nationalityOther, label, 'Nationality');
      const ri = RELATIONSHIPS.indexOf(n.relationship);
      if (ri < 0) issues.error(`${label} relationship`, `${label}: relationship not selected.`);
      else {
        tick(B.relationship[ri]);
        if (n.relationship === 'Others') {
          if (isBlank(n.relationshipOther)) issues.error(`${label} relationship`, `${label}: "Others" ticked but relationship not stated.`);
          else o.text(B.relationshipOther.p, up(n.relationshipOther), { ...B.relationshipOther, size: 7 });
        }
      }
      const share = Number(n.share);
      if (isBlank(n.share) || !isFinite(share) || share <= 0 || share > 100) issues.error(`${label} share`, `${label}: % of share "${n.share ?? ''}" is not valid — left blank.`);
      else {
        const [int, dec] = share.toFixed(2).split('.');
        o.cells(B.shareInt.p, int, { ...B.shareInt, align: 'right' }, 8);
        o.cells(B.shareDec.p, dec, B.shareDec, 8);
        total += share;
      }
      putAddress(B, n.addressSameAsOwner ? owner?.address : n.address, label);
    });
    if (nominees.length && Math.abs(total - 100) > 0.001) issues.error('% of Share', `Nominee shares add up to ${+total.toFixed(2)}%, not 100%.`);

    // Trust-policy reminders (from the form's own Important Notice 2 and 4)
    const trustRel = nominees.some(n => TRUST_RELATIONS.includes(n.relationship));
    if (owner?.muslim === 'No' && trustRel && !c.trusteeOption)
      issues.warn('Trustee', 'Non-Muslim policyowner nominating spouse/child/parent → this becomes a trust policy. Notice 2 says a trustee should be appointed (Part 2).');
    if (owner?.muslim === 'Yes' && c.trusteeOption && c.trusteeOption !== '4')
      issues.warn('Trustee', 'Policyowner is Muslim — Notice 4 says a trustee should NOT be appointed. Please check Part 2.');

    // Part 2: trustees (page 4)
    if (c.trusteeOption) {
      tick(L.part2[+c.trusteeOption - 1]);
      const trustees = (c.trustees || []).filter(t => !isBlank(t.fullName) || !isBlank(t.idNo));
      if (c.trusteeOption !== '4' && !trustees.length) issues.error('Trustees', 'Part 2 ticked but no trustee entered.');
      if (trustees.length > 2) issues.error('Trustees', 'Only 2 trustees fit on this form.');
      trustees.slice(0, 2).forEach((t, i) => {
        const B = L.trustees[i], label = `Trustee ${i + 1}`;
        checkPerson(t, label, issues);
        if (owner && digits(t.idNo) && digits(t.idNo) === digits(owner.idNo)) issues.error(label, `${label}: the policyowner cannot appoint themself as trustee.`);
        putName(B.name, t.fullName, label);
        putId(B, t, label);
        putChoiceOrOther(t.nationality, B.nationality, B.nationalityOther, label, 'Nationality');
        putChoiceOrOther(t.countryOfBirth, B.countryOfBirth, B.countryOfBirthOther, label, 'Country of birth');
        const tel = digits(t.phone);
        if (!tel) issues.error(`${label} tel`, `${label}: telephone number missing.`);
        else cells(tel, B.tel, `${label} tel`);
        cells(up(t.phoneCountry || 'Malaysia'), B.telCountry, `${label} tel country`);
        const pi = PHONE_TYPES.indexOf(t.phoneType);
        if (pi >= 0) tick(B.telType[pi]); else issues.warn(`${label} tel`, `${label}: phone type (House/Handphone/Office) not selected.`);
        putAddress(B, t.addressSameAsOwner ? owner?.address : t.address, label);
        o.text(3, up(t.fullName), { ...L.sign.trusteeName[i], size: 7 });
      });
    }

    // Signature blocks: names, witness (agent name + agent ID), date. Signatures themselves stay blank.
    const pages = c.trusteeOption ? [0, 1] : [0]; // page 3 always; page 4 only with trustees
    for (const i of pages) {
      if (!isBlank(owner?.fullName)) o.text(L.sign.ownerName[i].p, up(owner.fullName), { ...L.sign.ownerName[i], size: 7 });
      if (!isBlank(agent.name)) o.text(L.sign.witnessName[i].p, up(agent.name), { ...L.sign.witnessName[i], size: 7 });
      if (!isBlank(agent.iac)) o.text(L.sign.iac[i].p, up(agent.iac), { ...L.sign.iac[i], size: 9 });
    }
    if (isBlank(agent.name)) issues.warn('Witness', 'Witness name missing — left blank.');
    if (isBlank(agent.iac)) issues.warn('Witness', 'Witness Agent ID missing — left blank.');
    if (!isBlank(data.case.signDate)) {
      putDate(data.case.signDate, L.sign.date3, 'Signing date');
      if (c.trusteeOption) putDate(data.case.signDate, L.sign.date4, 'Signing date');
    }

    issues.info('Part 3', 'Part 3 (consent of existing nominees/trustees, page 5) is not auto-filled — only needed when revoking a trust nomination. Fill by hand if required.');
  },
};
