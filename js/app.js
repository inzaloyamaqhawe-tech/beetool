/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   app.js — router, view renderers, event wiring
   ========================================================================== */

/* Plain vector glyph (no emoji) used on every delete/remove control in the app. */
const ICON_CLOSE = '<svg class="icon-x" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

/* --------------------------------- Utilities --------------------------------- */

function getPath(obj, path) {
  return path.split('.').reduce(function (o, k) { return (o == null ? o : o[k]); }, obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ---------------------------------- Router ------------------------------------ */

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'scorecard' && parts[1]) {
    return { route: 'scorecard', id: parts[1], tab: parts[2] || 'general' };
  }
  return { route: parts[0] || 'dashboard' };
}

/* The Switch To bar groups Scenarios + Implementation Plan under one
   "Planning" dropdown — this maps an actual route to which top-level nav
   item (real or dropdown-trigger) should read as active. */
function navKeyFor(route) {
  if (route === 'scorecard') return 'scorecards';
  if (route === 'scenarios' || route === 'implementation') return 'planning';
  return route;
}

let CURRENT_ROUTE = null;

function render() {
  const r = parseHash();
  CURRENT_ROUTE = r;

  const navKey = navKeyFor(r.route);
  document.body.dataset.section = navKey;
  qsa('.mainnav-item').forEach(function (a) { a.classList.toggle('active', a.dataset.route === navKey); });
  qsa('.mega-menu a[data-route]').forEach(function (a) { a.classList.toggle('active', a.dataset.route === r.route); });
  closeAllDropdowns();
  renderScorecardsDropdown();
  renderAccountsDropdown();
  renderTeamDropdown();

  const root = document.getElementById('view-root');
  let html = '';
  try {
    switch (r.route) {
      case 'dashboard': html = viewDashboard(); break;
      case 'scorecards': html = viewScorecardsList(); break;
      case 'scorecard': html = viewScorecardWorkspace(r.id, r.tab); break;
      case 'scenarios': html = viewScenarios(); break;
      case 'targets': html = viewTargets(); break;
      case 'implementation': html = viewImplementation(); break;
      case 'portfolios': html = viewPortfolios(); break;
      case 'accounts': html = viewAccounts(); break;
      default: html = viewDashboard();
    }
  } catch (e) {
    console.error(e);
    html = '<div class="card"><h2>Something went wrong</h2><p class="muted">' + esc(e.message) + '</p></div>';
  }
  root.innerHTML = html;

  const crumbEl = document.getElementById('crumb');
  if (r.route === 'scorecard') {
    const sc = getScorecard(r.id);
    crumbEl.textContent = 'Scorecard Calculator / ' + (sc ? sc.description : '');
  } else if (r.route === 'portfolios') {
    crumbEl.textContent = 'User Portfolios';
  } else if (r.route === 'accounts') {
    crumbEl.textContent = 'Accounts';
  } else {
    crumbEl.textContent = 'Scorecard Calculator';
  }

  afterRender(r);
}

function afterRender(r) {
  if (r.route === 'dashboard') mountDashboardChart();
  if (r.route === 'scorecard') mountLevelBanner(getScorecard(r.id));
  if (r.route === 'scorecard' && r.tab === 'insights') mountInsightsCharts(getScorecard(r.id));
  if (r.route === 'scorecard' && r.tab === 'ee') mountEECharts(getScorecard(r.id));
  if (r.route === 'scenarios') wireScenarioSliders();
  scrollActiveTabIntoView();
}

/* The scorecard tab bar (.tabbar-wrap) scrolls horizontally on narrower
   screens/many tabs. Every navigation replaces its HTML wholesale, which
   resets that scroll position back to the start — so clicking "EE Insights"
   (near the end) would mark it active but scroll it back out of view,
   forcing a scroll to reach it or its neighbours again. Re-center the active
   tab after every render instead of leaving that to chance. */
function scrollActiveTabIntoView() {
  const active = qs('.tabbar a.active, .tabbar button.tab-btn.active');
  if (active) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

/* -------------------------------- Primary nav mega-menus ------------------------- */

function closeAllDropdowns() {
  qsa('.mainnav-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
}

/* The Scorecards nav item is itself a mega-menu ("burger menu structure")
   quick-switcher: your most recently created scorecards (each with its level
   as a one-line description, website-nav style), plus a link to the full
   list. Content is dynamic (depends on STATE.scorecards), so it's populated
   here rather than hardcoded in index.html. */
function renderScorecardsDropdown() {
  const menu = document.getElementById('scorecards-dropdown-menu');
  if (!menu) return;
  const docIco = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';
  const allIco = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>';
  const recent = STATE.scorecards
    .filter(function (s) { return !s.archived; })
    .slice()
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, 5);
  const items = recent.map(function (s) {
    let desc = s.size;
    try { desc = 'Level ' + calcAll(s).level.level + ' · ' + s.size; } catch (e) {}
    return '<a class="mega-item" href="#/scorecard/' + s.id + '/general">' +
      '<span class="mega-ico">' + docIco + '</span>' +
      '<span class="mega-text"><span class="mega-title">' + esc(s.description) + '</span><span class="mega-desc">' + esc(desc) + '</span></span>' +
    '</a>';
  }).join('');
  menu.innerHTML =
    (items ? '<span class="mega-heading">Recent scorecards</span>' + items + '<div class="mega-divider"></div>' : '') +
    '<a class="mega-item" href="#/scorecards">' +
      '<span class="mega-ico">' + allIco + '</span>' +
      '<span class="mega-text"><span class="mega-title">View all scorecards</span><span class="mega-desc">Browse, archive or start a new one.</span></span>' +
    '</a>';
}

const ACCOUNT_ICO = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-6h6v6M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>';

/* "Accounts" — every account under the Centenary umbrella, each with its own
   scorecards, company profile and performance, kept genuinely separate (see
   js/data.js: each account is its own localStorage blob, not a shared one
   with a label). Quick-switch here mirrors the Scorecards mega-menu
   (recent items + "View all"); the full roster + "Add new account" lives on
   its own page at #/accounts. */
function renderAccountsDropdown() {
  const menu = document.getElementById('accounts-dropdown-menu');
  if (!menu) return;
  const idx = getAccountsIndex();
  const items = idx.accounts.slice(0, 5).map(function (a) {
    const isActive = a.id === idx.activeAccountId;
    return '<button type="button" class="mega-item" style="width:100%;text-align:left;border:none;background:' + (isActive ? 'var(--accent-soft)' : 'none') + ';cursor:pointer;font:inherit" data-action="switch-account" data-id="' + a.id + '">' +
      '<span class="mega-ico">' + ACCOUNT_ICO + '</span>' +
      '<span class="mega-text"><span class="mega-title">' + esc(a.name) + (isActive ? ' — current' : '') + '</span><span class="mega-desc">Its own scorecards and B-BBEE performance</span></span>' +
    '</button>';
  }).join('');
  menu.innerHTML = '<span class="mega-heading">Accounts under Centenary Networks</span>' + items +
    '<div class="mega-divider"></div>' +
    '<a class="mega-item" href="#/accounts">' +
      '<span class="mega-ico">' + ACCOUNT_ICO + '</span>' +
      '<span class="mega-text"><span class="mega-title">View all accounts</span><span class="mega-desc">Manage accounts or add a new one.</span></span>' +
    '</a>';
}

/* "Team" — the signed-in session (this is what the CEO used to log in/out
   of on the original account). No real backend auth exists yet, so Sign
   out/Sign in here is a genuine local session toggle, not a security
   boundary — it's documented as such in BACKEND.md alongside the real
   sessions table a login endpoint would need. */
function renderTeamDropdown() {
  const menu = document.getElementById('team-dropdown-menu');
  const nameEl = document.getElementById('team-name');
  if (!menu || !nameEl) return;
  const session = getAccountsIndex().session || { signedIn: true, name: 'Centenary Team' };
  nameEl.textContent = session.signedIn ? session.name : 'Signed out';
  const personIco = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
  const role = currentRole();
  const roleLabels = { owner: 'Owner / Preparer', reviewer: 'Reviewer', viewer: 'Viewer (read-only)' };
  const roleSwitcher = '<div class="mega-menu-note">Role — controls whether evidence status/portfolio controls are editable.</div>' +
    USER_ROLES.map(function (r) {
      return '<button type="button" class="mega-item" style="width:100%;text-align:left;border:none;background:' + (r === role ? 'var(--accent-soft)' : 'none') + ';cursor:pointer;font:inherit" data-action="set-role" data-role="' + r + '">' +
        '<span class="mega-ico">' + personIco + '</span><span class="mega-text"><span class="mega-title">' + esc(roleLabels[r]) + (r === role ? ' — current' : '') + '</span></span>' +
      '</button>';
    }).join('');
  menu.innerHTML = session.signedIn
    ? ('<div class="mega-item"><span class="mega-ico">' + personIco + '</span><span class="mega-text"><span class="mega-title">' + esc(session.name) + '</span><span class="mega-desc">Signed in on this device</span></span></div>' +
       '<div class="mega-divider"></div>' +
       roleSwitcher +
       '<div class="mega-divider"></div>' +
       '<button type="button" class="mega-item" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;font:inherit" data-action="sign-out">' +
         '<span class="mega-ico">' + personIco + '</span><span class="mega-text"><span class="mega-title">Sign out</span></span>' +
       '</button>')
    : ('<div class="mega-menu-note">You\'re signed out on this device.</div>' +
       '<button type="button" class="mega-item" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;font:inherit" data-action="sign-in">' +
         '<span class="mega-ico">' + personIco + '</span><span class="mega-text"><span class="mega-title">Sign in as ' + esc(session.name) + '</span></span>' +
       '</button>');
}

document.addEventListener('click', function (e) {
  const toggle = e.target.closest('[data-dropdown-toggle]');
  if (toggle) {
    e.preventDefault();
    const dropdown = document.getElementById(toggle.dataset.dropdownToggle);
    const wasOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) dropdown.classList.add('open');
    return;
  }
  if (!e.target.closest('.mainnav-dropdown')) closeAllDropdowns();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllDropdowns(); });

/* Scorecard section dropdown (tabBar()) — navigational, not a data-bound
   field, so it's handled separately from the generic [data-bind] listener. */
document.addEventListener('change', function (e) {
  const sel = e.target.closest('[data-tab-select]');
  if (!sel) return;
  location.hash = '#/scorecard/' + sel.dataset.scid + '/' + sel.value;
});

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', function () {
  if (!location.hash) location.hash = '#/dashboard';
  render();
});

/* ---------------------------- Delegated form handling -------------------------- */

document.addEventListener('change', function (e) {
  const t = e.target;
  if (!t.matches('[data-bind]')) return;
  const scId = t.dataset.scid;
  const sc = scId ? getScorecard(scId) : null;
  const target = sc || STATE;
  let value;
  if (t.type === 'checkbox') value = t.checked;
  else if (t.dataset.type === 'number') {
    value = parseFloat(t.value) || 0;
    // Round on save too, so a value typed with more precision than we display
    // (e.g. "62.3456") is stored the same way it's shown: 2dp for money/percentages,
    // whole numbers for headcounts/years.
    value = t.dataset.round === 'int' ? Math.round(value) : round2(value);
  }
  else value = t.value;
  setPath(target, t.dataset.bind, value);
  persist();
  render();
});

/* NOTE for the backend integration: every branch below that touches a whole
   resource (a scorecard, a task, a scenario) goes through Api.* — that is
   deliberately the ONLY place this file talks to data. Per-field edits (the
   'change' listener above) — including "+ Add Person" and the other roster/
   register rows nested on a scorecard — still write straight to STATE for a
   fast, responsive local draft; Api.saveScorecard() (the Save bar on every
   scorecard screen) is the explicit "commit this resource" boundary a real
   backend hooks into. See js/api.js. */
document.addEventListener('click', async function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const scId = btn.dataset.scid;
  const sc = scId ? getScorecard(scId) : null;

  if (action === 'sign-out') {
    getAccountsIndex().session.signedIn = false;
    persistAccountsIndex(); render();
  } else if (action === 'sign-in') {
    getAccountsIndex().session.signedIn = true;
    persistAccountsIndex(); render();
  } else if (action === 'switch-account') {
    switchAccount(btn.dataset.id);
  } else if (action === 'set-role') {
    // Reviewer Mode (Step 8) — a local role toggle, not real auth (see the
    // comment above renderTeamDropdown()). Owner/preparer can edit
    // everything; Reviewer can still approve/reject evidence and add notes;
    // Viewer sees the same data read-only — evidenceStatusCell() and
    // portfolioRow() both check currentRole() to disable their controls.
    getAccountsIndex().session.role = btn.dataset.role;
    persistAccountsIndex(); render();
  } else if (action === 'add-row') {
    const arr = getPath(sc, btn.dataset.path);
    arr.push(JSON.parse(btn.dataset.template));
    persist(); render();
  } else if (action === 'del-row') {
    const arr = getPath(sc, btn.dataset.path);
    const idx = arr.findIndex(function (r) { return r.id === btn.dataset.id; });
    if (idx > -1) arr.splice(idx, 1);
    persist(); render();
  } else if (action === 'new-scorecard') {
    const sc2 = await Api.createScorecard({ size: btn.dataset.size, description: 'New ' + btn.dataset.size + ' Scorecard' });
    STATE.activeScorecardId = sc2.id;
    persist();
    location.hash = '#/scorecard/' + sc2.id + '/general';
  } else if (action === 'save-scorecard') {
    if (sc) {
      await Api.saveScorecard(sc);
      flashSaved(btn);
      // Update the save-bar's timestamp in place rather than a full render(),
      // which would replace `btn` out from under flashSaved()'s setTimeout.
      const ts = document.getElementById('save-bar-ts-' + sc.id);
      if (ts) ts.textContent = 'Saved ' + new Date(STATE.meta.lastSavedAt).toLocaleTimeString('en-ZA');
    }
  } else if (action === 'archive-scorecard') {
    const s = getScorecard(btn.dataset.id); if (s) { s.archived = true; await Api.saveScorecard(s); }
    render();
  } else if (action === 'unarchive-scorecard') {
    const s = getScorecard(btn.dataset.id); if (s) { s.archived = false; await Api.saveScorecard(s); }
    render();
  } else if (action === 'delete-scorecard') {
    if (confirm('Delete this scorecard permanently? This cannot be undone.')) {
      await Api.deleteScorecard(btn.dataset.id);
      render();
      location.hash = '#/scorecards';
    }
  } else if (action === 'new-task') {
    await Api.createTask({});
    render();
  } else if (action === 'del-task') {
    await Api.deleteTask(btn.dataset.id);
    render();
  } else if (action === 'save-tasks') {
    await Promise.all(STATE.implementation.map(function (t) { return Api.updateTask(t); }));
    flashSaved(btn);
  } else if (action === 'save-scenario') {
    saveCurrentScenario();
  } else if (action === 'del-scenario') {
    await Api.deleteScenario(btn.dataset.id);
    render();
  } else if (action === 'reset-data') {
    if (confirm('Reset all data back to the sample scorecard? This clears everything you have captured on this device.')) {
      localStorage.removeItem(STORAGE_KEY);
      STATE = seedState();
      persist();
      location.hash = '#/dashboard';
      render();
    }
  } else if (action === 'apply-classification') {
    if (sc) { sc.size = btn.dataset.size; persist(); render(); }
  } else if (action === 'apply-net-value') {
    if (sc) {
      const pctVal = sc.ownership.netValueTotalAssetValue > 0 ? round2(pct(sc.ownership.netValueUnencumbered, sc.ownership.netValueTotalAssetValue)) : 0;
      sc.ownership.netValuePct = pctVal;
      persist(); render();
    }
  } else if (action === 'apply-training-spend') {
    if (sc) {
      sc.skills.expBlack = round2(sc.people.filter(function (p) { return p.race !== 'White'; }).reduce(function (sum, p) { return sum + (Number(p.trainingSpend) || 0); }, 0));
      persist(); render();
    }
  } else if (action === 'apply-programme-spend') {
    // Alternative to (not summed with) the roster-based total above — use
    // whichever ledger you actually captured spend in, not both, or you'll
    // double-count the same training spend twice.
    if (sc) {
      sc.skills.expBlack = round2((sc.skills.programmes || []).reduce(function (sum, p) { return sum + (Number(p.spend) || 0); }, 0));
      persist(); render();
    }
  } else if (action === 'apply-sd-beneficiary-spend') {
    if (sc) {
      sc.esd.sdContributions = round2((sc.esd.sdBeneficiaries || []).reduce(function (sum, b) { return sum + (Number(b.spend) || 0); }, 0));
      persist(); render();
    }
  } else if (action === 'apply-ed-beneficiary-spend') {
    if (sc) {
      sc.esd.edContributions = round2((sc.esd.edBeneficiaries || []).reduce(function (sum, b) { return sum + (Number(b.spend) || 0); }, 0));
      persist(); render();
    }
  } else if (action === 'apply-payments-to-beneficiaries') {
    // Sums each beneficiary's IN-PERIOD payments and writes that into their
    // .spend field — a first roll-up stage. The existing "beneficiary total
    // -> contribution" apply buttons above are the second stage, so payment
    // dates ultimately flow through to the scoring fields in two clear
    // steps rather than one opaque one.
    if (sc) {
      const paymentsPath = btn.dataset.paymentsPath;
      const beneficiariesPath = btn.dataset.beneficiariesPath;
      const payments = getPath(sc, paymentsPath) || [];
      const beneficiaries = getPath(sc, beneficiariesPath) || [];
      const periodStart = sc.periodStart, periodEnd = sc.periodEnd;
      const inPeriod = function (d) { return !!d && (!periodStart || d >= periodStart) && (!periodEnd || d <= periodEnd); };
      beneficiaries.forEach(function (b) {
        b.spend = round2(payments.filter(function (p) { return p.beneficiaryId === b.id && inPeriod(p.date); }).reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0));
      });
      persist(); render();
    }
  } else if (action === 'apply-ownership-transaction') {
    // Computes Net Value from the transaction/repayment schedule instead of
    // requiring netValueUnencumbered to be typed in directly: outstanding
    // debt = original debt minus everything repaid so far; unencumbered
    // value = the transaction's value minus what's still outstanding.
    if (sc) {
      const t = sc.ownership.transaction || {};
      const totalRepayments = round2((t.repayments || []).reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0));
      const outstandingDebt = Math.max(0, round2((Number(t.acquisitionDebt) || 0) - totalRepayments));
      const unencumbered = Math.max(0, round2((Number(t.transactionValue) || 0) - outstandingDebt));
      sc.ownership.netValueUnencumbered = unencumbered;
      if (!sc.ownership.netValueTotalAssetValue && t.transactionValue) sc.ownership.netValueTotalAssetValue = Number(t.transactionValue) || 0;
      persist(); render();
    }
  } else if (action === 'export-csv') {
    exportScorecardCSV(getScorecard(btn.dataset.scid));
  } else if (action === 'export-json') {
    exportScorecardJSON(getScorecard(btn.dataset.scid));
  } else if (action === 'export-excel') {
    exportScorecardExcel(getScorecard(btn.dataset.scid));
  } else if (action === 'export-pdf') {
    exportScorecardPDF(getScorecard(btn.dataset.scid));
  } else if (action === 'export-csv-rows') {
    exportSectionCSV(btn.dataset.kind, sc);
  } else if (action === 'import-csv-rows') {
    pendingImportTarget = { kind: btn.dataset.kind, scId: btn.dataset.scid || null };
    document.getElementById('csv-import-input').click();
  } else if (action === 'export-person-pdf') {
    const person = sc && sc.people.find(function (p) { return p.id === btn.dataset.id; });
    exportPersonPDF(sc, person);
  }
});

/* Small "Saved" confirmation next to whatever Save button was clicked —
   purely visual feedback; today there is nothing to wait on since Api.* is
   local, but this is where a real backend's latency would show a spinner. */
function flashSaved(btn) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = 'Saved';
  btn.disabled = true;
  setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 1200);
}

/* Which dataset an "Import CSV" click was for, set right before the shared
   hidden file picker (#csv-import-input, in index.html) is opened — see the
   CSV import/export section below for exportSectionCSV/importSectionCSV. */
let pendingImportTarget = null;

document.addEventListener('change', function (e) {
  if (e.target.id !== 'csv-import-input' || !pendingImportTarget) return;
  const target = pendingImportTarget;
  pendingImportTarget = null;
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const sc = target.scId ? getScorecard(target.scId) : null;
      const count = importSectionCSV(target.kind, sc, String(reader.result));
      persist();
      render();
      alert(count + ' row(s) imported.');
    } catch (err) {
      alert('Could not import that file: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.addEventListener('input', function (e) {
  const t = e.target;
  if (t.matches('[data-bind-live]')) {
    const sc = getScorecard(t.dataset.scid);
    let value = t.dataset.type === 'number' ? (parseFloat(t.value) || 0) : t.value;
    setPath(sc, t.dataset.bindLive, value);
    persist();
    const out = document.querySelector('[data-live-out="' + t.dataset.bindLive + '"]');
    if (out) out.textContent = t.dataset.suffix ? (value + t.dataset.suffix) : value;
  }
});

/* ------------------------------- Shared components ----------------------------- */

/* Whole-number fields (headcounts, years) display as integers; every money/percentage
   field (the default) is displayed and stored rounded to exactly 2 decimal places. */
function displayNum(v, isInteger) {
  const n = Number(v) || 0;
  return isInteger ? String(Math.round(n)) : n.toFixed(2);
}

function fieldNumber(sc, path, label, opts) {
  opts = opts || {};
  const isInteger = opts.step === '1';
  const v = displayNum(getPath(sc, path), isInteger);
  const step = opts.step || '0.01';
  const prefix = opts.prefix ? '<div class="input-prefix-wrap"><span class="prefix">' + opts.prefix + '</span><input class="input" type="number" step="' + step + '" data-bind="' + path + '" data-scid="' + sc.id + '" data-type="number" data-round="' + (isInteger ? 'int' : '2dp') + '" value="' + v + '"></div>' :
    '<input class="input" type="number" step="' + step + '" data-bind="' + path + '" data-scid="' + sc.id + '" data-type="number" data-round="' + (isInteger ? 'int' : '2dp') + '" value="' + v + '">';
  return '<div class="field"><label>' + esc(label) + '</label>' + prefix + (opts.hint ? '<div class="hint">' + esc(opts.hint) + '</div>' : '') + '</div>';
}

/* A bare number input for use inside a table cell (no label/field wrapper) —
   same data-bind/round conventions as fieldNumber so it saves through the
   same delegated change listener. */
function numCell(sc, path) {
  const v = displayNum(getPath(sc, path), true);
  return '<input class="input" type="number" step="1" style="width:90px;text-align:right" data-bind="' + path + '" data-scid="' + sc.id + '" data-type="number" data-round="int" value="' + v + '">';
}

/* Same idea as numCell(), for a decimal percentage field inside a table
   cell (the EAP matrix's editable target column). */
function pctCell(sc, path) {
  const v = displayNum(getPath(sc, path));
  return '<input class="input" type="number" step="0.1" style="width:90px;text-align:right" data-bind="' + path + '" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + v + '">';
}

/* Reviewer Mode (Step 8) — the session-wide role driving whether evidence
   controls render editable or read-only. 'owner' (preparer) and 'reviewer'
   can both approve/reject/add notes; 'viewer' sees the same statuses but
   every control is disabled. This is a local UI toggle, not real
   authentication — see the comment above renderTeamDropdown(). */
function currentRole() {
  const session = getAccountsIndex().session;
  return (session && session.role) || 'owner';
}
function canReview() { return currentRole() !== 'viewer'; }

/* A compact badge + reviewer <select> for one row's evidence status — the
   same Missing/Uploaded/Approved/Rejected lifecycle as User Portfolios,
   reused here for suppliers and SD/ED/SED beneficiaries. `path` is the
   array path up to and including the row's index (e.g.
   "esd.suppliers.2"); `row` is that row's own object (for the current
   status/note values). */
function evidenceStatusCell(sc, path, row) {
  const status = row.evidenceStatus || 'Missing Documents';
  const statusClass = PORTFOLIO_STATUS_CLASS[status] || 'portfolio-status-missing';
  const opts = EVIDENCE_STATUSES.map(function (s) { return '<option value="' + esc(s) + '" ' + (s === status ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  const ro = canReview() ? '' : ' disabled';
  return '<span class="status-badge ' + statusClass + '">' + esc(status) + '</span>' +
    '<div class="mt8"><select class="input" data-bind="' + path + '.evidenceStatus" data-scid="' + sc.id + '"' + ro + '>' + opts + '</select></div>' +
    (status === 'Rejected' ? '<div class="field mt8"><label class="small">Rejection reason</label><textarea class="input" rows="2" data-bind="' + path + '.evidenceRejectionNote" data-scid="' + sc.id + '"' + ro + '>' + esc(row.evidenceRejectionNote || '') + '</textarea></div>' : '') +
    (ro ? '<div class="hint">Viewer mode — read only</div>' : '');
}

function fieldText(sc, path, label) {
  const v = getPath(sc, path);
  return '<div class="field"><label>' + esc(label) + '</label><input class="input" type="text" data-bind="' + path + '" data-scid="' + sc.id + '" value="' + esc(v || '') + '"></div>';
}

function fieldSelect(sc, path, label, options) {
  const v = getPath(sc, path);
  const opts = options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
  return '<div class="field"><label>' + esc(label) + '</label><select class="input" data-bind="' + path + '" data-scid="' + sc.id + '">' + opts + '</select></div>';
}

function fieldYesNo(sc, path, label) {
  const v = getPath(sc, path);
  return '<div class="field"><label>' + esc(label) + '</label><select class="input" data-bind="' + path + '" data-scid="' + sc.id + '">' +
    '<option value="true"' + (v ? ' selected' : '') + '>Yes</option>' +
    '<option value=""' + (!v ? ' selected' : '') + '>No</option>' +
    '</select></div>';
}

function levelBanner(sc) {
  const summary = calcAll(sc);
  return '<div class="card">' +
    '<div class="flex-between">' +
      '<h3 style="margin:0">You are ' + esc(summary.level.label.replace('Contributor', '').trim()) + (typeof summary.level.level === 'number' ? ' (Level ' + summary.level.level + ')' : '') + '</h3>' +
      (summary.pointsToNextLevel > 0 ? '<span class="muted small">' + fmtPts(summary.pointsToNextLevel) + ' points to ' + esc(summary.nextLevelLabel) + '</span>' : '<span class="pill pill-teal">Top level reached</span>') +
    '</div>' +
    '<div id="level-bar-' + sc.id + '" class="mt12"></div>' +
    '</div>';
}

function mountLevelBanner(sc) {
  if (!sc) return;
  const el = document.getElementById('level-bar-' + sc.id);
  if (!el) return;
  const summary = calcAll(sc);
  const target = summary.pointsToNextLevel > 0 ? summary.totalActual + summary.pointsToNextLevel : summary.totalActual;
  renderLevelBar(el, summary.totalActual, target || 1);
}

/* Recomputes an overall summary after substituting a directly-supplied Management
   Control score (used by Scenarios/Targets, where representation is a slider/goal
   rather than a simulated roster). */
function overrideManagementScore(summary, pts) {
  summary.management = Object.assign({}, summary.management, { total: pts });
  summary.elements[1] = Object.assign({}, summary.elements[1], { data: Object.assign({}, summary.elements[1].data, { total: pts }) });
  summary.totalActual = round2(summary.elements.reduce(function (s, e) { return s + e.data.total; }, 0));
  // Scenario/target exploration is a quick approximation and does not re-run the
  // priority-element discounting check — only the headline level shown here.
  summary.scoreLevel = levelLookup(summary.totalActual);
  summary.level = summary.scoreLevel;
  return summary;
}

function statCards(label, target, actual, gap) {
  return '<div class="card card-flush"><div class="stat-row">' +
    '<div class="stat-tile"><div class="num">' + fmtPts(target) + '</div><div class="lbl">Target</div></div>' +
    '<div class="stat-tile"><div class="num">' + fmtPts(actual) + '</div><div class="lbl">Actual</div></div>' +
    '<div class="stat-tile"><div class="num">' + fmtPts(gap) + '</div><div class="lbl">Gap</div></div>' +
    '</div></div>';
}

const WORKSPACE_TABS = [
  { key: 'general', label: 'General Information' },
  { key: 'ownership', label: 'Ownership Information' },
  { key: 'management', label: 'Management Control' },
  { key: 'skills', label: 'Skills Development' },
  { key: 'esd', label: 'Enterprise & Supplier Development' },
  { key: 'sed', label: 'Socioeconomic Development' },
  { key: 'yes', label: 'Y.E.S Participation' },
  { key: 'insights', label: 'Scorecard Insights' },
  { key: 'ee', label: 'EE Insights' }
];

/* A dropdown, not a scrolling tab strip — General Information is the first
   option, everything else (Ownership through EE Insights) follows in the
   same select, so switching sections is always a single click regardless of
   how many tabs there are or how narrow the screen is. */
function tabBar(sc, activeTab) {
  const options = WORKSPACE_TABS.map(function (t) {
    return '<option value="' + t.key + '"' + (t.key === activeTab ? ' selected' : '') + '>' + esc(t.label) + '</option>';
  }).join('');
  return '<div class="tab-select-row">' +
    '<a class="tab-select-back" href="#/scorecards">&larr; Your Scorecards</a>' +
    '<select class="input tab-select" data-tab-select data-scid="' + sc.id + '" aria-label="Scorecard section">' + options + '</select>' +
  '</div>' + saveBar(sc);
}

/* Persistent Save action shown under the tab bar on every scorecard screen.
   Field edits already auto-save locally as you type (see the delegated
   'change' listener) — this button is the explicit "commit" a real backend
   would sync on, via Api.saveScorecard(). */
function saveBar(sc) {
  const savedAt = STATE.meta && STATE.meta.lastSavedAt ? new Date(STATE.meta.lastSavedAt).toLocaleTimeString('en-ZA') : null;
  return '<div class="save-bar">' +
    '<span id="save-bar-ts-' + sc.id + '">' + (savedAt ? 'Saved ' + savedAt : 'Not saved yet') + '</span>' +
    '<button class="btn btn-sm" data-action="save-scorecard" data-scid="' + sc.id + '">Save</button>' +
  '</div>';
}

function scoreTable(rows, opts) {
  opts = opts || {};
  let body = rows.map(function (r) {
    const isBool = r.bool;
    const actualDisp = isBool ? (r.achieved ? 'Yes' : 'No') : fmtPct(r.actualPct);
    const targetDisp = isBool ? '—' : fmtPct(r.targetPct);
    return '<tr><td>' + esc(r.label) + (r.amount != null ? '<div class="small muted">' + fmtR(r.amount) + '</div>' : '') + '</td>' +
      '<td class="num">' + targetDisp + '</td>' +
      '<td class="num">' + actualDisp + '</td>' +
      '<td class="num">' + fmtPts(r.points) + ' / ' + fmtPts(r.max) + '</td>' +
      '<td>' + (isBool ? '' : renderGapMargin(r.actualPct, r.targetPct)) + '</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Item</th><th class="num">Target %</th><th class="num">Actual %</th><th class="num">Points</th><th>Gap margin</th></tr></thead><tbody>' + body + '</tbody></table></div>';
}

function settingsDetails(title, inner) {
  return '<details class="mt12"><summary style="cursor:pointer;font-weight:700;color:var(--navy)">' + esc(title) + '</summary><div class="mt12">' + inner + '</div></details>';
}

/* --------------------------------- Dashboard ------------------------------------ */

function viewDashboard() {
  const sc = getActiveScorecard();
  if (!sc) {
    return '<div class="card empty-state"><h2>Welcome to the Centenary B-BBEE Tool</h2><p class="muted">Create your first scorecard to get started.</p>' +
      '<div class="flex-gap" style="justify-content:center"><button class="btn" data-action="new-scorecard" data-size="Generic">New Generic Scorecard</button>' +
      '<button class="btn btn-outline" data-action="new-scorecard" data-size="QSE">New QSE Scorecard</button>' +
      '<button class="btn btn-outline" data-action="new-scorecard" data-size="EME">New EME Scorecard</button></div></div>';
  }
  const summary = calcAll(sc);
  return '<div class="hero-band"><div class="hero-band-inner two-col">' +
      '<div>' +
        '<div class="hero-eyebrow">' + esc(fmtDate(sc.periodStart)) + ' – ' + esc(fmtDate(sc.periodEnd)) + '</div>' +
        '<h1 class="hero-heading">You are Level ' + esc(summary.level.level) + '</h1>' +
        '<div class="muted">' + esc(sc.description) + ' (' + esc(sc.charter) + ')</div>' +
        '<div class="flex-gap mt16"><a class="btn" href="#/scorecard/' + sc.id + '/general">Open scorecard</a><a href="#/scorecards">or view all</a></div>' +
      '</div>' +
      '<div>' +
        '<div class="chart-legend"><span><span class="swatch" style="background:var(--blue)"></span>Actual</span><span><span class="swatch" style="background:#b7a3e8"></span>Max</span></div>' +
        '<div id="dash-chart"></div>' +
      '</div>' +
    '</div></div>' +
    '<div class="dash-grid">' +
      '<div>' +
        '<div class="card-row">' +
          '<div class="card"><div class="card-title">Target Scorecards</div><p class="muted">Set goals for what you want to achieve on your B-BBEE scorecard.</p><a class="btn" href="#/targets">Open target scorecards</a></div>' +
          '<div class="card"><div class="card-title">Implementation Planner</div><p class="muted">Create and delegate action items to expedite the implementation of your scorecard goals.</p><a class="btn" href="#/implementation">Go to implementation planner</a></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title">Scenario Planner</div>' +
        '<p class="muted">Measure the impact of different initiatives on your B-BBEE scorecard.</p>' +
        '<a class="btn" href="#/scenarios">Go to scenario planner</a>' +
        '<div class="divider"></div>' +
        '<div class="kv-list">' +
          '<div><span class="k">Total score</span><span class="v">' + fmtPts(summary.totalActual) + '</span></div>' +
          '<div><span class="k">Recognition</span><span class="v">' + fmtPct(summary.level.recognition) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function mountDashboardChart() {
  const sc = getActiveScorecard();
  if (!sc) return;
  const summary = calcAll(sc);
  const el = document.getElementById('dash-chart');
  if (!el) return;
  renderGroupedBarChart(el, summary.elements.map(function (e) {
    return { label: e.short, actual: e.data.total, max: e.data.base + e.data.bonus };
  }), { height: 220 });
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------------------------------- Accounts -------------------------------------- */

/* Reads another account's data blob directly from localStorage without
   switching to it — used only to show a summary (scorecard count, level) on
   the Accounts page. The active account's own data still comes from STATE,
   same as everywhere else in the app. */
function peekAccountData(accountId) {
  try {
    const raw = localStorage.getItem(storageKeyFor(accountId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function viewAccounts() {
  const idx = getAccountsIndex();
  const cards = idx.accounts.map(function (a) {
    const isActive = a.id === idx.activeAccountId;
    const data = isActive ? STATE : peekAccountData(a.id);
    const scorecards = (data && Array.isArray(data.scorecards)) ? data.scorecards.filter(function (s) { return !s.archived; }) : [];
    let levelBadge = '<span class="pill pill-muted">No scorecards yet</span>';
    if (scorecards.length) {
      let best = null;
      scorecards.forEach(function (s) {
        try {
          const summary = calcAll(s);
          if (!best || summary.totalActual > best.totalActual) best = { level: summary.level.level, totalActual: summary.totalActual };
        } catch (e) {}
      });
      if (best) levelBadge = '<span class="pill pill-teal">Level ' + esc(best.level) + '</span>';
    }
    return '<div class="card">' +
      '<div class="flex-between">' +
        '<div>' +
          '<div class="section-title" style="margin-bottom:2px">' + esc(a.name) + '</div>' +
          '<div class="muted small">' + scorecards.length + ' scorecard' + (scorecards.length === 1 ? '' : 's') + (isActive ? ' · Currently viewing' : '') + '</div>' +
        '</div>' +
        levelBadge +
      '</div>' +
      (isActive ? '' : '<div class="flex-gap mt16"><button class="btn btn-sm" data-action="switch-account" data-id="' + a.id + '">Switch to this account</button></div>') +
    '</div>';
  }).join('');

  return '<div class="tabbar-wrap"><div class="tabbar"><a class="active" href="#/accounts">Accounts</a></div></div>' +
    '<div class="card">' +
      '<div class="card-title">Add New Account</div>' +
      '<p class="muted">Every account under Centenary Networks gets its own scorecards, company profile and B-BBEE performance — genuinely separate data, not just a different label on the same numbers.</p>' +
      '<form class="flex-gap" data-action-form="add-account">' +
        '<input class="input" type="text" name="name" placeholder="Account name (e.g. a sponsored company)" required style="max-width:320px">' +
        '<button type="submit" class="btn btn-sm">+ Add New Account</button>' +
      '</form>' +
    '</div>' +
    '<div class="card-row">' + cards + '</div>';
}

/* ------------------------------ Scorecards list ---------------------------------- */

function viewScorecardsList() {
  const rows = STATE.scorecards.filter(function (s) { return !s.archived; });
  const body = rows.length ? rows.map(function (s) {
    const summary = calcAll(s);
    return '<tr>' +
      '<td><a href="#/scorecard/' + s.id + '/general">' + esc(s.description) + '</a></td>' +
      '<td>Level ' + esc(summary.level.level) + '</td>' +
      '<td>' + esc(s.size) + '</td>' +
      '<td>' + esc(fmtDate(s.periodStart)) + ' – ' + esc(fmtDate(s.periodEnd)) + '</td>' +
      '<td>' + esc(s.charter) + '</td>' +
      '<td class="num">' + esc(s.measurementYear) + '</td>' +
      '<td class="row-actions"><button class="btn btn-sm btn-ghost" data-action="archive-scorecard" data-id="' + s.id + '">Archive</button>' +
      '<button class="btn btn-sm btn-danger" data-action="delete-scorecard" data-id="' + s.id + '">Delete</button></td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="7"><div class="empty-state">No scorecards yet — create one above.</div></td></tr>';

  const archived = STATE.scorecards.filter(function (s) { return s.archived; });
  const archivedBody = archived.map(function (s) {
    return '<tr><td>' + esc(s.description) + '</td><td colspan="5" class="muted">Archived</td>' +
      '<td><button class="btn btn-sm btn-outline" data-action="unarchive-scorecard" data-id="' + s.id + '">Restore</button></td></tr>';
  }).join('');

  return '<div class="tabbar-wrap"><div class="tabbar"><a class="active" href="#/scorecards">Your Scorecards</a></div></div>' +
    '<div class="card">' +
      '<div class="flex-between">' +
        '<div class="flex-gap"><button class="btn" data-action="new-scorecard" data-size="Generic">New Generic Scorecard</button>' +
        '<button class="btn btn-outline" data-action="new-scorecard" data-size="QSE">New QSE Scorecard</button>' +
        '<button class="btn btn-outline" data-action="new-scorecard" data-size="EME">New EME Scorecard</button></div>' +
        '<button class="btn btn-ghost btn-sm" data-action="reset-data">Reset to sample data</button>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<p class="muted">This is the Scorecard Calculator. Here you can calculate your company\'s B-BBEE compliance level by capturing data about your company. Create a new scorecard or click on an existing scorecard\'s description to open it.</p>' +
      '<h3>Your Scorecards</h3>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Description</th><th>Level</th><th>Size</th><th>Scorecard Period</th><th>Charter</th><th class="num">Measurement Year</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="muted mt8">Displaying ' + rows.length + ' scorecard' + (rows.length === 1 ? '' : 's') + '</p>' +
      (archived.length ? settingsDetails('Show Archived Scorecards (' + archived.length + ')', '<div class="table-wrap"><table class="data-table"><tbody>' + archivedBody + '</tbody></table></div>') : '') +
    '</div>';
}

/* ---------------------------- Scorecard workspace shell --------------------------- */

function viewScorecardWorkspace(id, tab) {
  const sc = getScorecard(id);
  if (!sc) { location.hash = '#/scorecards'; return ''; }
  STATE.activeScorecardId = id; persist();

  let content;
  switch (tab) {
    case 'ownership': content = tabOwnership(sc); break;
    case 'management': content = tabManagement(sc); break;
    case 'skills': content = tabSkills(sc); break;
    case 'esd': content = tabESD(sc); break;
    case 'sed': content = tabSED(sc); break;
    case 'yes': content = tabYES(sc); break;
    case 'insights': content = tabInsights(sc); break;
    case 'ee': content = tabEE(sc); break;
    default: content = tabGeneral(sc);
  }
  return tabBar(sc, tab) + content;
}

/* -------------------------------- General Information ------------------------------- */

function tabGeneral(sc) {
  const cls = classification(sc);
  const sizeLabel = { EME: 'Exempted Micro Enterprise (EME)', QSE: 'Qualifying Small Enterprise (QSE)', Generic: 'Generic (measured on the full scorecard)' };
  return '<div class="card">' +
    '<h3 class="section-title">' + esc(sc.description) + '</h3>' +
    '<div class="field-grid mt16">' +
      fieldText(sc, 'description', 'Scorecard description') +
      fieldSelect(sc, 'size', 'Scorecard size', ['EME', 'QSE', 'Generic']) +
      fieldNumber(sc, 'measurementYear', 'Measurement year', { step: '1' }) +
      '<div class="field"><label>Period start</label><input class="input" type="date" data-bind="periodStart" data-scid="' + sc.id + '" value="' + esc(sc.periodStart) + '"></div>' +
      '<div class="field"><label>Period end</label><input class="input" type="date" data-bind="periodEnd" data-scid="' + sc.id + '" value="' + esc(sc.periodEnd) + '"></div>' +
      fieldSelect(sc, 'general.sectorCharter', 'Sector Charter', SECTOR_CHARTERS) +
    '</div>' +
    '<div class="hint">Sector Charters are recorded for reference only — the formulas in this tool follow the Generic/QSE Amended Codes. A gazetted sector charter may set different targets; check with your verification agency.</div>' +
  '</div>' +
  '<div class="card">' +
    '<div class="card-title">Setup &amp; Classification</div>' +
    '<p class="muted">Entity size is determined by annual revenue: under R10m is an EME, R10m&ndash;R50m is a QSE, above R50m measures on the full Generic Scorecard.</p>' +
    '<div class="kv-list">' +
      '<div><span class="k">Revenue</span><span class="v">' + fmtR(sc.general.revenue) + '</span></div>' +
      '<div><span class="k">Suggested classification</span><span class="v">' + (cls.suggested ? esc(sizeLabel[cls.suggested]) : '—') + '</span></div>' +
      '<div><span class="k">Currently set to</span><span class="v">' + esc(sizeLabel[sc.size] || sc.size) + '</span></div>' +
    '</div>' +
    (cls.suggested && !cls.matches ?
      '<div class="disclaimer mt12">Based on revenue, this scorecard would usually be classified as <strong>' + esc(cls.suggested) + '</strong>, not ' + esc(sc.size) + '. ' +
      '<button class="btn btn-sm mt8" data-action="apply-classification" data-scid="' + sc.id + '" data-size="' + cls.suggested + '">Use ' + esc(cls.suggested) + '</button></div>'
      : (cls.suggested ? '<div class="help-callout mt12">Classification matches revenue. No action needed.</div>' : '')) +
  '</div>' +
  '<div class="card">' +
    '<div class="card-title">General Financial Information</div>' +
    '<div class="field-grid">' +
      fieldNumber(sc, 'general.revenue', 'Revenue', { prefix: 'R' }) +
      fieldNumber(sc, 'general.npat', 'Net profit after tax (NPAT)', { prefix: 'R' }) +
      fieldNumber(sc, 'general.valueOfBusiness', 'Value of the business', { prefix: 'R' }) +
      fieldNumber(sc, 'general.leviableAmount', 'Leviable amount (payroll)', { prefix: 'R', hint: 'Total remuneration used for Skills Development spend targets.' }) +
      fieldSelect(sc, 'general.industry', 'Industry', INDUSTRIES) +
    '</div>' +
    '<div class="help-callout mt16">' +
      '<strong>ED, SD &amp; SED contribution targets.</strong> Based on NPAT of ' + fmtR(sc.general.npat) + ':<br>' +
      'Enterprise Development target (1% of NPAT): <strong>' + fmtR(sc.general.npat * 0.01) + '</strong> &nbsp;·&nbsp; ' +
      'Supplier Development target (2% of NPAT): <strong>' + fmtR(sc.general.npat * 0.02) + '</strong> &nbsp;·&nbsp; ' +
      'Socio-Economic Development target (1% of NPAT): <strong>' + fmtR(sc.general.npat * 0.01) + '</strong>' +
    '</div>' +
  '</div>' +
  '<div class="disclaimer">This calculator provides an indicative B-BBEE score based on the Amended Codes of Good Practice. It is a planning tool for Centenary Networks — for a certified rating, please engage a SANAS-accredited verification agency.</div>';
}

/* ----------------------------------- Ownership --------------------------------------- */

function shareholderRow(sc, h, i) {
  const raceOpts = RACES.map(function (r) { return '<option ' + (r === h.race ? 'selected' : '') + '>' + r + '</option>'; }).join('');
  const genderOpts = GENDERS.map(function (g) { return '<option ' + (g === h.gender ? 'selected' : '') + '>' + g + '</option>'; }).join('');
  return '<tr>' +
    '<td><input class="input" data-bind="ownership.shareholders.' + i + '.name" data-scid="' + sc.id + '" value="' + esc(h.name) + '"></td>' +
    '<td><select class="input" data-bind="ownership.shareholders.' + i + '.race" data-scid="' + sc.id + '">' + raceOpts + '</select></td>' +
    '<td><select class="input" data-bind="ownership.shareholders.' + i + '.gender" data-scid="' + sc.id + '">' + genderOpts + '</select></td>' +
    '<td><input type="checkbox" data-bind="ownership.shareholders.' + i + '.foreign" data-scid="' + sc.id + '" ' + (h.foreign ? 'checked' : '') + '></td>' +
    '<td><input class="input" type="number" step="0.01" data-bind="ownership.shareholders.' + i + '.shareholdingPct" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(h.shareholdingPct) + '"></td>' +
    '<td><input type="checkbox" data-bind="ownership.shareholders.' + i + '.newEntrant" data-scid="' + sc.id + '" ' + (h.newEntrant ? 'checked' : '') + '></td>' +
    '<td><input type="checkbox" data-bind="ownership.shareholders.' + i + '.designatedGroup" data-scid="' + sc.id + '" ' + (h.designatedGroup ? 'checked' : '') + '></td>' +
    '<td style="min-width:170px">' + evidenceStatusCell(sc, 'ownership.shareholders.' + i, h) + '</td>' +
    '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="ownership.shareholders" data-id="' + h.id + '">' + ICON_CLOSE + '</button></td>' +
    '</tr>';
}

function tabOwnership(sc) {
  const calc = calcOwnership(sc); // also syncs the roster into sc.ownership.*
  const o = sc.ownership;
  const shareTotal = round2((o.shareholders || []).reduce(function (s, h) { return s + (Number(h.shareholdingPct) || 0); }, 0));
  const newShareholder = JSON.stringify(Object.assign({ id: uid('sh'), name: 'New Shareholder', race: 'African', gender: 'Male', foreign: false, shareholdingPct: 0, newEntrant: false, designatedGroup: false }, blankEvidenceFields())).replace(/"/g, '&quot;');
  const netValueCalc = o.netValueTotalAssetValue > 0 ? round2(pct(o.netValueUnencumbered, o.netValueTotalAssetValue)) : 0;

  return statCards('Ownership', calc.base, calc.total, round2(calc.base - calc.total)) +
    levelBanner(sc) +
    '<div class="card">' +
      '<div class="card-title">Shareholder Register (flow-through)</div>' +
      '<p class="muted">Capture individual shareholders and this tool calculates voting rights &amp; economic interest automatically (flow-through principle) — or switch it off to enter the four percentages by hand.</p>' +
      '<label class="checkbox-row"><input type="checkbox" data-bind="ownership.useShareholderRoster" data-scid="' + sc.id + '" ' + (o.useShareholderRoster ? 'checked' : '') + '> Calculate ownership automatically from the shareholder register</label>' +
      (o.useShareholderRoster ? (
        '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Name</th><th>Race</th><th>Gender</th><th>Foreign</th><th>Shareholding %</th><th>New entrant</th><th>Designated group</th><th>Evidence</th><th></th></tr></thead><tbody>' +
        (o.shareholders || []).map(function (h, i) { return shareholderRow(sc, h, i); }).join('') +
        (o.shareholders && o.shareholders.length ? '' : '<tr><td colspan="9"><div class="empty-state">No shareholders captured yet.</div></td></tr>') +
        '</tbody></table></div>' +
        '<div class="flex-between mt8"><button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="ownership.shareholders" data-template="' + newShareholder + '">+ Add Shareholder</button>' +
        '<span class="' + (Math.abs(shareTotal - 100) < 0.5 ? 'pos' : 'neg') + '">Total shareholding: ' + fmtPct(shareTotal) + (Math.abs(shareTotal - 100) < 0.5 ? '' : ' (should total 100%)') + '</span></div>' +
        '<div class="flex-gap mt12">' + csvImportExportButtons('shareholders', sc.id) + '</div>'
      ) : '') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Ownership inputs (% achieved)</div>' +
      (o.useShareholderRoster ? '<div class="hint mb8">These four figures are calculated from the shareholder register above.</div>' : '') +
      '<div class="field-grid">' +
        fieldNumber(sc, 'ownership.votingBlackPct', 'Voting rights — black people (%)') +
        fieldNumber(sc, 'ownership.votingBlackFemalePct', 'Voting rights — black women (%)') +
        fieldNumber(sc, 'ownership.economicBlackPct', 'Economic interest — black people (%)') +
        fieldNumber(sc, 'ownership.economicBlackFemalePct', 'Economic interest — black women (%)') +
        fieldNumber(sc, 'ownership.designatedGroupsPct', 'Black designated groups & participants (%)') +
        fieldNumber(sc, 'ownership.newEntrantsPct', 'Black new entrants (%)') +
      '</div>' +
      settingsDetails('Scoring targets (advanced)', '<div class="field-grid">' +
        fieldNumber(sc, 'targets.ownership.votingBlackPct', 'Target — voting rights black (%)') +
        fieldNumber(sc, 'targets.ownership.votingBlackFemalePct', 'Target — voting rights black women (%)') +
        fieldNumber(sc, 'targets.ownership.economicBlackPct', 'Target — economic interest black (%)') +
        fieldNumber(sc, 'targets.ownership.economicBlackFemalePct', 'Target — economic interest black women (%)') +
        fieldNumber(sc, 'targets.ownership.designatedGroupsPct', 'Target — designated groups (%)') +
        fieldNumber(sc, 'targets.ownership.newEntrantsPct', 'Target — new entrants (%)') +
        fieldNumber(sc, 'targets.ownership.netValuePct', 'Target — net value (%)') +
        '</div>') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Net Value <span class="pill pill-gold">Priority element — 40% sub-minimum applies</span></div>' +
      '<p class="muted">Net Value tracks how much of the acquisition has actually been paid off (unencumbered value) versus the total value of the business — the accumulation grows as debt used to fund the transaction is repaid.</p>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'ownership.netValueUnencumbered', 'Unencumbered value achieved', { prefix: 'R', hint: 'Value of the stake no longer tied up in acquisition debt.' }) +
        fieldNumber(sc, 'ownership.netValueTotalAssetValue', 'Total asset / business value', { prefix: 'R' }) +
      '</div>' +
      '<div class="flex-gap">' +
        '<span class="chip">Calculated: ' + fmtPct(netValueCalc) + '</span>' +
        '<button class="btn btn-sm btn-outline" data-action="apply-net-value" data-scid="' + sc.id + '">Use this value for Net Value %</button>' +
      '</div>' +
      fieldNumber(sc, 'ownership.netValuePct', 'Net value / realisation points achieved (%)') +
    '</div>' +
    ownershipTransactionCard(sc) +
    '<div class="card"><div class="card-title">Score inspector</div>' + scoreTable(calc.rows) + '</div>' +
    (sc.size === 'EME' ? emeComparisonCard(sc) : '');
}

/* Ownership transaction / repayment schedule — a deeper alternative to
   typing Net Value's unencumbered value in directly (that field above still
   exists and still drives scoring; this is a way to arrive at it with an
   audit trail instead of one manual number). Outstanding debt = the
   original acquisition debt minus every repayment logged; unencumbered
   value = the transaction's value minus what's still outstanding. */
function ownershipTransactionCard(sc) {
  const t = sc.ownership.transaction || blankOwnershipTransaction();
  const repayments = t.repayments || [];
  const totalRepayments = round2(repayments.reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0));
  const outstandingDebt = Math.max(0, round2((Number(t.acquisitionDebt) || 0) - totalRepayments));
  const unencumbered = Math.max(0, round2((Number(t.transactionValue) || 0) - outstandingDebt));
  const netValuePctPreview = t.transactionValue > 0 ? round2(pct(unencumbered, t.transactionValue)) : 0;

  const rows = repayments.map(function (r, i) {
    return '<tr>' +
      '<td><input class="input" type="date" data-bind="ownership.transaction.repayments.' + i + '.date" data-scid="' + sc.id + '" value="' + esc(r.date || '') + '"></td>' +
      '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="ownership.transaction.repayments.' + i + '.amount" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(r.amount) + '"></div></td>' +
      '<td><input class="input" data-bind="ownership.transaction.repayments.' + i + '.reference" data-scid="' + sc.id + '" value="' + esc(r.reference || '') + '"></td>' +
      '<td><input class="input" data-bind="ownership.transaction.repayments.' + i + '.notes" data-scid="' + sc.id + '" value="' + esc(r.notes || '') + '"></td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="ownership.transaction.repayments" data-id="' + r.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');
  const newRepayment = JSON.stringify({ id: uid('rep'), date: '', amount: 0, reference: '', notes: '' }).replace(/"/g, '&quot;');

  return '<div class="card">' +
    '<div class="card-title">Ownership Transaction &amp; Repayment Schedule</div>' +
    '<p class="muted">A deeper alternative to typing Net Value in directly — capture what the transaction was worth, how much debt financed it, and every repayment made against that debt. Net Value is then computed from the schedule below.</p>' +
    '<div class="field-grid">' +
      '<div class="field"><label>Transaction date</label><input class="input" type="date" data-bind="ownership.transaction.transactionDate" data-scid="' + sc.id + '" value="' + esc(t.transactionDate || '') + '"></div>' +
      fieldNumber(sc, 'ownership.transaction.transactionValue', 'Transaction value', { prefix: 'R' }) +
      fieldNumber(sc, 'ownership.transaction.acquisitionDebt', 'Acquisition debt (original)', { prefix: 'R' }) +
    '</div>' +
    '<div class="flex-between"><h4 class="mb0">Repayments (' + repayments.length + ')</h4>' +
    '<button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="ownership.transaction.repayments" data-template="' + newRepayment + '">+ Add Repayment</button></div>' +
    '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Date</th><th>Amount</th><th>Reference</th><th>Notes</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty-state">No repayments captured yet.</div></td></tr>') + '</tbody></table></div>' +
    '<div class="kv-list mt12">' +
      '<div><span class="k">Total repaid</span><span class="v">' + fmtR(totalRepayments) + '</span></div>' +
      '<div><span class="k">Outstanding debt</span><span class="v">' + fmtR(outstandingDebt) + '</span></div>' +
      '<div><span class="k">Unencumbered value</span><span class="v">' + fmtR(unencumbered) + '</span></div>' +
      '<div><span class="k">Net Value % (preview)</span><span class="v">' + fmtPct(netValuePctPreview) + '</span></div>' +
    '</div>' +
    '<div class="flex-gap mt12"><button class="btn btn-sm btn-outline" data-action="apply-ownership-transaction" data-scid="' + sc.id + '">Use this schedule for Net Value above</button></div>' +
  '</div>';
}

function emeComparisonCard(sc) {
  const eme = calcEME(sc);
  return '<div class="card">' +
    '<div class="card-title">EME simplified level (ownership-based)</div>' +
    '<p class="muted">As an Exempted Micro Enterprise you may skip the full scorecard and rely on Black ownership % alone, confirmed by sworn affidavit — shown here for comparison with the full scorecard above.</p>' +
    '<div class="kv-list">' +
      '<div><span class="k">Black economic interest</span><span class="v">' + fmtPct(eme.blackPct) + '</span></div>' +
      '<div><span class="k">EME level</span><span class="v">Level ' + eme.level + '</span></div>' +
      '<div><span class="k">Recognition</span><span class="v">' + fmtPct(eme.levelInfo.recognition) + '</span></div>' +
    '</div>' +
  '</div>';
}

/* ------------------------------- Management Control ------------------------------------ */

const PAY_FAIRNESS_PILL_CLASS = {
  'Fair — in line with peers': 'pill-teal',
  'Underpaid vs peers': 'pill-danger',
  'Overpaid vs peers': 'pill-gold',
  'No spend recorded': 'pill-muted',
  'Not enough peer data': 'pill-muted'
};

function personRow(sc, p, fairness) {
  const raceOpts = RACES.map(function (r) { return '<option ' + (r === p.race ? 'selected' : '') + '>' + r + '</option>'; }).join('');
  const genderOpts = GENDERS.map(function (g) { return '<option ' + (g === p.gender ? 'selected' : '') + '>' + g + '</option>'; }).join('');
  const levelOpts = OCCUPATIONAL_LEVELS.map(function (l) { return '<option value="' + l.key + '" ' + (l.key === p.level ? 'selected' : '') + '>' + l.label + '</option>'; }).join('');
  const pf = (fairness && fairness[p.id]) || { rating: 'No spend recorded', avg: 0, deltaPct: null };
  const pfClass = PAY_FAIRNESS_PILL_CLASS[pf.rating] || 'pill-muted';
  const pfTitle = pf.deltaPct == null
    ? (pf.avg ? 'Peer average for this level: ' + fmtR(pf.avg) : 'No peer data yet for this occupational level')
    : (pf.deltaPct >= 0 ? '+' : '') + fmtPct(pf.deltaPct) + ' vs peer average of ' + fmtR(pf.avg) + ' for this level';
  return '<tr>' +
    '<td><input class="input" data-bind="people.' + sc.people.indexOf(p) + '.name" data-scid="' + sc.id + '" value="' + esc(p.name) + '"></td>' +
    '<td><select class="input" data-bind="people.' + sc.people.indexOf(p) + '.race" data-scid="' + sc.id + '">' + raceOpts + '</select></td>' +
    '<td><select class="input" data-bind="people.' + sc.people.indexOf(p) + '.gender" data-scid="' + sc.id + '">' + genderOpts + '</select></td>' +
    '<td><input type="checkbox" data-bind="people.' + sc.people.indexOf(p) + '.disabled" data-scid="' + sc.id + '" ' + (p.disabled ? 'checked' : '') + '></td>' +
    '<td><input type="checkbox" data-bind="people.' + sc.people.indexOf(p) + '.foreign" data-scid="' + sc.id + '" ' + (p.foreign ? 'checked' : '') + '></td>' +
    '<td><input type="checkbox" data-bind="people.' + sc.people.indexOf(p) + '.permanent" data-scid="' + sc.id + '" ' + (p.permanent !== false ? 'checked' : '') + ' title="Uncheck for non-permanent/temporary employees — feeds EE Insights\' EEA2-style Workforce Profile"></td>' +
    '<td><select class="input" data-bind="people.' + sc.people.indexOf(p) + '.level" data-scid="' + sc.id + '">' + levelOpts + '</select></td>' +
    '<td><input class="input" data-bind="people.' + sc.people.indexOf(p) + '.designation" data-scid="' + sc.id + '" value="' + esc(p.designation) + '"></td>' +
    '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="people.' + sc.people.indexOf(p) + '.trainingSpend" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(p.trainingSpend) + '"></div></td>' +
    '<td><span class="pill ' + pfClass + '" title="' + esc(pfTitle) + '">' + esc(pf.rating) + '</span></td>' +
    '<td class="row-actions">' +
      '<button class="btn btn-sm btn-outline" data-action="export-person-pdf" data-scid="' + sc.id + '" data-id="' + p.id + '" title="Download this person\'s Portfolio of Evidence PDF">PDF</button>' +
      '<button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="people" data-id="' + p.id + '">' + ICON_CLOSE + '</button>' +
    '</td>' +
    '</tr>';
}

function tabManagement(sc) {
  const calc = calcManagement(sc);
  const t = sc.targets.management;
  const rows = calc.rows.map(function (r) {
    return '<tr><td>' + esc(r.label) + '</td><td class="num">' + r.total + '</td>' +
      '<td class="num">' + r.black + ' (' + fmtPct(r.blackPct) + ')</td>' +
      '<td class="num">' + r.blackFemale + ' (' + fmtPct(r.blackFemalePct) + ')</td>' +
      '<td class="num">' + fmtPts(r.points) + ' / ' + fmtPts(r.maxBlack + r.maxFemale) + '</td></tr>';
  }).join('');

  const fairness = calcPayFairness(sc);
  const peopleRows = sc.people.map(function (p) { return personRow(sc, p, fairness); }).join('');
  const newPerson = JSON.stringify(Object.assign({ id: uid('p'), name: 'New Person', race: 'African', gender: 'Male', disabled: false, foreign: false, permanent: true, level: 'director', designation: '' }, blankPortfolioFields())).replace(/"/g, '&quot;');

  return statCards('Management Control', calc.base, calc.total, round2(calc.base - calc.total)) +
    levelBanner(sc) +
    '<div class="card">' +
      '<div class="card-title">Representation vs targets</div>' +
      '<p class="hint">Targets default to the National Economically Active Population split (92.30% Black, 42.20% Black women) — adjust below if you measure against a regional or sector-specific EAP instead.</p>' +
      settingsDetails('Scoring targets (advanced)', '<div class="field-grid">' +
        fieldNumber(sc, 'targets.management.blackTargetPct', 'Target — black representation (%)') +
        fieldNumber(sc, 'targets.management.blackFemaleTargetPct', 'Target — black women representation (%)') +
        fieldNumber(sc, 'targets.management.disabilityTargetPct', 'Target — employees with disabilities (%)') +
        '</div>') +
      '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Level</th><th class="num">Headcount</th><th class="num">Black</th><th class="num">Black women</th><th class="num">Points</th></tr></thead><tbody>' + rows +
      '<tr><td>People with disabilities</td><td class="num">' + calc.disabledCount + '</td><td class="num" colspan="2">' + fmtPct(calc.disabledPct) + ' of workforce</td><td class="num">' + fmtPts(calc.disabilityPoints) + ' / ' + fmtPts(pointWeightsFor(sc).management.disability) + '</td></tr>' +
      '</tbody></table></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="flex-between"><div class="card-title" style="margin-bottom:0">Directors, Managers &amp; Employees (' + sc.people.length + ')</div>' +
      '<button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="people" data-template="' + newPerson + '">+ Add Person</button></div>' +
      '<p class="hint mt8">This roster also feeds the EE Insights tab and User Portfolios — add every employee whose occupational level you want reflected (Directors through Unskilled). Use <strong>PDF</strong> on any row to generate that person\'s own Portfolio of Evidence summary — one consolidated file per person instead of several separate document submissions. <strong>Training Spend</strong> rolls up into the Skills Development suggestion on that tab.</p>' +
      '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Name</th><th>Race</th><th>Gender</th><th>Disabled</th><th>Foreign</th><th>Permanent</th><th>Occupational level</th><th>Designation</th><th>Training Spend</th><th>Peer Pay Check</th><th></th></tr></thead><tbody>' +
      (peopleRows || '<tr><td colspan="11"><div class="empty-state">No people captured yet.</div></td></tr>') + '</tbody></table></div>' +
      '<div class="flex-gap mt12">' + csvImportExportButtons('people', sc.id) + '</div>' +
      '<p class="hint mt8"><strong>Peer Pay Check</strong> compares each person\'s Training Spend to the average for others at the same occupational level on this roster, and flags a gap of ' + PAY_FAIRNESS_BAND_PCT + '% or more either way. There is no official B-BBEE wage table — this is a management prompt to go review, not a compliance finding.</p>' +
    '</div>';
}

/* ------------------------------- Skills Development -------------------------------------- */

const PROGRAMME_CATEGORIES = ['Learnership', 'Internship', 'Apprenticeship', 'Bursary', 'Skills Programme', 'ABET', 'Mentorship', 'Other'];

function programmeRow(sc, p, i) {
  const catOpts = PROGRAMME_CATEGORIES.map(function (c) { return '<option ' + (c === p.category ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  return '<tr>' +
    '<td><select class="input" data-bind="skills.programmes.' + i + '.category" data-scid="' + sc.id + '">' + catOpts + '</select></td>' +
    '<td style="text-align:center"><input type="checkbox" data-bind="skills.programmes.' + i + '.abet" data-scid="' + sc.id + '" ' + (p.abet ? 'checked' : '') + '></td>' +
    '<td style="text-align:center"><input type="checkbox" data-bind="skills.programmes.' + i + '.mandatory" data-scid="' + sc.id + '" ' + (p.mandatory ? 'checked' : '') + '></td>' +
    '<td><input class="input" data-bind="skills.programmes.' + i + '.provider" data-scid="' + sc.id + '" value="' + esc(p.provider) + '"></td>' +
    '<td>' + numCell(sc, 'skills.programmes.' + i + '.participants') + '</td>' +
    '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="skills.programmes.' + i + '.spend" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(p.spend) + '"></div></td>' +
    '<td><input class="input" data-bind="skills.programmes.' + i + '.support" data-scid="' + sc.id + '" value="' + esc(p.support) + '" placeholder="e.g. Full stipend, textbooks, mentoring..."></td>' +
    '<td style="min-width:170px">' + evidenceStatusCell(sc, 'skills.programmes.' + i, p) + '</td>' +
    '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="skills.programmes" data-id="' + p.id + '">' + ICON_CLOSE + '</button></td>' +
  '</tr>';
}

/* Training Programme register — one row per programme/intervention (not per
   person), with category/ABET/mandatory/provider/participants/spend/support
   — an alternative way to build up to the same expenditure figure as the
   Management Control roster's per-person Training Spend column. Use
   whichever one you actually captured data in, not both — the "Apply"
   button below overwrites, not adds to, the roster-based one. */
function trainingProgrammeCard(sc) {
  const programmes = sc.skills.programmes || [];
  const rows = programmes.map(function (p, i) { return programmeRow(sc, p, i); }).join('');
  const total = round2(programmes.reduce(function (sum, p) { return sum + (Number(p.spend) || 0); }, 0));
  const newProgramme = JSON.stringify(Object.assign({ id: uid('prog'), category: 'Learnership', abet: false, mandatory: false, provider: '', participants: 0, spend: 0, support: '' }, blankEvidenceFields())).replace(/"/g, '&quot;');
  return '<div class="card">' +
    '<div class="flex-between"><div class="card-title" style="margin-bottom:0">Training Programmes (' + programmes.length + ')</div>' +
    '<button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="skills.programmes" data-template="' + newProgramme + '">+ Add Programme</button></div>' +
    '<p class="hint mt8">One row per training programme or intervention — a learnership, a bursary cohort, an ABET class — rather than per person. An alternative to Management Control\'s per-person Training Spend column; use one or the other, not both, to avoid double-counting.</p>' +
    '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Category</th><th>ABET</th><th>Mandatory</th><th>Provider</th><th class="num">Participants</th><th class="num">Spend</th><th>Support Provided</th><th>Evidence</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="9"><div class="empty-state">No training programmes captured yet.</div></td></tr>') + '</tbody></table></div>' +
    '<div class="flex-gap mt12">' + csvImportExportButtons('programmes', sc.id) + '</div>' +
    (total > 0 ? (
      '<div class="flex-gap mt12"><span class="chip">Programme total: ' + fmtR(total) + '</span>' +
      '<button class="btn btn-sm btn-outline" data-action="apply-programme-spend" data-scid="' + sc.id + '">Use this total for expenditure on black people</button></div>'
    ) : '') +
  '</div>';
}

function tabSkills(sc) {
  const calc = calcSkills(sc);
  const s = sc.skills, t = sc.targets.skills;
  const trainingPeople = sc.people.filter(function (p) { return p.race !== 'White' && (Number(p.trainingSpend) || 0) > 0; });
  const rosterTrainingTotal = round2(trainingPeople.reduce(function (sum, p) { return sum + (Number(p.trainingSpend) || 0); }, 0));
  const fairnessMap = calcPayFairness(sc);
  const payFairnessFlags = Object.keys(fairnessMap).filter(function (id) { return fairnessMap[id].rating === 'Underpaid vs peers' || fairnessMap[id].rating === 'Overpaid vs peers'; }).length;
  return statCards('Skills Development', calc.base + calc.bonus, calc.total, round2((calc.base + calc.bonus) - calc.total)) +
    levelBanner(sc) +
    '<div class="card">' +
      '<div class="card-title">Skills Development Prerequisites</div>' +
      '<p class="muted">Have you complied with the following?</p>' +
      fieldYesNo(sc, 'skills.wspAtrSubmitted', 'Compliance confirmed') +
      '<ol class="hint" style="padding-left:18px">' +
        '<li>Implemented a Workplace Skills Plan, an Annual Training Report and Pivotal Report which are SETA approved</li>' +
        '<li>Implemented a Priority Skills programme generally, and more specifically, for black people</li>' +
      '</ol>' +
      (calc.gated ? '<div class="disclaimer">Skills Development points are currently <strong>not being recognised</strong> because compliance has not been confirmed. Figures below still show what would be achieved once confirmed.</div>' : '') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">General Questions</div>' +
      fieldYesNo(sc, 'skills.mentorship.traineeTrackingTool', 'Has a trainee tracking tool been developed?') +
      fieldYesNo(sc, 'skills.mentorship.mentorshipProgram', 'Have you implemented a mentorship program?') +
      fieldYesNo(sc, 'skills.mentorship.includeTrainingOutsidePeriod', 'Include training invoiced outside the measure period in the scoring?') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Mentorship &amp; Professional Registration</div>' +
      '<p class="hint">Disclosure figures for your verification agency — the Amended Codes do not award separate Skills Development points for these, so they are not added to your score above.</p>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th></th><th class="num">All Employees</th><th class="num">Black Employees</th></tr></thead><tbody>' +
        '<tr><td>Number of black mentees</td><td class="num">—</td><td class="num">' + numCell(sc, 'skills.mentorship.blackMentees') + '</td></tr>' +
        '<tr><td>Employees that completed a mentorship program during the last 3 years that were promoted</td><td class="num">' + numCell(sc, 'skills.mentorship.mentorshipPromotedAll') + '</td><td class="num">' + numCell(sc, 'skills.mentorship.mentorshipPromotedBlack') + '</td></tr>' +
        '<tr><td>Employees who registered as <strong>professionals</strong> with industry professional bodies during the measurement period</td><td class="num">' + numCell(sc, 'skills.mentorship.professionalsAll') + '</td><td class="num">' + numCell(sc, 'skills.mentorship.professionalsBlack') + '</td></tr>' +
        '<tr><td>Employees registered as <strong>candidates</strong> with industry professional bodies during the measurement period</td><td class="num">' + numCell(sc, 'skills.mentorship.candidatesAll') + '</td><td class="num">' + numCell(sc, 'skills.mentorship.candidatesBlack') + '</td></tr>' +
      '</tbody></table></div>' +
    '</div>' +
    trainingProgrammeCard(sc) +
    (rosterTrainingTotal > 0 ? (
      '<div class="card">' +
        '<div class="card-title">Computed from roster</div>' +
        '<p class="muted">Money you\'ve paid people directly (Management Control roster\'s "Training Spend" column) adds up automatically: <strong>' + fmtR(rosterTrainingTotal) + '</strong> across ' + trainingPeople.length + ' black employee' + (trainingPeople.length === 1 ? '' : 's') + '.</p>' +
        '<div class="flex-gap"><span class="chip">Roster total: ' + fmtR(rosterTrainingTotal) + '</span>' +
        '<button class="btn btn-sm btn-outline" data-action="apply-training-spend" data-scid="' + sc.id + '">Use this total for expenditure on black people</button></div>' +
        (payFairnessFlags > 0 ? '<p class="hint mt8">' + payFairnessFlags + ' pers' + (payFairnessFlags === 1 ? 'on is' : 'ons are') + ' flagged Underpaid or Overpaid vs their peers — see <strong>Peer Pay Check</strong> on Management Control.</p>' : '') +
      '</div>'
    ) : '') +
    '<div class="card">' +
      '<div class="card-title">Skills Development inputs <span class="pill pill-gold">Priority element — 40% sub-minimum applies to expenditure</span></div>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'skills.expBlack', 'Expenditure — learning programmes for black people', { prefix: 'R' }) +
        fieldNumber(sc, 'skills.expBursaries', 'Expenditure — bursaries for black students', { prefix: 'R' }) +
        fieldNumber(sc, 'skills.expDisabled', 'Expenditure — learning for disabled black employees', { prefix: 'R' }) +
        fieldNumber(sc, 'skills.learnersBlack', 'Black people in learnerships/apprenticeships/internships', { step: '1' }) +
        fieldNumber(sc, 'skills.totalEmployees', 'Total number of employees', { step: '1' }) +
        fieldNumber(sc, 'skills.absorbedBlack', 'Black people absorbed after learnerships', { step: '1' }) +
        fieldNumber(sc, 'skills.eligibleForAbsorption', 'Black people eligible for absorption', { step: '1' }) +
      '</div>' +
      settingsDetails('Scoring targets (advanced)', '<div class="field-grid">' +
        fieldNumber(sc, 'targets.skills.expBlackPct', 'Target — % of leviable amount (black people)') +
        fieldNumber(sc, 'targets.skills.expBursariesPct', 'Target — % of leviable amount (bursaries)') +
        fieldNumber(sc, 'targets.skills.expDisabledPct', 'Target — % of leviable amount (disabled)') +
        fieldNumber(sc, 'targets.skills.learnershipPct', 'Target — learnership participation (% of employees)') +
        fieldNumber(sc, 'targets.skills.absorptionPct', 'Target — absorption rate (%)') +
        '</div>') +
    '</div>' +
    '<div class="card"><div class="card-title">Score inspector</div>' + scoreTable(calc.rows.concat([calc.bonusRow])) + '</div>';
}

/* -------------------------- Enterprise & Supplier Development ----------------------------- */

function lineItemRows(sc, path, items) {
  return items.map(function (r, i) {
    return '<tr><td><input class="input" data-bind="' + path + '.' + i + '.label" data-scid="' + sc.id + '" value="' + esc(r.label) + '"></td>' +
      '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="' + path + '.' + i + '.amount" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(r.amount) + '"></div></td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="' + path + '" data-id="' + r.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');
}

/* Dated payment schedule for one beneficiary register (SD, ED, or SED) —
   each payment references a beneficiary by id, has its own date/amount/
   reference/description/evidence status. Only payments dated inside the
   scorecard's measurement period count toward the roll-up total; others
   are shown greyed out with an "Outside period" tag rather than silently
   excluded with no explanation. `paymentsPath`/`beneficiariesPath` are JS
   object paths (e.g. "esd.sdPayments"/"esd.sdBeneficiaries"). */
function paymentScheduleCard(sc, paymentsPath, beneficiariesPath, beneficiaries) {
  const payments = getPath(sc, paymentsPath) || [];
  const periodStart = sc.periodStart, periodEnd = sc.periodEnd;
  const inPeriod = function (d) { return !!d && (!periodStart || d >= periodStart) && (!periodEnd || d <= periodEnd); };
  const beneficiaryOpts = function (selectedId) {
    if (!beneficiaries.length) return '<option value="">No beneficiaries yet</option>';
    return beneficiaries.map(function (b) { return '<option value="' + esc(b.id) + '" ' + (b.id === selectedId ? 'selected' : '') + '>' + esc(b.name) + '</option>'; }).join('');
  };
  const rows = payments.map(function (p, i) {
    const within = inPeriod(p.date);
    return '<tr' + (within ? '' : ' style="opacity:0.55"') + '>' +
      '<td><select class="input" data-bind="' + paymentsPath + '.' + i + '.beneficiaryId" data-scid="' + sc.id + '">' + beneficiaryOpts(p.beneficiaryId) + '</select></td>' +
      '<td><input class="input" type="date" data-bind="' + paymentsPath + '.' + i + '.date" data-scid="' + sc.id + '" value="' + esc(p.date || '') + '"></td>' +
      '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="' + paymentsPath + '.' + i + '.amount" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(p.amount) + '"></div></td>' +
      '<td><input class="input" data-bind="' + paymentsPath + '.' + i + '.reference" data-scid="' + sc.id + '" value="' + esc(p.reference || '') + '"></td>' +
      '<td><input class="input" data-bind="' + paymentsPath + '.' + i + '.description" data-scid="' + sc.id + '" value="' + esc(p.description || '') + '"></td>' +
      '<td style="min-width:170px">' + evidenceStatusCell(sc, paymentsPath + '.' + i, p) + '</td>' +
      '<td>' + (within ? '' : '<span class="pill pill-muted small">Outside period</span>') + '</td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="' + paymentsPath + '" data-id="' + p.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');
  const inPeriodTotal = round2(payments.filter(function (p) { return inPeriod(p.date); }).reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0));
  const newPayment = JSON.stringify(Object.assign({ id: uid('pay'), beneficiaryId: beneficiaries.length ? beneficiaries[0].id : '', date: '', amount: 0, reference: '', description: '' }, blankEvidenceFields())).replace(/"/g, '&quot;');

  return '<div class="card">' +
    '<div class="flex-between"><div class="card-title" style="margin-bottom:0">Payment Schedule (' + payments.length + ')</div>' +
    (beneficiaries.length ? '<button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="' + paymentsPath + '" data-template="' + newPayment + '">+ Add Payment</button>' : '') +
    '</div>' +
    (beneficiaries.length ? '' : '<p class="hint mt8">Add a beneficiary above first, then log dated payments against them here.</p>') +
    (payments.length ? ('<p class="hint">Only payments dated inside the scorecard\'s measurement period (' + esc(fmtDate(periodStart)) + ' – ' + esc(fmtDate(periodEnd)) + ') count toward the roll-up total — others are shown greyed out.</p>' +
      '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Beneficiary</th><th>Date</th><th>Amount</th><th>Reference</th><th>Description</th><th>Evidence</th><th></th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>') : '') +
    (inPeriodTotal > 0 ? (
      '<div class="flex-gap mt12"><span class="chip">In-period total: ' + fmtR(inPeriodTotal) + '</span>' +
      '<button class="btn btn-sm btn-outline" data-action="apply-payments-to-beneficiaries" data-scid="' + sc.id + '" data-payments-path="' + paymentsPath + '" data-beneficiaries-path="' + beneficiariesPath + '">Roll up into beneficiary totals</button></div>'
    ) : '') +
  '</div>';
}

/* Empowering Supplier qualification questionnaire — one row per supplier,
   answering the same kind of questions the DTI's Empowering Supplier
   definition actually asks about (valid certificate, local procurement,
   job creation, skills transfer). This is audit-support disclosure only —
   it doesn't change the Preferential Procurement points calculation in
   calc.js, which is driven by recognised spend, not this questionnaire. */
function supplierQualificationLabel(q) {
  if (!q || !q.validCertificate || !q.empoweringSupplierConfirmed) return 'Does Not Qualify';
  if (q.localProcurement || q.jobCreation || q.skillsTransfer) return 'Qualifies';
  return 'Needs Review';
}
const SUPPLIER_QUALIFICATION_PILL_CLASS = { 'Qualifies': 'pill-teal', 'Needs Review': 'pill-gold', 'Does Not Qualify': 'pill-danger' };

function supplierQualificationCard(sc) {
  const suppliers = sc.esd.suppliers || [];
  if (!suppliers.length) return '';
  const rows = suppliers.map(function (sup, i) {
    const q = sup.qualification || blankSupplierQualification();
    const path = 'esd.suppliers.' + i + '.qualification';
    const label = supplierQualificationLabel(q);
    const cb = function (field) { return '<input type="checkbox" data-bind="' + path + '.' + field + '" data-scid="' + sc.id + '" ' + (q[field] ? 'checked' : '') + '>'; };
    return '<tr>' +
      '<td><strong>' + esc(sup.name) + '</strong></td>' +
      '<td style="text-align:center">' + cb('validCertificate') + '</td>' +
      '<td style="text-align:center">' + cb('empoweringSupplierConfirmed') + '</td>' +
      '<td style="text-align:center">' + cb('localProcurement') + '</td>' +
      '<td style="text-align:center">' + cb('jobCreation') + '</td>' +
      '<td style="text-align:center">' + cb('skillsTransfer') + '</td>' +
      '<td><input class="input" data-bind="' + path + '.notes" data-scid="' + sc.id + '" value="' + esc(q.notes || '') + '" placeholder="Notes..."></td>' +
      '<td><span class="pill ' + (SUPPLIER_QUALIFICATION_PILL_CLASS[label] || 'pill-muted') + '">' + esc(label) + '</span></td>' +
    '</tr>';
  }).join('');
  return '<div class="card">' +
    '<div class="card-title">Empowering Supplier Qualification</div>' +
    '<p class="hint">Audit-support disclosure, not a scoring input — the Preferential Procurement points above come from recognised spend, not this questionnaire.</p>' +
    '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Supplier</th><th>Valid Cert.</th><th>Empowering Supplier</th><th>Local Procurement</th><th>Job Creation</th><th>Skills Transfer</th><th>Notes</th><th>Status</th></tr></thead><tbody>' +
    rows + '</tbody></table></div>' +
  '</div>';
}

/* Shared by Supplier Development and Enterprise Development — a beneficiary
   register with its own computed total, same shape/pattern as SED's
   beneficiary table (tabSED below) and the roster-based training-spend
   card above. kind is 'sdBeneficiaries' or 'edBeneficiaries', matching both
   the sc.esd field name and a CSV_SECTIONS key. */
function esdBeneficiaryCard(sc, kind, title, applyAction, contributionsLabel) {
  const list = sc.esd[kind] || [];
  const rows = list.map(function (b, i) {
    return '<tr><td><input class="input" data-bind="esd.' + kind + '.' + i + '.name" data-scid="' + sc.id + '" value="' + esc(b.name) + '"></td>' +
      '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="esd.' + kind + '.' + i + '.spend" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(b.spend) + '"></div></td>' +
      '<td style="min-width:170px">' + evidenceStatusCell(sc, 'esd.' + kind + '.' + i, b) + '</td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="esd.' + kind + '" data-id="' + b.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');
  const total = round2(list.reduce(function (sum, b) { return sum + (Number(b.spend) || 0); }, 0));
  const newBen = JSON.stringify(Object.assign({ id: uid(kind === 'sdBeneficiaries' ? 'sdb' : 'edb'), name: 'New Beneficiary', spend: 0 }, blankEvidenceFields())).replace(/"/g, '&quot;');
  return '<div class="card">' +
    '<div class="flex-between"><div class="card-title" style="margin-bottom:0">' + esc(title) + ' beneficiaries (' + list.length + ')</div>' +
    '<button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="esd.' + kind + '" data-template="' + newBen + '">+ Add Beneficiary</button></div>' +
    '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Beneficiary name</th><th>Total spend</th><th>Evidence</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="4"><div class="empty-state">No beneficiaries captured yet.</div></td></tr>') + '</tbody></table></div>' +
    '<div class="flex-gap mt12">' + csvImportExportButtons(kind, sc.id) + '</div>' +
    (total > 0 ? (
      '<div class="flex-gap mt12"><span class="chip">Beneficiary total: ' + fmtR(total) + '</span>' +
      '<button class="btn btn-sm btn-outline" data-action="' + applyAction + '" data-scid="' + sc.id + '">Use this total for ' + esc(contributionsLabel) + '</button></div>'
    ) : '') +
  '</div>';
}

function tabESD(sc) {
  const calc = calcESD(sc);
  const t = sc.targets.esd;

  // ensure inclusion/exclusion items have ids for delete
  ['inclusions', 'exclusions'].forEach(function (k) {
    sc.esd[k].forEach(function (r) { if (!r.id) r.id = uid('li'); });
  });

  const inclRows = lineItemRows(sc, 'esd.inclusions', sc.esd.inclusions);
  const exclRows = lineItemRows(sc, 'esd.exclusions', sc.esd.exclusions);
  const newLine = function () { return JSON.stringify({ id: uid('li'), label: 'New line item', amount: 0 }).replace(/"/g, '&quot;'); };

  const supplierRows = sc.esd.suppliers.map(function (sup, i) {
    const levelOpts = BEE_LEVELS.map(function (l) { return '<option value="' + l + '" ' + (String(l) === String(sup.beeLevel) ? 'selected' : '') + '>' + l + '</option>'; }).join('');
    const sizeOpts = ['Generic', 'QSE', 'EME'].map(function (sz) { return '<option ' + (sz === sup.size ? 'selected' : '') + '>' + sz + '</option>'; }).join('');
    const expired = isCertExpired(sup), soon = isCertExpiringSoon(sup, 90);
    const certBadge = expired ? '<span class="pill pill-danger">Expired</span>' : (soon ? '<span class="pill pill-gold">Expires soon</span>' : (sup.certExpiry ? '<span class="pill pill-teal">Valid</span>' : ''));
    return '<tr><td><input class="input" data-bind="esd.suppliers.' + i + '.name" data-scid="' + sc.id + '" value="' + esc(sup.name) + '"></td>' +
      '<td><input class="input" type="number" step="0.01" data-bind="esd.suppliers.' + i + '.blackOwnedPct" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(sup.blackOwnedPct) + '"></td>' +
      '<td><input class="input" type="number" step="0.01" data-bind="esd.suppliers.' + i + '.blackFemaleOwnedPct" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(sup.blackFemaleOwnedPct) + '"></td>' +
      '<td><select class="input" data-bind="esd.suppliers.' + i + '.size" data-scid="' + sc.id + '">' + sizeOpts + '</select></td>' +
      '<td><select class="input" data-bind="esd.suppliers.' + i + '.beeLevel" data-scid="' + sc.id + '">' + levelOpts + '</select></td>' +
      '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="esd.suppliers.' + i + '.spend" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(sup.spend) + '"></div></td>' +
      '<td><input class="input" type="date" data-bind="esd.suppliers.' + i + '.certExpiry" data-scid="' + sc.id + '" value="' + esc(sup.certExpiry || '') + '"><div class="small mt8">' + certBadge + '</div></td>' +
      '<td class="num">' + fmtR(recognisedSpend(sup)) + (expired ? '<div class="small neg">certificate expired</div>' : '') + '</td>' +
      '<td style="min-width:170px">' + evidenceStatusCell(sc, 'esd.suppliers.' + i, sup) + '</td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="esd.suppliers" data-id="' + sup.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');
  const newSupplier = JSON.stringify(Object.assign({ id: uid('sup'), name: 'New Supplier', blackOwnedPct: 0, blackFemaleOwnedPct: 0, size: 'Generic', beeLevel: 4, spend: 0, certExpiry: '', qualification: blankSupplierQualification() }, blankEvidenceFields())).replace(/"/g, '&quot;');

  return statCards('Enterprise & Supplier Development', calc.base + calc.bonus, calc.total, round2((calc.base + calc.bonus) - calc.total)) +
    levelBanner(sc) +

    '<h2 class="section-title mt24">1. Preferential Procurement</h2>' +
    '<p class="muted mb8">Spend measured against your Total Measured Procurement Spend (TMPS) — the supplier register below.</p>' +
    '<div class="card">' +
      '<div class="card-title">Total Measured Procurement Spend (TMPS)</div>' +
      '<div class="two-col">' +
        '<div><h4>Inclusions</h4><div class="table-wrap"><table class="data-table"><tbody>' + inclRows + '</tbody></table></div>' +
        '<button class="btn btn-sm mt8" data-action="add-row" data-scid="' + sc.id + '" data-path="esd.inclusions" data-template="' + newLine() + '">+ Add line</button></div>' +
        '<div><h4>Exclusions</h4><div class="table-wrap"><table class="data-table"><tbody>' + exclRows + '</tbody></table></div>' +
        '<button class="btn btn-sm mt8" data-action="add-row" data-scid="' + sc.id + '" data-path="esd.exclusions" data-template="' + newLine() + '">+ Add line</button></div>' +
      '</div>' +
      '<div class="help-callout mt16">Total measured procurement spend: <strong>' + fmtR(calc.tmps) + '</strong></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Suppliers (' + sc.esd.suppliers.length + ')</div>' +
      (calc.expiredCount ? '<div class="disclaimer mb8">' + calc.expiredCount + ' supplier certificate(s) have expired and are being recognised at 0% until renewed.</div>' : '') +
      (calc.expiringSoonCount ? '<div class="help-callout mb8">' + calc.expiringSoonCount + ' supplier certificate(s) expire within 90 days.</div>' : '') +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Black owned %</th><th>Black women owned %</th><th>Size</th><th>B-BBEE level</th><th>Annual spend</th><th>Certificate expiry</th><th>Recognised spend</th><th>Evidence</th><th></th></tr></thead><tbody>' +
      (supplierRows || '<tr><td colspan="10"><div class="empty-state">No suppliers captured yet.</div></td></tr>') + '</tbody></table></div>' +
      '<div class="flex-gap mt12"><button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="esd.suppliers" data-template="' + newSupplier + '">+ Add Supplier</button>' +
      csvImportExportButtons('suppliers', sc.id) + '</div>' +
      settingsDetails('Scoring targets (advanced)', '<div class="field-grid">' +
        fieldNumber(sc, 'targets.esd.allSuppliersPct', 'Target — spend on empowering suppliers (% TMPS)') +
        fieldNumber(sc, 'targets.esd.qsePct', 'Target — spend on QSE suppliers (% TMPS)') +
        fieldNumber(sc, 'targets.esd.emePct', 'Target — spend on EME suppliers (% TMPS)') +
        fieldNumber(sc, 'targets.esd.blackOwnedPct', 'Target — spend on ≥51% black-owned (% TMPS)') +
        fieldNumber(sc, 'targets.esd.blackFemaleOwnedPct', 'Target — spend on ≥30% black-women-owned (% TMPS)') +
        '</div>') +
    '</div>' +
    supplierQualificationCard(sc) +
    '<div class="card"><div class="card-title">Score inspector — Preferential Procurement <span class="pill pill-gold">Priority element — 40% sub-minimum</span></div>' + scoreTable(calc.procRows) + '</div>' +

    '<h2 class="section-title mt24">2. Supplier Development</h2>' +
    '<p class="muted mb8">Contributions that help existing empowering suppliers grow — mentorship, working capital, equipment loans.</p>' +
    '<div class="card">' +
      '<div class="card-title">Supplier Development contribution</div>' +
      fieldNumber(sc, 'esd.sdContributions', 'Annual value of Supplier Development contributions', { prefix: 'R' }) +
      settingsDetails('Scoring target (advanced)', fieldNumber(sc, 'targets.esd.sdContribPct', 'Target — Supplier Development (% NPAT)')) +
    '</div>' +
    esdBeneficiaryCard(sc, 'sdBeneficiaries', 'Supplier Development', 'apply-sd-beneficiary-spend', 'the Supplier Development contribution above') +
    paymentScheduleCard(sc, 'esd.sdPayments', 'esd.sdBeneficiaries', sc.esd.sdBeneficiaries) +

    '<h2 class="section-title mt24">3. Enterprise Development</h2>' +
    '<p class="muted mb8">Contributions that help black-owned enterprises get off the ground — start-up grants, working capital, incubation.</p>' +
    '<div class="card">' +
      '<div class="card-title">Enterprise Development contribution</div>' +
      fieldNumber(sc, 'esd.edContributions', 'Annual value of Enterprise Development contributions', { prefix: 'R' }) +
      settingsDetails('Scoring target (advanced)', fieldNumber(sc, 'targets.esd.edContribPct', 'Target — Enterprise Development (% NPAT)')) +
    '</div>' +
    esdBeneficiaryCard(sc, 'edBeneficiaries', 'Enterprise Development', 'apply-ed-beneficiary-spend', 'the Enterprise Development contribution above') +
    paymentScheduleCard(sc, 'esd.edPayments', 'esd.edBeneficiaries', sc.esd.edBeneficiaries) +
    '<div class="card">' +
      '<div class="card-title">Bonus points</div>' +
      '<div class="field-grid">' +
        fieldYesNo(sc, 'esd.graduation', 'Graduated one or more ED beneficiaries to Supplier Development level?') +
        fieldYesNo(sc, 'esd.jobsCreated', 'Created jobs directly as a result of ED / SD initiatives?') +
      '</div>' +
    '</div>' +
    '<div class="card"><div class="card-title">Score inspector — Supplier &amp; Enterprise Development <span class="pill pill-gold">Priority element — 40% sub-minimum (each)</span></div>' + scoreTable([calc.sdRow, calc.edRow]) + '</div>' +
    '<div class="card"><div class="card-title">Score inspector — Bonus points</div>' + scoreTable(calc.bonusRows) + '</div>';
}

/* -------------------------------- Socio-Economic Development ------------------------------ */

function tabSED(sc) {
  const calc = calcSED(sc);
  sc.sed.beneficiaries.forEach(function (b) { if (!b.id) b.id = uid('ben'); });
  const rows = sc.sed.beneficiaries.map(function (b, i) {
    return '<tr><td><input class="input" data-bind="sed.beneficiaries.' + i + '.name" data-scid="' + sc.id + '" value="' + esc(b.name) + '"></td>' +
      '<td><div class="input-prefix-wrap"><span class="prefix">R</span><input class="input" type="number" step="0.01" data-bind="sed.beneficiaries.' + i + '.spend" data-scid="' + sc.id + '" data-type="number" data-round="2dp" value="' + displayNum(b.spend) + '"></div></td>' +
      '<td style="min-width:170px">' + evidenceStatusCell(sc, 'sed.beneficiaries.' + i, b) + '</td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-row" data-scid="' + sc.id + '" data-path="sed.beneficiaries" data-id="' + b.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');
  const newBen = JSON.stringify(Object.assign({ id: uid('ben'), name: 'New Beneficiary', spend: 0 }, blankEvidenceFields())).replace(/"/g, '&quot;');

  return statCards('Socioeconomic Development', calc.max, calc.points, round2(calc.max - calc.points)) +
    levelBanner(sc) +
    '<div class="card">' +
      '<div class="card-title">Beneficiary validation</div>' +
      '<p class="muted">Contributions only qualify for recognition if at least ' + SED_BLACK_BENEFICIARY_THRESHOLD + '% of your SED beneficiaries are Black South Africans.</p>' +
      fieldNumber(sc, 'sed.blackBeneficiariesPct', 'Black South African beneficiaries (%)') +
      (calc.meetsBeneficiaryTest ? '<div class="help-callout">Meets the ' + SED_BLACK_BENEFICIARY_THRESHOLD + '% Black beneficiary requirement.</div>' : '<div class="disclaimer">Below the ' + SED_BLACK_BENEFICIARY_THRESHOLD + '% Black beneficiary requirement — these contributions are currently <strong>not being recognised</strong>.</div>') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Beneficiaries (' + sc.sed.beneficiaries.length + ')</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Beneficiary name</th><th>Total spend</th><th>Evidence</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4"><div class="empty-state">No beneficiaries captured yet.</div></td></tr>') + '</tbody></table></div>' +
      '<div class="flex-gap mt12"><button class="btn btn-sm" data-action="add-row" data-scid="' + sc.id + '" data-path="sed.beneficiaries" data-template="' + newBen + '">+ Add Beneficiary</button>' +
      csvImportExportButtons('beneficiaries', sc.id) + '</div>' +
      settingsDetails('Scoring targets (advanced)', fieldNumber(sc, 'targets.sed.contribPct', 'Target — contribution (% of NPAT)')) +
    '</div>' +
    paymentScheduleCard(sc, 'sed.payments', 'sed.beneficiaries', sc.sed.beneficiaries) +
    '<div class="card">' +
      '<div class="card-title">Score inspector</div>' +
      scoreTable([{ label: 'Value of contributions', amount: calc.amount, actualPct: calc.actualPct, targetPct: calc.targetPct, max: calc.max, points: calc.points }]) +
    '</div>';
}

/* -------------------------------------- Y.E.S ---------------------------------------------- */

function tabYES(sc) {
  const calc = calcYES(sc);
  return levelBanner(sc) +
    '<div class="card">' +
      '<div class="card-title">Prerequisites</div>' +
      '<p class="muted">You must meet the following criteria before receiving recognition for Y.E.S contributions:</p>' +
      '<div class="field-grid">' +
        fieldYesNo(sc, 'yes.registered', 'Registered with the Y.E.S non-profit organisation for the current period?') +
        fieldYesNo(sc, 'yes.maintainedLevel', 'Maintained or improved your B-BBEE level from last year?') +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Participation</div>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'yes.headcount', 'Current headcount', { step: '1' }) +
        fieldNumber(sc, 'yes.participants', 'Y.E.S participants placed this period', { step: '1' }) +
      '</div>' +
      '<div class="kv-list">' +
        '<div><span class="k">Participation rate</span><span class="v">' + fmtPct(calc.actualPct) + '</span></div>' +
        '<div><span class="k">Target rate</span><span class="v">' + fmtPct(calc.targetPct) + '</span></div>' +
        '<div><span class="k">Status</span><span class="v">' + (calc.qualifies ? '<span class="pill pill-teal">Qualifying</span>' : '<span class="pill pill-danger">Not yet qualifying</span>') + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="disclaimer">Y.E.S participation can boost your B-BBEE level by one or two levels, or unlock exemption from Enterprise Development / Supplier Development thresholds, once prerequisites and the DTI-registered NPO process are satisfied. This tracker is indicative — confirm current-year mechanics with your Y.E.S programme administrator.</div>';
}

/* ------------------------------------ Scorecard Insights ------------------------------------ */

function tabInsights(sc) {
  const summary = calcAll(sc);
  const rows = summary.elements.map(function (e) {
    const gap = round2(e.data.base - e.data.total);
    return '<tr><td><strong>' + esc(e.label.toUpperCase()) + '</strong></td><td class="num">' + fmtPts(e.data.base) + '</td><td class="num">' + fmtPts(e.data.total) + '</td><td class="num ' + (gap > 0 ? 'neg' : 'pos') + '">' + fmtPts(gap) + '</td></tr>';
  }).join('');

  const levelRows = LEVEL_TABLE.map(function (l) {
    const active = l.level === summary.level.level;
    return '<tr' + (active ? ' style="background:#eef3fb;font-weight:700"' : '') + '><td>' + esc(l.label) + '</td><td>' + esc(l.qualification) + '</td><td class="num">' + fmtPct(l.recognition) + '</td></tr>';
  }).join('');

  const scale = weightsFor(sc);

  return (sc.size !== 'Generic' ? '<div class="disclaimer">Scored on the <strong>' + esc(sc.size) + '</strong> Scorecard (element weightings: Ownership ' + scale.ownership.base + ' / Management ' + scale.management.base + ' / Skills ' + (scale.skills.base + scale.skills.bonus) + ' / ESD ' + (scale.esd.base + scale.esd.bonus) + ' / SED ' + scale.sed.base + ').</div>' : '') +
  (summary.discounted ?
    '<div class="disclaimer"><strong>Level discounted.</strong> Your points would place you at Level ' + summary.scoreLevel.level + ', but one or more priority-element sub-minimums were not met, so your B-BBEE level is automatically discounted to <strong>Level ' + summary.level.level + '</strong> — see Priority Element Compliance below.</div>'
    : '') +
  '<div class="card">' +
    '<div style="text-align:center">' +
      '<h1 style="margin-bottom:4px">Level ' + esc(summary.level.level) + '</h1>' +
      '<div class="muted">' + esc(fmtDate(sc.periodStart)) + ' – ' + esc(fmtDate(sc.periodEnd)) + '</div>' +
      '<div class="muted">Charter: ' + esc(sc.charter) + (sc.general.sectorCharter && sc.general.sectorCharter.indexOf('Generic') === -1 ? ' · ' + esc(sc.general.sectorCharter) : '') + '</div>' +
    '</div>' +
    '<div class="table-wrap mt16"><table class="data-table"><thead><tr><th></th><th class="num">Max</th><th class="num">Actual</th><th class="num">Gap</th></tr></thead><tbody>' + rows +
      '<tr style="font-weight:800"><td>TOTAL</td><td class="num">' + fmtPts(summary.totalBaseMax) + '</td><td class="num">' + fmtPts(summary.totalActual) + '</td><td class="num">' + fmtPts(round2(summary.totalBaseMax - summary.totalActual)) + '</td></tr>' +
    '</tbody></table></div>' +
    '<p class="hint mt8">Skills Development and Enterprise &amp; Supplier Development also carry up to ' + fmtPts(scale.skills.bonus + scale.esd.bonus) + ' bonus points combined (shown in each tab), which count toward your total score above and beyond these element maximums.</p>' +
  '</div>' +
  priorityElementCard(summary) +
  '<div class="card">' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>B-BBEE Status</th><th>Qualification</th><th class="num">Recognition Level</th></tr></thead><tbody>' + levelRows + '</tbody></table></div>' +
  '</div>' +
  '<div class="card">' +
    '<h3 style="text-align:center">Overall Performance</h3>' +
    '<div class="chart-legend"><span><span class="swatch" style="background:var(--blue)"></span>Actual</span><span><span class="swatch" style="background:#b7a3e8"></span>Max</span></div>' +
    '<div id="insights-chart-' + sc.id + '"></div>' +
  '</div>' +
  costPerPointCard(sc, summary) +
  eapCard(sc) +
  (sc.size === 'EME' ? emeComparisonCard(sc) : '') +
  auditReadinessCard(sc) +
  periodComparisonCard(sc) +
  '<div class="card">' +
    '<div class="card-title">Verification &amp; Audit Prep — Export</div>' +
    '<p class="muted">Hand a consolidated, logo-branded summary to your SANAS-accredited verification agency.</p>' +
    '<div class="flex-gap">' +
      '<button class="btn btn-outline" data-action="export-pdf" data-scid="' + sc.id + '">Download PDF report</button>' +
      '<button class="btn btn-outline" data-action="export-excel" data-scid="' + sc.id + '">Download Excel report</button>' +
      '<button class="btn btn-outline" data-action="export-csv" data-scid="' + sc.id + '">Download CSV summary</button>' +
      '<button class="btn btn-outline" data-action="export-json" data-scid="' + sc.id + '">Download JSON backup</button>' +
    '</div>' +
    '<p class="hint mt8">PDF opens your browser\'s print dialog — choose "Save as PDF" as the destination.</p>' +
  '</div>' +
  '<div class="disclaimer">This tool provides an indicative B-BBEE score for internal planning purposes only, based on the Amended Codes of Good Practice. For an official B-BBEE certificate, engage a SANAS-accredited verification agency.</div>';
}

function priorityElementCard(summary) {
  const rows = summary.priority.items.map(function (it) {
    return '<tr><td>' + esc(it.label) + '</td><td class="num">' + fmtPts(it.achieved) + ' / ' + fmtPts(it.max) + '</td><td class="num">' + fmtPts(it.subMin) + '</td>' +
      '<td>' + (it.pass ? '<span class="pill pill-teal">Meets sub-minimum</span>' : '<span class="pill pill-danger">Below sub-minimum</span>') + '</td></tr>';
  }).join('');
  return '<div class="card">' +
    '<div class="card-title">Priority Element Compliance</div>' +
    '<p class="muted">Ownership, Skills Development and Enterprise &amp; Supplier Development each require at least 40% of their target on specific sub-elements. Missing any one automatically discounts your overall level by one, regardless of total points.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Sub-element</th><th class="num">Achieved</th><th class="num">40% sub-minimum</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (summary.priority.anyFail ? '' : '<div class="help-callout mt12">Your level is not being discounted — you comply with all priority element sub-minimums.</div>') +
  '</div>';
}

/* Actual cash spent (not BEE-recognition-adjusted) divided by points earned,
   for every element where spend directly drives the score — a practical
   "where does my next Rand go furthest" comparison, matching the reference
   tool's Cost Per Point Analysis on Scorecard Insights. */
/* Shared by costPerPointCard() and periodComparisonCard() — actual Rand
   spent (not BEE-recognition-adjusted) on each spend-driven element, so both
   a single-period "cost per point" view and a cross-period "spend movement"
   view compute the same numbers the same way. */
function spendByElement(sc) {
  const skillsSpend = round2((Number(sc.skills.expBlack) || 0) + (Number(sc.skills.expBursaries) || 0) + (Number(sc.skills.expDisabled) || 0));
  const esdSpend = round2((sc.esd.suppliers || []).reduce(function (s, sup) { return s + (Number(sup.spend) || 0); }, 0) + (Number(sc.esd.sdContributions) || 0) + (Number(sc.esd.edContributions) || 0));
  const sedSpend = round2((sc.sed.beneficiaries || []).reduce(function (s, b) { return s + (Number(b.spend) || 0); }, 0));
  return { skills: skillsSpend, esd: esdSpend, sed: sedSpend, total: round2(skillsSpend + esdSpend + sedSpend) };
}

function costPerPointCard(sc, summary) {
  const spend = spendByElement(sc);
  const rows = [
    { label: 'Skills Development', spend: spend.skills, points: summary.skills.total },
    { label: 'Enterprise & Supplier Development', spend: spend.esd, points: summary.esd.total },
    { label: 'Socioeconomic Development', spend: spend.sed, points: summary.sed.total }
  ];
  const rowsHtml = rows.map(function (r) {
    const costPerPoint = r.points > 0 ? round2(r.spend / r.points) : null;
    return '<tr><td>' + esc(r.label) + '</td><td class="num">' + fmtR(r.spend) + '</td><td class="num">' + fmtPts(r.points) + '</td><td class="num">' + (costPerPoint != null ? fmtR(costPerPoint) : '—') + '</td></tr>';
  }).join('');
  return '<div class="card">' +
    '<div class="card-title">Cost Per Point Analysis</div>' +
    '<p class="muted">Actual Rand spent (not BEE-recognition-adjusted) per point earned on each spend-based element — a guide to where your next Rand goes furthest.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Element</th><th class="num">Actual spend</th><th class="num">Points earned</th><th class="num">Cost per point</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
  '</div>';
}

/* The Economically Active Population split currently driving your Management
   Control targets — surfaced here too (not just as a hint on that tab) since
   it's the reference figure a verification agency will ask about. */
function eapCard(sc) {
  const t = sc.targets.management;
  return '<div class="card">' +
    '<div class="card-title">EAP\'s for this period</div>' +
    '<p class="muted">Economically Active Population split currently used as your Management Control targets — defaults to Stats SA\'s National EAP unless overridden.</p>' +
    '<div class="kv-list">' +
      '<div><span class="k">Black representation target</span><span class="v">' + fmtPct(t.blackTargetPct) + '</span></div>' +
      '<div><span class="k">Black women representation target</span><span class="v">' + fmtPct(t.blackFemaleTargetPct) + '</span></div>' +
      '<div><span class="k">Employees with disabilities target</span><span class="v">' + fmtPct(t.disabilityTargetPct) + '</span></div>' +
    '</div>' +
    '<p class="hint mt8">Adjust these on <a href="#/scorecard/' + sc.id + '/management">Management Control</a> if you measure against a regional or sector-specific EAP instead.</p>' +
  '</div>';
}

function auditReadinessCard(sc) {
  const audit = auditChecklist(sc);
  const rows = audit.checks.map(function (c) {
    return '<tr><td>' + (c.ok ? '<span class="pill pill-teal">Ready</span>' : '<span class="pill pill-danger">Needs attention</span>') + '</td><td>' + esc(c.label) + '</td>' +
      '<td>' + (c.ok ? '' : '<a href="#/scorecard/' + sc.id + '/' + c.tab + '">Go to tab</a>') + '</td></tr>';
  }).join('');
  return '<div class="card">' +
    '<div class="card-title">Verification &amp; Audit Prep — Readiness Checklist (' + audit.readyCount + ' / ' + audit.total + ')</div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Status</th><th>Check</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
  '</div>';
}

/* Step 7 — Period Comparison. Picks another scorecard from this same
   account (sc.comparisonScorecardId, a plain UI preference — see the
   comment on blankScorecard() in js/data.js) and runs the exact same
   calcAll()/auditChecklist() the current scorecard already uses on it, so
   "compare periods" never risks drifting out of sync with the live scoring
   logic — it's the same functions, just called twice. */
function periodComparisonCard(sc) {
  const others = STATE.scorecards.filter(function (s) { return s.id !== sc.id; });
  const options = '<option value="">Choose a scorecard…</option>' + others.map(function (s) {
    return '<option value="' + esc(s.id) + '"' + (sc.comparisonScorecardId === s.id ? ' selected' : '') + '>' + esc(s.description) + ' (' + esc(fmtDate(s.periodStart)) + ' – ' + esc(fmtDate(s.periodEnd)) + ')</option>';
  }).join('');

  const picker = '<div class="card">' +
    '<div class="card-title">Period Comparison</div>' +
    '<p class="muted">Compare this scorecard against another period (e.g. last year\'s submission) to see what improved, what slipped, and whether your evidence readiness moved with it.</p>' +
    (others.length ? '<div class="field"><label>Compare against</label><select class="input" data-bind="comparisonScorecardId" data-scid="' + sc.id + '">' + options + '</select></div>'
      : '<p class="hint">No other scorecards exist yet in this account to compare against.</p>') +
  '</div>';

  const prev = sc.comparisonScorecardId ? getScorecard(sc.comparisonScorecardId) : null;
  if (!prev) return picker;

  const curSummary = calcAll(sc), prevSummary = calcAll(prev);
  const curAudit = auditChecklist(sc), prevAudit = auditChecklist(prev);
  const curSpend = spendByElement(sc), prevSpend = spendByElement(prev);

  function changeCell(delta, unit) {
    const cls = delta > 0.005 ? 'pos' : (delta < -0.005 ? 'neg' : '');
    const sign = delta > 0 ? '+' : '';
    return '<td class="num ' + cls + '">' + sign + (unit === 'R' ? fmtR(delta) : fmtPts(delta)) + '</td>';
  }

  const scoreDelta = round2(curSummary.totalActual - prevSummary.totalActual);
  const levelDelta = Number(prevSummary.level.level) - Number(curSummary.level.level); // lower level number is better

  const elementRows = curSummary.elements.map(function (e, i) {
    const prevEl = prevSummary.elements[i];
    const delta = round2(e.data.total - prevEl.data.total);
    return '<tr><td>' + esc(e.label) + '</td><td class="num">' + fmtPts(prevEl.data.total) + '</td><td class="num">' + fmtPts(e.data.total) + '</td>' + changeCell(delta) + '</tr>';
  }).join('');

  const biggestGain = curSummary.elements.reduce(function (best, e, i) {
    const delta = round2(e.data.total - prevSummary.elements[i].data.total);
    return (!best || delta > best.delta) ? { label: e.label, delta: delta } : best;
  }, null);
  const biggestLoss = curSummary.elements.reduce(function (worst, e, i) {
    const delta = round2(e.data.total - prevSummary.elements[i].data.total);
    return (!worst || delta < worst.delta) ? { label: e.label, delta: delta } : worst;
  }, null);

  const spendRows = ['skills', 'esd', 'sed'].map(function (key, i) {
    const labels = ['Skills Development', 'Enterprise & Supplier Development', 'Socioeconomic Development'];
    const delta = round2(curSpend[key] - prevSpend[key]);
    return '<tr><td>' + labels[i] + '</td><td class="num">' + fmtR(prevSpend[key]) + '</td><td class="num">' + fmtR(curSpend[key]) + '</td>' + changeCell(delta, 'R') + '</tr>';
  }).join('');

  return picker +
  '<div class="card">' +
    '<div class="card-title">' + esc(prev.description) + ' → ' + esc(sc.description) + '</div>' +
    '<div class="stat-row">' +
      '<div class="stat-tile"><div class="num">' + fmtPts(prevSummary.totalActual) + '</div><div class="lbl">Previous score (Level ' + esc(prevSummary.level.level) + ')</div></div>' +
      '<div class="stat-tile"><div class="num">' + fmtPts(curSummary.totalActual) + '</div><div class="lbl">Current score (Level ' + esc(curSummary.level.level) + ')</div></div>' +
      '<div class="stat-tile"><div class="num ' + (scoreDelta > 0 ? 'pos' : (scoreDelta < 0 ? 'neg' : '')) + '">' + (scoreDelta > 0 ? '+' : '') + fmtPts(scoreDelta) + '</div><div class="lbl">Score movement — ' +
        (levelDelta > 0 ? 'Up ' + levelDelta + ' level' + (levelDelta > 1 ? 's' : '') : (levelDelta < 0 ? 'Down ' + Math.abs(levelDelta) + ' level' + (Math.abs(levelDelta) > 1 ? 's' : '') : 'Level unchanged')) + '</div></div>' +
    '</div>' +
    '<div class="table-wrap mt16"><table class="data-table"><thead><tr><th>Element</th><th class="num">' + esc(prev.description) + '</th><th class="num">' + esc(sc.description) + '</th><th class="num">Change</th></tr></thead><tbody>' + elementRows + '</tbody></table></div>' +
    (biggestGain && biggestGain.delta > 0.005 ? '<div class="help-callout mt12">Biggest gain: <strong>' + esc(biggestGain.label) + '</strong> (+' + fmtPts(biggestGain.delta) + ' points).</div>' : '') +
    (biggestLoss && biggestLoss.delta < -0.005 ? '<div class="disclaimer mt8">Biggest loss: <strong>' + esc(biggestLoss.label) + '</strong> (' + fmtPts(biggestLoss.delta) + ' points).</div>' : '') +
  '</div>' +
  '<div class="card">' +
    '<div class="card-title">Evidence Readiness Movement</div>' +
    '<div class="kv-list">' +
      '<div><span class="k">Previous period</span><span class="v">' + prevAudit.readyCount + ' / ' + prevAudit.total + ' checks ready</span></div>' +
      '<div><span class="k">Current period</span><span class="v">' + curAudit.readyCount + ' / ' + curAudit.total + ' checks ready</span></div>' +
    '</div>' +
  '</div>' +
  '<div class="card">' +
    '<div class="card-title">Spend Movement</div>' +
    '<p class="muted">Actual Rand spent (not BEE-recognition-adjusted) on each spend-driven element, period over period.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Element</th><th class="num">' + esc(prev.description) + '</th><th class="num">' + esc(sc.description) + '</th><th class="num">Change</th></tr></thead><tbody>' + spendRows +
      '<tr style="font-weight:800"><td>TOTAL</td><td class="num">' + fmtR(prevSpend.total) + '</td><td class="num">' + fmtR(curSpend.total) + '</td>' + changeCell(round2(curSpend.total - prevSpend.total), 'R') + '</tr>' +
    '</tbody></table></div>' +
  '</div>';
}

function mountInsightsCharts(sc) {
  if (!sc) return;
  const summary = calcAll(sc);
  const el = document.getElementById('insights-chart-' + sc.id);
  if (el) renderGroupedBarChart(el, summary.elements.map(function (e) { return { label: e.short, actual: e.data.total, max: e.data.base + e.data.bonus }; }), { height: 260 });
}

/* --------------------------------------- EE Insights ------------------------------------------ */

function tabEE(sc) {
  const totals = {};
  RACES.forEach(function (r) { GENDERS.forEach(function (g) { totals[r + g] = 0; }); });
  sc.people.forEach(function (p) { totals[p.race + p.gender] = (totals[p.race + p.gender] || 0) + 1; });
  const disabledCount = sc.people.filter(function (p) { return p.disabled; }).length;
  const foreignCount = sc.people.filter(function (p) { return p.foreign; }).length;

  return '<div class="card">' +
    '<div class="card-title">Headcount — ' + esc(sc.description) + '</div>' +
    '<p class="muted">Derived automatically from the roster captured on the Management Control tab.</p>' +
    '<div id="ee-chart-' + sc.id + '"></div>' +
  '</div>' +
  '<div class="card">' +
    '<div class="card-title">Designated groups</div>' +
    '<div class="kv-list">' +
      '<div><span class="k">Total headcount</span><span class="v">' + sc.people.length + '</span></div>' +
      '<div><span class="k">People with disabilities</span><span class="v">' + disabledCount + '</span></div>' +
      '<div><span class="k">Foreign nationals</span><span class="v">' + foreignCount + '</span></div>' +
    '</div>' +
  '</div>' +
  workforceProfileCard(sc) +
  eapMatrixCard(sc);
}

/* EAP (Economically Active Population) demographic matrix — actual
   workforce % by race x gender against a target % you enter (see
   blankEapTargets() in js/data.js for why these default to 0 instead of a
   guessed split: there is no single official per-race/gender EAP table
   this tool can respectably hardcode, since the real figure depends on
   whether you're measuring against national, provincial or sector-specific
   EAP — enter whichever one applies to you). Under/Over-represented badges
   only appear once a target has actually been entered for that row. */
function eapMatrixCard(sc) {
  const total = sc.people.length;
  const eap = sc.targets.eap || blankEapTargets();
  const VARIANCE_BAND_PCT = 2; // +/- this band is treated as "on target"

  const rows = [];
  RACES.forEach(function (r) {
    GENDERS.forEach(function (g) {
      const actualCount = sc.people.filter(function (p) { return p.race === r && p.gender === g; }).length;
      const actualPct = total > 0 ? round2(pct(actualCount, total)) : 0;
      const targetPct = (eap[r] && eap[r][g]) || 0;
      const variance = round2(actualPct - targetPct);
      let badge = '<span class="pill pill-muted">Set a target</span>';
      if (targetPct > 0) {
        if (variance <= -VARIANCE_BAND_PCT) badge = '<span class="pill pill-danger">Under-represented</span>';
        else if (variance >= VARIANCE_BAND_PCT) badge = '<span class="pill pill-gold">Over-represented</span>';
        else badge = '<span class="pill pill-teal">On Target</span>';
      }
      rows.push(
        '<tr><td>' + esc(r) + '</td><td>' + esc(g) + '</td><td class="num">' + actualCount + '</td><td class="num">' + fmtPct(actualPct) + '</td>' +
        '<td>' + pctCell(sc, 'targets.eap.' + r + '.' + g) + '</td>' +
        '<td class="num ' + (targetPct > 0 ? (variance > 0 ? 'pos' : (variance < 0 ? 'neg' : '')) : '') + '">' + (targetPct > 0 ? ((variance > 0 ? '+' : '') + fmtPct(variance)) : '—') + '</td>' +
        '<td>' + badge + '</td></tr>'
      );
    });
  });
  const targetTotal = round2(RACES.reduce(function (sum, r) { return sum + GENDERS.reduce(function (s, g) { return s + ((eap[r] && eap[r][g]) || 0); }, 0); }, 0));

  return '<div class="card">' +
    '<div class="card-title">EAP Demographic Matrix</div>' +
    '<p class="muted">Compares your actual workforce against target EAP percentages you enter below — fill in whichever EAP source applies to you (national, provincial, or sector-specific); every target defaults to 0% rather than a guessed split.</p>' +
    (targetTotal > 0 && Math.abs(targetTotal - 100) > 0.5 ? '<div class="disclaimer">Targets currently total ' + fmtPct(targetTotal) + ', not 100% — double-check your EAP source figures.</div>' : '') +
    '<div class="table-wrap mt12"><table class="data-table"><thead><tr><th>Race</th><th>Gender</th><th class="num">Actual Headcount</th><th class="num">Actual %</th><th class="num">Target %</th><th class="num">Variance</th><th>Status</th></tr></thead><tbody>' +
    rows.join('') + '</tbody></table></div>' +
  '</div>';
}

/* Workforce Profile — laid out like Section B of the Department of Labour's
   EEA2 form: occupational levels down the left; Male/Female split into
   African/Coloured/Indian/White columns; Foreign Nationals kept as their own
   Male/Female pair (not race-coded, mutually exclusive of the A/C/I/W
   columns, matching the official form); Total Permanent, Non-Permanent
   Employees and Grand Total rows at the end. Verified against the DoL's
   published EEA2 form (labour.gov.za) rather than guessed at. */
function workforceProfileCard(sc) {
  function rowFor(people) {
    const local = people.filter(function (p) { return !p.foreign; });
    const foreign = people.filter(function (p) { return p.foreign; });
    const cells = [];
    RACES.forEach(function (r) {
      GENDERS.forEach(function (g) {
        cells.push(local.filter(function (p) { return p.race === r && p.gender === g; }).length);
      });
    });
    const foreignM = foreign.filter(function (p) { return p.gender === 'Male'; }).length;
    const foreignF = foreign.filter(function (p) { return p.gender === 'Female'; }).length;
    cells.push(foreignM, foreignF);
    const total = people.length;
    return { cells: cells, total: total };
  }
  function rowHtml(label, people, opts) {
    opts = opts || {};
    const r = rowFor(people);
    const cellsHtml = r.cells.map(function (n) { return '<td class="num">' + n + '</td>'; }).join('');
    return '<tr' + (opts.strong ? ' style="font-weight:800;background:var(--grey-50)"' : '') + '><td>' + esc(label) + '</td>' + cellsHtml + '<td class="num">' + r.total + '</td></tr>';
  }

  const permanentPeople = sc.people.filter(function (p) { return p.permanent !== false; });
  const nonPermanentPeople = sc.people.filter(function (p) { return p.permanent === false; });

  const levelRows = OCCUPATIONAL_LEVELS.map(function (lvl) {
    return rowHtml(lvl.label, permanentPeople.filter(function (p) { return p.level === lvl.key; }));
  }).join('');

  return '<div class="card">' +
    '<div class="card-title">Workforce Profile (EEA2 Section B)</div>' +
    '<p class="muted">Occupational levels down the left; each gender split into African / Coloured / Indian / White; Foreign Nationals kept separate as their own Male/Female pair, matching the Department of Labour\'s EEA2 form.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead>' +
      '<tr><th rowspan="2" style="vertical-align:bottom">Occupational level</th><th class="num" colspan="4">Male</th><th class="num" colspan="4">Female</th><th class="num" colspan="2">Foreign Nationals</th><th rowspan="2" class="num" style="vertical-align:bottom">Total</th></tr>' +
      '<tr><th class="num">A</th><th class="num">C</th><th class="num">I</th><th class="num">W</th><th class="num">A</th><th class="num">C</th><th class="num">I</th><th class="num">W</th><th class="num">M</th><th class="num">F</th></tr>' +
    '</thead><tbody>' +
      levelRows +
      rowHtml('Total Permanent', permanentPeople, { strong: true }) +
      rowHtml('Non-Permanent Employees', nonPermanentPeople) +
      rowHtml('Grand Total', sc.people, { strong: true }) +
    '</tbody></table></div>' +
  '</div>';
}

function mountEECharts(sc) {
  if (!sc) return;
  const el = document.getElementById('ee-chart-' + sc.id);
  if (!el) return;
  const cats = [];
  RACES.forEach(function (r) {
    GENDERS.forEach(function (g) {
      const n = sc.people.filter(function (p) { return p.race === r && p.gender === g; }).length;
      cats.push({ label: r.slice(0, 3) + ' ' + g.slice(0, 1), actual: n, max: 0 });
    });
  });
  renderGroupedBarChart(el, cats, { height: 220 });
}

/* ------------------------------------------ Scenarios ------------------------------------------- */

let scenarioDrivers = null;

function defaultScenarioDrivers(sc) {
  return {
    ownership: round2(sc.ownership.economicBlackPct),
    management: round2(sc.targets.management.blackTargetPct > 0 ? Math.min(100, calcManagement(sc).total / WEIGHTS.management.base * sc.targets.management.blackTargetPct) : 0),
    skills: sc.general.leviableAmount ? round2(pct(sc.skills.expBlack, sc.general.leviableAmount)) : 0,
    esd: sc.esd && calcESD(sc).tmps ? round2(pct(calcESD(sc).allRecognised, calcESD(sc).tmps)) : 0,
    sed: sc.general.npat ? round2(pct((sc.sed.beneficiaries || []).reduce(function (s, b) { return s + b.spend; }, 0), sc.general.npat)) : 0
  };
}

function applyScenarioDrivers(sc, d) {
  const c = clone(sc);
  c.ownership.votingBlackPct = d.ownership;
  c.ownership.economicBlackPct = d.ownership;
  c.ownership.votingBlackFemalePct = round2(d.ownership * 0.4);
  c.ownership.economicBlackFemalePct = round2(d.ownership * 0.4);

  c.skills.expBlack = round2((d.skills / 100) * c.general.leviableAmount);

  const tmpsNow = calcTMPS(c.esd);
  c.esd.suppliers = [{ id: 'scn', name: '(scenario mix)', blackOwnedPct: 100, blackFemaleOwnedPct: 40, size: 'Generic', beeLevel: 1, spend: round2((d.esd / 100) * tmpsNow / 1.35) }];

  c.sed.beneficiaries = [{ id: 'scn', name: '(scenario mix)', spend: round2((d.sed / 100) * c.general.npat) }];
  return c;
}

function calcScenarioSummary(sc, d) {
  const c = applyScenarioDrivers(sc, d);
  const summary = calcAll(c);
  // Management is roster-driven; substitute a directly-scored value from the slider
  // (scored against the scorecard's own representation target) since we can't simulate a roster live.
  const mgmtPts = round2(pointsFor(d.management, sc.targets.management.blackTargetPct, WEIGHTS.management.base));
  return overrideManagementScore(summary, mgmtPts);
}

function viewScenarios() {
  const sc = getActiveScorecard();
  if (!sc) return '<div class="card empty-state"><h2>No scorecard yet</h2><p class="muted">Create a scorecard first from Your Scorecards.</p></div>';
  if (!scenarioDrivers) scenarioDrivers = defaultScenarioDrivers(sc);

  const savedRows = (STATE.scenarios || []).filter(function (s) { return s.scorecardId === sc.id; }).map(function (s) {
    return '<tr><td>' + esc(s.name) + '</td><td class="num">' + fmtPts(s.resultTotal) + '</td><td>Level ' + esc(s.resultLevel) + '</td><td>' + esc(fmtDate(s.createdAt.slice(0, 10))) + '</td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-scenario" data-id="' + s.id + '">' + ICON_CLOSE + '</button></td></tr>';
  }).join('');

  return '<div class="tabbar-wrap"><div class="tabbar"><a class="active" href="#/scenarios">Scenario Planner</a></div></div>' +
    '<div class="card">' +
      '<div class="card-title">Scenario Planner — ' + esc(sc.description) + '</div>' +
      '<p class="muted">Drag the sliders to explore how improving each element could change your overall B-BBEE level. Changes here are exploratory and are not saved to your actual scorecard unless you edit the scorecard tabs directly.</p>' +
      scenarioSlider('ownership', 'Ownership — black economic interest', scenarioDrivers.ownership, '%') +
      scenarioSlider('management', 'Management Control — black representation', scenarioDrivers.management, '%') +
      scenarioSlider('skills', 'Skills Development — spend on black learning (% of leviable amount)', scenarioDrivers.skills, '%', 10) +
      scenarioSlider('esd', 'Enterprise & Supplier Development — empowering supplier spend (% of TMPS)', scenarioDrivers.esd, '%') +
      scenarioSlider('sed', 'Socioeconomic Development — contribution (% of NPAT)', scenarioDrivers.sed, '%', 3) +
      '<div class="flex-gap mt16">' +
        '<button class="btn" data-action="save-scenario">Save this scenario</button>' +
        '<input class="input" id="scenario-name" placeholder="Scenario name" style="max-width:220px">' +
      '</div>' +
    '</div>' +
    '<div class="card" id="scenario-results"></div>' +
    (savedRows ? '<div class="card"><div class="card-title">Saved scenarios</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th class="num">Total</th><th>Level</th><th>Saved</th><th></th></tr></thead><tbody>' + savedRows + '</tbody></table></div></div>' : '');
}

function scenarioSlider(key, label, value, suffix, max) {
  return '<div class="scenario-slider-row">' +
    '<div>' + esc(label) + '</div>' +
    '<input type="range" min="0" max="' + (max || 100) + '" step="0.5" value="' + value + '" data-scenario-key="' + key + '">' +
    '<div><strong id="scenario-out-' + key + '">' + round2(value).toFixed(2) + suffix + '</strong></div>' +
    '</div>';
}

function wireScenarioSliders() {
  const sc = getActiveScorecard();
  if (!sc) return;
  updateScenarioResults(sc);
  qsa('[data-scenario-key]').forEach(function (input) {
    input.addEventListener('input', function () {
      const key = input.dataset.scenarioKey;
      scenarioDrivers[key] = round2(parseFloat(input.value));
      const out = document.getElementById('scenario-out-' + key);
      if (out) out.textContent = scenarioDrivers[key].toFixed(2) + '%';
      updateScenarioResults(sc);
    });
  });
}

function updateScenarioResults(sc) {
  const el = document.getElementById('scenario-results');
  if (!el) return;
  const baseline = calcAll(sc);
  const scenario = calcScenarioSummary(sc, scenarioDrivers);
  const delta = round2(scenario.totalActual - baseline.totalActual);
  el.innerHTML = '<div class="card-title">Projected result</div>' +
    '<div class="kv-list">' +
      '<div><span class="k">Current total</span><span class="v">' + fmtPts(baseline.totalActual) + ' (Level ' + baseline.level.level + ')</span></div>' +
      '<div><span class="k">Scenario total</span><span class="v">' + fmtPts(scenario.totalActual) + ' (Level ' + scenario.level.level + ')</span></div>' +
      '<div><span class="k">Change</span><span class="v ' + (delta >= 0 ? 'pos' : 'neg') + '">' + (delta >= 0 ? '+' : '') + fmtPts(delta) + '</span></div>' +
    '</div>' +
    '<div id="scenario-chart" class="mt16"></div>';
  const chartEl = document.getElementById('scenario-chart');
  renderGroupedBarChart(chartEl, scenario.elements.map(function (e, i) {
    return { label: e.short, actual: e.data.total, max: baseline.elements[i].data.total };
  }), { height: 200 });
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = '<span><span class="swatch" style="background:var(--blue)"></span>Scenario</span><span><span class="swatch" style="background:#b7a3e8"></span>Current</span>';
  chartEl.parentNode.insertBefore(legend, chartEl);
}

async function saveCurrentScenario() {
  const sc = getActiveScorecard();
  if (!sc) return;
  const nameInput = document.getElementById('scenario-name');
  const name = (nameInput && nameInput.value.trim()) || ('Scenario ' + (STATE.scenarios.length + 1));
  const summary = calcScenarioSummary(sc, scenarioDrivers);
  await Api.saveScenario({
    id: uid('scn'), scorecardId: sc.id, name: name, drivers: clone(scenarioDrivers),
    resultTotal: summary.totalActual, resultLevel: summary.level.level, createdAt: new Date().toISOString()
  });
  render();
}

/* -------------------------------------- Target Scorecards ---------------------------------------- */

function viewTargets() {
  const sc = getActiveScorecard();
  if (!sc) return '<div class="card empty-state"><h2>No scorecard yet</h2><p class="muted">Create a scorecard first from Your Scorecards.</p></div>';

  const g = sc.goals;
  const actualSummary = calcAll(sc);

  const goalClone = clone(sc);
  goalClone.ownership = Object.assign({}, goalClone.ownership, g.ownership);
  goalClone.skills = Object.assign({}, goalClone.skills, g.skills);
  goalClone.esd.sdContributions = g.esd.sdContributions;
  goalClone.esd.edContributions = g.esd.edContributions;
  const tmps = calcTMPS(goalClone.esd);
  goalClone.esd.suppliers = [{ id: 'goal', name: '(goal mix)', blackOwnedPct: 100, blackFemaleOwnedPct: 40, size: 'Generic', beeLevel: 1, spend: round2((g.esd.allSuppliersSpendPct / 100) * tmps / 1.35) }];
  goalClone.sed.beneficiaries = [{ id: 'goal', name: '(goal mix)', spend: g.sed.contributions }];
  let goalSummary = calcAll(goalClone);
  // Management is roster-driven; substitute the goal representation % scored against
  // the scorecard's own scoring target, since goals aren't a simulated roster.
  const mgmtGoalPts = round2(pointsFor(g.management.blackTargetPct, sc.targets.management.blackTargetPct, WEIGHTS.management.base));
  goalSummary = overrideManagementScore(goalSummary, mgmtGoalPts);

  const rows = actualSummary.elements.map(function (e, i) {
    const goalEl = goalSummary.elements[i];
    const gap = round2(goalEl.data.total - e.data.total);
    return '<tr><td>' + esc(e.label) + '</td><td class="num">' + fmtPts(e.data.total) + '</td><td class="num">' + fmtPts(goalEl.data.total) + '</td><td class="num ' + (gap > 0 ? 'pos' : (gap < 0 ? 'neg' : '')) + '">' + (gap >= 0 ? '+' : '') + fmtPts(gap) + '</td></tr>';
  }).join('');

  return '<div class="tabbar-wrap"><div class="tabbar"><a class="active" href="#/targets">Target Scorecards</a></div></div>' +
    '<div class="card">' +
      '<div class="card-title">Target Scorecard — ' + esc(sc.description) + '</div>' +
      '<p class="muted">Set the goals you want Centenary Networks to achieve, then compare against where you are today.</p>' +
      '<div class="kv-list">' +
        '<div><span class="k">Current level</span><span class="v">Level ' + actualSummary.level.level + ' (' + fmtPts(actualSummary.totalActual) + ' pts)</span></div>' +
        '<div><span class="k">Target level</span><span class="v">Level ' + goalSummary.level.level + ' (' + fmtPts(goalSummary.totalActual) + ' pts)</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Ownership goals (%)</div>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'goals.ownership.votingBlackPct', 'Voting rights — black people') +
        fieldNumber(sc, 'goals.ownership.votingBlackFemalePct', 'Voting rights — black women') +
        fieldNumber(sc, 'goals.ownership.economicBlackPct', 'Economic interest — black people') +
        fieldNumber(sc, 'goals.ownership.economicBlackFemalePct', 'Economic interest — black women') +
        fieldNumber(sc, 'goals.ownership.designatedGroupsPct', 'Designated groups') +
        fieldNumber(sc, 'goals.ownership.newEntrantsPct', 'New entrants') +
        fieldNumber(sc, 'goals.ownership.netValuePct', 'Net value') +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Management Control goals (%)</div>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'goals.management.blackTargetPct', 'Black representation') +
        fieldNumber(sc, 'goals.management.blackFemaleTargetPct', 'Black women representation') +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Skills Development goals</div>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'goals.skills.expBlack', 'Expenditure — black learning programmes', { prefix: 'R' }) +
        fieldNumber(sc, 'goals.skills.expBursaries', 'Expenditure — bursaries', { prefix: 'R' }) +
        fieldNumber(sc, 'goals.skills.expDisabled', 'Expenditure — disabled learning', { prefix: 'R' }) +
        fieldNumber(sc, 'goals.skills.learnersBlack', 'Black learnership participants', { step: '1' }) +
        fieldNumber(sc, 'goals.skills.totalEmployees', 'Total employees', { step: '1' }) +
        fieldNumber(sc, 'goals.skills.absorbedBlack', 'Absorbed after learnerships', { step: '1' }) +
        fieldNumber(sc, 'goals.skills.eligibleForAbsorption', 'Eligible for absorption', { step: '1' }) +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Enterprise &amp; Supplier / Socioeconomic Development goals</div>' +
      '<div class="field-grid">' +
        fieldNumber(sc, 'goals.esd.allSuppliersSpendPct', 'Empowering supplier spend (% of TMPS)') +
        fieldNumber(sc, 'goals.esd.sdContributions', 'Supplier Development contributions', { prefix: 'R' }) +
        fieldNumber(sc, 'goals.esd.edContributions', 'Enterprise Development contributions', { prefix: 'R' }) +
        fieldNumber(sc, 'goals.sed.contributions', 'Socioeconomic Development contributions', { prefix: 'R' }) +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Gap analysis: current vs target</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Element</th><th class="num">Current</th><th class="num">Target</th><th class="num">Gap</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
}

/* ------------------------------------- Implementation Plan ------------------------------------------ */

const ELEMENT_OPTIONS = [
  { key: 'ownership', label: 'Ownership' }, { key: 'management', label: 'Management Control' },
  { key: 'skills', label: 'Skills Development' }, { key: 'esd', label: 'Enterprise & Supplier Development' },
  { key: 'sed', label: 'Socioeconomic Development' }, { key: 'yes', label: 'Y.E.S Participation' }
];
const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Done'];

/* ------------------------------- Verification & Audit exports -------------------------------- */

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ===========================================================================
   Per-dataset CSV export/import — the "under each dataset" spreadsheet
   round-trip: bulk-add rows to a roster/register from a spreadsheet, or pull
   one out to send/edit externally. This is separate from the full-scorecard
   CSV/Excel/PDF/JSON report exports above (those summarise scores; these
   move raw rows in and out of a single table).
   =========================================================================== */

/** Minimal CSV parser (handles quoted fields, embedded commas/newlines). */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function exportRowsCSV(filename, columns, rows) {
  const header = columns.map(function (c) { return csvEscape(c.label); }).join(',');
  const lines = rows.map(function (r) {
    return columns.map(function (c) { return csvEscape(c.get ? c.get(r) : r[c.key]); }).join(',');
  });
  downloadBlob(filename, [header].concat(lines).join('\r\n'), 'text/csv;charset=utf-8;');
}

function importRowsFromCSVText(text, columns) {
  const table = parseCSV(text);
  if (!table.length) return [];
  const header = table[0].map(function (h) { return String(h).trim().toLowerCase(); });
  return table.slice(1)
    .filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); })
    .map(function (r) {
      const obj = {};
      columns.forEach(function (c) {
        const idx = header.indexOf(c.label.toLowerCase());
        const raw = idx > -1 ? r[idx] : '';
        obj[c.key] = c.parse ? c.parse(raw) : raw;
      });
      return obj;
    });
}

const yesNoGet = function (key) { return function (r) { return r[key] ? 'Yes' : 'No'; }; };
const yesNoParse = function (v) { return /^y/i.test(String(v).trim()); };
const numParse = function (v) { return round2(parseFloat(v) || 0); };

/* Shared by every CSV_SECTIONS entry that carries an evidence status
   (suppliers, SD/ED/SED beneficiaries) — round-trips through a spreadsheet
   without losing review progress. Falls back to "Missing Documents" for
   anything that isn't one of the four real values, rather than importing a
   typo as a silent new status. */
function evidenceStatusColumns() {
  return [
    { key: 'evidenceStatus', label: 'Evidence Status', parse: function (v) { const s = String(v).trim(); return EVIDENCE_STATUSES.indexOf(s) > -1 ? s : 'Missing Documents'; } },
    { key: 'evidenceRejectionNote', label: 'Rejection Note' }
  ];
}

/* Column specs + the array each dataset lives on. `get(sc)` returns the
   live array (mutate it directly to add imported rows) — `sc` is unused for
   the 'tasks' kind since tasks live on STATE, not a scorecard. */
const CSV_SECTIONS = {
  people: {
    idPrefix: 'p', label: 'roster',
    get: function (sc) { return sc.people; },
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'race', label: 'Race' },
      { key: 'gender', label: 'Gender' },
      { key: 'disabled', label: 'Disabled', get: yesNoGet('disabled'), parse: yesNoParse },
      { key: 'foreign', label: 'Foreign', get: yesNoGet('foreign'), parse: yesNoParse },
      { key: 'permanent', label: 'Permanent', get: function (p) { return p.permanent === false ? 'No' : 'Yes'; }, parse: function (v) { return String(v).trim().toLowerCase() !== 'no'; } },
      {
        key: 'level', label: 'Occupational Level',
        get: function (p) { const l = OCCUPATIONAL_LEVELS.find(function (x) { return x.key === p.level; }); return l ? l.label : p.level; },
        parse: function (v) { const l = OCCUPATIONAL_LEVELS.find(function (x) { return x.label.toLowerCase() === String(v).trim().toLowerCase(); }); return l ? l.key : 'skilled'; }
      },
      { key: 'designation', label: 'Designation' },
      { key: 'trainingSpend', label: 'Training Spend', parse: numParse }
    ]
  },
  shareholders: {
    idPrefix: 'sh', label: 'shareholders',
    get: function (sc) { return sc.ownership.shareholders; },
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'race', label: 'Race' },
      { key: 'gender', label: 'Gender' },
      { key: 'foreign', label: 'Foreign', get: yesNoGet('foreign'), parse: yesNoParse },
      { key: 'shareholdingPct', label: 'Shareholding %', parse: numParse },
      { key: 'newEntrant', label: 'New Entrant', get: yesNoGet('newEntrant'), parse: yesNoParse },
      { key: 'designatedGroup', label: 'Designated Group', get: yesNoGet('designatedGroup'), parse: yesNoParse }
    ]
  },
  suppliers: {
    idPrefix: 'sup', label: 'suppliers',
    get: function (sc) { return sc.esd.suppliers; },
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'blackOwnedPct', label: 'Black Owned %', parse: numParse },
      { key: 'blackFemaleOwnedPct', label: 'Black Women Owned %', parse: numParse },
      { key: 'size', label: 'Size' },
      { key: 'beeLevel', label: 'B-BBEE Level', parse: function (v) { const n = parseInt(v, 10); return isNaN(n) ? String(v).trim() : n; } },
      { key: 'spend', label: 'Annual Spend', parse: numParse },
      { key: 'certExpiry', label: 'Certificate Expiry' }
    ].concat(evidenceStatusColumns())
  },
  beneficiaries: {
    idPrefix: 'ben', label: 'beneficiaries',
    get: function (sc) { return sc.sed.beneficiaries; },
    columns: [
      { key: 'name', label: 'Beneficiary Name' },
      { key: 'spend', label: 'Total Spend', parse: numParse }
    ].concat(evidenceStatusColumns())
  },
  programmes: {
    idPrefix: 'prog', label: 'training programmes',
    get: function (sc) { return sc.skills.programmes; },
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'abet', label: 'ABET', get: yesNoGet('abet'), parse: yesNoParse },
      { key: 'mandatory', label: 'Mandatory', get: yesNoGet('mandatory'), parse: yesNoParse },
      { key: 'provider', label: 'Provider' },
      { key: 'participants', label: 'Participants', parse: function (v) { return Math.round(numParse(v)); } },
      { key: 'spend', label: 'Spend', parse: numParse },
      { key: 'support', label: 'Support Provided' }
    ]
  },
  sdBeneficiaries: {
    idPrefix: 'sdb', label: 'Supplier Development beneficiaries',
    get: function (sc) { return sc.esd.sdBeneficiaries; },
    columns: [
      { key: 'name', label: 'Beneficiary Name' },
      { key: 'spend', label: 'Total Spend', parse: numParse }
    ].concat(evidenceStatusColumns())
  },
  edBeneficiaries: {
    idPrefix: 'edb', label: 'Enterprise Development beneficiaries',
    get: function (sc) { return sc.esd.edBeneficiaries; },
    columns: [
      { key: 'name', label: 'Beneficiary Name' },
      { key: 'spend', label: 'Total Spend', parse: numParse }
    ].concat(evidenceStatusColumns())
  },
  tasks: {
    idPrefix: 'task', label: 'action items',
    get: function () { return STATE.implementation; },
    columns: [
      { key: 'title', label: 'Title' },
      {
        key: 'element', label: 'Element',
        get: function (t) { const o = ELEMENT_OPTIONS.find(function (x) { return x.key === t.element; }); return o ? o.label : t.element; },
        parse: function (v) { const o = ELEMENT_OPTIONS.find(function (x) { return x.label.toLowerCase() === String(v).trim().toLowerCase(); }); return o ? o.key : 'ownership'; }
      },
      { key: 'owner', label: 'Owner' },
      { key: 'due', label: 'Due Date' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notes' }
    ]
  }
};

function exportSectionCSV(kind, sc) {
  const spec = CSV_SECTIONS[kind];
  if (!spec) return;
  const rows = spec.get(sc);
  const namePart = sc ? sc.description.replace(/[^a-z0-9]+/gi, '_') + '_' : '';
  exportRowsCSV(namePart + spec.label.replace(/\s+/g, '_') + '.csv', spec.columns, rows);
}

function importSectionCSV(kind, sc, text) {
  const spec = CSV_SECTIONS[kind];
  if (!spec) return 0;
  const extra = kind === 'people' ? blankPortfolioFields() : {};
  const parsed = importRowsFromCSVText(text, spec.columns).map(function (r) { return Object.assign({ id: uid(spec.idPrefix) }, extra, r); });
  const arr = spec.get(sc);
  parsed.forEach(function (r) { arr.push(r); });
  return parsed.length;
}

/* The small "Export CSV / Import CSV" button pair used under every dataset
   table (roster, shareholders, suppliers, beneficiaries, tasks). Returns
   bare buttons (no wrapper) so callers can drop them into their own
   .flex-gap row alongside an "+ Add" button. */
function csvImportExportButtons(kind, scId) {
  const scidAttr = scId ? ' data-scid="' + scId + '"' : '';
  return '<button class="btn btn-sm btn-outline" data-action="export-csv-rows" data-kind="' + kind + '"' + scidAttr + '>Export CSV</button>' +
    '<button class="btn btn-sm btn-outline" data-action="import-csv-rows" data-kind="' + kind + '"' + scidAttr + '>Import CSV</button>';
}

function exportScorecardCSV(sc) {
  if (!sc) return;
  const summary = calcAll(sc);
  const lines = [['Element', 'Max', 'Actual', 'Gap'].map(csvEscape).join(',')];
  summary.elements.forEach(function (e) {
    lines.push([e.label, fmtPts(e.data.base), fmtPts(e.data.total), fmtPts(round2(e.data.base - e.data.total))].map(csvEscape).join(','));
  });
  lines.push(['TOTAL', fmtPts(summary.totalBaseMax), fmtPts(summary.totalActual), fmtPts(round2(summary.totalBaseMax - summary.totalActual))].map(csvEscape).join(','));
  lines.push('');
  lines.push(['Contributor level (before discounting)', summary.scoreLevel.level].map(csvEscape).join(','));
  lines.push(['Contributor level (final)', summary.level.level].map(csvEscape).join(','));
  lines.push(['Recognition level', fmtPct(summary.level.recognition)].map(csvEscape).join(','));
  lines.push('');
  lines.push(['Priority element', 'Achieved', '40% sub-minimum', 'Status'].map(csvEscape).join(','));
  summary.priority.items.forEach(function (it) {
    lines.push([it.label, fmtPts(it.achieved), fmtPts(it.subMin), it.pass ? 'Pass' : 'Fail'].map(csvEscape).join(','));
  });
  downloadBlob(sc.description.replace(/[^a-z0-9]+/gi, '_') + '_summary.csv', lines.join('\n'), 'text/csv;charset=utf-8;');
}

function exportScorecardJSON(sc) {
  if (!sc) return;
  downloadBlob(sc.description.replace(/[^a-z0-9]+/gi, '_') + '_backup.json', JSON.stringify(sc, null, 2), 'application/json;charset=utf-8;');
}

/* Builds the shared report markup (company header with logo + element/priority
   tables) used by both the Excel and PDF exports, so the two stay in sync. */
function buildReportHTML(sc, logoSrc) {
  const summary = calcAll(sc);
  const co = STATE.company;
  const elementRows = summary.elements.map(function (e) {
    return '<tr><td>' + esc(e.label) + '</td><td>' + fmtPts(e.data.base) + '</td><td>' + fmtPts(e.data.total) + '</td><td>' + fmtPts(round2(e.data.base - e.data.total)) + '</td></tr>';
  }).join('');
  const priorityRows = summary.priority.items.map(function (it) {
    return '<tr><td>' + esc(it.label) + '</td><td>' + fmtPts(it.achieved) + '</td><td>' + fmtPts(it.subMin) + '</td><td>' + (it.pass ? 'Pass' : 'Fail') + '</td></tr>';
  }).join('');
  return (
    '<div class="print-header">' +
      (logoSrc ? '<img src="' + logoSrc + '" alt="' + esc(co.name) + '">' : '') +
      '<div><h1 style="margin:0">' + esc(co.name) + '</h1><div>' + esc(co.tagline || '') + '</div></div>' +
    '</div>' +
    '<h2>' + esc(sc.description) + '</h2>' +
    '<p>' + esc(fmtDate(sc.periodStart)) + ' &ndash; ' + esc(fmtDate(sc.periodEnd)) + ' &middot; ' + esc(sc.charter) + ' &middot; ' + esc(sc.size) + ' Scorecard</p>' +
    '<p><strong>Overall level: ' + summary.level.level + '</strong> (' + fmtPts(summary.totalActual) + ' / ' + fmtPts(summary.totalBaseMax) + ' points, ' + fmtPct(summary.level.recognition) + ' recognition)' +
      (summary.discounted ? ' &mdash; discounted from Level ' + summary.scoreLevel.level + ' due to a priority element sub-minimum shortfall' : '') + '</p>' +
    '<h3>Element summary</h3>' +
    '<table><thead><tr><th>Element</th><th>Max</th><th>Actual</th><th>Gap</th></tr></thead><tbody>' + elementRows + '</tbody></table>' +
    '<h3>Priority element compliance</h3>' +
    '<table><thead><tr><th>Sub-element</th><th>Achieved</th><th>40% sub-minimum</th><th>Status</th></tr></thead><tbody>' + priorityRows + '</tbody></table>' +
    '<div class="print-footer">Generated by the Centenary Networks B-BBEE Scorecard Tool on ' + new Date().toLocaleString('en-ZA') + '. Indicative score for internal planning only — not a certified rating.</div>'
  );
}

/* Excel export: a real .xlsx would need a library this offline tool doesn't
   ship with, so this uses the well-established trick of serving an HTML
   table with an .xls extension and Excel's MIME type — Excel opens it as a
   normal spreadsheet. The logo is embedded as base64 (see js/logo-data.js)
   so the file is self-contained wherever it's opened. */
function exportScorecardExcel(sc) {
  if (!sc) return;
  const logoSrc = 'data:image/png;base64,' + LOGO_BASE64_PNG;
  const html = '<html><head><meta charset="UTF-8"></head><body>' + buildReportHTML(sc, logoSrc) + '</body></html>';
  downloadBlob(sc.description.replace(/[^a-z0-9]+/gi, '_') + '_report.xls', html, 'application/vnd.ms-excel;charset=utf-8;');
}

/* PDF export: renders the same report into the hidden #print-root (see
   index.html + the @media print rules in styles.css, which hide everything
   else on the page) and opens the browser's print dialog — "Save as PDF" is
   a standard destination there on every major OS/browser, with no library
   or server round-trip required. */
function exportScorecardPDF(sc) {
  if (!sc) return;
  const printRoot = document.getElementById('print-root');
  printRoot.innerHTML = buildReportHTML(sc, 'assets/centenary-logo.png');
  window.print();
}

/* ===========================================================================
   Per-person Portfolio of Evidence PDF.
   Replaces last year's process of submitting several loose individual
   documents per employee — this generates ONE consolidated, logo-branded PDF
   per person straight from the roster (Management Control), covering the
   fields a verification agency actually checks a person's record against.
   One button click -> one file per person, via the same print mechanism as
   the scorecard report above.
   =========================================================================== */

function buildPersonReportHTML(sc, person) {
  const co = STATE.company;
  const levelMeta = OCCUPATIONAL_LEVELS.find(function (l) { return l.key === person.level; });
  const rows = [
    ['Full name', person.name],
    ['Race', person.race],
    ['Gender', person.gender],
    ['Disability status', person.disabled ? 'Person with a disability' : 'No disability recorded'],
    ['Nationality', person.foreign ? 'Foreign national' : 'South African'],
    ['Occupational level', levelMeta ? levelMeta.label : person.level],
    ['Designation', person.designation || '—'],
    ['Scorecard', sc.description],
    ['Measurement period', fmtDate(sc.periodStart) + ' – ' + fmtDate(sc.periodEnd)]
  ].map(function (r) { return '<tr><td><strong>' + esc(r[0]) + '</strong></td><td>' + esc(r[1]) + '</td></tr>'; }).join('');

  return (
    '<div class="print-header">' +
      '<img src="assets/centenary-logo.png" alt="' + esc(co.name) + '">' +
      '<div><h1 style="margin:0">' + esc(co.name) + '</h1><div>' + esc(co.tagline || '') + '</div></div>' +
    '</div>' +
    '<h2>Employee Verification Summary</h2>' +
    '<table><tbody>' + rows + '</tbody></table>' +
    '<p style="margin-top:18px">This single record consolidates the identity and demographic details verified for this person against the Management Control and Employment Equity elements of the scorecard above — provided in place of separate individual document submissions.</p>' +
    '<div class="print-footer">Generated by the Centenary Networks B-BBEE Scorecard Tool on ' + new Date().toLocaleString('en-ZA') + ' for ' + esc(person.name) + '. For SANAS verification use — retain alongside supporting ID/EE documentation.</div>'
  );
}

function exportPersonPDF(sc, person) {
  if (!sc || !person) return;
  const printRoot = document.getElementById('print-root');
  printRoot.innerHTML = buildPersonReportHTML(sc, person);
  window.print();
}

function viewImplementation() {
  const tasks = STATE.implementation || [];
  const rows = tasks.map(function (task, i) {
    const elOpts = ELEMENT_OPTIONS.map(function (o) { return '<option value="' + o.key + '" ' + (o.key === task.element ? 'selected' : '') + '>' + o.label + '</option>'; }).join('');
    const statusOpts = STATUS_OPTIONS.map(function (o) { return '<option ' + (o === task.status ? 'selected' : '') + '>' + o + '</option>'; }).join('');
    const badgeClass = task.status === 'Done' ? 'status-done' : (task.status === 'In Progress' ? 'status-in-progress' : 'status-not-started');
    return '<tr>' +
      '<td><input class="input" data-bind="implementation.' + i + '.title" value="' + esc(task.title) + '"></td>' +
      '<td><select class="input" data-bind="implementation.' + i + '.element">' + elOpts + '</select></td>' +
      '<td><input class="input" data-bind="implementation.' + i + '.owner" value="' + esc(task.owner) + '"></td>' +
      '<td><input class="input" type="date" data-bind="implementation.' + i + '.due" value="' + esc(task.due) + '"></td>' +
      '<td><select class="input" data-bind="implementation.' + i + '.status">' + statusOpts + '</select> <span class="status-badge ' + badgeClass + '">' + esc(task.status) + '</span></td>' +
      '<td><input class="input" data-bind="implementation.' + i + '.notes" value="' + esc(task.notes) + '"></td>' +
      '<td><button class="btn btn-sm btn-danger" data-action="del-task" data-id="' + task.id + '">' + ICON_CLOSE + '</button></td>' +
      '</tr>';
  }).join('');

  return '<div class="tabbar-wrap"><div class="tabbar"><a class="active" href="#/implementation">Implementation Planner</a></div></div>' +
    '<div class="card">' +
      '<div class="flex-between"><div class="card-title" style="margin-bottom:0">Action items (' + tasks.length + ')</div>' +
      '<button class="btn" data-action="new-task">+ Add action item</button></div>' +
      '<p class="muted">Create and delegate action items to expedite implementation of your scorecard and target goals.</p>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Element</th><th>Owner</th><th>Due</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7"><div class="empty-state">No action items yet — add one above.</div></td></tr>') + '</tbody></table></div>' +
      '<div class="flex-gap mt12">' +
      (tasks.length ? '<button class="btn btn-outline btn-sm" data-action="save-tasks">Save all changes</button>' : '') +
      csvImportExportButtons('tasks', null) +
      '</div>' +
    '</div>';
}

/* ============================================================================
   User Portfolios — Portfolio of Evidence, one consolidated PDF per person.
   Replaces last year's process of several separate individual document
   submissions: every person on the Management Control roster (sc.people)
   gets exactly one dropzone, one status, one place to review why a file was
   rejected. See BACKEND.md "Portfolio of Evidence uploads" for the real
   upload/review endpoints this is standing in for — everything here works
   locally today via js/portfolio-store.js (IndexedDB) and Api.js.
   ============================================================================ */

const PORTFOLIO_STATUS_CLASS = {
  'Missing Documents': 'portfolio-status-missing',
  'Uploaded (Pending Review)': 'portfolio-status-uploaded',
  'Approved': 'portfolio-status-approved',
  'Rejected': 'portfolio-status-rejected'
};

function portfolioProgress(sc) {
  const total = sc.people.length;
  const done = sc.people.filter(function (p) { return p.portfolioStatus && p.portfolioStatus !== 'Missing Documents'; }).length;
  return { done: done, total: total, pct: total ? round2(pct(done, total)) : 0 };
}

function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return round2(bytes / 1024) + ' KB';
  return round2(bytes / (1024 * 1024)) + ' MB';
}

function viewPortfolios() {
  const sc = getActiveScorecard();
  if (!sc) return '<div class="card empty-state"><h2>No scorecard yet</h2><p class="muted">Create a scorecard first from Your Scorecards, then come back here to attach evidence for each person.</p></div>';

  const progress = portfolioProgress(sc);
  const rows = sc.people.map(function (p) { return portfolioRow(sc, p); }).join('');

  return '<div class="tabbar-wrap"><div class="tabbar"><a class="active" href="#/portfolios">User Portfolios</a></div></div>' +
    '<div class="card">' +
      '<div class="card-title">Portfolio of Evidence — ' + esc(sc.description) + '</div>' +
      '<p class="muted">One consolidated PDF per person (ID, employment contract and any role-specific documents bundled together) instead of several separate individual submissions.</p>' +
      '<div class="flex-between mb8"><strong>' + progress.done + ' of ' + progress.total + ' Employee PDFs Submitted</strong><span class="muted">' + fmtPct(progress.pct) + '</span></div>' +
      // Light violet reads as progress toward "done"; red is reserved for
      // genuinely low completion (<50%) — see the .progress-bar-fill/
      // .is-low comment in css/styles.css.
      '<div class="progress-bar"><div class="progress-bar-fill' + (progress.pct < 50 ? ' is-low' : '') + '" style="width:' + Math.max(4, progress.pct) + '%">' + (progress.total ? Math.round(progress.pct) + '%' : '') + '</div></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Person</th><th>Level</th><th>Required documents</th><th>File</th><th>Status</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5"><div class="empty-state">No people on the roster yet — add them under Management Control first.</div></td></tr>') +
      '</tbody></table></div>' +
    '</div>' +
    evidenceCentreCard(sc) +
    '<div class="disclaimer">Uploaded files are stored on this device only (no backend yet) — see BACKEND.md for the real upload/review contract. Approve/Reject below is a manual demo toggle until a verification-agency reviewer role exists.</div>';
}

/* Evidence Centre — every evidence item across the whole scorecard in one
   place (not just employee portfolios): ESD suppliers, and Supplier/
   Enterprise/Socioeconomic Development beneficiaries all carry the same
   Missing/Uploaded/Approved/Rejected status (see evidenceStatusCell()), so
   this rolls all of them up into one triage list — worst status first —
   instead of having to open every tab to see what still needs attention. */
function evidenceCentreItems(sc) {
  const items = [];
  sc.people.forEach(function (p) {
    items.push({ type: 'Employee Portfolio', kind: 'person', name: p.name, status: p.portfolioStatus || 'Missing Documents', link: '#/portfolios' });
  });
  (sc.ownership.shareholders || []).forEach(function (h) {
    items.push({ type: 'Shareholder', kind: 'shareholder', name: h.name, status: h.evidenceStatus || 'Missing Documents', link: '#/scorecard/' + sc.id + '/ownership' });
  });
  (sc.esd.suppliers || []).forEach(function (s) {
    items.push({ type: 'ESD Supplier', kind: 'supplier', name: s.name, status: s.evidenceStatus || 'Missing Documents', link: '#/scorecard/' + sc.id + '/esd' });
  });
  (sc.esd.sdBeneficiaries || []).forEach(function (b) {
    items.push({ type: 'Supplier Development Beneficiary', kind: 'sdBeneficiary', name: b.name, status: b.evidenceStatus || 'Missing Documents', link: '#/scorecard/' + sc.id + '/esd' });
  });
  (sc.esd.edBeneficiaries || []).forEach(function (b) {
    items.push({ type: 'Enterprise Development Beneficiary', kind: 'edBeneficiary', name: b.name, status: b.evidenceStatus || 'Missing Documents', link: '#/scorecard/' + sc.id + '/esd' });
  });
  (sc.sed.beneficiaries || []).forEach(function (b) {
    items.push({ type: 'SED Beneficiary', kind: 'sedBeneficiary', name: b.name, status: b.evidenceStatus || 'Missing Documents', link: '#/scorecard/' + sc.id + '/sed' });
  });
  (sc.skills.programmes || []).forEach(function (p) {
    items.push({ type: 'Training Programme', kind: 'programme', name: p.category + (p.provider ? ' — ' + p.provider : ''), status: p.evidenceStatus || 'Missing Documents', link: '#/scorecard/' + sc.id + '/skills' });
  });
  return items;
}

function evidenceCentreCard(sc) {
  const items = evidenceCentreItems(sc);
  const counts = { 'Missing Documents': 0, 'Uploaded (Pending Review)': 0, 'Approved': 0, 'Rejected': 0 };
  items.forEach(function (it) { counts[it.status] = (counts[it.status] || 0) + 1; });
  const priority = { 'Rejected': 0, 'Missing Documents': 1, 'Uploaded (Pending Review)': 2, 'Approved': 3 };
  const sorted = items.slice().sort(function (a, b) { return (priority[a.status] == null ? 9 : priority[a.status]) - (priority[b.status] == null ? 9 : priority[b.status]); });
  const rows = sorted.map(function (it) {
    const statusClass = PORTFOLIO_STATUS_CLASS[it.status] || 'portfolio-status-missing';
    const docs = it.kind === 'person' ? [] : requiredDocsForKind(it.kind);
    const docsHtml = docs.map(function (d) { return '<span class="badge-required">' + esc(d) + '</span>'; }).join('');
    return '<tr data-status="' + esc(it.status) + '"><td>' + esc(it.type) + '</td><td>' + esc(it.name) + '</td><td>' + (docsHtml || '<span class="muted small">see tab</span>') + '</td><td><span class="status-badge ' + statusClass + '">' + esc(it.status) + '</span></td><td><a href="' + it.link + '">Go to tab</a></td></tr>';
  }).join('');
  return '<div class="card">' +
    '<div class="card-title">Evidence Centre — ' + esc(sc.description) + '</div>' +
    '<p class="muted">Every evidence item across this scorecard in one place — employee portfolios, shareholders, ESD suppliers, Supplier/Enterprise/Socioeconomic Development beneficiaries, and training programmes — sorted worst-status-first so you can see what still needs attention without opening every tab.</p>' +
    '<div class="stat-row">' +
      '<div class="stat-tile"><div class="num neg">' + counts['Rejected'] + '</div><div class="lbl">Rejected</div></div>' +
      '<div class="stat-tile"><div class="num">' + counts['Missing Documents'] + '</div><div class="lbl">Missing</div></div>' +
      '<div class="stat-tile"><div class="num">' + counts['Uploaded (Pending Review)'] + '</div><div class="lbl">Pending Review</div></div>' +
      '<div class="stat-tile"><div class="num pos">' + counts['Approved'] + '</div><div class="lbl">Approved</div></div>' +
    '</div>' +
    '<label class="checkbox-row small mb8"><input type="checkbox" data-evidence-queue-filter> Reviewer queue — show "Uploaded (Pending Review)" only</label>' +
    '<div class="table-wrap mt12"><table class="data-table" data-evidence-queue><thead><tr><th>Type</th><th>Name</th><th>Required Documents</th><th>Status</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty-state">No evidence items yet.</div></td></tr>') + '</tbody></table></div>' +
  '</div>';
}

function portfolioRow(sc, person) {
  const idx = sc.people.indexOf(person);
  const levelMeta = OCCUPATIONAL_LEVELS.find(function (l) { return l.key === person.level; });
  const docs = requiredDocsFor(person);
  const docsHtml = docs.map(function (d) { return '<span class="badge-required">' + esc(d) + '</span>'; }).join('');
  const status = person.portfolioStatus || 'Missing Documents';
  const statusClass = PORTFOLIO_STATUS_CLASS[status] || 'portfolio-status-missing';
  const hasFile = status !== 'Missing Documents';

  const dropzoneInner = hasFile
    ? '<div class="dz-filename">' + esc(person.portfolioFileName) + '</div><div>' + fmtFileSize(person.portfolioFileSize) + '</div><div class="hint">Drop a new PDF to replace it</div>'
    : '<div>Drop PDF here or click to browse</div>';

  const statusOpts = PORTFOLIO_STATUSES.map(function (s) { return '<option value="' + esc(s) + '" ' + (s === status ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  const ro = canReview() ? '' : ' disabled';

  return '<tr>' +
    '<td><strong>' + esc(person.name) + '</strong><div class="small muted">' + esc(person.designation || '') + '</div></td>' +
    '<td>' + esc(levelMeta ? levelMeta.label : person.level) + '</td>' +
    '<td>' + docsHtml + '</td>' +
    '<td style="min-width:220px">' +
      '<form class="portfolio-direct-form" data-scid="' + sc.id + '" data-person-id="' + person.id + '">' +
        '<div class="dropzone" data-dropzone>' +
          '<input type="file" accept="application/pdf,.pdf" name="file"' + ro + '>' +
          dropzoneInner +
        '</div>' +
        '<label class="checkbox-row small mt8"><input type="checkbox" class="portfolio-confirm-checkbox" required' + ro + '> I confirm this PDF contains ' + esc(docs.join(', ')) + ' for ' + esc(person.name) + '.</label>' +
        '<div class="flex-gap mt8">' +
          '<button type="submit" class="btn btn-sm" disabled>' + (hasFile ? 'Replace' : 'Upload') + '</button>' +
          (hasFile ? '<button type="button" class="btn btn-sm btn-outline" data-action="preview-portfolio" data-scid="' + sc.id + '" data-id="' + person.id + '">View</button>' : '') +
        '</div>' +
        '<div class="portfolio-error neg small mt8" style="display:none"></div>' +
      '</form>' +
    '</td>' +
    '<td style="min-width:200px">' +
      '<span class="status-badge ' + statusClass + '">' + esc(status) + '</span>' +
      '<div class="mt8"><select class="input" data-bind="people.' + idx + '.portfolioStatus" data-scid="' + sc.id + '"' + ro + '>' + statusOpts + '</select></div>' +
      '<div class="hint">' + (ro ? 'Viewer mode — read only' : 'Reviewer status — demo toggle') + '</div>' +
      (status === 'Rejected' ? '<div class="field mt8"><label class="small">Rejection reason</label><textarea class="input" rows="2" data-bind="people.' + idx + '.portfolioRejectionNote" data-scid="' + sc.id + '"' + ro + '>' + esc(person.portfolioRejectionNote || '') + '</textarea></div>' : '') +
    '</td>' +
    '</tr>';
}

/* --------------------------- Dropzone + upload interactions --------------------- */

function updatePortfolioSubmitState(form) {
  const fileInput = form.querySelector('input[type="file"]');
  const checkbox = form.querySelector('.portfolio-confirm-checkbox');
  const submitBtn = form.querySelector('button[type="submit"]');
  const hasFile = fileInput.files && fileInput.files.length > 0;
  submitBtn.disabled = !(hasFile && checkbox.checked);
}

function validatePortfolioFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Only PDF files are accepted.';
  if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) return 'File is larger than ' + PORTFOLIO_MAX_FILE_MB + 'MB — please compress the scan and try again.';
  return null;
}

function showPortfolioError(form, message) {
  const el = form.querySelector('.portfolio-error');
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? 'block' : 'none';
}

function handlePortfolioFileSelected(form, file) {
  showPortfolioError(form, null);
  if (!file) { updatePortfolioSubmitState(form); return; }
  const err = validatePortfolioFile(file);
  const dz = form.querySelector('[data-dropzone]');
  if (err) {
    showPortfolioError(form, err);
    form.querySelector('input[type="file"]').value = '';
  } else {
    const nameEl = dz.querySelector('.dz-filename') || (function () { const d = document.createElement('div'); d.className = 'dz-filename'; dz.prepend(d); return d; })();
    nameEl.textContent = file.name + ' (' + fmtFileSize(file.size) + ')';
  }
  updatePortfolioSubmitState(form);
}

/* Reviewer queue filter on the Evidence Centre — purely a client-side view
   toggle (which rows are visible), not app state, so it doesn't go through
   setPath()/persist()/render() like every other control on this page; it
   would be lost on the next render anyway (e.g. after approving a row), and
   that's fine — a reviewer re-checks it while working the queue. */
document.addEventListener('change', function (e) {
  if (!e.target.matches('[data-evidence-queue-filter]')) return;
  const table = e.target.closest('.card').querySelector('[data-evidence-queue]');
  if (!table) return;
  const pendingOnly = e.target.checked;
  table.querySelectorAll('tbody tr[data-status]').forEach(function (tr) {
    tr.style.display = (!pendingOnly || tr.dataset.status === 'Uploaded (Pending Review)') ? '' : 'none';
  });
});

document.addEventListener('change', function (e) {
  const form = e.target.closest('.portfolio-direct-form');
  if (!form) return;
  if (e.target.matches('input[type="file"]')) {
    handlePortfolioFileSelected(form, e.target.files && e.target.files[0]);
  } else if (e.target.matches('.portfolio-confirm-checkbox')) {
    updatePortfolioSubmitState(form);
  }
});

document.addEventListener('click', function (e) {
  const dz = e.target.closest('[data-dropzone]');
  if (dz && !e.target.matches('input[type="file"]')) {
    dz.querySelector('input[type="file"]').click();
  }
  const previewBtn = e.target.closest('[data-action="preview-portfolio"]');
  if (previewBtn) {
    openPortfolioPreview(previewBtn.dataset.scid, previewBtn.dataset.id);
  }
});

document.addEventListener('dragover', function (e) {
  const dz = e.target.closest('[data-dropzone]');
  if (dz) { e.preventDefault(); dz.classList.add('dragover'); }
});
document.addEventListener('dragleave', function (e) {
  const dz = e.target.closest('[data-dropzone]');
  if (dz) dz.classList.remove('dragover');
});
document.addEventListener('drop', function (e) {
  const dz = e.target.closest('[data-dropzone]');
  if (!dz) return;
  e.preventDefault();
  dz.classList.remove('dragover');
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  const input = dz.querySelector('input[type="file"]');
  input.files = files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

/* Event delegation on the whole document for every .portfolio-direct-form's
   submit — one listener instead of one per row (per the spec). */
document.addEventListener('submit', async function (e) {
  const form = e.target.closest('.portfolio-direct-form');
  if (!form) return;
  e.preventDefault();

  const fileInput = form.querySelector('input[type="file"]');
  const file = fileInput.files && fileInput.files[0];
  const err = file ? validatePortfolioFile(file) : 'Choose a PDF file first.';
  if (err) { showPortfolioError(form, err); return; }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading…';
  showPortfolioError(form, null);

  try {
    // FormData carries the file + person/scorecard context, matching what a
    // real multipart POST to Api.uploadPersonPortfolio's remote branch sends.
    const formData = new FormData(form);
    await Api.uploadPersonPortfolio(form.dataset.scid, form.dataset.personId, formData.get('file'));
    render();
  } catch (err2) {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    showPortfolioError(form, err2.message || 'Upload failed — please try again.');
  }
});

document.addEventListener('submit', function (e) {
  const form = e.target.closest('[data-action-form="add-account"]');
  if (!form) return;
  e.preventDefault();
  const name = form.querySelector('[name="name"]').value.trim();
  if (!name) return;
  addAccount(name);
});

/* --------------------------------- Preview modal --------------------------------- */

async function openPortfolioPreview(scId, personId) {
  const blob = await Api.getPersonPortfolioBlob(scId, personId);
  if (!blob) { alert('No file stored for this person yet.'); return; }
  const sc = getScorecard(scId);
  const person = sc && sc.people.find(function (p) { return p.id === personId; });
  const url = URL.createObjectURL(blob);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML =
    '<div class="modal">' +
      '<div class="modal-header"><h3>' + esc(person ? person.name : 'Portfolio') + ' — Portfolio of Evidence</h3><button type="button" class="modal-close" aria-label="Close">&times;</button></div>' +
      '<div class="modal-body"><iframe src="' + url + '" title="Portfolio PDF preview"></iframe></div>' +
    '</div>';
  document.body.appendChild(backdrop);
  function close() { backdrop.remove(); URL.revokeObjectURL(url); }
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  document.addEventListener('keydown', function esc1(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc1); } });
}
