<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/tasks.php — the Implementation Plan tab (implementation_tasks table).
   Account-wide, not scorecard-scoped, matching BACKEND.md/js/api.js exactly:

     GET    /api/tasks?account_id=...        -> Task[]
     POST   /api/tasks                        -> 201 Task   (body includes account_id)
     PUT    /api/tasks/{id}                   -> 200 Task
     DELETE /api/tasks/{id}                   -> 204

   Task shape matches js/api.js's createTask()/updateTask() exactly:
   { id, title, element, owner, due, status, notes } — `due` here is
   `due_date` in the DB (a JS reserved-ish word to avoid in PHP variable
   names, kept as `due` on the wire so js/app.js needs zero changes).

   IMPORTANT: js/api.js's createTask() builds the task's id CLIENT-SIDE
   (uid('task')) and sends it as part of the POST body — this endpoint uses
   that id as-is rather than generating its own, exactly like scenarios.php
   does and unlike scorecards.php (which assigns server-side).
   ========================================================================== */

require_once __DIR__ . '/db.php';
send_cors_headers();

$mysqli = db_connect();
$userId = require_auth($mysqli);
$method = $_SERVER['REQUEST_METHOD'];

function task_row_to_json($row) {
  return [
    'id' => $row['id'],
    'title' => $row['title'],
    'element' => $row['element'],
    'owner' => $row['owner'],
    'due' => $row['due_date'],
    'status' => $row['status'],
    'notes' => $row['notes']
  ];
}

/** Every task id belongs to exactly one account — look it up so PUT/DELETE
    can run require_account_access() the same way GET/POST do. */
function task_account_id($mysqli, $taskId) {
  $stmt = $mysqli->prepare('SELECT account_id FROM ' . qi('implementation_tasks') . ' WHERE id = ?');
  $stmt->bind_param('s', $taskId);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  return $row ? $row['account_id'] : null;
}

$taskId = isset($_SERVER['PATH_INFO']) ? trim($_SERVER['PATH_INFO'], '/') : '';

if ($method === 'GET') {
  $accountId = isset($_GET['account_id']) ? $_GET['account_id'] : '';
  if ($accountId === '') json_error('Missing required field(s): account_id', 422, 'VALIDATION_ERROR');
  require_account_access($mysqli, $userId, $accountId);

  $stmt = $mysqli->prepare('SELECT * FROM ' . qi('implementation_tasks') . ' WHERE account_id = ? ORDER BY id ASC');
  $stmt->bind_param('s', $accountId);
  $stmt->execute();
  $res = $stmt->get_result();
  $tasks = [];
  while ($row = $res->fetch_assoc()) $tasks[] = task_row_to_json($row);
  $stmt->close();
  json_ok($tasks);
}

if ($method === 'POST') {
  $body = read_json_body();
  require_fields($body, ['id', 'account_id', 'title']);
  require_account_access($mysqli, $userId, $body['account_id']);

  $stmt = $mysqli->prepare(
    'INSERT INTO ' . qi('implementation_tasks') . ' (id, account_id, title, element, owner, due_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $element = isset($body['element']) ? $body['element'] : 'ownership';
  $owner = isset($body['owner']) ? $body['owner'] : '';
  $due = (isset($body['due']) && $body['due'] !== '') ? $body['due'] : null;
  $status = isset($body['status']) ? $body['status'] : 'Not Started';
  $notes = isset($body['notes']) ? $body['notes'] : '';
  $stmt->bind_param('ssssssss', $body['id'], $body['account_id'], $body['title'], $element, $owner, $due, $status, $notes);
  $stmt->execute();
  $stmt->close();
  json_ok(['id' => $body['id'], 'title' => $body['title'], 'element' => $element, 'owner' => $owner, 'due' => $due, 'status' => $status, 'notes' => $notes], 201);
}

if ($method === 'PUT') {
  if ($taskId === '') json_error('Task id required in the URL path.', 422, 'VALIDATION_ERROR');
  $accountId = task_account_id($mysqli, $taskId);
  if ($accountId === null) json_error('Task not found.', 404, 'NOT_FOUND');
  require_account_access($mysqli, $userId, $accountId);

  $body = read_json_body();
  require_fields($body, ['title']);
  $element = isset($body['element']) ? $body['element'] : 'ownership';
  $owner = isset($body['owner']) ? $body['owner'] : '';
  $due = (isset($body['due']) && $body['due'] !== '') ? $body['due'] : null;
  $status = isset($body['status']) ? $body['status'] : 'Not Started';
  $notes = isset($body['notes']) ? $body['notes'] : '';
  $stmt = $mysqli->prepare(
    'UPDATE ' . qi('implementation_tasks') . ' SET title=?, element=?, owner=?, due_date=?, status=?, notes=? WHERE id=?'
  );
  $stmt->bind_param('sssssss', $body['title'], $element, $owner, $due, $status, $notes, $taskId);
  $stmt->execute();
  $stmt->close();
  json_ok(['id' => $taskId, 'title' => $body['title'], 'element' => $element, 'owner' => $owner, 'due' => $due, 'status' => $status, 'notes' => $notes]);
}

if ($method === 'DELETE') {
  if ($taskId === '') json_error('Task id required in the URL path.', 422, 'VALIDATION_ERROR');
  $accountId = task_account_id($mysqli, $taskId);
  if ($accountId === null) json_error('Task not found.', 404, 'NOT_FOUND');
  require_account_access($mysqli, $userId, $accountId);

  $stmt = $mysqli->prepare('DELETE FROM ' . qi('implementation_tasks') . ' WHERE id = ?');
  $stmt->bind_param('s', $taskId);
  $stmt->execute();
  $stmt->close();
  http_response_code(204);
  exit;
}

json_error('Unsupported method for /api/tasks.', 405, 'METHOD_NOT_ALLOWED');
