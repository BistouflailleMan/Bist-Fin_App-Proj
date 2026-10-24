// ═══════════ Appli Finance — Revenus et reste à vivre (bandeau + modale) ═══════════
// Propriétaire : Agent Revenus. Voir CONTRAT.md (Extension v1.1).
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const U = FIN.util;
  const esc = U.esc;
  const $ = id => document.getElementById(id);
  const S = () => FIN.store;

  const SUGGESTIONS = ["Prime", "Remboursement", "Vente", "Aide / CAF", "Cadeau reçu", "Intérêts"];
  const DEF_LABEL = { salary: "Salaire", other: "Autre rentrée" };

  let inited = false;
  let viewDate = new Date();     // date affichée (state.date)
  let lastSig = "";              // signature du dernier rendu du bandeau
  let prevFocus = null;
  let editing = null;            // revenu en cours d'édition (ou null)
  let kind = "salary";           // type sélectionné dans le formulaire

  // ─── Utilitaires ───
  function toast(text, undo){ FIN.bus.emit("toast", undo ? { text, undo } : { text }); }
  function isDesktop(){
    try { return !window.matchMedia("(pointer:coarse)").matches && !window.matchMedia("(max-width:700px)").matches; }
    catch (e) { return true; }
  }
  function money(n){ n = Number(n) || 0; return U.fmtEUR(n, { decimals: Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2 }); }
  function amountToInput(n){
    const v = Number(n) || 0;
    return (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace(".", ",");
  }
  function round2(n){ return Math.round(n * 100) / 100; }
  function viewYM(){ return { y: viewDate.getFullYear(), m: viewDate.getMonth() }; }
  function monthKeys(y, m){ const r = U.monthRange(y, m); return { from: r.from, to: r.to, days: r.days.length }; }
  function firstOfMonth(y, m){ return U.dayKey(new Date(y, m, 1)); }
  function defaultDateKey(){
    const t = new Date(), v = viewYM();
    return (t.getFullYear() === v.y && t.getMonth() === v.m) ? U.dayKey(t) : firstOfMonth(v.y, v.m);
  }
  function shortDate(key){
    const d = U.parseKey(key);
    return d.getDate() + " " + U.MOIS_COURT[d.getMonth()].toLowerCase();
  }
  function modalEl(){ return $("modal-income"); }
  function modalOpen(){ const el = modalEl(); return !!(el && !el.hidden); }

  // ─── Données du mois affiché ───
  function monthData(){
    const { y, m } = viewYM();
    const k = monthKeys(y, m);
    let bal = { income: 0, salary: 0, other: 0, spent: 0, remaining: 0, ratio: null };
    let list = [];
    try { bal = Object.assign(bal, S().monthBalance(y, m)); } catch (e) { /* store indisponible */ }
    try { list = S().getIncomes({ from: k.from, to: k.to }); } catch (e) { /* idem */ }
    // Salaire du mois précédent (pour le raccourci « Reprendre »)
    let prev = null;
    if (!list.some(i => i.kind === "salary")) {
      const p = new Date(y, m - 1, 1), pk = monthKeys(p.getFullYear(), p.getMonth());
      try {
        const ps = S().getIncomes({ from: pk.from, to: pk.to, kind: "salary" });
        if (ps.length) prev = { amount: ps[0].amount, monthIdx: p.getMonth() };
      } catch (e) { /* ignore */ }
    }
    return { y, m, k, bal, list, prev };
  }

  // ─── Bandeau (#money-strip) ───
  function stripHTML(d){
    const { y, m, k, bal, list, prev } = d;
    const hasSalary = list.some(i => i.kind === "salary");
    const monthName = U.MOIS[m];
    const t = new Date();
    const isCurrent = t.getFullYear() === y && t.getMonth() === m;
    const isPast = y < t.getFullYear() || (y === t.getFullYear() && m < t.getMonth());

    // Case Revenus (gauche)
    let rev = '<div class="in-card in-rev' + (hasSalary ? '' : ' in-nosal') + '" data-act="open" role="group" aria-label="Revenus du mois">' +
      '<div class="in-eyebrow eyebrow">Revenus · ' + esc(monthName) + '</div>';
    if (hasSalary) {
      rev += '<button type="button" class="in-sal num" data-act="open" title="Voir et modifier les revenus">' +
        esc(money(bal.salary)) + '<span class="in-sal-l">salaire</span></button>';
    } else {
      rev += '<button type="button" class="in-btn in-btn-main' + (prev ? ' in-hide-m' : '') + '" data-act="salary">Saisir mon salaire</button>';
      if (prev) {
        rev += '<button type="button" class="in-btn in-btn-reuse" data-act="reuse" title="Créer le salaire du mois au 1er">' +
          'Reprendre ' + esc(money(prev.amount)) +
          '<span class="in-hide-m"> (salaire de ' + esc(U.MOIS[prev.monthIdx].toLowerCase()) + ')</span></button>';
      }
    }
    rev += '<div class="in-rev-row">';
    rev += '<span class="in-other">' + (bal.other > 0
      ? '+ autres rentrées : <b class="num">' + esc(money(bal.other)) + '</b>'
      : '<span class="in-dim">aucune autre rentrée</span>') + '</span>';
    rev += '<button type="button" class="in-btn in-btn-add" data-act="other" aria-label="Ajouter une rentrée d\'argent">+ Rentrée</button>';
    rev += '</div></div>';

    // Reste à vivre (droite)
    let rest;
    if (!(bal.income > 0)) {
      rest = '<div class="in-card in-rest in-empty">' +
        '<div class="in-eyebrow eyebrow">Reste à vivre</div>' +
        '<div class="in-invite">Saisissez votre salaire pour voir votre reste à vivre</div>' +
        (bal.spent > 0 ? '<div class="in-sub">' + esc(money(bal.spent)) + ' dépensés ce mois-ci</div>' : '') +
        '</div>';
    } else {
      const rem = bal.remaining;
      const tone = rem < 0 ? "loss" : (rem > bal.income * 0.2 ? "gain" : "gold");
      const pct = Math.max(0, Math.min(100, bal.spent / bal.income * 100));
      let extra = "";
      if (isCurrent && rem > 0) {
        const left = k.days - t.getDate() + 1;
        extra = '<span class="in-perday">≈ <b class="num">' + esc(U.fmtEUR(rem / left, { decimals: 0 })) + '/jour</b> jusqu\'au ' + k.days + '</span>';
      } else if (isPast) {
        extra = '<span class="in-perday">Solde final du mois</span>';
      }
      rest = '<div class="in-card in-rest in-' + tone + '">' +
        '<div class="in-eyebrow eyebrow">Reste à vivre · ' + esc(monthName) + '</div>' +
        '<div class="in-big num">' + esc(U.fmtEUR(rem)) + '</div>' +
        '<div class="in-sub">sur ' + esc(money(bal.income)) + ' rentrés · ' + esc(money(bal.spent)) + ' dépensés</div>' +
        '<div class="in-bar" role="img" aria-label="' + esc(U.fmtPct(pct)) + ' des revenus dépensés"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        (extra ? '<div class="in-extra">' + extra + '</div>' : '') +
        '</div>';
    }
    return rev + rest;
  }

  function render(state){
    if (!inited) init();
    if (!S()) return;
    if (state && state.date) viewDate = state.date instanceof Date ? state.date : (U.parseKey(state.date) || viewDate);
    const host = $("money-strip");
    if (host) {
      const html = stripHTML(monthData());
      if (html !== lastSig || !host.firstChild) { host.innerHTML = html; lastSig = html; }
    }
    if (modalOpen()) renderList();
  }

  // ─── Actions ───
  function reuseSalary(){
    const d = monthData();
    if (!d.prev) return open({ kind: "salary" });
    let inc;
    try { inc = S().addIncome({ date: firstOfMonth(d.y, d.m), amount: d.prev.amount, kind: "salary", label: DEF_LABEL.salary }); }
    catch (e) { toast((e && e.message) || "Ajout impossible"); return; }
    toast("Salaire " + money(inc.amount) + " repris pour " + U.MOIS[d.m].toLowerCase(), () => S().deleteIncome(inc.id));
  }

  function removeIncome(id){
    let inc;
    try { inc = S().deleteIncome(id); } catch (e) { toast("Suppression impossible"); return; }
    if (editing && editing.id === id) resetForm();
    toast((inc.kind === "salary" ? "Salaire" : "Rentrée") + " supprimé" + (inc.kind === "salary" ? "" : "e"), () => S().restoreIncome(inc));
  }

  // ─── Modale ───
  function open(opts){
    opts = opts || {};
    const el = modalEl();
    if (!el || !S()) return;
    if (el.hidden) prevFocus = document.activeElement;
    const inc = opts.income ? (S().getIncome(opts.income.id) || opts.income) : null;
    if (inc && inc.date) viewDate = U.parseKey(inc.date);
    const d = monthData();
    const hasSalary = d.list.some(i => i.kind === "salary");
    editing = inc;
    kind = inc ? inc.kind : (opts.kind === "other" || opts.kind === "salary" ? opts.kind : (hasSalary ? "other" : "salary"));

    el.innerHTML =
      '<div class="modal-box in-modal" role="dialog" aria-modal="true" aria-label="Revenus">' +
        '<div class="in-mh"><span class="eyebrow in-mtitle"></span>' +
          '<button type="button" class="btn btn-icon in-x" data-close="1" aria-label="Fermer">✕</button></div>' +
        '<div class="in-list-wrap"></div>' +
        '<form class="in-form" novalidate autocomplete="off">' +
          '<div class="in-fh"></div>' +
          '<div class="in-seg" role="radiogroup" aria-label="Type de rentrée">' +
            '<button type="button" class="in-seg-b" role="radio" data-kind="salary">Salaire</button>' +
            '<button type="button" class="in-seg-b" role="radio" data-kind="other">Autre rentrée</button>' +
          '</div>' +
          '<div class="in-lbl">Montant</div>' +
          '<div class="in-amount"><input id="in-amount" class="in-amount-in" type="text" inputmode="decimal" autocomplete="off" ' +
            'placeholder="0,00" aria-label="Montant" aria-describedby="in-err"><span class="in-eur" aria-hidden="true">€</span></div>' +
          '<div class="in-err" id="in-err" role="alert"></div>' +
          '<div class="in-row">' +
            '<div class="field in-f-label"><label for="in-label">Libellé</label>' +
              '<input id="in-label" class="in-label-in" type="text" maxlength="60"></div>' +
            '<div class="field in-f-date"><label for="in-date">Date</label>' +
              '<input id="in-date" class="in-date-in" type="date"></div>' +
          '</div>' +
          '<div class="in-chips" aria-label="Suggestions de libellé">' +
            SUGGESTIONS.map(s => '<button type="button" class="in-chip" data-sug="' + esc(s) + '">' + esc(s) + '</button>').join("") +
          '</div>' +
          '<div class="in-actions">' +
            '<button type="submit" class="btn btn-primary in-submit"></button>' +
            '<button type="button" class="btn in-cancel" data-act="cancel-edit" hidden>Annuler la modification</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    el.hidden = false;
    fillForm(inc);
    renderList();
    setTimeout(() => { const a = el.querySelector(".in-amount-in"); if (a) { a.focus(); try { a.select(); } catch (e) { /* ignore */ } } }, 30);
  }

  function close(){
    const el = modalEl();
    if (!el || el.hidden) return;
    el.hidden = true;
    el.innerHTML = "";
    editing = null;
    const p = prevFocus;
    prevFocus = null;
    if (p && p.focus && document.body.contains(p) && isDesktop()) { try { p.focus(); } catch (e) { /* ignore */ } }
  }

  // Remplit le formulaire (ajout si inc = null, sinon édition)
  function fillForm(inc){
    const el = modalEl();
    if (!el) return;
    editing = inc || null;
    if (inc) kind = inc.kind;
    el.querySelector(".in-amount-in").value = inc ? amountToInput(inc.amount) : "";
    el.querySelector(".in-label-in").value = inc ? (inc.label || "") : "";
    el.querySelector(".in-date-in").value = inc ? inc.date : defaultDateKey();
    el.querySelector(".in-fh").innerHTML = '<span class="in-lbl">' + (inc ? "Modifier la rentrée" : "Ajouter une rentrée") + '</span>';
    el.querySelector(".in-submit").textContent = inc ? "Enregistrer" : "Ajouter";
    el.querySelector(".in-cancel").hidden = !inc;
    setErr("");
    applyKind();
  }

  function resetForm(){ if (modalOpen()) fillForm(null); else editing = null; }

  function applyKind(){
    const el = modalEl();
    if (!el) return;
    el.querySelectorAll(".in-seg-b").forEach(b => {
      const on = b.getAttribute("data-kind") === kind;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    el.querySelector(".in-label-in").placeholder = kind === "salary" ? "Salaire" : "Prime, Vinted, remboursement…";
    el.querySelector(".in-chips").hidden = kind !== "other";
    const t = el.querySelector(".in-mtitle");
    t.textContent = "Revenus · " + U.MOIS[viewYM().m];
  }

  function setErr(msg, field){
    const el = modalEl();
    if (!el) return;
    el.querySelector(".in-err").textContent = msg || "";
    el.querySelector(".in-amount").classList.toggle("in-bad", !!msg && field === "amount");
    el.querySelector(".in-date-in").classList.toggle("in-bad", !!msg && field === "date");
    if (msg && field) {
      const f = el.querySelector(field === "amount" ? ".in-amount-in" : ".in-date-in");
      if (f) f.focus();
    }
  }

  function submit(){
    const el = modalEl();
    if (!el || el.hidden) return;
    const raw = el.querySelector(".in-amount-in").value.trim();
    if (!raw) return setErr("Saisissez un montant.", "amount");
    const amount = U.parseAmount(raw);
    if (amount == null) return setErr("Montant invalide — exemple : 2100 ou 12,50 (supérieur à 0).", "amount");
    const date = el.querySelector(".in-date-in").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Choisissez une date valide.", "date");
    const label = el.querySelector(".in-label-in").value.trim() || DEF_LABEL[kind];
    setErr("");
    const dm = U.parseKey(date);
    const other = dm.getFullYear() !== viewDate.getFullYear() || dm.getMonth() !== viewDate.getMonth();
    const suffix = other ? " (" + U.MOIS[dm.getMonth()].toLowerCase() + ")" : "";
    try {
      if (editing) {
        S().updateIncome(editing.id, { date, amount, kind, label });
        toast(money(amount) + " · " + label + " modifié" + suffix);
      } else {
        const inc = S().addIncome({ date, amount, kind, label });
        toast(money(amount) + " · " + label + " ajouté" + suffix, () => S().deleteIncome(inc.id));
      }
    } catch (e) {
      return setErr((e && e.message) || "Enregistrement impossible.", null);
    }
    fillForm(null);
    const a = el.querySelector(".in-amount-in");
    if (a && isDesktop()) a.focus();
  }

  // Liste des rentrées du mois (la saisie en cours n'est jamais touchée)
  function renderList(){
    const wrap = document.querySelector("#modal-income .in-list-wrap");
    if (!wrap) return;
    const d = monthData();
    const total = round2(d.list.reduce((s, i) => s + i.amount, 0));
    let html = '<div class="in-lh"><span class="in-lbl">Rentrées du mois' + (d.list.length ? ' · ' + d.list.length : '') +
      '</span><span class="in-ltot num">' + esc(U.fmtEUR(total)) + '</span></div>';
    if (!d.list.length) {
      html += '<div class="in-none">Aucune rentrée en ' + esc(U.MOIS[d.m].toLowerCase()) + ' — ajoutez votre salaire ci-dessous.</div>';
    } else {
      html += '<ul class="in-list">' + d.list.map(i =>
        '<li class="in-item' + (editing && editing.id === i.id ? ' is-edit' : '') + '" data-id="' + esc(i.id) + '">' +
          '<span class="in-i-date num">' + esc(shortDate(i.date)) + '</span>' +
          '<span class="in-i-main"><span class="in-i-label">' + esc(i.label || DEF_LABEL[i.kind]) + '</span>' +
            '<span class="in-i-kind in-k-' + esc(i.kind) + '">' + (i.kind === "salary" ? "Salaire" : "Autre") + '</span></span>' +
          '<span class="in-i-amt num">' + esc(U.fmtEUR(i.amount, { sign: true })) + '</span>' +
          '<button type="button" class="in-i-btn" data-act="edit" aria-label="Modifier ' + esc(i.label || "") + '">✎</button>' +
          '<button type="button" class="in-i-btn in-i-del" data-act="del" aria-label="Supprimer ' + esc(i.label || "") + '">✕</button>' +
        '</li>').join("") + '</ul>';
    }
    wrap.innerHTML = html;
  }

  // ─── Événements ───
  function bindStrip(){
    const host = $("money-strip");
    if (!host) return;
    host.addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      if (!b || !host.contains(b)) return;
      const act = b.getAttribute("data-act");
      if (act === "reuse") reuseSalary();
      else if (act === "salary") open({ kind: "salary" });
      else if (act === "other") open({ kind: "other" });
      else open();
    });
  }

  function bindModal(){
    const el = modalEl();
    if (!el) return;
    let downOnBackdrop = false;
    el.addEventListener("mousedown", e => { downOnBackdrop = (e.target === el); });
    el.addEventListener("click", e => {
      if (e.target === el) { if (downOnBackdrop) close(); return; }
      if (e.target.closest("[data-close]")) return close();
      const seg = e.target.closest(".in-seg-b");
      if (seg) { kind = seg.getAttribute("data-kind"); applyKind(); return; }
      const sug = e.target.closest("[data-sug]");
      if (sug) {
        const l = el.querySelector(".in-label-in");
        l.value = sug.getAttribute("data-sug");
        const a = el.querySelector(".in-amount-in");
        (a.value.trim() ? l : a).focus();
        return;
      }
      const act = e.target.closest("[data-act]");
      if (!act) return;
      const a = act.getAttribute("data-act");
      if (a === "cancel-edit") { fillForm(null); renderList(); return; }
      const row = act.closest(".in-item");
      if (!row) return;
      const id = row.getAttribute("data-id");
      if (a === "del") removeIncome(id);
      else if (a === "edit") {
        const inc = S().getIncome(id);
        if (inc) { fillForm(inc); renderList(); const am = el.querySelector(".in-amount-in"); am.focus(); try { am.select(); } catch (er) { /* ignore */ } }
      }
    });
    el.addEventListener("submit", e => { e.preventDefault(); submit(); });
    el.addEventListener("input", e => {
      if (!e.target.classList.contains("in-amount-in")) return;
      // Chiffres et un seul séparateur décimal (, ou .)
      const inp = e.target;
      const clean = inp.value.replace(/[^\d.,]/g, "").replace(/([.,].*)[.,]/g, "$1");
      if (clean !== inp.value) inp.value = clean;
      if (el.querySelector(".in-err").textContent) setErr("");
    });
  }

  // ─── API publique ───
  function init(){
    if (inited) return;
    inited = true;
    bindStrip();
    bindModal();
    FIN.bus.on("income:open", p => open(p || {}));
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modalOpen()) { e.preventDefault(); close(); }
    });
  }

  FIN.income = { init, render, open };
})();
