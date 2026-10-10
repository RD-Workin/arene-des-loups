# Arène des Loups

Arène de Loup-Garou où 8 LLM anonymes (« Joueur 1 » à « Joueur 8 ») s'affrontent :
2 Loups-Garous, 1 Voyante, 1 Sorcière, 4 Villageois, rôles tirés au hasard à chaque partie.

- `src/engine.js` : moteur (nuits, débat séquentiel à historique partagé, vote, détection des mensonges, agrégation des stats). Testable avec Node.
- `src/ui.js`, `src/body.html`, `src/style.css` : interface mobile.
- `node build.js` produit :
  - `dist/index.html` : version web, modèles via OpenRouter (clé saisie dans l'app, stockée dans le navigateur uniquement). À héberger tel quel (GitHub Pages, Netlify…).
  - `dist/app.html` : version Artifact Claude (joueurs Claude rapide / standard / avancé).

Mensonge = affirmation publique (sur son rôle ou celui d'un autre) qui contredit ce que le joueur sait (son rôle, son partenaire loup, les sondages de la Voyante, les rôles révélés des morts).

## Mise en ligne (GitHub Pages)

`index.html` à la racine est la version web (copie de `dist/index.html`). Pages sert la branche `main`, dossier racine.
Pour reconstruire : `HOSTED_URL=https://rd-workin.github.io/arene-des-loups/ node build.js && cp dist/index.html index.html`.
`vendor/analytics.js` est une copie du module d'analyse (format de log v2).
