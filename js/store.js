// ═══════════ Appli Finance — stockage des données (FIN.store) ═══════════
// Propriétaire : Agent 1 (Données). Voir CONTRAT.md.
// Persistance via un adaptateur interchangeable : FileAdapter (Electron) ou LocalAdapter (localStorage).
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const U = FIN.util;
  if (!U) throw new Error("FIN.util est introuvable : charger js/util.js avant js/store.js");

  // ─── Constantes ───
  const VERSION = 1;
  const LS_KEY = "appli-finance:v1";
  const FILE_NAME = "donnees-finances.json";
  const BAK_NAME = "donnees-finances.bak.json";
  const SAVE_DELAY = 250;
  const FALLBACK_COLOR = "#7E92A6";
  const FALLBACK_CAT = "other";
  const NOTE_MAX = 500;
  const LABEL_MAX = 60;

  // ─── Petits outils ───
  const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const isNum = v => typeof v === "number" && Number.isFinite(v);
  const clone = o => JSON.parse(JSON.stringify(o));
  const copy = o => Object.assign({}, o);
  const isColor = c => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
  // Horodatage strictement croissant par rapport à une valeur précédente (utile pour la synchro).
  const stamp = prev => Math.max(Date.now(), (isNum(prev) ? prev : 0) + 1);

  function isValidKey(k){
    if (typeof k !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    return U.dayKey(U.parseKey(k)) === k;
  }
  function toKey(v){
    if (v instanceof Date) return U.dayKey(v);
    return typeof v === "string" ? v : null;
  }
  function toast(text){ FIN.bus.emit("toast", { text }); }

  // ─── Assainissement (lecture tolérante / import strict) ───
  function sanitizeSettings(s){
    const o = isObj(s) ? s : {};
    const ws = o.weekStart == null ? 1 : Number(o.weekStart);
    return {
      weekStart: Number.isInteger(ws) && ws >= 0 && ws <= 6 ? ws : 1,
      currency: typeof o.currency === "string" && o.currency ? o.currency : "EUR",
      monthlyBudget: o.monthlyBudget == null ? null : U.parseAmount(o.monthlyBudget),
      updatedAt: isNum(o.updatedAt) ? o.updatedAt : 0
    };
  }

  function sanitizeCategory(c, fallbackOrder){
    if (!isObj(c) || typeof c.id !== "string" || !c.id) return null;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    return {
      id: c.id,
      name: name || c.id,
      icon: typeof c.icon === "string" && c.icon ? c.icon : "•",
      color: isColor(c.color) ? c.color : FALLBACK_COLOR,
      order: isNum(c.order) ? c.order : fallbackOrder,
      archived: !!c.archived,
      updatedAt: isNum(c.updatedAt) ? c.updatedAt : 0
    };
  }

  // Renvoie null si la dépense est irrécupérable (montant ou date invalide).
  function sanitizeExpense(e){
    if (!isObj(e)) return null;
    const amount = U.parseAmount(e.amount);
    if (amount === null || !isValidKey(e.date)) return null;
    const createdAt = isNum(e.createdAt) ? e.createdAt : 0;
    return {
      id: typeof e.id === "string" && e.id ? e.id : U.uid("e"),
      date: e.date,
      amount,
      categoryId: typeof e.categoryId === "string" && e.categoryId ? e.categoryId : FALLBACK_CAT,
      note: e.note == null ? "" : String(e.note).trim().slice(0, NOTE_MAX),
      createdAt,
      updatedAt: isNum(e.updatedAt) ? e.updatedAt : createdAt
    };
  }

  function cleanKind(k){ return k === "salary" ? "salary" : "other"; }
  function defaultLabel(kind){ return kind === "salary" ? "Salaire" : "Autre rentrée"; }
  function cleanLabel(l, kind){
    const s = l == null ? "" : String(l).trim().slice(0, LABEL_MAX).trim();
    return s || defaultLabel(kind);
  }

  // Renvoie null si le revenu est irrécupérable (montant ou date invalide).
  function sanitizeIncome(i){
    if (!isObj(i)) return null;
    const amount = U.parseAmount(i.amount);
    if (amount === null || !isValidKey(i.date)) return null;
    const kind = cleanKind(i.kind);
    const createdAt = isNum(i.createdAt) ? i.createdAt : 0;
    return {
      id: typeof i.id === "string" && i.id ? i.id : U.uid("i"),
      date: i.date,
      amount,
      kind,
      label: cleanLabel(i.label, kind),
      createdAt,
      updatedAt: isNum(i.updatedAt) ? i.updatedAt : createdAt
    };
  }

  function sanitizeTombstone(t){
    if (!isObj(t) || typeof t.id !== "string" || !t.id) return null;
    const type = t.type === "income" || t.type === "category" ? t.type : "expense";
    return { id: t.id, type, deletedAt: isNum(t.deletedAt) ? t.deletedAt : 0 };
  }

  // ─── Synchro : liste « à envoyer » et état de connexion (jamais exportés) ───
  function emptySync(){
    return { dirty: {}, state: { cursor: null, session: null, email: null, lastSyncAt: null } };
  }
  function sanitizeSync(raw){
    const o = emptySync();
    if (!isObj(raw)) return o;
    if (isObj(raw.dirty)) Object.keys(raw.dirty).forEach(k => { if (raw.dirty[k]) o.dirty[k] = 1; });
    if (isObj(raw.state)) {
      const st = raw.state;
      o.state.cursor = typeof st.cursor === "string" && st.cursor ? st.cursor : null;
      o.state.email = typeof st.email === "string" && st.email ? st.email : null;
      o.state.lastSyncAt = isNum(st.lastSyncAt) ? st.lastSyncAt : null;
      if (isObj(st.session) && typeof st.session.access_token === "string" && typeof st.session.refresh_token === "string") {
        o.state.session = {
          access_token: st.session.access_token,
          refresh_token: st.session.refresh_token,
          expires_at: isNum(st.session.expires_at) ? st.session.expires_at : 0
        };
      }
    }
    return o;
  }

  // Ajoute les catégories par défaut manquantes (par id) sans toucher à celles de l'utilisateur.
  function ensureDefaultCategories(d){
    const ids = new Set(d.categories.map(c => c.id));
    const first = d.categories.length === 0;
    let next = d.categories.reduce((m, c) => Math.max(m, c.order), -1) + 1;
    let changed = false;
    U.DEFAULT_CATEGORIES.forEach(def => {
      if (ids.has(def.id)) return;
      const c = copy(def);
      c.order = first ? def.order : next++;
      d.categories.push(c);
      ids.add(def.id);
      changed = true;
    });
    return changed;
  }

  // Les dépenses dont la catégorie n'existe pas passent en « other ».
  function fixCategoryIds(d){
    const ids = new Set(d.categories.map(c => c.id));
    d.expenses.forEach(e => { if (!ids.has(e.categoryId)) e.categoryId = FALLBACK_CAT; });
  }

  function emptyData(){
    const d = { version: VERSION, expenses: [], incomes: [], categories: [], settings: sanitizeSettings(null), deleted: [], ui: {}, sync: emptySync() };
    ensureDefaultCategories(d);
    return d;
  }

  // Construit un jeu de données propre à partir d'un objet lu (lecture tolérante : on répare, on ne jette que l'irrécupérable).
  function normalize(raw){
    const d = { version: VERSION, expenses: [], incomes: [], categories: [], settings: sanitizeSettings(raw.settings), deleted: [], ui: isObj(raw.ui) ? clone(raw.ui) : {}, sync: sanitizeSync(raw.sync) };
    const seenCat = new Set();
    (Array.isArray(raw.categories) ? raw.categories : []).forEach((c, i) => {
      const s = sanitizeCategory(c, i);
      if (s && !seenCat.has(s.id)) { seenCat.add(s.id); d.categories.push(s); }
    });
    ensureDefaultCategories(d);
    const byId = new Map();
    (Array.isArray(raw.expenses) ? raw.expenses : []).forEach(x => {
      const s = sanitizeExpense(x);
      if (!s) return;
      const prev = byId.get(s.id);
      if (!prev || s.updatedAt > prev.updatedAt) byId.set(s.id, s);
    });
    d.expenses = Array.from(byId.values());
    fixCategoryIds(d);
    const incById = new Map();
    (Array.isArray(raw.incomes) ? raw.incomes : []).forEach(x => {
      const s = sanitizeIncome(x);
      if (!s) return;
      const prev = incById.get(s.id);
      if (!prev || s.updatedAt > prev.updatedAt) incById.set(s.id, s);
    });
    d.incomes = Array.from(incById.values());
    const tomb = new Map();
    (Array.isArray(raw.deleted) ? raw.deleted : []).forEach(t => {
      const s = sanitizeTombstone(t);
      if (!s) return;
      const prev = tomb.get(s.id);
      if (!prev || s.deletedAt > prev.deletedAt) tomb.set(s.id, s);
    });
    d.deleted = Array.from(tomb.values());
    return d;
  }

  // ─── Adaptateur fichier (Electron) ───
  function FileAdapter(){
    const fs = require("fs");
    const path = require("path");
    const ipc = require("electron").ipcRenderer;
    const dir = ipc.sendSync("get-data-dir");
    if (!dir) throw new Error("Dossier de données introuvable.");
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* le dossier existe peut-être déjà */ }
    const file = path.join(dir, FILE_NAME);
    const bak = path.join(dir, BAK_NAME);
    const tmp = file + ".tmp";
    let bakDone = false;
    return {
      kind: "file",
      path: file,
      // Renvoie null s'il n'y a pas encore de fichier ; lève une erreur s'il est illisible (jamais d'écrasement).
      async load(){
        if (!fs.existsSync(file)) return null;
        const txt = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
        if (!txt.trim()) throw new Error("Le fichier de données est vide.");
        return JSON.parse(txt);
      },
      // Partie synchrone : permet un flush fiable sur beforeunload.
      async save(obj){
        // Copie de secours une fois par session, avant la première écriture.
        if (!bakDone && fs.existsSync(file)) { fs.copyFileSync(file, bak); bakDone = true; }
        // Écriture atomique : fichier temporaire puis renommage.
        try {
          fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
          fs.renameSync(tmp, file);
        } catch (e) {
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) { /* ignoré */ }
          throw e;
        }
      },
      openFolder(){ return ipc.invoke("open-data-dir"); }
    };
  }

  // ─── Adaptateur localStorage (navigateur, PWA) ───
  function LocalAdapter(key){
    const k = key || LS_KEY;
    return {
      kind: "local",
      async load(){
        const raw = localStorage.getItem(k);
        if (raw == null) return null;
        return JSON.parse(raw);
      },
      async save(obj){ localStorage.setItem(k, JSON.stringify(obj)); }
    };
  }

  function isElectron(){
    return typeof process !== "undefined" && !!process.versions && !!process.versions.electron && typeof require === "function";
  }
  function createDefaultAdapter(){
    if (isElectron()) {
      try { return FileAdapter(); }
      catch (e) { toast("Impossible d'accéder au dossier de données : les données seront gardées dans le navigateur. (" + e.message + ")"); }
    }
    return LocalAdapter();
  }

  // ─── État interne ───
  let adapter = null;
  let data = emptyData();
  let initialized = false;
  let readOnly = false;      // vrai si la lecture a échoué : on n'écrase jamais le fichier existant
  let saveTimer = null;
  let saveFailed = false;
  let listening = false;

  // ─── Sauvegarde ───
  function persist(){
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!adapter || !initialized || readOnly) return Promise.resolve();
    let p;
    try { p = Promise.resolve(adapter.save(clone(data))); }
    catch (e) { p = Promise.reject(e); }
    return p.then(() => { saveFailed = false; }, e => {
      if (!saveFailed) toast("L'enregistrement a échoué : " + (e && e.message ? e.message : e));
      saveFailed = true;
    });
  }
  function scheduleSave(){
    if (!initialized || readOnly) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_DELAY);
  }
  function flush(){ return persist(); }
  function onLeave(){ if (saveTimer) persist(); }

  function changed(reason){
    scheduleSave();
    FIN.bus.emit("data:change", { reason });
  }

  function markDirty(){
    for (let i = 0; i < arguments.length; i++) if (arguments[i]) data.sync.dirty[arguments[i]] = 1;
  }

  // ─── Initialisation ───
  async function init(){
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    initialized = false;
    readOnly = false;
    saveFailed = false;
    if (!adapter) adapter = createDefaultAdapter();
    if (!listening && typeof window.addEventListener === "function") {
      listening = true;
      window.addEventListener("beforeunload", onLeave);
      window.addEventListener("pagehide", onLeave);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onLeave(); });
    }
    let raw = null, failure = null;
    try {
      raw = await adapter.load();
      if (raw != null) {
        if (!isObj(raw)) throw new Error("Format de données inattendu.");
        if (isNum(raw.version) && raw.version > VERSION) throw new Error("Ces données viennent d'une version plus récente de l'appli.");
      }
    } catch (e) {
      failure = e;
    }
    if (failure) {
      // On garde un état vide en mémoire mais on n'écrit RIEN : le fichier existant reste intact.
      readOnly = true;
      data = emptyData();
      initialized = true;
      toast("Impossible de lire les données enregistrées (" + (failure.message || failure) + "). Elles n'ont pas été modifiées et les nouveaux changements ne seront pas enregistrés. Une copie de secours (.bak.json) existe peut-être dans le même dossier.");
      return;
    }
    data = raw == null ? emptyData() : normalize(raw);
    initialized = true;
    // Premier lancement, ou nouvelles catégories par défaut / réparations : on enregistre.
    scheduleSave();
  }

  // ─── Dépenses ───
  function checkDate(v){
    if (!isValidKey(v)) throw new Error("Date invalide : utiliser le format AAAA-MM-JJ (par exemple 2026-10-24).");
    return v;
  }
  function checkAmount(v){
    const a = U.parseAmount(v);
    if (a === null) throw new Error("Montant invalide : il doit être un nombre supérieur à 0.");
    return a;
  }
  function checkCategoryId(id){
    return typeof id === "string" && data.categories.some(c => c.id === id) ? id : FALLBACK_CAT;
  }
  function checkNote(n){ return n == null ? "" : String(n).trim().slice(0, NOTE_MAX); }
  function findExpense(id){ return data.expenses.find(e => e.id === id) || null; }

  function getExpenses(filter){
    const f = filter || {};
    const from = toKey(f.from), to = toKey(f.to);
    const cat = f.categoryId || null;
    return data.expenses
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to) && (!cat || e.categoryId === cat))
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)
      .map(copy);
  }
  function getExpense(id){
    const e = findExpense(id);
    return e ? copy(e) : null;
  }
  function addExpense(input){
    const p = input || {};
    const now = Date.now();
    const e = {
      id: U.uid("e"),
      date: checkDate(p.date),
      amount: checkAmount(p.amount),
      categoryId: checkCategoryId(p.categoryId),
      note: checkNote(p.note),
      createdAt: now,
      updatedAt: now
    };
    data.expenses.push(e);
    markDirty(e.id);
    changed("expense:add");
    return copy(e);
  }
  function updateExpense(id, patch){
    const e = findExpense(id);
    if (!e) throw new Error("Dépense introuvable.");
    const p = patch || {};
    // Tout est validé avant d'appliquer quoi que ce soit.
    const next = {};
    if ("date" in p) next.date = checkDate(p.date);
    if ("amount" in p) next.amount = checkAmount(p.amount);
    if ("categoryId" in p) next.categoryId = checkCategoryId(p.categoryId);
    if ("note" in p) next.note = checkNote(p.note);
    Object.assign(e, next);
    e.updatedAt = stamp(e.updatedAt);
    markDirty(e.id);
    changed("expense:update");
    return copy(e);
  }
  function deleteExpense(id){
    const i = data.expenses.findIndex(e => e.id === id);
    if (i < 0) throw new Error("Dépense introuvable.");
    const e = data.expenses.splice(i, 1)[0];
    data.deleted = data.deleted.filter(t => t.id !== id);
    data.deleted.push({ id, type: "expense", deletedAt: stamp(e.updatedAt) });
    markDirty(id);
    changed("expense:delete");
    return copy(e);
  }
  function restoreExpense(expense){
    const s = sanitizeExpense(expense);
    if (!s || !isObj(expense) || typeof expense.id !== "string" || !expense.id) throw new Error("Dépense à restaurer invalide.");
    s.categoryId = checkCategoryId(s.categoryId);
    // updatedAt plus récent que le tombstone : la restauration l'emporte lors d'une future synchro.
    const tomb = data.deleted.find(t => t.id === s.id);
    s.updatedAt = stamp(Math.max(s.updatedAt, tomb ? tomb.deletedAt : 0));
    data.deleted = data.deleted.filter(t => t.id !== s.id);
    const i = data.expenses.findIndex(e => e.id === s.id);
    if (i >= 0) data.expenses[i] = s; else data.expenses.push(s);
    markDirty(s.id);
    changed("expense:restore");
    return copy(s);
  }

  // ─── Revenus ───
  function findIncome(id){ return data.incomes.find(i => i.id === id) || null; }

  function getIncomes(filter){
    const f = filter || {};
    const from = toKey(f.from), to = toKey(f.to);
    const kind = f.kind || null;
    return data.incomes
      .filter(i => (!from || i.date >= from) && (!to || i.date <= to) && (!kind || i.kind === kind))
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)
      .map(copy);
  }
  function getIncome(id){
    const i = findIncome(id);
    return i ? copy(i) : null;
  }
  function addIncome(input){
    const p = input || {};
    const now = Date.now();
    const kind = cleanKind(p.kind);
    const i = {
      id: U.uid("i"),
      date: checkDate(p.date),
      amount: checkAmount(p.amount),
      kind,
      label: cleanLabel(p.label, kind),
      createdAt: now,
      updatedAt: now
    };
    data.incomes.push(i);
    markDirty(i.id);
    changed("income:add");
    return copy(i);
  }
  function updateIncome(id, patch){
    const i = findIncome(id);
    if (!i) throw new Error("Revenu introuvable.");
    const p = patch || {};
    // Tout est validé avant d'appliquer quoi que ce soit.
    const next = {};
    if ("date" in p) next.date = checkDate(p.date);
    if ("amount" in p) next.amount = checkAmount(p.amount);
    if ("kind" in p) next.kind = cleanKind(p.kind);
    const kind = "kind" in next ? next.kind : i.kind;
    if ("label" in p) next.label = cleanLabel(p.label, kind);
    else if (kind !== i.kind && i.label === defaultLabel(i.kind)) next.label = defaultLabel(kind);
    Object.assign(i, next);
    i.updatedAt = stamp(i.updatedAt);
    markDirty(i.id);
    changed("income:update");
    return copy(i);
  }
  function deleteIncome(id){
    const k = data.incomes.findIndex(i => i.id === id);
    if (k < 0) throw new Error("Revenu introuvable.");
    const i = data.incomes.splice(k, 1)[0];
    data.deleted = data.deleted.filter(t => t.id !== id);
    data.deleted.push({ id, type: "income", deletedAt: stamp(i.updatedAt) });
    markDirty(id);
    changed("income:delete");
    return copy(i);
  }
  function restoreIncome(income){
    const s = sanitizeIncome(income);
    if (!s || !isObj(income) || typeof income.id !== "string" || !income.id) throw new Error("Revenu à restaurer invalide.");
    const tomb = data.deleted.find(t => t.id === s.id);
    s.updatedAt = stamp(Math.max(s.updatedAt, tomb ? tomb.deletedAt : 0));
    data.deleted = data.deleted.filter(t => t.id !== s.id);
    const k = data.incomes.findIndex(i => i.id === s.id);
    if (k >= 0) data.incomes[k] = s; else data.incomes.push(s);
    markDirty(s.id);
    changed("income:restore");
    return copy(s);
  }

  // Bilan d'un mois (month : 0 = janvier … 11 = décembre, comme FIN.util.monthRange).
  function monthBalance(year, month){
    const r = U.monthRange(year, month);
    const inMonth = x => x.date >= r.from && x.date <= r.to;
    const round2 = n => Math.round(n * 100) / 100;
    let salary = 0, other = 0, spent = 0;
    data.incomes.forEach(i => {
      if (!inMonth(i)) return;
      if (i.kind === "salary") salary += i.amount; else other += i.amount;
    });
    data.expenses.forEach(e => { if (inMonth(e)) spent += e.amount; });
    const income = round2(salary + other);
    spent = round2(spent);
    return {
      income,
      salary: round2(salary),
      other: round2(other),
      spent,
      remaining: round2(income - spent),
      ratio: income > 0 ? spent / income : null
    };
  }

  // ─── Catégories ───
  function findCategory(id){ return data.categories.find(c => c.id === id) || null; }
  function sortedCategories(){
    return data.categories.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr"));
  }
  function getCategories(opts){
    const inc = !!(opts && opts.includeArchived);
    return sortedCategories().filter(c => inc || !c.archived).map(copy);
  }
  function getCategory(id){
    const c = findCategory(id);
    return c ? copy(c) : null;
  }
  function cleanName(n){
    const s = typeof n === "string" ? n.trim() : "";
    if (!s) throw new Error("Le nom de la catégorie est obligatoire.");
    return s.slice(0, 40);
  }
  function cleanColor(c){
    if (!isColor(c)) throw new Error("Couleur invalide : utiliser le format #RRGGBB.");
    return c;
  }
  function addCategory(input){
    const p = input || {};
    const c = {
      id: U.uid("c"),
      name: cleanName(p.name),
      icon: typeof p.icon === "string" && p.icon.trim() ? p.icon.trim() : "•",
      color: p.color == null ? FALLBACK_COLOR : cleanColor(p.color),
      order: data.categories.reduce((m, x) => Math.max(m, x.order), -1) + 1,
      archived: false,
      updatedAt: Date.now()
    };
    data.categories.push(c);
    markDirty(c.id);
    changed("category:add");
    return copy(c);
  }
  function updateCategory(id, patch){
    const c = findCategory(id);
    if (!c) throw new Error("Catégorie introuvable.");
    const p = patch || {};
    const next = {};
    if ("name" in p) next.name = cleanName(p.name);
    if ("icon" in p) next.icon = typeof p.icon === "string" && p.icon.trim() ? p.icon.trim() : "•";
    if ("color" in p) next.color = cleanColor(p.color);
    Object.assign(c, next);
    c.updatedAt = stamp(c.updatedAt);
    markDirty(c.id);
    changed("category:update");
    return copy(c);
  }
  function setArchived(id, value){
    const c = findCategory(id);
    if (!c) throw new Error("Catégorie introuvable.");
    if (value && id === FALLBACK_CAT) throw new Error("La catégorie « Autre » ne peut pas être archivée.");
    if (c.archived !== value) {
      c.archived = value;
      c.updatedAt = stamp(c.updatedAt);
      markDirty(c.id);
      changed(value ? "category:archive" : "category:unarchive");
    }
    return copy(c);
  }
  function archiveCategory(id){ return setArchived(id, true); }
  function unarchiveCategory(id){ return setArchived(id, false); }
  // Les ids listés passent en premier dans cet ordre ; les autres (ex. archivées) suivent, ordre relatif conservé.
  function reorderCategories(ids){
    if (!Array.isArray(ids)) throw new Error("Liste de catégories invalide.");
    const seen = new Set();
    const first = [];
    ids.forEach(id => {
      const c = findCategory(id);
      if (c && !seen.has(id)) { seen.add(id); first.push(c); }
    });
    const rest = sortedCategories().filter(c => !seen.has(c.id));
    let moved = false;
    first.concat(rest).forEach((c, i) => {
      if (c.order !== i) { c.order = i; c.updatedAt = stamp(c.updatedAt); markDirty(c.id); moved = true; }
    });
    if (moved) changed("category:reorder");
    return getCategories({ includeArchived: true });
  }

  // ─── Réglages et état d'interface ───
  function getSettings(){ return copy(data.settings); }
  function setSettings(patch){
    const p = patch || {};
    const next = {};
    if ("weekStart" in p) {
      const w = Number(p.weekStart);
      if (p.weekStart === null || p.weekStart === "" || !Number.isInteger(w) || w < 0 || w > 6) throw new Error("Premier jour de la semaine invalide (0 à 6).");
      next.weekStart = w;
    }
    if ("currency" in p) {
      if (typeof p.currency !== "string" || !p.currency.trim()) throw new Error("Devise invalide.");
      next.currency = p.currency.trim();
    }
    if ("monthlyBudget" in p) {
      if (p.monthlyBudget === null || p.monthlyBudget === "") next.monthlyBudget = null;
      else {
        const b = U.parseAmount(p.monthlyBudget);
        if (b === null) throw new Error("Budget mensuel invalide : il doit être supérieur à 0.");
        next.monthlyBudget = b;
      }
    }
    Object.assign(data.settings, next);
    data.settings.updatedAt = stamp(data.settings.updatedAt);
    markDirty("settings");
    changed("settings");
    return copy(data.settings);
  }
  function getUI(){ return clone(data.ui); }
  // Persisté, mais n'émet PAS data:change (sinon l'appli se redessinerait en boucle).
  function setUI(patch){
    if (!isObj(patch)) throw new Error("État d'interface invalide.");
    Object.assign(data.ui, clone(patch));
    scheduleSave();
    return getUI();
  }

  // ─── Export ───
  // L'état de synchro (liste « à envoyer », jetons) n'est jamais exporté.
  function exportJSON(){
    const out = {};
    Object.keys(data).forEach(k => { if (k !== "sync") out[k] = data[k]; });
    return JSON.stringify(out, null, 2);
  }

  function csvField(v){
    const s = String(v == null ? "" : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCSV(){
    const rows = [];
    data.expenses.forEach(e => {
      const c = findCategory(e.categoryId);
      rows.push({ date: e.date, createdAt: e.createdAt, cells: ["Dépense", e.date, c ? c.name : "Sans catégorie", e.amount, e.note] });
    });
    data.incomes.forEach(i => {
      rows.push({ date: i.date, createdAt: i.createdAt, cells: ["Revenu", i.date, i.label, i.amount, ""] });
    });
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);
    const lines = ["Type;Date;Catégorie;Montant;Note"];
    rows.forEach(r => {
      const c = r.cells.slice();
      c[3] = c[3].toFixed(2).replace(".", ",");
      lines.push(c.map(csvField).join(";"));
    });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  // ─── Import ───
  // Lit et valide un fichier exporté. Lève une Error en français si la structure est incorrecte.
  function parseImport(text){
    if (typeof text !== "string" || !text.trim()) throw new Error("Fichier vide : rien à importer.");
    let raw;
    try { raw = JSON.parse(text.replace(/^﻿/, "")); }
    catch (e) { throw new Error("Fichier invalide : ce n'est pas un fichier JSON lisible."); }
    if (!isObj(raw)) throw new Error("Fichier invalide : ce n'est pas un export de l'appli Finances.");
    if (raw.version != null && !isNum(raw.version)) throw new Error("Fichier invalide : numéro de version incorrect.");
    if (isNum(raw.version) && raw.version > VERSION) throw new Error("Ce fichier a été créé par une version plus récente de l'appli : mettez l'appli à jour avant de l'importer.");
    if (!Array.isArray(raw.expenses)) throw new Error("Fichier invalide : la liste des dépenses est absente.");
    if (raw.incomes != null && !Array.isArray(raw.incomes)) throw new Error("Fichier invalide : la liste des revenus est incorrecte.");
    if (raw.categories != null && !Array.isArray(raw.categories)) throw new Error("Fichier invalide : la liste des catégories est incorrecte.");
    if (raw.deleted != null && !Array.isArray(raw.deleted)) throw new Error("Fichier invalide : la liste des suppressions est incorrecte.");
    if (raw.settings != null && !isObj(raw.settings)) throw new Error("Fichier invalide : les réglages sont incorrects.");

    const expenses = new Map();
    raw.expenses.forEach((x, i) => {
      const s = sanitizeExpense(x);
      if (!s) throw new Error("Fichier invalide : la dépense n° " + (i + 1) + " a une date ou un montant incorrect.");
      const prev = expenses.get(s.id);
      if (!prev || s.updatedAt > prev.updatedAt) expenses.set(s.id, s);
    });
    const incomes = new Map();
    (raw.incomes || []).forEach((x, i) => {
      const s = sanitizeIncome(x);
      if (!s) throw new Error("Fichier invalide : le revenu n° " + (i + 1) + " a une date ou un montant incorrect.");
      const prev = incomes.get(s.id);
      if (!prev || s.updatedAt > prev.updatedAt) incomes.set(s.id, s);
    });
    const categories = new Map();
    (raw.categories || []).forEach((c, i) => {
      const s = sanitizeCategory(c, i);
      if (!s) throw new Error("Fichier invalide : la catégorie n° " + (i + 1) + " est incorrecte.");
      if (!categories.has(s.id)) categories.set(s.id, s);
    });
    const deleted = new Map();
    (raw.deleted || []).forEach((t, i) => {
      const s = sanitizeTombstone(t);
      if (!s) throw new Error("Fichier invalide : la suppression n° " + (i + 1) + " est incorrecte.");
      const prev = deleted.get(s.id);
      if (!prev || s.deletedAt > prev.deletedAt) deleted.set(s.id, s);
    });
    return {
      expenses: Array.from(expenses.values()),
      incomes: Array.from(incomes.values()),
      categories: Array.from(categories.values()),
      deleted: Array.from(deleted.values()),
      settings: raw.settings ? sanitizeSettings(raw.settings) : null
    };
  }

  function importJSON(text, opts){
    const mode = opts && opts.mode ? opts.mode : "merge";
    if (mode !== "replace" && mode !== "merge") throw new Error("Mode d'import inconnu.");
    const inc = parseImport(text);
    const result = { added: 0, updated: 0, deleted: 0 };
    let d;

    if (mode === "replace") {
      d = {
        version: VERSION,
        expenses: inc.expenses,
        incomes: inc.incomes,
        categories: inc.categories,
        settings: inc.settings || sanitizeSettings(null),
        deleted: inc.deleted,
        ui: clone(data.ui),     // l'état d'interface reste propre à cet appareil
        sync: data.sync         // idem pour l'état de synchro (jamais écrasé par un import)
      };
      ensureDefaultCategories(d);
      fixCategoryIds(d);
      // Ce que le remplacement fait disparaître reçoit un tombstone, sinon la synchro le ferait revenir.
      const kept = new Set([].concat(d.expenses, d.incomes, d.categories).map(x => x.id));
      const now = Date.now();
      const gone = (list, type) => list.forEach(x => {
        if (kept.has(x.id) || d.deleted.some(t => t.id === x.id)) return;
        d.deleted.push({ id: x.id, type, deletedAt: Math.max(now, x.updatedAt + 1) });
      });
      gone(data.expenses, "expense");
      gone(data.incomes, "income");
      gone(data.categories.filter(c => !U.DEFAULT_CATEGORIES.some(def => def.id === c.id)), "category");
      result.added = d.expenses.length + d.incomes.length;
    } else {
      d = clone(data);
      // Catégories : par id, la plus récente gagne.
      inc.categories.forEach(c => {
        const local = d.categories.find(x => x.id === c.id);
        if (!local) {
          c.order = d.categories.reduce((m, x) => Math.max(m, x.order), -1) + 1;
          d.categories.push(c);
        } else if (c.updatedAt > local.updatedAt) {
          Object.assign(local, c);
        }
      });
      ensureDefaultCategories(d);

      const exp = new Map(d.expenses.map(e => [e.id, e]));
      const inm = new Map(d.incomes.map(i => [i.id, i]));
      const tomb = new Map(d.deleted.map(t => [t.id, t]));
      // Suppressions du fichier : elles s'appliquent si l'élément local n'a pas été modifié après.
      inc.deleted.forEach(t => {
        const loc = tomb.get(t.id);
        if (!loc || loc.deletedAt < t.deletedAt) tomb.set(t.id, t);
        [exp, inm].forEach(m => {
          const e = m.get(t.id);
          if (e && e.updatedAt <= t.deletedAt) { m.delete(t.id); result.deleted++; }
        });
      });
      // Dépenses et revenus : par id, le plus récent gagne ; un tombstone plus récent bloque la résurrection.
      const mergeItems = (map, list) => list.forEach(x => {
        const t = tomb.get(x.id);
        if (t && t.deletedAt >= x.updatedAt) return;
        if (t) tomb.delete(x.id);
        const e = map.get(x.id);
        if (!e) { map.set(x.id, x); result.added++; }
        else if (x.updatedAt > e.updatedAt) { map.set(x.id, x); result.updated++; }
      });
      mergeItems(exp, inc.expenses);
      mergeItems(inm, inc.incomes);
      d.expenses = Array.from(exp.values());
      d.incomes = Array.from(inm.values());
      d.deleted = Array.from(tomb.values());
      if (inc.settings && inc.settings.updatedAt > d.settings.updatedAt) d.settings = inc.settings;
      fixCategoryIds(d);
    }

    // Tout a réussi : on remplace d'un bloc (jamais d'état à moitié importé).
    const before = recordSignatures();
    data = d;
    const after = recordSignatures();
    Object.keys(after).forEach(id => { if (before[id] !== after[id]) markDirty(id); });
    Object.keys(before).forEach(id => { if (!(id in after)) markDirty(id); });
    changed("import:" + mode);
    return result;
  }

  // ─── Synchro cloud ───
  // Un « record » = { id, type, data, deleted, updated_at } ; les tombstones deviennent deleted:true, data:null.
  function buildRecords(){
    const out = [];
    data.categories.forEach(c => out.push({ id: c.id, type: "category", data: clone(c), deleted: false, updated_at: c.updatedAt }));
    out.push({ id: "settings", type: "settings", data: clone(data.settings), deleted: false, updated_at: data.settings.updatedAt });
    data.expenses.forEach(e => out.push({ id: e.id, type: "expense", data: clone(e), deleted: false, updated_at: e.updatedAt }));
    data.incomes.forEach(i => out.push({ id: i.id, type: "income", data: clone(i), deleted: false, updated_at: i.updatedAt }));
    data.deleted.forEach(t => out.push({ id: t.id, type: t.type, data: null, deleted: true, updated_at: t.deletedAt }));
    return out;
  }
  // Empreinte de chaque objet : sert à repérer ce qu'un import a réellement modifié.
  function recordSignatures(){
    const sig = {};
    buildRecords().forEach(r => { sig[r.id] = JSON.stringify([r.type, r.deleted, r.updated_at, r.data]); });
    return sig;
  }

  function syncRecords(opts){
    const dirtyOnly = !!(opts && opts.dirtyOnly);
    const all = buildRecords();
    return dirtyOnly ? all.filter(r => data.sync.dirty[r.id]) : all;
  }

  // Ne retire de la liste que ce qui n'a pas bougé depuis l'envoi (sinon une modif est arrivée entre-temps).
  function markSynced(records){
    if (!Array.isArray(records)) return;
    const cur = new Map(buildRecords().map(r => [r.id, r]));
    let n = 0;
    records.forEach(r => {
      if (!isObj(r) || !data.sync.dirty[r.id]) return;
      const c = cur.get(r.id);
      if (!c || (c.updated_at === r.updated_at && c.deleted === !!r.deleted)) { delete data.sync.dirty[r.id]; n++; }
    });
    if (n) scheduleSave();
  }
  function markAllDirty(){
    buildRecords().forEach(r => { data.sync.dirty[r.id] = 1; });
    scheduleSave();
  }

  // Fusion « le plus récent updated_at gagne ». Ne marque rien comme sale ; émet UNE fois data:change.
  function applyRemote(records){
    if (!Array.isArray(records)) return { applied: 0 };
    const maps = {
      expense: new Map(data.expenses.map(x => [x.id, x])),
      income: new Map(data.incomes.map(x => [x.id, x])),
      category: new Map(data.categories.map(x => [x.id, x]))
    };
    const tombs = new Map(data.deleted.map(t => [t.id, t]));
    let applied = 0;
    records.forEach(r => {
      if (!isObj(r) || typeof r.id !== "string" || !r.id || !isNum(r.updated_at)) return;
      const type = r.type;
      if (type !== "settings" && !Object.prototype.hasOwnProperty.call(maps, type)) return;
      if ((type === "settings") !== (r.id === "settings")) return;
      const remoteAt = r.updated_at;
      if (type === "settings") {
        if (r.deleted || !(remoteAt > data.settings.updatedAt)) return;
        if (!isObj(r.data)) return;
        const s = sanitizeSettings(r.data);
        s.updatedAt = remoteAt;
        data.settings = s;
        delete data.sync.dirty[r.id];
        applied++;
        return;
      }
      const map = maps[type];
      const local = map.get(r.id), tomb = tombs.get(r.id);
      const localAt = Math.max(local ? local.updatedAt : -1, tomb ? tomb.deletedAt : -1);
      if (!(remoteAt > localAt)) return;
      if (r.deleted) {
        if (type === "category" && U.DEFAULT_CATEGORIES.some(def => def.id === r.id)) return;   // les catégories par défaut ne disparaissent jamais
        map.delete(r.id);
        tombs.set(r.id, { id: r.id, type, deletedAt: remoteAt });
      } else {
        if (!isObj(r.data)) return;
        const raw = Object.assign({}, r.data, { id: r.id });
        let s = null;
        if (type === "expense") s = sanitizeExpense(raw);
        else if (type === "income") s = sanitizeIncome(raw);
        else s = sanitizeCategory(raw, 0);
        if (!s) return;
        s.updatedAt = remoteAt;
        map.set(r.id, s);
        tombs.delete(r.id);
      }
      delete data.sync.dirty[r.id];
      applied++;
    });
    if (!applied) return { applied: 0 };
    data.expenses = Array.from(maps.expense.values());
    data.incomes = Array.from(maps.income.values());
    data.categories = Array.from(maps.category.values());
    data.deleted = Array.from(tombs.values());
    ensureDefaultCategories(data);
    // Pas de fixCategoryIds global : une catégorie peut arriver dans la page suivante du même
    // tirage ; d'ici là l'interface affiche « Sans catégorie » sans perdre la référence.
    // Seules les catégories réellement supprimées dans ce lot renvoient leurs dépenses vers « other ».
    const gone = new Set(records.filter(r => r && r.type === "category" && r.deleted && !maps.category.has(r.id)).map(r => r.id));
    if (gone.size) data.expenses.forEach(e => { if (gone.has(e.categoryId)) e.categoryId = FALLBACK_CAT; });
    changed("sync");
    return { applied };
  }

  function getSyncState(){ return clone(data.sync.state); }
  function setSyncState(patch){
    if (!isObj(patch)) throw new Error("État de synchro invalide.");
    const st = data.sync.state;
    ["cursor", "session", "email", "lastSyncAt"].forEach(k => { if (k in patch) st[k] = patch[k] == null ? null : clone(patch[k]); });
    scheduleSave();
    return getSyncState();
  }

  // ─── Infos stockage ───
  function storageInfo(){
    const a = adapter || { kind: "local" };
    const info = { kind: a.kind };
    if (a.path) info.path = a.path;
    return info;
  }
  function openDataFolder(){
    if (adapter && typeof adapter.openFolder === "function") {
      try {
        const r = adapter.openFolder();
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch (e) { /* sans effet hors Electron */ }
    }
  }

  function setAdapter(a){
    if (!a || typeof a.load !== "function" || typeof a.save !== "function") throw new Error("Adaptateur de stockage invalide.");
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    adapter = a;
  }

  // ─── API publique ───
  FIN.store = {
    init, flush, setAdapter,
    getExpenses, getExpense, addExpense, updateExpense, deleteExpense, restoreExpense,
    getIncomes, getIncome, addIncome, updateIncome, deleteIncome, restoreIncome, monthBalance,
    getCategories, getCategory, addCategory, updateCategory, archiveCategory, unarchiveCategory, reorderCategories,
    getSettings, setSettings, getUI, setUI,
    exportJSON, importJSON, exportCSV,
    syncRecords, markSynced, markAllDirty, applyRemote, getSyncState, setSyncState,
    storageInfo, openDataFolder,
    FileAdapter, LocalAdapter
  };
  Object.defineProperty(FIN.store, "_adapter", { get(){ return adapter; }, enumerable: true });
})();
