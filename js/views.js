// ═══════════ Appli Finance — vues Jour / Semaine / Mois ═══════════
// Propriétaire : Agent 3 (Visuels). Voir CONTRAT.md.
// FIN.views.init() / FIN.views.render(state)
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const U = FIN.util;
  const esc = U.esc;

  let inited = false;

  // ─── Accès aux données ───
  function getCats(){ return FIN.store.getCategories({ includeArchived: true }); }
  function getExp(from, to){ return FIN.store.getExpenses({ from, to }); }
  function sumOf(list){ return Math.round(list.reduce((s, e) => s + e.amount, 0) * 100) / 100; }
  function weekStartOf(settings){
    const ws = settings && settings.weekStart;
    return (ws === 0 || ws === 1 || ws === 6) ? ws : (Number.isInteger(ws) && ws >= 0 && ws < 7 ? ws : 1);
  }

  // ─── Formats ───
  const eur = (n, d) => U.fmtEUR(n, d === undefined ? {} : { decimals: d });
  const pctStr = p => (FIN.charts && FIN.charts.pctStr) ? FIN.charts.pctStr(p) : U.fmtPct(p);
  // Montant abrégé pour petits écrans : « 12 € », « 1,2 k€ »
  function shortEUR(v){
    if (v >= 1000) return (Math.round(v / 100) / 10).toString().replace(".", ",") + " k€";
    if (v > 0 && v < 0.5) return "<1 €";
    return eur(v, 0);
  }
  function amtHtml(v){
    return '<span class="vw-full">' + esc(eur(v)) + '</span><span class="vw-short">' + esc(shortEUR(v)) + '</span>';
  }
  // Nombre de jours déjà écoulés dans une liste de jours (min 1 ; période future → tous)
  function elapsed(days){
    const t = U.todayKey();
    const n = days.filter(d => U.dayKey(d) <= t).length;
    return n || days.length;
  }

  // ─── Briques HTML communes ───
  function kpi(label, valueHtml, sub, cls){
    return '<div class="vw-kpi ' + (cls || "") + '"><div class="eyebrow">' + esc(label) + '</div>' +
      '<div class="vw-kpi-v num">' + valueHtml + '</div>' +
      (sub ? '<div class="vw-kpi-s">' + sub + '</div>' : "") + '</div>';
  }
  // Comparaison avec la période précédente : ↑ rouge (plus de dépenses) / ↓ verte (moins)
  function cmpKpi(label, cur, prev, prevName){
    if (!(prev > 0)) {
      return kpi(label, '<span class="vw-flat">—</span>', cur > 0 ? "Rien à comparer " + esc(prevName) : "Aucune dépense", "");
    }
    const d = (cur - prev) / prev * 100;
    let cls = "vw-flat", arrow = "→", txt = "0 %";
    if (Math.abs(d) >= 0.5) {
      if (d > 0) { cls = "vw-up"; arrow = "↑"; txt = "+" + U.fmtPct(d); }
      else { cls = "vw-down"; arrow = "↓"; txt = "−" + U.fmtPct(Math.abs(d)); }
    }
    return kpi(label, '<span class="' + cls + '"><span class="vw-arrow" aria-hidden="true">' + arrow + '</span> ' + esc(txt) + '</span>',
      esc(prevName) + " : " + esc(eur(prev)), "");
  }
  function topCatKpi(sum){
    const t = sum.byCategory[0];
    if (!t) return kpi("Catégorie n°1", '<span class="vw-flat">—</span>', "Aucune dépense", "");
    return '<div class="vw-kpi"><div class="eyebrow">Catégorie n°1</div>' +
      '<div class="vw-kpi-v vw-kpi-txt" style="--c:' + esc(t.category.color) + '"><span class="vw-top-dot"></span>' +
      esc(t.category.icon) + ' ' + esc(t.category.name) + '</div>' +
      '<div class="vw-kpi-s">' + esc(pctStr(t.pct)) + ' · ' + esc(eur(t.total)) + '</div></div>';
  }
  function budgetKpi(total, budget){
    const p = total / budget * 100;
    const cls = p > 100 ? "is-over" : (p >= 75 ? "is-warn" : "is-ok");
    const left = budget - total;
    return '<div class="vw-kpi vw-kpi-wide"><div class="eyebrow">Budget du mois</div>' +
      '<div class="vw-kpi-v num">' + esc(eur(total)) + ' <small>/ ' + esc(eur(budget, 0)) + '</small></div>' +
      '<div class="vw-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, Math.round(p)) + '">' +
        '<i class="' + cls + '" style="width:' + Math.min(100, p).toFixed(1) + '%"></i></div>' +
      '<div class="vw-kpi-s">' + esc(U.fmtPct(p)) + ' utilisé · ' +
        (left >= 0 ? "reste " + esc(eur(left)) : '<span class="vw-up">dépassé de ' + esc(eur(-left)) + '</span>') + '</div></div>';
  }
  // Panneau « camembert + légende »
  function sidePanel(title){
    return '<div class="panel vw-side"><div class="panel-h"><span>' + esc(title) + '</span></div>' +
      '<div class="panel-b"><div class="vw-donut"></div><div class="vw-legend"></div></div></div>';
  }
  // period = { from, to, label } : clic sur un segment ou une ligne → détail des dépenses
  function fillSide(root, sum, centerLabel, emptyText, period){
    const d = root.querySelector(".vw-donut"), l = root.querySelector(".vw-legend");
    const items = sum.byCategory.map(b => ({ label: b.category.name, value: b.total, color: b.category.color, icon: b.category.icon }));
    const openDetail = idxs => FIN.bus.emit("detail:open", Object.assign({
      categoryIds: idxs.map(i => sum.byCategory[i].category.id), periodTotal: sum.total
    }, period));
    const ctl = FIN.charts.donut(d, items, { centerLabel, centerValue: eur(sum.total), size: 260, onSelect: openDetail });
    FIN.charts.legend(l, sum.byCategory, {
      emptyText,
      onClick: b => openDetail([sum.byCategory.indexOf(b)]),
      onHover: i => { if (!ctl) return; if (i == null) ctl.reset(); else ctl.highlight(i); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  JOUR
  // ═══════════════════════════════════════════════════════════
  function renderDay(state){
    const root = document.getElementById("day-chart");
    if (!root) return;
    const key = U.dayKey(state.date);
    const cats = getCats();
    const sum = U.summarize(getExp(key, key), cats);
    const isToday = key === U.todayKey();

    root.innerHTML =
      '<div class="panel-h"><span>Répartition du jour</span><span class="num vw-h-date">' + esc(U.fmtDayLong(state.date)) + '</span></div>' +
      '<div class="panel-b vw-dayview">' +
        '<div class="vw-total">' +
          '<div class="eyebrow">' + (isToday ? "Dépensé aujourd’hui" : "Dépensé ce jour-là") + '</div>' +
          '<div class="vw-total-v num">' + esc(eur(sum.total)) + '</div>' +
          '<div class="vw-total-s">' + (sum.count ? sum.count + (sum.count > 1 ? " dépenses" : " dépense") : "Aucune dépense") + '</div>' +
        '</div>' +
        '<div class="vw-donut"></div><div class="vw-legend"></div>' +
      '</div>';
    fillSide(root, sum, "Total du jour", "Rien de dépensé ce jour-là.", { from: key, to: key, label: U.fmtDayLong(state.date) });
  }

  // ═══════════════════════════════════════════════════════════
  //  SEMAINE
  // ═══════════════════════════════════════════════════════════
  function renderWeek(state){
    const root = document.getElementById("view-week");
    if (!root) return;
    const ws = weekStartOf(state.settings);
    const days = U.weekDays(state.date, ws);
    const from = U.dayKey(days[0]), to = U.dayKey(days[6]);
    const cats = getCats();
    const exps = getExp(from, to);
    const sum = U.summarize(exps, cats);
    const prevTotal = sumOf(getExp(U.dayKey(U.addDays(days[0], -7)), U.dayKey(U.addDays(days[6], -7))));
    const avg = sum.total / elapsed(days);

    // Ventilation par jour et par catégorie (barres empilées)
    const catById = {};
    cats.forEach(c => { catById[c.id] = c; });
    const perDay = {};
    exps.forEach(e => {
      const m = perDay[e.date] = perDay[e.date] || {};
      m[e.categoryId] = (m[e.categoryId] || 0) + e.amount;
    });
    const order = sum.byCategory.map(b => b.category.id);
    const items = days.map(d => {
      const k = U.dayKey(d), m = perDay[k] || {};
      return {
        key: k, label: U.JOURS_COURT[d.getDay()], sub: String(d.getDate()),
        value: sum.byDay[k] || 0,
        segments: order.filter(id => m[id] > 0).map(id => ({
          value: m[id], color: (catById[id] && catById[id].color) || "#7E92A6"
        }))
      };
    });

    root.innerHTML =
      '<div class="vw-kpis">' +
        kpi("Total semaine", esc(eur(sum.total)), sum.count ? sum.count + (sum.count > 1 ? " dépenses" : " dépense") : "Aucune dépense", "vw-kpi-main") +
        kpi("Moyenne / jour", esc(eur(avg)), "sur " + elapsed(days) + (elapsed(days) > 1 ? " jours" : " jour"), "") +
        cmpKpi("vs semaine précédente", sum.total, prevTotal, "Semaine précédente") +
        topCatKpi(sum) +
      '</div>' +
      '<div class="vw-main">' +
        '<div class="panel vw-left"><div class="panel-h"><span>Dépenses par jour</span><span class="num vw-h-date">' + esc(U.fmtWeekLabel(state.date, ws)) + '</span></div>' +
          '<div class="panel-b"><div class="vw-bars"></div><div class="vw-hint">Touchez un jour pour voir son détail</div></div></div>' +
        sidePanel("Répartition de la semaine") +
      '</div>';

    FIN.charts.bars(root.querySelector(".vw-bars"), items, {
      highlightKey: U.dayKey(state.date),
      onClick: k => FIN.bus.emit("goto", { view: "day", date: U.parseKey(k) })
    });
    fillSide(root, sum, "Total semaine", "Aucune dépense cette semaine.", { from, to, label: U.fmtWeekLabel(state.date, ws) });
  }

  // ═══════════════════════════════════════════════════════════
  //  MOIS
  // ═══════════════════════════════════════════════════════════
  function renderMonth(state){
    const root = document.getElementById("view-month");
    if (!root) return;
    const ws = weekStartOf(state.settings);
    const y = state.date.getFullYear(), m = state.date.getMonth();
    const range = U.monthRange(y, m);
    const prevRange = U.monthRange(y, m - 1);
    const cats = getCats();
    const sum = U.summarize(getExp(range.from, range.to), cats);
    const prevTotal = sumOf(getExp(prevRange.from, prevRange.to));
    const nEl = elapsed(range.days);
    const avg = sum.total / nEl;
    const budget = Number(state.settings && state.settings.monthlyBudget);

    // ─── Chiffres clés ───
    let kpis = kpi("Total du mois", esc(eur(sum.total)), sum.count ? sum.count + (sum.count > 1 ? " dépenses" : " dépense") : "Aucune dépense", "vw-kpi-main") +
      kpi("Moyenne / jour écoulé", esc(eur(avg)), "sur " + nEl + (nEl > 1 ? " jours" : " jour"), "") +
      cmpKpi("vs mois précédent", sum.total, prevTotal, U.MOIS[prevRange.days[0].getMonth()]) +
      topCatKpi(sum);
    if (budget > 0) kpis += budgetKpi(sum.total, budget);

    // ─── Calendrier façon Track Record ───
    const grid = U.monthGrid(y, m, ws);
    let max = 0;
    range.days.forEach(d => { const v = sum.byDay[U.dayKey(d)] || 0; if (v > max) max = v; });
    const today = U.todayKey();

    let cal = '<div class="vw-cal-row vw-dow">' +
      grid[0].map(d => '<div class="vw-dow-c">' + esc(U.JOURS_COURT[d.getDay()]) + '</div>').join("") +
      '<div class="vw-dow-c vw-dow-wk">Semaine</div></div>';

    grid.forEach(week => {
      let cells = "", wkTotal = 0, firstIn = null;
      week.forEach(d => {
        const k = U.dayKey(d);
        const inMonth = d.getMonth() === m && d.getFullYear() === y;
        const v = inMonth ? (sum.byDay[k] || 0) : 0;
        if (inMonth) { wkTotal += v; if (!firstIn) firstIn = d; }
        const heat = v > 0 ? (0.12 + 0.5 * (max ? v / max : 0)).toFixed(3) : "0";
        cells += '<div class="vw-day' + (inMonth ? "" : " is-out") + (k === today ? " is-today" : "") + (v > 0 ? " has-v" : "") + '"' +
          ' role="button" tabindex="0" data-key="' + k + '" style="--h:' + heat + '"' +
          ' aria-label="' + esc(U.fmtDayLong(d) + (v > 0 ? " : " + eur(v) : " : aucune dépense")) + '">' +
          '<span class="vw-n">' + d.getDate() + '</span>' +
          (inMonth ? '<button type="button" class="vw-plus" data-add="' + k + '" tabindex="-1" aria-label="Ajouter une dépense le ' + esc(U.fmtDayLong(d)) + '">+</button>' : "") +
          (v > 0 ? '<span class="vw-amt num">' + amtHtml(v) + '</span>' : "") +
          '</div>';
      });
      const wk = U.isoWeek(week[3]);
      cal += '<div class="vw-cal-row">' + cells +
        '<div class="vw-wk' + (wkTotal > 0 ? " has-v" : "") + '"' + (firstIn ? ' role="button" tabindex="0" data-week="' + U.dayKey(firstIn) + '"' : "") +
        ' aria-label="Semaine ' + wk + ' : ' + esc(eur(wkTotal)) + '">' +
          '<span class="vw-wk-n">S' + wk + '</span>' +
          '<span class="vw-wk-v num">' + (wkTotal > 0 ? amtHtml(wkTotal) : "–") + '</span></div></div>';
    });

    root.innerHTML =
      '<div class="vw-kpis">' + kpis + '</div>' +
      '<div class="vw-main">' +
        '<div class="panel vw-left"><div class="panel-h"><span>Calendrier</span><span class="num vw-h-date">' + esc(U.fmtMonthLabel(state.date)) + '</span></div>' +
          '<div class="panel-b vw-cal-b"><div class="vw-cal">' + cal + '</div>' +
          '<div class="vw-hint">Touchez un jour pour le détail · double-clic ou « + » pour ajouter</div></div></div>' +
        sidePanel("Répartition du mois") +
      '</div>';

    fillSide(root, sum, "Total du mois", "Aucune dépense ce mois-ci.", { from: range.from, to: range.to, label: U.fmtMonthLabel(state.date) });
  }

  // ─── Interactions du calendrier (délégation, posées une seule fois) ───
  function bindMonth(){
    const root = document.getElementById("view-month");
    if (!root) return;
    let timer = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    root.addEventListener("click", ev => {
      const plus = ev.target.closest(".vw-plus");
      if (plus) {
        clear(); ev.stopPropagation();
        FIN.bus.emit("entry:open", { date: U.parseKey(plus.getAttribute("data-add")) });
        return;
      }
      const day = ev.target.closest(".vw-day");
      if (day) {
        const k = day.getAttribute("data-key");
        clear();
        // Délai court pour laisser passer un éventuel double-clic
        timer = setTimeout(() => { timer = null; FIN.bus.emit("goto", { view: "day", date: U.parseKey(k) }); }, 230);
        return;
      }
      const wk = ev.target.closest(".vw-wk[data-week]");
      if (wk) FIN.bus.emit("goto", { view: "week", date: U.parseKey(wk.getAttribute("data-week")) });
    });
    root.addEventListener("dblclick", ev => {
      const day = ev.target.closest(".vw-day");
      if (!day || day.classList.contains("is-out")) return;
      clear();
      FIN.bus.emit("entry:open", { date: U.parseKey(day.getAttribute("data-key")) });
    });
    root.addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const day = ev.target.closest && ev.target.closest(".vw-day");
      if (day && ev.target === day) {
        ev.preventDefault();
        FIN.bus.emit("goto", { view: "day", date: U.parseKey(day.getAttribute("data-key")) });
        return;
      }
      const wk = ev.target.closest && ev.target.closest(".vw-wk[data-week]");
      if (wk && ev.target === wk) {
        ev.preventDefault();
        FIN.bus.emit("goto", { view: "week", date: U.parseKey(wk.getAttribute("data-week")) });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  API publique
  // ═══════════════════════════════════════════════════════════
  function init(){
    if (inited) return;
    inited = true;
    bindMonth();
  }

  function render(state){
    if (!state || !state.date) return;
    if (!inited) init();
    if (!state.settings && FIN.store && FIN.store.getSettings) state = Object.assign({}, state, { settings: FIN.store.getSettings() });
    try {
      if (state.view === "day") renderDay(state);
      else if (state.view === "week") renderWeek(state);
      else if (state.view === "month") renderMonth(state);
    } catch (e) {
      console.error("[views] rendu " + state.view, e);
    }
  }

  FIN.views = { init, render };
})();
