// Interface : réglages, partie en direct, joueur humain, statistiques.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  };
  const fatal = (message) => Object.assign(new Error(message), { fatal: true });

  // Adresse de la version web hébergée (OpenRouter), affichée dans la version Claude.
  const HOSTED_URL = '__HOSTED_URL__';
  const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
  const env = { openrouter: !IN_CLAUDE, claude: false, gemini: !IN_CLAUDE };
  // Fournisseurs appelés en direct avec leur propre clé (en plus d'OpenRouter). Dans « Mes IA »,
  // leurs modèles portent le préfixe « fournisseur: » ; un siège garde { provider, model } sans préfixe.
  // Pour en ajouter un : une entrée ici (champ de clé dans body.html), ses fonctions list/check,
  // son appel dans agent() et son libellé de stats dans Engine.seatLabel.
  const DIRECT = { gemini: { name: 'Gemini', tag: 'clé Gemini', keyName: 'lga.key.gemini', input: 'gm-key' } };
  let sample = null;

  const DEFAULT_OR = ['google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat-v3.1', 'mistralai/mistral-medium-3.1'];
  const TIERS = [['quick', 'Claude rapide'], ['default', 'Claude standard'], ['complex', 'Claude avancé']];

  function defaultSeat(i) {
    if (env.openrouter) { const r = config.roster?.length ? config.roster : DEFAULT_OR; return { provider: 'openrouter', model: r[i % r.length] }; }
    if (env.claude) return { provider: 'claude', model: i % 2 === 0 ? 'quick' : 'default' };
    return { provider: 'bot', model: 'bot' };
  }
  function providerOk(p) { return p === 'bot' || p === 'human' || env[p]; }

  let config = store.get('lga.config', null) || {};
  config.rounds = config.rounds || 2;
  config.roster = Array.isArray(config.roster) ? config.roster : DEFAULT_OR.slice();
  config.mayor = config.mayor ?? true;
  config.seriesSize = config.seriesSize || 1;
  config.memory = config.memory ?? 3;
  config.n = Math.min(10, Math.max(5, Number(config.n) || 8));
  config.compo = config.compo || Engine.presetCompo(config.n);
  config.maxDays = config.maxDays || 10;
  config.turnLimit = config.turnLimit || 45;
  config.fixRoles = !!config.fixRoles;
  config.parallel = Math.min(4, Math.max(1, Number(config.parallel) || 1));
  function sanitizeSeats() {
    const s = Array.isArray(config.seats) ? config.seats.slice(0, config.n) : [];
    for (let i = 0; i < config.n; i++) if (!s[i] || !providerOk(s[i].provider)) s[i] = defaultSeat(i);
    config.seats = s;
  }
  const saveConfig = () => store.set('lga.config', config);
  const touch = () => { config.touched = true; saveConfig(); };

  // ---------- Onglets ----------
  function show(view) {
    for (const v of ['play', 'setup', 'stats']) {
      $('view-' + v).hidden = v !== view;
      $('tab-' + v).setAttribute('aria-selected', String(v === view));
    }
    if (view === 'stats') renderStats();
    try { sessionStorage.setItem('lga.view', view); } catch (_) { /* facultatif */ }
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  // ---------- Réglages ----------
  function renderEnv() {
    const note = $('env-note');
    if (env.openrouter) {
      note.textContent = 'Les modèles sont appelés via OpenRouter : Gemini, Llama, DeepSeek, Mistral, GPT, Claude… Choisis un identifiant de modèle par siège.';
    } else if (env.claude) {
      note.textContent = 'Version jouable dans Claude : les joueurs sont des modèles Claude (rapide, standard ou avancé). Les autres fournisseurs passent par la version web avec OpenRouter.';
      if (HOSTED_URL.startsWith('http')) {
        note.append(' ');
        const a = el('a', null, 'Ouvrir la version web'); a.href = HOSTED_URL; a.target = '_blank'; a.rel = 'noopener';
        note.append(a);
      }
    } else {
      note.textContent = 'Aucun modèle n\'est disponible ici : seuls les bots aléatoires et toi pouvez jouer.';
    }
    $('key-block').hidden = !env.openrouter;
    $('direct-keys').hidden = !Object.keys(DIRECT).some((k) => env[k]);
    $('roster-card').hidden = !env.openrouter;
    $('or-key').value = store.get('lga.key', '');
  }
  $('or-key').addEventListener('change', (e) => store.set('lga.key', e.target.value.trim()));
  for (const [k, d] of Object.entries(DIRECT)) {
    if (!env[k]) continue;
    const inp = $(d.input);
    inp.value = store.get(d.keyName, '');
    if (inp.value) $('direct-keys').open = true;
    const save = () => { const v = inp.value.trim(); if (v === store.get(d.keyName, '')) return false; store.set(d.keyName, v); loadModelList(); renderSeats(); return true; };
    inp.addEventListener('change', save);
    $(`${d.input}-toggle`).addEventListener('click', () => { const h = inp.type === 'password'; inp.type = h ? 'text' : 'password'; $(`${d.input}-toggle`).textContent = h ? 'Masquer' : 'Voir'; });
    $(`${d.input}-check`).addEventListener('click', async () => {
      save();
      const st = $(`${d.input}-status`); const key = inp.value.trim();
      if (!key) { st.textContent = `Colle d'abord ta clé ${d.name}.`; st.className = 'hint'; return; }
      st.textContent = 'Vérification…'; st.className = 'hint';
      try {
        const r = await DIRECT[k].check(key);
        st.textContent = r.ok ? `${r.text} Cherche « ${d.name.toLowerCase()} » dans « Ajouter une IA » : les modèles marqués « ${d.tag} » passent par elle.` : r.text;
        st.className = r.ok ? 'hint ok' : 'error';
      } catch (_) { st.textContent = `${d.name} injoignable. Vérifie ta connexion.`; st.className = 'error'; }
    });
  }
  $('or-key-toggle').addEventListener('click', () => {
    const i = $('or-key'); const hidden = i.type === 'password';
    i.type = hidden ? 'text' : 'password'; $('or-key-toggle').textContent = hidden ? 'Masquer' : 'Voir';
  });

  function providerOptions() {
    const o = [];
    if (env.openrouter) o.push(['openrouter', 'OpenRouter']);
    for (const [k, d] of Object.entries(DIRECT)) if (env[k] && (store.get(d.keyName, '') || config.seats?.some((s) => s.provider === k))) o.push([k, `${d.name} (clé directe)`]);
    if (env.claude) o.push(['claude', 'Claude']);
    o.push(['bot', 'Bot aléatoire'], ['human', 'Toi (humain)']);
    return o;
  }

  function renderSeats() {
    const ol = $('seats'); ol.textContent = '';
    config.seats.forEach((seat, i) => {
      const li = el('li', 'seat');
      li.append(el('span', 'num', `S${i + 1}`));
      const sel = el('select'); sel.id = `seat-p-${i}`; sel.setAttribute('aria-label', `Fournisseur du siège ${i + 1}`);
      for (const [v, t] of providerOptions()) { const o = el('option', null, t); o.value = v; sel.append(o); }
      sel.value = seat.provider;
      sel.addEventListener('change', () => {
        const p = sel.value;
        if (p === 'human') config.seats.forEach((s, j) => { if (j !== i && s.provider === 'human') config.seats[j] = defaultSeat(j); });
        const mine = (prov) => config.roster.map(seatFromRosterId).filter((s) => s.provider === prov);
        if (p === 'openrouter' || DIRECT[p]) {
          const list = mine(p);
          config.seats[i] = list[i % (list.length || 1)] || { provider: p, model: p === 'openrouter' ? DEFAULT_OR[0] : '' };
        } else config.seats[i] = p === 'claude' ? { provider: p, model: 'quick' } : { provider: p, model: p };
        touch(); renderSeats();
      });
      li.append(sel);
      let m;
      if (isModelSeat(seat)) {
        m = el('select', 'model');
        const cur = rosterIdOf(seat);
        const ids = config.roster.includes(cur) || !seat.model ? config.roster : [cur, ...config.roster];
        for (const id of ids) { const o = el('option', null, modelName(id) + (isFree(id) ? ` (${FREE_NOTE})` : '')); o.value = id; m.append(o); }
        m.value = cur;
        m.addEventListener('change', () => { const role = config.seats[i].role; config.seats[i] = { ...seatFromRosterId(m.value), role }; touch(); renderSeats(); });
      } else if (seat.provider === 'claude') {
        m = el('select', 'model');
        for (const [v, t] of TIERS) { const o = el('option', null, t); o.value = v; m.append(o); }
        m.value = seat.model;
        m.addEventListener('change', () => { config.seats[i].model = m.value; touch(); });
      } else {
        m = el('span', 'model hint', seat.provider === 'human' ? 'Tu joues ce siège' : 'Choix au hasard');
      }
      m.id = `seat-m-${i}`; m.setAttribute('aria-label', `Modèle du siège ${i + 1}`);
      li.append(m);
      if (config.fixRoles) {
        const r = el('select', 'role-pick'); r.id = `seat-r-${i}`; r.setAttribute('aria-label', `Rôle du siège ${i + 1}`);
        const c = config.compo;
        const opts = [['', 'Rôle au hasard'], ['LOUP', 'Loup-Garou'], ...(c.seer ? [['VOYANTE', 'Voyante']] : []), ...(c.witch ? [['SORCIERE', 'Sorcière']] : []), ['VILLAGEOIS', 'Villageois']];
        for (const [v, t] of opts) { const o = el('option', null, t); o.value = v; r.append(o); }
        r.value = opts.some(([v]) => v === seat.role) ? seat.role || '' : '';
        r.addEventListener('change', () => { config.seats[i].role = r.value; touch(); });
        li.classList.add('with-role'); li.append(r);
      }
      ol.append(li);
    });
  }
  $('preset-btn').addEventListener('click', () => { config.seats = Array.from({ length: config.n }, (_, i) => defaultSeat(i)); saveConfig(); renderSeats(); });
  // ---------- Composition ----------
  function compoError(c, n) {
    if (c.villagers < 0) return 'Trop de rôles spéciaux pour ce nombre de joueurs.';
    if (c.wolves * 2 >= n - 1) return 'Trop de Loups : ils gagneraient dès la première nuit.';
    return '';
  }
  function renderCompo() {
    const c = config.compo;
    c.villagers = config.n - c.wolves - (c.seer ? 1 : 0) - (c.witch ? 1 : 0);
    $('nplayers').value = String(config.n); $('nwolves').value = String(c.wolves);
    $('has-seer').checked = c.seer; $('has-witch').checked = c.witch;
    for (const o of $('nwolves').options) o.disabled = Number(o.value) * 2 >= config.n - 1;
    const err = compoError(c, config.n);
    $('compo-warn').textContent = err; $('compo-warn').hidden = !err;
    $('compo-note').textContent = err ? '' : `${Engine.compoText(Engine.compoKeys(c))}.`;
    $('seats-title').textContent = `Les ${config.n} sièges`;
  }
  $('nplayers').addEventListener('change', (e) => {
    config.n = Number(e.target.value); config.compo = Engine.presetCompo(config.n);
    sanitizeSeats(); touch(); renderCompo(); renderSeats();
  });
  $('nwolves').addEventListener('change', (e) => { config.compo.wolves = Number(e.target.value); renderCompo(); saveConfig(); });
  $('has-seer').addEventListener('change', (e) => { config.compo.seer = e.target.checked; renderCompo(); saveConfig(); if (config.fixRoles) renderSeats(); });
  $('has-witch').addEventListener('change', (e) => { config.compo.witch = e.target.checked; renderCompo(); saveConfig(); if (config.fixRoles) renderSeats(); });
  $('fix-roles').addEventListener('change', (e) => { config.fixRoles = e.target.checked; saveConfig(); renderSeats(); });

  $('rounds').addEventListener('change', (e) => { config.rounds = Number(e.target.value); saveConfig(); });
  $('maxdays').addEventListener('change', (e) => { config.maxDays = Number(e.target.value); saveConfig(); });
  $('turn-limit').addEventListener('change', (e) => { config.turnLimit = Number(e.target.value); saveConfig(); });
  $('parallel').addEventListener('change', (e) => { config.parallel = Number(e.target.value); saveConfig(); });
  $('mayor').addEventListener('change', (e) => { config.mayor = e.target.checked; saveConfig(); });
  $('series-size').addEventListener('change', (e) => { config.seriesSize = Number(e.target.value); saveConfig(); $('memory-wrap').hidden = config.seriesSize < 2; });
  $('memory').addEventListener('change', (e) => { config.memory = Number(e.target.value); saveConfig(); });

  // ---------- Catalogue OpenRouter et « Mes IA » ----------
  let catalog = [];
  const modelName = (id) => catalog.find((m) => m.id === id)?.name || id;
  const rosterIdOf = (seat) => (DIRECT[seat.provider] ? `${seat.provider}:${seat.model}` : seat.model);
  const seatFromRosterId = (id) => {
    const m = /^([a-z]+):(.+)$/.exec(id || '');
    return m && DIRECT[m[1]] ? { provider: m[1], model: m[2] } : { provider: 'openrouter', model: id };
  };
  const isModelSeat = (s) => s.provider === 'openrouter' || !!DIRECT[s.provider];
  const seatModelName = (s) => modelName(rosterIdOf(s));
  // Les variantes « :free » d'OpenRouter sont plafonnées (requêtes par minute et par jour) : elles calent souvent.
  const isFree = (id) => /:free$/.test(id || '');
  const FREE_NOTE = 'gratuit, débit limité';
  const price = (m) => {
    const inp = Number(m.pricing?.prompt) * 1e6, out = Number(m.pricing?.completion) * 1e6;
    if (!isFinite(inp) || !isFinite(out)) return '';
    return inp === 0 && out === 0 ? 'gratuit' : `${inp.toFixed(2)} $ / ${out.toFixed(2)} $ par M tokens`;
  };

  let directCatalog = [];
  async function loadDirectModels() {
    directCatalog = [];
    for (const [k, d] of Object.entries(DIRECT)) {
      const key = store.get(d.keyName, '');
      if (!env[k] || !key) continue;
      try { directCatalog.push(...(await d.list(key)).map((m) => ({ ...m, id: `${k}:${m.id}`, direct: k }))); } catch (_) { /* clé invalide : signalé par Vérifier */ }
    }
  }
  async function loadModelList() {
    if (!env.openrouter) return;
    $('catalog-status').textContent = 'Chargement du catalogue OpenRouter…';
    try {
      const [r] = await Promise.all([fetch('https://openrouter.ai/api/v1/models'), loadDirectModels()]);
      const d = await r.json();
      catalog = (d.data || []).map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing })).concat(directCatalog).sort((a, b) => a.name.localeCompare(b.name));
      $('catalog-status').textContent = `${catalog.length} modèles disponibles${directCatalog.length ? `, dont ${directCatalog.length} avec ta clé directe` : ''}.`;
      const unknown = config.roster.filter((id) => !catalog.some((m) => m.id === id));
      if (unknown.length) $('catalog-status').textContent += ` Introuvable(s) dans le catalogue : ${unknown.join(', ')}. Retire-les ou remplace-les.`;
      renderRoster(); renderSeats(); renderResults();
    } catch (_) {
      $('catalog-status').textContent = 'Catalogue injoignable pour l\'instant. Les IA déjà choisies restent utilisables.';
    }
  }

  function renderRoster() {
    const ul = $('roster'); ul.textContent = '';
    for (const id of config.roster) {
      const li = el('li'); li.title = id;
      const name = el('span', null, modelName(id)); if (isFree(id)) { li.classList.add('free'); li.title = `${id} : ${FREE_NOTE}`; }
      const dp = seatFromRosterId(id).provider; if (DIRECT[dp]) { li.classList.add('direct'); li.dataset.tag = DIRECT[dp].tag; }
      const rm = el('button', null, '×'); rm.type = 'button'; rm.setAttribute('aria-label', `Retirer ${modelName(id)}`);
      rm.addEventListener('click', () => {
        config.roster = config.roster.filter((x) => x !== id); touch(); renderRoster(); renderResults(); renderSeats();
      });
      li.append(name, rm); ul.append(li);
    }
    if (!config.roster.length) ul.append(el('li', 'hint', 'Aucune IA : ajoutes-en au moins une.'));
  }

  function renderResults() {
    const ul = $('model-results'); ul.textContent = '';
    const q = $('model-search').value.trim().toLowerCase();
    if (!q || !catalog.length) return;
    const words = q.split(/\s+/);
    const hits = catalog.filter((m) => words.every((w) => (m.id + ' ' + m.name).toLowerCase().includes(w))).slice(0, 40);
    if (!hits.length) { ul.append(el('li', 'hint', 'Aucun modèle ne correspond.')); return; }
    for (const m of hits) {
      const li = el('li');
      const info = el('div'); info.append(el('div', 'mname', m.name), el('div', 'mid', `${m.id}${price(m) ? ' · ' + price(m) : ''}`));
      if (isFree(m.id)) info.append(el('div', 'warn-free', 'Gratuit mais limité par OpenRouter : il peut rester bloqué ou passer son tour en pleine partie.'));
      if (m.direct) info.append(el('div', 'tag-direct', `Appelé en direct avec ta ${DIRECT[m.direct].tag}, sans passer par OpenRouter.`));
      const added = config.roster.includes(m.id);
      const b = el('button', added ? 'ghost' : 'primary', added ? 'Ajoutée' : 'Ajouter'); b.type = 'button'; b.disabled = added;
      b.addEventListener('click', () => { config.roster.push(m.id); touch(); renderRoster(); renderResults(); renderSeats(); });
      li.append(info, b); ul.append(li);
    }
  }
  $('model-search').addEventListener('input', renderResults);

  $('spread-btn').addEventListener('click', () => {
    if (!config.roster.length) { $('catalog-status').textContent = 'Ajoute au moins une IA avant de répartir.'; return; }
    let k = 0;
    config.seats = config.seats.map((s) => (s.provider === 'human' ? s : { ...seatFromRosterId(config.roster[k++ % config.roster.length]), role: s.role }));
    touch(); renderSeats();
    $('catalog-status').textContent = `${config.roster.length} IA réparties sur ${k} sièges.`;
  });

  $('or-key-check').addEventListener('click', async () => {
    const key = $('or-key').value.trim(); store.set('lga.key', key);
    const st = $('key-status'); st.className = 'hint';
    if (!key) { st.textContent = 'Colle d\'abord ta clé OpenRouter.'; return; }
    st.textContent = 'Vérification…';
    try {
      const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } });
      if (r.status === 401) { st.textContent = 'Clé refusée par OpenRouter. Vérifie qu\'elle est complète.'; st.className = 'error'; return; }
      const d = (await r.json())?.data || {};
      const left = d.limit_remaining ?? (d.limit != null ? d.limit - (d.usage || 0) : null);
      st.textContent = `Clé valide. Dépensé : ${(d.usage || 0).toFixed(2)} $${left != null ? ` · reste ${Number(left).toFixed(2)} $ sur cette clé` : ''}.`;
      st.className = 'hint ok';
    } catch (_) { st.textContent = 'OpenRouter injoignable. Vérifie ta connexion.'; st.className = 'error'; }
  });

  // ---------- Appels aux modèles ----------
  // Toutes les requêtes en cours, pour pouvoir les annuler d'un coup (votes en parallèle).
  const inflight = new Set();
  // Une erreur « lente » : le joueur a épuisé son temps, la partie joue son action par défaut sans réessayer.
  const slowErr = (m) => Object.assign(new Error(m), { slow: true });
  // Chaque requête est rattachée à sa partie : arrêter une partie n'annule que ses propres appels.
  function newCtl(game) {
    const c = new AbortController(); inflight.add(c);
    if (game) (game._ctls ||= new Set()).add(c);
    c.done = () => { clearTimeout(c.timer); inflight.delete(c); game?._ctls?.delete(c); };
    return c;
  }
  function abortAll(game) {
    const set = game ? game._ctls || new Set() : inflight;
    for (const c of [...set]) { try { c.abort(); } catch (_) { /* rien */ } inflight.delete(c); }
    set.clear();
  }

  // Modèles qui refusent response_format : retenus pour ne pas payer un aller-retour 400 à chaque appel.
  const noJsonMode = new Set();
  // Onglet caché (Safari en arrière-plan) : la partie se met en pause au lieu de réessayer en boucle.
  function holdWhileHidden(game) {
    if (document.hidden && !game.paused && !game.stopped) {
      game.pause();
      const t = tableOf(game); if (t) t.autoPaused = true;
      updatePause(); renderTabs();
    }
  }
  async function callOpenRouter(model, system, prompt, game) {
    const key = store.get('lga.key', '') || $('or-key').value.trim();
    const limit = (game.turnLimit || 45) * 1000;
    let deadline = Date.now() + limit;
    const left = () => deadline - Date.now();
    const wait = async (ms) => { if (left() < ms + 3000) throw slowErr(`pas de réponse en ${limit / 1000} s`); await sleep(ms); };
    let useFormat = !noJsonMode.has(model);
    let maxTokens = 2000;
    for (let i = 0; i < 4; i++) {
      if (left() < 2000) throw slowErr(`pas de réponse en ${limit / 1000} s`);
      const ctl = newCtl(game);
      let timedOut = false;
      ctl.timer = setTimeout(() => { timedOut = true; ctl.abort(); }, left());
      const t0 = Date.now();
      let res, data;
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: ctl.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Arene des Loups' },
          body: JSON.stringify({
            model, temperature: 0.9, max_tokens: maxTokens, usage: { include: true },
            reasoning: { effort: 'low', exclude: true },
            messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
            // Fournisseur le plus rapide disponible pour ce modèle.
            provider: { sort: 'throughput' },
            ...(useFormat ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        data = await res.json().catch(() => null);
      } catch (e) {
        ctl.done();
        if (game.stopped) throw e;
        // Safari en arrière-plan coupe les requêtes : on attend la reprise sans compter d'essai.
        if (document.hidden || game.paused) { holdWhileHidden(game); await game.gate(); deadline += Date.now() - t0; i--; continue; }
        if (timedOut) throw slowErr(`pas de réponse en ${limit / 1000} s`);
        if (i < 3) { await wait(1500 * (i + 1)); continue; }
        throw new Error('réseau injoignable');
      }
      ctl.done();
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw fatal('Clé OpenRouter refusée. Vérifie-la dans Réglages.');
      if (res.status === 402) throw fatal('Crédit OpenRouter insuffisant pour continuer la partie.');
      if (res.status === 404 || /not a valid model|no endpoints found/i.test(msg)) throw fatal(`Modèle introuvable sur OpenRouter : ${model}`);
      if (/context length|context window|maximum context|too many tokens|prompt is too long/i.test(msg)) throw slowErr('historique trop long pour ce modèle');
      if (res.status === 400 && useFormat) { useFormat = false; noJsonMode.add(model); continue; }
      if (res.status === 429 && (isFree(model) || /per-day|per day/i.test(msg))) throw slowErr('limite gratuite OpenRouter atteinte');
      if (res.status === 429 || res.status >= 500) { await wait(2500 * (i + 1)); continue; }
      if (!res.ok) throw new Error(msg);
      game.cost = (game.cost || 0) + (data?.usage?.cost || 0);
      const choice = data?.choices?.[0];
      const c = choice?.message?.content;
      if (!c && choice?.finish_reason === 'length' && maxTokens < 6000 && left() > 15000) { maxTokens = 6000; continue; }
      if (!c) throw new Error(data?.error?.message || 'réponse vide');
      return c;
    }
    throw slowErr('service surchargé');
  }

  // ---------- Gemini en direct (clé Google AI Studio) ----------
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  DIRECT.gemini.list = async (key) => {
    const r = await fetch(`${GEMINI}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini/.test(m.name) && !/embedding|tts|image|audio|live|vision/i.test(m.name))
      .map((m) => { const id = m.name.replace(/^models\//, ''); return { id, name: `${m.displayName || id} (clé Gemini)` }; });
  };
  DIRECT.gemini.check = async (key) => {
    const r = await fetch(`${GEMINI}/models?pageSize=1`, { headers: { 'x-goog-api-key': key } });
    if (r.ok) return { ok: true, text: 'Clé Gemini valide.' };
    return { ok: false, text: r.status === 400 || r.status === 403 ? 'Clé refusée par Google. Vérifie qu\'elle est complète.' : `Google répond ${r.status}.` };
  };

  async function callGemini(model, system, prompt, game) {
    const key = store.get(DIRECT.gemini.keyName, '');
    const limit = (game.turnLimit || 45) * 1000;
    let deadline = Date.now() + limit;
    const left = () => deadline - Date.now();
    const wait = async (ms) => { if (left() < ms + 3000) throw slowErr(`pas de réponse en ${limit / 1000} s`); await sleep(ms); };
    // Même réflexion que via OpenRouter : effort « low » ≈ 20 % de max_tokens (2000), soit ~400 tokens ;
    // 512 est le minimum accepté par toutes les variantes 2.5 (Flash-Lite compris). Gemini 3+ : niveau « low ».
    let thinking = /gemini-2\.5/.test(model) ? { thinkingBudget: 512 } : /gemini-[3-9]/.test(model) ? { thinkingLevel: 'low' } : null;
    let useFormat = !noJsonMode.has(`gemini:${model}`);
    let maxTokens = 2000;
    for (let i = 0; i < 4; i++) {
      if (left() < 2000) throw slowErr(`pas de réponse en ${limit / 1000} s`);
      const ctl = newCtl(game);
      let timedOut = false;
      ctl.timer = setTimeout(() => { timedOut = true; ctl.abort(); }, left());
      const t0 = Date.now();
      let res, data;
      try {
        // Clé dans l'en-tête plutôt que dans l'URL : elle n'apparaît ni dans les journaux réseau ni dans les erreurs.
        res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.9, maxOutputTokens: maxTokens + 1000,
              ...(useFormat ? { responseMimeType: 'application/json' } : {}),
              ...(thinking ? { thinkingConfig: thinking } : {}),
            },
          }),
        });
        data = await res.json().catch(() => null);
      } catch (e) {
        ctl.done();
        if (game.stopped) throw e;
        if (document.hidden || game.paused) { holdWhileHidden(game); await game.gate(); deadline += Date.now() - t0; i--; continue; }
        if (timedOut) throw slowErr(`pas de réponse en ${limit / 1000} s`);
        if (i < 3) { await wait(1500 * (i + 1)); continue; }
        throw new Error('réseau injoignable');
      }
      ctl.done();
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 && /api key/i.test(msg) || res.status === 401 || res.status === 403) throw fatal('Clé Gemini refusée. Vérifie-la dans Réglages.');
      if (res.status === 404) throw fatal(`Modèle introuvable chez Google : ${model}`);
      if (/token count|exceeds the maximum|context/i.test(msg) && res.status === 400) throw slowErr('historique trop long pour ce modèle');
      if (res.status === 400 && thinking) { thinking = null; continue; }
      if (res.status === 400 && useFormat) { useFormat = false; noJsonMode.add(`gemini:${model}`); continue; }
      if (res.status === 429 && /per ?day|PerDay/i.test(msg)) throw slowErr('quota Gemini du jour atteint');
      if (res.status === 429 || res.status >= 500) { await wait(4000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(msg);
      const cand = data?.candidates?.[0];
      const c = (cand?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
      if (!c && cand?.finishReason === 'MAX_TOKENS' && maxTokens < 6000 && left() > 15000) { maxTokens = 6000; continue; }
      if (!c) throw new Error(cand?.finishReason ? `réponse vide (${cand.finishReason})` : 'réponse vide');
      return c;
    }
    throw slowErr('service Gemini surchargé');
  }

  async function callClaude(tier, system, prompt, game) {
    const run = () => {
      const ctl = newCtl(game);
      ctl.timer = setTimeout(() => ctl.abort(), 180000);
      const opts = { modelTier: tier, cache: false, signal: ctl.signal };
      if (tier !== 'quick') opts.effort = 'low';
      return sample.json(`${system}\n\n${prompt}`, opts).finally(() => ctl.done());
    };
    try { return await run(); } catch (e) {
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired'].includes(e.code)) {
        throw fatal(e.code === 'session_expired' ? 'Session Claude expirée : reconnecte-toi puis relance.' : 'Claude n\'est pas autorisé pour cette page. Autorise-le puis relance une partie.');
      }
      if (e.code === 'rate_limited') {
        const tb = tableOf(game); if (tb) tb.banner = 'Limite d\'utilisation de Claude atteinte. La partie est en pause : appuie sur Reprendre un peu plus tard.';
        showBanner(); game.pause(); updatePause(); renderTabs(); await game.gate();
        return run();
      }
      if (e.code === 'cancelled' && !game.stopped) throw slowErr('pas de réponse en 3 min');
      throw new Error(e.message || e.code || 'erreur Claude');
    }
  }

  // ---------- Partie ----------
  // ---------- Parties (une ou plusieurs tables en parallèle) ----------
  // Chaque table fait tourner sa propre partie (ou sa propre série). L'écran Partie montre la table
  // active ; les autres continuent en fond et leur fil se reconstruit à partir de leurs événements.
  // La table « principale » (mode une seule partie) garde la sauvegarde et la reprise (lga.current, lga.series).
  const tables = [];
  let active = null;
  let game = null; // partie de la table active
  let human = null; // joueur humain de la table active
  let wakeLock = null;
  const running = (t) => !!t.game && t.game.phase !== 'end';
  const anyRunning = () => tables.some(running) || tables.some((t) => t.nextTimer);
  const tableOf = (g) => tables.find((t) => t.game === g) || null;

  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (_) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    const live = tables.filter(running);
    if (!live.length) return;
    if (document.visibilityState === 'hidden') {
      for (const t of live) if (!t.game.paused) { t.game.pause(); t.autoPaused = true; }
      updatePause(); renderTabs();
    } else {
      keepAwake();
      const held = tables.filter((t) => running(t) && t.autoPaused);
      const msg = held.length > 1 ? `${held.length} parties en pause pendant que l'appli était en arrière-plan. Appuie sur Reprendre pour toutes les relancer.` : 'Partie en pause pendant que l\'appli était en arrière-plan. Appuie sur Reprendre pour continuer.';
      for (const t of held) t.banner = msg;
      if (held.length && active && !held.includes(active)) active.banner = msg;
      showBanner(); updatePause(); renderTabs();
    }
  });

  function setThinking(text) { $('thinking').hidden = !text; if (text) $('thinking-text').textContent = text; }

  // Joueurs dont on attend la réponse, avec le temps écoulé : on voit qui traîne.
  let pendingTimer = null;
  function refreshThinking() {
    const pending = active?.pending;
    if (!tables.some((t) => t.pending.size)) { clearInterval(pendingTimer); pendingTimer = null; }
    if (!pending || !pending.size) { setThinking(null); return; }
    const list = [...pending.values()];
    const first = list[0];
    const s = Math.floor((Date.now() - first.t0) / 1000);
    let text = thinkingText(first.p, first.task);
    if (list.length > 1 && canReveal()) text += ` En attente de ${list.map((x) => x.p.name).join(', ')}.`;
    else if (list.length > 1 && first.task.kind === 'vote') text = `Le village vote… ${list.length} bulletins attendus.`;
    if (s >= 10) {
      text += ` ${s} s`;
      const slowest = list.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
      const who = isModelSeat(slowest.p.seat) && canReveal() ? ` (${seatModelName(slowest.p.seat)})` : '';
      if (s >= 20) text += ` · ${slowest.p.name}${who} est lent, limite ${game?.turnLimit || config.turnLimit} s`;
    }
    setThinking(text);
    $('thinking').classList.toggle('slow', s >= 20);
  }

  function thinkingText(p, task) {
    const r = canReveal();
    if (task.kind === 'speech') return `${p.name} prend la parole…`;
    if (task.kind === 'vote') return r ? `${p.name} vote…` : 'Le village vote…';
    return r ? `${p.name} (${p.role}) agit dans la nuit…` : 'Le village dort…';
  }

  async function agent(p, task) {
    const t = tableOf(task.game);
    const token = {};
    if (t && p.seat.provider !== 'human') {
      t.pending.set(token, { p, task, t0: Date.now() });
      if (t === active) refreshThinking();
      pendingTimer = pendingTimer || setInterval(refreshThinking, 1000);
    }
    if (t === active) markSpeaking(task.kind === 'speech' ? p.id : null);
    try {
      switch (p.seat.provider) {
        case 'bot': await sleep(task.kind === 'speech' ? 500 : 150); return Engine.botAgent(p, task);
        case 'human': return await humanTurn(p, task);
        case 'openrouter': return await callOpenRouter(p.seat.model, task.system, task.prompt, task.game);
        case 'gemini': return await callGemini(p.seat.model, task.system, task.prompt, task.game);
        case 'claude': return await callClaude(p.seat.model, task.system, task.prompt, task.game);
      }
      throw fatal('Fournisseur inconnu');
    } finally { t?.pending.delete(token); if (t === active) refreshThinking(); }
  }

  function startError(msg) { const e = $('setup-error'); e.textContent = msg; e.hidden = !msg; if (msg) show('setup'); }

  // ---------- Séries ----------
  let series = store.get('lga.series', null); // série de la table principale, sauvegardée
  const saveSeries = () => store.set('lga.series', series);

  function shuffleArr(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const newSeries = (seats) => ({
    id: `serie-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
    size: config.seriesSize, memoryGames: config.memory, index: 1,
    seats: shuffleArr(seats), compo: { ...config.compo }, rounds: config.rounds, maxDays: config.maxDays, mayor: config.mayor,
    recaps: {},
  });

  // compo : null pour une partie reprise (composition déjà distribuée).
  function checkSeats(seats, compo = config.compo) {
    renderCompo();
    const cerr = compo ? compoError({ ...compo, villagers: seats.length - compo.wolves - (compo.seer ? 1 : 0) - (compo.witch ? 1 : 0) }, seats.length) : '';
    if (cerr) return cerr;
    if (compo) {
      const keys = Engine.compoKeys({ ...compo, villagers: seats.length - compo.wolves - (compo.seer ? 1 : 0) - (compo.witch ? 1 : 0) });
      for (const k of ['LOUP', 'VOYANTE', 'SORCIERE', 'VILLAGEOIS']) {
        const want = seats.filter((s) => s.role === k).length, have = keys.filter((x) => x === k).length;
        if (want > have) return `Rôles imposés : ${want} siège${want > 1 ? 's' : ''} en ${Engine.ROLE[k]}, mais la composition n'en prévoit que ${have}.`;
      }
    }
    if (seats.some((s) => s.provider === 'openrouter')) {
      const key = $('or-key').value.trim(); store.set('lga.key', key);
      if (!key) return 'Colle ta clé OpenRouter avant de lancer la partie.';
    }
    for (const [k, d] of Object.entries(DIRECT)) {
      if (seats.some((s) => s.provider === k) && !store.get(d.keyName, '')) return `Colle ta clé ${d.name} dans Réglages avant de lancer la partie.`;
    }
    const empty = seats.findIndex((s) => isModelSeat(s) && !s.model);
    if (empty >= 0) return `Le siège ${empty + 1} n'a pas de modèle.`;
    return '';
  }

  function startGame() {
    if (tables.some(running)) { startError('Des parties sont en cours : arrête-les depuis l\'onglet Partie avant d\'en lancer d\'autres.'); return; }
    startError('');
    const seats = config.seats.map((s, i) => ({ ...s, id: `s${i + 1}`, role: config.fixRoles ? s.role || '' : '' }));
    const err = checkSeats(seats);
    if (err) return startError(err);
    const n = config.parallel;
    if (n > 1 && seats.some((s) => s.provider === 'human')) return startError('Les parties en parallèle se jouent entre IA : retire ton siège humain ou lance une seule partie.');
    const cur = store.get('lga.current', null);
    if (((series && !series.done) || cur) && !replaceOk) {
      $('replace-text').textContent = cur
        ? 'Une partie interrompue peut encore être reprise depuis l\'onglet Partie. En lancer une nouvelle l\'abandonne.'
        : `Une série est en cours (partie ${series.index} sur ${series.size}). En lancer une nouvelle l'abandonne.`;
      $('replace-confirm').hidden = false; show('setup');
      return;
    }
    replaceOk = false; $('replace-confirm').hidden = true;
    store.set('lga.current', null);
    for (const t of tables) clearTimeout(t.nextTimer);
    tables.length = 0;
    series = config.seriesSize > 1 && n === 1 ? newSeries(seats) : null;
    store.set('lga.series', series);
    for (let i = 0; i < n; i++) {
      const t = newTable(i + 1, n === 1);
      if (config.seriesSize > 1) t.series = n === 1 ? series : newSeries(seats);
      tables.push(t);
    }
    // Départs décalés de 2 s pour ne pas envoyer toutes les premières requêtes d'un coup.
    tables.forEach((t, i) => { if (i === 0) activate(t); setTimeout(() => launch(t, t.series ? null : seats), i * 2000); });
    renderTabs();
  }
  let replaceOk = false;
  $('replace-yes').addEventListener('click', () => { replaceOk = true; series = null; store.set('lga.series', null); startGame(); });
  $('replace-no').addEventListener('click', () => { $('replace-confirm').hidden = true; });

  function newTable(n, persist) {
    return { n, persist, game: null, human: null, series: null, debateRound: 0, ballots: 0, pending: new Map(), unseen: 0,
      nextTimer: null, nextAt: 0, failed: false, banner: '', autoPaused: false, last: '' };
  }

  function launch(t, singleSeats, snap) {
    if (running(t)) return;
    clearTimeout(t.nextTimer); t.nextTimer = null; t.nextAt = 0;
    const sr = t.series && !t.series.done ? t.series : null;
    const inSeries = snap ? !!(snap.series && sr && sr.id === snap.series.id) : !singleSeats && !!sr;
    const seats = snap ? snap.players.map((p) => p.seat) : inSeries ? sr.seats.map((s) => ({ ...s })) : singleSeats;
    if (inSeries || snap) { const err = checkSeats(seats, snap ? null : sr.compo); if (err) return startError(err); }
    t.banner = ''; t.autoPaused = false; t.failed = false; t.debateRound = 0; t.ballots = 0; t.unseen = 0; t.last = '';
    const opts = {
      seats, agent, onEvent: (ev) => onEvent(t, ev),
      compo: inSeries ? { ...sr.compo } : { ...config.compo },
      debateRounds: inSeries ? sr.rounds : config.rounds,
      maxDays: inSeries ? sr.maxDays : config.maxDays,
      mayor: inSeries ? sr.mayor : config.mayor,
      minNightMs: seats.some((s) => s.provider === 'human') ? 8000 : 0,
      parallelVotes: seats.every((s) => isModelSeat(s) || s.provider === 'bot'),
    };
    if (t.persist) {
      opts.onCheckpoint = (sn) => {
        if (store.set('lga.current', sn)) return;
        // Stockage plein : on libère d'abord les logs (repli localStorage) puis les plus vieux résumés, jamais la partie en cours.
        const logs = store.get('lga.logs', []);
        while (logs.length && !store.set('lga.current', sn)) { logs.shift(); store.set('lga.logs', logs); }
        const games = store.get('lga.games', []);
        while (games.length && !store.set('lga.current', sn)) { games.splice(0, Math.ceil(games.length / 10)); store.set('lga.games', games); }
      };
    }
    if (inSeries) {
      Object.assign(opts, {
        fixedOrder: true,
        series: { id: sr.id, index: sr.index, size: sr.size, memoryGames: sr.memoryGames },
        memoryFor: (p) => (sr.memoryGames ? (sr.recaps[p.seat.id] || []).slice(-sr.memoryGames).join('\n') : ''),
      });
    }
    const g = snap ? Engine.Game.restore(snap, opts) : new Engine.Game(opts);
    g.turnLimit = config.turnLimit;
    t.game = g;
    if (document.hidden) { g.pause(); t.autoPaused = true; }
    t.human = g.players.find((p) => p.seat.provider === 'human') || null;
    const free = g.players.filter((p) => p.seat.provider === 'openrouter' && isFree(p.seat.model)).length;
    if (free) t.banner = `${free} siège${free > 1 ? 's utilisent' : ' utilise'} un modèle gratuit (:free). OpenRouter limite fortement leur débit : attends-toi à des tours passés.`;
    t.resumedAt = snap ? `Partie reprise au ${snap.next === 'day' ? 'jour' : 'début de la nuit'} ${snap.next === 'day' ? snap.day : snap.day + 1}.` : '';
    if (t === active) { activate(t); show('play'); }
    renderTabs();
    keepAwake();
    g.run().then((summary) => {
      if (t.persist) store.set('lga.current', null);
      if (summary) {
        saveGame(summary, g);
        if (inSeries) {
          for (const p of g.players) {
            const r = (sr.recaps[p.seat.id] ||= []); r.push(Engine.gameRecap(g, p, sr.index));
            if (r.length > (sr.memoryGames || 0)) r.splice(0, r.length - (sr.memoryGames || 0));
          }
          sr.index++;
          if (sr.index > sr.size) sr.done = true;
          if (t.persist) saveSeries();
        }
      }
      finishGame(t, false);
    }).catch((e) => {
      g.phase = 'end';
      t.banner = `${e.message || String(e)}${t.persist ? ' La partie est sauvegardée : tu pourras la reprendre depuis l\'onglet Partie.' : ''}`;
      finishGame(t, true); renderIdle();
    });
  }
  $('start-btn').addEventListener('click', startGame);
  $('idle-start').addEventListener('click', startGame);
  // Reprise (mode une partie) : la table principale reprend la série ou la partie sauvegardée.
  function mainTable() {
    tables.length = 0;
    const t = newTable(1, true); t.series = series; tables.push(t); active = t; return t;
  }
  $('series-resume-btn').addEventListener('click', () => { if (!tables.some(running)) launch(mainTable()); });
  $('series-drop-btn').addEventListener('click', () => { series = null; store.set('lga.series', null); renderIdle(); });
  $('current-resume-btn').addEventListener('click', () => { const sn = store.get('lga.current', null); if (sn && !tables.some(running)) launch(mainTable(), null, sn); });
  $('current-drop-btn').addEventListener('click', () => { store.set('lga.current', null); renderIdle(); });

  function renderIdle() {
    const cur = store.get('lga.current', null);
    $('current-resume').hidden = !cur;
    if (cur) $('current-resume-text').textContent = `Une partie a été interrompue (${cur.next === 'day' ? `jour ${cur.day}` : `avant la nuit ${cur.day + 1}`}${cur.series ? `, série ${cur.series.index}/${cur.series.size}` : ''}).`;
    const live = series && !series.done && !cur;
    $('series-resume').hidden = !live;
    if (live) $('series-resume-text').textContent = `Une série est en cours : partie ${series.index} sur ${series.size}.`;
  }

  function finishGame(t, failed) {
    t.failed = failed;
    t.pending.clear();
    if (t.human) hideHuman();
    const sr = t.series;
    // Série : la partie suivante démarre seule après 10 s, que la table soit affichée ou non.
    if (!failed && t.game.winner !== 'abandon' && sr && !sr.done && t.game.series) {
      t.nextAt = Date.now() + 10000;
      t.nextTimer = setTimeout(() => { t.nextTimer = null; launch(t); }, 10000);
    }
    if (!tables.some(running) && !tables.some((x) => x.nextTimer)) { try { wakeLock?.release(); } catch (_) { /* rien */ } }
    if (t === active) {
      setThinking(null); markSpeaking(null);
      $('reveal').disabled = false;
      showBanner(); renderPlayers(); renderResult();
      requestAnimationFrame(() => $('result').scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
    renderTabs();
  }

  // ---------- Onglets des tables et mosaïque ----------
  let mosaic = false;
  function tableStatus(t) {
    const g = t.game;
    if (!g) return 'en attente';
    if (t.nextTimer) return 'partie suivante…';
    if (g.phase === 'end') return t.failed ? 'erreur' : g.winner === 'village' ? 'Village gagne' : g.winner === 'loups' ? 'Loups gagnent' : 'arrêtée';
    if (g.paused) return 'en pause';
    return g.phase === 'night' ? `Nuit ${g.day}` : g.phase === 'mayor' ? 'Maire' : g.phase === 'vote' ? `Vote J${g.day}` : `Jour ${g.day}`;
  }
  function renderTabs() {
    const bar = $('tables');
    bar.hidden = tables.length < 2;
    $('mosaic').hidden = !mosaic || tables.length < 2;
    $('game').classList.toggle('in-mosaic', mosaic && tables.length > 1);
    if (tables.length < 2) return;
    bar.textContent = '';
    const mk = (label, sel, on) => {
      const b = el('button', 'tchip', label); b.type = 'button'; b.setAttribute('aria-pressed', String(sel)); b.addEventListener('click', on); bar.append(b); return b;
    };
    mk('Mosaïque', mosaic, () => { mosaic = true; renderTabs(); });
    for (const t of tables) {
      const b = mk(`Partie ${t.n}`, !mosaic && t === active, () => { mosaic = false; activate(t); renderTabs(); });
      b.append(el('small', null, tableStatus(t)));
      if (running(t) && t !== active) b.classList.add('live');
      if (t.unseen && (t !== active || mosaic)) b.classList.add('unseen');
    }
    if (mosaic) {
      const grid = $('mosaic'); grid.textContent = '';
      for (const t of tables) {
        const c = el('button', 'mcard'); c.type = 'button';
        const g = t.game;
        const night = g && g.phase === 'night';
        c.classList.add(night ? 'night' : 'day');
        if (running(t)) c.classList.add('live');
        c.append(el('span', 'eyebrow', `Partie ${t.n}${t.series ? ` · série ${Math.min(t.series.index, t.series.size)}/${t.series.size}` : ''}`), el('b', null, tableStatus(t)));
        if (g) c.append(el('span', 'hint', `${g.alive().length} en vie`));
        c.append(el('p', 'mlast', t.last || '…'));
        c.addEventListener('click', () => { mosaic = false; activate(t); renderTabs(); });
        grid.append(c);
      }
    }
  }

  // Affiche une table : l'écran est reconstruit depuis les événements de sa partie.
  function activate(t) {
    active = t; game = t.game; human = t.human; t.unseen = 0;
    $('idle').hidden = true; $('game').hidden = false;
    $('stop-confirm').hidden = true;
    if (human) $('reveal').checked = false;
    $('reveal').disabled = !!human && running(t);
    const sr = t.series;
    $('series-label').hidden = !(sr && game?.series);
    if (sr && game?.series) $('series-label').textContent = `Série · partie ${game.series.index} sur ${sr.size}${sr.memoryGames ? ` · mémoire : ${sr.memoryGames} partie${sr.memoryGames > 1 ? 's' : ''}` : ''}`;
    rerenderFeed();
    if (t.resumedAt) $('feed').append(el('li', 'ev narr', t.resumedAt));
    showBanner();
    renderPlayers(); updatePhase(); updatePause(); refreshThinking();
    if (game && game.phase === 'end') renderResult(); else $('result').hidden = true;
    if (humanResolve && t.human) setHumanOpen(true);
  }

  function banner(text) { if (active) { active.banner = text; showBanner(); } }
  function showBanner() {
    const text = active?.banner;
    let b = $('banner');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = el('p', 'confirm error'); b.id = 'banner'; $('game').insertBefore(b, $('feed')); }
    b.textContent = text;
  }

  const heldTables = () => tables.filter((t) => running(t) && t.autoPaused && t.game.paused);
  function updatePause() {
    const b = $('pause-btn');
    const held = heldTables().length;
    b.disabled = (!game || game.phase === 'end') && !held; $('stop-btn').disabled = !game || game.phase === 'end';
    b.textContent = game?.paused || held ? (held > 1 ? `Reprendre (${held})` : 'Reprendre') : 'Pause';
  }
  $('pause-btn').addEventListener('click', () => {
    if (!game) return;
    // Reprendre relance aussi les parties mises en pause par l'arrière-plan, quel que soit l'onglet affiché.
    const held = heldTables();
    if (game.paused || held.length) {
      for (const t of new Set([...(game.paused ? [active] : []), ...held])) { t.banner = ''; t.autoPaused = false; t.game.resume(); }
      active.banner = ''; showBanner();
    } else game.pause();
    updatePause(); renderTabs();
  });
  $('stop-btn').addEventListener('click', () => { $('stop-confirm').hidden = false; });
  $('stop-no').addEventListener('click', () => { $('stop-confirm').hidden = true; });
  $('stop-yes').addEventListener('click', () => {
    $('stop-confirm').hidden = true;
    if (!game) return;
    const t = active;
    clearTimeout(t.nextTimer); t.nextTimer = null;
    if (t.series && !t.persist) t.series.done = true;
    game.stop(); abortAll(game);
    if (humanResolve && t.human) humanResolve({ pensee: '', message: '…', cible: 0, vote: 0, sauver: false, empoisonner: 0 });
  });
  $('reveal').addEventListener('change', () => { renderPlayers(); rerenderFeed(); });

  function canReveal() {
    if (!game) return false;
    if (game.phase === 'end') return $('reveal').checked;
    return $('reveal').checked && (!human || !human.alive);
  }
  function canSee(ev) {
    if (!ev.secret) return true;
    if (canReveal()) return true;
    if (human && ev.pid === human.id) return true;
    if (human && human.roleKey === 'LOUP' && game.get(ev.pid)?.roleKey === 'LOUP') return true;
    return false;
  }
  function knowsRole(p) {
    if (!p.alive || game.phase === 'end' || canReveal()) return true;
    if (human && (p.id === human.id || (human.roleKey === 'LOUP' && p.roleKey === 'LOUP'))) return true;
    return false;
  }

  const roleClass = (p) => ({ LOUP: 'wolf', VOYANTE: 'seer', SORCIERE: 'witch' }[p.roleKey] || 'village');

  function updatePhase() {
    if (!game) return;
    const a = game.alive().length;
    const night = game.phase === 'night';
    $('band').className = `phase-band ${night ? 'night' : 'day'} ph-${game.phase}`;
    let t, sub, count = `${a} en vie`;
    if (night) { t = `Nuit ${game.day}`; sub = 'Le village dort. Les rôles agissent.'; }
    else if (game.phase === 'mayor') { t = 'Présentations'; sub = 'Chacun se présente, puis le village élit son Maire.'; if (active.ballots) count = `${active.ballots} / ${a} votes`; }
    else if (game.phase === 'vote') { t = 'Vote'; sub = `Jour ${game.day} · qui quitte le village ?`; count = `${active.ballots} / ${a} votes`; }
    else if (game.phase === 'end') {
      t = 'Fin de partie'; count = '';
      sub = game.winner === 'village' ? 'Le Village l\'emporte.' : game.winner === 'loups' ? 'Les Loups-Garous l\'emportent.' : '';
    } else { t = `Jour ${game.day}`; sub = active.debateRound ? `Débat · tour ${active.debateRound} sur ${game.debateRounds}` : 'Le village se réveille.'; }
    $('phase-label').textContent = t; $('phase-sub').textContent = sub; $('phase-count').textContent = count;
  }

  function renderPlayers() {
    const ul = $('players'); ul.textContent = '';
    if (!game) return;
    const showModels = game.phase === 'end' || canReveal();
    for (const p of game.players) {
      const li = el('li', 'pl'); li.id = `pl-${p.id}`;
      if (!p.alive) li.classList.add('dead');
      const me = human && p.id === human.id;
      if (me) li.classList.add('me');
      const known = knowsRole(p);
      if (known) li.classList.add(roleClass(p));
      li.title = `${p.name}${known ? ` · ${p.role}` : ''}${showModels ? ` · ${Engine.seatLabel(p.seat)}` : ''}`;
      li.append(el('span', 'tok', String(p.id)));
      li.append(el('span', 'lbl', me ? 'Toi' : showModels ? Engine.seatLabel(p.seat) : p.name));
      if (known) li.append(el('span', 'role', p.role));
      if (game.mayor === p) li.append(el('span', 'role mayor', 'Maire'));
      ul.append(li);
    }
  }
  function markSpeaking(id) {
    document.querySelectorAll('.pl.speaking').forEach((e) => e.classList.remove('speaking'));
    if (id) $(`pl-${id}`)?.classList.add('speaking');
  }

  // Fait défiler pour que l'élément apparaisse juste au-dessus du panneau d'action (ou de la barre d'onglets).
  function revealLatest(li, behavior) {
    const sh = $('human'), tab = document.querySelector('.tabbar');
    const limit = !sh.hidden ? sh.getBoundingClientRect().top : (tab ? tab.getBoundingClientRect().top : innerHeight);
    const dy = li.getBoundingClientRect().bottom - (limit - 8);
    if (dy > 0) window.scrollBy({ top: dy, behavior: behavior || 'auto' });
  }
  function nearBottom() { return window.innerHeight + window.scrollY >= document.body.scrollHeight - 160; }

  // Résumé d'une ligne pour la mosaïque : ce que le public a vu en dernier.
  function lastLine(t, ev) {
    const g = t.game;
    if (ev.secret) return null;
    if (ev.kind === 'speech') return `${g.get(ev.pid)?.name} : ${ev.message}`;
    if (['dawn', 'vote', 'mayor', 'mayor_succession', 'end', 'error'].includes(ev.kind)) return ev.text;
    return null;
  }
  function onEvent(t, ev) {
    if (ev.kind === 'phase') { t.debateRound = 0; t.ballots = 0; }
    if (ev.kind === 'speech') t.debateRound = ev.round;
    if (ev.kind === 'ballot') t.ballots = ev.n;
    const line = lastLine(t, ev);
    if (line) { t.last = line; t.unseen++; }
    if (t !== active) {
      if (line || ev.kind === 'phase') renderTabs();
      return;
    }
    if (ev.kind === 'ballot') { updatePhase(); return; }
    const stick = nearBottom();
    const li = renderEvent(ev);
    if (li) $('feed').append(li);
    if (ev.kind === 'speech' && ev.round !== t.shownRound) { t.shownRound = ev.round; updatePhase(); }
    if (['dawn', 'vote', 'end', 'phase', 'start', 'mayor', 'mayor_succession'].includes(ev.kind)) { renderPlayers(); updatePhase(); renderTabs(); }
    else if (mosaic && line) renderTabs();
    if (stick && li) revealLatest(li, 'smooth');
  }
  function rerenderFeed() {
    const f = $('feed'); f.textContent = '';
    for (const ev of game?.events || []) { const li = renderEvent(ev); if (li) f.append(li); }
  }

  function pensee(ev) {
    const show = canReveal() || (human && ev.pid === human.id);
    if (!show || !ev.pensee || ev.pensee === '(hasard)') return null;
    return el('p', 'pensee', `Pensée : ${ev.pensee}`);
  }

  function renderEvent(ev) {
    if (!canSee(ev)) return null;
    switch (ev.kind) {
      case 'start': return el('li', 'ev narr', ev.text);
      case 'phase': return el('li', 'ev phase', ev.text);
      case 'ballot': return null;
      case 'mayor': case 'mayor_succession': {
        const li = el('li', 'ev narr vote'); li.append(el('div', null, ev.text));
        if (ev.votes) { const log = el('ul', 'votelog'); for (const v of ev.votes) log.append(el('li', null, `J${v.from} → ${v.to ? `J${v.to}` : 'blanc'}`)); li.append(log); }
        return li;
      }
      case 'dawn': return el('li', 'ev narr', ev.text);
      case 'error': {
        const q = game?.get(ev.pid);
        const mdl = q && isModelSeat(q.seat) ? `${seatModelName(q.seat)}, ` : '';
        return el('li', 'ev error', canReveal() && ev.detail ? `${ev.text} (${mdl}${ev.detail})` : ev.text);
      }
      case 'end': { const li = el('li', 'ev narr'); li.append(el('strong', null, ev.text)); return li; }
      case 'wolf_chat': case 'wolf_decision': {
        const li = el('li', 'ev night');
        li.append(el('div', 'tag', 'Canal secret des Loups'), el('div', null, ev.text));
        const pe = pensee(ev); if (pe) li.append(pe);
        return li;
      }
      case 'night': {
        const li = el('li', 'ev night');
        li.append(el('div', 'tag', canReveal() ? 'Coulisses de la nuit' : 'Ta nuit'), el('div', null, ev.text));
        const pe = pensee(ev); if (pe) li.append(pe);
        return li;
      }
      case 'speech': {
        const p = game.get(ev.pid);
        const li = el('li', 'ev speech'); if (human && p.id === human.id) li.classList.add('mine');
        const bub = el('div', 'bub');
        const who = el('div', 'who'); who.append(el('span', null, human && p.id === human.id ? 'Toi' : p.name));
        if (game.debateRounds > 1 && ev.phase !== 'mayor') who.append(el('span', 'round', `tour ${ev.round}`));
        if (canReveal()) {
          who.append(el('span', `pill ${roleClass(p)}`, p.role));
          who.append(el('span', 'tag', Engine.seatLabel(p.seat)));
          if (ev.lies) who.append(el('span', 'pill lie', ev.lies > 1 ? `${ev.lies} mensonges` : 'mensonge'));
          if (ev.leaks) who.append(el('span', 'pill lie', 'identité caviardée'));
        }
        bub.append(who, el('p', 'msg', ev.message));
        const pe = pensee(ev); if (pe) bub.append(pe);
        li.append(el('span', 'av', String(p.id)), bub);
        return li;
      }
      case 'vote': {
        const li = el('li', 'ev narr vote');
        li.append(el('div', null, ev.text));
        const counts = new Map();
        for (const v of ev.votes) if (v.to) counts.set(v.to, (counts.get(v.to) || 0) + (v.weight || 1));
        const max = counts.size ? Math.max(...counts.values()) : 0;
        const tally = el('ul', 'tally');
        for (const [id, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
          const row = el('li'); if (n === max) row.classList.add('lead');
          const track = el('span', 'track'); const fill = el('span', 'fill'); fill.style.display = 'block'; fill.style.width = `${Math.round((100 * n) / [...counts.values()].reduce((a, b) => a + b, 0))}%`; track.append(fill);
          row.append(el('span', null, human && id === human.id ? 'Toi' : `Joueur ${id}`), track, el('span', 'n', String(n)));
          tally.append(row);
        }
        const log = el('ul', 'votelog');
        for (const v of ev.votes) log.append(el('li', null, `J${v.from}${v.weight > 1 ? ' ×2' : ''} → ${v.to ? `J${v.to}` : 'blanc'}${v.fallback ? ' (pas de réponse)' : ''}`));
        li.append(tally, log);
        return li;
      }
    }
    return null;
  }

  function renderResult(failed = active?.failed) {
    const box = $('result'); box.textContent = ''; box.hidden = false;
    box.className = 'card result';
    if (failed || !game || game.winner === 'abandon') {
      box.append(el('h2', null, failed ? 'Partie interrompue par une erreur' : 'Partie arrêtée'));
      box.append(el('p', 'hint', 'Elle ne compte pas dans les statistiques.'));
    } else {
      const v = el('div', `verdict ${game.winner === 'village' ? 'village' : game.winner === 'loups' ? 'loups' : ''}`);
      v.append(el('p', 'eyebrow', `Jour ${game.day}`), el('h2', null, game.winner === 'village' ? 'Victoire du Village' : game.winner === 'loups' ? 'Victoire des Loups' : 'Égalité'));
      if (game.cost) v.append(el('p', 'hint', `Coût OpenRouter : ${game.cost.toFixed(4)} $`));
      box.append(v);
      const tot = game.players.reduce((a, p) => ({ sp: a.sp + p.stats.speeches, li: a.li + p.stats.lies, v: a.v + p.stats.votes, g: a.g + p.stats.goodVotes }), { sp: 0, li: 0, v: 0, g: 0 });
      const kpis = el('div', 'kpis');
      for (const [b, l] of [[tot.sp, 'Messages'], [tot.li, 'Mensonges'], [pct(tot.g, tot.v), 'Votes justes']]) {
        const k = el('div', 'kpi'); const bb = el('b', 'num', String(b)); k.append(bb, el('span', null, l)); kpis.append(k);
      }
      box.append(kpis);
      const cast = el('ul', 'cast');
      for (const p of game.players) {
        const li = el('li'); if (!p.alive) li.classList.add('dead');
        const mid = el('div'); mid.style.minWidth = '0';
        const who = el('div', 'who'); who.append(el('span', null, `${p.name} `), el('span', `pill ${roleClass(p)}`, p.role));
        mid.append(who, el('div', 'mdl', Engine.seatLabel(p.seat)));
        const fate = el('div', 'fate', `${p.won ? 'gagné' : 'perdu'} · ${p.alive ? 'vivant' : `mort J${p.deathDay}`}`);
        fate.append(el('br'), `${p.stats.lies} mensonge${p.stats.lies > 1 ? 's' : ''}`);
        li.append(el('span', 'av', String(p.id)), mid, fate);
        cast.append(li);
      }
      box.append(cast);
    }
    const row = el('div', 'row wrap');
    const t = active, sr = t.series;
    if (sr && !sr.done && game?.series) {
      const ok = !failed && game.winner !== 'abandon';
      const next = el('button', 'primary', ok ? `Partie ${sr.index} sur ${sr.size}` : 'Reprendre la série'); next.type = 'button';
      next.addEventListener('click', () => launch(t));
      const quit = el('button', 'ghost danger', 'Arrêter la série'); quit.type = 'button';
      quit.addEventListener('click', () => {
        clearTimeout(t.nextTimer); t.nextTimer = null; sr.done = true;
        if (t.persist) { series = null; store.set('lga.series', null); }
        box.querySelector('.countdown')?.remove(); next.remove(); quit.remove(); renderTabs();
      });
      row.append(next, quit);
      if (t.nextTimer) {
        const cd = el('p', 'hint countdown'); box.append(cd);
        const tick = () => {
          if (!box.contains(cd) || active !== t) return;
          if (!t.nextTimer) { cd.remove(); return; }
          cd.textContent = `Partie suivante dans ${Math.max(0, Math.ceil((t.nextAt - Date.now()) / 1000))} s.`;
          setTimeout(tick, 500);
        };
        tick();
      }
      box.append(row);
      updatePause(); updatePhase();
      return;
    }
    if (sr?.done && game?.series) box.append(el('p', 'ok-line', `Série terminée : ${sr.size} parties jouées. Compare les modèles dans Stats.`));
    const again = el('button', 'primary', 'Rejouer'); again.type = 'button'; again.addEventListener('click', startGame);
    const st = el('button', 'ghost', 'Voir les stats'); st.type = 'button'; st.addEventListener('click', () => show('stats'));
    row.append(again, st); box.append(row);
    updatePause(); updatePhase();
  }

  // ---------- Joueur humain ----------
  let humanResolve = null;
  // Le panneau se réduit (bouton, poignée ou glissé vers le bas) pour laisser lire le fil ;
  // un bouton flottant le rouvre. Tant qu'il est ouvert, le bas de page lui laisse la place.
  let humanOpen = false;
  function padForSheet() {
    const sh = $('human');
    document.body.style.paddingBottom = humanOpen && !sh.hidden ? `${sh.offsetHeight + 12}px` : '';
  }
  function setHumanOpen(open) {
    const active = !!humanResolve;
    humanOpen = active && open;
    $('human').hidden = !humanOpen;
    $('human-fab').hidden = !active || humanOpen;
    padForSheet();
    const last = $('feed').lastElementChild;
    if (active && last) requestAnimationFrame(() => revealLatest(last));
  }
  function hideHuman() { humanResolve = null; setHumanOpen(false); }
  function initHumanSheet() {
    $('human-min').addEventListener('click', () => setHumanOpen(false));
    $('human-fab').addEventListener('click', () => setHumanOpen(true));
    const grab = $('human-grab');
    let y0 = null, moved = false;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = false; grab.setPointerCapture?.(e.pointerId); });
    grab.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      const dy = Math.max(0, e.clientY - y0); if (dy > 6) moved = true;
      $('human').style.transform = dy ? `translateY(${dy}px)` : '';
    });
    const end = (e) => {
      if (y0 == null) return;
      const dy = e.clientY - y0; y0 = null; $('human').style.transform = '';
      if (!moved || dy > 50) setHumanOpen(false);
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', () => { y0 = null; $('human').style.transform = ''; });
    if (window.ResizeObserver) new ResizeObserver(padForSheet).observe($('human'));
    window.addEventListener('resize', padForSheet);
  }

  function humanTurn(p, task) {
    return new Promise((resolve) => {
      humanResolve = (v) => { hideHuman(); resolve(v); };
      const g = task.game;
      $('human-role').textContent = `${p.name} · ${p.role}`;
      $('human').className = `sheet fixed ${{ seer: 'seer', wolf: 'wolf', witch: 'witch' }[task.kind] || ''}`;
      $('human-targets').className = 'ballot';
      const memo = $('human-memo-list'); memo.textContent = '';
      for (const m of p.memory) memo.append(el('li', null, m));
      $('human-memo').hidden = !p.memory.length;
      const targets = $('human-targets'); targets.textContent = '';
      const text = $('human-text'); text.value = ''; text.hidden = true;
      $('human-witch').hidden = true;
      let chosen = null;
      const pickTargets = (opts) => {
        for (const q of opts) {
          const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
          const known = q.alive && knowsRole(q) && q.id !== p.id;
          const name = el('span', null, q.id === p.id ? 'Toi' : q.name); if (known) name.append(el('small', null, q.role));
          b.append(el('span', 'av', String(q.id)), name);
          b.addEventListener('click', () => { chosen = q.id; targets.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
          targets.append(b);
        }
      };
      const title = { mayor_vote: 'Élection du Maire : pour qui votes-tu ?', mayor_succession: 'Tu étais Maire : choisis ton successeur', wolf_chat: 'Canal des Loups : discute avec ta meute', wolf_vote: 'Vote de la meute : qui attaquer ?', seer: 'Voyante : qui veux-tu sonder ?', wolf: 'Loup-Garou : qui attaquer cette nuit ?', witch: 'Sorcière : tes potions', speech: 'À toi de parler au village', vote: 'Qui veux-tu éliminer ?' }[task.kind];
      $('human-title').textContent = title;
      let desc = '';
      if (task.kind === 'seer' || task.kind === 'vote' || task.kind === 'mayor_vote' || task.kind === 'mayor_succession') pickTargets(task.options);
      if (task.kind === 'wolf_chat' || task.kind === 'wolf_vote') {
        pickTargets(task.options);
        const tonight = task.channel.slice(task.channel.lastIndexOf(`— Nuit ${g.day} —`) + 1);
        desc = tonight.length ? tonight.join('\n') : 'Personne n\'a encore parlé cette nuit.';
        if (task.kind === 'wolf_chat') { text.hidden = false; text.placeholder = 'Ton message à la meute…'; }
      }
      if (task.kind === 'wolf') {
        pickTargets(task.options); text.hidden = false; text.placeholder = 'Message à ta meute (facultatif)';
        const talk = task.prompt.match(/Messages de ta meute cette nuit :\n([\s\S]*?)\n\nACTION/);
        if (talk) desc = talk[1];
      }
      if (task.kind === 'speech') { text.hidden = false; text.placeholder = 'Ton message au village…'; desc = g.phase === 'mayor' ? 'Présente-toi au village avant l\'élection du Maire.' : `Tour de parole ${task.round}. Tout le village lira ton message.`; }
      if (task.kind === 'witch') {
        $('human-witch').hidden = false;
        const v = g.get(task.victim);
        desc = `Les Loups ont attaqué ${v.name}${v.id === p.id ? ' (toi)' : ''}.`;
        $('human-save').checked = false; $('human-save').disabled = !g.witch.heal;
        const sel = $('human-poison'); sel.textContent = '';
        const none = el('option', null, 'Personne'); none.value = '0'; sel.append(none);
        for (const q of task.options) { const o = el('option', null, q.name); o.value = String(q.id); sel.append(o); }
        sel.disabled = !g.witch.poison;
      }
      $('human-desc').textContent = desc;
      $('human-fab-text').textContent = title;
      setHumanOpen(true);
      $('human-send').onclick = () => {
        if (task.kind === 'speech') {
          const m = text.value.trim(); if (!m) { text.focus(); return; }
          humanResolve({ pensee: '', message: m, role_annonce: null, affirmations: [] });
        } else if (task.kind === 'wolf_chat') {
          const m = text.value.trim(); if (!m || !chosen) { (m ? targets : text).querySelector?.('button')?.focus(); if (!m) text.focus(); return; }
          humanResolve({ pensee: '', message: m, proposition: chosen });
        } else if (task.kind === 'witch') {
          humanResolve({ pensee: '', sauver: $('human-save').checked, empoisonner: Number($('human-poison').value) });
        } else {
          if (!chosen) return;
          const key = task.kind === 'vote' || task.kind === 'mayor_vote' ? 'vote' : 'cible';
          humanResolve({ pensee: '', message_meute: text.value.trim(), [key]: chosen });
        }
      };
    });
  }

  // ---------- Statistiques ----------
  // Logs détaillés au format loup-garou-log, allégés (sans pensées privées) pour en garder beaucoup.
  const MAX_LOGS = 200;
  const MAX_GAMES = 1000;
  // Les logs détaillés vivent dans IndexedDB (localStorage plafonne à ~5 Mo, soit ~140 parties).
  // Repli sur localStorage si IndexedDB est indisponible (navigation privée, aperçu…).
  const isLog = (l) => l && l.format === 'loup-garou-log';
  const logStore = (() => {
    let dbp = null;
    const open = () => (dbp ||= new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('pas d\'IndexedDB'));
      const r = indexedDB.open('arene-des-loups', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('logs', { autoIncrement: true });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).then(async (db) => {
      // Migration unique des anciens logs gardés dans localStorage.
      const old = store.get('lga.logs', null);
      if (Array.isArray(old) && old.length) {
        await tx(db, 'readwrite', (s) => { for (const l of old.filter(isLog)) s.add(l); });
      }
      try { localStorage.removeItem('lga.logs'); } catch (_) { /* rien */ }
      return db;
    }));
    const tx = (db, mode, fn) => new Promise((res, rej) => {
      const t = db.transaction('logs', mode); const s = t.objectStore('logs');
      const out = fn(s);
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
    const local = {
      all: async () => store.get('lga.logs', []).filter(isLog),
      add: async (log) => {
        const logs = store.get('lga.logs', []).filter(isLog); logs.push(log);
        while (logs.length > MAX_LOGS) logs.shift();
        while (!store.set('lga.logs', logs) && logs.length > 1) logs.splice(0, Math.max(1, Math.ceil(logs.length / 10)));
      },
      clear: async () => { store.set('lga.logs', []); },
    };
    const safe = (fn, fb) => async (...a) => { try { return await fn(await open(), ...a); } catch (_) { return fb(...a); } };
    return {
      all: safe((db) => tx(db, 'readonly', (s) => s.getAll()).then((l) => (l || []).filter(isLog)), local.all),
      add: safe(async (db, log) => {
        await tx(db, 'readwrite', (s) => s.add(log));
        const keys = await tx(db, 'readonly', (s) => s.getAllKeys());
        if (keys.length > MAX_LOGS) await tx(db, 'readwrite', (s) => { for (const k of keys.slice(0, keys.length - MAX_LOGS)) s.delete(k); });
      }, local.add),
      clear: safe((db) => tx(db, 'readwrite', (s) => s.clear()), local.clear),
    };
  })();

  function saveGame(summary, g) {
    const games = store.get('lga.games', []); games.push(summary);
    while (games.length > MAX_GAMES) games.shift();
    while (!store.set('lga.games', games) && games.length > 1) games.splice(0, Math.ceil(games.length / 10));
    let log;
    // Le moteur numérote les parties d'une série à partir de 1, le format de log à partir de 0.
    const series = g.series ? { ...g.series, index: g.series.index - 1 } : null;
    try { log = window.LGAnalytics ? LGAnalytics.fromEngine(g, { app: 'arene-v1', labelOf: Engine.seatLabel, series }) : null; } catch (_) { log = null; }
    if (!log) return;
    if (summary.forcedRoles) log.forcedRoles = true; // partie de test : à exclure des classements
    try { log = LGAnalytics.compactLog(log); } catch (_) { /* log complet */ }
    logStore.add(log).then(() => { if (!$('view-stats').hidden) renderStats(); });
  }

  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '–');
  let statsView = null;
  async function renderStats() {
    const logs = await logStore.all();
    if (window.LGStats) {
      try {
        if (!statsView) statsView = LGStats.mount($('stats-root'), { logs, prefix: 'lga.ui.' });
        else statsView.update(logs);
      } catch (e) { $('stats-root').textContent = `Statistiques indisponibles : ${e.message}`; }
    } else $('stats-root').textContent = 'Module de statistiques absent de cette version.';
    const games = store.get('lga.games', []).filter((g) => g.winner !== 'abandon');
    const h = $('history'); h.textContent = '';
    for (const g of games.slice(-20).reverse()) {
      const li = el('li');
      const d = new Date(g.date);
      li.append(el('span', null, d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
      li.append(el('span', `w-${g.winner}`, g.winner === 'village' ? 'Village' : g.winner === 'loups' ? 'Loups' : 'Égalité'));
      li.append(el('span', 'hint', `${g.forcedRoles ? 'rôles imposés, hors classement · ' : ''}${g.series ? `série ${g.series.index}/${g.series.size} · ` : ''}${g.players.length} joueurs · ${g.days} jours · loups : ${g.players.filter((p) => p.team === 'loups').map((p) => p.label).join(', ')}`));
      h.append(li);
    }
    if (!games.length) h.append(el('li', 'hint', 'Les parties terminées s\'afficheront ici.'));
  }

  $('export-btn').addEventListener('click', async () => {
    const data = JSON.stringify({ games: store.get('lga.games', []), logs: await logStore.all() }, null, 1);
    const box = $('export-box'); box.value = data; box.hidden = false;
    try { await navigator.clipboard.writeText(data); $('stats-msg').textContent = 'Données copiées dans le presse-papiers.'; }
    catch (_) { box.select(); $('stats-msg').textContent = 'Copie automatique refusée : sélectionne le texte ci-dessus et copie-le.'; }
  });
  $('reset-btn').addEventListener('click', () => { $('reset-confirm').hidden = false; });
  $('reset-no').addEventListener('click', () => { $('reset-confirm').hidden = true; });
  $('reset-yes').addEventListener('click', async () => {
    store.set('lga.games', []); await logStore.clear(); $('reset-confirm').hidden = true;
    $('stats-msg').textContent = 'Historique effacé.'; renderStats();
  });

  // ---------- Démarrage ----------
  // Dans Claude, le moteur n'est connu qu'après la réponse de claude.use : on n'écrit les sièges par défaut qu'ensuite.
  const freshConfig = !Array.isArray(config.seats);
  let envReady = !IN_CLAUDE;
  function boot() {
    if (freshConfig && envReady && !config.touched) config.seats = null;
    sanitizeSeats(); if (envReady) saveConfig();
    renderEnv(); renderCompo(); renderRoster(); renderSeats();
    $('rounds').value = String(config.rounds); $('maxdays').value = String(config.maxDays); $('turn-limit').value = String(config.turnLimit); $('fix-roles').checked = config.fixRoles; $('parallel').value = String(config.parallel);
    $('mayor').checked = config.mayor; $('series-size').value = String(config.seriesSize); $('memory').value = String(config.memory);
    $('memory-wrap').hidden = config.seriesSize < 2;
    renderIdle();
  }
  initHumanSheet();
  boot();
  let v = 'play'; try { v = sessionStorage.getItem('lga.view') || 'play'; } catch (_) { /* rien */ }
  show(v);
  loadModelList();
  if (IN_CLAUDE) {
    window.claude.use('sample').then((s) => { sample = s; env.claude = !!s; envReady = true; boot(); }).catch(() => { envReady = true; boot(); });
  }
})();
