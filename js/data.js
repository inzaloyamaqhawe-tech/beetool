/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   data.js — constants, storage helpers, seed data
   ========================================================================== */

/* Each account gets its own fully separate blob under its own key — genuine
   isolation (its own scorecards, company profile, implementation plan,
   scenarios), not just a label. STORAGE_KEY_PREFIX + '.' + accountId is the
   per-account key; LEGACY_STORAGE_KEY is where a single-account install's
   data lived before multi-account support existed, migrated across once on
   first load into the default account (see loadState()). ACCOUNTS_INDEX_KEY
   holds the roster of accounts + which one is active + the signed-in
   session — that's shared across accounts, not duplicated inside each one's
   own blob. */
const STORAGE_KEY_PREFIX = 'centenaryBee.v1';
const LEGACY_STORAGE_KEY = 'centenaryBee.v1';
const ACCOUNTS_INDEX_KEY = 'centenaryBee.accounts';
function storageKeyFor(accountId) { return STORAGE_KEY_PREFIX + '.' + accountId; }

/* ---- Reference tables (Amended B-BBEE Codes of Good Practice, Generic) --- */

const RACES = ['African', 'Coloured', 'Indian', 'White'];
const GENDERS = ['Male', 'Female'];

const OCCUPATIONAL_LEVELS = [
  { key: 'director', label: 'Director', mgmt: true },
  { key: 'executive', label: 'Executive Management', mgmt: true },
  { key: 'senior', label: 'Senior Management', mgmt: true },
  { key: 'middle', label: 'Middle Management', mgmt: true },
  { key: 'junior', label: 'Junior Management', mgmt: true },
  { key: 'skilled', label: 'Skilled Technical', mgmt: false },
  { key: 'semiskilled', label: 'Semi-Skilled', mgmt: false },
  { key: 'unskilled', label: 'Unskilled', mgmt: false }
];

const INDUSTRIES = [
  'All industries', 'Accommodation and Food Service Activities', 'Agriculture, Forestry and Fishing',
  'Construction', 'Financial and Insurance Activities', 'ICT', 'Manufacturing', 'Mining and Quarrying',
  'Professional, Scientific and Technical Activities', 'Retail and Wholesale Trade', 'Services',
  'Transportation and Storage', 'Utilities'
];

/* Sector Charters gazetted under section 9 of the B-BBEE Act. Selecting one is
   informational/record-keeping in this tool (it does not change the underlying
   Generic-code formulas below) — a sector charter's own gazetted scorecard should
   be used for a certified rating in that sector. */
const SECTOR_CHARTERS = [
  'Generic Codes (DTI, no sector charter)', 'AgriBEE Sector Code', 'Construction Sector Code',
  'Financial Sector Code (FSC)', 'ICT Sector Code', 'Property Sector Code', 'Tourism Sector Code',
  'Transport Sector Code', 'Forestry Sector Code', 'Marketing, Advertising & Communication (MAC) Sector Code'
];

const BEE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 'Non-compliant'];

/* Entity size classification thresholds (Amended Codes, Statement 000), by
   annual total revenue. EME = Exempted Micro Enterprise, QSE = Qualifying Small
   Enterprise. Above R50m an entity measures on the full Generic Scorecard. */
const SIZE_THRESHOLDS = { emeMax: 10000000, qseMax: 50000000 };

function classifySizeByRevenue(revenue) {
  const r = Number(revenue) || 0;
  if (r <= 0) return null;
  if (r < SIZE_THRESHOLDS.emeMax) return 'EME';
  if (r <= SIZE_THRESHOLDS.qseMax) return 'QSE';
  return 'Generic';
}

const LEVEL_RECOGNITION_MULTIPLIER = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00, 5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 'Non-compliant': 0
};

/* Overall B-BBEE contributor level table */
const LEVEL_TABLE = [
  { level: 1, label: 'Level One Contributor', min: 100, qualification: '>= 100.00 points on the Generic Scorecard', recognition: 135 },
  { level: 2, label: 'Level Two Contributor', min: 95, qualification: '>= 95.00 but < 100.00 points on the Generic Scorecard', recognition: 125 },
  { level: 3, label: 'Level Three Contributor', min: 90, qualification: '>= 90.00 but < 95.00 points on the Generic Scorecard', recognition: 110 },
  { level: 4, label: 'Level Four Contributor', min: 80, qualification: '>= 80.00 but < 90.00 points on the Generic Scorecard', recognition: 100 },
  { level: 5, label: 'Level Five Contributor', min: 75, qualification: '>= 75.00 but < 80.00 points on the Generic Scorecard', recognition: 80 },
  { level: 6, label: 'Level Six Contributor', min: 70, qualification: '>= 70.00 but < 75.00 points on the Generic Scorecard', recognition: 60 },
  { level: 7, label: 'Level Seven Contributor', min: 55, qualification: '>= 55.00 but < 70.00 points on the Generic Scorecard', recognition: 50 },
  { level: 8, label: 'Level Eight Contributor', min: 40, qualification: '>= 40.00 but < 55.00 points on the Generic Scorecard', recognition: 10 },
  { level: 'Non-compliant', label: 'Non-Compliant Contributor', min: -Infinity, qualification: '< 40.00 points on the Generic Scorecard', recognition: 0 }
];

/* Element weightings (base = mandatory points, bonus = extra available on top).
   Generic Scorecard (entities measuring above R50m annual revenue). */
const WEIGHTS = {
  ownership: { base: 25, bonus: 0 },
  management: { base: 19, bonus: 0 },
  skills: { base: 20, bonus: 5 },
  esd: { base: 40, bonus: 4 },
  sed: { base: 5, bonus: 0 }
};

/* QSE Scorecard element weightings — the officially published QSE totals
   (Ownership 25 / Management Control 20 / Skills Development 25 / Enterprise &
   Supplier Development 30 / Socio-Economic Development 5 = 105 base points). */
const WEIGHTS_QSE = {
  ownership: { base: 25, bonus: 0 },
  management: { base: 20, bonus: 0 },
  skills: { base: 25, bonus: 5 },
  esd: { base: 30, bonus: 3 },
  sed: { base: 5, bonus: 0 }
};

function weightsFor(sc) { return sc.size === 'QSE' ? WEIGHTS_QSE : WEIGHTS; }

/* Default scoring targets — editable per-scorecard in Settings panels.
   Management targets default to the published National Economically Active
   Population (EAP) split (Stats SA QLFS, as used by the reference toolkit):
   African 44.0/37.3, Coloured 4.6/4.0, Indian 1.5/0.9, White 4.2/3.5 (M/F).
   Black = African + Coloured + Indian = 92.3% overall, 42.2% female. */
function defaultTargets() {
  return {
    ownership: {
      votingBlackPct: 25, votingBlackFemalePct: 10,
      economicBlackPct: 25, economicBlackFemalePct: 10,
      designatedGroupsPct: 4, newEntrantsPct: 2, netValuePct: 25
    },
    management: {
      blackTargetPct: 92.3, blackFemaleTargetPct: 42.2, disabilityTargetPct: 2
    },
    skills: {
      expBlackPct: 3.5, expBursariesPct: 2.5, expDisabledPct: 0.3,
      learnershipPct: 5, absorptionPct: 100
    },
    esd: {
      allSuppliersPct: 80, qsePct: 15, emePct: 15, blackOwnedPct: 50, blackFemaleOwnedPct: 12,
      sdContribPct: 2, edContribPct: 1, designatedGroupPct: 2
    },
    sed: { contribPct: 1 },
    eap: blankEapTargets()
  };
}

/* Point weights per sub-item, keyed to match calc.js (Generic Scorecard). */
const POINT_WEIGHTS = {
  ownership: { votingBlack: 4, votingBlackFemale: 2, economicBlack: 4, economicBlackFemale: 2, designatedGroups: 3, newEntrants: 2, netValue: 8 },
  management: {
    director: { black: 4, female: 2 },
    executive: { black: 3, female: 1 },
    senior: { black: 2, female: 1 },
    middle: { black: 2, female: 1 },
    junior: { black: 1, female: 1 },
    disability: 1
  },
  skills: { expBlack: 6, expBursaries: 4, expDisabled: 4, learnership: 6, absorption: 5 },
  esd: {
    allSuppliers: 5, qse: 3, eme: 4, blackOwned: 11, blackFemaleOwned: 2,
    sdContrib: 10, edContrib: 5, designatedGroup: 2, graduation: 1, jobsCreated: 1
  },
  sed: { contrib: 5 }
};

/* QSE sub-item weights: the same detailed line items as the Generic Scorecard,
   proportionally scaled so each element sums to its official QSE total above.
   This keeps every input/calculation identical between sizes and only changes
   how many points each answer is worth — disclosed in-app as an approximation
   where DTI does not publish an identical line-by-line QSE breakdown. */
function scaleWeightTree(node, factor) {
  if (typeof node === 'number') return Math.round(node * factor * 100) / 100;
  const out = Array.isArray(node) ? [] : {};
  for (const k in node) out[k] = scaleWeightTree(node[k], factor);
  return out;
}
const POINT_WEIGHTS_QSE = {
  ownership: POINT_WEIGHTS.ownership, // unchanged: 25 -> 25
  management: scaleWeightTree(POINT_WEIGHTS.management, WEIGHTS_QSE.management.base / WEIGHTS.management.base), // 19 -> 20
  skills: Object.assign({}, POINT_WEIGHTS.skills, (function () {
    const f = WEIGHTS_QSE.skills.base / WEIGHTS.skills.base; // 20 -> 25 (bonus/absorption stays 5)
    return { expBlack: scaleWeightTree(POINT_WEIGHTS.skills.expBlack, f), expBursaries: scaleWeightTree(POINT_WEIGHTS.skills.expBursaries, f), expDisabled: scaleWeightTree(POINT_WEIGHTS.skills.expDisabled, f), learnership: scaleWeightTree(POINT_WEIGHTS.skills.learnership, f) };
  })()),
  esd: (function () {
    const fBase = WEIGHTS_QSE.esd.base / WEIGHTS.esd.base; // 40 -> 30
    const fBonus = WEIGHTS_QSE.esd.bonus / WEIGHTS.esd.bonus; // 4 -> 3
    return {
      allSuppliers: scaleWeightTree(POINT_WEIGHTS.esd.allSuppliers, fBase), qse: scaleWeightTree(POINT_WEIGHTS.esd.qse, fBase),
      eme: scaleWeightTree(POINT_WEIGHTS.esd.eme, fBase), blackOwned: scaleWeightTree(POINT_WEIGHTS.esd.blackOwned, fBase),
      blackFemaleOwned: scaleWeightTree(POINT_WEIGHTS.esd.blackFemaleOwned, fBase),
      sdContrib: scaleWeightTree(POINT_WEIGHTS.esd.sdContrib, fBase), edContrib: scaleWeightTree(POINT_WEIGHTS.esd.edContrib, fBase),
      designatedGroup: scaleWeightTree(POINT_WEIGHTS.esd.designatedGroup, fBonus), graduation: scaleWeightTree(POINT_WEIGHTS.esd.graduation, fBonus), jobsCreated: scaleWeightTree(POINT_WEIGHTS.esd.jobsCreated, fBonus)
    };
  })(),
  sed: POINT_WEIGHTS.sed // unchanged: 5 -> 5
};

function pointWeightsFor(sc) { return sc.size === 'QSE' ? POINT_WEIGHTS_QSE : POINT_WEIGHTS; }

/* The three B-BBEE "priority elements" (Ownership, Skills Development,
   Enterprise & Supplier Development) each carry a sub-minimum requirement:
   an entity must achieve at least 40% of the applicable target on specific
   sub-elements, or its overall contributor level is automatically discounted
   by one level — regardless of its total point score. */
const SUB_MINIMUM_FACTOR = 0.4;

/* SED recognition threshold: at least this share of an entity's Socio-Economic
   Development beneficiaries must be Black South Africans for contributions to
   be recognised at all. */
const SED_BLACK_BENEFICIARY_THRESHOLD = 75;

/* ------------------------------ User Portfolios --------------------------- */

/* Portfolio of Evidence — one consolidated PDF per person, replacing several
   separate individual document submissions. Status lifecycle for a person's
   uploaded file. "Approved"/"Rejected" are set manually in this tool today
   (there's no reviewer role/backend yet) — see BACKEND.md for the real
   reviewer-facing endpoint this is standing in for. */
const PORTFOLIO_STATUSES = ['Missing Documents', 'Uploaded (Pending Review)', 'Approved', 'Rejected'];
const PORTFOLIO_MAX_FILE_MB = 15;

/* Generic evidence-review status, reused across every register that needs
   one — suppliers, Supplier/Enterprise/Socioeconomic Development
   beneficiaries — not just employee portfolios. Same lifecycle/values as
   PORTFOLIO_STATUSES (one alias so both names read naturally at their call
   sites), but without the file-upload fields — these registers don't have
   per-row binary file storage yet, only a status + rejection note; see
   BACKEND.md for what a real per-row upload endpoint would need. */
const EVIDENCE_STATUSES = PORTFOLIO_STATUSES;
function blankEvidenceFields() {
  return { evidenceStatus: 'Missing Documents', evidenceRejectionNote: '' };
}

/* Which document badges a person's single PDF is expected to contain, based
   on occupational level. Edit freely once Centenary's verification agency
   confirms exactly what they require per role. */
function requiredDocsFor(person) {
  const docs = ['ID Copy'];
  const levelMeta = OCCUPATIONAL_LEVELS.find(function (l) { return l.key === person.level; });
  if (levelMeta && levelMeta.mgmt) docs.push('EEA1 Form');
  docs.push('Employment Contract');
  return docs;
}

/* Same idea as requiredDocsFor(), for every other evidence-bearing row kind
   the Evidence Centre rolls up — a static list per TYPE (not computed per
   row, unlike people's level-dependent list above), since these don't vary
   instance-by-instance the way a person's required docs do by occupational
   level. Edit freely once Centenary's verification agency confirms exactly
   what it wants per register. */
const REQUIRED_DOCS_BY_KIND = {
  supplier: ['B-BBEE Certificate', 'Invoice', 'Proof of Payment'],
  sdBeneficiary: ['Agreement', 'Invoice / Proof', 'Beneficiary Confirmation'],
  edBeneficiary: ['Agreement', 'Proof of Support', 'Beneficiary Affidavit'],
  sedBeneficiary: ['Beneficiary Confirmation', 'Proof of Payment', '75% Black Beneficiary Proof'],
  shareholder: ['ID Copy', 'Share Certificate', 'Shareholders’ Agreement'],
  programme: ['Attendance Register', 'Invoice', 'SETA Proof', 'Certificate']
};
function requiredDocsForKind(kind) { return REQUIRED_DOCS_BY_KIND[kind] || []; }

/* Default extra fields merged onto every person record (Portfolio of
   Evidence tracking, plus training/development spend paid to that
   individual — see Skills Development's "Computed from roster" panel, which
   sums this across people to suggest the expenditure figure automatically).
   New people created via "+ Add Person" get these via the template in
   tabManagement() (js/app.js), and this is also what migrateState()
   backfills onto rosters saved before this feature existed. */
function blankPortfolioFields() {
  return {
    portfolioStatus: 'Missing Documents',
    portfolioFileName: '',
    portfolioFileSize: 0,
    portfolioUploadedAt: null,
    portfolioRejectionNote: '',
    portfolioConfirmed: false,
    trainingSpend: 0
  };
}

/* ---------------------------- Storage helpers ---------------------------- */

/* Backfills any fields introduced after a user's browser already saved data,
   so older localStorage snapshots keep working instead of breaking on load.
   Extend this whenever a new field is added to the schema. */
function migrateState(state) {
  if (!state.company) state.company = {};
  const co = state.company;
  if (co.tagline == null) co.tagline = 'The Heart of Excellence';
  // Internal-only pointer used by exports (Excel/PDF report headers) — not
  // shown anywhere in the UI as text.
  if (co.logoAssetPath == null) co.logoAssetPath = 'assets/centenary-logo.png';
  if (!state.meta) state.meta = { lastSavedAt: null };

  (state.scorecards || []).forEach(function (sc) {
    if (sc.comparisonScorecardId === undefined) sc.comparisonScorecardId = null;
    if (!sc.general) sc.general = {};
    if (sc.general.sectorCharter == null) sc.general.sectorCharter = 'Generic Codes (DTI, no sector charter)';
    if (!sc.ownership) sc.ownership = {};
    if (sc.ownership.useShareholderRoster == null) sc.ownership.useShareholderRoster = false;
    if (!Array.isArray(sc.ownership.shareholders)) sc.ownership.shareholders = [];
    if (sc.ownership.netValueUnencumbered == null) sc.ownership.netValueUnencumbered = 0;
    if (sc.ownership.netValueTotalAssetValue == null) sc.ownership.netValueTotalAssetValue = 0;
    if (!sc.ownership.transaction) sc.ownership.transaction = blankOwnershipTransaction();
    if (!sc.skills) sc.skills = {};
    if (sc.skills.wspAtrSubmitted == null) sc.skills.wspAtrSubmitted = false;
    if (!sc.skills.mentorship) sc.skills.mentorship = blankMentorship();
    if (!Array.isArray(sc.skills.programmes)) sc.skills.programmes = [];
    if (!sc.esd) sc.esd = {};
    if (!Array.isArray(sc.esd.sdBeneficiaries)) sc.esd.sdBeneficiaries = [];
    if (!Array.isArray(sc.esd.edBeneficiaries)) sc.esd.edBeneficiaries = [];
    if (!Array.isArray(sc.esd.sdPayments)) sc.esd.sdPayments = [];
    if (!Array.isArray(sc.esd.edPayments)) sc.esd.edPayments = [];
    if (!sc.sed) sc.sed = {};
    if (sc.sed.blackBeneficiariesPct == null) sc.sed.blackBeneficiariesPct = 100;
    if (!Array.isArray(sc.sed.payments)) sc.sed.payments = [];
    if (!sc.goals) sc.goals = blankScorecard().goals;
    if (!sc.targets.eap) sc.targets.eap = blankEapTargets();
    (sc.people || []).forEach(function (p) {
      if (p.portfolioStatus == null) Object.assign(p, blankPortfolioFields());
      if (p.permanent == null) p.permanent = true;
    });
    (sc.esd.suppliers || []).forEach(function (s) { if (!s.qualification) s.qualification = blankSupplierQualification(); });
    // Evidence-review status — same pattern as people's Portfolio of
    // Evidence, extended to every register a verification agency samples.
    [sc.esd.suppliers, sc.esd.sdBeneficiaries, sc.esd.edBeneficiaries, sc.sed.beneficiaries, sc.esd.sdPayments, sc.esd.edPayments, sc.sed.payments, sc.ownership.shareholders, sc.skills.programmes].forEach(function (list) {
      (list || []).forEach(function (row) { if (row.evidenceStatus == null) Object.assign(row, blankEvidenceFields()); });
    });
  });
  // Accounts/session used to live inline on state; they've moved to the
  // shared accounts index (see getAccountsIndex()) so switching accounts
  // doesn't require duplicating that bookkeeping inside every account's blob.
  delete state.accounts;
  delete state.session;

  return state;
}

/* General Questions + Mentorship & professional registration — captured
   alongside Skills Development's WSP/ATR prerequisite. These are disclosure
   fields (no direct scoring line in the Amended Codes for mentorship/
   professional-registration counts), shown for audit/verification-agency
   context rather than folded into the points calculation. */
function blankMentorship() {
  return {
    traineeTrackingTool: false, mentorshipProgram: false, includeTrainingOutsidePeriod: false,
    blackMentees: 0,
    mentorshipPromotedAll: 0, mentorshipPromotedBlack: 0,
    professionalsAll: 0, professionalsBlack: 0,
    candidatesAll: 0, candidatesBlack: 0
  };
}

/* Ownership transaction / repayment schedule — a deeper alternative to
   entering Net Value as one manual number. Capture what the transaction was
   actually worth, how much debt financed it, and each repayment made
   against that debt; unencumbered value (and so Net Value %) is then
   computed from the schedule instead of typed in directly. */
function blankOwnershipTransaction() {
  return { transactionDate: '', transactionValue: 0, acquisitionDebt: 0, repayments: [] };
}

/* Empowering Supplier qualification questionnaire — captured per supplier,
   alongside the existing B-BBEE level/ownership fields. Kept as audit-
   support disclosure only (see tabESD's supplier qualification card) —
   the Amended Codes' Preferential Procurement points already come from
   the recognised-spend calculation in calc.js; this questionnaire doesn't
   change that math, it documents whether the supplier meets the DTI's
   Empowering Supplier definition for your verification agency's benefit. */
function blankSupplierQualification() {
  return { validCertificate: false, empoweringSupplierConfirmed: false, localProcurement: false, jobCreation: false, skillsTransfer: false, notes: '' };
}

/* EAP (Economically Active Population) targets by race x gender, for the
   full demographic matrix on EE Insights — deliberately defaulted to 0, not
   a guessed split. There is no single official per-race/gender EAP
   percentage table this tool can respectably hardcode (unlike the blended
   92.30%/42.20% national figures already used as Management Control's
   default target, sourced from Stats SA's national headline number) — the
   real breakdown depends on which EAP source you're measuring against
   (national, provincial, or sector-specific), so you enter it once here and
   the matrix compares your actual workforce against whatever you enter. */
function blankEapTargets() {
  const zeroPair = { Male: 0, Female: 0 };
  return { African: Object.assign({}, zeroPair), Coloured: Object.assign({}, zeroPair), Indian: Object.assign({}, zeroPair), White: Object.assign({}, zeroPair) };
}

/* --------------------------- Accounts (multi-account) ---------------------- */

let ACCOUNTS_INDEX = null;
let CURRENT_ACCOUNT_ID = null;

/* Reviewer Mode roles — a simple local role toggle (see the Team dropdown),
   not real per-user permissions: there's no login enforcing this yet, so
   it's a demo of the UI behaviour a real reviewer/preparer split would
   have, gating evidence-status controls to read-only under 'viewer'. Once
   real auth exists this becomes each user_accounts row's `role` column
   (see BACKEND.md) instead of one shared local toggle. */
const USER_ROLES = ['owner', 'reviewer', 'viewer'];

function defaultAccountsIndex() {
  return {
    accounts: [{ id: 'acc_centenary', name: 'Centenary Networks', tagline: 'The Heart of Excellence', createdAt: new Date().toISOString() }],
    activeAccountId: 'acc_centenary',
    session: { signedIn: true, name: 'Centenary Team', role: 'owner' }
  };
}

function loadAccountsIndex() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_INDEX_KEY);
    if (raw) {
      const idx = JSON.parse(raw);
      if (idx.session && idx.session.role == null) idx.session.role = 'owner';
      return idx;
    }
  } catch (e) { console.warn('Could not load accounts index, starting fresh.', e); }
  return defaultAccountsIndex();
}

function getAccountsIndex() {
  if (!ACCOUNTS_INDEX) ACCOUNTS_INDEX = loadAccountsIndex();
  return ACCOUNTS_INDEX;
}

function persistAccountsIndex() {
  localStorage.setItem(ACCOUNTS_INDEX_KEY, JSON.stringify(getAccountsIndex()));
}

function currentAccountName() {
  const idx = getAccountsIndex();
  const acc = idx.accounts.find(function (a) { return a.id === CURRENT_ACCOUNT_ID; });
  return acc ? acc.name : 'New Account';
}

/* A brand-new account starts genuinely empty — no Centenary sample data —
   so "each account can see its own B-BBEE performance and everything" means
   what it says: its own scorecards, its own company profile, nothing
   borrowed from any other account. */
function blankAccountState(accountName) {
  return {
    company: { name: accountName, tagline: '', logoAssetPath: 'assets/centenary-logo.png' },
    scorecards: [],
    activeScorecardId: null,
    implementation: [],
    scenarios: [],
    meta: { lastSavedAt: null },
    updatedAt: new Date().toISOString()
  };
}

/* Creates a new account, gives it its own empty data blob, switches to it.
   Reloads the page afterwards — simplest way to guarantee every closure in
   the app (STATE, the nav, every cached reference) picks up the new
   account's data with nothing stale left over from the old one. */
function addAccount(name) {
  const idx = getAccountsIndex();
  const id = uid('acc');
  idx.accounts.push({ id: id, name: name, tagline: '', createdAt: new Date().toISOString() });
  localStorage.setItem(storageKeyFor(id), JSON.stringify(blankAccountState(name)));
  idx.activeAccountId = id;
  persistAccountsIndex();
  location.reload();
}

function switchAccount(accountId) {
  const idx = getAccountsIndex();
  if (idx.activeAccountId === accountId) return;
  idx.activeAccountId = accountId;
  persistAccountsIndex();
  location.reload();
}

/* --------------------------------- Load/save -------------------------------- */

function loadState() {
  const idx = getAccountsIndex();
  CURRENT_ACCOUNT_ID = idx.activeAccountId;
  const key = storageKeyFor(CURRENT_ACCOUNT_ID);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return migrateState(JSON.parse(raw));
    if (CURRENT_ACCOUNT_ID === 'acc_centenary') {
      // First time this account's namespaced key is read — its data may
      // still be sitting under the old pre-multi-account key. Migrate it
      // across once so nobody's existing work disappears.
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const migrated = migrateState(JSON.parse(legacyRaw));
        localStorage.setItem(key, JSON.stringify(migrated));
        return migrated;
      }
      return seedState();
    }
  } catch (e) { console.warn('Could not load saved data, starting fresh.', e); }
  return blankAccountState(currentAccountName());
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(storageKeyFor(CURRENT_ACCOUNT_ID), JSON.stringify(state));
}

let STATE = loadState();

function persist() { saveState(STATE); }

function uid(prefix) {
  return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10);
}

/* ------------------------------- Seed data -------------------------------- */

function blankScorecard(overrides) {
  const base = {
    id: uid('sc'),
    description: 'New Scorecard',
    size: 'Generic',
    charter: 'Amended Codes of Good Practice',
    periodStart: '',
    periodEnd: '',
    measurementYear: new Date().getFullYear(),
    archived: false,
    general: { revenue: 0, npat: 0, valueOfBusiness: 0, leviableAmount: 0, industry: 'All industries', sectorCharter: 'Generic Codes (DTI, no sector charter)' },
    targets: defaultTargets(),
    ownership: {
      votingBlackPct: 0, votingBlackFemalePct: 0, economicBlackPct: 0, economicBlackFemalePct: 0, designatedGroupsPct: 0, newEntrantsPct: 0, netValuePct: 0,
      useShareholderRoster: false, shareholders: [],
      netValueUnencumbered: 0, netValueTotalAssetValue: 0,
      transaction: blankOwnershipTransaction()
    },
    people: [],
    skills: { expBlack: 0, expBursaries: 0, expDisabled: 0, learnersBlack: 0, totalEmployees: 0, absorbedBlack: 0, eligibleForAbsorption: 0, wspAtrSubmitted: false, mentorship: blankMentorship(), programmes: [] },
    esd: {
      inclusions: [
        { label: 'Cost of Sales (Purchases)', amount: 0 },
        { label: 'Operational Expenditure', amount: 0 },
        { label: 'Capital Expenditure', amount: 0 }
      ],
      exclusions: [
        { label: 'Levies', amount: 0 },
        { label: 'Salaries, Wages, Remuneration & Emoluments', amount: 0 },
        { label: 'Imports', amount: 0 }
      ],
      suppliers: [],
      sdContributions: 0,
      edContributions: 0,
      sdBeneficiaries: [],
      edBeneficiaries: [],
      sdPayments: [],
      edPayments: [],
      graduation: false,
      jobsCreated: false
    },
    sed: { beneficiaries: [], blackBeneficiariesPct: 100, payments: [] },
    yes: { registered: false, maintainedLevel: false, headcount: 0, participants: 0 },
    /* "Target Scorecard" goals — where you want each driver to be; same shape as the
       corresponding actual fields so the calc engine can be reused against them. */
    goals: {
      ownership: { votingBlackPct: 0, votingBlackFemalePct: 0, economicBlackPct: 0, economicBlackFemalePct: 0, designatedGroupsPct: 0, newEntrantsPct: 0, netValuePct: 0 },
      management: { blackTargetPct: 75, blackFemaleTargetPct: 30 },
      skills: { expBlack: 0, expBursaries: 0, expDisabled: 0, learnersBlack: 0, totalEmployees: 0, absorbedBlack: 0, eligibleForAbsorption: 0 },
      esd: { allSuppliersSpendPct: 0, sdContributions: 0, edContributions: 0 },
      sed: { contributions: 0 }
    },
    implementationNotes: '',
    // Which other scorecard (if any) Scorecard Insights' Period Comparison
    // card is currently comparing against — a UI preference, not scoring
    // data, so it's a plain scalar rather than nested under targets/goals.
    comparisonScorecardId: null,
    createdAt: new Date().toISOString()
  };
  const sc = Object.assign(base, overrides || {});
  // Every person always carries the Portfolio of Evidence fields, whether
  // they came from an override (seed data, CSV import) or "+ Add Person".
  sc.people = (sc.people || []).map(function (p) { return Object.assign(blankPortfolioFields(), p); });
  return sc;
}

function seedState() {
  // Declared up front so the payment schedules below can reference each
  // beneficiary's real id, matching how the frontend actually links a
  // payment back to the beneficiary it was made to.
  const sdBeneficiaries = [
    { id: uid('sdb'), name: 'Centurion Print & Design (mentorship + working capital)', spend: 40000, evidenceStatus: 'Approved', evidenceRejectionNote: '' },
    { id: uid('sdb'), name: 'Joburg Fabric Distributors (equipment loan)', spend: 22000, evidenceStatus: 'Missing Documents', evidenceRejectionNote: '' }
  ];
  const edBeneficiaries = [
    { id: uid('edb'), name: 'Sizwe Metals Fabrication (start-up grant)', spend: 18000, evidenceStatus: 'Uploaded (Pending Review)', evidenceRejectionNote: '' },
    { id: uid('edb'), name: 'Nomvula Cleaning Co-op (working capital)', spend: 15000, evidenceStatus: 'Missing Documents', evidenceRejectionNote: '' }
  ];
  const sedBeneficiaries = [
    { id: uid('ben'), name: 'Ilovo Youth Foundation', spend: 38000, evidenceStatus: 'Approved', evidenceRejectionNote: '' }
  ];

  const sample = blankScorecard({
    id: 'sc_sample',
    description: 'CENTENARY NETWORKS FY2026 (Sample)',
    periodStart: '2025-04-01',
    periodEnd: '2026-03-31',
    measurementYear: 2026,
    general: { revenue: 42500000, npat: 3650000, valueOfBusiness: 18000000, leviableAmount: 4200000, industry: 'ICT', sectorCharter: 'ICT Sector Code' },
    // Illustrative EAP target split for the sample scorecard only — NOT a
    // sourced official figure (see blankEapTargets()'s comment). Sums to
    // 100% purely so the demo matrix has something other than zeros to show.
    targets: Object.assign(defaultTargets(), {
      eap: { African: { Male: 40, Female: 40 }, Coloured: { Male: 4.5, Female: 4.5 }, Indian: { Male: 1.5, Female: 1.5 }, White: { Male: 4, Female: 4 } }
    }),
    ownership: {
      votingBlackPct: 75, votingBlackFemalePct: 27, economicBlackPct: 75, economicBlackFemalePct: 27, designatedGroupsPct: 3.2, newEntrantsPct: 1.4, netValuePct: 21,
      useShareholderRoster: true,
      shareholders: [
        { id: uid('sh'), name: 'Sibusiso Seopela', race: 'African', gender: 'Male', foreign: false, shareholdingPct: 22, newEntrant: false, designatedGroup: false },
        { id: uid('sh'), name: 'Langa Ngidi', race: 'African', gender: 'Male', foreign: false, shareholdingPct: 18, newEntrant: false, designatedGroup: false },
        { id: uid('sh'), name: 'Mamie Lokombo', race: 'African', gender: 'Female', foreign: false, shareholdingPct: 15, newEntrant: true, designatedGroup: true },
        { id: uid('sh'), name: 'Basani Makondo', race: 'African', gender: 'Female', foreign: false, shareholdingPct: 12, newEntrant: false, designatedGroup: true },
        { id: uid('sh'), name: 'Sean Mashimbye', race: 'African', gender: 'Male', foreign: false, shareholdingPct: 8, newEntrant: false, designatedGroup: false },
        { id: uid('sh'), name: 'Heritage Capital Partners (external investor)', race: 'White', gender: 'Male', foreign: false, shareholdingPct: 25, newEntrant: false, designatedGroup: false }
      ],
      netValueUnencumbered: 3780000, netValueTotalAssetValue: 18000000,
      transaction: {
        transactionDate: '2022-04-01', transactionValue: 18000000, acquisitionDebt: 17000000,
        repayments: [
          { id: uid('rep'), date: '2023-03-31', amount: 900000, reference: 'REPAY-FY23', notes: 'Year 1 repayment from operating cash flow' },
          { id: uid('rep'), date: '2024-03-31', amount: 920000, reference: 'REPAY-FY24', notes: 'Year 2 repayment' },
          { id: uid('rep'), date: '2025-03-31', amount: 960000, reference: 'REPAY-FY25', notes: 'Year 3 repayment' }
        ]
      }
    },
    people: [
      { id: uid('p'), name: 'Sibusiso Seopela', race: 'African', gender: 'Male', disabled: false, foreign: false, level: 'director', designation: 'Executive Director' },
      { id: uid('p'), name: 'Langa Ngidi', race: 'African', gender: 'Male', disabled: false, foreign: false, level: 'director', designation: 'Executive Director' },
      { id: uid('p'), name: 'Mamie Lokombo', race: 'African', gender: 'Female', disabled: false, foreign: false, level: 'executive', designation: 'Head of Fashion Design' },
      { id: uid('p'), name: 'Basani Makondo', race: 'African', gender: 'Female', disabled: false, foreign: false, level: 'senior', designation: 'Senior Manager, Interior Design' },
      { id: uid('p'), name: 'Sean Mashimbye', race: 'African', gender: 'Male', disabled: false, foreign: false, level: 'senior', designation: 'Senior Manager, Graphic Design' },
      { id: uid('p'), name: 'Kgomotso Dlamini', race: 'African', gender: 'Female', disabled: false, foreign: false, level: 'middle', designation: 'Middle Manager', trainingSpend: 18500 },
      { id: uid('p'), name: 'Thandiwe Mahlangu', race: 'Coloured', gender: 'Female', disabled: false, foreign: false, level: 'junior', designation: 'Junior Manager', trainingSpend: 9200 },
      { id: uid('p'), name: 'Priya Naidoo', race: 'Indian', gender: 'Female', disabled: true, foreign: false, level: 'skilled', designation: 'Skilled Technical', trainingSpend: 6300, portfolioStatus: 'Uploaded (Pending Review)', portfolioFileName: 'Priya_Naidoo_Portfolio.pdf', portfolioFileSize: 812000, portfolioUploadedAt: '2026-07-14T09:20:00.000Z' },
      { id: uid('p'), name: 'Tumelo Radebe', race: 'African', gender: 'Male', disabled: false, foreign: false, level: 'semiskilled', designation: 'Semi-Skilled', trainingSpend: 4100 }
    ],
    skills: {
      expBlack: 165000, expBursaries: 60000, expDisabled: 12000, learnersBlack: 4, totalEmployees: 40, absorbedBlack: 2, eligibleForAbsorption: 3, wspAtrSubmitted: true,
      programmes: [
        { id: uid('prog'), category: 'Learnership', abet: false, mandatory: true, provider: 'MerSETA Accredited Training', participants: 6, spend: 84000, support: 'Full stipend + accommodation for out-of-town learners' },
        { id: uid('prog'), category: 'Bursary', abet: false, mandatory: false, provider: 'University of Johannesburg', participants: 2, spend: 60000, support: 'Full tuition, textbooks and a monthly living allowance' },
        { id: uid('prog'), category: 'ABET', abet: true, mandatory: false, provider: 'Centenary internal facilitator', participants: 5, spend: 21000, support: 'Numeracy and literacy classes, 2 evenings a week on-site' }
      ]
    },
    esd: {
      inclusions: [
        { label: 'Cost of Sales (Purchases)', amount: 12500000 },
        { label: 'Operational Expenditure', amount: 3200000 },
        { label: 'Capital Expenditure', amount: 850000 }
      ],
      exclusions: [
        { label: 'Levies', amount: 210000 },
        { label: 'Salaries, Wages, Remuneration & Emoluments', amount: 4100000 },
        { label: 'Imports', amount: 0 }
      ],
      suppliers: [
        { id: uid('sup'), name: 'Centurion Print & Design', blackOwnedPct: 100, blackFemaleOwnedPct: 40, beeLevel: 1, spend: 1850000, certExpiry: '2027-02-28', evidenceStatus: 'Approved', evidenceRejectionNote: '', qualification: { validCertificate: true, empoweringSupplierConfirmed: true, localProcurement: true, jobCreation: true, skillsTransfer: true, notes: 'Confirmed empowering supplier — full questionnaire on file.' } },
        { id: uid('sup'), name: 'Joburg Fabric Distributors', blackOwnedPct: 55, blackFemaleOwnedPct: 20, beeLevel: 2, spend: 940000, certExpiry: '2026-10-15', evidenceStatus: 'Uploaded (Pending Review)', evidenceRejectionNote: '', qualification: { validCertificate: true, empoweringSupplierConfirmed: true, localProcurement: true, jobCreation: false, skillsTransfer: false, notes: 'Awaiting confirmation on skills transfer commitment.' } },
        { id: uid('sup'), name: 'National Cabling Supplies', blackOwnedPct: 0, blackFemaleOwnedPct: 0, beeLevel: 4, spend: 620000, certExpiry: '2026-01-15', evidenceStatus: 'Rejected', evidenceRejectionNote: 'B-BBEE certificate expired — resubmit a valid one before this can be recognised.', qualification: blankSupplierQualification() }
      ],
      sdContributions: 62000,
      edContributions: 33000,
      sdBeneficiaries: sdBeneficiaries,
      edBeneficiaries: edBeneficiaries,
      sdPayments: [
        { id: uid('pay'), beneficiaryId: sdBeneficiaries[0].id, date: '2025-08-12', amount: 25000, reference: 'INV-2025-0912', description: 'Q2 mentorship + working capital tranche', evidenceStatus: 'Approved', evidenceRejectionNote: '' },
        { id: uid('pay'), beneficiaryId: sdBeneficiaries[0].id, date: '2025-11-20', amount: 15000, reference: 'INV-2025-1144', description: 'Q3 working capital tranche', evidenceStatus: 'Uploaded (Pending Review)', evidenceRejectionNote: '' },
        { id: uid('pay'), beneficiaryId: sdBeneficiaries[1].id, date: '2025-09-05', amount: 22000, reference: 'PO-2025-330', description: 'Equipment loan disbursement', evidenceStatus: 'Missing Documents', evidenceRejectionNote: '' }
      ],
      edPayments: [
        { id: uid('pay'), beneficiaryId: edBeneficiaries[0].id, date: '2025-07-18', amount: 18000, reference: 'GRANT-2025-04', description: 'Start-up grant disbursement', evidenceStatus: 'Uploaded (Pending Review)', evidenceRejectionNote: '' },
        { id: uid('pay'), beneficiaryId: edBeneficiaries[1].id, date: '2025-10-02', amount: 15000, reference: 'GRANT-2025-11', description: 'Working capital disbursement', evidenceStatus: 'Missing Documents', evidenceRejectionNote: '' }
      ],
      graduation: true,
      jobsCreated: true
    },
    sed: {
      beneficiaries: sedBeneficiaries,
      blackBeneficiariesPct: 100,
      payments: [
        { id: uid('pay'), beneficiaryId: sedBeneficiaries[0].id, date: '2025-06-30', amount: 38000, reference: 'EFT-2025-0630', description: 'Annual SED contribution', evidenceStatus: 'Approved', evidenceRejectionNote: '' }
      ]
    },
    yes: { registered: true, maintainedLevel: true, headcount: 40, participants: 3 },
    goals: {
      ownership: { votingBlackPct: 75, votingBlackFemalePct: 35, economicBlackPct: 75, economicBlackFemalePct: 35, designatedGroupsPct: 4, newEntrantsPct: 2, netValuePct: 25 },
      management: { blackTargetPct: 85, blackFemaleTargetPct: 40 },
      skills: { expBlack: 220000, expBursaries: 100000, expDisabled: 15000, learnersBlack: 6, totalEmployees: 40, absorbedBlack: 3, eligibleForAbsorption: 3 },
      esd: { allSuppliersSpendPct: 90, sdContributions: 90000, edContributions: 45000 },
      sed: { contributions: 50000 }
    }
  });

  return {
    company: {
      name: 'Centenary Networks', tagline: 'The Heart of Excellence',
      // Internal-only pointer used by exports (Excel/PDF headers) — not shown
      // anywhere in the UI as text. See BACKEND.md if this ever needs to come
      // from an upload instead of a bundled file.
      logoAssetPath: 'assets/centenary-logo.png'
    },
    scorecards: [sample],
    activeScorecardId: sample.id,
    implementation: [
      { id: uid('task'), title: 'Register additional black-owned suppliers', element: 'esd', owner: 'Sean Mashimbye', due: '', status: 'In Progress', notes: '' },
      { id: uid('task'), title: 'Increase bursary spend for black students', element: 'skills', owner: 'Mamie Lokombo', due: '', status: 'Not Started', notes: '' }
    ],
    scenarios: [],
    // Bookkeeping consumed by js/api.js — see BACKEND.md.
    meta: { lastSavedAt: null },
    updatedAt: new Date().toISOString()
  };
}

function getScorecard(id) {
  return STATE.scorecards.find(function (s) { return s.id === id; });
}

function getActiveScorecard() {
  return getScorecard(STATE.activeScorecardId) || STATE.scorecards[0];
}
