// ═══════════ Appli Finance — coque : navigation, outils, raccourcis, boot ═══════════
// Propriétaire : Agent 4. Voir CONTRAT.md.
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const U = FIN.util;
  const $ = id => document.getElementById(id);

  // ─── Environnement ───
  const isElectron = typeof process !== "undefined" && !!(process.versions && process.versions.electron);
  let ipc = null;
  if (isElectron) { try { ipc = require("electron").ipcRenderer; } catch (e) { ipc = null; } }
  const mqMobile = window.matchMedia("(max-width: 899px)");

  const VIEWS = ["day", "week", "month"];
  const VIEW_LABEL = { day: "Jour", week: "Semaine", month: "Mois" };
  const ZOOMS = [50, 67, 80, 90, 100, 110, 125, 150, 175, 200];

  // ─── État ───
  function midnight(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  const state = { view: "day", date: midnight(new Date()) };
  let zoom = 100;
  let booted = false;

  // ─── Bandeau d'erreur ───
  function showBanner(msg){
    const b = $("banner");
    if (!b) return;
    b.innerHTML = '<span class="sh-banner-t"></span><button type="button" class="sh-banner-x" aria-label="Fermer">×</button>';
    b.firstChild.textContent = msg;
    b.lastChild.onclick = () => { b.hidden = true; };
    b.hidden = false;
  }
  function guard(label, fn){
    try { return fn(); }
    catch (e) {
      console.error("[app] " + label, e);
      showBanner("Un problème est survenu (" + label + "). Rechargez l'application ; vos données sont conservées.");
    }
  }

  // ─── Réglages de l'interface persistés ───
  function saveUI(){
    try { FIN.store.setUI({ view: state.view, zoom }); } catch (e) { /* non bloquant */ }
  }
  function weekStart(){
    try { const s = FIN.store.getSettings(); return s && s.weekStart === 0 ? 0 : 1; } catch (e) { return 1; }
  }

  // ─── Rendu ───
  function periodLabel(){
    if (state.view === "week") return U.fmtWeekLabel(state.date, weekStart());
    if (state.view === "month") return U.fmtMonthLabel(state.date);
    return U.fmtDayLong(state.date);
  }
  function isCurrentPeriod(){
    const t = midnight(new Date());
    if (state.view === "day") return U.dayKey(t) === U.dayKey(state.date);
    if (state.view === "week") return U.dayKey(U.startOfWeek(t, weekStart())) === U.dayKey(U.startOfWeek(state.date, weekStart()));
    return t.getFullYear() === state.date.getFullYear() && t.getMonth() === state.date.getMonth();
  }
  function renderChrome(){
    const lbl = $("sh-period-label");
    if (lbl) lbl.textContent = periodLabel();
    const today = $("sh-today");
    if (today) today.disabled = isCurrentPeriod();
    document.querySelectorAll("#view-tabs button, #bottom-nav button").forEach(b => {
      const on = b.dataset.view === state.view;
      b.dataset.on = on ? "true" : "false";
      b.setAttribute("aria-selected", on ? "true" : "false");
      if (b.closest("#bottom-nav")) { if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
    });
    VIEWS.forEach(v => {
      const el = $("view-" + v);
      if (!el) return;
      const on = v === state.view;
      el.hidden = !on;
      el.classList.toggle("is-active", on);
    });
  }
  function render(){
    guard("affichage", renderChrome);
    const snap = { view: state.view, date: state.date };
    let settings = {};
    try { settings = FIN.store.getSettings(); } catch (e) { /* ignoré */ }
    guard("vues", () => FIN.views.render({ view: snap.view, date: snap.date, settings }));
    guard("saisie", () => FIN.entry.render(snap));
    if (FIN.income) guard("revenus", () => FIN.income.render(snap));
  }

  // ─── Navigation ───
  function go(view, date){
    if (VIEWS.indexOf(view) >= 0) state.view = view;
    if (date instanceof Date && !isNaN(date)) state.date = midnight(date);
    render();
    saveUI();
    FIN.bus.emit("nav:change", { view: state.view, date: state.date });
  }
  function shift(dir){
    const d = state.date;
    if (state.view === "day") return go(state.view, U.addDays(d, dir));
    if (state.view === "week") return go(state.view, U.addDays(d, 7 * dir));
    go(state.view, new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }
  function goToday(){ go(state.view, new Date()); }

  // ─── Construction de la barre de période et des onglets ───
  function buildNav(){
    const tabs = $("view-tabs");
    if (tabs) {
      tabs.innerHTML = VIEWS.map(v => '<button type="button" role="tab" data-view="' + v + '">' + VIEW_LABEL[v] + '</button>').join("");
      tabs.addEventListener("click", e => {
        const b = e.target.closest("button[data-view]");
        if (b) go(b.dataset.view);
      });
    }
    const pn = $("period-nav");
    if (pn) {
      pn.innerHTML =
        '<button type="button" class="sh-arrow" id="sh-prev" aria-label="Période précédente">‹</button>' +
        '<div class="sh-period-label" id="sh-period-label" aria-live="polite"></div>' +
        '<button type="button" class="sh-arrow" id="sh-next" aria-label="Période suivante">›</button>' +
        '<button type="button" class="sh-ghost" id="sh-today">Aujourd\'hui</button>';
      $("sh-prev").onclick = () => shift(-1);
      $("sh-next").onclick = () => shift(1);
      $("sh-today").onclick = goToday;
    }
    const bn = $("bottom-nav");
    if (bn) {
      const ICONS = {
        day: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
        week: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 5V3M16 5V3M7 14h10"/></svg>',
        month: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 5V3M16 5V3M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>'
      };
      bn.innerHTML = VIEWS.map(v => '<button type="button" data-view="' + v + '">' + ICONS[v] + '<span>' + VIEW_LABEL[v] + '</span></button>').join("");
      bn.addEventListener("click", e => {
        const b = e.target.closest("button[data-view]");
        if (b) go(b.dataset.view);
      });
    }
    const fab = $("fab-add");
    if (fab) fab.onclick = () => FIN.bus.emit("entry:open", { date: state.date });
  }

  // ─── Toast ───
  let toastTimer = null;
  function showToast(p){
    const t = $("toast");
    if (!t || !p) return;
    clearTimeout(toastTimer);
    t.innerHTML = '<span class="sh-toast-t"></span>';
    t.firstChild.textContent = p.text || "";
    if (typeof p.undo === "function") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sh-toast-undo"; b.textContent = "Annuler";
      b.onclick = () => {
        clearTimeout(toastTimer);
        t.hidden = true;
        try { p.undo(); } catch (e) { console.error("[toast] undo", e); showBanner("Impossible d'annuler cette action."); }
      };
      t.appendChild(b);
    }
    t.hidden = false;
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ─── Téléchargements ───
  function download(filename, text, mime){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function exportCSV(){
    guard("export CSV", () => {
      download("depenses-" + U.todayKey() + ".csv", FIN.store.exportCSV(), "text/csv;charset=utf-8");
      showToast({ text: "Export CSV prêt." });
    });
  }
  function exportJSON(){
    guard("sauvegarde", () => {
      download("donnees-finances-" + U.todayKey() + ".json", FIN.store.exportJSON(), "application/json");
      showToast({ text: "Sauvegarde créée." });
    });
  }

  // ─── Boîtes de dialogue (modales légères) ───
  let dlg = null;
  function closeDialog(){
    if (dlg) { dlg.remove(); dlg = null; }
  }
  function openDialog(innerHtml){
    closeDialog();
    dlg = document.createElement("div");
    dlg.className = "modal sh-dialog";
    dlg.innerHTML = '<div class="modal-box sh-box" role="dialog" aria-modal="true">' + innerHtml + '</div>';
    dlg.addEventListener("mousedown", e => { if (e.target === dlg) closeDialog(); });
    document.body.appendChild(dlg);
    return dlg;
  }

  function restore(file){
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showBanner("Impossible de lire ce fichier.");
    reader.onload = () => {
      const text = String(reader.result || "");
      const d = openDialog(
        '<div class="sh-box-h">Restaurer une sauvegarde</div>' +
        '<div class="sh-box-b"><p>Fichier : <b class="sh-fname"></b></p>' +
        '<p><b>Fusionner</b> ajoute ou met à jour les dépenses sans rien effacer. ' +
        '<b>Remplacer</b> efface toutes les données actuelles.</p></div>' +
        '<div class="sh-box-f"><button type="button" class="btn btn-ghost" data-a="cancel">Annuler</button>' +
        '<button type="button" class="btn btn-danger" data-a="replace">Remplacer</button>' +
        '<button type="button" class="btn btn-primary" data-a="merge">Fusionner</button></div>'
      );
      d.querySelector(".sh-fname").textContent = file.name;
      d.addEventListener("click", e => {
        const b = e.target.closest("button[data-a]");
        if (!b) return;
        const a = b.dataset.a;
        closeDialog();
        if (a === "cancel") return;
        try {
          const r = FIN.store.importJSON(text, { mode: a === "replace" ? "replace" : "merge" }) || {};
          showToast({ text: "Restauration terminée (" + (r.added || 0) + " ajoutée(s), " + (r.updated || 0) + " mise(s) à jour)." });
        } catch (err) {
          console.error("[app] import", err);
          showBanner("Ce fichier n'est pas une sauvegarde valide : " + (err && err.message ? err.message : "lecture impossible") + ".");
        }
      });
    };
    reader.readAsText(file);
  }

  // ─── Réglages ───
  function openSettings(){
    let s = {};
    try { s = FIN.store.getSettings() || {}; } catch (e) { /* ignoré */ }
    const d = openDialog(
      '<div class="sh-box-h">Réglages</div>' +
      '<div class="sh-box-b">' +
      '<div class="field"><label for="sh-ws">Début de semaine</label>' +
      '<select id="sh-ws"><option value="1">Lundi</option><option value="0">Dimanche</option></select></div>' +
      '<div class="field"><label for="sh-bud">Budget mensuel (optionnel)</label>' +
      '<input id="sh-bud" type="text" inputmode="decimal" placeholder="ex. 1 500 (vide = aucun)" autocomplete="off"></div>' +
      '</div>' +
      '<div class="sh-box-f"><button type="button" class="btn btn-ghost" data-a="cancel">Annuler</button>' +
      '<button type="button" class="btn btn-primary" data-a="save">Enregistrer</button></div>'
    );
    d.querySelector("#sh-ws").value = s.weekStart === 0 ? "0" : "1";
    d.querySelector("#sh-bud").value = s.monthlyBudget ? String(s.monthlyBudget).replace(".", ",") : "";
    d.addEventListener("click", e => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      if (b.dataset.a === "cancel") return closeDialog();
      const raw = d.querySelector("#sh-bud").value.trim();
      const budget = raw === "" ? null : U.parseAmount(raw);
      if (raw !== "" && budget === null) {
        d.querySelector("#sh-bud").style.borderColor = "var(--loss)";
        return;
      }
      try {
        FIN.store.setSettings({ weekStart: d.querySelector("#sh-ws").value === "0" ? 0 : 1, monthlyBudget: budget });
        showToast({ text: "Réglages enregistrés." });
      } catch (err) { showBanner("Impossible d'enregistrer les réglages."); }
      closeDialog();
      render();
    });
    setTimeout(() => { const f = d.querySelector("#sh-ws"); if (f) f.focus(); }, 30);
  }

  // ─── Zoom ───
  function applyZoom(){
    if (ipc) { try { ipc.invoke("set-zoom", zoom / 100); } catch (e) { /* ignoré */ } }
    else document.body.style.zoom = zoom === 100 ? "" : zoom + "%";
    const l = $("sh-zoom-lvl");
    if (l) l.textContent = zoom + " %";
  }
  function setZoom(z){
    zoom = Math.min(200, Math.max(50, Math.round(z)));
    applyZoom();
    saveUI();
  }
  function stepZoom(dir){
    let i = ZOOMS.indexOf(zoom);
    if (i < 0) i = dir > 0 ? ZOOMS.findIndex(v => v > zoom) : ZOOMS.map(v => v < zoom).lastIndexOf(true);
    else i += dir;
    if (i < 0 || i >= ZOOMS.length) return;
    setZoom(ZOOMS[i]);
  }

  // ─── Outils ───
  const TOOLS = [
    { id: "account",  label: "Compte & synchro",    run: () => FIN.bus.emit("account:open") },
    { id: "cat",      label: "Catégories",          run: () => FIN.bus.emit("categories:open") },
    { id: "csv",      label: "Exporter CSV",        run: exportCSV },
    { id: "json",     label: "Sauvegarder",         run: exportJSON },
    { id: "restore",  label: "Restaurer",           run: () => $("sh-file").click() },
    { id: "settings", label: "Réglages",            run: openSettings },
    { id: "folder",   label: "Dossier des données", run: () => guard("dossier", () => FIN.store.openDataFolder()), electron: true }
  ];
  function closeMenu(){
    const m = $("sh-menu"), b = $("sh-more");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }
  function buildTools(){
    const host = $("tools");
    if (!host) return;
    const list = TOOLS.filter(t => !t.electron || isElectron);
    host.innerHTML = "";

    // Boutons PC
    const inline = document.createElement("div");
    inline.className = "sh-tools-inline";
    list.forEach(t => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sh-ghost"; b.textContent = t.label;
      b.onclick = t.run;
      inline.appendChild(b);
    });
    if (isElectron) {
      const z = document.createElement("div");
      z.className = "sh-zoom";
      z.innerHTML = '<button type="button" class="sh-ghost sh-zbtn" aria-label="Zoom arrière">−</button>' +
        '<span class="sh-zoom-lvl num" id="sh-zoom-lvl">100 %</span>' +
        '<button type="button" class="sh-ghost sh-zbtn" aria-label="Zoom avant">+</button>';
      z.children[0].onclick = () => stepZoom(-1);
      z.children[2].onclick = () => stepZoom(1);
      z.children[1].title = "Cliquer pour revenir à 100 %";
      z.children[1].onclick = () => setZoom(100);
      inline.appendChild(z);
    }
    host.appendChild(inline);

    // Menu ⋯ (mobile)
    const more = document.createElement("div");
    more.className = "sh-more-wrap";
    more.innerHTML = '<button type="button" class="sh-more" id="sh-more" aria-haspopup="true" aria-expanded="false" aria-label="Plus d\'outils">⋯</button>' +
      '<div class="sh-menu" id="sh-menu" role="menu" hidden></div>';
    const menu = more.querySelector("#sh-menu");
    list.forEach(t => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "menuitem"); b.textContent = t.label;
      b.onclick = () => { closeMenu(); t.run(); };
      menu.appendChild(b);
    });
    more.querySelector("#sh-more").onclick = e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      e.currentTarget.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    };
    host.appendChild(more);
    document.addEventListener("click", e => { if (!e.target.closest(".sh-more-wrap")) closeMenu(); });

    // Sélecteur de fichier (Restaurer)
    const f = document.createElement("input");
    f.type = "file"; f.id = "sh-file"; f.accept = ".json,application/json"; f.hidden = true;
    f.onchange = () => { const file = f.files && f.files[0]; f.value = ""; restore(file); };
    host.appendChild(f);
  }

  // ─── Raccourcis clavier ───
  function inField(t){
    if (!t || !t.tagName) return false;
    const n = t.tagName;
    return n === "INPUT" || n === "TEXTAREA" || n === "SELECT" || t.isContentEditable;
  }
  function overlayOpen(){
    return !!document.querySelector(".modal:not([hidden]), .sheet:not([hidden])");
  }
  function onKey(e){
    if (e.key === "Escape") { closeMenu(); if (dlg) closeDialog(); return; }
    // Zoom (PC)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === "+" || e.key === "=") { e.preventDefault(); stepZoom(1); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); stepZoom(-1); }
      else if (e.key === "0") { e.preventDefault(); setZoom(100); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inField(e.target) || overlayOpen()) return;
    const k = e.key.toLowerCase();
    if (e.key === "ArrowLeft") { e.preventDefault(); shift(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); shift(1); }
    else if (k === "t") goToday();
    else if (k === "j") go("day");
    else if (k === "s") go("week");
    else if (k === "m") go("month");
    else if (k === "n" || e.key === "+") { e.preventDefault(); FIN.bus.emit("entry:open", { date: state.date }); }
  }

  // ─── Swipe horizontal (mobile) ───
  function initSwipe(){
    const el = $("views");
    if (!el) return;
    let x0 = 0, y0 = 0, t0 = 0, ok = false;
    el.addEventListener("touchstart", e => {
      ok = mqMobile.matches && e.touches.length === 1 && !inField(e.target) && !e.target.closest(".modal, .sheet");
      if (!ok) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    el.addEventListener("touchend", e => {
      if (!ok) return;
      ok = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 80 && Math.abs(dy) < 40 && Date.now() - t0 < 600) shift(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  // ─── Service worker ───
  function registerSW(){
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("[sw]", e));
  }

  // ─── Démarrage ───
  async function boot(){
    if (booted) return;
    booted = true;
    guard("navigation", buildNav);
    guard("outils", buildTools);

    FIN.bus.on("data:change", () => render());
    FIN.bus.on("goto", p => { if (p) go(p.view, p.date); });
    FIN.bus.on("toast", showToast);
    document.addEventListener("keydown", onKey);
    guard("gestes", initSwipe);

    try { await FIN.store.init(); }
    catch (e) { console.error("[app] store.init", e); showBanner("Impossible de charger les données. Vos fichiers n'ont pas été modifiés ; rechargez l'application."); }
    guard("saisie", () => FIN.entry.init());
    guard("vues", () => FIN.views.init());
    if (FIN.income) guard("revenus", () => FIN.income.init());
    if (FIN.detail) guard("détail", () => FIN.detail.init());
    if (FIN.account) guard("compte", () => FIN.account.init());
    if (FIN.update) guard("mises à jour", () => FIN.update.init());
    if (FIN.sync) guard("synchro", () => FIN.sync.init());

    // Vue et zoom mémorisés ; la date est toujours aujourd'hui
    try {
      const ui = FIN.store.getUI() || {};
      if (VIEWS.indexOf(ui.view) >= 0) state.view = ui.view;
      if (typeof ui.zoom === "number" && ui.zoom >= 50 && ui.zoom <= 200) zoom = Math.round(ui.zoom);
    } catch (e) { /* valeurs par défaut */ }
    state.date = midnight(new Date());
    if (zoom !== 100) applyZoom();
    else { const l = $("sh-zoom-lvl"); if (l) l.textContent = "100 %"; }

    render();
    registerSW();
  }

  FIN.app = { state, go, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
