// ═══════════ Appli Finance — Compte & synchro (indicateur + modale) ═══════════
// Propriétaire : Agent Interface. Voir CONTRAT.md (Extension v1.2).
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const esc = (FIN.util && FIN.util.esc) || (s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const $ = id => document.getElementById(id);

  let inited = false;
  let prevFocus = null;
  let mode = "";            // "notconf" | "auth" | "connected" : structure actuellement dessinée
  let tab = "signin";       // onglet actif en mode déconnecté
  let busy = false;         // requête en cours (connexion / synchro)
  let formError = "";
  let formInfo = "";

  // ─── Utilitaires ───
  function toast(text){ if (FIN.bus) FIN.bus.emit("toast", { text }); }
  function sync(){ return FIN.sync || null; }
  function configured(){
    const s = sync();
    try { return !!(s && s.isConfigured && s.isConfigured()); } catch (e) { return false; }
  }
  function status(){
    const s = sync();
    try { if (s && s.status) return s.status() || { state: "off" }; } catch (e) { /* ignore */ }
    return { state: "off" };
  }
  function relTime(ts){
    if (!ts) return "jamais";
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return "à l'instant";
    const m = Math.round(s / 60);
    if (m < 60) return "il y a " + m + " min";
    const h = Math.round(m / 60);
    if (h < 24) return "il y a " + h + " h";
    const d = Math.round(h / 24);
    return "il y a " + d + (d > 1 ? " jours" : " jour");
  }
  function modalEl(){ return $("modal-account"); }
  function modalOpen(){ const el = modalEl(); return !!(el && !el.hidden); }
  function errText(e){
    const m = e && e.message ? String(e.message) : "";
    return m || "Une erreur est survenue. Réessayez dans un instant.";
  }

  // ─── Indicateur #sync-status ───
  const CLOUD = '<svg class="sy-cloud" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  function stateLabel(st){
    switch (st.state) {
      case "signedout": return "Non connecté";
      case "syncing":   return "Synchronisation…";
      case "idle":      return "Synchronisé " + relTime(st.lastSyncAt);
      case "offline":   return "Hors ligne";
      case "error":     return "Erreur de synchronisation" + (st.error ? " : " + st.error : "");
      default:          return "";
    }
  }

  function renderIndicator(){
    const el = $("sync-status");
    if (!el) return;
    const st = status();
    if (st.state === "off") { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    let btn = el.querySelector(".sy-ind");
    if (!btn) {
      el.innerHTML = '<button type="button" class="sy-ind">' + CLOUD + '<span class="sy-dot" aria-hidden="true"></span><span class="sy-ind-t"></span></button>';
      btn = el.querySelector(".sy-ind");
    }
    const label = stateLabel(st);
    btn.className = "sy-ind sy-s-" + st.state;
    btn.title = label;
    btn.setAttribute("aria-label", label + " — ouvrir le compte et la synchro");
    btn.querySelector(".sy-ind-t").textContent = st.state === "signedout" ? "Non connecté" : "";
  }

  // ─── Modale : structure ───
  function shell(inner){
    return '<div class="modal-box sy-modal" role="dialog" aria-modal="true" aria-label="Compte et synchro">' +
      '<div class="sy-mh"><span class="sy-lbl">Compte &amp; synchro</span>' +
      '<button type="button" class="btn btn-icon sy-x" data-act="close" aria-label="Fermer">✕</button></div>' +
      '<div class="sy-body">' + inner + '</div>' +
      '<div class="sy-foot"><span class="sy-ver num">Version ' + esc(window.FIN_VERSION || "?") + '</span>' +
      '<button type="button" class="btn sy-upd" data-act="check-update">Rechercher une mise à jour</button></div>' +
      '</div>';
  }

  function notConfiguredHTML(){
    return '<p class="sy-p">La synchro entre votre téléphone et votre PC n\'est pas encore configurée.</p>' +
      '<p class="sy-p sy-dim">Suivez le fichier <b>GUIDE-SYNCHRO.md</b> fourni avec l\'appli : en quelques minutes, vous créez un compte gratuit ' +
      'et vos dépenses se retrouvent sur tous vos appareils. En attendant, l\'appli fonctionne normalement, avec les données stockées sur cet appareil.</p>';
  }

  function authHTML(){
    const su = tab === "signup";
    return '<div class="sy-tabs" role="tablist">' +
      '<button type="button" role="tab" class="sy-tab' + (!su ? ' is-on' : '') + '" data-act="tab" data-tab="signin" aria-selected="' + (!su) + '">Se connecter</button>' +
      '<button type="button" role="tab" class="sy-tab' + (su ? ' is-on' : '') + '" data-act="tab" data-tab="signup" aria-selected="' + su + '">Créer un compte</button></div>' +
      '<form class="sy-form" novalidate>' +
        '<div class="field"><label for="sy-email">Email</label>' +
          '<input id="sy-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></div>' +
        '<div class="field"><label for="sy-pass">Mot de passe</label>' +
          '<div class="sy-pw"><input id="sy-pass" name="password" type="password" autocomplete="' + (su ? 'new-password' : 'current-password') + '" required>' +
          '<button type="button" class="btn btn-icon sy-eye" data-act="eye" aria-label="Afficher le mot de passe" aria-pressed="false">👁</button></div></div>' +
        (su ? '<div class="field"><label for="sy-pass2">Confirmer le mot de passe</label>' +
          '<input id="sy-pass2" name="password2" type="password" autocomplete="new-password" required></div>' : '') +
        '<div class="sy-msg sy-err" role="alert"></div>' +
        '<div class="sy-msg sy-info" role="status"></div>' +
        '<button type="submit" class="btn btn-primary sy-submit">' + (su ? 'Créer mon compte' : 'Se connecter') + '</button>' +
        '<p class="sy-p sy-dim sy-small">Vos données restent sur cet appareil ; la synchro sert à les retrouver ailleurs.</p>' +
      '</form>';
  }

  function connectedHTML(){
    return '<div class="sy-row"><span class="sy-k">Compte</span><span class="sy-v sy-email"></span></div>' +
      '<div class="sy-row"><span class="sy-k">État</span><span class="sy-v sy-state"></span></div>' +
      '<div class="sy-row"><span class="sy-k">Dernière synchro</span><span class="sy-v sy-last num"></span></div>' +
      '<div class="sy-msg sy-err" role="alert"></div>' +
      '<div class="sy-actions">' +
        '<button type="button" class="btn btn-primary sy-now" data-act="sync-now">Synchroniser maintenant</button>' +
        '<button type="button" class="btn btn-danger sy-out" data-act="sign-out">Se déconnecter</button></div>';
  }

  function currentMode(){
    if (!configured()) return "notconf";
    return status().state === "signedout" ? "auth" : "connected";
  }

  // ─── Modale : rendu / mise à jour ───
  function renderModal(force){
    const el = modalEl();
    if (!el || el.hidden) return;
    const m = currentMode();
    if (force || m !== mode) {
      mode = m;
      const body = m === "notconf" ? notConfiguredHTML() : m === "auth" ? authHTML() : connectedHTML();
      el.innerHTML = shell(body);
      if (m === "auth") {
        const f = el.querySelector("#sy-email");
        if (f && !matchMedia("(pointer:coarse)").matches) f.focus();
      }
    }
    updateDynamic();
  }

  function updateDynamic(){
    const el = modalEl();
    if (!el) return;
    const st = status();
    if (mode === "connected") {
      const set = (sel, txt) => { const n = el.querySelector(sel); if (n) n.textContent = txt; };
      set(".sy-email", st.email || "—");
      set(".sy-state", st.state === "idle" ? "Synchronisé" : stateLabel(st).replace(/ :.*$/, "") || "—");
      set(".sy-last", st.lastSyncAt ? relTime(st.lastSyncAt) : "jamais");
      const err = el.querySelector(".sy-err");
      if (err) err.textContent = st.state === "error" && st.error ? st.error : "";
      const now = el.querySelector(".sy-now");
      if (now) {
        const syncing = busy || st.state === "syncing";
        now.disabled = syncing;
        now.textContent = syncing ? "Synchronisation…" : "Synchroniser maintenant";
      }
    } else if (mode === "auth") {
      const submit = el.querySelector(".sy-submit");
      if (submit) {
        submit.disabled = busy;
        submit.textContent = busy ? "Connexion…" : (tab === "signup" ? "Créer mon compte" : "Se connecter");
      }
      const e = el.querySelector(".sy-err"), i = el.querySelector(".sy-info");
      if (e) e.textContent = formError;
      if (i) i.textContent = formInfo;
    }
  }

  // ─── Ouverture / fermeture ───
  function open(){
    const el = modalEl();
    if (!el) return;
    if (el.hidden) prevFocus = document.activeElement;
    formError = ""; formInfo = ""; busy = false; mode = "";
    el.hidden = false;
    renderModal(true);
  }
  function close(){
    const el = modalEl();
    if (!el || el.hidden) return;
    el.hidden = true;
    el.innerHTML = "";
    mode = "";
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* ignore */ }
    prevFocus = null;
  }

  // ─── Actions ───
  async function submitForm(form){
    if (busy) return;
    const email = form.elements.email.value.trim();
    const pass = form.elements.password.value;
    formError = ""; formInfo = "";
    if (!/^\S+@\S+\.\S+$/.test(email)) { formError = "Saisissez une adresse email valide."; return updateDynamic(); }
    if (!pass) { formError = "Saisissez votre mot de passe."; return updateDynamic(); }
    const signup = tab === "signup";
    if (signup) {
      if (pass.length < 6) { formError = "Le mot de passe doit contenir au moins 6 caractères."; return updateDynamic(); }
      if (pass !== form.elements.password2.value) { formError = "Les deux mots de passe ne sont pas identiques."; return updateDynamic(); }
    }
    busy = true; updateDynamic();
    try {
      if (signup) {
        const r = await sync().signUp(email, pass);
        if (r && r.needsConfirmation) {
          formInfo = "Un email de confirmation vous a été envoyé. Cliquez sur le lien puis revenez vous connecter ici.";
          tab = "signin";
          busy = false;
          renderModal(true);
          const em = modalEl().querySelector("#sy-email");
          if (em) em.value = email;
          return;
        }
      } else {
        await sync().signIn(email, pass);
      }
      busy = false;
      toast("Compte connecté, synchronisation en cours");
      renderModal(true);
    } catch (e) {
      busy = false;
      formError = errText(e);
      updateDynamic();
    }
    // Ne jamais conserver le mot de passe en mémoire de la page
    try { form.elements.password.value = ""; if (form.elements.password2) form.elements.password2.value = ""; } catch (e) { /* ignore */ }
  }

  async function syncNow(){
    if (busy) return;
    busy = true; updateDynamic();
    try { await sync().syncNow(); } catch (e) { toast(errText(e)); }
    busy = false;
    updateDynamic();
  }

  async function signOut(){
    if (!window.confirm("Se déconnecter ? Vos données restent sur cet appareil.")) return;
    try { await sync().signOut(); toast("Déconnecté"); } catch (e) { toast(errText(e)); }
    formError = ""; formInfo = ""; tab = "signin";
    renderModal(true);
  }

  function toggleEye(btn){
    const el = modalEl();
    const inputs = el.querySelectorAll("#sy-pass, #sy-pass2");
    const show = btn.getAttribute("aria-pressed") !== "true";
    inputs.forEach(i => { i.type = show ? "text" : "password"; });
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
    btn.style.opacity = show ? "1" : "";
  }

  function bindModal(){
    const el = modalEl();
    if (!el) return;
    el.addEventListener("mousedown", e => { el._downOnBg = (e.target === el); });
    el.addEventListener("click", e => {
      if (e.target === el && el._downOnBg) return close();
      const b = e.target.closest("[data-act]");
      if (!b || !el.contains(b)) return;
      const act = b.dataset.act;
      if (act === "close") close();
      else if (act === "tab") {
        if (busy) return;
        tab = b.dataset.tab; formError = ""; formInfo = "";
        renderModal(true);
      }
      else if (act === "eye") toggleEye(b);
      else if (act === "sync-now") syncNow();
      else if (act === "sign-out") signOut();
      else if (act === "check-update") {
        if (FIN.update && FIN.update.check) FIN.update.check();
        else toast("Mises à jour non disponibles");
      }
    });
    el.addEventListener("submit", e => {
      e.preventDefault();
      const f = e.target.closest(".sy-form");
      if (f) submitForm(f);
    });
  }

  // ─── API publique ───
  function init(){
    if (inited) return;
    inited = true;
    const ind = $("sync-status");
    if (ind) ind.addEventListener("click", e => { if (e.target.closest(".sy-ind")) FIN.bus.emit("account:open"); });
    bindModal();
    FIN.bus.on("account:open", open);
    FIN.bus.on("sync:status", () => { renderIndicator(); if (modalOpen()) renderModal(false); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modalOpen()) { e.preventDefault(); close(); }
    });
    setInterval(() => { renderIndicator(); if (modalOpen()) updateDynamic(); }, 30000);
    renderIndicator();
  }

  FIN.account = { init };
})();
