<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/db.php — database connection + small shared helpers every endpoint
   file below (scorecards.php, tasks.php, etc.) requires_once at the top.

   Same shape as db.php in the Inzalo Yamaqhawe dashboard (mysqli, prepared
   statements, a qi() identifier-quoter) — kept deliberately simple/plain PHP
   with no framework or Composer dependency, since Xneelo shared hosting
   plans do not reliably give you shell access to install packages.

   FILL THESE IN before deploying — these are placeholders, not real
   credentials. Get the real values from Xneelo's control panel (MySQL
   Databases section) after you've created the database and a database user
   there. Never commit the real password to a public repo — if this project
   ever goes on GitHub, move these four lines into a separate untracked
   `db.local.php` that this file requires, or read them from environment
   variables the way the Inzalo dashboard's db.php optionally does.
   ========================================================================== */

define('DB_HOST', 'REPLACE_WITH_XNEELO_DB_HOST');     // e.g. 'sql11.jnb1.host-h.net' — same pattern as the Inzalo dashboard
define('DB_USER', 'REPLACE_WITH_XNEELO_DB_USER');     // Xneelo prefixes this, e.g. 'r43qd_something'
define('DB_PASS', 'REPLACE_WITH_XNEELO_DB_PASSWORD');
define('DB_NAME', 'REPLACE_WITH_XNEELO_DB_NAME');     // e.g. 'r43qd_centenarybee' — must match sql/init.sql's USE line

// Only used by bootstrap.php (the one-time first-account/first-user setup
// script) as a password-like guard so a random visitor can't call it and
// create themselves an account. Pick your own long random string here —
// bootstrap.php refuses to run without it matching, and you should delete
// bootstrap.php entirely once you've used it once (see the comment at the
// top of that file).
define('SETUP_SECRET', 'REPLACE_WITH_YOUR_OWN_RANDOM_SETUP_SECRET');

/**
 * Opens a fresh mysqli connection. Called once per request at the top of
 * every endpoint file — Xneelo shared hosting doesn't give you a
 * long-running PHP process to pool connections across requests anyway, so
 * there is no connection-pooling layer here, same as the Inzalo dashboard.
 */
function db_connect() {
  $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
  if ($mysqli->connect_errno) {
    // Surfaced through json_error() by whichever endpoint called this, so
    // the frontend's apiFetch() gets a proper { error: { message } } body
    // instead of a raw PHP fatal / blank page.
    throw new Exception('Database connection failed: ' . $mysqli->connect_error);
  }
  $mysqli->set_charset('utf8mb4');
  return $mysqli;
}

/** Backtick-quotes a table/column identifier safely. */
function qi($identifier) {
  return '`' . str_replace('`', '``', (string)$identifier) . '`';
}

/**
 * Every response leaves this file's control in exactly one of these two
 * shapes — matching BACKEND.md's "Error format" section and what
 * js/api.js's apiFetch() already expects on the frontend, so nothing there
 * needs to change once USE_REMOTE_API flips to true.
 */
function json_ok($data, $status = 200) {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}

function json_error($message, $status = 400, $code = 'ERROR') {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode(['error' => ['message' => $message, 'code' => $code]]);
  exit;
}

/**
 * CORS + preflight — the frontend (index.html) is a static file that can be
 * hosted anywhere (opened via file://, or on a different subdomain from the
 * API), so every endpoint needs these headers. Tighten
 * Access-Control-Allow-Origin to your actual frontend origin once you know
 * it (e.g. 'https://tool.centenarynetworks.com') instead of '*'.
 */
function send_cors_headers() {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
  }
}

/**
 * Reads the JSON body of the current request (POST/PUT/PATCH). Returns an
 * empty array if the body is missing or not valid JSON, rather than
 * throwing — callers decide what's required and call json_error()
 * themselves with a clear message (see require_fields() below).
 */
function read_json_body() {
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

/** json_error()s with one message listing every missing required key. */
function require_fields($body, $required) {
  $missing = [];
  foreach ($required as $field) {
    if (!array_key_exists($field, $body) || $body[$field] === '' || $body[$field] === null) $missing[] = $field;
  }
  if (!empty($missing)) json_error('Missing required field(s): ' . implode(', ', $missing), 422, 'VALIDATION_ERROR');
}

/**
 * Every endpoint except auth/health calls this first. Reads the bearer
 * token js/api.js already sends (`Authorization: Bearer <token>` — see
 * authHeaders() in js/api.js), looks it up in `sessions`, and returns the
 * signed-in user's id. json_error(401)s and exits if the token is missing,
 * unknown, or expired — matching BACKEND.md's Auth section: every Api.*
 * call attaches this automatically once Api.setAuthToken() has been called
 * client-side, so nothing on the frontend needs to change here.
 */
function require_auth($mysqli) {
  $header = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
  if ($header === '' && function_exists('apache_request_headers')) {
    // Some PHP/Apache setups strip the Authorization header from $_SERVER —
    // this is the standard fallback for that (same header, different place).
    $headers = apache_request_headers();
    if (isset($headers['Authorization'])) $header = $headers['Authorization'];
  }
  if (!preg_match('/^Bearer\s+(.+)$/i', trim($header), $m)) {
    json_error('Missing or malformed Authorization header.', 401, 'UNAUTHENTICATED');
  }
  $token = $m[1];
  $stmt = $mysqli->prepare('SELECT user_id, expires_at FROM ' . qi('sessions') . ' WHERE token = ?');
  $stmt->bind_param('s', $token);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  if (!$row) json_error('Session not found — please sign in again.', 401, 'UNAUTHENTICATED');
  if ($row['expires_at'] !== null && strtotime($row['expires_at']) < time()) {
    json_error('Session expired — please sign in again.', 401, 'SESSION_EXPIRED');
  }
  return $row['user_id'];
}

/**
 * Confirms $userId actually belongs to $accountId (via user_accounts) before
 * letting a request touch that account's scorecards/tasks — every
 * scorecard/task/scenario endpoint below calls this right after
 * require_auth(), so one account can never read or write another account's
 * data even if it guesses/enumerates ids.
 */
function require_account_access($mysqli, $userId, $accountId) {
  $stmt = $mysqli->prepare('SELECT 1 FROM ' . qi('user_accounts') . ' WHERE user_id = ? AND account_id = ?');
  $stmt->bind_param('ss', $userId, $accountId);
  $stmt->execute();
  $ok = $stmt->get_result()->fetch_row();
  $stmt->close();
  if (!$ok) json_error('You do not have access to this account.', 403, 'FORBIDDEN');
}

/** Same random-id shape as uid() in js/data.js — 'prefix_8randomchars'. */
function gen_id($prefix) {
  return $prefix . '_' . substr(bin2hex(random_bytes(6)), 0, 8);
}

/**
 * Insert-or-update-in-place for every 1:1 child table (scorecard_ownership,
 * scorecard_skills, scorecard_esd, scorecard_sed, scorecard_yes,
 * person_portfolios) — shared by scorecards.php and portfolio.php, which is
 * why it lives here rather than in either one alone. $keyCol/$keyVal is
 * always the VARCHAR foreign key this table is 1:1 against (e.g.
 * 'scorecard_id' / the scorecard's id, or 'person_id' / the person's id);
 * $cols/$vals/$types describe every OTHER column, in the same order — the
 * key column's own type is always 's' and is prepended for you.
 */
function upsert_row($mysqli, $table, $keyCol, $keyVal, $cols, $vals, $types) {
  $setSql = implode(', ', array_map(function ($c) { return qi($c) . ' = VALUES(' . qi($c) . ')'; }, $cols));
  $allCols = array_merge([$keyCol], $cols);
  $sql = 'INSERT INTO ' . qi($table) . ' (' . implode(', ', array_map('qi', $allCols)) . ') VALUES (' .
    implode(', ', array_fill(0, count($allCols), '?')) . ') ON DUPLICATE KEY UPDATE ' . $setSql;
  $stmt = $mysqli->prepare($sql);
  $allVals = array_merge([$keyVal], $vals);
  $allTypes = 's' . $types;
  $stmt->bind_param($allTypes, ...$allVals);
  $stmt->execute();
  $stmt->close();
}
