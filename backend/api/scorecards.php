<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/scorecards.php — the one resource everything else nests inside.

     GET    /api/scorecards?account_id=...   -> Scorecard[]  (full nested objects)
     GET    /api/scorecards/{id}              -> Scorecard | 404
     POST   /api/scorecards                   -> 201 Scorecard (body: {account_id, size, description})
     PUT    /api/scorecards/{id}               -> 200 Scorecard (body: the FULL nested object —
                                                   this is what the Save button sends)
     DELETE /api/scorecards/{id}               -> 204

   The nested JSON shape below matches blankScorecard() in js/data.js
   EXACTLY (field names, nesting, defaults) — that function is the
   authoritative schema per BACKEND.md, so this file was written by reading
   it line-by-line rather than from memory. If you ever change
   blankScorecard(), update assemble_scorecard()/save_scorecard() here to
   match — they will silently drop or default any field they don't know
   about, which is exactly the kind of "mistake" that's easy to miss without
   testing a full save/load round-trip after changing either side.

   There is deliberately no separate "add a person" endpoint — people,
   shareholders, suppliers and sed_beneficiaries are nested arrays saved
   whole on every PUT, matching how the frontend already treats them as a
   local draft until the Save button is clicked (see "Local-draft vs.
   explicit save" in BACKEND.md).
   ========================================================================== */

require_once __DIR__ . '/db.php';
send_cors_headers();

$mysqli = db_connect();
$userId = require_auth($mysqli);
$method = $_SERVER['REQUEST_METHOD'];
$scorecardId = isset($_SERVER['PATH_INFO']) ? trim($_SERVER['PATH_INFO'], '/') : '';

/* ---------------------------------------------------------------------------
   Small fetch helpers — one per table, each returning plain assoc rows.
   --------------------------------------------------------------------------- */

function fetch_one($mysqli, $sql, $id) {
  $stmt = $mysqli->prepare($sql);
  $stmt->bind_param('s', $id);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  return $row;
}

function fetch_all($mysqli, $sql, $id) {
  $stmt = $mysqli->prepare($sql);
  $stmt->bind_param('s', $id);
  $stmt->execute();
  $res = $stmt->get_result();
  $rows = [];
  while ($row = $res->fetch_assoc()) $rows[] = $row;
  $stmt->close();
  return $rows;
}

/** MySQL TINYINT(1) comes back as the string/int "0"/"1" from mysqli —
    normalize every boolean-ish column through this so the JSON we send the
    frontend has real true/false, matching what blankScorecard() produces. */
function b($v) { return ((int)$v) === 1; }
function n($v) { return $v === null ? 0 : (float)$v; }

/* ---------------------------------------------------------------------------
   Assemble: read every table, build the exact nested shape the frontend
   expects. Any 1:1 child table that has no row yet (a brand-new scorecard
   before its first Save) defaults in PHP rather than requiring the caller
   to have pre-created empty rows — same defaults as blankScorecard().
   --------------------------------------------------------------------------- */

function assemble_scorecard($mysqli, $id) {
  $sc = fetch_one($mysqli, 'SELECT * FROM ' . qi('scorecards') . ' WHERE id = ?', $id);
  if (!$sc) return null;

  $ownershipRow = fetch_one($mysqli, 'SELECT * FROM ' . qi('scorecard_ownership') . ' WHERE scorecard_id = ?', $id);
  $skillsRow = fetch_one($mysqli, 'SELECT * FROM ' . qi('scorecard_skills') . ' WHERE scorecard_id = ?', $id);
  $esdRow = fetch_one($mysqli, 'SELECT * FROM ' . qi('scorecard_esd') . ' WHERE scorecard_id = ?', $id);
  $sedRow = fetch_one($mysqli, 'SELECT * FROM ' . qi('scorecard_sed') . ' WHERE scorecard_id = ?', $id);
  $yesRow = fetch_one($mysqli, 'SELECT * FROM ' . qi('scorecard_yes') . ' WHERE scorecard_id = ?', $id);

  $shareholderRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('shareholders') . ' WHERE scorecard_id = ? ORDER BY shareholding_pct DESC', $id);
  $peopleRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('people') . ' WHERE scorecard_id = ? ORDER BY created_at ASC', $id);
  $tmpsRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('esd_tmps_line_items') . ' WHERE scorecard_id = ?', $id);
  $supplierRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('suppliers') . ' WHERE scorecard_id = ?', $id);
  $beneficiaryRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('sed_beneficiaries') . ' WHERE scorecard_id = ?', $id);
  $programmeRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('skills_programmes') . ' WHERE scorecard_id = ?', $id);
  $sdBeneficiaryRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('esd_sd_beneficiaries') . ' WHERE scorecard_id = ?', $id);
  $edBeneficiaryRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('esd_ed_beneficiaries') . ' WHERE scorecard_id = ?', $id);
  // Steps 2/3 (Payment Schedules + Ownership Transaction Schedule) additions.
  $repaymentRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('ownership_repayments') . ' WHERE scorecard_id = ?', $id);
  $sdPaymentRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('esd_sd_payments') . ' WHERE scorecard_id = ?', $id);
  $edPaymentRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('esd_ed_payments') . ' WHERE scorecard_id = ?', $id);
  $sedPaymentRows = fetch_all($mysqli, 'SELECT * FROM ' . qi('sed_payments') . ' WHERE scorecard_id = ?', $id);

  $shareholders = array_map(function ($r) {
    return [
      'id' => $r['id'], 'name' => $r['name'], 'race' => $r['race'], 'gender' => $r['gender'],
      'foreign' => b($r['is_foreign']), 'shareholdingPct' => n($r['shareholding_pct']),
      'newEntrant' => b($r['is_new_entrant']), 'designatedGroup' => b($r['is_designated_group']),
      'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note']
    ];
  }, $shareholderRows);

  $repayments = array_map(function ($r) {
    return ['id' => $r['id'], 'date' => $r['payment_date'], 'amount' => n($r['amount']), 'reference' => $r['reference'], 'notes' => $r['notes']];
  }, $repaymentRows);

  // Shared shape for all three Payment Schedule tables (SD/ED/SED) — only
  // the source table differs, so one mapper covers all three call sites.
  $mapPayment = function ($r) {
    return [
      'id' => $r['id'], 'beneficiaryId' => $r['beneficiary_id'], 'date' => $r['payment_date'], 'amount' => n($r['amount']),
      'reference' => $r['reference'], 'description' => $r['description'],
      'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note']
    ];
  };
  $sdPayments = array_map($mapPayment, $sdPaymentRows);
  $edPayments = array_map($mapPayment, $edPaymentRows);
  $sedPayments = array_map($mapPayment, $sedPaymentRows);

  $people = [];
  foreach ($peopleRows as $r) {
    $portfolio = fetch_one($mysqli, 'SELECT * FROM ' . qi('person_portfolios') . ' WHERE person_id = ?', $r['id']);
    $people[] = [
      'id' => $r['id'], 'name' => $r['name'], 'race' => $r['race'], 'gender' => $r['gender'],
      'disabled' => b($r['is_disabled']), 'foreign' => b($r['is_foreign']), 'permanent' => b($r['is_permanent']),
      'level' => $r['occupational_level'], 'designation' => $r['designation'], 'trainingSpend' => n($r['training_spend']),
      'portfolioStatus' => $portfolio ? $portfolio['status'] : 'Missing Documents',
      'portfolioFileName' => $portfolio ? $portfolio['file_name'] : '',
      'portfolioFileSize' => $portfolio ? (int)$portfolio['file_size'] : 0,
      'portfolioUploadedAt' => $portfolio ? $portfolio['uploaded_at'] : null,
      'portfolioRejectionNote' => $portfolio ? $portfolio['rejection_note'] : ''
    ];
  }

  $inclusions = [];
  $exclusions = [];
  foreach ($tmpsRows as $r) {
    $line = ['label' => $r['label'], 'amount' => n($r['amount'])];
    if ($r['line_type'] === 'inclusion') $inclusions[] = $line; else $exclusions[] = $line;
  }

  $suppliers = array_map(function ($r) {
    return [
      'id' => $r['id'], 'name' => $r['name'], 'blackOwnedPct' => n($r['black_owned_pct']),
      'blackFemaleOwnedPct' => n($r['black_female_owned_pct']), 'size' => $r['size'],
      'beeLevel' => $r['bee_level'], 'spend' => n($r['spend']), 'certExpiry' => $r['cert_expiry'],
      'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note'],
      // Empowering Supplier qualification questionnaire — audit-support
      // disclosure only, see the qual_* column comments in init.sql.
      'qualification' => [
        'validCertificate' => b($r['qual_valid_certificate']), 'empoweringSupplierConfirmed' => b($r['qual_empowering_supplier_confirmed']),
        'localProcurement' => b($r['qual_local_procurement']), 'jobCreation' => b($r['qual_job_creation']),
        'skillsTransfer' => b($r['qual_skills_transfer']), 'notes' => $r['qual_notes']
      ]
    ];
  }, $supplierRows);

  $beneficiaries = array_map(function ($r) {
    return ['id' => $r['id'], 'name' => $r['name'], 'spend' => n($r['spend']), 'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note']];
  }, $beneficiaryRows);

  $programmes = array_map(function ($r) {
    return [
      'id' => $r['id'], 'category' => $r['category'], 'abet' => b($r['is_abet']), 'mandatory' => b($r['is_mandatory']),
      'provider' => $r['provider'], 'participants' => (int)$r['participants'], 'spend' => n($r['spend']), 'support' => $r['support'],
      'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note']
    ];
  }, $programmeRows);

  $sdBeneficiaries = array_map(function ($r) {
    return ['id' => $r['id'], 'name' => $r['name'], 'spend' => n($r['spend']), 'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note']];
  }, $sdBeneficiaryRows);

  $edBeneficiaries = array_map(function ($r) {
    return ['id' => $r['id'], 'name' => $r['name'], 'spend' => n($r['spend']), 'evidenceStatus' => $r['evidence_status'], 'evidenceRejectionNote' => $r['evidence_rejection_note']];
  }, $edBeneficiaryRows);

  return [
    'id' => $sc['id'],
    'description' => $sc['description'],
    'size' => $sc['size'],
    'charter' => $sc['charter'],
    'periodStart' => $sc['period_start'],
    'periodEnd' => $sc['period_end'],
    'measurementYear' => $sc['measurement_year'] !== null ? (int)$sc['measurement_year'] : null,
    'archived' => b($sc['archived']),
    'comparisonScorecardId' => $sc['comparison_scorecard_id'],
    'general' => [
      'revenue' => n($sc['revenue']), 'npat' => n($sc['npat']), 'valueOfBusiness' => n($sc['value_of_business']),
      'leviableAmount' => n($sc['leviable_amount']), 'industry' => $sc['industry'], 'sectorCharter' => $sc['sector_charter']
    ],
    'targets' => $sc['targets'] !== null ? json_decode($sc['targets'], true) : null,
    'goals' => $sc['goals'] !== null ? json_decode($sc['goals'], true) : null,
    'ownership' => [
      'votingBlackPct' => $ownershipRow ? n($ownershipRow['voting_black_pct']) : 0,
      'votingBlackFemalePct' => $ownershipRow ? n($ownershipRow['voting_black_female_pct']) : 0,
      'economicBlackPct' => $ownershipRow ? n($ownershipRow['economic_black_pct']) : 0,
      'economicBlackFemalePct' => $ownershipRow ? n($ownershipRow['economic_black_female_pct']) : 0,
      'designatedGroupsPct' => $ownershipRow ? n($ownershipRow['designated_groups_pct']) : 0,
      'newEntrantsPct' => $ownershipRow ? n($ownershipRow['new_entrants_pct']) : 0,
      'netValuePct' => $ownershipRow ? n($ownershipRow['net_value_pct']) : 0,
      'useShareholderRoster' => $ownershipRow ? b($ownershipRow['use_shareholder_roster']) : false,
      'shareholders' => $shareholders,
      'netValueUnencumbered' => $ownershipRow ? n($ownershipRow['net_value_unencumbered']) : 0,
      'netValueTotalAssetValue' => $ownershipRow ? n($ownershipRow['net_value_total_asset_value']) : 0,
      'transaction' => [
        'transactionDate' => $ownershipRow ? $ownershipRow['transaction_date'] : null,
        'transactionValue' => $ownershipRow ? n($ownershipRow['transaction_value']) : 0,
        'acquisitionDebt' => $ownershipRow ? n($ownershipRow['acquisition_debt']) : 0,
        'repayments' => $repayments
      ]
    ],
    'people' => $people,
    'skills' => [
      'expBlack' => $skillsRow ? n($skillsRow['exp_black']) : 0,
      'expBursaries' => $skillsRow ? n($skillsRow['exp_bursaries']) : 0,
      'expDisabled' => $skillsRow ? n($skillsRow['exp_disabled']) : 0,
      'learnersBlack' => $skillsRow ? (int)$skillsRow['learners_black'] : 0,
      'totalEmployees' => $skillsRow ? (int)$skillsRow['total_employees'] : 0,
      'absorbedBlack' => $skillsRow ? (int)$skillsRow['absorbed_black'] : 0,
      'eligibleForAbsorption' => $skillsRow ? (int)$skillsRow['eligible_for_absorption'] : 0,
      'wspAtrSubmitted' => $skillsRow ? b($skillsRow['wsp_atr_submitted']) : false,
      'mentorship' => [
        'traineeTrackingTool' => $skillsRow ? b($skillsRow['trainee_tracking_tool']) : false,
        'mentorshipProgram' => $skillsRow ? b($skillsRow['mentorship_program']) : false,
        'includeTrainingOutsidePeriod' => $skillsRow ? b($skillsRow['include_training_outside_period']) : false,
        'blackMentees' => $skillsRow ? (int)$skillsRow['black_mentees'] : 0,
        'mentorshipPromotedAll' => $skillsRow ? (int)$skillsRow['mentorship_promoted_all'] : 0,
        'mentorshipPromotedBlack' => $skillsRow ? (int)$skillsRow['mentorship_promoted_black'] : 0,
        'professionalsAll' => $skillsRow ? (int)$skillsRow['professionals_registered_all'] : 0,
        'professionalsBlack' => $skillsRow ? (int)$skillsRow['professionals_registered_black'] : 0,
        'candidatesAll' => $skillsRow ? (int)$skillsRow['candidates_registered_all'] : 0,
        'candidatesBlack' => $skillsRow ? (int)$skillsRow['candidates_registered_black'] : 0
      ],
      'programmes' => $programmes
    ],
    'esd' => [
      'inclusions' => $inclusions, 'exclusions' => $exclusions, 'suppliers' => $suppliers,
      'sdContributions' => $esdRow ? n($esdRow['sd_contributions']) : 0,
      'edContributions' => $esdRow ? n($esdRow['ed_contributions']) : 0,
      'sdBeneficiaries' => $sdBeneficiaries,
      'edBeneficiaries' => $edBeneficiaries,
      'sdPayments' => $sdPayments,
      'edPayments' => $edPayments,
      'graduation' => $esdRow ? b($esdRow['graduation']) : false,
      'jobsCreated' => $esdRow ? b($esdRow['jobs_created']) : false
    ],
    'sed' => [
      'beneficiaries' => $beneficiaries,
      'payments' => $sedPayments,
      'blackBeneficiariesPct' => $sedRow ? n($sedRow['black_beneficiaries_pct']) : 100
    ],
    'yes' => [
      'registered' => $yesRow ? b($yesRow['registered']) : false,
      'maintainedLevel' => $yesRow ? b($yesRow['maintained_level']) : false,
      'headcount' => $yesRow ? (int)$yesRow['headcount'] : 0,
      'participants' => $yesRow ? (int)$yesRow['participants'] : 0
    ],
    'implementationNotes' => $sc['implementation_notes'],
    'createdAt' => $sc['created_at']
  ];
}

/* ---------------------------------------------------------------------------
   Save: one transaction, every child table upserted or fully replaced.
   Arrays (shareholders/people/suppliers/tmps lines/beneficiaries) use
   delete-then-reinsert — simplest correct way to handle rows the frontend
   added, removed or reordered locally before this single PUT, since the
   frontend never sends a diff, only the current full array.
   --------------------------------------------------------------------------- */

/* upsert_row() (used extensively below) lives in db.php — shared with
   portfolio.php, which needs it too. */

function save_scorecard($mysqli, $id, $accountId, $d) {
  $mysqli->begin_transaction();
  try {
    $general = isset($d['general']) ? $d['general'] : [];
    $stmt = $mysqli->prepare(
      'UPDATE ' . qi('scorecards') . ' SET description=?, size=?, charter=?, sector_charter=?, period_start=?, period_end=?, ' .
      'measurement_year=?, archived=?, revenue=?, npat=?, value_of_business=?, leviable_amount=?, industry=?, targets=?, goals=?, implementation_notes=?, comparison_scorecard_id=? WHERE id=? AND account_id=?'
    );
    $periodStart = !empty($d['periodStart']) ? $d['periodStart'] : null;
    $periodEnd = !empty($d['periodEnd']) ? $d['periodEnd'] : null;
    $measurementYear = isset($d['measurementYear']) ? (int)$d['measurementYear'] : null;
    $archived = !empty($d['archived']) ? 1 : 0;
    $targetsJson = isset($d['targets']) ? json_encode($d['targets']) : null;
    // Note: targets already carries targets.eap (the EAP Demographic
    // Matrix's editable target grid, js/data.js: blankEapTargets()) since
    // it's just another key inside this same JSON blob — nothing extra to
    // encode/decode for it here.
    $goalsJson = isset($d['goals']) ? json_encode($d['goals']) : null;
    $notes = isset($d['implementationNotes']) ? $d['implementationNotes'] : '';
    // Step 7 (Period Comparison) — a plain UI preference, not scoring data
    // (see the field comment on blankScorecard() in js/data.js). The
    // frontend's <select> can send '' for "no comparison chosen" (an empty
    // option value), which is not a valid value for a self-referencing FK
    // column, so treat empty-string the same as absent -> NULL.
    $comparisonScorecardId = !empty($d['comparisonScorecardId']) ? $d['comparisonScorecardId'] : null;
    // 6 strings (description..periodEnd), 2 ints (measurementYear, archived),
    // 4 decimals (revenue..leviableAmount), 7 strings (industry..the WHERE
    // clause's id/accountId) = 19 values, 19 type chars — verified by
    // scripting the count rather than trusting a hand count, since this is
    // exactly the kind of positional mismatch mysqli won't catch for you.
    $stmt->bind_param(
      'ssssssiiddddsssssss',
      $d['description'], $d['size'], $d['charter'], $general['sectorCharter'], $periodStart, $periodEnd,
      $measurementYear, $archived, $general['revenue'], $general['npat'], $general['valueOfBusiness'], $general['leviableAmount'],
      $general['industry'], $targetsJson, $goalsJson, $notes, $comparisonScorecardId, $id, $accountId
    );
    $stmt->execute();
    $stmt->close();

    // Column order below is: 7 decimals, 1 int (the boolean flag), then 2
    // more decimals, then the Ownership Transaction Schedule's 1 date-string
    // + 2 decimals — the type string 'dddddddiddsdd' must match that order
    // exactly (mysqli has no named params, only positional).
    $o = isset($d['ownership']) ? $d['ownership'] : [];
    $t = isset($o['transaction']) ? $o['transaction'] : [];
    $transactionDate = !empty($t['transactionDate']) ? $t['transactionDate'] : null;
    upsert_row($mysqli, 'scorecard_ownership', 'scorecard_id', $id,
      ['voting_black_pct', 'voting_black_female_pct', 'economic_black_pct', 'economic_black_female_pct', 'designated_groups_pct', 'new_entrants_pct', 'net_value_pct', 'use_shareholder_roster', 'net_value_unencumbered', 'net_value_total_asset_value', 'transaction_date', 'transaction_value', 'acquisition_debt'],
      [$o['votingBlackPct'], $o['votingBlackFemalePct'], $o['economicBlackPct'], $o['economicBlackFemalePct'], $o['designatedGroupsPct'], $o['newEntrantsPct'], $o['netValuePct'], !empty($o['useShareholderRoster']) ? 1 : 0, $o['netValueUnencumbered'], $o['netValueTotalAssetValue'], $transactionDate, ($t['transactionValue'] ?? 0), ($t['acquisitionDebt'] ?? 0)],
      'dddddddiddsdd'
    );

    $mysqli->query('DELETE FROM ' . qi('shareholders') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach ($o['shareholders'] as $sh) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('shareholders') . ' (id, scorecard_id, name, race, gender, is_foreign, shareholding_pct, is_new_entrant, is_designated_group, evidence_status, evidence_rejection_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      $isForeign = !empty($sh['foreign']) ? 1 : 0;
      $isNewEntrant = !empty($sh['newEntrant']) ? 1 : 0;
      $isDesignated = !empty($sh['designatedGroup']) ? 1 : 0;
      $evidenceStatus = isset($sh['evidenceStatus']) ? $sh['evidenceStatus'] : 'Missing Documents';
      $evidenceNote = isset($sh['evidenceRejectionNote']) ? $sh['evidenceRejectionNote'] : '';
      $stmt->bind_param('sssssidiiss', $sh['id'], $id, $sh['name'], $sh['race'], $sh['gender'], $isForeign, $sh['shareholdingPct'], $isNewEntrant, $isDesignated, $evidenceStatus, $evidenceNote);
      $stmt->execute();
      $stmt->close();
    }

    // Repayments made against the transaction's acquisition debt — same
    // delete-then-reinsert pattern as every other array child table.
    $mysqli->query('DELETE FROM ' . qi('ownership_repayments') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach (($t['repayments'] ?? []) as $rep) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('ownership_repayments') . ' (id, scorecard_id, payment_date, amount, reference, notes) VALUES (?,?,?,?,?,?)');
      $repDate = !empty($rep['date']) ? $rep['date'] : null;
      $stmt->bind_param('sssdss', $rep['id'], $id, $repDate, $rep['amount'], $rep['reference'], $rep['notes']);
      $stmt->execute();
      $stmt->close();
    }

    $mysqli->query('DELETE FROM ' . qi('people') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach ($d['people'] as $p) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('people') . ' (id, scorecard_id, name, race, gender, is_disabled, is_foreign, is_permanent, occupational_level, designation, training_spend) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      $isDisabled = !empty($p['disabled']) ? 1 : 0;
      $isForeign = !empty($p['foreign']) ? 1 : 0;
      $isPermanent = ($p['permanent'] !== false) ? 1 : 0;
      $trainingSpend = isset($p['trainingSpend']) ? $p['trainingSpend'] : 0;
      $stmt->bind_param('sssssiiissd', $p['id'], $id, $p['name'], $p['race'], $p['gender'], $isDisabled, $isForeign, $isPermanent, $p['level'], $p['designation'], $trainingSpend);
      $stmt->execute();
      $stmt->close();

      upsert_row($mysqli, 'person_portfolios', 'person_id', $p['id'],
        ['status', 'file_name', 'file_size', 'uploaded_at', 'rejection_note'],
        [
          isset($p['portfolioStatus']) ? $p['portfolioStatus'] : 'Missing Documents',
          isset($p['portfolioFileName']) ? $p['portfolioFileName'] : '',
          isset($p['portfolioFileSize']) ? (int)$p['portfolioFileSize'] : 0,
          !empty($p['portfolioUploadedAt']) ? $p['portfolioUploadedAt'] : null,
          isset($p['portfolioRejectionNote']) ? $p['portfolioRejectionNote'] : ''
        ],
        'ssiss'
      );
    }

    $sk = isset($d['skills']) ? $d['skills'] : [];
    $mn = isset($sk['mentorship']) ? $sk['mentorship'] : [];
    upsert_row($mysqli, 'scorecard_skills', 'scorecard_id', $id,
      ['exp_black', 'exp_bursaries', 'exp_disabled', 'learners_black', 'total_employees', 'absorbed_black', 'eligible_for_absorption', 'wsp_atr_submitted',
       'trainee_tracking_tool', 'mentorship_program', 'include_training_outside_period', 'black_mentees', 'mentorship_promoted_all', 'mentorship_promoted_black',
       'professionals_registered_all', 'professionals_registered_black', 'candidates_registered_all', 'candidates_registered_black'],
      [
        $sk['expBlack'], $sk['expBursaries'], $sk['expDisabled'], (int)$sk['learnersBlack'], (int)$sk['totalEmployees'], (int)$sk['absorbedBlack'], (int)$sk['eligibleForAbsorption'],
        !empty($sk['wspAtrSubmitted']) ? 1 : 0,
        !empty($mn['traineeTrackingTool']) ? 1 : 0, !empty($mn['mentorshipProgram']) ? 1 : 0, !empty($mn['includeTrainingOutsidePeriod']) ? 1 : 0,
        (int)($mn['blackMentees'] ?? 0), (int)($mn['mentorshipPromotedAll'] ?? 0), (int)($mn['mentorshipPromotedBlack'] ?? 0),
        (int)($mn['professionalsAll'] ?? 0), (int)($mn['professionalsBlack'] ?? 0), (int)($mn['candidatesAll'] ?? 0), (int)($mn['candidatesBlack'] ?? 0)
      ],
      'dddiiiiiiiiiiiiiii'
    );

    $esd = isset($d['esd']) ? $d['esd'] : [];
    $mysqli->query('DELETE FROM ' . qi('esd_tmps_line_items') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach (['inclusion' => $esd['inclusions'], 'exclusion' => $esd['exclusions']] as $type => $lines) {
      foreach ($lines as $line) {
        $lineId = gen_id('tmps');
        $stmt = $mysqli->prepare('INSERT INTO ' . qi('esd_tmps_line_items') . ' (id, scorecard_id, line_type, label, amount) VALUES (?,?,?,?,?)');
        $stmt->bind_param('ssssd', $lineId, $id, $type, $line['label'], $line['amount']);
        $stmt->execute();
        $stmt->close();
      }
    }

    $mysqli->query('DELETE FROM ' . qi('suppliers') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach ($esd['suppliers'] as $sup) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('suppliers') . ' (id, scorecard_id, name, black_owned_pct, black_female_owned_pct, size, bee_level, spend, cert_expiry, evidence_status, evidence_rejection_note, qual_valid_certificate, qual_empowering_supplier_confirmed, qual_local_procurement, qual_job_creation, qual_skills_transfer, qual_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      $certExpiry = !empty($sup['certExpiry']) ? $sup['certExpiry'] : null;
      $evidenceStatus = isset($sup['evidenceStatus']) ? $sup['evidenceStatus'] : 'Missing Documents';
      $evidenceNote = isset($sup['evidenceRejectionNote']) ? $sup['evidenceRejectionNote'] : '';
      // Empowering Supplier qualification questionnaire — audit-support
      // disclosure only, see the qual_* column comments in init.sql.
      $q = isset($sup['qualification']) ? $sup['qualification'] : [];
      $qValidCert = !empty($q['validCertificate']) ? 1 : 0;
      $qEmpowering = !empty($q['empoweringSupplierConfirmed']) ? 1 : 0;
      $qLocalProc = !empty($q['localProcurement']) ? 1 : 0;
      $qJobCreation = !empty($q['jobCreation']) ? 1 : 0;
      $qSkillsTransfer = !empty($q['skillsTransfer']) ? 1 : 0;
      $qNotes = isset($q['notes']) ? $q['notes'] : '';
      // Value order below must match the column list above exactly:
      // ...size, bee_level, spend, cert_expiry — bee_level (a string like
      // "Level 2") comes BEFORE spend (a decimal), not after.
      $stmt->bind_param('sssddssdsssiiiiis', $sup['id'], $id, $sup['name'], $sup['blackOwnedPct'], $sup['blackFemaleOwnedPct'], $sup['size'], $sup['beeLevel'], $sup['spend'], $certExpiry, $evidenceStatus, $evidenceNote, $qValidCert, $qEmpowering, $qLocalProc, $qJobCreation, $qSkillsTransfer, $qNotes);
      $stmt->execute();
      $stmt->close();
    }

    upsert_row($mysqli, 'scorecard_esd', 'scorecard_id', $id,
      ['sd_contributions', 'ed_contributions', 'graduation', 'jobs_created'],
      [$esd['sdContributions'], $esd['edContributions'], !empty($esd['graduation']) ? 1 : 0, !empty($esd['jobsCreated']) ? 1 : 0],
      'ddii'
    );

    // Supplier/Enterprise Development beneficiary registers — same shape
    // (name, spend, evidence status/note), two different tables.
    foreach (['sdBeneficiaries' => 'esd_sd_beneficiaries', 'edBeneficiaries' => 'esd_ed_beneficiaries'] as $jsKey => $table) {
      $mysqli->query('DELETE FROM ' . qi($table) . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
      foreach (($esd[$jsKey] ?? []) as $b) {
        $stmt = $mysqli->prepare('INSERT INTO ' . qi($table) . ' (id, scorecard_id, name, spend, evidence_status, evidence_rejection_note) VALUES (?,?,?,?,?,?)');
        $evidenceStatus = isset($b['evidenceStatus']) ? $b['evidenceStatus'] : 'Missing Documents';
        $evidenceNote = isset($b['evidenceRejectionNote']) ? $b['evidenceRejectionNote'] : '';
        $stmt->bind_param('sssdss', $b['id'], $id, $b['name'], $b['spend'], $evidenceStatus, $evidenceNote);
        $stmt->execute();
        $stmt->close();
      }
    }

    // Dated Payment Schedules (js/app.js: paymentScheduleCard()) — one row
    // per actual payment against an SD/ED beneficiary; calc.js never reads
    // these directly, only the beneficiary.spend total the frontend's
    // "Apply to beneficiaries" button rolls them up into (see
    // esd_sd_payments/esd_ed_payments comments in init.sql). Same shared-
    // table-name loop pattern as the beneficiaries above.
    foreach (['sdPayments' => 'esd_sd_payments', 'edPayments' => 'esd_ed_payments'] as $jsKey => $table) {
      $mysqli->query('DELETE FROM ' . qi($table) . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
      foreach (($esd[$jsKey] ?? []) as $p) {
        $stmt = $mysqli->prepare('INSERT INTO ' . qi($table) . ' (id, scorecard_id, beneficiary_id, payment_date, amount, reference, description, evidence_status, evidence_rejection_note) VALUES (?,?,?,?,?,?,?,?,?)');
        $payDate = !empty($p['date']) ? $p['date'] : null;
        $evidenceStatus = isset($p['evidenceStatus']) ? $p['evidenceStatus'] : 'Missing Documents';
        $evidenceNote = isset($p['evidenceRejectionNote']) ? $p['evidenceRejectionNote'] : '';
        // id, scorecard_id, beneficiary_id, payment_date all strings, then
        // amount (decimal), then reference/description/evidence_status/
        // evidence_rejection_note back to strings — 'ssssdssss' (9 chars),
        // verified against the 9-column list above rather than hand-counted.
        $stmt->bind_param('ssssdssss', $p['id'], $id, $p['beneficiaryId'], $payDate, $p['amount'], $p['reference'], $p['description'], $evidenceStatus, $evidenceNote);
        $stmt->execute();
        $stmt->close();
      }
    }

    $sed = isset($d['sed']) ? $d['sed'] : [];
    $mysqli->query('DELETE FROM ' . qi('sed_beneficiaries') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach ($sed['beneficiaries'] as $ben) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('sed_beneficiaries') . ' (id, scorecard_id, name, spend, evidence_status, evidence_rejection_note) VALUES (?,?,?,?,?,?)');
      $evidenceStatus = isset($ben['evidenceStatus']) ? $ben['evidenceStatus'] : 'Missing Documents';
      $evidenceNote = isset($ben['evidenceRejectionNote']) ? $ben['evidenceRejectionNote'] : '';
      $stmt->bind_param('sssdss', $ben['id'], $id, $ben['name'], $ben['spend'], $evidenceStatus, $evidenceNote);
      $stmt->execute();
      $stmt->close();
    }

    // SED's Payment Schedule — single-stage roll-up (no separate aggregate
    // contributions field the way ESD has; calc.js reads
    // sed_beneficiaries.spend directly), same shape as the ESD payments loop
    // above.
    $mysqli->query('DELETE FROM ' . qi('sed_payments') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach (($sed['payments'] ?? []) as $p) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('sed_payments') . ' (id, scorecard_id, beneficiary_id, payment_date, amount, reference, description, evidence_status, evidence_rejection_note) VALUES (?,?,?,?,?,?,?,?,?)');
      $payDate = !empty($p['date']) ? $p['date'] : null;
      $evidenceStatus = isset($p['evidenceStatus']) ? $p['evidenceStatus'] : 'Missing Documents';
      $evidenceNote = isset($p['evidenceRejectionNote']) ? $p['evidenceRejectionNote'] : '';
      $stmt->bind_param('ssssdssss', $p['id'], $id, $p['beneficiaryId'], $payDate, $p['amount'], $p['reference'], $p['description'], $evidenceStatus, $evidenceNote);
      $stmt->execute();
      $stmt->close();
    }

    upsert_row($mysqli, 'scorecard_sed', 'scorecard_id', $id, ['black_beneficiaries_pct'], [$sed['blackBeneficiariesPct']], 'd');

    // Training Programme register — one row per programme, not per person.
    $mysqli->query('DELETE FROM ' . qi('skills_programmes') . ' WHERE scorecard_id = ' . "'" . $mysqli->real_escape_string($id) . "'");
    foreach (($sk['programmes'] ?? []) as $prog) {
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('skills_programmes') . ' (id, scorecard_id, category, is_abet, is_mandatory, provider, participants, spend, support, evidence_status, evidence_rejection_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      $isAbet = !empty($prog['abet']) ? 1 : 0;
      $isMandatory = !empty($prog['mandatory']) ? 1 : 0;
      $participants = (int)($prog['participants'] ?? 0);
      $evidenceStatus = isset($prog['evidenceStatus']) ? $prog['evidenceStatus'] : 'Missing Documents';
      $evidenceNote = isset($prog['evidenceRejectionNote']) ? $prog['evidenceRejectionNote'] : '';
      $stmt->bind_param('sssiisidsss', $prog['id'], $id, $prog['category'], $isAbet, $isMandatory, $prog['provider'], $participants, $prog['spend'], $prog['support'], $evidenceStatus, $evidenceNote);
      $stmt->execute();
      $stmt->close();
    }

    $y = isset($d['yes']) ? $d['yes'] : [];
    upsert_row($mysqli, 'scorecard_yes', 'scorecard_id', $id,
      ['registered', 'maintained_level', 'headcount', 'participants'],
      [!empty($y['registered']) ? 1 : 0, !empty($y['maintainedLevel']) ? 1 : 0, (int)($y['headcount'] ?? 0), (int)($y['participants'] ?? 0)],
      'iiii'
    );

    $mysqli->commit();
  } catch (Exception $e) {
    $mysqli->rollback();
    throw $e;
  }
}

/* ---------------------------------------------------------------------------
   Routing
   --------------------------------------------------------------------------- */

if ($method === 'GET' && $scorecardId === '') {
  $accountId = isset($_GET['account_id']) ? $_GET['account_id'] : '';
  if ($accountId === '') json_error('Missing required field(s): account_id', 422, 'VALIDATION_ERROR');
  require_account_access($mysqli, $userId, $accountId);
  $ids = fetch_all($mysqli, 'SELECT id FROM ' . qi('scorecards') . ' WHERE account_id = ?', $accountId);
  $out = [];
  foreach ($ids as $row) $out[] = assemble_scorecard($mysqli, $row['id']);
  json_ok($out);
}

if ($method === 'GET' && $scorecardId !== '') {
  $sc = assemble_scorecard($mysqli, $scorecardId);
  if (!$sc) json_error('Scorecard not found.', 404, 'NOT_FOUND');
  $accountRow = fetch_one($mysqli, 'SELECT account_id FROM ' . qi('scorecards') . ' WHERE id = ?', $scorecardId);
  require_account_access($mysqli, $userId, $accountRow['account_id']);
  json_ok($sc);
}

if ($method === 'POST') {
  $body = read_json_body();
  require_fields($body, ['account_id']);
  require_account_access($mysqli, $userId, $body['account_id']);

  $id = gen_id('sc');
  $size = isset($body['size']) ? $body['size'] : 'Generic';
  $description = isset($body['description']) ? $body['description'] : ('New ' . $size . ' Scorecard');
  $defaultTargets = json_encode(['ownership' => new stdClass(), 'management' => new stdClass(), 'skills' => new stdClass(), 'esd' => new stdClass(), 'sed' => new stdClass()]);
  // ^ A minimal placeholder — the frontend always sends its own full
  // targets/goals object on the very next Save (tabGeneral renders them
  // from defaultTargets() in js/data.js immediately), so this only needs to
  // be valid JSON, not a perfect mirror of the JS defaults.
  $stmt = $mysqli->prepare(
    'INSERT INTO ' . qi('scorecards') . ' (id, account_id, description, size, targets, goals) VALUES (?, ?, ?, ?, ?, ?)'
  );
  $stmt->bind_param('ssssss', $id, $body['account_id'], $description, $size, $defaultTargets, $defaultTargets);
  $stmt->execute();
  $stmt->close();

  json_ok(assemble_scorecard($mysqli, $id), 201);
}

if ($method === 'PUT') {
  if ($scorecardId === '') json_error('Scorecard id required in the URL path.', 422, 'VALIDATION_ERROR');
  $accountRow = fetch_one($mysqli, 'SELECT account_id FROM ' . qi('scorecards') . ' WHERE id = ?', $scorecardId);
  if (!$accountRow) json_error('Scorecard not found.', 404, 'NOT_FOUND');
  require_account_access($mysqli, $userId, $accountRow['account_id']);

  $body = read_json_body();
  require_fields($body, ['description', 'size']);
  try {
    save_scorecard($mysqli, $scorecardId, $accountRow['account_id'], $body);
  } catch (Exception $e) {
    json_error('Save failed: ' . $e->getMessage(), 500, 'SAVE_FAILED');
  }
  json_ok(assemble_scorecard($mysqli, $scorecardId));
}

if ($method === 'DELETE') {
  if ($scorecardId === '') json_error('Scorecard id required in the URL path.', 422, 'VALIDATION_ERROR');
  $accountRow = fetch_one($mysqli, 'SELECT account_id FROM ' . qi('scorecards') . ' WHERE id = ?', $scorecardId);
  if (!$accountRow) json_error('Scorecard not found.', 404, 'NOT_FOUND');
  require_account_access($mysqli, $userId, $accountRow['account_id']);

  $stmt = $mysqli->prepare('DELETE FROM ' . qi('scorecards') . ' WHERE id = ?');
  $stmt->bind_param('s', $scorecardId);
  $stmt->execute();
  $stmt->close();
  http_response_code(204);
  exit;
}

json_error('Unsupported method for /api/scorecards.', 405, 'METHOD_NOT_ALLOWED');
