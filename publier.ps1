# ═══════════ Appli Finance — publier une nouvelle version en une commande ═══════════
# Usage : clic droit sur le fichier > "Exécuter avec PowerShell", ou dans un terminal : ./publier.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Arreter($message) {
    Write-Host ""
    Write-Host "ERREUR : $message" -ForegroundColor Red
    Write-Host "La publication est arretee. Corrigez le probleme puis relancez ./publier.ps1" -ForegroundColor Yellow
    exit 1
}

# Lance une commande externe et s'arrete si elle echoue
function Lancer($titre, [scriptblock]$commande) {
    Write-Host ""
    Write-Host ">> $titre" -ForegroundColor Cyan
    & $commande
    if ($LASTEXITCODE -ne 0) { Arreter "l'etape « $titre » a echoue (code $LASTEXITCODE)." }
}

try {
    # 1. Verifications
    foreach ($outil in @("git", "node", "npm")) {
        if (-not (Get-Command $outil -ErrorAction SilentlyContinue)) { Arreter "« $outil » est introuvable. Installez-le puis relancez." }
    }
    if (-not (Test-Path ".git")) { Arreter "ce dossier n'est pas un depot git." }

    $branche = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branche -ne "main") { Arreter "vous etes sur la branche « $branche ». Passez sur « main » (git checkout main)." }

    $etat = git status --porcelain
    if ($etat) { Arreter "des modifications ne sont pas enregistrees dans git. Faites d'abord un commit (ou demandez de l'aide)." }

    $remote = git remote
    if (-not $remote) { Arreter "aucun depot GitHub n'est relie (voir GUIDE-SYNCHRO.md, etape E : git remote add origin ...)." }

    $pkg = Get-Content -Raw -Encoding UTF8 "package.json" | ConvertFrom-Json
    if ($pkg.build.publish[0].owner -like "VOTRE_*") { Arreter "remplacez VOTRE_PSEUDO_GITHUB dans package.json (voir GUIDE-SYNCHRO.md, etape B)." }

    # 2. Type de version
    Write-Host ""
    Write-Host "Version actuelle : $($pkg.version)" -ForegroundColor Green
    Write-Host "Quel type de mise a jour ?"
    Write-Host "  1 = correctif (petite correction)    ex. 1.2.0 -> 1.2.1"
    Write-Host "  2 = nouveaute (nouvelle fonction)    ex. 1.2.0 -> 1.3.0"
    Write-Host "  3 = majeure (gros changement)        ex. 1.2.0 -> 2.0.0"
    $choix = Read-Host "Votre choix (1, 2 ou 3)"
    switch ($choix) {
        "1" { $type = "patch" }
        "2" { $type = "minor" }
        "3" { $type = "major" }
        default { Arreter "choix non reconnu (tapez 1, 2 ou 3)." }
    }

    # 3. Jeton GitHub (jamais ecrit sur le disque)
    if (-not $env:GH_TOKEN) {
        Write-Host ""
        Write-Host "Collez votre jeton GitHub (rien ne s'affiche, c'est normal) puis Entree :"
        $secure = Read-Host -AsSecureString "Jeton GitHub"
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        if (-not $env:GH_TOKEN) { Arreter "aucun jeton saisi." }
    }

    # 4. Nouvelle version
    Lancer "Nouvelle version ($type)" { npm version $type --no-git-tag-version }
    Lancer "Mise a jour des fichiers de version" { npm run stamp }

    $pkg = Get-Content -Raw -Encoding UTF8 "package.json" | ConvertFrom-Json
    $v = $pkg.version

    # 5. Fabrication et envoi des .exe sur GitHub
    Lancer "Fabrication et envoi des programmes Windows (patientez quelques minutes)" { npm run release }

    # 6. Git
    Lancer "Enregistrement (git add)" { git add -A }
    Lancer "Enregistrement (git commit)" { git commit -m "Version $v" }
    Lancer "Etiquette de version" { git tag "v$v" }
    Lancer "Envoi vers GitHub" { git push --follow-tags }

    Write-Host ""
    Write-Host "Version $v publiee avec succes." -ForegroundColor Green
    Write-Host "- Telephone : la version web se redeploie toute seule (1 a 2 minutes) ;"
    Write-Host "  l'appli proposera la mise a jour a sa prochaine ouverture."
    Write-Host "- PC : l'appli proposera aussi la mise a jour a sa prochaine ouverture."
}
catch {
    Arreter $_.Exception.Message
}
finally {
    Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
}
