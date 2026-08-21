<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/scenarios.php — saved what-if snapshots from the Scenario Planner.

     GET    /api/scenarios?scorecard_id=...   -> Scenario[]
     POST   /api/scenarios                     -> 201 Scenario (client-generated id, per BACKEND.md)
     DELETE /api/scenarios/{id}                -> 204

   Access is resolved through the scenario's scorecard -> account, same
   pattern as tasks.php resolving through account_id directly.
   ========================================================================== */

require_once __DIR__ . '/db.php';
send_cors_headers();

$mysqli = db_connect();
$userId = require_auth($mysqli);
$method = $_SERVER['REQUEST_METHOD'];

function scenario_row_to_json($row) {
  return [
    'id' => $row['id'],
    'scorecardId' => $row['scorecard_id'],
    'name' => $row['name'],
    'drivers' => $row['drivers'] !== null ? json_decode($row['drivers'], true) : null,
    'resultTotal' => $row['result_total'] !== null ? (float)$row['result_total'] : null,
    'resultLevel' => $row['result_level'],
    'createdAt' => $row['created_at']
  ];
}

/** scorecard_id -> account_id, for access-checking a request that only
    supplies a scorecard id (mirrors task_account_id() in tasks.php). */
function scorecard_account_id($mysqli, $scorecardId) {
  $stmt = $mysqli->prepare('SELECT account_id FROM ' . qi('scorecards') . ' WHERE id = ?');
  $stmt->bind_param('s', $scorecardId);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  return $row ? $row['account_id'] : null;
}

$scenarioId = isset($_SERVER['PATH_INFO']) ? trim($_SERVER['PATH_INFO'], '/') : '';

if ($method === 'GET') {
  $scorecardId = isset($_GET['scorecard_id']) ? $_GET['scorecard_id'] : '';
  if ($scorecardId === '') json_error('Missing required field(s): scorecard_id', 422, 'VALIDATION_ERROR');
  $accountId = scorecard_account_id($mysqli, $scorecardId);
  if ($accountId === null) json_error('Scorecard not found.', 404, 'NOT_FOUND');
  require_account_access($mysqli, $userId, $accountId);

  $stmt = $mysqli->prepare('SELECT * FROM ' . qi('scenarios') . ' WHERE scorecard_id = ? ORDER BY created_at ASC');
  $stmt->bind_param('s', $scorecardId);
  $stmt->execute();
  $res = $stmt->get_result();
  $scenarios = [];
  while ($row = $res->fetch_assoc()) $scenarios[] = scenario_row_to_json($row);
  $stmt->close();
  json_ok($scenarios);
}

if ($method === 'POST') {
  $body = read_json_body();
  require_fields($body, ['id', 'scorecardId', 'name']);
  $accountId = scorecard_account_id($mysqli, $body['scorecardId']);
  if ($accountId === null) json_error('Scorecard not found.', 404, 'NOT_FOUND');
  require_account_access($mysqli, $userId, $accountId);

  $drivers = isset($body['drivers']) ? json_encode($body['drivers']) : null;
  $resultTotal = isset($body['resultTotal']) ? $body['resultTotal'] : null;
  $resultLevel = isset($body['resultLevel']) ? $body['resultLevel'] : null;
  $stmt = $mysqli->prepare(
    'INSERT INTO ' . qi('scenarios') . ' (id, scorecard_id, name, drivers, result_total, result_level) VALUES (?, ?, ?, ?, ?, ?)'
  );
  $stmt->bind_param('ssssds', $body['id'], $body['scorecardId'], $body['name'], $drivers, $resultTotal, $resultLevel);
  $stmt->execute();
  $stmt->close();

  json_ok([
    'id' => $body['id'], 'scorecardId' => $body['scorecardId'], 'name' => $body['name'],
    'drivers' => isset($body['drivers']) ? $body['drivers'] : null,
    'resultTotal' => $resultTotal, 'resultLevel' => $resultLevel,
    'createdAt' => date('c')
  ], 201);
}

if ($method === 'DELETE') {
  if ($scenarioId === '') json_error('Scenario id required in the URL path.', 422, 'VALIDATION_ERROR');
  $stmt = $mysqli->prepare('SELECT scorecard_id FROM ' . qi('scenarios') . ' WHERE id = ?');
  $stmt->bind_param('s', $scenarioId);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  if (!$row) json_error('Scenario not found.', 404, 'NOT_FOUND');
  $accountId = scorecard_account_id($mysqli, $row['scorecard_id']);
  require_account_access($mysqli, $userId, $accountId);

  $stmt = $mysqli->prepare('DELETE FROM ' . qi('scenarios') . ' WHERE id = ?');
  $stmt->bind_param('s', $scenarioId);
  $stmt->execute();
  $stmt->close();
  http_response_code(204);
  exit;
}

json_error('Unsupported method for /api/scenarios.', 405, 'METHOD_NOT_ALLOWED');
