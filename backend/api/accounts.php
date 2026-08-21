<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/accounts.php — GET /api/accounts, PATCH /api/session/account

   Matches BACKEND.md's "Accounts" endpoint table. The frontend doesn't call
   either of these yet — today the Accounts page (#/accounts) is entirely
   local (see getAccountsIndex()/addAccount()/switchAccount() in
   js/data.js). This is here ready for whenever js/api.js grows the matching
   Api.listAccounts()/Api.switchAccount() functions.

   IMPORTANT: every other endpoint (scorecards.php, tasks.php, scenarios.php)
   takes account_id EXPLICITLY on each request rather than trusting an
   invisible "current account" kept on the server session — that's more
   robust (two browser tabs on two different accounts can't clobber each
   other) and means this file's PATCH is a convenience/acknowledgement only,
   never the thing that actually authorizes access — require_account_access()
   in db.php is what does that, on every request, every time.
   ========================================================================== */

require_once __DIR__ . '/db.php';
send_cors_headers();

$mysqli = db_connect();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $userId = require_auth($mysqli);
  $stmt = $mysqli->prepare(
    'SELECT a.id, a.name, a.tagline, a.logo_asset_path, a.created_at, ua.role ' .
    'FROM ' . qi('accounts') . ' a ' .
    'JOIN ' . qi('user_accounts') . ' ua ON ua.account_id = a.id ' .
    'WHERE ua.user_id = ? ORDER BY a.created_at ASC'
  );
  $stmt->bind_param('s', $userId);
  $stmt->execute();
  $res = $stmt->get_result();
  $accounts = [];
  while ($row = $res->fetch_assoc()) {
    $accounts[] = [
      'id' => $row['id'],
      'name' => $row['name'],
      'tagline' => $row['tagline'],
      'logoAssetPath' => $row['logo_asset_path'],
      'role' => $row['role'],
      'createdAt' => $row['created_at']
    ];
  }
  $stmt->close();
  json_ok($accounts);
}

if ($method === 'PATCH') {
  $userId = require_auth($mysqli);
  $body = read_json_body();
  require_fields($body, ['accountId']);
  require_account_access($mysqli, $userId, $body['accountId']);
  json_ok(['ok' => true]);
}

json_error('Unsupported method for /api/accounts.', 405, 'METHOD_NOT_ALLOWED');
