// ═══════════ Appli Finance — Mises à jour proposées (bandeau) ═══════════
// Propriétaire : Agent Interface. Voir CONTRAT.md (Extension v1.2).
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const esc = (FIN.util && FIN.util.esc) || (s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const $ = id => document.getElementById(id);

  const IS_ELECTRON = !!(typeof process !== "undefined" && process.versions && process.versions.electron);
  const IS_HTTP = /^https?:$/.test(location.protocol);

  let inited = false;
  let ipc = null;               // ipcRenderer (Electron)
  let reg = null;               // ServiceWorkerRegistration (PWA)
  let dismissed = false;        // « Plus tard » : masqué pour la session
  let banner = null;            // état affiché : { kind, ... }
  let manualCheck = null;       // minuteur d'une vérification manuelle en cours
  let reloadRequested = false;  // l'utilisateur a demandé la mise à jour PWA
  let reloaded = false;         // garde-fou : un seul rechargement

  function toast(text){ if (FIN.bus) FIN.bus.emit("toast", { text }); }

  // ─── Bandeau ───
  // kind : "avail" (Electron) | "portable" | "progress" | "ready" | "error" | "pwa"
  function show(b){
    banner = b;
    paint();
  }
  function hide(){
    banner = null;
    paint();
  }
  function paint(){
    const el = $("update-banner");
    if (!el) return;
    if (!banner || (dismissed && banner.kind !== "ready" && banner.kind !== "progress")) {
      el.hidden = true; el.innerHTML = "";
      document.body.classList.remove("up-on");
      return;
    }
    const b = banner;
    let txt = "", btns = "", extra = "";
    if (b.kind === "avail") {
      txt = "Nouvelle version " + esc(b.version) + " disponible";
      btns = '<button type="button" class="up-btn up-main" data-act="download">Installer</button>';
    } else if (b.kind === "portable") {
      txt = "Nouvelle version " + esc(b.version) + " disponible";
      btns = '<button type="button" class="up-btn up-main" data-act="open-releases">Télécharger</button>';
    } else if (b.kind === "progress") {
      const p = Math.max(0, Math.min(100, Math.round(b.percent || 0)));
      txt = "Téléchargement de la mise à jour… " + p + " %";
      extra = '<div class="up-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>';
    } else if (b.kind === "ready") {
      txt = "Mise à jour prête";
      btns = '<button type="button" class="up-btn up-main" data-act="install">Redémarrer maintenant</button>';
    } else if (b.kind === "error") {
      txt = esc(b.message || "La mise à jour a échoué. Réessayez plus tard.");
    } else if (b.kind === "pwa") {
      txt = b.version ? "Nouvelle version " + esc(b.version) + " disponible" : "Nouvelle version disponible";
      btns = '<button type="button" class="up-btn up-main" data-act="pwa-update">Mettre à jour</button>';
    }
    const later = b.kind === "progress" ? "" : '<button type="button" class="up-x" data-act="later" aria-label="Plus tard" title="Plus tard">✕</button>';
    el.innerHTML = '<div class="up-in"><span class="up-txt">' + txt + '</span>' + btns + later + '</div>' + extra;
    el.hidden = false;
    document.body.classList.add("up-on");
  }

  function onClick(e){
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "later") { dismissed = true; paint(); }
    else if (act === "download" && ipc) { show({ kind: "progress", percent: 0 }); ipc.send("update:download"); }
    else if (act === "install" && ipc) ipc.send("update:install");
    else if (act === "open-releases") openReleases();
    else if (act === "pwa-update") applyPwa();
  }

  function openReleases(){
    const repo = (window.FIN_CONFIG && window.FIN_CONFIG.githubRepo) || "";
    if (!repo) { toast("Page des versions non configurée"); return; }
    window.open("https://github.com/" + repo + "/releases/latest", "_blank", "noopener");
  }

  // ─── Vérification manuelle : retour utilisateur si rien de nouveau ───
  function startManual(ms){
    clearManual();
    manualCheck = setTimeout(() => { manualCheck = null; toast("Vous avez la dernière version"); }, ms);
  }
  function clearManual(){ if (manualCheck) { clearTimeout(manualCheck); manualCheck = null; } }

  // ─── Electron ───
  function initElectron(){
    try { ipc = require("electron").ipcRenderer; } catch (e) { ipc = null; }
    if (!ipc) return;
    ipc.on("update:available", (_ev, info) => {
      clearManual();
      info = info || {};
      dismissed = false;
      show({ kind: info.portable ? "portable" : "avail", version: info.version || "" });
    });
    ipc.on("update:progress", (_ev, p) => {
      show({ kind: "progress", percent: p && p.percent });
    });
    ipc.on("update:downloaded", () => { clearManual(); dismissed = false; show({ kind: "ready" }); });
    ipc.on("update:none", () => {
      if (manualCheck) { clearManual(); toast("Vous avez la dernière version"); }
    });
    ipc.on("update:error", (_ev, p) => {
      if (manualCheck) { clearManual(); toast("Impossible de vérifier les mises à jour pour le moment"); }
      if (banner && banner.kind === "progress") show({ kind: "error", message: "Le téléchargement de la mise à jour a échoué." });
      else console.warn("[update]", p && p.message ? p.message : "erreur");
    });
  }

  // ─── PWA ───
  function getVersion(worker){
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      try {
        const ch = new MessageChannel();
        ch.port1.onmessage = ev => finish(ev.data && (ev.data.version || ev.data) || "");
        worker.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      } catch (e) { finish(""); }
      setTimeout(() => finish(""), 2500);
    });
  }

  function offerWaiting(){
    if (!reg || !reg.waiting || !navigator.serviceWorker.controller) return;
    const w = reg.waiting;
    if (banner && banner.kind === "pwa") return;
    getVersion(w).then(v => {
      if (reg.waiting !== w) return;
      dismissed = false;
      show({ kind: "pwa", version: typeof v === "string" ? v : "" });
    });
  }

  function watchInstalling(w){
    if (!w) return;
    w.addEventListener("statechange", () => {
      if (w.state === "installed") offerWaiting();
    });
  }

  function applyPwa(){
    const w = reg && reg.waiting;
    if (!w) { location.reload(); return; }
    reloadRequested = true;
    const el = $("update-banner");
    const btn = el && el.querySelector(".up-main");
    if (btn) { btn.disabled = true; btn.textContent = "Mise à jour…"; }
    w.postMessage({ type: "SKIP_WAITING" });
  }

  function initPwa(){
    if (!IS_HTTP || !navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloadRequested || reloaded) return;
      reloaded = true;
      location.reload();
    });
    const attach = r => {
      if (!r || reg) return;
      reg = r;
      r.addEventListener("updatefound", () => watchInstalling(r.installing));
      offerWaiting();
      watchInstalling(r.installing);
      r.update().catch(() => {});
    };
    navigator.serviceWorker.getRegistration().then(r => {
      if (r) attach(r);
      else navigator.serviceWorker.ready.then(attach).catch(() => {});
    }).catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && reg) reg.update().catch(() => {});
    });
    setInterval(() => { if (reg) reg.update().catch(() => {}); }, 30 * 60 * 1000);
  }

  // ─── API publique ───
  function check(){
    if (IS_ELECTRON) {
      if (!ipc) { toast("Mises à jour non disponibles dans ce mode"); return; }
      startManual(8000);
      ipc.send("update:check");
      return;
    }
    if (!IS_HTTP || !navigator.serviceWorker) { toast("Mises à jour non disponibles dans ce mode"); return; }
    if (!reg) { toast("Mises à jour non disponibles pour le moment"); return; }
    if (reg.waiting) { dismissed = false; offerWaiting(); if (banner) paint(); return; }
    reg.update().then(() => {
      setTimeout(() => {
        if (reg.waiting || reg.installing) { if (reg.waiting) { dismissed = false; offerWaiting(); } else toast("Mise à jour en cours de préparation…"); }
        else toast("Vous avez la dernière version");
      }, 1500);
    }).catch(() => toast("Impossible de vérifier les mises à jour pour le moment"));
  }

  function init(){
    if (inited) return;
    inited = true;
    const el = $("update-banner");
    if (el) el.addEventListener("click", onClick);
    if (IS_ELECTRON) initElectron();
    else initPwa();
  }

  FIN.update = { init, check };
})();
