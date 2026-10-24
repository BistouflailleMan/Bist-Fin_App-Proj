// ═══════════ Appli Finance — graphiques SVG écrits à la main ═══════════
// Propriétaire : Agent 3 (Visuels). Voir CONTRAT.md.
// FIN.charts.donut / bars / legend — aucune librairie, SVG responsive (viewBox).
(function(){
  "use strict";
  const FIN = window.FIN = window.FIN || {};

  const TAU = Math.PI * 2;
  const NS_GRAY = "#22303F";
  let uidCounter = 0;

  // ─── Petits utilitaires ───
  const esc = s => FIN.util.esc(s);
  const eur = (n, d) => FIN.util.fmtEUR(n, d === undefined ? {} : { decimals: d });
  const f2 = n => (Math.round(n * 100) / 100).toString();

  // Pourcentage lisible : 1 décimale sous 10 %, sinon entier
  function pctStr(p){
    const v = Number(p) || 0;
    return FIN.util.fmtPct(v, v > 0 && v < 10 ? 1 : 0);
  }
  function trunc(s, n){
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  // ═══════════════════════════════════════════════════════════
  //  DONUT
  // ═══════════════════════════════════════════════════════════

  // ─── Géométrie d'un segment d'anneau ───
  function pt(cx, cy, r, a){ return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

  function ringPath(cx, cy, R, r, a0, a1){
    // Segment unique (≈100 %) : anneau complet = deux cercles (règle evenodd)
    if (a1 - a0 >= TAU - 1e-3) {
      return "M" + f2(cx + R) + " " + f2(cy) +
        "A" + R + " " + R + " 0 1 1 " + f2(cx - R) + " " + f2(cy) +
        "A" + R + " " + R + " 0 1 1 " + f2(cx + R) + " " + f2(cy) + "Z" +
        "M" + f2(cx + r) + " " + f2(cy) +
        "A" + r + " " + r + " 0 1 0 " + f2(cx - r) + " " + f2(cy) +
        "A" + r + " " + r + " 0 1 0 " + f2(cx + r) + " " + f2(cy) + "Z";
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = pt(cx, cy, R, a0), p1 = pt(cx, cy, R, a1);
    const p2 = pt(cx, cy, r, a1), p3 = pt(cx, cy, r, a0);
    return "M" + f2(p0[0]) + " " + f2(p0[1]) +
      "A" + R + " " + R + " 0 " + large + " 1 " + f2(p1[0]) + " " + f2(p1[1]) +
      "L" + f2(p2[0]) + " " + f2(p2[1]) +
      "A" + r + " " + r + " 0 " + large + " 0 " + f2(p3[0]) + " " + f2(p3[1]) + "Z";
  }

  function donut(el, items, opts){
    if (!el) return null;
    opts = opts || {};
    const size = opts.size || 240;
    const VB = 200, C = 100, R = 92, r = 62;

    // Éléments à valeur positive, en gardant l'index d'origine (pour la légende)
    const list = [];
    (items || []).forEach((it, idx) => {
      const v = Number(it && it.value) || 0;
      if (v > 0) list.push({ idx, label: it.label, value: v, color: it.color || "#7E92A6", icon: it.icon || "" });
    });
    const total = list.reduce((s, x) => s + x.value, 0);

    // ─── Regroupement visuel des segments < 3 % (si au moins deux) ───
    let segs = list.map(x => ({ idxs: [x.idx], label: x.label, value: x.value, color: x.color, icon: x.icon }));
    if (total > 0) {
      const small = segs.filter(s => s.value / total < 0.03);
      if (small.length >= 2) {
        const big = segs.filter(s => s.value / total >= 0.03);
        big.push({
          idxs: [].concat.apply([], small.map(s => s.idxs)),
          label: "Autres (" + small.length + ")",
          value: small.reduce((s, x) => s + x.value, 0),
          color: "#526375", icon: "…"
        });
        segs = big;
      }
    }

    // ─── Texte accessible ───
    const aria = total > 0
      ? "Répartition des dépenses : " + list.map(x => x.label + " " + pctStr(x.value / total * 100)).join(", ") + ". Total " + eur(total)
      : "Aucune dépense sur cette période. Total 0,00 €";

    // ─── Segments ───
    let paths = "";
    if (total <= 0) {
      paths = '<path class="ch-seg-empty" fill="' + NS_GRAY + '" fill-rule="evenodd" d="' + ringPath(C, C, R, r, 0, TAU) + '"/>';
    } else {
      const gap = segs.length > 1 ? 0.035 : 0;
      let a = -Math.PI / 2;
      segs.forEach((s, i) => {
        const span = s.value / total * TAU;
        s.a0 = a; s.a1 = a + span; s.mid = a + span / 2;
        a += span;
        const g = span > gap * 3 ? gap / 2 : 0;
        const pc = s.value / total * 100;
        paths += '<path class="ch-seg" data-s="' + i + '" tabindex="0" fill="' + esc(s.color) + '" fill-rule="evenodd"' +
          ' aria-label="' + esc(s.label + " : " + eur(s.value) + ", " + pctStr(pc)) + '"' +
          ' d="' + ringPath(C, C, R, r, s.a0 + g, s.a1 - g) + '"/>';
      });
    }

    el.innerHTML =
      '<div class="ch-donut" style="max-width:' + size + 'px">' +
        '<svg class="ch-donut-svg" viewBox="0 0 ' + VB + ' ' + VB + '" role="img" aria-label="' + esc(aria) + '">' +
          '<g class="ch-segs">' + paths + '</g>' +
          '<g class="ch-center" pointer-events="none" text-anchor="middle">' +
            '<text class="ch-c-l" x="100" y="90" font-size="9"></text>' +
            '<text class="ch-c-v" x="100" y="116" font-size="24"></text>' +
            '<text class="ch-c-s" x="100" y="132" font-size="11"></text>' +
          '</g>' +
        '</svg>' +
      '</div>';

    const box = el.querySelector(".ch-donut");
    const tl = el.querySelector(".ch-c-l"), tv = el.querySelector(".ch-c-v"), ts = el.querySelector(".ch-c-s");
    const segEls = Array.prototype.slice.call(el.querySelectorAll(".ch-seg"));

    // ─── Texte du centre ───
    function setCenter(label, value, sub, isLabelUpper){
      tl.textContent = label || "";
      tl.setAttribute("class", "ch-c-l" + (isLabelUpper ? " ch-up" : ""));
      tv.textContent = value || "";
      const len = Math.max(1, String(value || "").length);
      tv.setAttribute("font-size", String(Math.round(Math.min(26, 104 / (len * 0.62)) * 10) / 10));
      ts.textContent = sub || "";
      if (sub) { tl.setAttribute("y", "84"); tv.setAttribute("y", "110"); ts.setAttribute("y", "130"); }
      else { tl.setAttribute("y", "92"); tv.setAttribute("y", "114"); }
    }
    function resetCenter(){
      setCenter(opts.centerLabel ? trunc(opts.centerLabel, 20) : "", opts.centerValue != null ? String(opts.centerValue) : eur(total), "", true);
    }

    let locked = null, current = null;
    function clearHl(){
      current = null;
      box.classList.remove("is-hl");
      segEls.forEach(p => { p.classList.remove("ch-on"); p.style.transform = ""; });
    }
    function activate(i){
      const s = segs[i];
      if (!s) return;
      clearHl();
      current = i;
      box.classList.add("is-hl");
      const p = segEls[i];
      p.classList.add("ch-on");
      const d = segs.length > 1 ? 5 : 0;
      p.style.transform = "translate(" + f2(Math.cos(s.mid) * d) + "px," + f2(Math.sin(s.mid) * d) + "px)";
      setCenter(trunc((s.icon ? s.icon + " " : "") + s.label, 18), eur(s.value), pctStr(s.value / total * 100), false);
    }
    function reset(){
      if (locked != null) { activate(locked); return; }
      clearHl(); resetCenter();
    }

    resetCenter();

    if (total > 0) {
      segEls.forEach(p => {
        const i = +p.getAttribute("data-s");
        p.addEventListener("mouseenter", () => activate(i));
        p.addEventListener("mouseleave", reset);
        p.addEventListener("focus", () => activate(i));
        p.addEventListener("blur", reset);
        p.addEventListener("click", () => {
          locked = (locked === i) ? null : i;
          reset();
          if (locked != null) activate(locked);
        });
        p.addEventListener("keydown", ev => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); p.dispatchEvent(new Event("click")); }
        });
      });
    }

    // ─── Contrôle depuis l'extérieur (survol de la légende) ───
    return {
      highlight(origIdx){
        if (total <= 0) return;
        const si = segs.findIndex(s => s.idxs.indexOf(origIdx) >= 0);
        if (si >= 0) activate(si);
      },
      reset(){ locked = null; clearHl(); resetCenter(); }
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  BARRES
  // ═══════════════════════════════════════════════════════════
  function bars(el, items, opts){
    if (!el) return;
    opts = opts || {};
    items = items || [];
    const n = items.length;
    if (!n) { el.innerHTML = ""; return; }

    const SLOT = 56, W = n * SLOT, H = 210, TOP = 24, BOT = 36;
    const plotH = H - TOP - BOT, baseY = TOP + plotH;
    const max = Math.max.apply(null, items.map(it => Number(it.value) || 0).concat([0.01]));
    const clickable = typeof opts.onClick === "function";
    const gid = "chb" + (++uidCounter);

    const aria = "Dépenses : " + items.map(it => it.label + " " + eur(it.value || 0)).join(", ");
    let defs = "", body = "";

    items.forEach((it, i) => {
      const v = Number(it.value) || 0;
      const x0 = i * SLOT;
      const bw = Math.min(34, SLOT * 0.62);
      const x = x0 + (SLOT - bw) / 2;
      const h = v > 0 ? Math.max(3, v / max * plotH) : 0;
      const y = baseY - h;
      const hl = opts.highlightKey != null && it.key === opts.highlightKey;
      const cx = x0 + SLOT / 2;

      let g = '<g class="ch-bar' + (hl ? " is-hl" : "") + '" data-key="' + esc(it.key) + '"' +
        (clickable ? ' role="button" tabindex="0"' : "") +
        ' aria-label="' + esc(it.label + " : " + eur(v)) + '">';
      g += '<rect class="ch-bar-hov" x="' + (x0 + 2) + '" y="2" width="' + (SLOT - 4) + '" height="' + (H - 4) + '" rx="6"/>';
      if (hl) g += '<rect class="ch-bar-sel" x="' + (x0 + 2) + '" y="2" width="' + (SLOT - 4) + '" height="' + (H - 4) + '" rx="6"/>';

      if (v > 0) {
        const segs = (it.segments || []).filter(s => s && s.value > 0);
        if (segs.length) {
          const sum = segs.reduce((s, q) => s + q.value, 0);
          const cid = gid + "-" + i;
          defs += '<clipPath id="' + cid + '"><rect x="' + f2(x) + '" y="' + f2(y) + '" width="' + f2(bw) + '" height="' + f2(h) + '" rx="4"/></clipPath>';
          g += '<g clip-path="url(#' + cid + ')">';
          let yy = baseY;
          segs.forEach(s => {
            const sh = s.value / sum * h;
            yy -= sh;
            g += '<rect x="' + f2(x) + '" y="' + f2(yy) + '" width="' + f2(bw) + '" height="' + f2(sh + 0.4) + '" fill="' + esc(s.color || "#7E92A6") + '"/>';
          });
          g += '</g>';
        } else {
          const fill = hl ? "var(--accent)" : (it.color || "#4C6A88");
          g += '<rect x="' + f2(x) + '" y="' + f2(y) + '" width="' + f2(bw) + '" height="' + f2(h) + '" rx="4" fill="' + esc(fill) + '"/>';
        }
        const txt = eur(v, v >= 100 ? 0 : 2);
        g += '<text class="ch-bar-v" x="' + cx + '" y="' + f2(y - 6) + '" text-anchor="middle">' + esc(txt) + '</text>';
      } else {
        g += '<rect x="' + f2(x) + '" y="' + (baseY - 2) + '" width="' + f2(bw) + '" height="2" rx="1" fill="' + NS_GRAY + '"/>';
        g += '<text class="ch-bar-v ch-zero" x="' + cx + '" y="' + (baseY - 8) + '" text-anchor="middle">–</text>';
      }
      g += '<text class="ch-bar-l" x="' + cx + '" y="' + (H - 19) + '" text-anchor="middle">' + esc(it.label) + '</text>';
      if (it.sub != null) g += '<text class="ch-bar-s" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(it.sub) + '</text>';
      g += '<rect class="ch-bar-hit" x="' + x0 + '" y="0" width="' + SLOT + '" height="' + H + '" fill="transparent"/>';
      g += '</g>';
      body += g;
    });

    el.innerHTML =
      '<div class="ch-bars"><svg class="ch-bars-svg" viewBox="0 0 ' + W + ' ' + H + '" role="' + (clickable ? "group" : "img") + '" aria-label="' + esc(aria) + '">' +
      (defs ? "<defs>" + defs + "</defs>" : "") +
      '<line class="ch-base" x1="0" x2="' + W + '" y1="' + baseY + '" y2="' + baseY + '"/>' +
      body + '</svg></div>';

    if (clickable) {
      Array.prototype.forEach.call(el.querySelectorAll(".ch-bar"), g => {
        const key = g.getAttribute("data-key");
        g.addEventListener("click", () => opts.onClick(key));
        g.addEventListener("keydown", ev => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); opts.onClick(key); }
        });
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  LÉGENDE
  // ═══════════════════════════════════════════════════════════
  function legend(el, byCategory, opts){
    if (!el) return;
    opts = opts || {};
    const list = byCategory || [];
    if (!list.length) {
      el.innerHTML = '<div class="ch-legend-empty">' + esc(opts.emptyText || "Aucune dépense sur cette période.") + '</div>';
      return;
    }
    const clickable = typeof opts.onClick === "function";
    const tag = clickable ? "button" : "div";
    let h = '<ul class="ch-legend">';
    list.forEach((b, i) => {
      const c = b.category || {};
      const color = c.color || "#7E92A6";
      const pc = Math.max(0, Math.min(100, b.pct || 0));
      h += '<li><' + tag + (clickable ? ' type="button"' : "") + ' class="ch-lg-row' + (clickable ? " is-click" : "") + '" data-i="' + i + '" style="--c:' + esc(color) + '"' +
        (clickable ? "" : ' tabindex="0"') + '>' +
        '<span class="ch-lg-top">' +
          '<span class="ch-lg-dot" aria-hidden="true"></span>' +
          '<span class="ch-lg-ico" aria-hidden="true">' + esc(c.icon || "•") + '</span>' +
          '<span class="ch-lg-name">' + esc(c.name || "Sans catégorie") + '</span>' +
          '<span class="ch-lg-amt num">' + esc(eur(b.total)) + '</span>' +
          '<span class="ch-lg-pct num">' + esc(pctStr(b.pct)) + '</span>' +
        '</span>' +
        '<span class="ch-lg-bar" aria-hidden="true"><i style="width:' + pc.toFixed(2) + '%"></i></span>' +
        '</' + tag + '></li>';
    });
    h += '</ul>';
    el.innerHTML = h;

    Array.prototype.forEach.call(el.querySelectorAll(".ch-lg-row"), row => {
      const i = +row.getAttribute("data-i");
      if (clickable) row.addEventListener("click", () => opts.onClick(list[i]));
      if (typeof opts.onHover === "function") {
        row.addEventListener("mouseenter", () => opts.onHover(i));
        row.addEventListener("mouseleave", () => opts.onHover(null));
        row.addEventListener("focus", () => opts.onHover(i));
        row.addEventListener("blur", () => opts.onHover(null));
      }
    });
  }

  FIN.charts = { donut, bars, legend, pctStr };
})();
