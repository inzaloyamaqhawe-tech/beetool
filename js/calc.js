/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   calc.js — the scoring engine (Amended Codes of Good Practice, indicative)
   ========================================================================== */

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function pointsFor(actualPct, targetPct, weight) {
  if (!targetPct) return 0;
  const p = (actualPct / targetPct) * weight;
  return Math.max(0, Math.min(weight, p));
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/* ---------------------------- Entity classification --------------------------- */

/* Setup & Classification: which scorecard applies, based on annual revenue. */
function classification(sc) {
  const suggested = classifySizeByRevenue(sc.general.revenue);
  return { suggested: suggested, current: sc.size, matches: !suggested || suggested === sc.size };
}

/* ------------------------------- Ownership -------------------------------- */

/* Effective % black / black-female shareholding — read straight from the
   percentage fields, or computed (flow-through) from an individual shareholder
   register when one is captured. Kept in sync on every calculation so every
   other screen (Dashboard, Scenarios, Insights, EME check) sees the same figure. */
function syncShareholderRoster(sc) {
  const o = sc.ownership;
  if (!o.useShareholderRoster || !o.shareholders || !o.shareholders.length) return;
  const total = o.shareholders.reduce(function (s, h) { return s + (Number(h.shareholdingPct) || 0); }, 0) || 100;
  const sumWhere = function (pred) {
    return o.shareholders.filter(pred).reduce(function (s, h) { return s + (Number(h.shareholdingPct) || 0); }, 0);
  };
  const black = sumWhere(function (h) { return h.race !== 'White'; });
  const blackFemale = sumWhere(function (h) { return h.race !== 'White' && h.gender === 'Female'; });
  const designated = sumWhere(function (h) { return !!h.designatedGroup; });
  const newEntrants = sumWhere(function (h) { return !!h.newEntrant; });
  // Flow-through: voting rights and economic interest are assumed equal to
  // shareholding % (single share class, no separate voting-rights agreement).
  o.votingBlackPct = round2(pct(black, total));
  o.votingBlackFemalePct = round2(pct(blackFemale, total));
  o.economicBlackPct = round2(pct(black, total));
  o.economicBlackFemalePct = round2(pct(blackFemale, total));
  o.designatedGroupsPct = round2(pct(designated, total));
  o.newEntrantsPct = round2(pct(newEntrants, total));
}

function calcOwnership(sc) {
  syncShareholderRoster(sc);
  const t = sc.targets.ownership, o = sc.ownership, w = pointWeightsFor(sc).ownership;
  const rows = [
    { key: 'votingBlack', label: 'Voting rights — black people', actualPct: o.votingBlackPct, targetPct: t.votingBlackPct, max: w.votingBlack },
    { key: 'votingBlackFemale', label: 'Voting rights — black women', actualPct: o.votingBlackFemalePct, targetPct: t.votingBlackFemalePct, max: w.votingBlackFemale },
    { key: 'economicBlack', label: 'Economic interest — black people', actualPct: o.economicBlackPct, targetPct: t.economicBlackPct, max: w.economicBlack },
    { key: 'economicBlackFemale', label: 'Economic interest — black women', actualPct: o.economicBlackFemalePct, targetPct: t.economicBlackFemalePct, max: w.economicBlackFemale },
    { key: 'designatedGroups', label: 'Black designated groups & participants', actualPct: o.designatedGroupsPct, targetPct: t.designatedGroupsPct, max: w.designatedGroups },
    { key: 'newEntrants', label: 'Black new entrants', actualPct: o.newEntrantsPct, targetPct: t.newEntrantsPct, max: w.newEntrants },
    { key: 'netValue', label: 'Net value (realisation points)', actualPct: o.netValuePct, targetPct: t.netValuePct, max: w.netValue }
  ].map(function (r) {
    r.points = round2(pointsFor(r.actualPct, r.targetPct, r.max));
    return r;
  });
  const total = round2(rows.reduce(function (s, r) { return s + r.points; }, 0));
  return { rows: rows, total: total, base: weightsFor(sc).ownership.base, bonus: 0 };
}

/* Simplified EME pathway: an Exempted Micro Enterprise doesn't need to complete
   the full 5-element scorecard — its level follows directly from Black
   ownership %, confirmed by sworn affidavit. Shown for comparison; it never
   replaces the full scorecard (an EME may use the full scorecard instead if
   that produces a better result). */
function calcEME(sc) {
  syncShareholderRoster(sc);
  const blackPct = round2(sc.ownership.economicBlackPct);
  let level;
  if (blackPct >= 100) level = 1;
  else if (blackPct >= 51) level = 2;
  else level = 4;
  const info = LEVEL_TABLE.find(function (l) { return l.level === level; });
  return { blackPct: blackPct, level: level, levelInfo: info };
}

/* ---------------------------- Management Control --------------------------- */

const MGMT_LEVEL_META = [
  { key: 'director', label: 'Directors' },
  { key: 'executive', label: 'Executive Management' },
  { key: 'senior', label: 'Senior Management' },
  { key: 'middle', label: 'Middle Management' },
  { key: 'junior', label: 'Junior Management' }
];

function calcManagement(sc) {
  const t = sc.targets.management, w = pointWeightsFor(sc).management;
  const people = sc.people || [];
  const rows = MGMT_LEVEL_META.map(function (lvl) {
    const atLevel = people.filter(function (p) { return p.level === lvl.key; });
    const total = atLevel.length;
    const black = atLevel.filter(function (p) { return p.race !== 'White'; }).length;
    const blackFemale = atLevel.filter(function (p) { return p.race !== 'White' && p.gender === 'Female'; }).length;
    const blackPct = pct(black, total);
    const blackFemalePct = pct(blackFemale, total);
    const wLvl = w[lvl.key];
    const blackPts = total ? round2(pointsFor(blackPct, t.blackTargetPct, wLvl.black)) : 0;
    const femalePts = total ? round2(pointsFor(blackFemalePct, t.blackFemaleTargetPct, wLvl.female)) : 0;
    return {
      key: lvl.key, label: lvl.label, total: total, black: black, blackFemale: blackFemale,
      blackPct: blackPct, blackFemalePct: blackFemalePct,
      maxBlack: wLvl.black, maxFemale: wLvl.female,
      points: round2(blackPts + femalePts)
    };
  });

  const allWorkforce = people; // includes skilled/semi/unskilled too, for disability target
  const disabledCount = allWorkforce.filter(function (p) { return p.disabled; }).length;
  const disabledPct = pct(disabledCount, allWorkforce.length);
  const disabilityPoints = allWorkforce.length ? round2(pointsFor(disabledPct, t.disabilityTargetPct, w.disability)) : 0;

  const total = round2(rows.reduce(function (s, r) { return s + r.points; }, 0) + disabilityPoints);
  return { rows: rows, disabledCount: disabledCount, disabledPct: round2(disabledPct), disabilityPoints: disabilityPoints, total: total, base: weightsFor(sc).management.base, bonus: 0 };
}

/* ----------------------------- Skills Development --------------------------- */

function calcSkills(sc) {
  const t = sc.targets.skills, w = pointWeightsFor(sc).skills, s = sc.skills;
  const leviable = sc.general.leviableAmount;
  const rows = [
    { label: 'Expenditure on learning programmes for black people', actualAmount: s.expBlack, actualPct: pct(s.expBlack, leviable), targetPct: t.expBlackPct, max: w.expBlack },
    { label: 'Expenditure on bursaries for black students', actualAmount: s.expBursaries, actualPct: pct(s.expBursaries, leviable), targetPct: t.expBursariesPct, max: w.expBursaries },
    { label: 'Expenditure on learning programmes for disabled black employees', actualAmount: s.expDisabled, actualPct: pct(s.expDisabled, leviable), targetPct: t.expDisabledPct, max: w.expDisabled },
    { label: 'Black people in learnerships, apprenticeships & internships', actualAmount: s.learnersBlack, actualPct: pct(s.learnersBlack, s.totalEmployees), targetPct: t.learnershipPct, max: w.learnership }
  ].map(function (r) { r.points = round2(pointsFor(r.actualPct, r.targetPct, r.max)); return r; });

  const baseTotal = round2(rows.reduce(function (sum, r) { return sum + r.points; }, 0));

  const absorptionPct = pct(s.absorbedBlack, s.eligibleForAbsorption);
  const bonusPoints = round2(pointsFor(absorptionPct, t.absorptionPct, w.absorption));
  const bonusRow = { label: 'Bonus: absorption of black people after learnerships', actualAmount: s.absorbedBlack, actualPct: absorptionPct, targetPct: t.absorptionPct, max: w.absorption, points: bonusPoints };

  // Without a submitted Workplace Skills Plan & Annual Training Report, none of
  // this element's spend is recognised — the codes require WSP/ATR proof.
  const gated = !s.wspAtrSubmitted;
  const finalRows = gated ? rows.map(function (r) { return Object.assign({}, r, { points: 0 }); }) : rows;
  const finalBonusRow = gated ? Object.assign({}, bonusRow, { points: 0 }) : bonusRow;
  const finalBaseTotal = gated ? 0 : baseTotal;
  const finalBonusPoints = gated ? 0 : bonusPoints;

  return {
    rows: finalRows, bonusRow: finalBonusRow, total: round2(finalBaseTotal + finalBonusPoints),
    base: weightsFor(sc).skills.base, bonus: weightsFor(sc).skills.bonus,
    baseTotal: finalBaseTotal, bonusTotal: finalBonusPoints,
    gated: gated,
    // unweighted figures used by the priority-element sub-minimum check, regardless of gating status
    rawExpenditurePoints: round2(rows.slice(0, 3).reduce(function (s, r) { return s + r.points; }, 0)),
    rawExpenditureMax: round2(rows.slice(0, 3).reduce(function (s, r) { return s + r.max; }, 0))
  };
}

/* -------------------------- Enterprise & Supplier Dev ------------------------ */

/* A supplier whose B-BBEE certificate has expired can't be recognised at its
   claimed level — the DTI codes require a valid certificate at the measurement
   date, so an expired one is treated as Non-compliant (0% recognition) here. */
function isCertExpired(supplier) {
  if (!supplier.certExpiry) return false;
  const exp = new Date(supplier.certExpiry + 'T23:59:59');
  if (isNaN(exp)) return false;
  return exp.getTime() < Date.now();
}
function isCertExpiringSoon(supplier, withinDays) {
  if (!supplier.certExpiry || isCertExpired(supplier)) return false;
  const exp = new Date(supplier.certExpiry + 'T23:59:59');
  if (isNaN(exp)) return false;
  const days = (exp.getTime() - Date.now()) / 86400000;
  return days >= 0 && days <= (withinDays || 90);
}

function recognisedSpend(supplier) {
  if (isCertExpired(supplier)) return 0;
  const mult = LEVEL_RECOGNITION_MULTIPLIER.hasOwnProperty(supplier.beeLevel) ? LEVEL_RECOGNITION_MULTIPLIER[supplier.beeLevel] : 0;
  return (supplier.spend || 0) * mult;
}

function calcTMPS(esd) {
  const inclusions = (esd.inclusions || []).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
  const exclusions = (esd.exclusions || []).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
  return Math.max(0, inclusions - exclusions);
}

function calcESD(sc) {
  const t = sc.targets.esd, w = pointWeightsFor(sc).esd, esd = sc.esd, npat = sc.general.npat;
  const tmps = calcTMPS(esd);
  const suppliers = esd.suppliers || [];

  const allRecognised = suppliers.reduce(function (s, sup) { return s + recognisedSpend(sup); }, 0);
  const qseRecognised = suppliers.filter(function (sup) { return sup.size === 'QSE'; }).reduce(function (s, sup) { return s + recognisedSpend(sup); }, 0);
  const emeRecognised = suppliers.filter(function (sup) { return sup.size === 'EME'; }).reduce(function (s, sup) { return s + recognisedSpend(sup); }, 0);
  const blackOwnedRecognised = suppliers.filter(function (sup) { return (sup.blackOwnedPct || 0) >= 51; }).reduce(function (s, sup) { return s + recognisedSpend(sup); }, 0);
  const blackFemaleOwnedRecognised = suppliers.filter(function (sup) { return (sup.blackFemaleOwnedPct || 0) >= 30; }).reduce(function (s, sup) { return s + recognisedSpend(sup); }, 0);

  const procRows = [
    { label: 'Spend on empowering suppliers', amount: allRecognised, actualPct: pct(allRecognised, tmps), targetPct: t.allSuppliersPct, max: w.allSuppliers },
    { label: 'Spend on QSE empowering suppliers', amount: qseRecognised, actualPct: pct(qseRecognised, tmps), targetPct: t.qsePct, max: w.qse },
    { label: 'Spend on EME suppliers', amount: emeRecognised, actualPct: pct(emeRecognised, tmps), targetPct: t.emePct, max: w.eme },
    { label: 'Spend on suppliers ≥51% black owned', amount: blackOwnedRecognised, actualPct: pct(blackOwnedRecognised, tmps), targetPct: t.blackOwnedPct, max: w.blackOwned },
    { label: 'Spend on suppliers ≥30% black women owned', amount: blackFemaleOwnedRecognised, actualPct: pct(blackFemaleOwnedRecognised, tmps), targetPct: t.blackFemaleOwnedPct, max: w.blackFemaleOwned }
  ].map(function (r) { r.points = round2(pointsFor(r.actualPct, r.targetPct, r.max)); return r; });

  const sdActualPct = pct(esd.sdContributions, npat);
  const sdRow = { label: 'Annual value of Supplier Development contributions', amount: esd.sdContributions, actualPct: sdActualPct, targetPct: t.sdContribPct, max: w.sdContrib, points: round2(pointsFor(sdActualPct, t.sdContribPct, w.sdContrib)) };

  const edActualPct = pct(esd.edContributions, npat);
  const edRow = { label: 'Annual value of Enterprise Development contributions', amount: esd.edContributions, actualPct: edActualPct, targetPct: t.edContribPct, max: w.edContrib, points: round2(pointsFor(edActualPct, t.edContribPct, w.edContrib)) };

  const baseTotal = round2(procRows.reduce(function (s, r) { return s + r.points; }, 0) + sdRow.points + edRow.points);

  const designatedActualPct = pct(blackOwnedRecognised, tmps);
  const designatedPts = round2(pointsFor(designatedActualPct, t.designatedGroupPct, w.designatedGroup));
  const graduationPts = esd.graduation ? w.graduation : 0;
  const jobsPts = esd.jobsCreated ? w.jobsCreated : 0;
  const bonusRows = [
    { label: 'Spend on designated-group suppliers ≥51% black owned', actualPct: designatedActualPct, targetPct: t.designatedGroupPct, max: w.designatedGroup, points: designatedPts },
    { label: 'Graduation of ED beneficiaries to SD level', bool: true, achieved: esd.graduation, max: w.graduation, points: graduationPts },
    { label: 'Jobs created from ED & SD initiatives', bool: true, achieved: esd.jobsCreated, max: w.jobsCreated, points: jobsPts }
  ];
  const bonusTotal = round2(designatedPts + graduationPts + jobsPts);

  const expiredCount = suppliers.filter(isCertExpired).length;
  const expiringSoonCount = suppliers.filter(function (s) { return isCertExpiringSoon(s, 90); }).length;

  return {
    tmps: tmps, procRows: procRows, sdRow: sdRow, edRow: edRow, bonusRows: bonusRows,
    total: round2(baseTotal + bonusTotal), base: weightsFor(sc).esd.base, bonus: weightsFor(sc).esd.bonus,
    baseTotal: baseTotal, bonusTotal: bonusTotal,
    allRecognised: allRecognised, expiredCount: expiredCount, expiringSoonCount: expiringSoonCount
  };
}

/* --------------------------- Socio-Economic Development ---------------------- */

function calcSED(sc) {
  const t = sc.targets.sed, w = pointWeightsFor(sc).sed;
  const amount = (sc.sed.beneficiaries || []).reduce(function (s, b) { return s + (Number(b.spend) || 0); }, 0);
  const actualPct = pct(amount, sc.general.npat);
  const blackBeneficiariesPct = sc.sed.blackBeneficiariesPct == null ? 100 : sc.sed.blackBeneficiariesPct;
  // Contributions only count if at least 75% of beneficiaries are Black South Africans.
  const meetsBeneficiaryTest = blackBeneficiariesPct >= SED_BLACK_BENEFICIARY_THRESHOLD;
  const points = meetsBeneficiaryTest ? round2(pointsFor(actualPct, t.contribPct, w.contrib)) : 0;
  // NOTE: .total mirrors every other element's convention (points achieved), so calcAll()
  // can sum e.data.total uniformly. The raw Rand amount contributed is exposed as .amount.
  return {
    amount: amount, actualPct: actualPct, targetPct: t.contribPct, max: w.contrib, points: points, total: points,
    base: weightsFor(sc).sed.base, bonus: 0,
    blackBeneficiariesPct: blackBeneficiariesPct, meetsBeneficiaryTest: meetsBeneficiaryTest
  };
}

/* --------------------------------- Y.E.S ------------------------------------- */

function calcYES(sc) {
  const y = sc.yes;
  const targetPct = 2.5; // simplified DTI-aligned target: YES participants as % of headcount
  const actualPct = pct(y.participants, y.headcount);
  const prereqsMet = !!(y.registered);
  const thresholdMet = y.maintainedLevel || actualPct >= targetPct;
  return { actualPct: round2(actualPct), targetPct: targetPct, prereqsMet: prereqsMet, thresholdMet: thresholdMet, qualifies: prereqsMet && thresholdMet };
}

/* --------------------------- Priority elements & discounting ------------------ */

/* Ownership, Skills Development and Enterprise & Supplier Development are the
   three "priority elements". Each carries specific sub-minimum requirements —
   achieve at least 40% of the applicable target, or the whole scorecard's
   contributor level is automatically discounted by one level, no matter how
   many points were scored elsewhere. */
function calcPriorityElements(sc, ownership, skills, esd) {
  const items = [];

  const nv = ownership.rows.find(function (r) { return r.key === 'netValue'; });
  items.push({ label: 'Ownership — Net Value', achieved: nv.points, subMin: round2(nv.max * SUB_MINIMUM_FACTOR), max: nv.max });

  items.push({
    label: 'Skills Development — Expenditure (learning programmes, bursaries, disabled)',
    achieved: skills.rawExpenditurePoints, subMin: round2(skills.rawExpenditureMax * SUB_MINIMUM_FACTOR), max: skills.rawExpenditureMax
  });

  const procMax = round2(esd.procRows.reduce(function (s, r) { return s + r.max; }, 0));
  const procPts = round2(esd.procRows.reduce(function (s, r) { return s + r.points; }, 0));
  items.push({ label: 'Preferential Procurement', achieved: procPts, subMin: round2(procMax * SUB_MINIMUM_FACTOR), max: procMax });
  items.push({ label: 'Supplier Development', achieved: esd.sdRow.points, subMin: round2(esd.sdRow.max * SUB_MINIMUM_FACTOR), max: esd.sdRow.max });
  items.push({ label: 'Enterprise Development', achieved: esd.edRow.points, subMin: round2(esd.edRow.max * SUB_MINIMUM_FACTOR), max: esd.edRow.max });

  items.forEach(function (it) { it.pass = it.achieved >= it.subMin - 0.005; });
  return { items: items, anyFail: items.some(function (it) { return !it.pass; }) };
}

function levelLookup(totalActual) {
  let levelInfo = LEVEL_TABLE[LEVEL_TABLE.length - 1];
  for (let i = 0; i < LEVEL_TABLE.length; i++) {
    if (totalActual >= LEVEL_TABLE[i].min) { levelInfo = LEVEL_TABLE[i]; break; }
  }
  return levelInfo;
}

function oneWorseLevel(levelInfo) {
  const idx = LEVEL_TABLE.findIndex(function (l) { return l.level === levelInfo.level; });
  return LEVEL_TABLE[Math.min(LEVEL_TABLE.length - 1, idx + 1)];
}

/* ------------------------------ Overall summary ------------------------------ */

function calcAll(sc) {
  const ownership = calcOwnership(sc);
  const management = calcManagement(sc);
  const skills = calcSkills(sc);
  const esd = calcESD(sc);
  const sed = calcSED(sc);
  const yes = calcYES(sc);

  const elements = [
    { key: 'ownership', label: 'Ownership', short: 'Own', data: ownership },
    { key: 'management', label: 'Management Control', short: 'Man', data: management },
    { key: 'skills', label: 'Skills Development', short: 'SD', data: skills },
    { key: 'esd', label: 'Enterprise & Supplier Development', short: 'ESD', data: esd },
    { key: 'sed', label: 'Socio-Economic Development', short: 'SED', data: sed }
  ];

  const totalActual = round2(elements.reduce(function (s, e) { return s + e.data.total; }, 0));
  const totalBaseMax = elements.reduce(function (s, e) { return s + e.data.base; }, 0);
  const totalMaxWithBonus = elements.reduce(function (s, e) { return s + e.data.base + e.data.bonus; }, 0);

  const scoreLevel = levelLookup(totalActual);

  const priority = calcPriorityElements(sc, ownership, skills, esd);
  const level = (priority.anyFail && sc.size !== 'EME') ? oneWorseLevel(scoreLevel) : scoreLevel;
  const discounted = level.level !== scoreLevel.level;

  let pointsToNextLevel = 0, nextLevelLabel = '';
  const idx = LEVEL_TABLE.findIndex(function (l) { return l.level === scoreLevel.level; });
  if (idx > 0) {
    const next = LEVEL_TABLE[idx - 1];
    pointsToNextLevel = round2(next.min - totalActual);
    nextLevelLabel = next.label;
  }

  const eme = calcEME(sc);
  const cls = classification(sc);

  return {
    elements: elements, ownership: ownership, management: management, skills: skills, esd: esd, sed: sed, yes: yes,
    totalActual: totalActual, totalBaseMax: totalBaseMax, totalMaxWithBonus: totalMaxWithBonus,
    scoreLevel: scoreLevel, level: level, discounted: discounted, priority: priority,
    pointsToNextLevel: pointsToNextLevel, nextLevelLabel: nextLevelLabel,
    eme: eme, classification: cls
  };
}

/* -------------------------------- Audit readiness ------------------------------ */

function auditChecklist(sc) {
  const summary = calcAll(sc);
  const checks = [
    { label: 'Annual revenue captured', ok: sc.general.revenue > 0, tab: 'general' },
    { label: 'Net profit after tax captured', ok: !!sc.general.npat, tab: 'general' },
    { label: 'Leviable amount / payroll captured', ok: sc.general.leviableAmount > 0, tab: 'general' },
    { label: 'Ownership: shareholding or % captured', ok: (sc.ownership.useShareholderRoster && sc.ownership.shareholders.length > 0) || sc.ownership.economicBlackPct > 0, tab: 'ownership' },
    { label: 'Management: workforce roster captured', ok: sc.people.length > 0, tab: 'management' },
    { label: 'Skills: WSP & ATR submission confirmed', ok: !!sc.skills.wspAtrSubmitted, tab: 'skills' },
    { label: 'ESD: suppliers captured', ok: sc.esd.suppliers.length > 0, tab: 'esd' },
    { label: 'ESD: no expired supplier certificates', ok: summary.esd.expiredCount === 0, tab: 'esd' },
    { label: 'SED: beneficiaries captured', ok: sc.sed.beneficiaries.length > 0, tab: 'sed' },
    { label: 'SED: beneficiary Black representation ≥ 75%', ok: summary.sed.meetsBeneficiaryTest, tab: 'sed' },
    { label: 'Priority element sub-minimums met (no discounting)', ok: !summary.discounted, tab: 'insights' }
  ];
  return { checks: checks, readyCount: checks.filter(function (c) { return c.ok; }).length, total: checks.length };
}

/* ------------------------------ Pay fairness (peer signal) ---------------------
   Important: the B-BBEE Codes of Good Practice score elements (ownership,
   management control, skills spend, etc.) — they do not certify or prescribe
   an individual's "fair" wage. There is no official B-BBEE/DoL wage table this
   can compare against. This is a transparent, editable MANAGEMENT signal only:
   it takes what was captured against each person (Management Control's
   "Training Spend" — money paid directly to them), and flags anyone whose
   figure sits materially outside the average for peers at the same occupational
   level on THIS roster. It is a prompt to go look, not a compliance verdict. */
const PAY_FAIRNESS_BAND_PCT = 20; /* +/- band still considered "in line with peers" */

function calcPayFairness(sc) {
  const byLevel = {};
  (sc.people || []).forEach(function (p) {
    const lvl = p.level || 'unspecified';
    (byLevel[lvl] = byLevel[lvl] || []).push(p);
  });
  const out = {};
  Object.keys(byLevel).forEach(function (lvl) {
    const group = byLevel[lvl];
    const paid = group.filter(function (p) { return (Number(p.trainingSpend) || 0) > 0; });
    const avg = paid.length ? round2(paid.reduce(function (s, p) { return s + (Number(p.trainingSpend) || 0); }, 0) / paid.length) : 0;
    group.forEach(function (p) {
      const val = Number(p.trainingSpend) || 0;
      if (val === 0) { out[p.id] = { rating: 'No spend recorded', avg: avg, deltaPct: null, peers: paid.length }; return; }
      if (paid.length < 2) { out[p.id] = { rating: 'Not enough peer data', avg: avg, deltaPct: null, peers: paid.length }; return; }
      const deltaPct = round2(((val - avg) / avg) * 100);
      let rating;
      if (deltaPct <= -PAY_FAIRNESS_BAND_PCT) rating = 'Underpaid vs peers';
      else if (deltaPct >= PAY_FAIRNESS_BAND_PCT) rating = 'Overpaid vs peers';
      else rating = 'Fair — in line with peers';
      out[p.id] = { rating: rating, avg: avg, deltaPct: deltaPct, peers: paid.length };
    });
  });
  return out;
}

/* --------------------------------- Formatting --------------------------------- */

function fmtR(n) {
  n = Number(n) || 0;
  return 'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) { return (Number(n) || 0).toFixed(2) + '%'; }
function fmtPts(n) { return (Number(n) || 0).toFixed(2); }
