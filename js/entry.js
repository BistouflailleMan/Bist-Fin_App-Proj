// ═══════════ Appli Finance — Saisie (formulaire, liste du jour, feuille, catégories) ═══════════
// Propriétaire : Agent 2. Voir CONTRAT.md.
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};
  const U = FIN.util;
  const esc = U.esc;
  const $ = id => document.getElementById(id);
  const S = () => FIN.store;

  let inited = false;
  let currentKey = U.todayKey();      // jour affiché (vue Jour)
  let inlineForm = null;              // formulaire de #entry-panel
  let sheetForm = null;               // formulaire de #sheet-entry
  let sheetPrevFocus = null;
  let catsPrevFocus = null;
  let firstFocusDone = false;

  // ─── Utilitaires ───
  function isDesktop(){
    try {
      const coarse = window.matchMedia("(pointer:coarse)").matches;
      const narrow = window.matchMedia("(max-width:700px)").matches;
      return !coarse && !narrow;
    } catch (e) { return true; }
  }
  function toast(text, undo){ FIN.bus.emit("toast", undo ? { text, undo } : { text }); }
  function safeColor(c){ return /^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : "#7E92A6"; }
  function catStyle(c){
    const col = safeColor(c && c.color);
    return "--c:" + col + ";--cbg:" + col + "1f;--cbg2:" + col + "40";
  }
  // Choix proposés à la création rapide d'une catégorie
  const NEW_ICONS = ["🧾", "🏛️", "🗑️", "💡", "💧", "📱", "🚗", "✈️", "👕", "🐶", "👶", "🎓", "🔧", "🏋️", "💇", "🍷", "☕", "🎮"];
  const NEW_COLORS = ["#E05D5D", "#F08A80", "#F2A65A", "#DFC65C", "#A8D65C", "#6FD5A3", "#5CDFD0", "#5AB8F2",
    "#8CA6F2", "#B48CF2", "#F28CC6", "#C6A07A", "#9AA8B6", "#E7EEF4"];
  function unknownCat(){ return { id: "?", name: "Sans catégorie", icon: "•", color: "#7E92A6" }; }
  function amountToInput(n){
    const v = Number(n) || 0;
    return (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace(".", ",");
  }
  function toKey(d){
    if (d instanceof Date) return U.dayKey(d);
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return null;
  }

  // ─── Formulaire (réutilisé : panneau inline + feuille) ───
  // o = { prefix, expense?, dateKey, submitLabel, onSaved(exp, created), onDelete?, onCancel? }
  function createForm(root, o){
    const f = {
      root, o,
      editing: o.expense || null,
      catId: o.expense ? o.expense.categoryId : null,
      sig: "",
      stateKey: null
    };
    const p = o.prefix;
    const editing = !!f.editing;

    let actions = '<button type="submit" class="btn btn-primary en-submit">' + esc(o.submitLabel) + '</button>';
    if (o.onCancel) actions += '<button type="button" class="btn en-cancel" data-act="cancel">Annuler</button>';
    if (editing && o.onDelete) actions += '<button type="button" class="btn btn-danger en-delete" data-act="delete">Supprimer</button>';

    root.innerHTML =
      '<form class="en-form" novalidate autocomplete="off">' +
        '<label class="en-lbl" for="' + p + 'amount">Montant</label>' +
        '<div class="en-amount">' +
          '<input id="' + p + 'amount" class="en-amount-in" type="text" inputmode="decimal" autocomplete="off" ' +
            'placeholder="0,00" aria-describedby="' + p + 'err">' +
          '<span class="en-eur" aria-hidden="true">€</span>' +
        '</div>' +
        '<div class="en-err" id="' + p + 'err" role="alert"></div>' +
        '<div class="en-cat-h"><span class="en-lbl" id="' + p + 'catlbl">Catégorie</span>' +
          '<button type="button" class="en-manage" data-act="manage">Gérer les catégories</button></div>' +
        '<div class="en-cats" role="radiogroup" aria-labelledby="' + p + 'catlbl"></div>' +
        '<div class="en-newcat" hidden></div>' +
        '<div class="en-fields">' +
          '<div class="field en-f-note"><label for="' + p + 'note">Note (optionnel)</label>' +
            '<input id="' + p + 'note" class="en-note-in" type="text" maxlength="120" placeholder="Boulangerie, ticket resto…"></div>' +
          '<div class="field en-f-date"><label for="' + p + 'date">Date</label>' +
            '<input id="' + p + 'date" class="en-date-in" type="date"></div>' +
        '</div>' +
        '<div class="en-actions">' + actions + '</div>' +
      '</form>';

    const form = root.querySelector("form");
    const amountIn = root.querySelector(".en-amount-in");
    const noteIn = root.querySelector(".en-note-in");
    const dateIn = root.querySelector(".en-date-in");
    const catsEl = root.querySelector(".en-cats");
    const newEl = root.querySelector(".en-newcat");
    const errEl = root.querySelector(".en-err");
    const amountWrap = root.querySelector(".en-amount");

    if (editing) {
      amountIn.value = amountToInput(f.editing.amount);
      noteIn.value = f.editing.note || "";
      dateIn.value = f.editing.date;
    } else {
      dateIn.value = o.dateKey || U.todayKey();
    }

    function setErr(msg, field){
      errEl.textContent = msg || "";
      amountWrap.classList.toggle("en-bad", !!msg && field === amountIn);
      dateIn.classList.toggle("en-bad", !!msg && field === dateIn);
      if (msg && field) field.focus();
    }

    function chipCats(){
      const list = S().getCategories().slice();
      const ed = f.editing && f.editing.categoryId;
      if (ed && !list.some(c => c.id === ed)) {
        const c = S().getCategory(ed);
        if (c) list.push(c);
      }
      return list;
    }

    function defaultCat(list){
      let last = null;
      try { last = (S().getUI() || {}).lastCategoryId; } catch (e) { /* ignore */ }
      if (last && list.some(c => c.id === last)) return last;
      return list.length ? list[0].id : null;
    }

    function renderChips(){
      const list = chipCats();
      if (!f.catId || !list.some(c => c.id === f.catId)) f.catId = defaultCat(list);
      f.sig = list.map(c => [c.id, c.name, c.icon, c.color, c.archived ? 1 : 0].join("|")).join("~");
      const newChip = '<button type="button" class="en-chip en-chip-new" data-new="1" aria-label="Créer une nouvelle catégorie">' +
        '<span class="en-chip-ico" aria-hidden="true">＋</span><span class="en-chip-name">Nouvelle</span></button>';
      if (!list.length) {
        catsEl.innerHTML = '<div class="en-nocat">Aucune catégorie active — créez-en une.</div>' + newChip;
        return;
      }
      catsEl.innerHTML = list.map((c, i) =>
        '<button type="button" class="en-chip' + (c.id === f.catId ? ' is-on' : '') + '" role="radio" ' +
          'aria-checked="' + (c.id === f.catId ? 'true' : 'false') + '" data-id="' + esc(c.id) + '" ' +
          'style="' + catStyle(c) + '"' + (c.archived ? ' title="Catégorie archivée"' : '') + '>' +
          '<span class="en-chip-ico" aria-hidden="true">' + esc(c.icon || "•") + '</span>' +
          '<span class="en-chip-name">' + esc(c.name) + '</span>' +
          (i < 9 ? '<span class="en-key" aria-hidden="true">' + (i + 1) + '</span>' : '') +
        '</button>'
      ).join("") + newChip;
    }

    // ─── Création rapide d'une catégorie, sans quitter la saisie ───
    function openNewCat(){
      const col = NEW_COLORS[S().getCategories({ includeArchived: true }).length % NEW_COLORS.length];
      newEl.innerHTML =
        '<div class="en-nc-h"><span class="en-lbl">Nouvelle catégorie</span>' +
          '<span class="en-chip en-nc-preview" aria-hidden="true"><span class="en-chip-ico">🧾</span><span class="en-chip-name">Aperçu</span></span></div>' +
        '<input class="en-nc-name" type="text" maxlength="40" placeholder="Ex. Impôts, Poubelles, Animaux…" aria-label="Nom de la catégorie">' +
        '<div class="en-nc-lbl">Icône</div>' +
        '<div class="en-nc-icons">' +
          NEW_ICONS.map(ic => '<button type="button" class="en-nc-ico" data-ico="' + esc(ic) + '">' + esc(ic) + '</button>').join("") +
          '<input class="en-nc-ico-in" type="text" maxlength="8" placeholder="autre" aria-label="Autre icône (emoji)">' +
        '</div>' +
        '<div class="en-nc-lbl">Couleur</div>' +
        '<div class="en-nc-colors">' +
          NEW_COLORS.map(c => '<button type="button" class="en-nc-col" data-col="' + c + '" style="--c:' + c + '" aria-label="Couleur ' + c + '"></button>').join("") +
          '<label class="en-nc-custom" title="Couleur personnalisée"><input class="en-nc-col-in" type="color" value="' + col + '" aria-label="Couleur personnalisée">🎨</label>' +
        '</div>' +
        '<div class="en-err en-nc-err" role="alert"></div>' +
        '<div class="en-nc-actions">' +
          '<button type="button" class="btn btn-primary" data-nc="create">Créer et sélectionner</button>' +
          '<button type="button" class="btn" data-nc="cancel">Annuler</button>' +
        '</div>';
      nc.icon = "🧾"; nc.color = col;
      newEl.hidden = false;
      syncNewCat();
      newEl.querySelector(".en-nc-name").focus();
    }
    function closeNewCat(){ newEl.hidden = true; newEl.innerHTML = ""; }
    function syncNewCat(){
      const name = newEl.querySelector(".en-nc-name").value.trim();
      const pv = newEl.querySelector(".en-nc-preview");
      pv.setAttribute("style", catStyle({ color: nc.color }));
      pv.querySelector(".en-chip-ico").textContent = nc.icon;
      pv.querySelector(".en-chip-name").textContent = name || "Aperçu";
      newEl.querySelectorAll(".en-nc-ico").forEach(b => b.classList.toggle("is-on", b.getAttribute("data-ico") === nc.icon));
      newEl.querySelectorAll(".en-nc-col").forEach(b => b.classList.toggle("is-on", b.getAttribute("data-col").toLowerCase() === nc.color.toLowerCase()));
    }
    function createNewCat(){
      const nameIn = newEl.querySelector(".en-nc-name");
      const errNc = newEl.querySelector(".en-nc-err");
      const name = nameIn.value.trim();
      if (!name) { errNc.textContent = "Donnez un nom à la catégorie."; nameIn.focus(); return; }
      const dup = S().getCategories({ includeArchived: true }).find(c => c.name.toLowerCase() === name.toLowerCase());
      if (dup) {
        if (dup.archived) S().unarchiveCategory(dup.id);
        f.catId = dup.id; closeNewCat(); renderChips(); f.focusAmount();
        toast("« " + dup.name + " » existait déjà : sélectionnée");
        return;
      }
      let c;
      try { c = S().addCategory({ name, icon: nc.icon, color: nc.color }); }
      catch (e) { errNc.textContent = (e && e.message) || "Création impossible."; return; }
      f.catId = c.id;
      try { S().setUI({ lastCategoryId: c.id }); } catch (e) { /* ignore */ }
      closeNewCat();
      renderChips();
      f.focusAmount();
      toast("Catégorie « " + c.name + " » créée");
    }
    const nc = { icon: "🧾", color: NEW_COLORS[0] };
    newEl.addEventListener("click", e => {
      const ico = e.target.closest(".en-nc-ico");
      const col = e.target.closest(".en-nc-col");
      const act = e.target.closest("[data-nc]");
      if (ico) { nc.icon = ico.getAttribute("data-ico"); newEl.querySelector(".en-nc-ico-in").value = ""; syncNewCat(); }
      else if (col) { nc.color = col.getAttribute("data-col"); newEl.querySelector(".en-nc-col-in").value = nc.color; syncNewCat(); }
      else if (act && act.getAttribute("data-nc") === "create") createNewCat();
      else if (act) closeNewCat();
    });
    newEl.addEventListener("input", e => {
      if (e.target.classList.contains("en-nc-ico-in")) {
        const v = Array.from(e.target.value.trim()).slice(0, 2).join("");
        nc.icon = v || "🧾";
      } else if (e.target.classList.contains("en-nc-col-in")) {
        nc.color = e.target.value;
      } else if (e.target.classList.contains("en-nc-name")) {
        newEl.querySelector(".en-nc-err").textContent = "";
      }
      syncNewCat();
    });
    newEl.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); createNewCat(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNewCat(); }
    });

    function setCat(id){
      f.catId = id;
      catsEl.querySelectorAll(".en-chip").forEach(b => {
        const on = b.getAttribute("data-id") === id;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
      setErr("");
    }

    f.refreshCats = function(){
      let list;
      try { list = chipCats(); } catch (e) { return; }
      const sig = list.map(c => [c.id, c.name, c.icon, c.color, c.archived ? 1 : 0].join("|")).join("~");
      if (sig !== f.sig) renderChips();
    };

    f.syncDate = function(key){
      if (key === f.stateKey) return;
      f.stateKey = key;
      dateIn.value = key;
      const hint = root.parentNode && root.parentNode.querySelector ? root.parentNode.querySelector(".en-day-hint") : null;
      if (hint) hint.textContent = U.fmtDayLong(U.parseKey(key));
    };

    f.focusAmount = function(){ amountIn.focus(); try { amountIn.select(); } catch (e) { /* ignore */ } };

    f.submit = function(){
      const raw = amountIn.value.trim();
      if (!raw) return setErr("Saisissez un montant.", amountIn);
      const amount = U.parseAmount(raw);
      if (amount == null) return setErr("Montant invalide — exemple : 12,50 (supérieur à 0).", amountIn);
      if (!f.catId) return setErr("Choisissez une catégorie.", null);
      const date = dateIn.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Choisissez une date valide.", dateIn);
      const note = noteIn.value.trim();
      setErr("");
      const cat = S().getCategory(f.catId) || unknownCat();
      let exp;
      try {
        if (editing) {
          exp = S().updateExpense(f.editing.id, { date, amount, categoryId: f.catId, note });
          toast(U.fmtEUR(amount) + " · " + cat.name + " modifié");
        } else {
          exp = S().addExpense({ date, amount, categoryId: f.catId, note });
          toast(U.fmtEUR(amount) + " · " + cat.name + " ajouté");
        }
        try { S().setUI({ lastCategoryId: f.catId }); } catch (e) { /* ignore */ }
      } catch (e) {
        return setErr((e && e.message) || "Enregistrement impossible.", null);
      }
      if (!editing) {
        amountIn.value = "";
        noteIn.value = "";
        dateIn.value = f.stateKey || o.dateKey || U.todayKey();
      }
      if (o.onSaved) o.onSaved(exp, !editing);
    };

    // Événements
    form.addEventListener("submit", e => { e.preventDefault(); f.submit(); });
    amountIn.addEventListener("input", () => {
      // Chiffres et un seul séparateur décimal (, ou .)
      const clean = amountIn.value.replace(/[^\d.,]/g, "").replace(/([.,].*)[.,]/g, "$1");
      if (clean !== amountIn.value) amountIn.value = clean;
      if (errEl.textContent) setErr("");
    });
    catsEl.addEventListener("click", e => {
      const b = e.target.closest(".en-chip");
      if (!b) return;
      if (b.hasAttribute("data-new")) { if (newEl.hidden) openNewCat(); else closeNewCat(); }
      else setCat(b.getAttribute("data-id"));
    });
    // Raccourcis 1-9 : uniquement quand le focus est sur la grille ou le bouton (jamais dans un champ)
    form.addEventListener("keydown", e => {
      const t = e.target;
      const onChip = t.closest && t.closest(".en-chip");
      const onSubmit = t.classList && t.classList.contains("en-submit");
      if (!onChip && !onSubmit) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        const chips = catsEl.querySelectorAll(".en-chip[data-id]");
        const c = chips[Number(e.key) - 1];
        if (c) { e.preventDefault(); setCat(c.getAttribute("data-id")); c.focus(); }
      } else if (e.key === "Enter" && onChip) {
        e.preventDefault();
        if (onChip.hasAttribute("data-new")) { openNewCat(); return; }
        setCat(onChip.getAttribute("data-id"));
        f.submit();
      }
    });
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.getAttribute("data-act");
      if (act === "manage") FIN.bus.emit("categories:open");
      else if (act === "cancel" && o.onCancel) o.onCancel();
      else if (act === "delete" && o.onDelete) o.onDelete(f.editing);
    });

    renderChips();
    return f;
  }

  // ─── Panneau inline (vue Jour) ───
  function ensureInline(){
    const host = $("entry-panel");
    if (!host) return null;
    if (inlineForm && host.contains(inlineForm.root)) return inlineForm;
    host.innerHTML =
      '<div class="panel-h"><span>Nouvelle dépense</span><span class="en-day-hint"></span></div>' +
      '<div class="panel-b en-body"></div>';
    inlineForm = createForm(host.querySelector(".en-body"), {
      prefix: "en-i-",
      dateKey: currentKey,
      submitLabel: "Ajouter la dépense",
      onSaved: () => { if (isDesktop()) inlineForm.focusAmount(); }
    });
    return inlineForm;
  }

  // ─── Liste des dépenses du jour ───
  function renderList(){
    const host = $("day-list");
    if (!host || !S()) return;
    const key = currentKey;
    const exps = S().getExpenses({ from: key, to: key });
    const total = Math.round(exps.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const head =
      '<div class="panel-h"><span>Dépenses du jour' + (exps.length ? ' · ' + exps.length : '') + '</span>' +
      '<span class="en-total num">' + esc(U.fmtEUR(total)) + '</span></div>';
    let body;
    if (!exps.length) {
      body = '<div class="panel-b en-empty"><div class="en-empty-ico" aria-hidden="true">🧾</div>' +
        '<p>Aucune dépense ce jour — ajoutez-en une ci-dessus</p></div>';
    } else {
      body = '<div class="en-list">' + exps.map(e => {
        const c = S().getCategory(e.categoryId) || unknownCat();
        const label = c.name + (e.note ? " — " + e.note : "") + ", " + U.fmtEUR(e.amount);
        return '<div class="en-item" role="button" tabindex="0" data-id="' + esc(e.id) + '" aria-label="Modifier : ' + esc(label) + '">' +
          '<span class="en-dot" style="' + catStyle(c) + '" aria-hidden="true">' + esc(c.icon || "•") + '</span>' +
          '<span class="en-info"><span class="en-cat">' + esc(c.name) + '</span>' +
            (e.note ? '<span class="en-inote">' + esc(e.note) + '</span>' : '') + '</span>' +
          '<span class="en-amt num">' + esc(U.fmtEUR(e.amount)) + '</span>' +
          '<button type="button" class="en-del" data-del="1" aria-label="Supprimer cette dépense">✕</button>' +
        '</div>';
      }).join("") + '</div>';
    }
    host.innerHTML = head + body;
  }

  function removeExpense(id){
    let exp;
    try { exp = S().deleteExpense(id); }
    catch (e) { toast("Suppression impossible"); return null; }
    toast("Dépense supprimée", () => S().restoreExpense(exp));
    return exp;
  }

  function editById(id){
    const exp = S().getExpense ? S().getExpense(id) : S().getExpenses({}).find(e => e.id === id);
    if (exp) openSheet({ expense: exp });
  }

  function bindList(){
    const host = $("day-list");
    if (!host) return;
    host.addEventListener("click", e => {
      const row = e.target.closest(".en-item");
      if (!row) return;
      const id = row.getAttribute("data-id");
      if (e.target.closest("[data-del]")) removeExpense(id);
      else editById(id);
    });
    host.addEventListener("keydown", e => {
      const row = e.target.classList && e.target.classList.contains("en-item") ? e.target : null;
      if (!row) return;
      const id = row.getAttribute("data-id");
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editById(id); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeExpense(id); }
    });
  }

  // ─── Feuille de saisie ───
  function openSheet(opts){
    opts = opts || {};
    const el = $("sheet-entry");
    if (!el || !S()) return;
    let exp = opts.expense || null;
    if (exp && S().getExpense) exp = S().getExpense(exp.id) || exp;
    const key = exp ? exp.date : (toKey(opts.date) || currentKey);
    if (!sheetPrevFocus || el.hidden) sheetPrevFocus = document.activeElement;
    el.innerHTML =
      '<div class="sheet-box en-sheet-box" role="dialog" aria-modal="true" aria-label="' + (exp ? 'Modifier la dépense' : 'Nouvelle dépense') + '">' +
        '<div class="en-sheet-h"><span class="eyebrow">' + (exp ? 'Modifier la dépense' : 'Nouvelle dépense') + '</span>' +
          '<button type="button" class="btn btn-icon en-x" data-close="1" aria-label="Fermer">✕</button></div>' +
        '<div class="en-sheet-b"></div>' +
      '</div>';
    el.hidden = false;
    sheetForm = createForm(el.querySelector(".en-sheet-b"), {
      prefix: "en-s-",
      expense: exp,
      dateKey: key,
      submitLabel: exp ? "Enregistrer" : "Ajouter la dépense",
      onSaved: () => closeSheet(),
      onCancel: () => closeSheet(),
      onDelete: x => { removeExpense(x.id); closeSheet(); }
    });
    sheetForm.stateKey = key;
    setTimeout(() => { if (sheetForm) sheetForm.focusAmount(); }, 30);
  }

  function closeSheet(){
    const el = $("sheet-entry");
    if (!el || el.hidden) return;
    el.hidden = true;
    el.innerHTML = "";
    sheetForm = null;
    const prev = sheetPrevFocus;
    sheetPrevFocus = null;
    if (prev && prev.focus && document.body.contains(prev) && isDesktop()) {
      try { prev.focus(); } catch (e) { /* ignore */ }
    }
  }

  function bindSheet(){
    const el = $("sheet-entry");
    if (!el) return;
    let downOnBackdrop = false;
    el.addEventListener("mousedown", e => { downOnBackdrop = (e.target === el); });
    el.addEventListener("click", e => {
      if (e.target === el && downOnBackdrop) closeSheet();
      else if (e.target.closest("[data-close]")) closeSheet();
    });
  }

  // ─── Gestion des catégories ───
  const PALETTE = ["#F2A65A", "#6FD5A3", "#5AB8F2", "#B48CF2", "#F28CC6", "#DFC65C", "#5CDFD0", "#F08A80"];

  function openCats(){
    const el = $("modal-categories");
    if (!el || !S()) return;
    if (el.hidden) catsPrevFocus = document.activeElement;
    const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    el.innerHTML =
      '<div class="modal-box en-cmodal" role="dialog" aria-modal="true" aria-label="Catégories">' +
        '<div class="en-sheet-h"><span class="eyebrow">Catégories</span>' +
          '<button type="button" class="btn btn-icon en-x" data-close="1" aria-label="Fermer">✕</button></div>' +
        '<div class="en-clist-wrap"></div>' +
        '<form class="en-cadd" autocomplete="off">' +
          '<div class="en-lbl">Nouvelle catégorie</div>' +
          '<div class="en-cadd-row">' +
            '<input class="en-cico en-add-ico" type="text" maxlength="8" placeholder="🙂" value="•" aria-label="Icône (emoji)">' +
            '<input class="en-ccol en-add-col" type="color" value="' + col + '" aria-label="Couleur">' +
            '<input class="en-cname en-add-name" type="text" maxlength="40" placeholder="Nom de la catégorie" aria-label="Nom">' +
            '<button type="submit" class="btn btn-primary">Ajouter</button>' +
          '</div>' +
          '<div class="en-err en-cerr" role="alert"></div>' +
        '</form>' +
        '<div class="en-cfoot"><button type="button" class="btn" data-close="1">Fermer</button></div>' +
      '</div>';
    el.hidden = false;
    renderCats();
  }

  function closeCats(){
    const el = $("modal-categories");
    if (!el || el.hidden) return;
    el.hidden = true;
    el.innerHTML = "";
    const prev = catsPrevFocus;
    catsPrevFocus = null;
    if (prev && prev.focus && document.body.contains(prev) && isDesktop()) {
      try { prev.focus(); } catch (e) { /* ignore */ }
    }
  }

  function catRow(c, i, n, archived){
    const col = safeColor(c.color);
    return '<li class="en-crow' + (archived ? ' en-arch' : '') + '" data-id="' + esc(c.id) + '">' +
      (archived ? '<span class="en-cmove"></span>' :
        '<span class="en-cmove">' +
          '<button type="button" class="en-mv" data-act="up" aria-label="Monter"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button type="button" class="en-mv" data-act="down" aria-label="Descendre"' + (i === n - 1 ? ' disabled' : '') + '>▼</button>' +
        '</span>') +
      '<input class="en-cico" data-f="icon" type="text" maxlength="8" value="' + esc(c.icon || "•") + '" aria-label="Icône de ' + esc(c.name) + '">' +
      '<input class="en-ccol" data-f="color" type="color" value="' + esc(col) + '" aria-label="Couleur de ' + esc(c.name) + '">' +
      '<input class="en-cname" data-f="name" type="text" maxlength="40" value="' + esc(c.name) + '" aria-label="Nom">' +
      (archived
        ? '<button type="button" class="btn en-carch" data-act="unarchive">Réactiver</button>'
        : '<button type="button" class="btn en-carch" data-act="archive">Archiver</button>') +
    '</li>';
  }

  function renderCats(focusSel){
    const wrap = document.querySelector("#modal-categories .en-clist-wrap");
    if (!wrap) return;
    const all = S().getCategories({ includeArchived: true });
    const act = all.filter(c => !c.archived);
    const arch = all.filter(c => c.archived);
    wrap.innerHTML =
      '<ul class="en-clist">' + act.map((c, i) => catRow(c, i, act.length, false)).join("") + '</ul>' +
      (arch.length
        ? '<div class="en-lbl en-arch-h">Archivées (leurs dépenses restent visibles)</div>' +
          '<ul class="en-clist">' + arch.map(c => catRow(c, 0, 0, true)).join("") + '</ul>'
        : '');
    if (focusSel) {
      const t = wrap.querySelector(focusSel);
      if (t && !t.disabled) t.focus();
    }
  }

  function setCerr(msg){
    const e = document.querySelector("#modal-categories .en-cerr");
    if (e) e.textContent = msg || "";
  }

  function moveCat(id, dir){
    const all = S().getCategories({ includeArchived: true });
    const act = all.filter(c => !c.archived).map(c => c.id);
    const arch = all.filter(c => c.archived).map(c => c.id);
    const i = act.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= act.length) return;
    const t = act[i]; act[i] = act[j]; act[j] = t;
    S().reorderCategories(act.concat(arch));
    renderCats('[data-id="' + id + '"] [data-act="' + (dir < 0 ? "up" : "down") + '"]');
    if (!document.querySelector('#modal-categories [data-id="' + id + '"] [data-act="' + (dir < 0 ? "up" : "down") + '"]:not([disabled])')) {
      const other = document.querySelector('#modal-categories [data-id="' + id + '"] [data-act="' + (dir < 0 ? "down" : "up") + '"]');
      if (other) other.focus();
    }
  }

  function addCat(){
    const root = $("modal-categories");
    const nameIn = root.querySelector(".en-add-name");
    const icoIn = root.querySelector(".en-add-ico");
    const colIn = root.querySelector(".en-add-col");
    const name = nameIn.value.trim();
    if (!name) { setCerr("Donnez un nom à la catégorie."); nameIn.focus(); return; }
    const icon = Array.from(icoIn.value.trim()).slice(0, 2).join("") || "•";
    try { S().addCategory({ name, icon, color: colIn.value }); }
    catch (e) { setCerr((e && e.message) || "Ajout impossible."); return; }
    setCerr("");
    nameIn.value = "";
    icoIn.value = "•";
    colIn.value = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    renderCats();
    nameIn.focus();
  }

  function bindCats(){
    const el = $("modal-categories");
    if (!el) return;
    let downOnBackdrop = false;
    el.addEventListener("mousedown", e => { downOnBackdrop = (e.target === el); });
    el.addEventListener("click", e => {
      if (e.target === el && downOnBackdrop) return closeCats();
      if (e.target.closest("[data-close]")) return closeCats();
      const b = e.target.closest("[data-act]");
      const row = e.target.closest(".en-crow");
      if (!b || !row) return;
      const id = row.getAttribute("data-id");
      const act = b.getAttribute("data-act");
      setCerr("");
      try {
        if (act === "up") moveCat(id, -1);
        else if (act === "down") moveCat(id, 1);
        else if (act === "archive") {
          if (S().getCategories().length <= 1) { setCerr("Gardez au moins une catégorie active."); return; }
          S().archiveCategory(id);
          renderCats();
        } else if (act === "unarchive") {
          S().unarchiveCategory(id);
          renderCats();
        }
      } catch (err) { setCerr((err && err.message) || "Action impossible."); }
    });
    el.addEventListener("change", e => {
      const inp = e.target.closest("[data-f]");
      const row = e.target.closest(".en-crow");
      if (!inp || !row) return;
      const id = row.getAttribute("data-id");
      const field = inp.getAttribute("data-f");
      const cur = S().getCategory(id);
      if (!cur) return;
      let val = inp.value;
      if (field === "name") {
        val = val.trim();
        if (!val) { inp.value = cur.name; setCerr("Le nom ne peut pas être vide."); return; }
      } else if (field === "icon") {
        val = Array.from(val.trim()).slice(0, 2).join("") || "•";
        inp.value = val;
      }
      setCerr("");
      try { S().updateCategory(id, { [field]: val }); }
      catch (err) { setCerr((err && err.message) || "Modification impossible."); }
    });
    el.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      if (e.target.classList.contains("en-cname") && e.target.closest(".en-crow")) {
        e.preventDefault();
        e.target.blur();
      }
    });
    const form = el;
    form.addEventListener("submit", e => {
      if (e.target.classList && e.target.classList.contains("en-cadd")) { e.preventDefault(); addCat(); }
    });
  }

  // ─── API publique ───
  function init(){
    if (inited) return;
    inited = true;
    bindList();
    bindSheet();
    bindCats();
    FIN.bus.on("entry:open", p => openSheet(p || {}));
    FIN.bus.on("categories:open", () => openCats());
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      const sh = $("sheet-entry"), md = $("modal-categories");
      if (sh && !sh.hidden) { e.preventDefault(); closeSheet(); }
      else if (md && !md.hidden) { e.preventDefault(); closeCats(); }
    });
  }

  function render(state){
    if (!inited) init();
    if (!S()) return;
    if (state && state.date) currentKey = toKey(state.date) || currentKey;
    const f = ensureInline();
    if (f) {
      f.syncDate(currentKey);
      f.refreshCats();
      if (!firstFocusDone) {
        firstFocusDone = true;
        const sh = $("sheet-entry");
        const view = $("view-day");
        const idle = !document.activeElement || document.activeElement === document.body;
        if (isDesktop() && idle && (!sh || sh.hidden) && view && !view.hidden) f.focusAmount();
      }
    }
    if (sheetForm) sheetForm.refreshCats();
    renderList();
  }

  FIN.entry = { init, render, open: openSheet };
})();
