# Guide pas à pas — synchro PC / téléphone et mises à jour

Ce guide est écrit pour quelqu'un qui n'est pas développeur. Suivez les étapes dans l'ordre, sans en sauter.
Tout est gratuit. Comptez 30 à 45 minutes la première fois.

Vous allez mettre en place :
- une **version web** de l'appli (pour le téléphone), hébergée gratuitement sur GitHub ;
- une **base en ligne** (Supabase) qui garde vos données synchronisées entre PC et téléphone ;
- un moyen de **publier des mises à jour** que vos appareils vous proposeront automatiquement.

---

## A. Rester anonyme sur GitHub

Le dépôt sera **public** : n'importe qui peut le voir. Pour rester anonyme :

1. Connectez-vous sur https://github.com, cliquez sur votre photo (en haut à droite) → **Settings**.
2. Dans **Public profile** : le champ **Name** doit être **vide** (ou un pseudo). Ne mettez ni prénom ni nom. Même chose pour la photo, la bio et la localisation. Cliquez sur **Update profile**.
3. Menu de gauche → **Emails** :
   - cochez **Keep my email addresses private** ;
   - cochez **Block command line pushes that expose my email** ;
   - notez l'adresse qui apparaît juste en dessous, de la forme `123456+pseudo@users.noreply.github.com` : c'est votre adresse « noreply », à utiliser à la place de votre vraie adresse.
4. **Votre pseudo GitHub contient-il votre prénom ou votre nom ?** Il apparaîtra dans l'adresse du dépôt et de la version mobile. Dans ce cas, le plus simple est de créer un nouveau compte GitHub avec un pseudo neutre (par exemple `lynx-bleu-42`), puis de suivre ce guide avec ce nouveau compte.

---

## B. Créer le dépôt public « appli-finance »

1. Sur GitHub, cliquez sur le **+** en haut à droite → **New repository**.
2. **Repository name** : `appli-finance` (exactement).
3. Choisissez **Public**.
4. **Ne cochez rien** d'autre (pas de README, pas de .gitignore, pas de licence). Cliquez sur **Create repository**.
5. Dans le dossier de l'appli, ouvrez `package.json` avec le Bloc-notes et remplacez `VOTRE_PSEUDO_GITHUB` par votre pseudo GitHub (une seule occurrence). Enregistrez.
6. Ouvrez `js/config.js` et remplissez `githubRepo` : par exemple `"votrepseudo/appli-finance"`. Enregistrez.
7. Sur GitHub, dans votre dépôt : **Settings** → **Pages** → **Source** : choisissez **GitHub Actions**.

L'adresse de la version mobile sera : `https://VOTREPSEUDO.github.io/appli-finance/` (pseudo en minuscules).

---

## C. Supabase (la base en ligne)

1. Allez sur https://supabase.com → **Start your project** et créez un compte (vous pouvez utiliser « Sign in with GitHub »).
2. **New project** :
   - **Name** : `appli-finance` ;
   - **Database password** : cliquez sur **Generate a password** et gardez-le dans un endroit sûr (vous n'en aurez pas besoin au quotidien) ;
   - **Region** : une région d'Europe (**West EU – Paris** ou **Central EU – Frankfurt**) ;
   - cliquez sur **Create new project** et attendez 1 à 2 minutes.
3. Menu de gauche → **SQL Editor** → **New query**. Ouvrez le fichier `supabase/schema.sql` du dossier de l'appli, copiez tout son contenu, collez-le dans l'éditeur, cliquez sur **Run**. Vous devez voir « Success ». (On peut relancer sans risque.)
4. Menu **Authentication** → **URL Configuration** : dans **Site URL**, collez l'adresse de la version mobile (`https://VOTREPSEUDO.github.io/appli-finance/`) → **Save**.
5. Menu **Authentication** → **Providers** (ou Sign In / Providers) → vérifiez que **Email** est activé. Laissez **Confirm email** activé : à la création du compte, vous recevrez un email, il suffira de cliquer **une fois** sur le lien.
6. Menu **Project Settings** (roue crantée) → **API** (ou **Data API / API Keys**) : copiez
   - **Project URL** (ex. `https://abcdefgh.supabase.co`) ;
   - la clé **anon public**.
7. Ouvrez `js/config.js` et collez ces deux valeurs entre les guillemets de `supabaseUrl` et `supabaseAnonKey`. Enregistrez.

**Cette clé « anon » est publique par conception** : elle sera visible dans le code publié, et c'est normal. Ce qui protège vos données, ce sont les règles de sécurité (RLS) installées par `schema.sql` : chaque compte ne peut lire et écrire que ses propres lignes, et personne ne peut rien supprimer en base. **Ne copiez jamais** la clé `service_role` : elle, est secrète.

---

## D. Jeton GitHub pour publier les mises à jour PC

Ce jeton est comme un mot de passe réservé à ce dépôt, utilisé par le script de publication.

1. GitHub → photo → **Settings** → tout en bas du menu de gauche : **Developer settings**.
2. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
3. **Token name** : `publier-appli-finance`. **Expiration** : 1 an (ou plus).
4. **Repository access** : **Only select repositories** → choisissez `appli-finance`.
5. **Permissions** → **Repository permissions** → **Contents** : **Read and write**. (Rien d'autre.)
6. Cliquez sur **Generate token** et **copiez le jeton tout de suite** (il ne sera plus affichable).

Règles : ne le partagez jamais, ne l'écrivez dans aucun fichier du projet, ne le collez pas dans une conversation. Le script de publication vous le demandera à chaque fois (il ne le stocke pas) : gardez-le dans votre gestionnaire de mots de passe.

---

## E. Première publication

Prérequis : Node.js installé (déjà fait) et le dossier de l'appli préparé avec git (c'est déjà le cas, avec une identité anonyme).

1. Ouvrez **PowerShell** dans le dossier de l'appli (dans l'Explorateur : clic droit dans le dossier → **Ouvrir dans le terminal**).
2. Une seule fois : `npm install`
3. Reliez le dépôt GitHub (remplacez VOTREPSEUDO) :
   ```
   git remote add origin https://github.com/VOTREPSEUDO/appli-finance.git
   git push -u origin main
   ```
   Windows peut ouvrir une fenêtre de connexion GitHub : connectez-vous.
4. Attendez 1 à 2 minutes : sur GitHub, onglet **Actions**, la tâche « Publier la version web » doit passer au vert. La version mobile est alors en ligne.
5. Publiez la première version avec les programmes Windows :
   ```
   ./publier.ps1
   ```
   Choisissez le type (1 = correctif, 2 = nouveauté, 3 = majeure), collez votre jeton quand il est demandé. À la fin, les fichiers `.exe` apparaissent dans l'onglet **Releases** du dépôt sur GitHub. Si GitHub propose un brouillon (« Draft »), ouvrez-le et cliquez sur **Publish release**.

Si PowerShell refuse d'exécuter le script : tapez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` puis `O` (Oui), et recommencez.

---

## F. Installer sur le téléphone

1. Ouvrez `https://VOTREPSEUDO.github.io/appli-finance/` :
   - **iPhone** : dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil** ;
   - **Android** : dans **Chrome** → menu **⋮** → **Installer l'application**.
2. Ouvrez l'appli depuis son icône → **Compte & synchro** → **Créer un compte** (email + mot de passe).
3. Vous recevez un email : cliquez une fois sur le lien de confirmation.
4. Sur le **PC** : **Compte & synchro** → **Se connecter** avec les **mêmes** email et mot de passe. Les données se synchronisent toutes seules.

---

## G. Comment marchent les mises à jour

- **Téléphone** : à l'ouverture de l'appli, un bandeau « Mettre à jour » apparaît s'il y a du nouveau. Appuyez dessus, l'appli se recharge.
- **PC (version installée)** : un bandeau propose **Installer** ; une fois le téléchargement fini, cliquez sur **Redémarrer**.
- **PC (version portable)** : le bandeau propose **Télécharger** et ouvre la page des versions sur GitHub.

**Attention, première installation de la 1.2.0** : la version 1.1.0 déjà installée ne sait pas se mettre à jour toute seule. Il faut installer **une seule fois** la 1.2.0 à la main. Comme l'identifiant interne de l'appli change (pour l'anonymat), désinstallez d'abord l'ancienne « Appli Finance » : **Paramètres Windows → Applications → Applications installées → Appli Finance → Désinstaller**. Vos données (dans `Documents\Appli Finance`) sont **conservées**. Installez ensuite `Appli-Finance-Setup-1.2.0.exe` récupéré dans l'onglet Releases. À partir de là, tout est automatique.

---

## H. Dépannage

- **« Synchro désactivée » / pas de bouton de connexion** : `js/config.js` est vide ou mal rempli (étape C.7), ou la version publiée n'est pas à jour : relancez `./publier.ps1`.
- **Email de confirmation non reçu** : regardez les **spams / courriers indésirables**, attendez quelques minutes, vérifiez l'adresse saisie. Sinon, retentez de créer le compte plus tard.
- **« Identifiants incorrects »** : l'email n'est peut-être pas encore confirmé (cliquez sur le lien reçu), ou le mot de passe est faux.
- **Les données n'arrivent pas sur l'autre appareil** : vérifiez la connexion internet, puis **Compte & synchro** → **Synchroniser maintenant**. Les deux appareils doivent être connectés au **même** compte.
- **Le téléphone ne propose pas la mise à jour** : attendez 2 minutes après la publication (onglet **Actions** au vert), puis fermez complètement l'appli et rouvrez-la.
- **Le script `publier.ps1` s'arrête avec un message** : lisez-le, il dit quoi corriger (modifications non enregistrées, mauvais jeton, etc.), puis relancez.
- **Windows SmartScreen** affiche un avertissement : normal, l'exe n'est pas signé. **Informations complémentaires** → **Exécuter quand même**.
