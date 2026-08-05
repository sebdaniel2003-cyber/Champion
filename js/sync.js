/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — SINCRONIA TELEFONO ↔ PC (Supabase)
   ═══════════════════════════════════════════════════════
   Due flussi opposti, nessun conflitto possibile:

     PC  ──push──►  champion_snapshot   (il telefono lo LEGGE)
     PC  ◄──pull──  champion_inbox      (il telefono ci SCRIVE)

   Il telefono non modifica mai lo stato: accoda intenzioni,
   il PC le applica dopo la conferma e resta fonte di verità.

   NIENTE libreria supabase-js: servono cinque chiamate REST,
   e `fetch` diretto evita 100 KB di dipendenza, i problemi di
   compatibilità col nuovo formato di chiave e ogni dipendenza
   da CDN (il sistema gira da file://).

   Tutto è opzionale: se la sincronia è spenta o la rete manca,
   Champion continua a funzionare esattamente come prima.
   ═══════════════════════════════════════════════════════ */

const SYNC = (function () {

  const CFG_KEY  = 'cs_sync_cfg';       // url + chiave + interruttore
  const SESS_KEY = 'cs_sync_session';   // token di accesso

  let cfg  = null;
  let sess = null;
  let timer = null;
  let pushTimer = null;
  let ultimoPush = 0;
  let ultimoHash = null;
  let stato = 'off';                    // off | disconnesso | ok | errore

  // ─── CONFIG & SESSIONE ──────────────────────────────
  function loadCfg() {
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || null; }
    catch { cfg = null; }
    return cfg;
  }
  function saveCfg(c) {
    cfg = c;
    localStorage.setItem(CFG_KEY, JSON.stringify(c));
    BUS.emit('sync:change', getStato());
  }
  function loadSess() {
    try { sess = JSON.parse(localStorage.getItem(SESS_KEY)) || null; }
    catch { sess = null; }
    return sess;
  }
  function saveSess(s) {
    sess = s;
    if (s) localStorage.setItem(SESS_KEY, JSON.stringify(s));
    else   localStorage.removeItem(SESS_KEY);
    BUS.emit('sync:change', getStato());
  }

  function attiva()   { return !!(cfg && cfg.url && cfg.key && cfg.enabled !== false); }
  function connesso() { return !!(attiva() && sess && sess.access_token); }

  function getStato() {
    return {
      configurato: !!(cfg && cfg.url && cfg.key),
      attiva: attiva(),
      connesso: connesso(),
      email: sess && sess.email,
      stato,
      ultimoPush: ultimoPush || (cfg && cfg.ultimoPush) || 0,
    };
  }

  // ─── HTTP ───────────────────────────────────────────
  async function api(path, opts = {}, conToken = true) {
    if (!cfg) throw new Error('Sincronia non configurata');
    const headers = {
      apikey: cfg.key,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (conToken && sess && sess.access_token) {
      headers.Authorization = 'Bearer ' + sess.access_token;
    } else {
      headers.Authorization = 'Bearer ' + cfg.key;
    }
    const r = await fetch(cfg.url.replace(/\/+$/, '') + path, { ...opts, headers });
    const txt = await r.text();
    let body = null;
    try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
    if (!r.ok) {
      const msg = (body && (body.msg || body.message || body.error_description || body.error)) || ('HTTP ' + r.status);
      const err = new Error(msg);
      err.status = r.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  // ─── AUTENTICAZIONE ─────────────────────────────────
  function memorizzaSessione(b) {
    saveSess({
      access_token: b.access_token,
      refresh_token: b.refresh_token,
      expires_at: Date.now() + (Number(b.expires_in) || 3600) * 1000 - 60000, // 1 min di margine
      user_id: b.user && b.user.id,
      email: b.user && b.user.email,
    });
  }

  /** Registrazione. Se il progetto richiede la conferma email,
   *  ritorna { confermaRichiesta: true } e non c'è ancora sessione. */
  async function registrati(email, password) {
    const b = await api('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false);
    if (b && b.access_token) { memorizzaSessione(b); return { confermaRichiesta: false }; }
    return { confermaRichiesta: true, email };
  }

  async function accedi(email, password) {
    const b = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false);
    memorizzaSessione(b);
    stato = 'ok';
    return true;
  }

  function esci() {
    saveSess(null);
    stato = 'disconnesso';
    BUS.emit('sync:change', getStato());
  }

  async function assicuraToken() {
    if (!sess) return false;
    if (Date.now() < (sess.expires_at || 0)) return true;
    if (!sess.refresh_token) { esci(); return false; }
    try {
      const b = await api('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: sess.refresh_token }),
      }, false);
      memorizzaSessione(b);
      return true;
    } catch (e) {
      console.warn('[SYNC] refresh fallito:', e.message);
      esci();
      return false;
    }
  }

  // ─── CONTESTO PUBBLICATO PER IL TELEFONO ────────────
  // NON l'intero stato: al telefono serve sapere a che punto sei oggi e
  // quale vocabolario usare. Mandare tutto `cs_v8` a ogni salvataggio
  // brucerebbe la banda del piano gratuito e metterebbe online molto più
  // del necessario. Qui stanno pochi KB.
  function buildContesto() {
    const oggi = CS.todayISO();
    const rev = CS.getRevByDate(oggi) || {};
    const pastiOggi = (CS.state.pasti || []).filter(p => p.data === oggi);
    const macro = pastiOggi.reduce((a, p) => {
      (p.alimenti || []).forEach(x => {
        a.kcal += Number(x.kcal) || 0; a.pro += Number(x.pro) || 0;
        a.carb += Number(x.carb) || 0; a.fat += Number(x.fat) || 0;
      });
      return a;
    }, { kcal: 0, pro: 0, carb: 0, fat: 0 });

    const pesate = [...(CS.state.pesate || [])].sort((a, b) => a.data.localeCompare(b.data));
    const cat = CS.state.cataloghi || {};

    return {
      aggiornatoIl: new Date().toISOString(),
      profilo: {
        nome: CS.state.profile && CS.state.profile.nome,
        pesoTarget: CS.state.profile && CS.state.profile.pesoTarget,
        eta: CS.state.profile && CS.state.profile.eta,
      },
      oggi: {
        data: oggi,
        oreAllenamento: rev.oreAllenamento || 0,
        sessioni: (rev.dettagliSessioni || []).length,
        flessioni: rev.flessioni || 0,
        squat: rev.squat || 0,
        addominali: rev.addominali || 0,
        kmCorsa: rev.kmCorsa || 0,
        sonnoOre: rev.sonnoOre || 0,
        ...macro,
      },
      targetNutrizione: CS.state.targetNutrizione || {},
      ultimoPeso: pesate.length ? { kg: pesate[pesate.length - 1].kg, data: pesate[pesate.length - 1].data } : null,
      // vocabolario, così il telefono riconosce esattamente ciò che c'è qui
      cataloghi: {
        tipiAllenamento: cat.tipiAllenamento || CS.TIPI_ALLENAMENTO,
        mood: cat.mood || CS.MOOD_LIST,
        aree: CS.AREE_TECNICHE,
        fondamentali: CS.FONDAMENTALI,
      },
      metricheExtra: (CS.getEnabledFields ? CS.getEnabledFields('daily').extras : []),
      campiAttivi: (CS.state.revFieldsConfig && CS.state.revFieldsConfig.coreVisibility) || {},

      // Con questi tre il telefono può RISPONDERTI, non solo registrare:
      // «ti mancano 40 min al target», «la settimana d'oro è ancora in piedi».
      obiettivi: obiettiviInCorso(),
      oro: statoOro(),
      ultimi7: ultimiGiorni(7),
    };
  }

  /** Gli obiettivi ancora aperti, ridotti all'osso. Massimo 8: il telefono
   *  ne mostra pochi e la banda del piano gratuito non è infinita. */
  function obiettiviInCorso() {
    try {
      return (CS.state.obiettivi || [])
        .filter(o => !o.completed)
        .slice(0, 8)
        .map(o => {
          const p = (typeof CALC !== 'undefined' && CALC.progressObiettivo)
            ? CALC.progressObiettivo(o) : null;
          return {
            descrizione: o.descrizione,
            scadenza: o.scadenza,
            pct: p ? Math.round(p.pct) : 0,
            corrente: p ? p.current : null,
            target: o.target != null ? o.target : (p ? p.target : null),
            unita: o.unita || '',
          };
        });
    } catch (e) { console.warn('[SYNC] obiettivi non inclusi:', e.message); return []; }
  }

  /** A che punto è la settimana d'oro: quali criteri mancano ancora. */
  function statoOro() {
    try {
      if (typeof CALC === 'undefined' || !CALC.settimanaTopCheck) return null;
      const s = CALC.settimanaTopCheck(new Date());
      return {
        gold: s.gold,
        fatti: s.met,
        totali: s.criteri.length,
        mancanti: s.criteri.filter(c => !c.met).map(c => ({ label: c.label, val: c.val })),
      };
    } catch (e) { console.warn('[SYNC] oro non incluso:', e.message); return null; }
  }

  /** Gli ultimi N giorni in forma minima, per i confronti al volo. */
  function ultimiGiorni(n) {
    try {
      const out = [];
      const d = new Date();
      for (let i = 0; i < n; i++) {
        const iso = CS.isoDateOnly ? CS.isoDateOnly(d) : d.toISOString().slice(0, 10);
        const r = CS.getRevByDate(iso);
        out.push({
          data: iso,
          ore: r ? (Number(r.oreAllenamento) || 0) : 0,
          riposo: !!(r && r.riposo),
        });
        d.setDate(d.getDate() - 1);
      }
      return out;
    } catch (e) { console.warn('[SYNC] ultimi giorni non inclusi:', e.message); return []; }
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }

  // ─── PUSH ───────────────────────────────────────────
  async function pushSnapshot(forza) {
    if (!connesso()) return false;
    if (!await assicuraToken()) return false;
    const contesto = buildContesto();
    const payload = JSON.stringify(contesto);
    const h = hash(payload);
    if (!forza && h === ultimoHash) return false;   // niente di cambiato
    try {
      await api('/rest/v1/champion_snapshot?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          user_id: sess.user_id,
          payload: contesto,
          updated_at: new Date().toISOString(),
        }),
      });
      ultimoHash = h;
      ultimoPush = Date.now();
      if (cfg) { cfg.ultimoPush = ultimoPush; localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
      stato = 'ok';
      BUS.emit('sync:change', getStato());
      return true;
    } catch (e) {
      stato = 'errore';
      console.warn('[SYNC] push fallito:', e.message);
      BUS.emit('sync:change', getStato());
      return false;
    }
  }

  // Il salvataggio è frequente: si accumula e si pubblica al massimo
  // una volta ogni 20 secondi.
  function pushDebounced() {
    if (!connesso()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushSnapshot(false), 20000);
  }

  // ─── PULL ───────────────────────────────────────────
  async function pullInbox() {
    if (!connesso()) return [];
    if (!await assicuraToken()) return [];
    try {
      const righe = await api(
        `/rest/v1/champion_inbox?stato=eq.pending&user_id=eq.${sess.user_id}` +
        `&select=id,creato_il,origine,testo,data,intents&order=creato_il.asc&limit=50`);
      stato = 'ok';
      if (Array.isArray(righe) && righe.length && typeof INBOX !== 'undefined') {
        INBOX.ingest(righe);
        // Con l'interruttore acceso le frasi capite con certezza vengono
        // registrate subito; le altre restano in casella, come sempre.
        if (cfg && cfg.autoApplica) INBOX.applicaSicuri();
      }
      BUS.emit('sync:change', getStato());
      return righe || [];
    } catch (e) {
      stato = 'errore';
      console.warn('[SYNC] pull fallito:', e.message);
      BUS.emit('sync:change', getStato());
      return [];
    }
  }

  /** Chiude sul server i messaggi già gestiti sul PC. */
  async function chiudi(ids, nuovoStato = 'applied') {
    if (!connesso() || !ids || !ids.length) return false;
    if (!await assicuraToken()) return false;
    try {
      const lista = ids.map(encodeURIComponent).join(',');
      await api(`/rest/v1/champion_inbox?id=in.(${lista})`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ stato: nuovoStato, chiuso_il: new Date().toISOString() }),
      });
      return true;
    } catch (e) {
      console.warn('[SYNC] chiusura fallita:', e.message);
      return false;
    }
  }

  // ─── CICLO ──────────────────────────────────────────
  function avvia() {
    fermaCiclo();
    if (!connesso()) return;
    pullInbox();
    pushSnapshot(true);
    timer = setInterval(() => { pullInbox(); pushSnapshot(false); }, 60000);
  }
  function fermaCiclo() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  async function testaConnessione() {
    if (!cfg || !cfg.url || !cfg.key) throw new Error('Manca URL o chiave');
    await api('/rest/v1/champion_snapshot?select=user_id&limit=1', {}, false);
    return true;
  }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    loadCfg();
    loadSess();
    if (!attiva()) { stato = 'off'; return; }
    stato = connesso() ? 'ok' : 'disconnesso';

    BUS.on('cs:saved', pushDebounced);
    // pubblica subito quando si lascia la pagina, per non perdere l'ultima modifica
    window.addEventListener('pagehide', () => { if (connesso()) pushSnapshot(false); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && connesso()) pullInbox();
    });
    avvia();
  }

  return {
    init, avvia, fermaCiclo,
    registrati, accedi, esci,
    pushSnapshot, pullInbox, chiudi, testaConnessione,
    getStato, saveCfg, loadCfg: () => cfg, buildContesto,
  };

})();
