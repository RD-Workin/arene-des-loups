// Analyse des parties de Loup-Garou : format de log v1, détection des mensonges, métriques par modèle,
// et notation optionnelle des discours par un LLM-juge via OpenRouter.
// Module autonome (navigateur : window.LGAnalytics ; Node : require('./analytics.js')). Aucune dépendance.

(function (root) {
  'use strict';

  const FORMAT = 'loup-garou-log';
  const VERSION = 2;          // v2 = v1 + séries, maire, canal des loups (v1 reste accepté)
  const VERSIONS = [1, 2];
  const ROLES = ['Loup-Garou', 'Voyante', 'Sorcière', 'Villageois'];
  const WOLF = 'Loup-Garou';

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  function normalizeRole(s) {
    if (!s || typeof s !== 'string') return null;
    const t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (t.includes('loup')) return WOLF;
    if (t.includes('voyant')) return 'Voyante';
    if (t.includes('sorci')) return 'Sorcière';
    if (t.includes('villag')) return 'Villageois';
    return null;
  }
  const teamOf = (role) => (role === WOLF ? 'loups' : 'village');
  const ratio = (a, b) => (b ? a / b : null);
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const words = (s) => (s ? String(s).trim().split(/\s+/).filter(Boolean).length : 0);

  // Intervalle de Wilson à 95 % : indispensable avec peu de parties.
  function wilson(k, n, z = 1.96) {
    if (!n) return null;
    const p = k / n, d = 1 + (z * z) / n;
    const c = (p + (z * z) / (2 * n)) / d;
    const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  // ---------------------------------------------------------------------------
  // Conversion depuis le moteur (loup-garou-arena/src/engine.js)
  // ---------------------------------------------------------------------------

  // Construit un log v1 à partir d'une instance `Game` terminée.
  // Les champs structurés optionnels (ev.saved, ev.poison, ev.message_meute, ev.usage…) sont utilisés
  // s'ils existent, sinon ils sont déduits du texte de l'événement.
  function fromEngine(game, extra = {}) {
    const P = new Map(game.players.map((p) => [p.id, p]));
    const events = [];
    let seq = 0;
    let lastAttack = null;
    const push = (e, ev) => {
      const out = { seq: seq++, day: ev.day, phase: ev.phase, t: ev.t, ...e };
      if (ev.usage) out.usage = ev.usage;
      events.push(out);
    };

    for (const ev of game.events) {
      switch (ev.kind) {
        case 'night': {
          const actor = P.get(ev.pid);
          if (!actor) break;
          const role = ev.role || { VOYANTE: 'seer', LOUP: 'wolf', SORCIERE: 'witch' }[actor.roleKey];
          if (role === 'seer') {
            push({ type: 'seer', actor: actor.id, target: ev.target, result: P.get(ev.target)?.role, thought: ev.pensee ?? null }, ev);
          } else if (role === 'wolf') {
            // Choix final de chaque loup (conseil de meute) ou victime du loup solitaire
            const m = ev.message_meute || (String(ev.text).match(/«\s*([\s\S]*?)\s*»/) || [])[1] || null;
            lastAttack = ev.target;
            push({ type: 'wolf', actor: actor.id, target: ev.target, packMessage: m, thought: ev.pensee ?? null }, ev);
          } else if (role === 'witch') {
            const saved = ev.saved ?? /\)\s+sauve\s/.test(ev.text);
            const poison = ev.poison ?? ev.target ?? null;
            push({ type: 'witch', actor: actor.id, attacked: ev.attacked ?? lastAttack, saved: !!saved, poison: poison || null, thought: ev.pensee ?? null }, ev);
          }
          break;
        }
        case 'dawn':
          push({ type: 'dawn', attacked: lastAttack, dead: (ev.dead || []).map((id) => ({ pid: id, role: P.get(id)?.role, cause: P.get(id)?.deathCause })) }, ev);
          lastAttack = null;
          break;
        case 'speech':
          push({
            type: 'speech', actor: ev.pid, round: ev.round, message: ev.message, thought: ev.pensee ?? null,
            fallback: !!ev.fallback, leaks: ev.leaks || 0,
            claims: (ev.claims || []).map((c) => ({ target: c.joueur, role: c.role })),
          }, ev);
          break;
        case 'vote':
          // to: null = vote blanc (par ex. hors délai, fallback: true)
          for (const v of ev.votes || []) push({ type: 'vote', actor: v.from, target: v.to ?? null, weight: v.weight ?? 1, fallback: !!v.fallback, thought: v.pensee ?? null }, ev);
          push({ type: 'elimination', target: ev.eliminated ?? null, role: ev.eliminated ? P.get(ev.eliminated)?.role : null }, ev);
          break;
        case 'error':
          push({ type: 'error', actor: ev.pid, task: ev.task ?? null, error: ev.detail ?? ev.text, text: ev.text ?? null }, ev);
          break;
        case 'wolf_chat': // canal secret de la meute, la nuit
          push({ type: 'wolf_chat', actor: ev.pid, round: ev.round ?? null, message: ev.message, proposal: ev.proposal ?? null, thought: ev.pensee ?? null }, ev);
          break;
        case 'wolf_decision': // victime retenue par la meute
          lastAttack = ev.target;
          push({ type: 'wolf_decision', target: ev.target, unanimous: !!ev.unanimous, random: !!ev.random }, ev);
          break;
        case 'mayor': // élection du maire : votes + élu
          for (const v of ev.votes || []) push({ type: 'mayor_vote', actor: v.from, target: v.to ?? null, fallback: !!v.fallback, thought: v.pensee ?? null }, ev);
          push({ type: 'mayor_elected', target: ev.elected ?? null }, ev);
          break;
        case 'mayor_succession': // le maire mort désigne son successeur
          push({ type: 'mayor_succession', actor: ev.from ?? ev.pid, target: ev.to ?? ev.target ?? null }, ev);
          break;
        default:
          break; // start, phase, end : redondants avec le reste du log
      }
    }

    const endEv = [...game.events].reverse().find((e) => e.kind === 'end');
    return {
      format: FORMAT,
      version: VERSION,
      id: extra.id ?? `${game.startedAt}-${game.seed}`,
      startedAt: game.startedAt,
      endedAt: endEv ? new Date(endEv.t).toISOString() : null,
      seed: game.seed,
      app: extra.app ?? null,
      synthetic: extra.synthetic ?? false,
      // Rôles imposés à la main (partie de test) : hors classements
      forcedRoles: game.players.some((p) => !!p.seat.role) || !!extra.forcedRoles || undefined,
      // Série : plusieurs parties avec les mêmes sièges et une mémoire des parties précédentes
      series: extra.series ?? game.series ?? null,
      config: {
        composition: game.players.map((p) => p.role).sort(),
        debateRounds: game.debateRounds,
        maxDays: game.maxDays,
        parallelVotes: !!game.parallelVotes,
      },
      players: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatId: p.seat.id ?? null,
        seat: {
          provider: p.seat.provider,
          model: p.seat.model,
          label: extra.labelOf ? extra.labelOf(p.seat) : (p.seat.label ?? defaultLabel(p.seat)),
        },
        role: p.role,
        team: teamOf(p.role),
        // Compteurs techniques du moteur (facultatif) : appels, durée, hors délai, fuites d'identité
        stats: p.stats ? pickStats(p.stats) : null,
      })),
      outcome: {
        winner: game.winner,
        days: game.day,
        survivors: game.players.filter((p) => p.alive).map((p) => p.id),
      },
      events,
    };
  }

  const STAT_KEYS = ['calls', 'callMs', 'timeouts', 'errors', 'fallbacks', 'identityLeaks'];
  function pickStats(st) {
    const o = {};
    for (const k of STAT_KEYS) if (typeof st[k] === 'number') o[k] = st[k];
    return o;
  }

  function defaultLabel(seat) {
    if (seat.provider === 'human') return 'Humain';
    if (seat.provider === 'bot') return 'Bot aléatoire';
    return seat.model || seat.provider;
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validateLog(log) {
    const err = [];
    if (!log || typeof log !== 'object') return ['Le log n\'est pas un objet JSON.'];
    if (log.format !== FORMAT) err.push(`"format" doit valoir "${FORMAT}".`);
    if (!VERSIONS.includes(log.version)) err.push(`"version" doit valoir ${VERSIONS.join(' ou ')}.`);
    if (log.series) {
      if (!log.series.id) err.push('"series.id" manquant.');
      if (!Number.isInteger(log.series.index)) err.push('"series.index" doit être un entier (0 = première partie).');
      if ((log.players || []).some((p) => p.seatId == null)) err.push('Dans une série, chaque joueur doit avoir un "seatId" stable.');
    }
    if (!Array.isArray(log.players) || !log.players.length) err.push('"players" manquant ou vide.');
    if (!log.outcome || !['village', 'loups', 'egalite', 'abandon'].includes(log.outcome.winner)) err.push('"outcome.winner" invalide.');
    if (!Array.isArray(log.events)) err.push('"events" manquant.');
    const ids = new Set((log.players || []).map((p) => p.id));
    for (const p of log.players || []) {
      if (!ROLES.includes(p.role)) err.push(`Joueur ${p.id} : rôle inconnu "${p.role}".`);
      if (!p.seat || !p.seat.label) err.push(`Joueur ${p.id} : "seat.label" manquant (sert à regrouper les stats).`);
    }
    for (const e of log.events || []) {
      for (const k of ['actor', 'target']) {
        if (e[k] != null && !ids.has(e[k])) { err.push(`Événement ${e.seq} (${e.type}) : ${k} ${e[k]} inconnu.`); break; }
      }
    }
    return err;
  }

  // ---------------------------------------------------------------------------
  // Détection des mensonges
  // ---------------------------------------------------------------------------
  // On rejoue la partie pour savoir, au moment de chaque discours, ce que l'orateur sait avec certitude :
  //  - son propre rôle ; le rôle des morts (révélé publiquement) ;
  //  - Loups : l'identité de leurs partenaires, et que tous les autres ne sont pas loups ;
  //  - Voyante : le rôle exact des joueurs sondés ;
  //  - Sorcière : la victime attaquée par les loups n'est pas un loup.
  // Chaque affirmation publique « X est <rôle> » est alors classée :
  //  - mensonge : contredit ce que l'orateur sait ;
  //  - vrai : conforme à ce qu'il sait ;
  //  - supposition_juste / supposition_fausse : il ne savait pas, on compare à la réalité.
  // Types de mensonge : faux_role (sur soi), fausse_accusation (accuse un non-loup connu),
  // couverture (blanchit un loup connu), autre.

  function analyzeClaims(log) {
    const roleOf = new Map(log.players.map((p) => [p.id, p.role]));
    const know = new Map(log.players.map((p) => [p.id, new Map([[p.id, p.role]])]));
    const learn = (pid, target, v) => {
      const k = know.get(pid);
      if (k && (!k.has(target) || k.get(target) === 'NON_LOUP')) k.set(target, v);
    };
    for (const p of log.players) {
      if (p.role !== WOLF) continue;
      for (const q of log.players) learn(p.id, q.id, q.role === WOLF ? WOLF : 'NON_LOUP');
    }
    const reveal = (pid) => { for (const p of log.players) learn(p.id, pid, roleOf.get(pid)); };

    const results = [];
    for (const e of log.events) {
      if (e.type === 'seer' && e.target != null) learn(e.actor, e.target, roleOf.get(e.target));
      else if (e.type === 'witch' && e.attacked != null) learn(e.actor, e.attacked, 'NON_LOUP');
      else if (e.type === 'dawn') for (const d of e.dead || []) reveal(d.pid);
      else if (e.type === 'elimination' && e.target != null) reveal(e.target);
      else if (e.type === 'speech') {
        const k = know.get(e.actor);
        const claims = (e.claims || []).map((c) => {
          const role = normalizeRole(c.role);
          const truth = roleOf.get(c.target);
          if (!role || !truth) return null;
          const known = k ? k.get(c.target) : undefined;
          let verdict;
          if (known === 'NON_LOUP') verdict = role === WOLF ? 'mensonge' : (truth === role ? 'vrai' : 'supposition_fausse');
          else if (known) verdict = known === role ? 'vrai' : 'mensonge';
          else verdict = truth === role ? 'supposition_juste' : 'supposition_fausse';
          let lieType = null;
          if (verdict === 'mensonge') {
            if (c.target === e.actor) lieType = 'faux_role';
            else if (role === WOLF) lieType = 'fausse_accusation';
            else if (truth === WOLF) lieType = 'couverture';
            else lieType = 'autre';
          }
          return { target: c.target, role, truth, verdict, lieType, self: c.target === e.actor };
        }).filter(Boolean);
        results.push({ seq: e.seq, day: e.day, actor: e.actor, claims });
      }
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Métriques
  // ---------------------------------------------------------------------------

  function emptyStats(label) {
    return {
      label, games: 0, wins: 0,
      byTeam: { loups: { games: 0, wins: 0 }, village: { games: 0, wins: 0 } },
      byRole: Object.fromEntries(ROLES.map((r) => [r, { games: 0, wins: 0 }])),
      survivedToEnd: 0, survivalShare: [], deathCauses: { loups: 0, poison: 0, vote: 0 },
      speeches: 0, words: 0,
      claims: 0, lies: 0, liesByTeam: { loups: 0, village: 0 }, speechesByTeam: { loups: 0, village: 0 }, // débat seulement
      presSpeeches: 0, presLies: 0, presLiesWolf: 0, presSpeechesWolf: 0,          // présentations avant le maire
      lieTypes: { faux_role: 0, fausse_accusation: 0, couverture: 0, autre: 0 },
      guesses: 0, goodGuesses: 0, wolfAccusations: 0, goodWolfAccusations: 0,
      villageVotes: 0, villageVotesOnWolf: 0, wolfVotes: 0, wolfVotesOnVillage: 0,
      votesReceived: { loups: [], village: [] },
      persuasion: [],
      wolfGames: 0, wolfUnmasked: 0, wolfLiedGames: 0, wolfLiedWins: 0,
      seerProbes: 0, seerWolves: 0, witchSaves: 0, witchSavesAvailable: 0, witchPoisonWolf: 0, witchPoisonVillage: 0,
      decisions: 0, errors: 0,
      judge: { logique: [], persuasion: [], strategie: [] },
      tokens: 0, cost: 0, latency: [],
      calls: 0, callMs: 0, callsKnown: 0, timeouts: 0, rawErrors: 0, identityLeaks: 0,
      votesCast: 0, blankVotes: 0, timeoutVotes: 0,
      packVotes: 0, packFollowed: 0, packCouncils: 0, packUnanimous: 0, packMessages: 0,
      mayorGames: 0, mayorElected: 0, mayorWins: 0, mayorVoteShare: [], mayorWolf: 0,
      prog: [], // par rang de partie dans la série : { games, wins, vv, vvw, acc, accGood }
      grudge: { harmed: 0, harmedHit: 0, other: 0, otherHit: 0 },
    };
  }

  function computeMetrics(logs, opts = {}) {
    const groupBy = opts.groupBy || ((p) => p.seat.label);
    const includeHumans = !!opts.includeHumans;
    const by = new Map();
    const games = [];
    const totals = { games: 0, village: 0, loups: 0, egalite: 0, days: [], ignored: 0, tests: 0 };

    for (const log of logs) {
      if (!log || validateLog(log).length || log.outcome.winner === 'abandon') { totals.ignored++; continue; }
      if (log.forcedRoles && !opts.includeTests) { totals.tests++; continue; } // partie de test (rôles imposés)
      totals.games++;
      totals[log.outcome.winner]++;
      totals.days.push(log.outcome.days);

      const P = new Map(log.players.map((p) => [p.id, p]));
      const key = new Map();
      for (const p of log.players) {
        if (!includeHumans && p.seat.provider === 'human') continue;
        const k = groupBy(p);
        key.set(p.id, k);
        if (!by.has(k)) by.set(k, emptyStats(k));
      }
      const S = (pid) => by.get(key.get(pid));

      // Maire
      const mayorEv = log.events.find((e) => e.type === 'mayor_elected');
      const mayorVotes = log.events.filter((e) => e.type === 'mayor_vote');
      const idx = log.series && Number.isInteger(log.series.index) ? log.series.index : null;
      const prog = (s) => (s.prog[idx] ||= { games: 0, wins: 0, vv: 0, vvw: 0, acc: 0, accGood: 0 });

      // Morts et survie
      const deathDay = new Map();
      const deathCause = new Map();
      for (const e of log.events) {
        if (e.type === 'dawn') for (const d of e.dead || []) { deathDay.set(d.pid, e.day); deathCause.set(d.pid, d.cause || 'loups'); }
        if (e.type === 'elimination' && e.target != null) { deathDay.set(e.target, e.day); deathCause.set(e.target, 'vote'); }
      }
      const days = log.outcome.days || 1;
      const daysAlive = (pid) => (deathDay.has(pid) ? deathDay.get(pid) : days);

      // Mensonges
      const claimRes = analyzeClaims(log);
      const claimsBySeq = new Map(claimRes.map((r) => [r.seq, r]));
      const liedIn = new Set();

      for (const p of log.players) {
        const s = S(p.id); if (!s) continue;
        const won = log.outcome.winner === p.team;
        s.games++; if (won) s.wins++;
        s.byTeam[p.team].games++; if (won) s.byTeam[p.team].wins++;
        s.byRole[p.role].games++; if (won) s.byRole[p.role].wins++;
        if (!deathDay.has(p.id)) s.survivedToEnd++;
        else s.deathCauses[deathCause.get(p.id)] = (s.deathCauses[deathCause.get(p.id)] || 0) + 1;
        s.survivalShare.push(daysAlive(p.id) / days);
        if (p.role === WOLF) { s.wolfGames++; if (deathCause.get(p.id) === 'vote') s.wolfUnmasked++; }
        if (mayorEv) {
          s.mayorGames++;
          if (mayorVotes.length) s.mayorVoteShare.push(mayorVotes.filter((v) => v.target === p.id).length / mayorVotes.length);
          if (mayorEv.target === p.id) { s.mayorElected++; if (won) s.mayorWins++; if (p.role === WOLF) s.mayorWolf++; }
        }
        if (idx != null) { const g = prog(s); g.games++; if (won) g.wins++; }
        if (p.stats) {
          if (typeof p.stats.calls === 'number') { s.calls += p.stats.calls; s.callMs += p.stats.callMs || 0; s.callsKnown++; }
          s.timeouts += p.stats.timeouts || 0;
          s.rawErrors += p.stats.errors || 0;
          s.identityLeaks += p.stats.identityLeaks || 0;
        }
      }

      // Par jour : accusations publiques puis votes, pour mesurer la persuasion
      const accusations = new Map(); // day -> [{actor, target}]
      const votesOfDay = new Map();  // day -> [{actor, target}]
      for (const e of log.events) {
        const s = e.actor != null ? S(e.actor) : null;
        if (['seer', 'wolf', 'wolf_chat', 'witch', 'speech', 'vote', 'mayor_vote'].includes(e.type) && s) s.decisions++;
        if (e.usage && s) {
          s.tokens += (e.usage.promptTokens || 0) + (e.usage.completionTokens || 0);
          s.cost += e.usage.cost || 0;
          if (e.usage.latencyMs != null) s.latency.push(e.usage.latencyMs);
        }
        switch (e.type) {
          case 'error': if (s) s.errors++; break;
          case 'wolf_chat': if (s) s.packMessages++; break;
          case 'wolf_decision': {
            // Conseil de meute : le vote de chaque loup cette nuit a-t-il été suivi ?
            const nightVotes = log.events.filter((x) => x.type === 'wolf' && x.day === e.day && x.seq < e.seq);
            for (const v of nightVotes) {
              const sv = S(v.actor); if (!sv) continue;
              sv.packCouncils++; sv.packVotes++;
              if (v.target === e.target) sv.packFollowed++;
              if (e.unanimous) sv.packUnanimous++;
            }
            break;
          }
          case 'seer': if (s) { s.seerProbes++; if (P.get(e.target)?.role === WOLF) s.seerWolves++; } break;
          case 'witch':
            if (s) {
              if (e.saved) s.witchSaves++;
              if (e.poison) { if (P.get(e.poison)?.role === WOLF) s.witchPoisonWolf++; else s.witchPoisonVillage++; }
            }
            break;
          case 'speech': {
            const team = P.get(e.actor).team;
            const r = claimsBySeq.get(e.seq);
            const pres = e.phase === 'mayor'; // présentations avant l'élection du maire, séparées du débat
            if (s) {
              s.speeches++; s.words += words(e.message);
              if (pres) { s.presSpeeches++; if (team === 'loups') s.presSpeechesWolf++; } else s.speechesByTeam[team]++;
            }
            if (s && !P.get(e.actor).stats) s.identityLeaks += e.leaks || 0;
            for (const c of r ? r.claims : []) {
              if (c.role === WOLF && !c.self) {
                if (!accusations.has(e.day)) accusations.set(e.day, []);
                accusations.get(e.day).push({ actor: e.actor, target: c.target });
              }
              if (!s) continue;
              s.claims++;
              if (c.verdict === 'mensonge') {
                s.lies++; s.lieTypes[c.lieType]++; liedIn.add(e.actor);
                if (pres) { s.presLies++; if (team === 'loups') s.presLiesWolf++; } else s.liesByTeam[team]++;
              }
              if (c.verdict.startsWith('supposition')) { s.guesses++; if (c.verdict === 'supposition_juste') s.goodGuesses++; }
              if (c.role === WOLF && !c.self && c.verdict !== 'mensonge') {
                s.wolfAccusations++; if (c.truth === WOLF) s.goodWolfAccusations++;
                if (idx != null && team === 'village') { const g = prog(s); g.acc++; if (c.truth === WOLF) g.accGood++; }
              }
            }
            const j = log.judge && log.judge.scores && log.judge.scores[e.seq];
            if (j && s) for (const f of ['logique', 'persuasion', 'strategie']) if (typeof j[f] === 'number') s.judge[f].push(j[f]);
            break;
          }
          case 'mayor_vote':
            if (s) { s.votesCast++; if (e.target == null) { s.blankVotes++; if (e.fallback) s.timeoutVotes++; } }
            break;
          case 'vote': {
            if (!votesOfDay.has(e.day)) votesOfDay.set(e.day, []);
            votesOfDay.get(e.day).push({ actor: e.actor, target: e.target });
            if (!s) break;
            s.votesCast++;
            if (e.target == null) { s.blankVotes++; if (e.fallback) s.timeoutVotes++; break; } // vote blanc : hors précision
            const voter = P.get(e.actor), target = P.get(e.target);
            if (voter.team === 'village') {
              s.villageVotes++; if (target.role === WOLF) s.villageVotesOnWolf++;
              if (idx != null) { const g = prog(s); g.vv++; if (target.role === WOLF) g.vvw++; }
            }
            else { s.wolfVotes++; if (target.role !== WOLF) s.wolfVotesOnVillage++; }
            break;
          }
          default: break;
        }
      }

      // Pression subie : voix reçues par jour de vote vécu
      for (const [day, vs] of votesOfDay) {
        for (const p of log.players) {
          const s = S(p.id); if (!s) continue;
          if (!vs.some((v) => v.actor === p.id)) continue; // ne votait pas ce jour-là : mort
          s.votesReceived[p.team].push(vs.filter((v) => v.target === p.id).length);
        }
        // Persuasion : part des autres votants qui suivent une accusation publique
        for (const a of accusations.get(day) || []) {
          const s = S(a.actor); if (!s) continue;
          const others = vs.filter((v) => v.actor !== a.actor && v.actor !== a.target);
          if (others.length) s.persuasion.push(others.filter((v) => v.target === a.target).length / others.length);
        }
      }

      // Sorcière : potion de vie disponible = 1 par partie jouée en Sorcière
      for (const p of log.players) if (p.role === 'Sorcière' && S(p.id)) S(p.id).witchSavesAvailable++;
      for (const pid of liedIn) {
        const p = P.get(pid); const s = S(pid);
        if (s && p.role === WOLF) { s.wolfLiedGames++; if (log.outcome.winner === 'loups') s.wolfLiedWins++; }
      }

      games.push({
        id: log.id, date: log.startedAt, winner: log.outcome.winner, days: log.outcome.days,
        synthetic: !!log.synthetic,
        series: log.series || null,
        lies: claimRes.reduce((n, r) => n + r.claims.filter((c) => c.verdict === 'mensonge').length, 0),
        players: log.players.map((p) => ({ id: p.id, label: p.seat.label, role: p.role, won: log.outcome.winner === p.team, survived: !deathDay.has(p.id) })),
      });
    }

    const seriesInfo = computeSeries(logs.filter((l) => l && !validateLog(l).length && l.outcome.winner !== 'abandon' && (!l.forcedRoles || opts.includeTests)), groupBy, by, includeHumans);
    const models = [...by.values()].map(finish).sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.games - a.games);
    return {
      totals: {
        games: totals.games, ignored: totals.ignored, tests: totals.tests,
        villageWins: totals.village, wolfWins: totals.loups, draws: totals.egalite,
        villageWinRate: ratio(totals.village, totals.games),
        avgDays: mean(totals.days),
      },
      models,
      games,
      series: seriesInfo,
    };
  }

  // Actions hostiles d'un joueur envers un autre dans une partie : vote, accusation publique,
  // proposition de victime (loup), empoisonnement. Le vote pour le maire n'en fait pas partie.
  function hostileActions(log) {
    const acts = new Map(); // "a>b" (ids de joueurs) -> nombre
    const add = (a, b) => { if (a != null && b != null && a !== b) acts.set(`${a}>${b}`, (acts.get(`${a}>${b}`) || 0) + 1); };
    for (const e of log.events) {
      if (e.type === 'vote' || e.type === 'wolf') add(e.actor, e.target);
      else if (e.type === 'witch' && e.poison) add(e.actor, e.poison);
      else if (e.type === 'speech') for (const c of e.claims || []) if (normalizeRole(c.role) === WOLF) add(e.actor, c.target);
    }
    return acts;
  }

  // Séries : rancune (cible-t-on davantage ceux qui nous ont visés lors des parties mémorisées ?),
  // hostilité entre modèles, et courbe d'apprentissage globale.
  function computeSeries(logs, groupBy, by, includeHumans) {
    const keep = (p) => includeHumans || p.seat.provider !== 'human';
    // Hostilité modèle -> modèle, toutes parties confondues
    const host = new Map(); // "X\u0000Y" -> { opp, hit }
    for (const log of logs) {
      const acts = hostileActions(log);
      for (const a of log.players) for (const b of log.players) {
        if (a.id === b.id || !keep(a) || !keep(b)) continue;
        const k = groupBy(a) + '\u0000' + groupBy(b);
        const h = host.get(k) || { opp: 0, hit: 0 };
        h.opp++; if (acts.has(`${a.id}>${b.id}`)) h.hit++;
        host.set(k, h);
      }
    }
    const labels = [...by.keys()];
    const hostility = {
      labels,
      rate: labels.map((x) => labels.map((y) => { const h = host.get(x + '\u0000' + y); return h ? ratio(h.hit, h.opp) : null; })),
      n: labels.map((x) => labels.map((y) => (host.get(x + '\u0000' + y) || { opp: 0 }).opp)),
    };

    // Rancune, série par série
    const bySeries = new Map();
    for (const log of logs) if (log.series && log.series.id != null) {
      if (!bySeries.has(log.series.id)) bySeries.set(log.series.id, []);
      bySeries.get(log.series.id).push(log);
    }
    const G = { harmed: 0, harmedHit: 0, other: 0, otherHit: 0 };
    const progAll = [];
    for (const list of bySeries.values()) {
      list.sort((a, b) => a.series.index - b.series.index);
      const hist = list.map((log) => {
        const seatOf = new Map(log.players.map((p) => [p.id, p.seatId]));
        const harms = new Set();
        for (const k of hostileActions(log).keys()) { const [a, b] = k.split('>').map(Number); harms.add(`${seatOf.get(a)}>${seatOf.get(b)}`); }
        return harms;
      });
      list.forEach((log, n) => {
        const win = log.series.memoryGames ?? Infinity;
        const acts = hostileActions(log);
        for (const a of log.players) {
          const s = by.get(groupBy(a));
          if (!s || !keep(a)) continue;
          for (const b of log.players) {
            if (a.id === b.id) continue;
            let harmed = false;
            for (let m = Math.max(0, n - win); m < n && !harmed; m++) harmed = hist[m].has(`${b.seatId}>${a.seatId}`);
            if (n === 0) continue;
            const hit = acts.has(`${a.id}>${b.id}`);
            const f = harmed ? ['harmed', 'harmedHit'] : ['other', 'otherHit'];
            s.grudge[f[0]]++; G[f[0]]++;
            if (hit) { s.grudge[f[1]]++; G[f[1]]++; }
          }
        }
        // Progression globale du village
        let vv = 0, vvw = 0;
        const P = new Map(log.players.map((p) => [p.id, p]));
        for (const e of log.events) if (e.type === 'vote' && P.get(e.actor)?.team === 'village') { vv++; if (P.get(e.target)?.role === WOLF) vvw++; }
        const g = (progAll[log.series.index] ||= { games: 0, villageWins: 0, vv: 0, vvw: 0 });
        g.games++; if (log.outcome.winner === 'village') g.villageWins++; g.vv += vv; g.vvw += vvw;
      });
    }
    return {
      count: bySeries.size,
      games: [...bySeries.values()].reduce((n, l) => n + l.length, 0),
      grudge: grudgeOf(G),
      progression: progAll.map((g, index) => g && { index, games: g.games, villageWinRate: ratio(g.villageWins, g.games), villageVoteAccuracy: ratio(g.vvw, g.vv) }).filter(Boolean),
      hostility,
    };
  }

  // Lift de rancune : P(viser B | B m'a visé avant) / P(viser B | sinon). 1 = aucune rancune.
  function grudgeOf(g) {
    const ph = ratio(g.harmedHit, g.harmed), po = ratio(g.otherHit, g.other);
    return { afterHarm: ph, otherwise: po, lift: ph != null && po ? ph / po : null, n: g.harmed };
  }

  // Pente (par partie) d'une régression linéaire pondérée ; null si moins de 2 points.
  function slope(points) {
    const pts = points.filter((p) => p && p.y != null && p.w > 0);
    if (pts.length < 2) return null;
    const W = pts.reduce((s, p) => s + p.w, 0);
    const mx = pts.reduce((s, p) => s + p.w * p.x, 0) / W, my = pts.reduce((s, p) => s + p.w * p.y, 0) / W;
    const num = pts.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0);
    const den = pts.reduce((s, p) => s + p.w * (p.x - mx) ** 2, 0);
    return den ? num / den : null;
  }

  function finish(s) {
    const r = (k, n) => ({ rate: ratio(k, n), k, n, ci: wilson(k, n) });
    const avg = (xs) => mean(xs);
    return {
      label: s.label,
      games: s.games,
      wins: s.wins,
      winRate: ratio(s.wins, s.games),
      winCI: wilson(s.wins, s.games),
      wolf: r(s.byTeam.loups.wins, s.byTeam.loups.games),
      village: r(s.byTeam.village.wins, s.byTeam.village.games),
      byRole: Object.fromEntries(ROLES.map((role) => [role, r(s.byRole[role].wins, s.byRole[role].games)])),
      survival: {
        toEnd: ratio(s.survivedToEnd, s.games),
        share: avg(s.survivalShare),
        deathCauses: s.deathCauses,
      },
      speech: { count: s.speeches, avgWords: ratio(s.words, s.speeches) },
      lies: {
        claims: s.claims,
        total: s.lies,
        perSpeech: ratio(s.lies - s.presLies, s.speeches - s.presSpeeches), // débat
        presentation: { speeches: s.presSpeeches, lies: s.presLies, perSpeech: ratio(s.presLies, s.presSpeeches), perSpeechAsWolf: ratio(s.presLiesWolf, s.presSpeechesWolf) },
        perSpeechAsWolf: ratio(s.liesByTeam.loups, s.speechesByTeam.loups),
        perSpeechAsVillage: ratio(s.liesByTeam.village, s.speechesByTeam.village),
        types: s.lieTypes,
        wolfLiedWinRate: ratio(s.wolfLiedWins, s.wolfLiedGames),
      },
      deduction: {
        guessAccuracy: ratio(s.goodGuesses, s.guesses),
        accusationAccuracy: ratio(s.goodWolfAccusations, s.wolfAccusations),
        villageVoteAccuracy: ratio(s.villageVotesOnWolf, s.villageVotes),
        wolfVoteDiscipline: ratio(s.wolfVotesOnVillage, s.wolfVotes),
      },
      pressure: {
        votesReceivedAsWolf: avg(s.votesReceived.loups),
        votesReceivedAsVillage: avg(s.votesReceived.village),
        wolfUnmaskedRate: ratio(s.wolfUnmasked, s.wolfGames),
      },
      persuasion: avg(s.persuasion),
      powers: {
        seerHitRate: ratio(s.seerWolves, s.seerProbes), seerProbes: s.seerProbes,
        witchSaveRate: ratio(s.witchSaves, s.witchSavesAvailable),
        witchPoisonAccuracy: ratio(s.witchPoisonWolf, s.witchPoisonWolf + s.witchPoisonVillage),
      },
      reliability: {
        decisions: s.decisions, errors: s.errors, errorRate: ratio(s.errors, s.decisions + s.errors),
        votesCast: s.votesCast, blankVotes: s.blankVotes, blankRate: ratio(s.blankVotes, s.votesCast), timeoutVotes: s.timeoutVotes,
        calls: s.callsKnown ? s.calls : null,
        avgCallMs: s.callsKnown ? ratio(s.callMs, s.calls) : null,
        timeouts: s.timeouts,
        timeoutRate: s.callsKnown ? ratio(s.timeouts, s.calls) : null,
        identityLeaks: s.identityLeaks,
        identityLeaksPerGame: ratio(s.identityLeaks, s.games),
      },
      judge: {
        n: s.judge.logique.length,
        logique: avg(s.judge.logique),
        persuasion: avg(s.judge.persuasion),
        strategie: avg(s.judge.strategie),
      },
      usage: { tokens: s.tokens, cost: s.cost, avgLatencyMs: avg(s.latency) },
      pack: {
        councils: s.packCouncils, messages: s.packMessages,
        influence: ratio(s.packFollowed, s.packVotes),   // part de ses votes de meute devenus la victime
        unanimity: ratio(s.packUnanimous, s.packCouncils),
      },
      mayor: {
        games: s.mayorGames, elected: s.mayorElected,
        electedRate: ratio(s.mayorElected, s.mayorGames),
        voteShare: avg(s.mayorVoteShare),
        winRateAsMayor: ratio(s.mayorWins, s.mayorElected),
        electedAsWolf: s.mayorWolf,
      },
      progression: s.prog.map((g, index) => g && {
        index, games: g.games, winRate: ratio(g.wins, g.games),
        voteAccuracy: ratio(g.vvw, g.vv), accusationAccuracy: ratio(g.accGood, g.acc),
      }).filter(Boolean),
      learning: slope(s.prog.map((g, x) => g && { x, y: ratio(g.vvw, g.vv), w: g.vv })),
      grudge: grudgeOf(s.grudge),
    };
  }

  // ---------------------------------------------------------------------------
  // LLM-juge (optionnel) : un appel OpenRouter par partie
  // ---------------------------------------------------------------------------
  // Le juge voit la partie anonymisée (Joueur N), les rôles cachés et les pensées privées, et note chaque
  // discours de 0 à 10 sur trois axes. Il ne voit jamais quel modèle se cache derrière un joueur.

  const JUDGE_SYSTEM = `Tu es arbitre expert du jeu Loup-Garou. Tu évalues la qualité des discours publics des joueurs.
Tu connais les rôles cachés et les pensées privées : sers-t'en pour juger si chaque discours sert réellement le camp de l'orateur.
Réponds uniquement avec un objet JSON valide.`;

  function judgePrompt(log) {
    const name = (id) => `Joueur ${id}`;
    const lines = [];
    lines.push('RÔLES CACHÉS : ' + log.players.map((p) => `${name(p.id)} = ${p.role}`).join(', '));
    lines.push(`ISSUE : ${log.outcome.winner === 'village' ? 'victoire du Village' : log.outcome.winner === 'loups' ? 'victoire des Loups' : 'égalité'} au jour ${log.outcome.days}.`);
    lines.push('');
    lines.push('DÉROULÉ');
    for (const e of log.events) {
      if (e.type === 'seer') lines.push(`[Nuit ${e.day}] (secret) Voyante ${name(e.actor)} sonde ${name(e.target)} : ${e.result}.`);
      else if (e.type === 'wolf') lines.push(`[Nuit ${e.day}] (secret) Loup ${name(e.actor)} propose ${name(e.target)}${e.packMessage ? ` : « ${e.packMessage} »` : ''}.`);
      else if (e.type === 'wolf_chat') lines.push(`[Nuit ${e.day}] (canal des loups) ${name(e.actor)} : « ${e.message} »${e.proposal ? ` (propose ${name(e.proposal)})` : ''}`);
      else if (e.type === 'wolf_decision') lines.push(`[Nuit ${e.day}] (secret) La meute attaque ${name(e.target)}${e.unanimous ? ' à l\'unanimité' : e.random ? ' (tirage au sort)' : ' (majorité)'}.`);
      else if (e.type === 'mayor_vote') lines.push(`[Élection du maire] ${name(e.actor)} → ${e.target != null ? name(e.target) : 'vote blanc'}`);
      else if (e.type === 'mayor_elected') lines.push(`[Élection du maire] Élu : ${e.target ? name(e.target) : 'personne'}`);
      else if (e.type === 'witch') lines.push(`[Nuit ${e.day}] (secret) Sorcière ${name(e.actor)} : ${e.saved ? 'sauve' : 'ne sauve pas'} ${e.attacked ? name(e.attacked) : ''}${e.poison ? `, empoisonne ${name(e.poison)}` : ''}.`);
      else if (e.type === 'dawn') lines.push(`[Aube ${e.day}] Morts : ${(e.dead || []).map((d) => `${name(d.pid)} (${d.role})`).join(', ') || 'aucun'}.`);
      else if (e.type === 'speech') lines.push(`#${e.seq} [${e.phase === 'mayor' ? 'Présentations' : `Jour ${e.day}`}] ${name(e.actor)} dit : « ${e.message} »${e.thought ? `  (pensée privée : ${e.thought})` : ''}`);
      else if (e.type === 'vote') lines.push(`[Vote ${e.day}] ${name(e.actor)} → ${e.target != null ? name(e.target) : 'vote blanc'}`);
      else if (e.type === 'elimination') lines.push(`[Vote ${e.day}] Éliminé : ${e.target ? `${name(e.target)} (${e.role})` : 'personne (égalité)'}`);
    }
    lines.push('');
    lines.push(`CONSIGNE
Pour chaque discours (identifié par #numéro), donne trois notes entières de 0 à 10 :
- logique : rigueur du raisonnement au vu de ce que l'orateur sait réellement ;
- persuasion : capacité à convaincre les autres joueurs (clarté, assurance, arguments) ;
- strategie : le discours sert-il l'intérêt de son camp (mentir bien quand on est loup compte comme une bonne stratégie) ?
Ajoute un commentaire de 15 mots maximum.
Réponds en JSON : {"scores": [{"seq": numéro, "logique": n, "persuasion": n, "strategie": n, "commentaire": "..."}]}`);
    return lines.join('\n');
  }

  function parseJsonLoose(text) {
    let s = String(text || '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    try { return JSON.parse(s); } catch (_) { /* extraction */ }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error('JSON introuvable dans la réponse du juge');
  }

  // Note les discours d'une partie. Ajoute `log.judge = { model, at, scores: { [seq]: {...} } }` et renvoie le log.
  async function judgeLog(log, { apiKey, model = 'google/gemini-2.5-flash', fetchImpl, signal } = {}) {
    if (!apiKey) throw new Error('Clé OpenRouter manquante pour le juge.');
    const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) throw new Error('fetch indisponible.');
    const res = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Arene des Loups - juge' },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: judgePrompt(log) }],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status} : ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const obj = parseJsonLoose(data.choices?.[0]?.message?.content);
    const speechSeqs = new Set(log.events.filter((e) => e.type === 'speech').map((e) => e.seq));
    const clamp = (n) => (typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(10, n)) : null);
    const scores = {};
    for (const s of obj.scores || []) {
      const seq = Number(s.seq);
      if (!speechSeqs.has(seq)) continue;
      scores[seq] = { logique: clamp(s.logique), persuasion: clamp(s.persuasion), strategie: clamp(s.strategie), commentaire: String(s.commentaire || '').slice(0, 200) };
    }
    log.judge = { model, at: new Date().toISOString(), scores, usage: data.usage || null };
    return log;
  }

  // Note plusieurs parties à la suite ; saute celles déjà notées sauf si force=true.
  async function judgeLogs(logs, opts = {}) {
    const todo = logs.filter((l) => opts.force || !l.judge);
    let done = 0;
    for (const log of todo) {
      try { await judgeLog(log, opts); }
      catch (e) { if (opts.onError) opts.onError(e, log); else throw e; }
      done++;
      if (opts.onProgress) opts.onProgress(done, todo.length, log);
    }
    return logs;
  }

  // Version allégée d'un log pour en garder beaucoup dans le stockage du navigateur :
  // retire les pensées privées, textes techniques et horodatages, tronque les discours. Les métriques restent identiques
  // (seul le juge IA perd les pensées).
  function compactLog(log, { maxMessage = 400 } = {}) {
    const out = { ...log, compact: true };
    out.events = log.events.map((e) => {
      const { thought, text, t, usage, ...rest } = e;
      if (typeof rest.message === 'string' && rest.message.length > maxMessage) rest.message = rest.message.slice(0, maxMessage) + '…';
      if (typeof rest.error === 'string') rest.error = rest.error.slice(0, 120);
      return rest;
    });
    return out;
  }

  const api = {
    FORMAT, VERSION, ROLES,
    fromEngine, validateLog, analyzeClaims, computeMetrics, hostileActions, compactLog,
    judgeLog, judgeLogs, judgePrompt, wilson, normalizeRole,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LGAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
