# Appli Finance — PC et téléphone

Suivi de vos dépenses personnelles : combien vous dépensez (jour, semaine, mois) et où part l'argent (camembert par catégorie).
Une seule appli, deux formes : application Windows (Electron) et appli installable sur téléphone (PWA).

## Les deux versions PC générées

- **Installateur** : `Appli-Finance-Setup-x.exe`
  Installe l'application avec un raccourci sur le Bureau et dans le menu Démarrer.
  Vos données sont enregistrées dans `Documents\Appli Finance\donnees-finances.json`.
- **Portable** : `Appli-Finance-Portable-x.exe`
  Aucune installation : double-cliquez et c'est parti.
  Vos données sont enregistrées à côté du fichier exe.

Une copie de sécurité est conservée dans `donnees-finances.bak.json`, à côté du fichier de données.

## Installer l'appli sur téléphone (PWA)

Une PWA doit être servie en **HTTPS**. Ici, elle est publiée gratuitement sur GitHub Pages à chaque envoi
(voir GUIDE-SYNCHRO.md).

1. Ouvrez l'adresse obtenue dans le navigateur du téléphone.
2. **iPhone (Safari)** : bouton Partager, puis **Sur l'écran d'accueil**.
3. **Android (Chrome)** : menu ⋮, puis **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

L'appli fonctionne ensuite hors ligne. Sur téléphone, les données sont stockées dans le navigateur (`localStorage`) :
pensez à faire des sauvegardes de temps en temps.

Pour tester en local sur le PC : `npm run serve` (nécessite Node.js), puis ouvrez l'adresse affichée.

## Synchro PC et téléphone

Un compte (email + mot de passe) permet de garder les données identiques sur tous vos appareils :
**Compte & synchro** dans l'appli, puis **Créer un compte** (téléphone) et **Se connecter** (PC).
La synchro est facultative : sans configuration, l'appli fonctionne 100 % en local.
La mise en place (GitHub, Supabase, jeton de publication) est expliquée pas à pas dans **GUIDE-SYNCHRO.md**.

Sans synchro, vous pouvez toujours transférer à la main : **Sauvegarder** (fichier `.json`), puis sur l'autre
appareil **Restaurer** → **Fusionner** (ajoute et met à jour sans rien effacer ; **Remplacer** repart de zéro).
**Exporter CSV** produit un fichier ouvrable dans Excel.

## Mises à jour

- **Téléphone** : un bandeau « Mettre à jour » apparaît à l'ouverture quand une nouvelle version est en ligne.
- **PC installé** : bandeau **Installer**, puis **Redémarrer**.
- **PC portable** : bandeau **Télécharger** (ouvre la page des versions).

Pour publier une nouvelle version (PC et téléphone) en une commande, dans PowerShell :

```
./publier.ps1
```

Le script demande le type de mise à jour, fabrique les .exe, les envoie sur GitHub et met la version web à jour.

## Raccourcis clavier (PC)

- `←` / `→` : période précédente / suivante
- `T` : aujourd'hui
- `J` / `S` / `M` : vue Jour / Semaine / Mois
- `N` ou `+` : nouvelle dépense
- `Ctrl` + `+` / `Ctrl` + `-` : zoom avant / arrière
- `Ctrl` + `0` : zoom normal
- `F11` : plein écran

## Reconstruire l'application

Installez d'abord **Node.js LTS** (nodejs.org). Puis, dans le dossier du projet :

```
npm install
npm run dist
```

Les fichiers .exe apparaissent dans le dossier `dist`. La version est recopiée automatiquement depuis `package.json`.
(`npm run dist:setup` ne génère que l'installateur, `npm run dist:portable` que la version portable.)

Pour régénérer les icônes : `powershell -ExecutionPolicy Bypass -File build\make-icon.ps1`.

## Avertissement Windows SmartScreen

L'exe n'est pas signé numériquement, Windows peut donc afficher un avertissement au premier lancement.
Cliquez sur **Informations complémentaires**, puis **Exécuter quand même**.
