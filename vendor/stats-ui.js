// Interface des statistiques de l'Arène : résumé, comparaison, fiche par modèle, séries, rejeu des parties.
// Utilisée par le tableau de bord autonome ET par l'onglet Stats de l'app.
//   LGStats.mount(element, { logs, showData, samples, judge, store }) -> { update(logs) }
// Dépend de analytics.js (window.LGAnalytics). Aucune autre dépendance ; graphiques en SVG.
// Les couleurs viennent des variables CSS de la page (--ink, --muted, --village, --wolf, --moon, --surface…).

(function (root) {
  'use strict';
  const A = root.LGAnalytics || (typeof require !== 'undefined' ? require('./analytics.js') : null);

  // ---------------------------------------------------------------- styles
  const CSS = `
.lgs { --lgs-bar: var(--village, #24617f); --lgs-soft: color-mix(in srgb, var(--village, #24617f) 18%, transparent);
  display: grid; gap: 14px; min-width: 0; font-variant-numeric: tabular-nums; }
.lgs *, .lgs *::before, .lgs *::after { box-sizing: border-box; }
.lgs .lgs-tabs { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; display: flex; gap: 4px; overflow-x: auto;
  background: var(--surface-2, #f4f5f9); border: 1px solid var(--line, #d7dae4); border-radius: 999px; padding: 3px; scrollbar-width: none; }
.lgs .lgs-tabs::-webkit-scrollbar { display: none; }
.lgs .lgs-tab { flex: 1 0 auto; font: inherit; font-size: .86rem; border: 0; background: transparent; color: var(--muted, #5a6074);
  padding: 7px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.lgs .lgs-tab[aria-selected="true"] { background: var(--surface, #fff); color: var(--ink, #1a1e2c); font-weight: 700; box-shadow: 0 1px 2px rgb(0 0 0 / .14); }
.lgs .lgs-card { background: var(--surface, #fff); border: 1px solid var(--line, #d7dae4); border-radius: var(--r, 10px); padding: 16px; display: grid; gap: 10px; min-width: 0; }
.lgs h3 { font-family: var(--f-display, Georgia, serif); font-weight: 400; font-size: 1.3rem; margin: 0; line-height: 1.15; text-wrap: balance; }
.lgs h4 { margin: 0; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #5a6074); }
.lgs p { margin: 0; }
.lgs .lgs-hint { color: var(--muted, #5a6074); font-size: .84rem; }
.lgs .lgs-banner { font-size: .84rem; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--moon, #9a6a0c);
  background: color-mix(in srgb, var(--moon, #9a6a0c) 12%, transparent); }
.lgs .lgs-mono { font-family: var(--f-mono, ui-monospace, monospace); }
.lgs button.lgs-btn, .lgs label.lgs-btn { font: inherit; font-size: .88rem; cursor: pointer; border-radius: 8px; border: 1px solid var(--line, #d7dae4);
  background: var(--surface-2, #f4f5f9); color: var(--ink, #1a1e2c); padding: 7px 12px; display: inline-flex; align-items: center; gap: 6px; }
.lgs button.lgs-btn.primary { background: var(--accent, #9a1b30); color: var(--accent-ink, #fff); border-color: transparent; font-weight: 700; }
.lgs button:disabled { opacity: .5; cursor: default; }
.lgs button:focus-visible, .lgs input:focus-visible, .lgs select:focus-visible, .lgs textarea:focus-visible, .lgs summary:focus-visible { outline: 2px solid var(--moon, #9a6a0c); outline-offset: 2px; }
.lgs input, .lgs select, .lgs textarea { font: inherit; font-size: 16px; color: var(--ink, #1a1e2c); background: var(--surface-2, #f4f5f9);
  border: 1px solid var(--line, #d7dae4); border-radius: 8px; padding: 8px 10px; width: 100%; min-width: 0; }
.lgs label.lgs-field { display: grid; gap: 4px; font-size: .84rem; font-weight: 700; }
.lgs .lgs-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.lgs .lgs-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.lgs .lgs-chip { white-space: nowrap; border-radius: 999px; padding: 5px 12px; font-size: .84rem; font: inherit; font-size: .84rem; cursor: pointer;
  border: 1px solid var(--line, #d7dae4); background: var(--surface-2, #f4f5f9); color: var(--ink, #1a1e2c); }
.lgs .lgs-chip[aria-pressed="true"] { background: var(--ink, #1a1e2c); color: var(--bg, #fff); border-color: var(--ink, #1a1e2c); }

.lgs .lgs-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 640px) { .lgs .lgs-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.lgs .lgs-kpi { background: var(--surface, #fff); border: 1px solid var(--line, #d7dae4); border-radius: var(--r, 10px); padding: 12px 14px; display: grid; gap: 2px; min-width: 0; }
.lgs .lgs-kpi .k { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #5a6074); font-weight: 700; }
.lgs .lgs-kpi .v { font-family: var(--f-mono, monospace); font-size: 1.55rem; line-height: 1.15; }
.lgs .lgs-kpi .s { font-size: .78rem; color: var(--muted, #5a6074); }
.lgs .lgs-split { display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 2px; margin-top: 4px; }
.lgs .lgs-split i { display: block; height: 100%; }

.lgs .lgs-podium { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.lgs .lgs-podium li { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px;
  border: 1px solid var(--line, #d7dae4); border-radius: 10px; background: var(--surface-2, #f4f5f9); cursor: pointer; }
.lgs .lgs-podium .rank { font-family: var(--f-display, Georgia, serif); font-size: 1.6rem; text-align: center; color: var(--moon, #9a6a0c); }
.lgs .lgs-podium .nm { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgs .lgs-podium .sub { font-size: .78rem; color: var(--muted, #5a6074); }
.lgs .lgs-podium .val { font-family: var(--f-mono, monospace); font-size: 1.15rem; }

.lgs .lgs-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.lgs .lgs-fact { border: 1px solid var(--line, #d7dae4); border-radius: 10px; padding: 10px 12px; display: grid; gap: 3px; min-width: 0; background: var(--surface, #fff); cursor: pointer; text-align: left; font: inherit; color: inherit; }
.lgs .lgs-fact .t { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted, #5a6074); font-weight: 700; }
.lgs .lgs-fact .m { font-weight: 700; overflow-wrap: anywhere; line-height: 1.25; }
.lgs .lgs-fact .v { font-family: var(--f-mono, monospace); font-size: .95rem; }
.lgs .lgs-fact .d { font-size: .76rem; color: var(--muted, #5a6074); }

.lgs .lgs-bars { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.lgs .lgs-bars li { display: grid; gap: 3px; }
.lgs .lgs-bars .lab { display: flex; justify-content: space-between; gap: 10px; font-size: .86rem; min-width: 0; }
.lgs .lgs-bars .lab span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.lgs .lgs-bars .val { font-family: var(--f-mono, monospace); white-space: nowrap; }
.lgs .lgs-bars .n { color: var(--muted, #5a6074); font-size: .76rem; }
.lgs .lgs-track { position: relative; height: 12px; background: var(--surface-2, #f4f5f9); border-radius: 4px; }
.lgs .lgs-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--lgs-bar); border-radius: 0 4px 4px 0; }
.lgs .lgs-fill.wolf { background: var(--wolf, #9a1b30); } .lgs .lgs-fill.village { background: var(--village, #24617f); }
.lgs .lgs-ci { position: absolute; top: 50%; height: 2px; background: var(--ink, #1a1e2c); opacity: .55; transform: translateY(-50%); }
.lgs .lgs-ci::before, .lgs .lgs-ci::after { content: ""; position: absolute; top: -4px; width: 2px; height: 10px; background: var(--ink, #1a1e2c); }
.lgs .lgs-ci::before { left: 0; } .lgs .lgs-ci::after { right: 0; }
.lgs .lgs-ref { position: absolute; top: -3px; bottom: -3px; width: 0; border-left: 2px dashed var(--muted, #5a6074); }
.lgs .lgs-axis { display: flex; justify-content: space-between; font-size: .74rem; color: var(--muted, #5a6074); font-family: var(--f-mono, monospace); }

.lgs .lgs-tablewrap { overflow-x: auto; border: 1px solid var(--line, #d7dae4); border-radius: 8px; }
.lgs table { border-collapse: collapse; width: 100%; font-size: .82rem; }
.lgs th, .lgs td { padding: 7px 9px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--line, #d7dae4); }
.lgs th:first-child, .lgs td:first-child { text-align: left; position: sticky; left: 0; background: var(--surface, #fff); max-width: 42vw; overflow: hidden; text-overflow: ellipsis; z-index: 1; }
.lgs thead th { font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted, #5a6074); }
.lgs td { font-family: var(--f-mono, monospace); }
.lgs td:first-child { font-family: inherit; }
.lgs tbody tr:last-child td { border-bottom: 0; }
.lgs td.dim, .lgs .dim { color: var(--muted, #5a6074); }

.lgs svg { display: block; width: 100%; height: auto; overflow: visible; }
.lgs svg text { fill: var(--muted, #5a6074); font-family: var(--f-body, system-ui, sans-serif); font-size: 11px; }
.lgs svg .lab-ink { fill: var(--ink, #1a1e2c); }
.lgs svg .grid { stroke: var(--line, #d7dae4); stroke-width: 1; fill: none; }
.lgs .lgs-legend { display: flex; gap: 4px 14px; flex-wrap: wrap; font-size: .78rem; color: var(--muted, #5a6074); }
.lgs .lgs-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.lgs .lgs-legend i.dash { height: 0; border-top: 2px dashed var(--muted, #5a6074); width: 14px; border-radius: 0; vertical-align: 3px; }

.lgs .lgs-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
.lgs .lgs-head .big { font-family: var(--f-mono, monospace); font-size: 2.2rem; line-height: 1; }
.lgs .lgs-head .nm { font-weight: 700; font-size: 1.35rem; line-height: 1.15; overflow-wrap: anywhere; }
.lgs .lgs-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.lgs .lgs-stat { background: var(--surface-2, #f4f5f9); border-radius: 8px; padding: 9px 10px; display: grid; gap: 1px; min-width: 0; }
.lgs .lgs-stat .k { font-size: .74rem; color: var(--muted, #5a6074); }
.lgs .lgs-stat .v { font-family: var(--f-mono, monospace); font-size: 1.05rem; }
.lgs .lgs-stack { display: flex; height: 14px; border-radius: 4px; overflow: hidden; gap: 2px; }
.lgs .lgs-stack i { display: block; height: 100%; min-width: 2px; }
.lgs .lgs-quote { border-left: 3px solid var(--wolf, #9a1b30); padding: 4px 0 4px 10px; display: grid; gap: 3px; }
.lgs .lgs-quote q { font-style: italic; }
.lgs .lgs-quote .why { font-size: .76rem; color: var(--muted, #5a6074); }
.lgs .lgs-rivals { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: .88rem; }
.lgs .lgs-rivals li { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line, #d7dae4); padding-bottom: 4px; }
.lgs .lgs-rivals li span:last-child { white-space: nowrap; }
.lgs .lgs-cols { display: grid; gap: 12px; } @media (min-width: 560px) { .lgs .lgs-cols { grid-template-columns: 1fr 1fr; } }
.lgs .lgs-keys { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-size: .8rem; }
.lgs .lgs-keys li { display: flex; gap: 6px; min-width: 0; } .lgs .lgs-keys b { font-family: var(--f-mono, monospace); color: var(--wolf, #9a1b30); }
.lgs .lgs-keys span { overflow-wrap: anywhere; }
.lgs .lgs-rivals span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.lgs .lgs-multiples { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.lgs .lgs-mult { border: 1px solid var(--line, #d7dae4); border-radius: 8px; padding: 8px 10px; display: grid; gap: 2px; min-width: 0; }
.lgs .lgs-mult .nm { font-size: .82rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgs .lgs-mult .sl { font-size: .76rem; font-family: var(--f-mono, monospace); }
.lgs .up { color: var(--ok, #2e7a4a); } .lgs .down { color: var(--wolf, #9a1b30); }

.lgs .lgs-games { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.lgs .lgs-games li > button { width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; border-bottom: 1px solid var(--line, #d7dae4);
  padding: 10px 2px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; cursor: pointer; }
.lgs .lgs-games li:last-child > button { border-bottom: 0; }
.lgs .lgs-win { font-weight: 700; font-size: .76rem; padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; }
.lgs .lgs-win.village { color: var(--village, #24617f); } .lgs .lgs-win.loups { color: var(--wolf, #9a1b30); } .lgs .lgs-win.egalite { color: var(--muted, #5a6074); }
.lgs .lgs-games .meta { color: var(--muted, #5a6074); font-size: .78rem; font-family: var(--f-mono, monospace); }
.lgs .lgs-games .who { grid-column: 1 / -1; color: var(--muted, #5a6074); font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgs .lgs-games .go { color: var(--muted, #5a6074); }

.lgs .lgs-cast { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.lgs .lgs-cast div { font-size: .8rem; border: 1px solid var(--line, #d7dae4); border-radius: 8px; padding: 6px 8px; min-width: 0; }
.lgs .lgs-cast b { display: block; }
.lgs .lgs-cast .r-loup { color: var(--wolf, #9a1b30); } .lgs .lgs-cast .r-village { color: var(--village, #24617f); }
.lgs .lgs-cast .md { color: var(--muted, #5a6074); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.lgs details.lgs-day { border: 1px solid var(--line, #d7dae4); border-radius: 8px; }
.lgs details.lgs-day > summary { cursor: pointer; padding: 9px 12px; font-weight: 700; font-size: .9rem; }
.lgs .lgs-tl { display: grid; gap: 8px; padding: 0 12px 12px; }
.lgs .lgs-ev { font-size: .86rem; display: grid; gap: 2px; }
.lgs .lgs-ev.secret { color: var(--muted, #5a6074); border-left: 2px dotted var(--muted, #5a6074); padding-left: 8px; }
.lgs .lgs-ev .who { font-weight: 700; }
.lgs .lgs-ev .th { font-size: .78rem; color: var(--muted, #5a6074); font-style: italic; }
.lgs .lgs-badge { display: inline-block; font-size: .7rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; margin-right: 4px; border: 1px solid currentColor; }
.lgs .lgs-badge.lie { color: var(--wolf, #9a1b30); } .lgs .lgs-badge.ok { color: var(--ok, #2e7a4a); } .lgs .lgs-badge.guess { color: var(--muted, #5a6074); }
.lgs .lgs-status { font-size: .84rem; } .lgs .lgs-status.err { color: var(--wolf, #9a1b30); font-weight: 700; }
@media (prefers-reduced-motion: no-preference) { .lgs .lgs-fill { transition: width .35s ease; } }
`;

  // ---------------------------------------------------------------- utilitaires
  const pct = (x, d = 0) => (x == null || isNaN(x) ? '–' : (x * 100).toFixed(d) + ' %');
  const num = (x, d = 1) => (x == null || isNaN(x) ? '–' : x.toFixed(d).replace('.', ','));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = (label) => String(label).replace(/^[^/]+\//, '');
  const sec = (ms) => (ms == null ? '–' : num(ms / 1000, 1) + ' s');
  const ROLE_CLASS = (r) => (r === 'Loup-Garou' ? 'r-loup' : 'r-village');
  const WIN = { village: 'Village', loups: 'Loups', egalite: 'Égalité', abandon: 'Abandon' };
  const MIN_GAMES = 3;

  function memo(store) {
    return {
      get(k, d) { try { const v = (store || localStorage).getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
      set(k, v) { try { (store || localStorage).setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
      del(k) { try { (store || localStorage).removeItem(k); } catch (_) { /* rien */ } },
    };
  }

  // Indicateurs du classement : get(model) -> { v, ci?, n? }
  const METRICS = [
    { key: 'win', name: 'Victoires', desc: 'Part des parties gagnées, tous rôles confondus.', fmt: pct, max: 1, get: (x) => ({ v: x.winRate, ci: x.winCI, n: x.games }) },
    { key: 'wolf', name: 'En loup', desc: 'Victoires quand le modèle est Loup-Garou : la tromperie efficace.', fmt: pct, max: 1, get: (x) => ({ v: x.wolf.rate, ci: x.wolf.ci, n: x.wolf.n }) },
    { key: 'village', name: 'Au village', desc: 'Victoires dans le camp du Village : la déduction collective.', fmt: pct, max: 1, get: (x) => ({ v: x.village.rate, ci: x.village.ci, n: x.village.n }) },
    { key: 'votes', name: 'Votes justes', desc: 'Part des votes d\'un villageois qui visent un vrai loup (votes blancs exclus).', fmt: pct, max: 1, get: (x) => ({ v: x.deduction.villageVoteAccuracy }) },
    { key: 'persuasion', name: 'Persuasion', desc: 'Quand le modèle accuse quelqu\'un, part des autres votants qui le suivent le jour même.', fmt: pct, max: 1, get: (x) => ({ v: x.persuasion }) },
    { key: 'lies', name: 'Mensonges', desc: 'Mensonges détectés par prise de parole pendant le débat, quand le modèle est loup (présentations à part). Ni bien ni mal en soi.', fmt: (v) => num(v, 2), get: (x) => ({ v: x.lies.perSpeechAsWolf, n: x.lies.claims }) },
    { key: 'stealth', name: 'Discrétion', desc: 'Voix reçues par jour de vote quand le modèle est loup. Plus bas = mieux caché.', fmt: (v) => num(v, 2), lowerBetter: true, get: (x) => ({ v: x.pressure.votesReceivedAsWolf }) },
    { key: 'survival', name: 'Survie', desc: 'Part moyenne de la partie passée en vie.', fmt: pct, max: 1, get: (x) => ({ v: x.survival.share }) },
    { key: 'mayor', name: 'Élu maire', desc: 'Part des élections du maire remportées : la confiance inspirée dès le départ.', fmt: pct, max: 1, get: (x) => ({ v: x.mayor.electedRate, ci: A.wilson(x.mayor.elected, x.mayor.games), n: x.mayor.games }) },
    { key: 'pack', name: 'Meneur de meute', desc: 'Part des votes de meute du modèle qui deviennent la victime de la nuit.', fmt: pct, max: 1, get: (x) => ({ v: x.pack.influence, n: x.pack.councils }) },
    { key: 'grudge', name: 'Rancune', desc: 'Dans une série : combien de fois plus le modèle vise un joueur qui l\'a visé dans une partie dont il se souvient. 1 = aucune rancune.', fmt: (v) => '×' + num(v, 2), ref: 1, refLabel: '1 = aucune rancune', get: (x) => ({ v: x.grudge.lift, n: x.grudge.n }) },
    { key: 'speed', name: 'Rapidité', desc: 'Temps moyen d\'une réponse. Plus bas = plus rapide.', fmt: sec, lowerBetter: true, get: (x) => ({ v: x.reliability.avgCallMs, n: x.reliability.calls }) },
    { key: 'blank', name: 'Votes blancs', desc: 'Part des votes restés blancs, surtout par dépassement du temps limite. Plus bas = mieux.', fmt: (v) => pct(v, 1), lowerBetter: true, get: (x) => ({ v: x.reliability.blankRate, n: x.reliability.votesCast }) },
    { key: 'judge', name: 'Juge IA', desc: 'Moyenne des notes du juge IA (logique, persuasion, stratégie), sur 10.', fmt: (v) => num(v, 1), max: 10, get: (x) => ({ v: x.judge.n ? (x.judge.logique + x.judge.persuasion + x.judge.strategie) / 3 : null, n: x.judge.n }) },
  ];

  // Axes du profil radar, normalisés entre le pire et le meilleur modèle
  const AXES = [
    { name: 'Victoire', get: (x) => x.winRate },
    { name: 'Tromperie', get: (x) => x.wolf.rate },
    { name: 'Déduction', get: (x) => x.deduction.villageVoteAccuracy },
    { name: 'Persuasion', get: (x) => x.persuasion },
    { name: 'Discrétion', get: (x) => (x.pressure.votesReceivedAsWolf == null ? null : -x.pressure.votesReceivedAsWolf) },
    { name: 'Fiabilité', get: (x) => (x.reliability.errorRate == null ? null : -(x.reliability.errorRate + (x.reliability.blankRate || 0))) },
  ];

  // ---------------------------------------------------------------- graphiques SVG
  function radar(vals, ref, labels) {
    const R = 92, cx = 150, cy = 120, n = labels.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const poly = (vs) => vs.map((v, i) => pt(i, R * (v == null ? 0 : 0.1 + 0.9 * v)).map((c) => c.toFixed(1)).join(',')).join(' ');
    let g = '';
    for (const f of [0.25, 0.5, 0.75, 1]) g += `<polygon class="grid" points="${labels.map((_, i) => pt(i, R * f).join(',')).join(' ')}"/>`;
    for (let i = 0; i < n; i++) { const [x, y] = pt(i, R); g += `<line class="grid" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; }
    const lab = labels.map((l, i) => {
      const [x, y] = pt(i, R + 16); const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" class="lab-ink">${esc(l)}</text>`;
    }).join('');
    const dots = vals.map((v, i) => (v == null ? '' : `<circle cx="${pt(i, R * (0.1 + 0.9 * v))[0].toFixed(1)}" cy="${pt(i, R * (0.1 + 0.9 * v))[1].toFixed(1)}" r="4" fill="var(--lgs-bar)" stroke="var(--surface, #fff)" stroke-width="2"/>`)).join('');
    return `<svg viewBox="0 0 300 240" role="img" aria-label="Profil du modèle comparé à la moyenne">${g}
      <polygon points="${poly(ref)}" fill="none" stroke="var(--muted, #5a6074)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <polygon points="${poly(vals)}" fill="var(--lgs-soft)" stroke="var(--lgs-bar)" stroke-width="2"/>${dots}${lab}</svg>`;
  }

  // Nuage de points : { x, y, label, n }
  function scatter(points, { xLabel, yLabel, xFmt, yFmt, xMax, yMax = 1 }) {
    const W = 340, H = 230, L = 50, B = 34, T = 10, Rr = 14;
    const xm = xMax || Math.max(0.1, ...points.map((p) => p.x)) * 1.15;
    const X = (v) => L + (v / xm) * (W - L - Rr), Y = (v) => H - B - (v / yMax) * (H - B - T);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const yv = (yMax * i) / 4, xv = (xm * i) / 4;
      g += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${Y(yv)}" y2="${Y(yv)}"/><text x="${L - 6}" y="${Y(yv) + 4}" text-anchor="end">${yFmt(yv)}</text>`;
      g += `<text x="${X(xv)}" y="${H - B + 16}" text-anchor="middle">${xFmt(xv)}</text>`;
    }
    // Points numérotés + légende sous le graphique : lisible même quand les points se touchent
    const dots = points.map((p, i) => {
      const x = X(p.x), y = Y(p.y);
      return `<g><title>${esc(p.label)} : ${xFmt(p.x)} ; ${yFmt(p.y)}${p.n != null ? ` (n = ${p.n})` : ''}</title>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="var(--wolf, #9a1b30)" stroke="var(--surface, #fff)" stroke-width="2"/>
        <text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" style="fill:var(--surface, #fff);font-size:10px;font-weight:700">${i + 1}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} selon ${esc(xLabel)}">${g}
      <text x="${(L + W - Rr) / 2}" y="${H - 2}" text-anchor="middle">${esc(xLabel)}</text>
      <text x="8" y="${(H - B) / 2}" text-anchor="middle" transform="rotate(-90 8 ${(H - B) / 2})">${esc(yLabel)}</text>${dots}</svg>
      <ol class="lgs-keys">${points.map((p, i) => `<li><b>${i + 1}</b><span>${esc(short(p.label))} · ${xFmt(p.x)} · ${yFmt(p.y)}</span></li>`).join('')}</ol>`;
  }

  // Courbes sur un même axe : series = [{ name, color, dash, pts: [{x, y}] }]
  function lines(series, { xs, yFmt = pct, yMax = 1 }) {
    const W = 340, H = 200, L = 40, B = 28, T = 10, Rr = 10;
    const n = Math.max(2, xs.length);
    const X = (i) => L + (i / (n - 1)) * (W - L - Rr), Y = (v) => H - B - (v / yMax) * (H - B - T);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = (yMax * i) / 4; g += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`; }
    xs.forEach((lab, i) => { g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`; });
    const paths = series.map((s) => {
      const p = s.pts.filter((q) => q.y != null);
      if (!p.length) return '';
      const d = p.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join('');
      const dots = p.map((q) => `<circle cx="${X(q.x).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--surface, #fff)" stroke-width="2"><title>${esc(s.name)}, ${esc(xs[q.x])} : ${yFmt(q.y)}</title></circle>`).join('');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>${dots}`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution au fil des parties">${g}${paths}</svg>`;
  }

  function spark(vals) {
    const W = 140, H = 36, p = vals.map((v, i) => ({ i, v })).filter((q) => q.v != null);
    if (p.length < 2) return '<svg viewBox="0 0 140 36"></svg>';
    const n = vals.length - 1 || 1;
    const X = (i) => 3 + (i / n) * (W - 6), Y = (v) => H - 3 - v * (H - 6);
    const d = p.map((q, k) => `${k ? 'L' : 'M'}${X(q.i).toFixed(1)},${Y(q.v).toFixed(1)}`).join('');
    const last = p[p.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="grid" x1="3" x2="${W - 3}" y1="${Y(0.5)}" y2="${Y(0.5)}"/>
      <path d="${d}" fill="none" stroke="var(--lgs-bar)" stroke-width="2"/><circle cx="${X(last.i)}" cy="${Y(last.v)}" r="3.5" fill="var(--lgs-bar)"/></svg>`;
  }

  function bars(rows, M) {
    if (!rows.length) return `<p class="lgs-hint">${M.key === 'judge' ? 'Aucune partie notée : lance le juge IA dans l\'onglet Données.' : 'Pas encore assez de données pour cet indicateur.'}</p>`;
    const max = M.max || Math.max(1e-9, ...rows.map((r) => (r.ci ? r.ci[1] : r.v)), M.ref || 0) * 1.1;
    const W = (v) => Math.max(0, Math.min(100, (v / max) * 100));
    const ref = M.ref != null ? M.ref : rows.reduce((s, r) => s + r.v, 0) / rows.length;
    const li = rows.map((r) => {
      const tip = `${r.x.label} : ${M.fmt(r.v)}${r.ci ? ` (IC 95 % : ${pct(r.ci[0])} à ${pct(r.ci[1])})` : ''}${r.n != null ? `, n = ${r.n}` : ''}`;
      return `<li title="${esc(tip)}" data-model="${esc(r.x.label)}"><div class="lab"><span>${esc(short(r.x.label))}</span><span><span class="val">${M.fmt(r.v)}</span>${r.n != null ? ` <span class="n">n=${r.n}</span>` : ''}</span></div>
        <div class="lgs-track" role="img" aria-label="${esc(tip)}"><span class="lgs-fill${r.cls ? ' ' + r.cls : ''}" style="width:${W(r.v)}%"></span>${r.ci ? `<span class="lgs-ci" style="left:${W(r.ci[0])}%;width:${W(r.ci[1]) - W(r.ci[0])}%"></span>` : ''}<span class="lgs-ref" style="left:${W(ref)}%"></span></div></li>`;
    }).join('');
    return `<ol class="lgs-bars">${li}</ol><div class="lgs-axis"><span>0</span><span>pointillés : ${M.refLabel || 'moyenne ' + M.fmt(ref)}</span><span>${M.fmt(max)}</span></div>`;
  }

  const heatCell = (rate, txt, n) => (rate == null ? '<td class="dim">–</td>'
    : `<td style="background:color-mix(in srgb, var(--village, #24617f) ${Math.round(8 + rate * 52)}%, transparent)">${txt}${n != null ? ` <span class="dim">(${n})</span>` : ''}</td>`);

  // ---------------------------------------------------------------- composant
  function mount(el, opts = {}) {
    if (!document.getElementById('lgs-style')) {
      const st = document.createElement('style'); st.id = 'lgs-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    const S = memo(opts.store);
    const P = opts.prefix || 'lgs.';
    const state = {
      logs: [], source: 'own', metrics: null,
      tab: S.get(P + 'tab', 'resume'), metric: S.get(P + 'metric', 'win'), model: S.get(P + 'model', null),
      game: null, filter: 'all',
    };
    el.classList.add('lgs');
    const TABS = [['resume', 'Résumé'], ['compare', 'Comparer'], ['model', 'Modèles'], ['series', 'Séries'], ['games', 'Parties']].concat(opts.showData ? [['data', 'Données']] : []);

    function setLogs(logs, source) {
      state.logs = (logs || []).filter((l) => l && !A.validateLog(l).length);
      state.source = source || state.source;
      state.metrics = A.computeMetrics(state.logs);
      if (!state.metrics.models.some((m) => m.label === state.model)) state.model = state.metrics.models[0]?.label || null;
      render();
    }

    function render() {
      const M = state.metrics;
      const synth = state.logs.length && state.logs.every((l) => l.synthetic);
      const tabs = `<div class="lgs-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" class="lgs-tab" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${n}</button>`).join('')}</div>`;
      const banner = synth ? '<p class="lgs-banner">Exemples simulés : ces parties ont été jouées par le vrai moteur avec des agents factices. Elles montrent l\'interface, pas la force des vrais modèles.</p>' : '';
      let body;
      if (!M.totals.games && state.tab !== 'data' && state.tab !== 'games') body = `<div class="lgs-card"><h3>Pas encore de parties</h3><p class="lgs-hint">Les statistiques apparaîtront après la première partie terminée${opts.showData ? ', ou en important des logs dans l\'onglet Données' : ''}.</p></div>`;
      else body = ({ resume: vResume, compare: vCompare, model: vModel, series: vSeries, games: vGames, data: vData }[state.tab] || vResume)();
      el.innerHTML = tabs + banner + body;
    }

    // ------------------------------------------------ Résumé
    function vResume() {
      const M = state.metrics, t = M.totals;
      const lies = M.games.reduce((s, g) => s + g.lies, 0);
      const vw = t.villageWins / t.games, ww = t.wolfWins / t.games;
      const kpi = (k, v, s, extra = '') => `<div class="lgs-kpi"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span>${extra}</div>`;
      const ranked = M.models.filter((m) => m.games >= MIN_GAMES).sort((a, b) => b.winRate - a.winRate);
      const podium = ranked.slice(0, 3).map((m, i) => `<li data-model="${esc(m.label)}"><span class="rank">${i + 1}</span>
        <span style="min-width:0"><span class="nm" style="display:block">${esc(short(m.label))}</span><span class="sub">${m.games} parties · loup ${pct(m.wolf.rate)} · village ${pct(m.village.rate)}</span></span>
        <span class="val">${pct(m.winRate)}</span></li>`).join('');
      return `<div class="lgs-kpis">
        ${kpi('Parties', t.games, `${M.models.length} modèles${t.draws ? `, ${t.draws} égalité(s)` : ''}${t.tests ? `, ${t.tests} test(s) à part` : ''}`)}
        ${kpi('Village gagne', pct(vw), `Loups : ${pct(ww)}`, `<div class="lgs-split" aria-hidden="true"><i style="width:${vw * 100}%;background:var(--village,#24617f)"></i><i style="width:${ww * 100}%;background:var(--wolf,#9a1b30)"></i></div>`)}
        ${kpi('Durée', num(t.avgDays, 1), 'jours par partie')}
        ${kpi('Mensonges', num(lies / t.games, 1), 'par partie')}
      </div>
      <section class="lgs-card"><h3>Podium</h3><p class="lgs-hint">Taux de victoire, modèles avec au moins ${MIN_GAMES} parties. Touche un modèle pour sa fiche.</p>
        ${podium ? `<ol class="lgs-podium">${podium}</ol>` : '<p class="lgs-hint">Pas encore assez de parties par modèle.</p>'}</section>
      <section class="lgs-card"><h3>Faits marquants</h3><div class="lgs-facts">${facts().join('') || '<p class="lgs-hint">Il faut quelques parties de plus.</p>'}</div></section>
      <section class="lgs-card"><h3>Qui gagne dans quel camp</h3><p class="lgs-hint">Barre rouge : victoires en loup. Barre bleue : victoires au village.</p>${campBars()}</section>`;
    }

    function facts() {
      const ms = state.metrics.models.filter((m) => m.games >= MIN_GAMES);
      const best = (get, low) => { const c = ms.map((m) => ({ m, v: get(m) })).filter((x) => x.v != null); if (!c.length) return null; c.sort((a, b) => (low ? a.v - b.v : b.v - a.v)); return c[0]; };
      const F = [
        ['Meilleur loup', best((m) => (m.wolf.n >= 2 ? m.wolf.rate : null)), (v) => pct(v), 'de victoires en loup'],
        ['Meilleur détective', best((m) => m.deduction.villageVoteAccuracy), (v) => pct(v), 'de votes contre de vrais loups'],
        ['Plus persuasif', best((m) => m.persuasion), (v) => pct(v), 'des votants suivent ses accusations'],
        ['Plus grand menteur', best((m) => m.lies.perSpeechAsWolf), (v) => num(v, 2), 'mensonges par discours en loup'],
        ['Plus discret', best((m) => m.pressure.votesReceivedAsWolf, true), (v) => num(v, 2), 'voix reçues par jour en loup'],
        ['Plus rapide', best((m) => m.reliability.avgCallMs, true), sec, 'par réponse en moyenne'],
        ['Plus rancunier', best((m) => (m.grudge.n >= 10 ? m.grudge.lift : null)), (v) => '×' + num(v, 2), 'cible ceux qui l\'ont visé'],
        ['Progresse le plus', best((m) => m.learning), (v) => (v >= 0 ? '+' : '−') + num(Math.abs(v * 100), 1) + ' pt', 'de votes justes par partie'],
        ['Inspire confiance', best((m) => m.mayor.electedRate), (v) => pct(v), 'des élections du maire gagnées'],
      ];
      return F.filter(([, b]) => b).map(([t, b, f, d]) => `<button type="button" class="lgs-fact" data-model="${esc(b.m.label)}"><span class="t">${t}</span><span class="m">${esc(short(b.m.label))}</span><span class="v">${f(b.v)}</span><span class="d">${d}</span></button>`);
    }

    function campBars() {
      const ms = state.metrics.models.slice().sort((a, b) => b.winRate - a.winRate);
      return `<ol class="lgs-bars">${ms.map((m) => `<li data-model="${esc(m.label)}"><div class="lab"><span>${esc(short(m.label))}</span><span class="val">${pct(m.wolf.rate)} · ${pct(m.village.rate)}</span></div>
        <div class="lgs-track" style="height:8px"><span class="lgs-fill wolf" style="width:${(m.wolf.rate || 0) * 100}%"></span></div>
        <div class="lgs-track" style="height:8px"><span class="lgs-fill village" style="width:${(m.village.rate || 0) * 100}%"></span></div></li>`).join('')}</ol>`;
    }

    // ------------------------------------------------ Comparer
    function vCompare() {
      const Mx = METRICS.find((m) => m.key === state.metric) || METRICS[0];
      const rows = state.metrics.models.map((x) => ({ x, ...Mx.get(x) })).filter((r) => r.v != null)
        .sort((a, b) => (Mx.lowerBetter ? a.v - b.v : b.v - a.v));
      const pts = state.metrics.models.filter((m) => m.lies.perSpeechAsWolf != null && m.wolf.rate != null).map((m) => ({ x: m.lies.perSpeechAsWolf, y: m.wolf.rate, label: m.label, n: m.wolf.n })).sort((a, b) => b.y - a.y);
      const roles = A.ROLES;
      const roleTable = `<thead><tr><th>Modèle</th>${roles.map((r) => `<th>${r}</th>`).join('')}</tr></thead><tbody>${state.metrics.models.map((x) => `<tr><td title="${esc(x.label)}">${esc(short(x.label))}</td>${roles.map((r) => { const c = x.byRole[r]; return c.n ? heatCell(c.rate, pct(c.rate), c.n) : '<td class="dim">–</td>'; }).join('')}</tr>`).join('')}</tbody>`;
      return `<section class="lgs-card"><h3>Classement</h3>
        <div class="lgs-chips" role="group" aria-label="Indicateur">${METRICS.map((m) => `<button type="button" class="lgs-chip" data-metric="${m.key}" aria-pressed="${m.key === Mx.key}">${m.name}</button>`).join('')}</div>
        <p style="font-size:.88rem">${Mx.desc}</p>${bars(rows, Mx)}
        ${rows.some((r) => r.ci) ? '<p class="lgs-hint">Trait fin : intervalle de confiance à 95 %. Deux modèles dont les traits se chevauchent ne sont pas vraiment départagés.</p>' : ''}</section>
      <section class="lgs-card"><h3>Mentir rapporte-t-il ?</h3><p class="lgs-hint">Chaque point est un modèle joué en loup : à droite il ment souvent, en haut il gagne souvent.</p>
        ${pts.length ? scatter(pts, { xLabel: 'mensonges par discours (loup)', yLabel: 'victoires en loup', xFmt: (v) => num(v, 1), yFmt: (v) => pct(v) }) : '<p class="lgs-hint">Pas encore de données.</p>'}</section>
      <section class="lgs-card"><h3>Victoires par rôle</h3><p class="lgs-hint">Entre parenthèses, le nombre de parties dans ce rôle. Plus la case est foncée, plus le taux est haut.</p>
        <div class="lgs-tablewrap"><table>${roleTable}</table></div></section>
      <section class="lgs-card"><h3>Tous les chiffres</h3><div class="lgs-tablewrap"><table>${fullTable()}</table></div></section>`;
    }

    function fullTable() {
      const cols = [
        ['Parties', (x) => x.games], ['Victoires', (x) => pct(x.winRate)], ['En loup', (x) => pct(x.wolf.rate)], ['Au village', (x) => pct(x.village.rate)],
        ['Survie', (x) => pct(x.survival.share)], ['Mensonges', (x) => num(x.lies.perSpeech, 2)], ['Votes justes', (x) => pct(x.deduction.villageVoteAccuracy)],
        ['Accusations justes', (x) => pct(x.deduction.accusationAccuracy)], ['Persuasion', (x) => pct(x.persuasion)], ['Loup démasqué', (x) => pct(x.pressure.wolfUnmaskedRate)],
        ['Voyante', (x) => pct(x.powers.seerHitRate)], ['Sorcière vie', (x) => pct(x.powers.witchSaveRate)], ['Meute suivie', (x) => pct(x.pack.influence)],
        ['Élu maire', (x) => pct(x.mayor.electedRate)], ['Rancune', (x) => (x.grudge.lift == null ? '–' : '×' + num(x.grudge.lift, 2))],
        ['Réponse', (x) => sec(x.reliability.avgCallMs)], ['Hors délai', (x) => pct(x.reliability.timeoutRate, 1)], ['Votes blancs', (x) => x.reliability.blankVotes],
        ['Fuites d\'identité', (x) => x.reliability.identityLeaks], ['Juge', (x) => (x.judge.n ? num((x.judge.logique + x.judge.persuasion + x.judge.strategie) / 3, 1) : '–')],
      ];
      return `<thead><tr><th>Modèle</th>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${state.metrics.models.map((x) => `<tr><td title="${esc(x.label)}">${esc(short(x.label))}</td>${cols.map((c) => `<td>${c[1](x)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    }

    // ------------------------------------------------ Fiche modèle
    function vModel() {
      const ms = state.metrics.models;
      const m = ms.find((x) => x.label === state.model) || ms[0];
      if (!m) return '';
      const rank = ms.slice().sort((a, b) => b.winRate - a.winRate).findIndex((x) => x.label === m.label) + 1;
      // radar normalisé min-max entre modèles
      const norm = AXES.map((ax) => {
        const vs = ms.map((x) => ax.get(x)).filter((v) => v != null);
        const lo = Math.min(...vs), hi = Math.max(...vs);
        const f = (v) => (v == null ? null : hi > lo ? (v - lo) / (hi - lo) : 0.5);
        return { me: f(ax.get(m)), avg: vs.length ? f(vs.reduce((s, v) => s + v, 0) / vs.length) : null };
      });
      const stat = (k, v) => `<div class="lgs-stat"><span class="k">${k}</span><span class="v">${v}</span></div>`;
      const roleRows = A.ROLES.map((r) => ({ x: { label: r }, v: m.byRole[r].rate, ci: m.byRole[r].ci, n: m.byRole[r].n, cls: r === 'Loup-Garou' ? 'wolf' : 'village' })).filter((r) => r.n);
      const dc = m.survival.deathCauses, dTot = (dc.loups || 0) + (dc.vote || 0) + (dc.poison || 0);
      const alive = Math.round((m.survival.toEnd || 0) * m.games);
      const deaths = [['Survit', alive, 'var(--ok, #2e7a4a)'], ['Dévoré', dc.loups || 0, 'var(--wolf, #9a1b30)'], ['Éliminé au vote', dc.vote || 0, 'var(--moon, #9a6a0c)'], ['Empoisonné', dc.poison || 0, 'var(--muted, #5a6074)']];
      const total = alive + dTot || 1;
      const H = state.metrics.series.hostility, i = H.labels.indexOf(m.label);
      const targets = i < 0 ? [] : H.labels.map((l, j) => ({ l, r: H.rate[i][j] })).filter((x) => x.r != null && x.l !== m.label).sort((a, b) => b.r - a.r).slice(0, 3);
      const hunters = i < 0 ? [] : H.labels.map((l, j) => ({ l, r: H.rate[j][i] })).filter((x) => x.r != null && x.l !== m.label).sort((a, b) => b.r - a.r).slice(0, 3);
      const prog = m.progression;
      const quotes = lieExamples(m.label, 3);
      const L = m.lies.types;
      return `<section class="lgs-card">
        <div class="lgs-chips" role="group" aria-label="Modèle">${ms.map((x) => `<button type="button" class="lgs-chip" data-pick="${esc(x.label)}" aria-pressed="${x.label === m.label}">${esc(short(x.label))}</button>`).join('')}</div>
        <div class="lgs-head"><div style="min-width:0"><div class="nm">${esc(short(m.label))}</div><p class="lgs-hint">${esc(m.label)} · ${m.games} parties · ${rank}<sup>e</sup> sur ${ms.length}</p></div>
          <div style="text-align:right"><div class="big">${pct(m.winRate)}</div><p class="lgs-hint">victoires${m.winCI ? ` (${pct(m.winCI[0])} à ${pct(m.winCI[1])})` : ''}</p></div></div>
      </section>
      <section class="lgs-card"><h3>Profil</h3><p class="lgs-hint">Chaque axe va du plus faible (centre) au meilleur (bord) des modèles comparés. Pointillés : la moyenne.</p>
        ${radar(norm.map((x) => x.me), norm.map((x) => x.avg), AXES.map((a) => a.name))}
        <div class="lgs-legend"><span><i style="background:var(--lgs-bar)"></i>${esc(short(m.label))}</span><span><i class="dash"></i>moyenne des modèles</span></div></section>
      <section class="lgs-card"><h3>Selon le rôle</h3>${bars(roleRows, { key: 'role', fmt: pct, max: 1, refLabel: 'moyenne de ses rôles' })}</section>
      <section class="lgs-card"><h3>En jeu</h3><div class="lgs-grid2">
        ${stat('Votes justes (village)', pct(m.deduction.villageVoteAccuracy))}${stat('Accusations justes', pct(m.deduction.accusationAccuracy))}
        ${stat('Persuasion', pct(m.persuasion))}${stat('Voix reçues en loup', num(m.pressure.votesReceivedAsWolf, 2))}
        ${stat('Loup démasqué au vote', pct(m.pressure.wolfUnmaskedRate))}${stat('Meneur de meute', pct(m.pack.influence))}
        ${stat('Voyante : loups trouvés', pct(m.powers.seerHitRate))}${stat('Sorcière : poison sur loup', pct(m.powers.witchPoisonAccuracy))}
        ${stat('Élu maire', `${pct(m.mayor.electedRate)}`)}${stat('Gagne quand maire', pct(m.mayor.winRateAsMayor))}
        ${stat('Temps de réponse', sec(m.reliability.avgCallMs))}${stat('Hors délai', pct(m.reliability.timeoutRate, 1))}
      </div>
      <h4>Comment la partie se termine pour lui</h4>
      <div class="lgs-stack" role="img" aria-label="${deaths.map((d) => `${d[0]} ${d[1]}`).join(', ')}">${deaths.filter((d) => d[1]).map((d) => `<i style="width:${(d[1] / total) * 100}%;background:${d[2]}" title="${d[0]} : ${d[1]}"></i>`).join('')}</div>
      <div class="lgs-legend">${deaths.map((d) => `<span><i style="background:${d[2]}"></i>${d[0]} ${pct(d[1] / total)}</span>`).join('')}</div></section>
      <section class="lgs-card"><h3>Mensonges</h3><div class="lgs-grid2">
        ${stat('Par discours en loup', num(m.lies.perSpeechAsWolf, 2))}${stat('Par discours au village', num(m.lies.perSpeechAsVillage, 2))}
        ${stat('Faux rôle annoncé', L.faux_role)}${stat('Fausse accusation', L.fausse_accusation)}
        ${stat('Couvre un loup', L.couverture)}${stat('Gagne après avoir menti', pct(m.lies.wolfLiedWinRate))}
        ${stat('Présentations (loup)', num(m.lies.presentation.perSpeechAsWolf, 2))}${stat('Présentations (tous)', num(m.lies.presentation.perSpeech, 2))}</div>
        <p class="lgs-hint">Les chiffres « par discours » portent sur le débat ; les présentations avant l'élection du maire sont comptées à part.</p>
        ${quotes.length ? `<h4>Exemples tirés des parties</h4>${quotes.join('')}` : ''}</section>
      <section class="lgs-card"><h3>Rivalités</h3><div class="lgs-cols">
        <div><h4>Vise le plus</h4><ul class="lgs-rivals">${targets.map((x) => `<li><span>${esc(short(x.l))}</span><span class="lgs-mono">${pct(x.r)}</span></li>`).join('') || '<li class="dim">–</li>'}</ul></div>
        <div><h4>Visé le plus par</h4><ul class="lgs-rivals">${hunters.map((x) => `<li><span>${esc(short(x.l))}</span><span class="lgs-mono">${pct(x.r)}</span></li>`).join('') || '<li class="dim">–</li>'}</ul></div></div>
        <p class="lgs-hint">Part des parties communes où l'un a voté contre, accusé, attaqué ou empoisonné l'autre.${m.grudge.lift != null ? ` Rancune : ×${num(m.grudge.lift, 2)} (vise ${pct(m.grudge.afterHarm)} de ceux qui l'ont visé avant, contre ${pct(m.grudge.otherwise)} des autres).` : ''}</p></section>
      ${prog.length > 1 ? `<section class="lgs-card"><h3>Au fil des séries</h3><p class="lgs-hint">Votes justes à la 1<sup>re</sup>, 2<sup>e</sup>… partie de chaque série.</p>
        ${lines([{ name: 'Votes justes', color: 'var(--lgs-bar)', pts: prog.map((p) => ({ x: p.index, y: p.voteAccuracy })) }], { xs: Array.from({ length: Math.max(...prog.map((p) => p.index)) + 1 }, (_, k) => 'P' + (k + 1)) })}
        <p class="lgs-hint">Tendance : ${m.learning == null ? '–' : `${m.learning >= 0 ? '+' : '−'}${num(Math.abs(m.learning * 100), 1)} point par partie`}.</p></section>` : ''}`;
    }

    function lieExamples(label, k) {
      const out = [];
      for (const log of state.logs.slice().reverse()) {
        const mine = new Set(log.players.filter((p) => p.seat.label === label).map((p) => p.id));
        if (!mine.size) continue;
        const bySeq = new Map(log.events.map((e) => [e.seq, e]));
        for (const r of A.analyzeClaims(log)) {
          if (!mine.has(r.actor)) continue;
          const lie = r.claims.find((c) => c.verdict === 'mensonge');
          if (!lie) continue;
          const e = bySeq.get(r.seq), p = log.players.find((q) => q.id === r.actor);
          const what = { faux_role: `se dit ${lie.role} alors qu'il est ${p.role}`, fausse_accusation: `accuse Joueur ${lie.target}, qu'il sait innocent`, couverture: `blanchit Joueur ${lie.target}, son partenaire loup`, autre: 'contredit ce qu\'il sait' }[lie.lieType];
          out.push(`<div class="lgs-quote"><q>${esc(String(e.message).slice(0, 220))}</q><span class="why">${e.phase === 'mayor' ? 'Présentations' : 'Jour ' + e.day} · ${esc(p.role)} · ${what}</span></div>`);
          break;
        }
        if (out.length >= k) break;
      }
      return out;
    }

    // ------------------------------------------------ Séries
    function vSeries() {
      const Sx = state.metrics.series;
      if (!Sx.count) return `<section class="lgs-card"><h3>Pas encore de série</h3><p class="lgs-hint">Lance une série de parties (mêmes joueurs, mémoire des parties précédentes) pour voir si les modèles se cernent au fil du temps et s'ils deviennent rancuniers.</p></section>${hostility()}`;
      const N = Math.max(...Sx.progression.map((p) => p.index)) + 1;
      const xs = Array.from({ length: N }, (_, k) => 'P' + (k + 1));
      const G = Sx.grudge;
      const gRows = state.metrics.models.map((x) => ({ x, v: x.grudge.lift, n: x.grudge.n })).filter((r) => r.v != null).sort((a, b) => b.v - a.v);
      const mult = state.metrics.models.filter((m) => m.progression.length > 1).map((m) => {
        const vals = xs.map((_, k) => m.progression.find((p) => p.index === k)?.voteAccuracy ?? null);
        const sl = m.learning;
        return `<div class="lgs-mult" data-model="${esc(m.label)}"><span class="nm">${esc(short(m.label))}</span>${spark(vals)}<span class="sl ${sl > 0.005 ? 'up' : sl < -0.005 ? 'down' : 'dim'}">${sl == null ? '–' : `${sl >= 0 ? '▲ +' : '▼ −'}${num(Math.abs(sl * 100), 1)} pt/partie`}</span></div>`;
      }).join('');
      return `<section class="lgs-card"><h3>Le village apprend-il ?</h3><p class="lgs-hint">${Sx.count} série(s), ${Sx.games} parties. Moyenne de toutes les séries, partie par partie.</p>
        ${lines([
          { name: 'Votes justes du village', color: 'var(--village, #24617f)', pts: Sx.progression.map((p) => ({ x: p.index, y: p.villageVoteAccuracy })) },
          { name: 'Victoires du village', color: 'var(--moon, #9a6a0c)', dash: true, pts: Sx.progression.map((p) => ({ x: p.index, y: p.villageWinRate })) },
        ], { xs })}
        <div class="lgs-legend"><span><i style="background:var(--village,#24617f)"></i>votes justes du village</span><span><i style="background:var(--moon,#9a6a0c)"></i>victoires du village (pointillés)</span></div></section>
      <section class="lgs-card"><h3>Progression par modèle</h3><p class="lgs-hint">Votes justes partie après partie ; la ligne fine marque 50 %.</p><div class="lgs-multiples">${mult}</div></section>
      <section class="lgs-card"><h3>Rancune</h3><p class="lgs-hint">En moyenne, un joueur vise ×${num(G.lift, 2)} plus souvent quelqu'un qui l'a visé dans une partie dont il se souvient (${pct(G.afterHarm)} contre ${pct(G.otherwise)}).</p>
        ${bars(gRows, METRICS.find((m) => m.key === 'grudge'))}</section>
      ${hostility()}`;
    }

    function hostility() {
      const H = state.metrics.series.hostility;
      if (!H.labels.length) return '';
      const vals = H.rate.flat().filter((v) => v != null);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const rel = (v) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
      return `<section class="lgs-card"><h3>Qui vise qui</h3><p class="lgs-hint">Ligne = qui agit, colonne = qui est visé. Plus la case est foncée, plus la paire s'affronte par rapport aux autres.</p>
        <div class="lgs-tablewrap"><table><thead><tr><th>Agit ↓ / visé →</th>${H.labels.map((l) => `<th title="${esc(l)}">${esc(short(l).slice(0, 12))}</th>`).join('')}</tr></thead>
        <tbody>${H.labels.map((l, i) => `<tr><td title="${esc(l)}">${esc(short(l))}</td>${H.labels.map((_, j) => (H.rate[i][j] == null ? '<td class="dim">–</td>' : heatCell(rel(H.rate[i][j]), pct(H.rate[i][j])))).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    }

    // ------------------------------------------------ Parties et rejeu
    function vGames() {
      if (state.game) return vReplay();
      const list = state.logs.slice().sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        .filter((l) => state.filter === 'all' || l.outcome.winner === state.filter);
      const chips = [['all', 'Toutes'], ['village', 'Village'], ['loups', 'Loups']].map(([k, n]) => `<button type="button" class="lgs-chip" data-filter="${k}" aria-pressed="${state.filter === k}">${n}</button>`).join('');
      const gm = new Map(state.metrics.games.map((g) => [g.id, g]));
      const items = list.slice(0, 60).map((l) => {
        const g = gm.get(l.id) || { lies: 0 };
        const wolves = l.players.filter((p) => p.role === 'Loup-Garou').map((p) => short(p.seat.label)).join(' et ');
        const d = l.startedAt ? new Date(l.startedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        return `<li><button type="button" data-game="${esc(l.id)}"><span class="lgs-win ${l.outcome.winner}">${WIN[l.outcome.winner]}</span>
          <span class="meta">${l.forcedRoles ? 'test, hors classement · ' : ''}${l.series ? `série ${l.series.index + 1} · ` : ''}${l.outcome.days} j · ${g.lies} mensonges · ${d}</span><span class="go" aria-hidden="true">›</span>
          <span class="who">Loups : ${esc(wolves)}</span></button></li>`;
      }).join('');
      return `<section class="lgs-card"><h3>Parties</h3><p class="lgs-hint">Touche une partie pour la revoir, coulisses comprises.</p>
        <div class="lgs-chips">${chips}</div><ul class="lgs-games">${items || '<li class="lgs-hint">Aucune partie.</li>'}</ul></section>`;
    }

    function vReplay() {
      const log = state.logs.find((l) => l.id === state.game);
      if (!log) { state.game = null; return vGames(); }
      const P = new Map(log.players.map((p) => [p.id, p]));
      const nm = (id) => (id == null ? 'vote blanc' : `Joueur ${id}`);
      const claims = new Map(A.analyzeClaims(log).map((r) => [r.seq, r.claims]));
      const mayorId = (log.events.find((e) => e.type === 'mayor_elected') || {}).target;
      const cast = log.players.map((p) => `<div><b class="${ROLE_CLASS(p.role)}">Joueur ${p.id}${p.id === mayorId ? ' · Maire' : ''}</b>${esc(p.role)}<span class="md">${esc(short(p.seat.label))}</span></div>`).join('');
      // regroupe par jour : 0 = présentations
      const days = new Map();
      for (const e of log.events) { const k = e.phase === 'mayor' ? 0 : e.day; if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
      const badge = (c) => (c.verdict === 'mensonge' ? `<span class="lgs-badge lie">Mensonge</span>` : c.verdict === 'vrai' ? '<span class="lgs-badge ok">Vrai</span>' : `<span class="lgs-badge guess">${c.verdict === 'supposition_juste' ? 'Intuition juste' : 'Intuition fausse'}</span>`);
      const evHtml = (e, list) => {
        const th = e.thought ? `<span class="th">Pensée : ${esc(e.thought)}</span>` : '';
        switch (e.type) {
          case 'seer': return `<div class="lgs-ev secret"><span><span class="who">Voyante (Joueur ${e.actor})</span> sonde ${nm(e.target)} : ${esc(e.result)}</span>${th}</div>`;
          case 'wolf_chat': return `<div class="lgs-ev secret"><span><span class="who">Joueur ${e.actor}</span>, canal des loups : « ${esc(e.message)} »${e.proposal ? ` (propose ${nm(e.proposal)})` : ''}</span>${th}</div>`;
          case 'wolf': return `<div class="lgs-ev secret"><span><span class="who">Loup Joueur ${e.actor}</span> vote pour attaquer ${nm(e.target)}</span>${th}</div>`;
          case 'wolf_decision': return `<div class="lgs-ev secret"><span>La meute attaque ${nm(e.target)}${e.unanimous ? ' à l\'unanimité' : e.random ? ' (tirage au sort)' : ' (majorité)'}.</span></div>`;
          case 'witch': return `<div class="lgs-ev secret"><span><span class="who">Sorcière (Joueur ${e.actor})</span> ${e.saved ? `sauve ${nm(e.attacked)}` : 'ne sauve personne'}${e.poison ? `, empoisonne ${nm(e.poison)}` : ''}</span>${th}</div>`;
          case 'dawn': return `<div class="lgs-ev"><span><b>Aube :</b> ${(e.dead || []).map((d) => `${nm(d.pid)} (${esc(d.role)}) ${d.cause === 'poison' ? 'empoisonné' : 'dévoré'}`).join(', ') || 'personne n\'est mort'}.</span></div>`;
          case 'speech': {
            const cs = claims.get(e.seq) || [];
            const tags = cs.map((c) => `${badge(c)}<span class="dim" style="font-size:.76rem">${c.self ? 'se dit' : nm(c.target) + ' est'} ${esc(c.role)}${c.verdict === 'mensonge' || c.verdict === 'supposition_fausse' ? ` (en réalité ${esc(c.truth)})` : ''}</span>`).join(' ');
            return `<div class="lgs-ev"><span><span class="who">Joueur ${e.actor}</span> <span class="dim">(${esc(P.get(e.actor)?.role)})</span> : « ${esc(e.message)} »</span>${tags ? `<span>${tags}</span>` : ''}${th}</div>`;
          }
          case 'mayor_elected': {
            const vs = list.filter((x) => x.type === 'mayor_vote');
            return `<div class="lgs-ev"><span><b>Élection du maire :</b> ${vs.map((v) => `${v.actor}→${v.target ?? '∅'}`).join(', ')}. Élu : ${nm(e.target)}.</span></div>`;
          }
          case 'mayor_succession': return `<div class="lgs-ev"><span>Le maire défunt Joueur ${e.actor} désigne ${nm(e.target)}.</span></div>`;
          case 'elimination': {
            const vs = list.filter((x) => x.type === 'vote');
            return `<div class="lgs-ev"><span><b>Vote :</b> ${vs.map((v) => `${v.actor}→${v.target ?? '∅'}${v.weight > 1 ? '×2' : ''}`).join(', ')}.</span><span><b>${e.target != null ? `${nm(e.target)} est éliminé (${esc(e.role)}).` : 'Égalité : personne n\'est éliminé.'}</b></span></div>`;
          }
          case 'error': return `<div class="lgs-ev secret"><span>Joueur ${e.actor} n'a pas répondu à temps (${esc(e.task || 'action')}).</span></div>`;
          default: return '';
        }
      };
      const dayHtml = [...days.entries()].map(([d, list], i) => `<details class="lgs-day"${i < 2 ? ' open' : ''}><summary>${d === 0 ? 'Présentations et maire' : `Nuit et jour ${d}`}</summary>
        <div class="lgs-tl">${list.map((e) => evHtml(e, list)).join('')}</div></details>`).join('');
      return `<section class="lgs-card"><div class="lgs-row" style="justify-content:space-between"><button type="button" class="lgs-btn" data-back="1">‹ Toutes les parties</button><span class="lgs-win ${log.outcome.winner}">${WIN[log.outcome.winner]}</span></div>
        <h3>Partie du ${log.startedAt ? new Date(log.startedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}</h3>
        <p class="lgs-hint">${log.outcome.days} jours${log.series ? ` · série ${esc(log.series.id)}, partie ${log.series.index + 1}` : ''}. Les lignes en pointillés sont secrètes (nuit, pensées).</p>
        <div class="lgs-cast">${cast}</div></section>${dayHtml}`;
    }

    // ------------------------------------------------ Données (tableau de bord autonome)
    function vData() {
      const n = state.logs.length, judged = state.logs.filter((l) => l.judge).length;
      return `<section class="lgs-card"><h3>Parties chargées</h3>
        <p class="lgs-hint">${n} partie(s)${state.source === 'samples' ? ' d\'exemple' : ''}. Les parties importées restent dans ce navigateur.</p>
        <div class="lgs-row"><label class="lgs-btn" for="lgs-file">Importer des fichiers JSON</label><input id="lgs-file" type="file" accept=".json,application/json" multiple hidden>
          <button type="button" class="lgs-btn" data-act="paste">Coller du JSON</button>${opts.samples ? '<button type="button" class="lgs-btn" data-act="samples">Revenir aux exemples</button>' : ''}<button type="button" class="lgs-btn" data-act="clear">Vider</button></div>
        <div id="lgs-paste" hidden><label class="lgs-field" for="lgs-paste-in">Log d'une partie, tableau de logs, ou export de l'app<textarea id="lgs-paste-in" rows="5" spellcheck="false"></textarea></label>
          <div class="lgs-row" style="margin-top:8px"><button type="button" class="lgs-btn primary" data-act="paste-ok">Ajouter</button></div></div>
        <p class="lgs-status" id="lgs-data-status" role="status"></p></section>
      <section class="lgs-card"><h3>Juge IA</h3><p class="lgs-hint">Un modèle arbitre relit chaque partie (joueurs anonymes, rôles et pensées visibles) et note chaque discours de 0 à 10 en logique, persuasion et stratégie. Un appel OpenRouter par partie. Évite un juge qui joue aussi dans l'Arène. ${judged}/${n} partie(s) notée(s).</p>
        <label class="lgs-field" for="lgs-key">Clé OpenRouter<input id="lgs-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…" value="${esc(S.get(P + 'judgeKey', ''))}"></label>
        <label class="lgs-field" for="lgs-model">Modèle juge<input id="lgs-model" type="text" spellcheck="false" value="${esc(S.get(P + 'judgeModel', 'google/gemini-2.5-flash'))}"></label>
        <div class="lgs-row"><button type="button" class="lgs-btn primary" data-act="judge"${n - judged ? '' : ' disabled'}>Noter ${n - judged} partie(s)</button><button type="button" class="lgs-btn" data-act="copy">Copier les logs (JSON)</button></div>
        <p class="lgs-status" id="lgs-judge-status" role="status"></p></section>`;
    }

    function addLogs(parsed) {
      let arr = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.logs) ? parsed.logs : [parsed];
      const ok = arr.filter((l) => l && !A.validateLog(l).length);
      const base = state.source === 'samples' ? [] : state.logs;
      const seen = new Set(base.map((l) => l.id));
      const fresh = ok.filter((l) => !seen.has(l.id));
      if (fresh.length) { setLogs(base.concat(fresh), 'own'); if (opts.onLogsChange) opts.onLogsChange(state.logs); }
      const st = el.querySelector('#lgs-data-status');
      if (st) { st.textContent = `${fresh.length} ajoutée(s)${ok.length - fresh.length ? `, ${ok.length - fresh.length} déjà présente(s)` : ''}${arr.length - ok.length ? `, ${arr.length - ok.length} rejetée(s) (format inconnu)` : ''}.`; st.classList.toggle('err', !fresh.length); }
    }

    // ------------------------------------------------ interactions
    el.addEventListener('click', async (ev) => {
      const t = ev.target.closest('button, li[data-model], div[data-model]');
      if (!t || !el.contains(t)) return;
      const d = t.dataset;
      if (d.tab) { state.tab = d.tab; state.game = null; S.set(P + 'tab', d.tab); render(); el.querySelector('.lgs-tabs')?.scrollIntoView({ block: 'nearest' }); return; }
      if (d.metric) { state.metric = d.metric; S.set(P + 'metric', d.metric); render(); return; }
      if (d.pick || d.model) { state.model = d.pick || d.model; S.set(P + 'model', state.model); state.tab = 'model'; S.set(P + 'tab', 'model'); render(); if (!d.pick) el.scrollIntoView({ block: 'start' }); return; }
      if (d.filter) { state.filter = d.filter; render(); return; }
      if (d.game) { state.game = d.game; render(); el.scrollIntoView({ block: 'start' }); return; }
      if (d.back) { state.game = null; render(); return; }
      if (d.act === 'paste') { const b = el.querySelector('#lgs-paste'); b.hidden = !b.hidden; return; }
      if (d.act === 'paste-ok') { try { addLogs(JSON.parse(el.querySelector('#lgs-paste-in').value)); } catch (_) { const st = el.querySelector('#lgs-data-status'); st.textContent = 'Le texte collé n\'est pas du JSON valide.'; st.classList.add('err'); } return; }
      if (d.act === 'samples') { setLogs(JSON.parse(JSON.stringify(opts.samples)), 'samples'); if (opts.onLogsChange) opts.onLogsChange(null); return; }
      if (d.act === 'clear') { setLogs([], 'own'); if (opts.onLogsChange) opts.onLogsChange([]); return; }
      if (d.act === 'copy') {
        const text = JSON.stringify(state.logs), st = el.querySelector('#lgs-judge-status');
        try { await navigator.clipboard.writeText(text); st.textContent = `${state.logs.length} logs copiés.`; }
        catch (_) { el.querySelector('#lgs-paste').hidden = false; const ta = el.querySelector('#lgs-paste-in'); ta.value = text; ta.select(); st.textContent = 'Copie refusée : le JSON est sélectionné dans la zone de texte.'; }
        return;
      }
      if (d.act === 'judge') {
        const apiKey = el.querySelector('#lgs-key').value.trim(), model = el.querySelector('#lgs-model').value.trim();
        const st = el.querySelector('#lgs-judge-status');
        if (!apiKey) { st.textContent = 'Ajoute une clé OpenRouter pour lancer le juge.'; st.classList.add('err'); return; }
        S.set(P + 'judgeKey', apiKey); S.set(P + 'judgeModel', model);
        t.disabled = true; let fails = 0;
        await A.judgeLogs(state.logs, { apiKey, model, onProgress: (k, n) => { st.textContent = `Partie ${k} sur ${n} notée.`; }, onError: (e) => { fails++; st.textContent = e.message; } });
        if (opts.onLogsChange && state.source !== 'samples') opts.onLogsChange(state.logs);
        setLogs(state.logs);
        const st2 = el.querySelector('#lgs-judge-status'); if (st2) st2.textContent = fails ? `Terminé, ${fails} échec(s).` : 'Parties notées. Choisis « Juge IA » dans Comparer.';
      }
    });
    el.addEventListener('change', async (ev) => {
      if (ev.target.id !== 'lgs-file') return;
      const all = [];
      for (const f of ev.target.files) { try { const j = JSON.parse(await f.text()); all.push(...(Array.isArray(j) ? j : j && Array.isArray(j.logs) ? j.logs : [j])); } catch (_) { /* fichier illisible */ } }
      addLogs(all);
    });

    setLogs(opts.logs || [], opts.source || 'own');
    return { update: (logs, source) => setLogs(logs, source), get logs() { return state.logs; } };
  }

  const api = { mount, METRICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LGStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
