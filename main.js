// ═══════════ Appli Finance — processus principal Electron ═══════════
"use strict";
const { app, BrowserWindow, Menu, ipcMain, shell, screen, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

app.setAppUserModelId("com.applifinance.app");

// ─── Dossier de données ───
// Portable : à côté de l'exe. Installé : Documents\Appli Finance. Développement : dossier du projet.
function computeDataDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (app.isPackaged) {
    const d = path.join(app.getPath("documents"), "Appli Finance");
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }
  return __dirname;
}
let dataDir = null;
let mainWindow = null;

// ─── Instance unique ───
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  start();
}

// ─── État de la fenêtre ───
function stateFile() { return path.join(dataDir, "window-state.json"); }
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    return s && typeof s === "object" ? s : {};
  } catch (e) { return {}; }
}
function boundsVisible(b) {
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return false;
  if (b.width < 200 || b.height < 200) return false;
  try {
    return screen.getAllDisplays().some(d => {
      const w = d.workArea;
      const ox = Math.min(b.x + b.width, w.x + w.width) - Math.max(b.x, w.x);
      const oy = Math.min(b.y + b.height, w.y + w.height) - Math.max(b.y, w.y);
      return ox >= 100 && oy >= 60;
    });
  } catch (e) { return false; }
}
let saveTimer = null;
function saveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const maximized = mainWindow.isMaximized();
    const bounds = (maximized || mainWindow.isMinimized() || mainWindow.isFullScreen())
      ? (loadState().bounds || mainWindow.getNormalBounds())
      : mainWindow.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ bounds: maximized ? mainWindow.getNormalBounds() : bounds, maximized }));
  } catch (e) {}
}
function saveStateSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 500);
}

// ─── Fenêtre ───
function createWindow() {
  const st = loadState();
  const opts = {
    title: "Appli Finance",
    width: 1200,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    center: true,
    show: false,
    backgroundColor: "#0D1520",
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, spellcheck: false }
  };
  const icon = path.join(__dirname, "build", "icon.ico");
  if (fs.existsSync(icon)) opts.icon = icon;
  if (boundsVisible(st.bounds)) {
    Object.assign(opts, { x: st.bounds.x, y: st.bounds.y, width: st.bounds.width, height: st.bounds.height, center: false });
  }

  const win = new BrowserWindow(opts);
  mainWindow = win;
  win.once("ready-to-show", () => {
    if (st.maximized) win.maximize();
    win.show();
  });
  win.on("resize", saveStateSoon);
  win.on("move", saveStateSoon);
  win.on("close", () => { clearTimeout(saveTimer); saveState(); });
  win.on("closed", () => { mainWindow = null; });

  const wc = win.webContents;
  const indexPath = path.join(__dirname, "index.html");
  const indexUrl = pathToFileURL(indexPath).href;

  // Raccourcis (le menu est supprimé)
  wc.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    const k = (input.key || "").toLowerCase();
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen()); e.preventDefault();
    } else if (input.key === "F12" || (ctrl && input.shift && k === "i")) {
      wc.toggleDevTools(); e.preventDefault();
    } else if (input.key === "F5" || (ctrl && !input.shift && !input.alt && k === "r")) {
      wc.reload(); e.preventDefault();
    }
  });

  // Sécurité : pas de navigation hors du fichier local
  wc.on("will-navigate", (e, url) => {
    let same = false;
    try { const u = new URL(url); u.hash = ""; u.search = ""; same = u.href === indexUrl; } catch (err) {}
    if (!same) e.preventDefault();
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(indexPath);
}

// ─── Mises à jour ───
// Propriétaire / dépôt lus à un seul endroit : package.json → build.publish
function publishInfo() {
  try {
    const p = require("./package.json").build.publish[0];
    if (p && p.owner && p.repo && !/^VOTRE_/.test(p.owner)) return { owner: p.owner, repo: p.repo };
  } catch (e) {}
  return null;
}
function sendToRenderer(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  } catch (e) {}
}
function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function isNewer(a, b) { // a plus récent que b ?
  const x = parseSemver(a), y = parseSemver(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
  return false;
}
function errMsg(e) {
  const s = String((e && e.message) || e || "").toLowerCase();
  if (/net::|enotfound|econn|etimedout|timeout|network|getaddrinfo|socket/.test(s)) {
    return "Impossible de vérifier les mises à jour (pas de connexion ?).";
  }
  return "La mise à jour a échoué. Réessayez plus tard.";
}

let updaterStarted = false;
function setupUpdates() {
  if (updaterStarted || !app.isPackaged) return;
  updaterStarted = true;
  const info = publishInfo();
  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  let autoUpdater = null;

  async function checkPortable() {
    if (!info) { sendToRenderer("update:none"); return; }
    try {
      const { net } = require("electron");
      const res = await net.fetch("https://api.github.com/repos/" + info.owner + "/" + info.repo + "/releases/latest", {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Appli-Finance" }
      });
      if (!res.ok) throw new Error("http " + res.status);
      const rel = await res.json();
      const latest = String(rel.tag_name || "").replace(/^v/i, "");
      if (isNewer(latest, app.getVersion())) sendToRenderer("update:available", { version: latest, portable: true });
      else sendToRenderer("update:none");
    } catch (e) { sendToRenderer("update:error", { message: errMsg(e) }); }
  }

  if (!portable) {
    try {
      autoUpdater = require("electron-updater").autoUpdater;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = null;
      autoUpdater.on("update-available", i => sendToRenderer("update:available", { version: i && i.version }));
      autoUpdater.on("update-not-available", () => sendToRenderer("update:none"));
      autoUpdater.on("download-progress", p => sendToRenderer("update:progress", { percent: Math.round((p && p.percent) || 0) }));
      autoUpdater.on("update-downloaded", i => sendToRenderer("update:downloaded", { version: i && i.version }));
      autoUpdater.on("error", e => sendToRenderer("update:error", { message: errMsg(e) }));
    } catch (e) { autoUpdater = null; }
  }

  function check() {
    if (portable) return checkPortable();
    if (!autoUpdater) return;
    try { autoUpdater.checkForUpdates().catch(() => {}); } catch (e) {}
  }

  ipcMain.on("update:check", () => { check(); });
  ipcMain.on("update:download", () => {
    if (portable) {
      if (info) shell.openExternal("https://github.com/" + info.owner + "/" + info.repo + "/releases/latest");
      return;
    }
    if (autoUpdater) { try { autoUpdater.downloadUpdate().catch(() => {}); } catch (e) {} }
  });
  ipcMain.on("update:install", () => {
    if (autoUpdater) { try { autoUpdater.quitAndInstall(); } catch (e) {} }
  });

  const wc = mainWindow && mainWindow.webContents;
  const begin = () => {
    setTimeout(check, 5000);
    setInterval(check, 6 * 60 * 60 * 1000);
  };
  if (wc && wc.isLoading()) wc.once("did-finish-load", begin); else begin();
}

// ─── Démarrage ───
function start() {
  app.whenReady().then(() => {
    dataDir = computeDataDir();
    Menu.setApplicationMenu(null);

    // IPC
    ipcMain.on("get-data-dir", e => { e.returnValue = dataDir; });
    ipcMain.handle("open-data-dir", () => shell.openPath(dataDir));
    ipcMain.handle("set-zoom", (e, factor) => {
      const f = Math.min(2, Math.max(0.5, Number(factor) || 1));
      e.sender.setZoomFactor(f);
      return f;
    });

    // Téléchargements : boîte "Enregistrer" native, par défaut dans Documents
    session.defaultSession.on("will-download", (e, item) => {
      item.setSaveDialogOptions({
        title: "Enregistrer",
        defaultPath: path.join(app.getPath("documents"), item.getFilename())
      });
    });

    createWindow();
    setupUpdates();
  });
  app.on("window-all-closed", () => app.quit());
}
