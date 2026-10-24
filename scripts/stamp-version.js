// Recopie la version de package.json dans js/version.js et sw.js.
// Usage : node scripts/stamp-version.js
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(pkg.version || "");
if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Version invalide dans package.json : « " + version + " »");
  process.exit(1);
}

function stamp(file, regex, replacement) {
  const p = path.join(root, file);
  let txt;
  try { txt = fs.readFileSync(p, "utf8"); }
  catch (e) { console.error("Fichier introuvable : " + file); process.exit(1); }
  if (!regex.test(txt)) {
    console.error("Ligne de version introuvable dans " + file + " (attendu : " + replacement + ")");
    process.exit(1);
  }
  fs.writeFileSync(p, txt.replace(regex, replacement), "utf8");
  console.log("OK  " + file + " -> " + version);
}

stamp("js/version.js", /window\.FIN_VERSION\s*=\s*["'][^"']*["']\s*;/, 'window.FIN_VERSION = "' + version + '";');
stamp("sw.js", /const\s+VERSION\s*=\s*["'][^"']*["']\s*;/, 'const VERSION = "' + version + '";');
