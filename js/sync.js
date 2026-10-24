// ═══════════ Appli Finance — synchronisation cloud (FIN.sync) ═══════════
// Propriétaire : Agent Synchro. Voir CONTRAT.md (« Extension v1.2 »).
// Accès direct à l'API REST de Supabase par fetch, sans aucune librairie.
// Les jetons et le mot de passe ne sont jamais écrits dans la console.
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};

  // ─── Constantes ───
  const PUSH_CHUNK = 500;              // enregistrements envoyés par requête
  const PULL_LIMIT = 1000;             // lignes lues par requête
  const CURSOR_BACK_MS = 5000;         // recul du curseur : rien n'est raté, la fusion est idempotente
  const REFRESH_MARGIN_MS = 60000;     // on renouvelle le jeton une minute avant son expiration
  const DEBOUNCE_MS = 2000;            // délai après une modification locale
  const POLL_MS = 60000;               // synchro périodique quand la page est visible
  const TIMEOUT_MS = 30000;            // délai maximal d'une requête
  const MIN_PASSWORD = 6;

  const MSG_NETWORK = "Pas de connexion internet";
  const MSG_EXPIRED = "Session expirée — reconnectez-vous";
  const MSG_NOT_CONFIGURED = "La synchro n'est pas configurée (voir GUIDE-SYNCHRO.md)";

  // ─── Configuration ───
  function config(){
    const c = window.FIN_CONFIG || {};
    const url = typeof c.supabaseUrl === "string" ? c.supabaseUrl.trim().replace(/\/+$/, "") : "";
    const key = typeof c.supabaseAnonKey === "string" ? c.supabaseAnonKey.trim() : "";
    return { url, key };
  }
  function isConfigured(){
    const c = config();
    return !!(c.url && c.key);
  }
  const store = () => FIN.store;

  // ─── Erreurs ───
  function makeError(message, kind, status){
    const e = new Error(message);
    e.kind = kind || "error";          // "network" | "signedout" | "error"
    if (status) e.status = status;
    return e;
  }
  const networkError = () => makeError(MSG_NETWORK, "network");

  // Traduit une réponse d'erreur de Supabase en message français compréhensible.
  function apiMessage(res){
    const b = res.json && typeof res.json === "object" ? res.json : {};
    const code = String(b.error_code || b.code || "").toLowerCase();
    const text = [b.msg, b.message, b.error_description, b.error, b.hint, res.json ? "" : res.text].join(" ").toLowerCase();
    const has = (...parts) => parts.some(p => text.indexOf(p) >= 0 || code === p);
    if (has("invalid_credentials", "invalid login credentials")) return "Email ou mot de passe incorrect";
    if (has("email_not_confirmed", "email not confirmed")) return "Email pas encore confirmé — cliquez sur le lien reçu par email";
    if (has("user_already_exists", "user already registered", "already been registered")) return "Un compte existe déjà avec cet email — utilisez « Se connecter »";
    if (has("weak_password", "password should be at least", "password is too short")) return "Mot de passe trop court (" + MIN_PASSWORD + " caractères minimum)";
    if (has("email_address_invalid", "unable to validate email", "invalid email")) return "Adresse email invalide";
    if (has("signup_disabled", "signups not allowed")) return "La création de compte est désactivée sur ce serveur";
    if (has("invalid api key", "no api key")) return "Clé Supabase invalide — vérifiez js/config.js";
    if (res.status === 429 || has("over_request_rate_limit", "over_email_send_rate_limit")) return "Trop de tentatives — patientez quelques minutes puis réessayez";
    if (has("pgrst205", "42p01", "does not exist")) return "La table de synchronisation est introuvable — le script supabase/schema.sql a-t-il été exécuté ?";
    if (res.status === 401 || res.status === 403) return "Accès refusé par le serveur (erreur " + res.status + ")";
    if (res.status >= 500) return "Le serveur de synchronisation ne répond pas correctement (erreur " + res.status + ") — réessayez plus tard";
    return "Erreur de synchronisation (code " + res.status + ")";
  }
  const apiError = res => makeError(apiMessage(res), "error", res.status);

  // ─── Requêtes HTTP ───
  async function http(method, path, opts){
    const o = opts || {};
    const cfg = config();
    const headers = { apikey: cfg.key, Authorization: "Bearer " + (o.token || cfg.key), Accept: "application/json" };
    let body;
    if (o.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(o.body); }
    if (o.headers) Object.assign(headers, o.headers);
    let ctrl = null, timer = null;
    if (typeof AbortController === "function") {
      ctrl = new AbortController();
      timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    }
    let res, text = "";
    try {
      res = await fetch(cfg.url + path, { method, headers, body, signal: ctrl ? ctrl.signal : undefined });
      text = await res.text();
    } catch (e) {
      throw networkError();
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch (e) { /* réponse non JSON */ } }
    return { ok: res.ok, status: res.status, json, text };
  }

  // ─── État ───
  const cur = { state: null, error: null };
  let running = null;      // promesse de la synchro en cours (verrou)
  let again = false;       // une demande est arrivée pendant la synchro
  let refreshing = null;   // renouvellement de jeton en cours (un seul à la fois)
  let wired = false;
  let debounceTimer = null;

  function syncState(){
    try { return store().getSyncState(); }
    catch (e) { return { cursor: null, session: null, email: null, lastSyncAt: null }; }
  }
  const session = () => syncState().session;

  // L'état affiché est toujours cohérent avec la session réellement stockée.
  function status(){
    const s = syncState();
    let state;
    if (!isConfigured()) state = "off";
    else if (!s.session) state = "signedout";
    else state = cur.state && cur.state !== "off" && cur.state !== "signedout" ? cur.state : "idle";
    return {
      state,
      email: s.email || null,
      lastSyncAt: s.lastSyncAt || null,
      error: state !== "off" && state !== "idle" && state !== "syncing" && cur.error && cur.state === state ? cur.error : null
    };
  }
  function setState(state, error){
    const before = JSON.stringify(status());
    cur.state = state;
    cur.error = error || null;
    const after = status();
    if (JSON.stringify(after) !== before) FIN.bus.emit("sync:status", after);
  }

  // ─── Session ───
  // Enregistre la réponse d'authentification (jetons) dans l'état de synchro local.
  function saveSession(body, email){
    const exp = typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000
      : typeof body.expires_at === "number" ? body.expires_at * 1000
      : Date.now() + 3600000;
    const patch = { session: { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: exp } };
    const mail = (body.user && body.user.email) || email;
    if (mail) patch.email = mail;
    store().setSyncState(patch);
  }
  function clearSession(){
    store().setSyncState({ session: null });
  }

  // Renouvelle le jeton (un seul renouvellement à la fois : les jetons de rafraîchissement sont à usage unique).
  function refreshSession(){
    if (refreshing) return refreshing;
    const s = session();
    if (!s || !s.refresh_token) return Promise.reject(makeError(MSG_EXPIRED, "signedout"));
    refreshing = (async () => {
      const r = await http("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh_token } });
      if (r.ok && r.json && r.json.access_token) { saveSession(r.json); return; }
      if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        // Jeton refusé : on déconnecte, les données locales sont conservées.
        clearSession();
        setState("signedout", MSG_EXPIRED);
        throw makeError(MSG_EXPIRED, "signedout", r.status);
      }
      throw apiError(r);
    })();
    const done = () => { refreshing = null; };
    refreshing.then(done, done);
    return refreshing;
  }

  async function freshToken(){
    const s = session();
    if (!s) throw makeError(MSG_EXPIRED, "signedout");
    if (!s.expires_at || s.expires_at - Date.now() < REFRESH_MARGIN_MS) await refreshSession();
    const n = session();
    if (!n) throw makeError(MSG_EXPIRED, "signedout");
    return n.access_token;
  }

  // Requête authentifiée : sur 401, un seul retry après renouvellement du jeton.
  async function authed(method, path, opts){
    let token = await freshToken();
    let r = await http(method, path, Object.assign({}, opts, { token }));
    if (r.status === 401) {
      await refreshSession();
      const n = session();
      if (!n) throw makeError(MSG_EXPIRED, "signedout");
      r = await http(method, path, Object.assign({}, opts, { token: n.access_token }));
    }
    if (!r.ok) throw apiError(r);
    return r;
  }

  // ─── Compte ───
  function checkCredentials(email, password, creating){
    const mail = typeof email === "string" ? email.trim() : "";
    if (!mail || mail.indexOf("@") < 1) throw makeError("Adresse email invalide");
    if (typeof password !== "string" || !password) throw makeError("Entrez votre mot de passe");
    if (creating && password.length < MIN_PASSWORD) throw makeError("Mot de passe trop court (" + MIN_PASSWORD + " caractères minimum)");
    return mail;
  }
  function needConfigured(){
    if (!isConfigured()) { setState("off"); throw makeError(MSG_NOT_CONFIGURED); }
  }
  // Un autre compte que le précédent : l'ancien curseur ne vaut plus rien.
  function adoptAccount(mail){
    const previous = syncState().email;
    if (!previous || previous.toLowerCase() !== mail.toLowerCase()) store().setSyncState({ cursor: null });
  }

  async function signUp(email, password){
    needConfigured();
    const mail = checkCredentials(email, password, true);
    const r = await http("POST", "/auth/v1/signup", { body: { email: mail, password } });
    if (!r.ok) throw apiError(r);
    if (!r.json || !r.json.access_token) return { needsConfirmation: true };   // confirmation par email activée
    adoptAccount(mail);
    saveSession(r.json, mail);
    setState("idle");
    syncNow();
    return { needsConfirmation: false };
  }

  async function signIn(email, password){
    needConfigured();
    const mail = checkCredentials(email, password, false);
    const r = await http("POST", "/auth/v1/token?grant_type=password", { body: { email: mail, password } });
    if (!r.ok) throw apiError(r);
    if (!r.json || !r.json.access_token) throw makeError("Réponse inattendue du serveur de connexion");
    adoptAccount(mail);
    saveSession(r.json, mail);
    setState("idle");
    syncNow();
  }

  async function signOut(){
    const s = session();
    if (s && isConfigured()) {
      try { await http("POST", "/auth/v1/logout", { token: s.access_token }); }
      catch (e) { /* hors ligne ou jeton périmé : on se déconnecte quand même localement */ }
    }
    store().setSyncState({ session: null, email: null, cursor: null });
    setState(isConfigured() ? "signedout" : "off");
  }

  // ─── Synchronisation ───
  async function push(){
    const records = store().syncRecords({ dirtyOnly: true });
    for (let i = 0; i < records.length; i += PUSH_CHUNK) {
      const chunk = records.slice(i, i + PUSH_CHUNK);
      // user_id n'est pas envoyé : la base le remplit avec auth.uid().
      await authed("POST", "/rest/v1/items?on_conflict=user_id,id", {
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: chunk.map(r => ({ id: r.id, type: r.type, data: r.data, deleted: r.deleted, updated_at: r.updated_at }))
      });
      store().markSynced(chunk);
    }
  }

  async function pull(){
    let pos = syncState().cursor;
    for (;;) {
      let path = "/rest/v1/items?select=*";
      if (pos) path += "&server_at=gt." + encodeURIComponent(pos);
      path += "&order=server_at.asc&limit=" + PULL_LIMIT;
      const r = await authed("GET", path);
      const rows = Array.isArray(r.json) ? r.json : [];
      if (rows.length) {
        store().applyRemote(rows.map(x => ({
          id: x.id, type: x.type, data: x.data, deleted: !!x.deleted, updated_at: Number(x.updated_at)
        })));
        const last = rows[rows.length - 1].server_at;
        const t = Date.parse(last);
        if (last && !isNaN(t)) {
          pos = last;   // pagination exacte (précision complète)
          store().setSyncState({ cursor: new Date(t - CURSOR_BACK_MS).toISOString() });
        } else {
          break;        // horodatage illisible : on évite de boucler indéfiniment
        }
      }
      if (rows.length < PULL_LIMIT) break;
    }
  }

  // Une passe complète. Renvoie true si elle s'est bien terminée.
  async function runOnce(){
    if (!isConfigured()) { setState("off"); return false; }
    if (!session()) { setState("signedout", cur.state === "signedout" ? cur.error : null); return false; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setState("offline"); return false; }
    setState("syncing");
    try {
      if (!syncState().cursor) store().markAllDirty();   // premier passage de cet appareil : tout renvoyer
      await push();
      await pull();
      store().setSyncState({ lastSyncAt: Date.now() });
      setState("idle");
      return true;
    } catch (e) {
      if (e && e.kind === "signedout") setState("signedout", e.message);
      else if (e && e.kind === "network") setState("offline");
      else setState("error", e && e.message ? e.message : "Erreur de synchronisation");
      return false;
    }
  }

  // Ne rejette jamais : le résultat se lit dans status().
  function syncNow(){
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        do {
          again = false;
          const ok = await runOnce();
          if (!ok) break;
        } while (again);
      } finally {
        running = null;
        again = false;
      }
    })();
    return running;
  }

  // ─── Déclencheurs ───
  function canSync(){ return isConfigured() && !!session(); }

  function onDataChange(p){
    if (p && p.reason === "sync") return;
    if (!canSync()) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; if (canSync()) syncNow(); }, DEBOUNCE_MS);
  }

  function wire(){
    if (wired) return;
    wired = true;
    FIN.bus.on("data:change", onDataChange);
    window.addEventListener("online", () => { if (canSync()) syncNow(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && canSync()) syncNow();
    });
    setInterval(() => {
      if (document.visibilityState === "visible" && canSync()) syncNow();
    }, POLL_MS);
  }

  function init(){
    wire();
    if (!isConfigured()) { setState("off"); return Promise.resolve(); }
    if (!session()) { setState("signedout"); return Promise.resolve(); }
    setState("idle");
    syncNow();                // en arrière-plan : ne bloque pas le démarrage de l'appli
    return Promise.resolve();
  }

  FIN.sync = { init, isConfigured, status, signUp, signIn, signOut, syncNow };
})();
