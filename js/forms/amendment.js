// Request for Amendment — NBZ-FRQAM-V08-082025a (flat PDF, 1 page). Positions measured from the V08 file.
import { up, isBlank, parseDate, addressLines, digits } from '../util.js';

const CW = 14.37;
const P = 0;
const L = {
  proposalNo: { x: 83.3, y: 750.8, h: 15.6, cw: CW, n: 10 },
  policyNo: { x: 410.2, y: 750.8, h: 15.6, cw: CW, n: 10 },
  laName: { x: 137, y: 720.5, maxW: 418 },
  proposerName: { x: 221, y: 703, maxW: 334 },
  mode: { Yearly: 162.5, 'Half-Yearly': 238.1, Quarterly: 326.0, Monthly: 410.4, y: 655.5, s: 10.7 },
  method: { 'Credit Card': 162.5, GIRO: 238.4, "Banker's Order": 326.0, Cheque: 410.4, Cash: 475.8, y: 624.9, s: 10.7 },
  premThousands: { x: 182.3, y: 588.4, h: 17, cw: CW, n: 3 },
  premUnits: { x: 232.7, y: 588.4, h: 17, cw: CW, n: 3 },
  premCents: { x: 283.1, y: 588.4, h: 17, cw: CW, n: 2 },
  commDay: { x: 182.3, y: 554.4, h: 17, cw: CW, n: 2 },
  commMonth: { x: 225.5, y: 554.4, h: 17, cw: CW, n: 2 },
  commYear: { x: 268.7, y: 554.4, h: 17, cw: CW, n: 4 },
  addrType: { Residential: 163.7, Mailing: 295.4, y: 525.6, s: 10.7 },
  addrRows: [505.2, 490.3, 475.2].map(y => ({ x: 202.2, y, h: 15.2, cw: 13.82, n: 25 })),
  postcode: { x: 202.2, y: 460.0, h: 15.3, cw: 13.82, n: 5 },
  town: { x: 299.0, y: 460.0, h: 15.3, cw: 13.82, n: 18 },
  country: { x: 202.2, y: 445.0, h: 15.3, cw: 13.82, n: 25 },
  other: { x: 166, ys: [398.6, 379.8, 361.2], maxW: 388 },
  signDay: { x: 227.2, y: 190.4, h: 17.2, cw: CW, n: 2 },
  signMonth: { x: 270.4, y: 190.4, h: 17.2, cw: CW, n: 2 },
  signYear: { x: 313.6, y: 190.4, h: 17.2, cw: CW, n: 4 },
  witnessName: { x: 381, y: 83, maxW: 152 },
  witnessNric: { x: 381, y: 65.5, maxW: 152 },
};

export default {
  id: 'amendment',
  title: 'Request for Amendment',
  code: 'NBZ-FRQAM-V08',
  file: 'New Business/Other Forms/Request for Amendment (ENG) - NBZ-FRQAM-V08-082025a.pdf',
  kind: 'flat',

  fill({ o, data, issues }) {
    const { policy, la, proposer, agent } = data;
    const c = data.case.amendment || {};
    const cells = (text, box, field) => { if (!o.cells(P, text, box)) issues.error(field, `${field}: "${text}" is too long for the boxes — left blank.`); };

    if (isBlank(policy.proposalNo) && isBlank(policy.policyNo)) issues.error('Proposal/Policy No', 'Neither Proposal No. nor Policy No. entered.');
    cells(policy.proposalNo, L.proposalNo, 'Proposal No');
    cells(policy.policyNo, L.policyNo, 'Policy No');

    if (isBlank(la?.fullName)) issues.error('Life Assured name', 'Name of Life to be Assured is missing.');
    else if (!o.text(P, up(la.fullName), L.laName)) issues.error('Life Assured name', 'Name too long for the line — left blank.');
    if (proposer && !o.text(P, up(proposer.fullName), L.proposerName)) issues.error('Proposer name', 'Proposer name too long — left blank.');

    let changes = 0;
    if (c.mode) {
      if (L.mode[c.mode] === undefined) issues.error('Mode', `Unknown payment mode "${c.mode}".`);
      else { o.tick(P, { x: L.mode[c.mode], y: L.mode.y, s: L.mode.s }); changes++; }
      if (c.mode === 'Monthly' && c.method && !['Credit Card', 'GIRO', "Banker's Order"].includes(c.method))
        issues.warn('Mode', 'Monthly mode is only allowed with Credit Card, GIRO or Banker\'s Order (form note).');
    }
    if (c.method) {
      if (L.method[c.method] === undefined) issues.error('Method', `Unknown payment method "${c.method}".`);
      else { o.tick(P, { x: L.method[c.method], y: L.method.y, s: L.method.s }); changes++; }
      if (['Credit Card', 'GIRO'].includes(c.method))
        issues.info('Method', `${c.method} selected — remember the ${c.method === 'GIRO' ? 'GIRO (PSF11)' : 'Easi-Pay (PSF16)'} form as well.`);
    }
    if (!isBlank(c.premium)) {
      const v = Number(String(c.premium).replace(/[^0-9.]/g, ''));
      if (!isFinite(v) || v <= 0 || v >= 1000000) issues.error('Premium', `Premium "${c.premium}" is not a valid amount — left blank.`);
      else {
        const [int, cents] = v.toFixed(2).split('.');
        o.cells(P, int.slice(0, -3), { ...L.premThousands, align: 'right' });
        o.cells(P, int.slice(-3), { ...L.premUnits, align: 'right' });
        o.cells(P, cents, L.premCents);
        changes++;
      }
    }
    if (!isBlank(c.commencementDate)) {
      const d = parseDate(c.commencementDate);
      if (!d) issues.error('Commencement date', `"${c.commencementDate}" is not a valid date — left blank.`);
      else { o.cells(P, d.d, L.commDay); o.cells(P, d.m, L.commMonth); o.cells(P, d.y, L.commYear); changes++; }
    }
    if (c.addressChange) {
      const a = c.addressSameAsClient ? la?.address : c.address;
      if (!c.addressType) issues.error('Address type', 'Address change: tick Residential or Mailing.');
      else o.tick(P, { x: L.addrType[c.addressType], y: L.addrType.y, s: L.addrType.s });
      if (!a || isBlank(a.line1)) issues.error('New address', 'Address change ticked but no address entered.');
      else {
        const { lines, overflow } = addressLines(a, 25, 3);
        if (overflow) issues.error('New address', 'Address does not fit in 3 rows of 25 boxes — left blank. Please shorten (e.g. JLN, TMN).');
        else lines.forEach((l, i) => o.cells(P, l, L.addrRows[i]));
        if (digits(a.postcode).length !== 5) issues.warn('Postcode', `Postcode "${a.postcode || ''}" is not 5 digits.`);
        cells(digits(a.postcode), L.postcode, 'Postcode');
        cells(a.town, L.town, 'Town');
        cells(a.country || 'MALAYSIA', L.country, 'Country');
        changes++;
      }
    }
    if (!isBlank(c.otherChanges)) {
      if (!o.lines(P, c.otherChanges, L.other)) issues.error('Other changes', 'Text too long for the 3 lines — left blank. Please shorten or attach a note.');
      changes++;
    }
    if (!changes) issues.error('Changes', 'No change selected — the form would be empty.');

    if (!isBlank(data.case.signDate)) {
      const d = parseDate(data.case.signDate);
      if (d) { o.cells(P, d.d, L.signDay); o.cells(P, d.m, L.signMonth); o.cells(P, d.y, L.signYear); }
      else issues.error('Sign date', 'Signing date invalid — left blank.');
    }
    if (isBlank(agent.name)) issues.warn('Witness', 'Witness name missing — left blank.');
    o.text(P, up(agent.name), L.witnessName);
    if (agent.other) issues.info('Witness', 'Witness is another agent — write their NRIC by hand.');
    else if (isBlank(agent.nric)) issues.warn('Witness', 'Your NRIC is not set in Settings — left blank.');
    o.text(P, digits(agent.nric), L.witnessNric);
  },
};
