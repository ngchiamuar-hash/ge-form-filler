// Validation shared by every form for a person record (client, nominee, trustee).
import { isBlank, parseDate, nricInfo } from './util.js';

function checkPerson(p, role, issues, { needDob = true, needGender = true } = {}) {
  if (!p) { issues.error(role, `${role}: no details entered.`); return; }
  if (isBlank(p.fullName)) issues.error(`${role} name`, `${role}: full name is missing.`);
  if (isBlank(p.idNo)) issues.error(`${role} ID`, `${role}: NRIC/Passport number is missing.`);
  else if ((p.idType || 'NRIC') === 'NRIC') {
    const n = nricInfo(p.idNo);
    if (!n) issues.error(`${role} NRIC`, `${role}: NRIC "${p.idNo}" is not 12 digits — left blank.`);
    else {
      const dob = parseDate(p.dob);
      if (dob && (dob.d !== n.dd || dob.m !== n.mm || dob.y.slice(2) !== n.yy))
        issues.warn(`${role} DOB`, `${role}: date of birth ${dob.d}/${dob.m}/${dob.y} does not match NRIC (${n.dd}/${n.mm}/..${n.yy}). Please check.`);
      if (p.gender && p.gender !== n.gender)
        issues.warn(`${role} gender`, `${role}: gender "${p.gender}" does not match NRIC last digit (suggests ${n.gender === 'M' ? 'Male' : 'Female'}). Please check.`);
    }
  }
  if (needDob) {
    if (isBlank(p.dob)) issues.error(`${role} DOB`, `${role}: date of birth is missing.`);
    else if (!parseDate(p.dob)) issues.error(`${role} DOB`, `${role}: date of birth "${p.dob}" is not a valid date — left blank.`);
  }
  if (needGender && isBlank(p.gender)) issues.error(`${role} gender`, `${role}: gender not selected.`);
}

export { checkPerson };
