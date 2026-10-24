// ═══════════ Appli Finance — utilitaires partagés + bus d'événements ═══════════
// Propriétaire : superviseur. Voir CONTRAT.md.
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};

  // ─── Bus d'événements ───
  const handlers = {};
  FIN.bus = {
    on(name, fn){ (handlers[name] = handlers[name] || []).push(fn); },
    off(name, fn){ handlers[name] = (handlers[name] || []).filter(h => h !== fn); },
    emit(name, payload){
      (handlers[name] || []).slice().forEach(fn => {
        try { fn(payload); } catch (e) { console.error("[bus] " + name, e); }
      });
    }
  };

  // ─── Calendrier ───
  const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const MOIS_COURT = ["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."];
  const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const JOURS_COURT = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

  const pad = n => String(n).padStart(2, "0");
  function dayKey(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseKey(k){ const [y, m, d] = String(k).split("-").map(Number); return new Date(y, m - 1, d); }
  function todayKey(){ return dayKey(new Date()); }
  function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function startOfWeek(d, weekStart = 1){
    const diff = (d.getDay() - weekStart + 7) % 7;
    return addDays(d, -diff);
  }
  function weekDays(d, weekStart = 1){
    const s = startOfWeek(d, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  function monthRange(y, m){
    const n = new Date(y, m + 1, 0).getDate();
    const days = Array.from({ length: n }, (_, i) => new Date(y, m, i + 1));
    return { from: dayKey(days[0]), to: dayKey(days[n - 1]), days };
  }
  function monthGrid(y, m, weekStart = 1){
    const first = startOfWeek(new Date(y, m, 1), weekStart);
    const last = new Date(y, m + 1, 0);
    const weeks = [];
    for (let s = first; s <= last; s = addDays(s, 7)) {
      weeks.push(Array.from({ length: 7 }, (_, i) => addDays(s, i)));
    }
    return weeks;
  }
  function isoWeek(d){
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  }

  // ─── Formats ───
  const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function fmtEUR(n, opts = {}){
    const v = Number(n) || 0;
    const f = opts.decimals === 0 ? eur0 : eur2;
    const s = f.format(Math.abs(v));
    if (opts.sign && v > 0) return "+" + s;
    return v < 0 ? "−" + s : s;
  }
  function fmtPct(x, decimals = 0){
    const v = Number(x) || 0;
    return v.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + " %";
  }
  function parseAmount(str){
    if (typeof str === "number") return Number.isFinite(str) && str > 0 ? Math.round(str * 100) / 100 : null;
    const s = String(str || "").replace(/\s|€/g, "").replace(",", ".");
    if (!/^\d*\.?\d+$/.test(s)) return null;
    const v = Math.round(parseFloat(s) * 100) / 100;
    return v > 0 ? v : null;
  }
  function fmtDayLong(d){
    return JOURS[d.getDay()].toLowerCase() + " " + d.getDate() + " " + MOIS[d.getMonth()].toLowerCase() + " " + d.getFullYear();
  }
  function fmtWeekLabel(d, weekStart = 1){
    const w = weekDays(d, weekStart), a = w[0], b = w[6];
    const left = a.getMonth() === b.getMonth() ? a.getDate() : a.getDate() + " " + MOIS_COURT[a.getMonth()].toLowerCase();
    return "Semaine " + isoWeek(w[3]) + " · " + left + " – " + b.getDate() + " " + MOIS_COURT[b.getMonth()].toLowerCase() + " " + b.getFullYear();
  }
  function fmtMonthLabel(d){ return MOIS[d.getMonth()] + " " + d.getFullYear(); }

  // ─── Statistiques ───
  function summarize(expenses, categories){
    const byId = {};
    (categories || []).forEach(c => { byId[c.id] = c; });
    const tot = {}, cnt = {}, byDay = {};
    let total = 0;
    (expenses || []).forEach(e => {
      total += e.amount;
      tot[e.categoryId] = (tot[e.categoryId] || 0) + e.amount;
      cnt[e.categoryId] = (cnt[e.categoryId] || 0) + 1;
      byDay[e.date] = (byDay[e.date] || 0) + e.amount;
    });
    total = Math.round(total * 100) / 100;
    const byCategory = Object.keys(tot).map(id => ({
      category: byId[id] || { id, name: "Sans catégorie", icon: "•", color: "#7E92A6" },
      total: Math.round(tot[id] * 100) / 100,
      pct: total ? tot[id] / total * 100 : 0,
      count: cnt[id]
    })).sort((a, b) => b.total - a.total);
    return { total, count: (expenses || []).length, byCategory, byDay };
  }

  // ─── Divers ───
  function uid(prefix = "x"){
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function contrast(hex){
    const h = String(hex || "").replace("#", "");
    if (h.length < 6) return "#fff";
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.55 ? "#0D1520" : "#fff";
  }

  const DEFAULT_CATEGORIES = [
    { id: "food",      name: "Nourriture",        icon: "🍽️", color: "#F2A65A" },
    { id: "groceries", name: "Courses",           icon: "🛒", color: "#6FD5A3" },
    { id: "fuel",      name: "Essence",           icon: "⛽", color: "#F08A80" },
    { id: "leisure",   name: "Loisirs / Sorties", icon: "🎉", color: "#B48CF2" },
    { id: "subs",      name: "Abonnements",       icon: "📺", color: "#5AB8F2" },
    { id: "invest",    name: "Investissement",    icon: "📈", color: "#DFC65C" },
    { id: "gifts",     name: "Cadeaux",           icon: "🎁", color: "#F28CC6" },
    { id: "home",      name: "Logement",          icon: "🏠", color: "#8CA6F2" },
    { id: "health",    name: "Santé",             icon: "💊", color: "#5CDFD0" },
    { id: "transport", name: "Transport",         icon: "🚆", color: "#C6A07A" },
    { id: "other",     name: "Autre",             icon: "•",  color: "#7E92A6" }
  ].map((c, i) => Object.assign(c, { order: i, archived: false, updatedAt: 0 }));

  FIN.util = {
    uid, esc, contrast,
    MOIS, MOIS_COURT, JOURS, JOURS_COURT,
    dayKey, parseKey, todayKey, addDays, startOfWeek, weekDays, monthRange, monthGrid, isoWeek,
    fmtEUR, fmtPct, parseAmount, fmtDayLong, fmtWeekLabel, fmtMonthLabel,
    summarize,
    DEFAULT_CATEGORIES
  };
})();
