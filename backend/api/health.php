<?php
/* Centenary Networks — B-BBEE Scorecard Tool
   api/health.php — GET /api/health
   No auth required — hit this first after deploying to Xneelo to confirm
   PHP is running and the database connection details in db.php are correct,
   before wiring up the real frontend. */

require_once __DIR__ . '/db.php';
send_cors_headers();

try {
  $mysqli = db_connect();
  $mysqli->query('SELECT 1');
  json_ok(['ok' => true]);
} catch (Exception $e) {
  json_error('Database not reachable: ' . $e->getMessage(), 500, 'DB_UNREACHABLE');
}
