<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/auth.php — POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me

   Matches BACKEND.md's "Auth" table exactly. There is no login screen in
   the frontend yet (js/app.js has no call to these) — this exists so the
   endpoints are ready the day someone builds one. When that happens: call
   POST /api/auth/login, then Api.setAuthToken(token) with the returned
   token — every other Api.* call already attaches it automatically.
   ========================================================================== */

require_once __DIR__ . '/db.php';
send_cors_headers();

$mysqli = db_connect();
$path = isset($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && $path === 'login') {
  $body = read_json_body();
  require_fields($body, ['email', 'password']);
  $email = trim($body['email']);
  $password = (string)$body['password'];

  $stmt = $mysqli->prepare('SELECT id, name, email, password_hash FROM ' . qi('users') . ' WHERE email = ?');
  $stmt->bind_param('s', $email);
  $stmt->execute();
  $user = $stmt->get_result()->fetch_assoc();
  $stmt->close();

  if (!$user || !password_verify($password, $user['password_hash'])) {
    json_error('Incorrect email or password.', 401, 'INVALID_CREDENTIALS');
  }

  $token = bin2hex(random_bytes(32));
  $expiresAt = date('Y-m-d H:i:s', time() + 60 * 60 * 24 * 30); // 30-day session
  $stmt = $mysqli->prepare('INSERT INTO ' . qi('sessions') . ' (token, user_id, expires_at) VALUES (?, ?, ?)');
  $stmt->bind_param('sss', $token, $user['id'], $expiresAt);
  $stmt->execute();
  $stmt->close();

  json_ok([
    'token' => $token,
    'user' => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']]
  ]);
}

if ($method === 'POST' && $path === 'logout') {
  $userId = require_auth($mysqli);
  $header = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
  preg_match('/^Bearer\s+(.+)$/i', trim($header), $m);
  $token = isset($m[1]) ? $m[1] : '';
  if ($token !== '') {
    $stmt = $mysqli->prepare('DELETE FROM ' . qi('sessions') . ' WHERE token = ?');
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $stmt->close();
  }
  http_response_code(204);
  exit;
}

if ($method === 'GET' && $path === 'me') {
  $userId = require_auth($mysqli);
  $stmt = $mysqli->prepare('SELECT id, name, email FROM ' . qi('users') . ' WHERE id = ?');
  $stmt->bind_param('s', $userId);
  $stmt->execute();
  $user = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  if (!$user) json_error('User not found.', 404, 'NOT_FOUND');
  json_ok($user);
}

json_error('Unknown auth action — expected ?action=login|logout|me.', 404, 'NOT_FOUND');
