/* ═══════════════════════════════════════════════════════
   CHAMPION — ASSISTENTE (telefono) · RETE
   ═══════════════════════════════════════════════════════
   Tre sole cose da fare, tutte in REST puro (niente supabase-js,
   come sul PC: cinque chiamate non giustificano 100 KB di libreria).

     1. accedere            → /auth/v1/token
     2. leggere il contesto → GET  champion_snapshot   (pubblicato dal PC)
     3. accodare una frase  → POST champion_inbox      (la applica il PC)

   Il telefono NON scrive mai lo stato: mette in coda, e basta.

   Se la rete manca, l'invio finisce in una coda locale e riparte da
   solo appena il telefono torna online. Detti in palestra col telefono
   in modalità aereo e la frase non si perde.
   ═══════════════════════════════════════════════════════ */

const NET = (function () {

  // Precompilati: non c'è nulla da incollare sul telefono.
  // La chiave publishable è fatta per stare nel client — da sola non apre
  // niente, perché la Row Level Security richiede comunque il login.
  const CFG = {
    url: 'https://ptgzoafusukmopcsbsqu.supabase.co',
    key: 'sb_publishable_iH9WcjUwp98TEUOA8D1zZw_UbSzOX7s',
  };

  const SESS_KEY = 'csm_session';
  const OUT_KEY  = 'csm_outbox';

  let sess = null;
  let listeners = [];

  // ─── EVENTI (minimi: non serve un bus) ──────────────
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => { try { fn(stato()); } catch (e) { console.error(e); } }); }

  // ─── SESSIONE ───────────────────────────────────────
  function loadSess() {
    try { sess = JSON.parse(localStorage.getItem(SESS_KEY)) || null; }
    catch { sess = null; }
    return sess;
  }
  function saveSess(s) {
    sess = s;
    try {
      if (s) localStorage.setItem(SESS_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESS_KEY);
    } catch (e) { console.warn('[NET] sessione non salvata:', e.message); }
    emit();
  }
  function memorizza(b) {
    saveSess({
      access_token: b.access_token,
      refresh_token: b.refresh_token,
      expires_at: Date.now() + (Number(b.expires_in) || 3600) * 1000 - 60000, // 1 min di margine
      user_id: b.user && b.user.id,
      email: b.user && b.user.email,
    });
  }

  function connesso() { return !!(sess && sess.access_token); }
  function online()   { return typeof navigator === 'undefined' || navigator.onLine !== false; }

  function stato() {
    return {
      connesso: connesso(),
      email: sess && sess.email,
      online: online(),
      inCoda: coda().length,
      contestoMinuti: CTX.etaMinuti(),
    };
  }

  // ─── HTTP ───────────────────────────────────────────
  async function api(path, opts = {}, conToken = true) {
    const headers = {
      apikey: CFG.key,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    headers.Authorization = 'Bearer ' +
      ((conToken && sess && sess.access_token) ? sess.access_token : CFG.key);

    const r = await fetch(CFG.url.replace(/\/+$/, '') + path, { ...opts, headers });
    const txt = await r.text();
    let body = null;
    try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
    if (!r.ok) {
      const msg = (body && (body.msg || body.message || body.error_description || body.error))
        || ('HTTP ' + r.status);
      const err = new Error(traduci(msg));
      err.status = r.status;
      throw err;
    }
    return body;
  }

  // I messaggi di Supabase sono in inglese e criptici: qui diventano
  // frasi che dicono cosa fare.
  function traduci(msg) {
    const m = String(msg);
    if (/invalid login credentials/i.test(m)) return 'Email o password non corretti';
    if (/email not confirmed/i.test(m))       return 'Account non ancora confermato';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Nessuna connessione';
    if (/rate limit/i.test(m))                return 'Troppi tentativi, riprova tra un minuto';
    if (/jwt|token/i.test(m) && /expired|invalid/i.test(m)) return 'Sessione scaduta, rientra';
    return m;
  }

  // ─── AUTENTICAZIONE ─────────────────────────────────
  async function accedi(email, password) {
    const b = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: String(email).trim(), password }),
    }, false);
    memorizza(b);
    return true;
  }

  function esci() {
    saveSess(null);
    CTX.save(null);
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
      memorizza(b);
      return true;
    } catch (e) {
      // Se il refresh fallisce per mancanza di rete la sessione è ancora
      // buona: si riprova più tardi. Va buttata solo se il server l'ha rifiutata.
      if (!online() || /connessione/i.test(e.message)) return false;
      console.warn('[NET] refresh rifiutato:', e.message);
      esci();
      return false;
    }
  }

  // ─── CONTESTO PUBBLICATO DAL PC ─────────────────────
  async function scaricaContesto() {
    if (!connesso() || !await assicuraToken()) return null;
    const righe = await api(
      `/rest/v1/champion_snapshot?user_id=eq.${sess.user_id}&select=payload,updated_at&limit=1`);
    const p = Array.isArray(righe) && righe.length ? righe[0].payload : null;
    if (p) {
      if (!p.aggiornatoIl && righe[0].updated_at) p.aggiornatoIl = righe[0].updated_at;
      CTX.save(p);
      emit();
    }
    return p;
  }

  // ─── CODA LOCALE ────────────────────────────────────
  function coda() {
    try { return JSON.parse(localStorage.getItem(OUT_KEY)) || []; }
    catch { return []; }
  }
  function salvaCoda(list) {
    try { localStorage.setItem(OUT_KEY, JSON.stringify(list)); }
    catch (e) { console.error('[NET] coda non salvata:', e.message); }
    emit();
  }
  function accoda(msg) {
    const list = coda();
    list.push(msg);
    salvaCoda(list);
  }

  async function postInbox(msg) {
    await api('/rest/v1/champion_inbox', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: sess.user_id,
        origine: 'telefono',
        testo: msg.testo,
        data: msg.data,
        intents: msg.intents || [],
      }),
    });
  }

  /** Manda subito se si può, altrimenti mette in coda.
   *  Ritorna 'inviato' | 'in-coda'. */
  async function invia(msg) {
    if (!connesso()) throw new Error('Non hai fatto l\'accesso');
    if (!online() || !await assicuraToken()) { accoda(msg); return 'in-coda'; }
    try {
      await postInbox(msg);
      emit();
      return 'inviato';
    } catch (e) {
      // Un rifiuto del server (dato malformato, permessi) non si risolve
      // riprovando all'infinito: solo i guasti di rete finiscono in coda.
      if (!online() || /connessione|HTTP 5\d\d/i.test(e.message)) {
        accoda(msg);
        return 'in-coda';
      }
      throw e;
    }
  }

  /** Svuota la coda. Ogni messaggio esce solo se il server l'ha accettato. */
  async function svuotaCoda() {
    if (!connesso() || !online()) return 0;
    if (!await assicuraToken()) return 0;
    let list = coda();
    if (!list.length) return 0;
    let inviati = 0;
    const rimasti = [];
    for (const msg of list) {
      try { await postInbox(msg); inviati++; }
      catch (e) {
        console.warn('[NET] invio differito fallito:', e.message);
        // errore di rete → si riprova; rifiuto del server → si scarta,
        // altrimenti resterebbe bloccato in coda per sempre
        if (!online() || /connessione|HTTP 5\d\d/i.test(e.message)) rimasti.push(msg);
      }
    }
    salvaCoda(rimasti);
    return inviati;
  }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    loadSess();
    window.addEventListener('online',  () => { emit(); svuotaCoda(); });
    window.addEventListener('offline', emit);
    if (connesso()) svuotaCoda();
  }

  return {
    init, onChange, stato, connesso, online,
    accedi, esci, scaricaContesto,
    invia, coda, svuotaCoda,
    _cfg: CFG,
  };

})();
