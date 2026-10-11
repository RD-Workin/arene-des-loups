// Assemble src/ en deux fichiers autonomes :
//  dist/index.html : version web (OpenRouter), à héberger (GitHub Pages…)
//  dist/app.html   : version Artifact Claude (contenu de <body>, sans squelette)
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const hosted = process.env.HOSTED_URL || '';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400&family=IM+Fell+French+Canon+SC&display=swap">';
const engine = `const Engine = (function () {\n${src('engine.js')}\nreturn { Game, aggregate, botAgent, seatLabel, ROLE, presetCompo, compoKeys, compoText, normalizeRole, gameRecap };\n})();`;
// Module d'analyse (fil « Analyse et statistiques ») : format de log v1, si présent.
const analyticsPath = [path.join(__dirname, '..', 'analysis', 'analytics.js'), path.join(__dirname, 'vendor', 'analytics.js')].find((f) => fs.existsSync(f)) || '';
const analytics = analyticsPath ? fs.readFileSync(analyticsPath, 'utf8') : '';
// Interface de l'onglet Stats (même fil), juste après analytics.js.
const statsUiPath = [path.join(__dirname, '..', 'analysis', 'stats-ui.js'), path.join(__dirname, 'vendor', 'stats-ui.js')].find((f) => fs.existsSync(f)) || '';
const statsUi = statsUiPath ? fs.readFileSync(statsUiPath, 'utf8') : '';
const ui = src('ui.js').replace('__HOSTED_URL__', hosted);
const inner = `<title>Arène des Loups</title>
${fonts}
<style>
${src('style.css')}
</style>
${src('body.html')}
<script>
${analytics}
${statsUi}
${engine}
${ui}
</script>
`;
fs.writeFileSync(path.join(__dirname, 'dist', 'app.html'), inner);
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Loups IA">
<meta name="theme-color" content="#0f1220">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${inner}</body>
</html>
`);
console.log('ok', fs.statSync(path.join(__dirname, 'dist', 'index.html')).size, 'octets');
