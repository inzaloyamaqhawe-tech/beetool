<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/portfolio.php — Portfolio of Evidence uploads (User Portfolios screen)

     POST  /api/portfolio.php?scorecard_id=...&person_id=...   multipart/form-data, field "file"
     PATCH /api/portfolio.php?scorecard_id=...&person_id=...   { status, rejectionNote? }
     GET   /api/portfolio.php?scorecard_id=...                 -> PersonPortfolio[] for that scorecard

   Matches BACKEND.md's "Portfolio of Evidence uploads" table exactly — the
   one exception to "everything rides along with the scorecard PUT", since a
   file can't travel inside a JSON body.

   FILE STORAGE: this saves the PDF onto the server's own disk, under
   /uploads/portfolios/ next to this folder, and stores that path in
   person_portfolios.file_url. That is a reasonable default for Xneelo
   shared hosting (no S3/object storage available there by default) — if you
   later move to real object storage, only the two lines marked below need
   to change; nothing on the frontend does, since it only ever reads back
   whatever fileUrl this endpoint returns.
   ========================================================================== */

require_once __DIR__ . '/db.php';
send_cors_headers();

$mysqli = db_connect();
$userId = require_auth($mysqli);
$method = $_SERVER['REQUEST_METHOD'];

$scorecardId = isset($_GET['scorecard_id']) ? $_GET['scorecard_id'] : '';
$personId = isset($_GET['person_id']) ? $_GET['person_id'] : '';
if ($scorecardId === '') json_error('Missing required field(s): scorecard_id', 422, 'VALIDATION_ERROR');

$scRow = fetch_scorecard_account($mysqli, $scorecardId);
if (!$scRow) json_error('Scorecard not found.', 404, 'NOT_FOUND');
require_account_access($mysqli, $userId, $scRow['account_id']);

function fetch_scorecard_account($mysqli, $scorecardId) {
  $stmt = $mysqli->prepare('SELECT account_id FROM ' . qi('scorecards') . ' WHERE id = ?');
  $stmt->bind_param('s', $scorecardId);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  return $row;
}

if ($method === 'GET') {
  $stmt = $mysqli->prepare(
    'SELECT pp.* FROM ' . qi('person_portfolios') . ' pp ' .
    'JOIN ' . qi('people') . ' p ON p.id = pp.person_id ' .
    'WHERE p.scorecard_id = ?'
  );
  $stmt->bind_param('s', $scorecardId);
  $stmt->execute();
  $res = $stmt->get_result();
  $out = [];
  while ($row = $res->fetch_assoc()) {
    $out[] = [
      'personId' => $row['person_id'], 'fileUrl' => $row['file_url'], 'fileName' => $row['file_name'],
      'fileSize' => (int)$row['file_size'], 'status' => $row['status'], 'rejectionNote' => $row['rejection_note'],
      'uploadedAt' => $row['uploaded_at'], 'reviewedAt' => $row['reviewed_at']
    ];
  }
  $stmt->close();
  json_ok($out);
}

if ($method === 'POST') {
  if ($personId === '') json_error('Missing required field(s): person_id', 422, 'VALIDATION_ERROR');
  if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    json_error('No file uploaded (expected multipart/form-data field "file").', 422, 'VALIDATION_ERROR');
  }
  $file = $_FILES['file'];

  // Enforce PDF-only and a max size server-side too — never trust the
  // client-side check alone (js/data.js's PORTFOLIO_MAX_FILE_MB is a UX
  // nicety, not a security boundary).
  $maxBytes = 15 * 1024 * 1024;
  if ($file['size'] > $maxBytes) json_error('File is larger than 15MB.', 422, 'FILE_TOO_LARGE');
  $finfo = finfo_open(FILEINFO_MIME_TYPE);
  $mime = finfo_file($finfo, $file['tmp_name']);
  finfo_close($finfo);
  if ($mime !== 'application/pdf') json_error('Only PDF files are accepted.', 422, 'INVALID_FILE_TYPE');

  // --- storage: change these two lines if you move to S3-compatible object storage ---
  $uploadDir = __DIR__ . '/../uploads/portfolios/';
  if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
  $storedName = $personId . '_' . time() . '.pdf';
  move_uploaded_file($file['tmp_name'], $uploadDir . $storedName);
  $fileUrl = 'uploads/portfolios/' . $storedName; // relative to this api/ folder's parent — adjust to a full URL once you know this API's public base path
  // --- end storage block ---

  $uploadedAt = date('c');
  $status = 'Uploaded (Pending Review)';
  upsert_row($mysqli, 'person_portfolios', 'person_id', $personId,
    ['file_url', 'file_name', 'file_size', 'mime_type', 'status', 'rejection_note', 'uploaded_at'],
    [$fileUrl, $file['name'], $file['size'], $mime, $status, '', $uploadedAt],
    'ssissss' // 7 columns above -> 7 type chars: s,s,i(file_size),s,s,s,s
  );

  json_ok(['status' => $status, 'fileUrl' => $fileUrl, 'uploadedAt' => $uploadedAt], 201);
}

if ($method === 'PATCH') {
  if ($personId === '') json_error('Missing required field(s): person_id', 422, 'VALIDATION_ERROR');
  $body = read_json_body();
  require_fields($body, ['status']);
  if (!in_array($body['status'], ['Approved', 'Rejected'], true)) {
    json_error('status must be "Approved" or "Rejected".', 422, 'VALIDATION_ERROR');
  }
  $note = ($body['status'] === 'Rejected' && isset($body['rejectionNote'])) ? $body['rejectionNote'] : '';
  $reviewedAt = date('c');
  $stmt = $mysqli->prepare(
    'UPDATE ' . qi('person_portfolios') . ' SET status=?, rejection_note=?, reviewed_at=?, reviewed_by=? WHERE person_id=?'
  );
  $stmt->bind_param('sssss', $body['status'], $note, $reviewedAt, $userId, $personId);
  $stmt->execute();
  $stmt->close();
  json_ok(['status' => $body['status'], 'rejectionNote' => $note]);
}

json_error('Unsupported method for /api/portfolio.', 405, 'METHOD_NOT_ALLOWED');
