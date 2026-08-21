<?php
/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api/bootstrap.php — ONE-TIME setup: creates the first account + first
   user + links them, so there's something to log in with at all.

   There's no registration screen anywhere in this system (same as the
   Inzalo Yamaqhawe dashboard, whose equivalent is sql/reset_admin_account.sql
   — a precomputed bcrypt hash pasted into raw SQL). This does the same job
   as a small PHP page instead, since PHP's password_hash() needs to run
   somewhere to produce a real hash, and there's no PHP available to
   pre-generate one outside of the actual server.

   HOW TO USE
   ----------
   1. Set SETUP_SECRET in db.php to your own random string first.
   2. Upload this whole backend/api/ folder (plus sql/init.sql imported via
      phpMyAdmin) to Xneelo.
   3. Visit this file in a browser once:
        https://your-domain/api/bootstrap.php?secret=YOUR_SETUP_SECRET
      and fill in the form (account name, your name, email, password).
   4. Confirm it worked, then log in via POST /api/auth/login with that
      email/password once a login screen exists (or test it directly with
      curl/Postman).
   5. DELETE THIS FILE from the server. It refuses to run a second time
      (see the "already set up" guard below) but there is no reason to
      leave a setup endpoint reachable indefinitely.
   ========================================================================== */

require_once __DIR__ . '/db.php';

$secret = isset($_GET['secret']) ? $_GET['secret'] : (isset($_POST['secret']) ? $_POST['secret'] : '');
if (!hash_equals(SETUP_SECRET, $secret) || SETUP_SECRET === 'REPLACE_WITH_YOUR_OWN_RANDOM_SETUP_SECRET') {
  http_response_code(403);
  echo 'Forbidden — set SETUP_SECRET in db.php to your own value first, then pass it as ?secret=...';
  exit;
}

$mysqli = db_connect();

// Idempotent guard: refuse once ANY account already exists, so this can't
// accidentally be run twice and create duplicate/confusing accounts.
$existing = $mysqli->query('SELECT COUNT(*) AS n FROM ' . qi('accounts'))->fetch_assoc();
$alreadySetUp = ((int)$existing['n']) > 0;

$message = '';
$ok = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$alreadySetUp) {
  $accountName = trim($_POST['account_name'] ?? '');
  $userName = trim($_POST['user_name'] ?? '');
  $email = trim($_POST['email'] ?? '');
  $password = (string)($_POST['password'] ?? '');

  if ($accountName === '' || $userName === '' || $email === '' || strlen($password) < 8) {
    $message = 'All fields are required and password must be at least 8 characters.';
  } else {
    $mysqli->begin_transaction();
    try {
      // Matches the id the local (no-backend) frontend already uses for its
      // one default account — see defaultAccountsIndex() in js/data.js —
      // so the ids line up if you ever compare local vs. remote data.
      $accountId = 'acc_centenary';
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('accounts') . ' (id, name, tagline) VALUES (?, ?, ?)');
      $tagline = 'The Heart of Excellence';
      $stmt->bind_param('sss', $accountId, $accountName, $tagline);
      $stmt->execute();
      $stmt->close();

      $userId = gen_id('user');
      $hash = password_hash($password, PASSWORD_BCRYPT);
      $stmt = $mysqli->prepare('INSERT INTO ' . qi('users') . ' (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
      $stmt->bind_param('ssss', $userId, $userName, $email, $hash);
      $stmt->execute();
      $stmt->close();

      $stmt = $mysqli->prepare('INSERT INTO ' . qi('user_accounts') . ' (user_id, account_id, role) VALUES (?, ?, ?)');
      $role = 'owner';
      $stmt->bind_param('sss', $userId, $accountId, $role);
      $stmt->execute();
      $stmt->close();

      $mysqli->commit();
      $ok = true;
      $message = 'Created account "' . htmlspecialchars($accountName) . '" and user "' . htmlspecialchars($email) . '". You can now log in via POST /api/auth/login. DELETE this file from the server now.';
      $alreadySetUp = true;
    } catch (Exception $e) {
      $mysqli->rollback();
      $message = 'ERROR: ' . $e->getMessage();
    }
  }
}
?>
<!doctype html><html><head><meta charset="utf-8"><title>Centenary Networks — First-time setup</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1d1d1f}
label{display:block;margin:14px 0 4px;font-weight:600}input{width:100%;padding:8px;border:1px solid #d2d2d7;border-radius:6px;box-sizing:border-box}
button{margin-top:18px;padding:10px 18px;background:#c81913;color:#fff;border:none;border-radius:999px;font-weight:600;cursor:pointer}
.msg{margin-top:16px;padding:12px;border-radius:6px}.ok{background:#e6f6ec;color:#1a7a45}.err{background:#fdeaea;color:#a11310}</style>
</head><body>
<h1>First-time setup</h1>
<?php if ($alreadySetUp && !$ok): ?>
  <p>An account already exists — this script only runs once. Delete this file from the server.</p>
<?php else: ?>
  <?php if ($message): ?><p class="msg <?php echo $ok ? 'ok' : 'err'; ?>"><?php echo $message; ?></p><?php endif; ?>
  <?php if (!$ok): ?>
  <form method="post">
    <input type="hidden" name="secret" value="<?php echo htmlspecialchars($secret); ?>">
    <label>Account name<br><input name="account_name" value="Centenary Networks" required></label>
    <label>Your name<br><input name="user_name" required></label>
    <label>Email<br><input name="email" type="email" required></label>
    <label>Password (min. 8 characters)<br><input name="password" type="password" required minlength="8"></label>
    <button type="submit">Create account</button>
  </form>
  <?php endif; ?>
<?php endif; ?>
</body></html>
