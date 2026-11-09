# Suivi de mes livres

Site statique (GitHub Pages) + Firebase (connexion et base de données).

- **Visiteurs** (lien de partage) : voient ton nom, ta présentation et tes livres marqués « public », en lecture seule.
- **Toi seul** : connexion e-mail + mot de passe, ajout / modification / suppression de livres, livres privés, profil.

La sécurité est appliquée **côté serveur** par `firestore.rules` : même en bidouillant le code du site, personne d'autre ne peut écrire ni lire tes livres privés.

## Mise en ligne (≈ 20 minutes)

### 1. Créer le projet Firebase
1. Va sur <https://console.firebase.google.com> → **Ajouter un projet** (Google Analytics non nécessaire).
2. **Paramètres du projet** (roue dentée) → **Vos applications** → icône **Web `</>`** → enregistre l'app, puis copie l'objet `firebaseConfig`.
3. Colle `apiKey`, `authDomain`, `projectId`, `appId` dans `js/config.js`.

### 2. Créer ton compte (le seul)
1. **Authentication** → **Commencer** → méthode **E-mail/Mot de passe** → activer.
2. Onglet **Utilisateurs** → **Ajouter un utilisateur** : ton e-mail + un mot de passe long et unique.
3. Copie l'**UID utilisateur** de ce compte et colle-le dans `js/config.js` (`OWNER_UID`).
4. Si Firebase propose de désactiver la création de comptes (inscription) dans les paramètres d'Authentication, fais-le. Ce n'est pas indispensable : les règles de l'étape 3 bloquent de toute façon tout autre compte.

### 3. Activer la base et les règles
1. **Firestore Database** → **Créer une base de données** → mode **production**, région en Europe.
2. Onglet **Règles** : colle le contenu de `firestore.rules`, en remplaçant `OWNER_UID` (entre guillemets, une seule occurrence) par **ton UID**, puis **Publier**.

### 4. Héberger sur GitHub
1. Crée un dépôt **public** sur GitHub et envoie-y tout le contenu de ce dossier (sans `node_modules`).
   Le dépôt public est normal ici : la configuration Firebase n'est pas secrète, ce sont les règles qui protègent.
2. Dépôt → **Settings** → **Pages** → *Deploy from a branch* → branche `main`, dossier `/ (root)`.
3. Après quelques minutes, ton site est à `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`. **Cette adresse est ton lien de partage.**

### 5. Premier usage
1. Ouvre ton site, clique **Espace auteur** en bas de page (ou ajoute `#/admin` à l'adresse) et connecte-toi.
2. **Mon profil** : nom affiché et présentation.
3. **+ Nouveau livre** : un livre est **privé par défaut**. Coche « Visible par les visiteurs » pour le publier sur ton profil.
4. **Voir comme visiteur** montre exactement ce que verront les gens.

## Comment l'avancement est calculé
1. Objectif de mots renseigné → mots écrits ÷ objectif.
2. Sinon, chapitres terminés ÷ chapitres prévus.
3. Sinon, selon l'étape : Idée 0 %, Plan 10 %, Écriture 40 %, Relecture 85 %.
4. Un livre à l'étape **Publié** est toujours à 100 %.

## Bon à savoir
- Les pages sont marquées `noindex` (non référencées par les moteurs de recherche). Retire la ligne `robots` d'`index.html` si tu veux l'inverse.
- Un livre « public » est lisible par quiconque interroge la base, pas seulement via le site : ne publie rien que tu veux garder confidentiel.
- Ce site suit l'avancement ; il ne stocke pas le texte des livres.
- Le quota gratuit de Firebase suffit largement pour un usage perso.
- Si tu perds ton mot de passe : Firebase → Authentication → Utilisateurs → menu du compte → réinitialiser.

## Tests
```
npm install
npm test        # 41 tests : calculs, validation, interface visiteur/auteur, XSS, règles simulées
```
