-- Centenary Networks — B-BBEE Scorecard Tool
-- Init schema for Xneelo (shared MySQL hosting).
--
-- NOTE: On shared hosting (xneelo) you usually can't CREATE DATABASE — create
-- the database first in cPanel, then import this file into it via phpMyAdmin
-- (or `mysql -u ... -p dbname < init.sql`). Replace the USE line below with
-- your actual Xneelo-assigned database name (it will look like
-- `usernamehere_centenarybee`, similar to how `7k7dv_ewrq9` looks in the
-- Inzalo Yamaqhawe dashboard's init.sql — Xneelo always prefixes it).
USE `REPLACE_WITH_YOUR_XNEELO_DB_NAME`;

-- ---------------------------------------------------------------------------
-- Why every primary key here is VARCHAR, not AUTO_INCREMENT INT
-- ---------------------------------------------------------------------------
-- Unlike a fresh system, this app's frontend ALREADY generates its own ids
-- client-side (see uid() in js/data.js — e.g. "sc_a1b2c3d4", "p_x9y8z7w6")
-- and uses them everywhere: as localStorage keys, as IndexedDB portfolio-blob
-- keys ("scorecardId:personId"), and inside CSV import/export. Scorecards get
-- a server-assigned id on create (see api/scorecards.php), but people,
-- shareholders, suppliers, beneficiaries, tasks and scenarios are created
-- client-side with their id already set and sent as part of the payload —
-- the server needs to accept and store that id as-is, not generate its own.
-- VARCHAR(64) primary keys everywhere is what makes both cases work with one
-- consistent schema.

-- ---------------------------------- Accounts --------------------------------
-- Centenary Networks manages B-BBEE scorecards for more than one entity
-- under its umbrella — this is the "Accounts" page (#/accounts) in the app.
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  tagline VARCHAR(255) DEFAULT '',
  logo_asset_path VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------- Users / sessions ----------------------------
-- Backs the top bar's "Team" sign-in/out control. A user can belong to more
-- than one account (user_accounts), matching how one Centenary staff member
-- might work across several sponsored companies' accounts.
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_accounts (
  user_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  role ENUM('owner','editor','viewer') NOT NULL DEFAULT 'editor',
  PRIMARY KEY (user_id, account_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Bearer tokens for Api.setAuthToken() / the Authorization header js/api.js
-- already sends on every remote call once USE_REMOTE_API is true.
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- --------------------------------- Scorecards --------------------------------
-- The parent record — one row per scorecard (one account can have many, one
-- per measurement period). targets/goals stay as JSON: ~25 numeric scoring-
-- target coefficients that are only ever read/written as a whole alongside
-- their scorecard, never queried individually.
CREATE TABLE IF NOT EXISTS scorecards (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT 'New Scorecard',
  size ENUM('EME','QSE','Generic') NOT NULL DEFAULT 'Generic',
  charter VARCHAR(191) DEFAULT 'Amended Codes of Good Practice',
  sector_charter VARCHAR(191) DEFAULT 'Generic Codes (DTI, no sector charter)',
  period_start DATE DEFAULT NULL,
  period_end DATE DEFAULT NULL,
  measurement_year INT DEFAULT NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  revenue DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  npat DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  value_of_business DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  leviable_amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  industry VARCHAR(191) DEFAULT 'All industries',
  targets JSON DEFAULT NULL,
  goals JSON DEFAULT NULL,
  implementation_notes TEXT,
  -- Scorecard Insights' Period Comparison card (js/app.js: periodComparisonCard())
  -- — which other scorecard this one is currently being compared against.
  -- A UI preference, not scoring data (see the comment on blankScorecard()'s
  -- comparisonScorecardId in js/data.js) — nullable, self-referencing, and
  -- cleared automatically if that other scorecard is ever deleted.
  comparison_scorecard_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (comparison_scorecard_id) REFERENCES scorecards(id) ON DELETE SET NULL
);
-- Note: `targets` already carries the EAP Demographic Matrix's editable
-- target-by-race/gender grid (targets.eap in js/data.js's blankEapTargets())
-- — it's just another key inside this same JSON blob, so the EAP matrix
-- needed no schema change of its own; only the columns below (Payment
-- Schedules, Ownership Transaction Schedule, Supplier Qualification,
-- shareholder/programme evidence status) needed real columns because they
-- involve either child rows or fields calc.js/other tabs read directly.
-- NOTE: the JSON type needs MySQL 5.7.8+ / MariaDB 10.2.7+. If your Xneelo
-- plan runs older than that, change `targets`/`goals` to `TEXT` instead —
-- the PHP layer already just does json_encode()/json_decode() either way, so
-- nothing else in api/scorecards.php needs to change if you do.

-- ----------------------------- Ownership (1:1) --------------------------------
CREATE TABLE IF NOT EXISTS scorecard_ownership (
  scorecard_id VARCHAR(64) PRIMARY KEY,
  voting_black_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  voting_black_female_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  economic_black_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  economic_black_female_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  designated_groups_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  new_entrants_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  net_value_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  use_shareholder_roster TINYINT(1) NOT NULL DEFAULT 0,
  net_value_unencumbered DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  net_value_total_asset_value DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  -- Ownership Transaction Schedule (js/app.js: ownershipTransactionCard()) —
  -- a deeper alternative to typing net_value_unencumbered directly: capture
  -- what the deal was actually worth and how much debt financed it, and let
  -- net_value_unencumbered be computed from this + ownership_repayments
  -- below instead. Both paths stay valid — nothing here forces the schedule.
  transaction_date DATE DEFAULT NULL,
  transaction_value DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  acquisition_debt DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Ownership tab's shareholder register (many per scorecard). evidence_status/
-- note are the same Missing/Uploaded/Approved/Rejected lifecycle used
-- throughout this schema (see evidenceStatusCell() in js/app.js).
CREATE TABLE IF NOT EXISTS shareholders (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  race ENUM('African','Coloured','Indian','White') NOT NULL DEFAULT 'African',
  gender ENUM('Male','Female') NOT NULL DEFAULT 'Male',
  is_foreign TINYINT(1) NOT NULL DEFAULT 0,
  shareholding_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  is_new_entrant TINYINT(1) NOT NULL DEFAULT 0,
  is_designated_group TINYINT(1) NOT NULL DEFAULT 0,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Repayments made against the Ownership Transaction Schedule's acquisition
-- debt (many per scorecard — there's only ever one transaction per
-- scorecard, held on scorecard_ownership above, but many repayments
-- against it). Total repayments feeds the schedule's computed unencumbered
-- value the same way it's computed client-side in js/calc.js.
CREATE TABLE IF NOT EXISTS ownership_repayments (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  payment_date DATE DEFAULT NULL,
  amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  reference VARCHAR(191) DEFAULT '',
  notes TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- ------------------------- Management Control roster ---------------------------
-- The "Add Person" workforce roster — also drives EE Insights' EEA2-style
-- Workforce Profile table and the Peer Pay Check.
CREATE TABLE IF NOT EXISTS people (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  race ENUM('African','Coloured','Indian','White') NOT NULL DEFAULT 'African',
  gender ENUM('Male','Female') NOT NULL DEFAULT 'Male',
  is_disabled TINYINT(1) NOT NULL DEFAULT 0,
  is_foreign TINYINT(1) NOT NULL DEFAULT 0,
  is_permanent TINYINT(1) NOT NULL DEFAULT 1,
  occupational_level ENUM('director','executive','senior','middle','junior','skilled','semiskilled','unskilled') NOT NULL DEFAULT 'skilled',
  designation VARCHAR(191) DEFAULT '',
  training_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Portfolio of Evidence upload — 1:1 with a person. Kept separate from
-- `people` because the upload lifecycle (status/review/rejection) is a
-- distinct concern with its own timestamps, even though the frontend
-- flattens these fields directly onto the person object.
CREATE TABLE IF NOT EXISTS person_portfolios (
  person_id VARCHAR(64) PRIMARY KEY,
  file_url VARCHAR(500) DEFAULT NULL,
  file_name VARCHAR(255) DEFAULT NULL,
  file_size INT DEFAULT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  rejection_note TEXT,
  uploaded_at DATETIME DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  reviewed_by VARCHAR(64) DEFAULT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- --------------------------- Skills Development (1:1) --------------------------
CREATE TABLE IF NOT EXISTS scorecard_skills (
  scorecard_id VARCHAR(64) PRIMARY KEY,
  exp_black DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  exp_bursaries DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  exp_disabled DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  learners_black INT NOT NULL DEFAULT 0,
  total_employees INT NOT NULL DEFAULT 0,
  absorbed_black INT NOT NULL DEFAULT 0,
  eligible_for_absorption INT NOT NULL DEFAULT 0,
  wsp_atr_submitted TINYINT(1) NOT NULL DEFAULT 0,
  trainee_tracking_tool TINYINT(1) NOT NULL DEFAULT 0,
  mentorship_program TINYINT(1) NOT NULL DEFAULT 0,
  include_training_outside_period TINYINT(1) NOT NULL DEFAULT 0,
  black_mentees INT NOT NULL DEFAULT 0,
  mentorship_promoted_all INT NOT NULL DEFAULT 0,
  mentorship_promoted_black INT NOT NULL DEFAULT 0,
  professionals_registered_all INT NOT NULL DEFAULT 0,
  professionals_registered_black INT NOT NULL DEFAULT 0,
  candidates_registered_all INT NOT NULL DEFAULT 0,
  candidates_registered_black INT NOT NULL DEFAULT 0,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);
-- Mentorship/professional-registration fields are verification-agency
-- disclosure data only — the Amended Codes award no separate Skills
-- Development points for them, and calc.js never reads them for scoring.

-- Training Programme register (many per scorecard) — one row per programme/
-- intervention (a learnership, a bursary cohort, an ABET class), not per
-- person. An alternative way to build up to the same expenditure figure as
-- `people.training_spend`; the frontend's "Apply" button overwrites
-- scorecard_skills.exp_black with whichever total you actually use, so
-- there's no double-counting risk baked into the schema either.
CREATE TABLE IF NOT EXISTS skills_programmes (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Learnership',
  is_abet TINYINT(1) NOT NULL DEFAULT 0,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 0,
  provider VARCHAR(191) DEFAULT '',
  participants INT NOT NULL DEFAULT 0,
  spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  support TEXT,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- ------------------------ Enterprise & Supplier Development ---------------------
-- Total Measured Procurement Spend inclusion/exclusion lines (many per scorecard).
CREATE TABLE IF NOT EXISTS esd_tmps_line_items (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  line_type ENUM('inclusion','exclusion') NOT NULL,
  label VARCHAR(191) NOT NULL,
  amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- ESD supplier register (many per scorecard). evidence_status/note are the
-- same Missing/Uploaded/Approved/Rejected lifecycle as person_portfolios —
-- shared across every register a verification agency samples (see
-- evidenceStatusCell() in js/app.js), not a file upload yet — just a status
-- + note, same as this table's other evidence-bearing siblings below.
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  black_owned_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  black_female_owned_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  size ENUM('Generic','QSE','EME') DEFAULT NULL,
  bee_level VARCHAR(20) DEFAULT 'Non-compliant',
  spend DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  cert_expiry DATE DEFAULT NULL,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  -- Empowering Supplier qualification questionnaire (js/app.js:
  -- supplierQualificationCard()) — audit-support disclosure only, kept
  -- deliberately separate from the scoring fields above: the Amended Codes'
  -- Preferential Procurement points already come from black_owned_pct/
  -- bee_level/spend via calc.js, and none of these five booleans feed that
  -- math. They document whether the supplier meets the DTI's Empowering
  -- Supplier definition for your verification agency's benefit.
  qual_valid_certificate TINYINT(1) NOT NULL DEFAULT 0,
  qual_empowering_supplier_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  qual_local_procurement TINYINT(1) NOT NULL DEFAULT 0,
  qual_job_creation TINYINT(1) NOT NULL DEFAULT 0,
  qual_skills_transfer TINYINT(1) NOT NULL DEFAULT 0,
  qual_notes TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Aggregate ESD figures not tied to a single supplier (1:1 with a scorecard).
CREATE TABLE IF NOT EXISTS scorecard_esd (
  scorecard_id VARCHAR(64) PRIMARY KEY,
  sd_contributions DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  ed_contributions DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  graduation TINYINT(1) NOT NULL DEFAULT 0,
  jobs_created TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Supplier Development beneficiaries (many per scorecard) — contributions
-- that help existing empowering suppliers grow (mentorship, working
-- capital, equipment loans). Separate from `suppliers` above: a supplier
-- can appear in the procurement register AND here if you're both buying
-- from them and developing them, or here alone if the development-only
-- relationship has no separate procurement spend to track.
CREATE TABLE IF NOT EXISTS esd_sd_beneficiaries (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  spend DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Enterprise Development beneficiaries (many per scorecard) — contributions
-- that help black-owned enterprises get off the ground (start-up grants,
-- working capital, incubation). Same shape as esd_sd_beneficiaries above.
CREATE TABLE IF NOT EXISTS esd_ed_beneficiaries (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  spend DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Dated Payment Schedules (js/app.js: paymentScheduleCard()) — one row per
-- actual payment made to an SD/ED beneficiary, instead of one lump "spend"
-- figure. Only payments whose date falls inside the scorecard's measurement
-- period are summed into esd_sd_beneficiaries.spend / esd_ed_beneficiaries.
-- spend (the "Apply to beneficiaries" roll-up button) — calc.js and the
-- scoring math never read these payment rows directly, only the beneficiary
-- .spend total they roll up into. Same evidence-status lifecycle as every
-- other register.
CREATE TABLE IF NOT EXISTS esd_sd_payments (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  beneficiary_id VARCHAR(64) NOT NULL,
  payment_date DATE DEFAULT NULL,
  amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  reference VARCHAR(191) DEFAULT '',
  description TEXT,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE,
  FOREIGN KEY (beneficiary_id) REFERENCES esd_sd_beneficiaries(id) ON DELETE CASCADE
);

-- Same shape as esd_sd_payments, for Enterprise Development beneficiaries.
CREATE TABLE IF NOT EXISTS esd_ed_payments (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  beneficiary_id VARCHAR(64) NOT NULL,
  payment_date DATE DEFAULT NULL,
  amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  reference VARCHAR(191) DEFAULT '',
  description TEXT,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE,
  FOREIGN KEY (beneficiary_id) REFERENCES esd_ed_beneficiaries(id) ON DELETE CASCADE
);

-- --------------------------- Socioeconomic Development --------------------------
CREATE TABLE IF NOT EXISTS sed_beneficiaries (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  spend DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- Same Payment Schedule idea as esd_sd_payments/esd_ed_payments above, for
-- SED beneficiaries. SED has no separate aggregate contributions field the
-- way ESD does (calc.js reads sed_beneficiaries.spend directly), so this
-- roll-up is single-stage: in-period payments sum straight into
-- sed_beneficiaries.spend.
CREATE TABLE IF NOT EXISTS sed_payments (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  beneficiary_id VARCHAR(64) NOT NULL,
  payment_date DATE DEFAULT NULL,
  amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  reference VARCHAR(191) DEFAULT '',
  description TEXT,
  evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
  evidence_rejection_note TEXT,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE,
  FOREIGN KEY (beneficiary_id) REFERENCES sed_beneficiaries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scorecard_sed (
  scorecard_id VARCHAR(64) PRIMARY KEY,
  black_beneficiaries_pct DECIMAL(6,2) NOT NULL DEFAULT 100.00,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- -------------------------------- Y.E.S Participation (1:1) ---------------------
CREATE TABLE IF NOT EXISTS scorecard_yes (
  scorecard_id VARCHAR(64) PRIMARY KEY,
  registered TINYINT(1) NOT NULL DEFAULT 0,
  maintained_level TINYINT(1) NOT NULL DEFAULT 0,
  headcount INT NOT NULL DEFAULT 0,
  participants INT NOT NULL DEFAULT 0,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);

-- ----------------------------- Implementation Plan -------------------------------
-- Account-wide, not scorecard-scoped.
CREATE TABLE IF NOT EXISTS implementation_tasks (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  element VARCHAR(50) DEFAULT 'ownership',
  owner VARCHAR(191) DEFAULT '',
  due_date DATE DEFAULT NULL,
  status ENUM('Not Started','In Progress','Done') NOT NULL DEFAULT 'Not Started',
  notes TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- -------------------------------------- Scenarios ---------------------------------
-- Saved what-if snapshots from the Scenario Planner.
CREATE TABLE IF NOT EXISTS scenarios (
  id VARCHAR(64) PRIMARY KEY,
  scorecard_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL DEFAULT 'Scenario',
  drivers JSON DEFAULT NULL,
  result_total DECIMAL(6,2) DEFAULT NULL,
  result_level VARCHAR(20) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
);
-- Same JSON-version note as scorecards.targets/goals applies to `drivers`.

-- ---------------------------------------------------------------------------
-- Migration appendix — only needed if you already imported an earlier
-- version of this file into a real database (e.g. after Step 1's backend
-- catch-up but before Steps 2-8). CREATE TABLE IF NOT EXISTS above is a
-- no-op on a table that already exists, so it will NOT add the new columns
-- to it — run the ALTER TABLE statements below by hand in that case. If
-- you're importing this file fresh, ignore this section entirely; every
-- column here is already in the CREATE TABLE statements above.
-- ---------------------------------------------------------------------------
-- ALTER TABLE scorecards ADD COLUMN comparison_scorecard_id VARCHAR(64) DEFAULT NULL,
--   ADD FOREIGN KEY (comparison_scorecard_id) REFERENCES scorecards(id) ON DELETE SET NULL;
-- ALTER TABLE scorecard_ownership
--   ADD COLUMN transaction_date DATE DEFAULT NULL,
--   ADD COLUMN transaction_value DECIMAL(16,2) NOT NULL DEFAULT 0.00,
--   ADD COLUMN acquisition_debt DECIMAL(16,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE shareholders
--   ADD COLUMN evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
--   ADD COLUMN evidence_rejection_note TEXT;
-- ALTER TABLE skills_programmes
--   ADD COLUMN evidence_status ENUM('Missing Documents','Uploaded (Pending Review)','Approved','Rejected') NOT NULL DEFAULT 'Missing Documents',
--   ADD COLUMN evidence_rejection_note TEXT;
-- ALTER TABLE suppliers
--   ADD COLUMN qual_valid_certificate TINYINT(1) NOT NULL DEFAULT 0,
--   ADD COLUMN qual_empowering_supplier_confirmed TINYINT(1) NOT NULL DEFAULT 0,
--   ADD COLUMN qual_local_procurement TINYINT(1) NOT NULL DEFAULT 0,
--   ADD COLUMN qual_job_creation TINYINT(1) NOT NULL DEFAULT 0,
--   ADD COLUMN qual_skills_transfer TINYINT(1) NOT NULL DEFAULT 0,
--   ADD COLUMN qual_notes TEXT;
-- (Then re-run this whole file — every CREATE TABLE IF NOT EXISTS for
-- ownership_repayments, esd_sd_payments, esd_ed_payments and sed_payments
-- will create those brand-new tables correctly, since they don't exist yet.)
