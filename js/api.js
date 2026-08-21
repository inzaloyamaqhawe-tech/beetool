/* ==========================================================================
   Centenary Networks — B-BBEE Scorecard Tool
   api.js — the ONE place the rest of the app talks to for reading/writing data.

   WHY THIS FILE EXISTS
   ---------------------
   There is no backend yet. Today every `Api.*` function below reads and
   writes `STATE` (js/data.js), which is persisted to the browser's
   localStorage. Every function is still `async` and returns data in the
   exact shape a real REST endpoint should return, so that when the backend
   is ready, swapping the *inside* of each function for a `fetch()` call is
   a small, mechanical change — nothing that calls `Api.*` (app.js) should
   need to change at all.

   A Scorecard already carries everything captured on its tabs as nested
   data — the workforce roster ("Add Person" under Management Control),
   ownership's shareholder register, ESD's supplier register, and SED's
   beneficiary list are all plain arrays on the Scorecard object (see
   blankScorecard() in js/data.js). They are saved and loaded as part of
   Api.saveScorecard()/getScorecard() — there is no separate endpoint for
   "add a person" the way there is for a whole Scorecard.

   See BACKEND.md at the project root for the full REST contract in one
   place (endpoints, request/response JSON shapes, auth, error format).
   The doc comment on each function below is the authoritative shape for
   that one resource — BACKEND.md is generated to match these.

   HOW TO ACTIVATE A REAL BACKEND
   -------------------------------
   1. Set API_BASE_URL below to the deployed API's base URL.
   2. Flip USE_REMOTE_API to true.
   3. Implement the endpoints documented on each function (matching method,
      path, request body and response body).
   4. Each function already has a working `fetch()` implementation behind
      the `if (USE_REMOTE_API)` branch — test one resource at a time by
      leaving USE_REMOTE_API false and calling the *Remote variant directly
      if you want to verify a single endpoint before cutting over everything.
   5. Authentication: wire a real login flow and store the returned token via
      `Api.setAuthToken(token)` — every remote call already attaches it as
      `Authorization: Bearer <token>` (see `authHeaders()`).
   ========================================================================== */

const USE_REMOTE_API = false; // flip to true once the backend is deployed
const API_BASE_URL = '';      // e.g. 'https://api.centenarynetworks.com'
const AUTH_TOKEN_KEY = 'centenaryBee.authToken';

function getAuthToken() { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }
function setAuthToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}
function authHeaders() {
  const t = getAuthToken();
  return Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {});
}

/**
 * Thin fetch wrapper every remote Api.* call goes through, so retry/error
 * handling only has to be written once. Expects the backend to return JSON,
 * and on failure a JSON body of the shape { error: { message, code } }
 * (see BACKEND.md "Error format").
 */
async function apiFetch(path, options) {
  const res = await fetch(API_BASE_URL + path, Object.assign({ headers: authHeaders() }, options || {}));
  if (!res.ok) {
    let message = res.statusText;
    try { const body = await res.json(); message = (body && body.error && body.error.message) || message; } catch (e) { /* no JSON body */ }
    throw new Error('API ' + res.status + ': ' + message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* Keeps STATE.meta.lastSavedAt current on every local write, so a "last
   saved" timestamp (see the save bar on every scorecard screen) is accurate
   even before a backend exists. */
function touchSaved() {
  STATE.meta = STATE.meta || { lastSavedAt: null };
  STATE.meta.lastSavedAt = new Date().toISOString();
  persist();
}

const Api = {

  /* ------------------------------- Scorecards ------------------------------- */

  /**
   * GET /api/scorecards
   * Response: 200 OK, Scorecard[] — full objects, same shape as blankScorecard()
   * in js/data.js (that function is the authoritative schema).
   */
  async listScorecards() {
    if (USE_REMOTE_API) return apiFetch('/api/scorecards');
    return STATE.scorecards;
  },

  /**
   * GET /api/scorecards/:id
   * Response: 200 OK, Scorecard | 404 Not Found
   */
  async getScorecard(id) {
    if (USE_REMOTE_API) return apiFetch('/api/scorecards/' + encodeURIComponent(id));
    return getScorecard(id) || null;
  },

  /**
   * POST /api/scorecards
   * Request body: Partial<Scorecard> — typically just { size, description }.
   * The server should fill in every other field with the same defaults as
   * blankScorecard() in js/data.js.
   * Response: 201 Created, Scorecard (with server-assigned id)
   */
  async createScorecard(overrides) {
    if (USE_REMOTE_API) return apiFetch('/api/scorecards', { method: 'POST', body: JSON.stringify(overrides || {}) });
    const sc = blankScorecard(overrides);
    STATE.scorecards.push(sc);
    touchSaved();
    return sc;
  },

  /**
   * PUT /api/scorecards/:id
   * Request body: full Scorecard object (this is what the "Save" button on
   * every scorecard screen sends — including its people/shareholders/
   * suppliers/beneficiaries arrays, since those are nested on the object).
   * Response: 200 OK, Scorecard (the saved version — the server may bump an
   * updatedAt/version field, which the client should adopt).
   * This is also how archiving works: send the full object with
   * `archived: true`, there is no separate archive endpoint.
   */
  async saveScorecard(sc) {
    if (!sc) return null;
    if (USE_REMOTE_API) return apiFetch('/api/scorecards/' + encodeURIComponent(sc.id), { method: 'PUT', body: JSON.stringify(sc) });
    const idx = STATE.scorecards.findIndex(function (s) { return s.id === sc.id; });
    if (idx > -1) STATE.scorecards[idx] = sc; else STATE.scorecards.push(sc);
    touchSaved();
    return sc;
  },

  /**
   * DELETE /api/scorecards/:id
   * Response: 204 No Content
   */
  async deleteScorecard(id) {
    if (USE_REMOTE_API) return apiFetch('/api/scorecards/' + encodeURIComponent(id), { method: 'DELETE' });
    STATE.scorecards = STATE.scorecards.filter(function (s) { return s.id !== id; });
    if (STATE.activeScorecardId === id) STATE.activeScorecardId = STATE.scorecards.length ? STATE.scorecards[0].id : null;
    touchSaved();
    return null;
  },

  /* ------------------------------ Implementation tasks -------------------------- */

  /**
   * GET /api/tasks — Response: Task[]
   * Task shape: { id, title, element, owner, due, status, notes }
   */
  async listTasks() {
    if (USE_REMOTE_API) return apiFetch('/api/tasks');
    return STATE.implementation;
  },
  /** POST /api/tasks — Request: Partial<Task> — Response: 201 Created, Task */
  async createTask(partial) {
    const task = Object.assign({ id: uid('task'), title: 'New action item', element: 'ownership', owner: '', due: '', status: 'Not Started', notes: '' }, partial || {});
    if (USE_REMOTE_API) return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(task) });
    STATE.implementation.push(task);
    touchSaved();
    return task;
  },
  /** PUT /api/tasks/:id — Request: full Task — Response: 200 OK, Task */
  async updateTask(task) {
    if (USE_REMOTE_API) return apiFetch('/api/tasks/' + encodeURIComponent(task.id), { method: 'PUT', body: JSON.stringify(task) });
    const idx = STATE.implementation.findIndex(function (t) { return t.id === task.id; });
    if (idx > -1) STATE.implementation[idx] = task;
    touchSaved();
    return task;
  },
  /** DELETE /api/tasks/:id — Response: 204 No Content */
  async deleteTask(id) {
    if (USE_REMOTE_API) return apiFetch('/api/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
    STATE.implementation = STATE.implementation.filter(function (t) { return t.id !== id; });
    touchSaved();
    return null;
  },

  /* ----------------------------------- Scenarios --------------------------------- */

  /** GET /api/scenarios — Response: Scenario[] (saved what-if snapshots) */
  async listScenarios() {
    if (USE_REMOTE_API) return apiFetch('/api/scenarios');
    return STATE.scenarios;
  },
  /** POST /api/scenarios — Request: Scenario (client-generated id is fine) — Response: 201 Created, Scenario */
  async saveScenario(scenario) {
    if (USE_REMOTE_API) return apiFetch('/api/scenarios', { method: 'POST', body: JSON.stringify(scenario) });
    STATE.scenarios.push(scenario);
    touchSaved();
    return scenario;
  },
  /** DELETE /api/scenarios/:id — Response: 204 No Content */
  async deleteScenario(id) {
    if (USE_REMOTE_API) return apiFetch('/api/scenarios/' + encodeURIComponent(id), { method: 'DELETE' });
    STATE.scenarios = STATE.scenarios.filter(function (s) { return s.id !== id; });
    touchSaved();
    return null;
  },

  /* ------------------------------ Portfolio of Evidence -------------------------- */

  /**
   * POST /api/scorecards/:scorecardId/people/:personId/portfolio
   * multipart/form-data, field "file" (application/pdf)
   * Response: 201 Created, { status: 'Uploaded (Pending Review)', fileUrl, uploadedAt }
   * See BACKEND.md "Portfolio of Evidence uploads" for the full table + endpoint set.
   *
   * Local implementation: stores the blob in IndexedDB (js/portfolio-store.js —
   * localStorage can't hold binary files) and updates the person's portfolio*
   * fields directly on the scorecard object, then saves the scorecard exactly
   * like the explicit Save button does.
   */
  async uploadPersonPortfolio(scorecardId, personId, file) {
    const sc = getScorecard(scorecardId);
    const person = sc && sc.people.find(function (p) { return p.id === personId; });
    if (!sc || !person) throw new Error('Person not found on this scorecard.');

    if (USE_REMOTE_API) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(API_BASE_URL + '/api/scorecards/' + encodeURIComponent(scorecardId) + '/people/' + encodeURIComponent(personId) + '/portfolio', {
        method: 'POST', headers: { Authorization: authHeaders().Authorization }, body: form
      });
      if (!res.ok) throw new Error('Upload failed: ' + res.status);
      const body = await res.json();
      person.portfolioStatus = body.status; person.portfolioFileName = file.name; person.portfolioFileSize = file.size; person.portfolioUploadedAt = body.uploadedAt;
      touchSaved();
      return body;
    }

    await pstoreSaveBlob(portfolioKey(scorecardId, personId), file);
    person.portfolioStatus = 'Uploaded (Pending Review)';
    person.portfolioFileName = file.name;
    person.portfolioFileSize = file.size;
    person.portfolioUploadedAt = new Date().toISOString();
    person.portfolioRejectionNote = '';
    touchSaved();
    return { status: person.portfolioStatus, fileUrl: null, uploadedAt: person.portfolioUploadedAt };
  },

  /**
   * PATCH /api/scorecards/:scorecardId/people/:personId/portfolio
   * Request: { status: 'Approved'|'Rejected', rejectionNote? }
   * Response: 200 OK, updated portfolio fields.
   * Reviewer-side action — no reviewer UI exists in this tool yet, this is a
   * manual stand-in so every state can be demoed locally. See BACKEND.md.
   */
  async setPortfolioReviewState(scorecardId, personId, status, note) {
    const sc = getScorecard(scorecardId);
    const person = sc && sc.people.find(function (p) { return p.id === personId; });
    if (!sc || !person) throw new Error('Person not found on this scorecard.');
    if (USE_REMOTE_API) {
      return apiFetch('/api/scorecards/' + encodeURIComponent(scorecardId) + '/people/' + encodeURIComponent(personId) + '/portfolio', {
        method: 'PATCH', body: JSON.stringify({ status: status, rejectionNote: note || '' })
      });
    }
    person.portfolioStatus = status;
    person.portfolioRejectionNote = status === 'Rejected' ? (note || '') : '';
    touchSaved();
    return { status: person.portfolioStatus, rejectionNote: person.portfolioRejectionNote };
  },

  /** Local-only helper (not a REST call): fetches the previously-attached
   * blob back out of IndexedDB for the preview modal. */
  async getPersonPortfolioBlob(scorecardId, personId) {
    return pstoreGetBlob(portfolioKey(scorecardId, personId));
  },

  setAuthToken: setAuthToken
};
