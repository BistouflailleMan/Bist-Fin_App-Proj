// ═══════════ Appli Finance — détail d'une catégorie (clic sur le camembert ou la légende) ═══════════
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const U = FIN.util;
  const esc = U.esc;
  const $ = id => document.getElementById(id);

  let current = null;     // dernier payload ouvert
  let prevFocus = null;

  // ─── Regroupement ───
  // Une seule catégorie : groupes par note (« FTMO », « Vantage »…) ; plusieurs : groupes par catégorie.
  function normNote(s){ return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function groupsOf(exps, byCat, cats){
    const map = new Map();
    exps.forEach(e => {
      let key, label, color, icon;
      if (byCat) {
        const c = cats[e.categoryId] || { name: "Sans catégorie", color: "#7E92A6", icon: "•" };
        key = e.categoryId; label = c.name; color = c.color; icon = c.icon;
      } else {
        key = normNote(e.note);
        label = String(e.note || "").trim().replace(/\s+/g, " ") || "Sans note";
      }
      let g = map.get(key);
      if (!g) { g = { key, label, color, icon, total: 0, items: [], forms: {} }; map.set(key, g); }
      g.forms[label] = (g.forms[label] || 0) + 1;
      g.total += e.amount;
      g.items.push(e);
    });
    // Libellé affiché : l'écriture la plus fréquente, à égalité celle qui a le plus de majuscules
    const caps = s => (s.match(/[A-ZÀ-Þ]/g) || []).length;
    return Array.from(map.values())
      .map(g => Object.assign(g, {
        total: Math.round(g.total * 100) / 100,
        label: Object.keys(g.forms).sort((a, b) => g.forms[b] - g.forms[a] || caps(b) - caps(a))[0]
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "fr"));
  }

  function shortDate(key){
    const d = U.parseKey(key);
    return U.JOURS_COURT[d.getDay()] + " " + d.getDate() + " " + U.MOIS_COURT[d.getMonth()].toLowerCase();
  }

  // ─── Rendu ───
  function render(){
    const el = $("modal-detail");
    if (!el || !current) return;
    const p = current;
    const all = FIN.store.getCategories({ includeArchived: true });
    const cats = {};
    all.forEach(c => { cats[c.id] = c; });
    const ids = new Set(p.categoryIds || []);
    const exps = FIN.store.getExpenses({ from: p.from, to: p.to }).filter(e => ids.has(e.categoryId));
    const total = Math.round(exps.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const single = ids.size === 1 ? cats[p.categoryIds[0]] : null;
    const color = single ? single.color : "#7E92A6";
    const title = single ? (single.icon ? single.icon + " " : "") + single.name : "Autres (" + ids.size + " catégories)";
    const groups = groupsOf(exps, !single, cats);
    const openAll = exps.length <= 8;
    const share = p.periodTotal ? total / p.periodTotal * 100 : 0;

    const groupsHtml = groups.map(g => {
      const pct = total ? g.total / total * 100 : 0;
      const c = g.color || color;
      return '<details class="dt-group" style="--c:' + esc(c) + '"' + (openAll ? " open" : "") + '>' +
        '<summary class="dt-sum">' +
          '<span class="dt-g-name">' + (g.icon ? '<span aria-hidden="true">' + esc(g.icon) + '</span> ' : "") + esc(g.label) +
            '<span class="dt-g-n">' + g.items.length + (g.items.length > 1 ? " dépenses" : " dépense") + '</span></span>' +
          '<span class="dt-g-amt num">' + esc(U.fmtEUR(g.total)) + '</span>' +
          '<span class="dt-g-pct num">' + esc(U.fmtPct(pct, pct < 10 && pct > 0 ? 1 : 0)) + '</span>' +
          '<span class="dt-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '</summary>' +
        '<ul class="dt-items">' + g.items.map(e =>
          '<li><button type="button" class="dt-item" data-id="' + esc(e.id) + '" title="Modifier cette dépense">' +
            '<span class="dt-i-date num">' + esc(shortDate(e.date)) + '</span>' +
            '<span class="dt-i-note">' + esc(single ? (e.note || "Sans note") : (e.note || (cats[e.categoryId] || {}).name || "")) + '</span>' +
            '<span class="dt-i-amt num">' + esc(U.fmtEUR(e.amount)) + '</span>' +
          '</button></li>').join("") +
        '</ul>' +
      '</details>';
    }).join("");

    el.innerHTML =
      '<div class="modal-box dt-box" role="dialog" aria-modal="true" aria-label="' + esc("Détail : " + title) + '" style="--c:' + esc(color) + '">' +
        '<div class="dt-head">' +
          '<div><div class="eyebrow">' + esc(p.label || "") + '</div>' +
            '<div class="dt-title">' + esc(title) + '</div></div>' +
          '<button type="button" class="btn btn-icon" data-close="1" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<div class="dt-kpis">' +
          '<div><div class="eyebrow">Total</div><div class="dt-total num">' + esc(U.fmtEUR(total)) + '</div></div>' +
          '<div><div class="eyebrow">Part de la période</div><div class="dt-k num">' + esc(U.fmtPct(share, share < 10 && share > 0 ? 1 : 0)) + '</div></div>' +
          '<div><div class="eyebrow">Dépenses</div><div class="dt-k num">' + exps.length + '</div></div>' +
        '</div>' +
        (exps.length
          ? '<div class="dt-lbl">' + (single ? "Par libellé (note de la dépense)" : "Par catégorie") + '</div><div class="dt-groups">' + groupsHtml + '</div>' +
            '<p class="dt-hint">Touchez une dépense pour la modifier. Astuce : utilisez toujours la même note (ex. « FTMO ») pour regrouper vos dépenses.</p>'
          : '<p class="dt-empty">Aucune dépense dans cette catégorie sur la période.</p>') +
      '</div>';
  }

  // ─── Ouverture / fermeture ───
  function open(payload){
    const el = $("modal-detail");
    if (!el || !payload || !payload.categoryIds || !payload.categoryIds.length) return;
    if (el.hidden) prevFocus = document.activeElement;
    current = payload;
    render();
    el.hidden = false;
    const x = el.querySelector("[data-close]");
    if (x) x.focus();
  }
  function close(){
    const el = $("modal-detail");
    if (!el || el.hidden) return;
    el.hidden = true;
    el.innerHTML = "";
    current = null;
    if (prevFocus && prevFocus.focus && document.body.contains(prevFocus)) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
    prevFocus = null;
  }

  function init(){
    const el = $("modal-detail");
    if (!el) return;
    let downOnBackdrop = false;
    el.addEventListener("mousedown", e => { downOnBackdrop = e.target === el; });
    el.addEventListener("click", e => {
      if ((e.target === el && downOnBackdrop) || e.target.closest("[data-close]")) return close();
      const it = e.target.closest(".dt-item");
      if (it) {
        const exp = FIN.store.getExpense(it.getAttribute("data-id"));
        close();
        if (exp) FIN.bus.emit("entry:open", { expense: exp });
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !el.hidden) { e.preventDefault(); close(); }
    });
    FIN.bus.on("detail:open", open);
    FIN.bus.on("data:change", () => { if (!el.hidden) render(); });
  }

  FIN.detail = { init, open, close };
})();
