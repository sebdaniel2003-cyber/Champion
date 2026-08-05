/* ═══════════════════════════════════════════════════════
   CHAMPION — ASSISTENTE (telefono)
   ═══════════════════════════════════════════════════════
   Una schermata sola: dici cosa hai fatto, vedi cosa ho capito,
   correggi se serve, mandi al PC.

   Due conferme, non una: qui controlli l'interpretazione (il
   riconoscimento vocale sbaglia i numeri), sul PC dai l'ok finale
   prima che qualcosa venga scritto davvero. Un dato sbagliato
   sporca medie e grafici per sempre — meglio un tocco in più.
   ═══════════════════════════════════════════════════════ */

const APP = (function () {

  // Va tenuta allineata a VERSIONE in sw.js: è quella che vedi in alto e che
  // dice a colpo d'occhio se il telefono sta girando l'ultima versione.
  const VERSIONE_APP = '8.7.3';

  const STORICO_KEY = 'csm_storico';
  const MAX_STORICO = 20;

  const el = id => document.getElementById(id);
  let parsed = null;          // ultimo risultato di NLP.parse
  let rec = null;             // istanza SpeechRecognition
  let inAscolto = false;

  // ─── UTILITÀ ────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  function fmtData(iso) {
    if (!iso) return '';
    const oggi = CS.todayISO();
    if (iso === oggi) return 'oggi';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 1);
    const p = n => String(n).padStart(2, '0');
    if (iso === `${ieri.getFullYear()}-${p(ieri.getMonth() + 1)}-${p(ieri.getDate())}`) return 'ieri';
    return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
  }

  function toast(testo, tipo = 'ok') {
    const t = el('toast');
    if (!t) return;
    t.textContent = testo;
    t.className = 'toast is-' + tipo + ' is-on';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  // ─── SCHERMATE ──────────────────────────────────────
  function mostra(nome) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.toggle('is-on', s.dataset.screen === nome);
    });
  }

  // ─── ACCESSO ────────────────────────────────────────
  function initLogin() {
    const form = el('form-login');
    const err = el('login-err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = el('btn-login');
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'ENTRO…';
      try {
        await NET.accedi(el('login-email').value, el('login-pw').value);
        el('login-pw').value = '';
        await entra();
      } catch (e2) {
        err.textContent = e2.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'ENTRA';
      }
    });
  }

  /** Dopo l'accesso: mostra subito la schermata, poi aggiorna il contesto.
   *  Se la rete manca si lavora comunque con l'ultimo contesto salvato. */
  async function entra() {
    mostra('main');
    renderTutto();
    aggiornaContesto();
    NET.svuotaCoda().then(n => { if (n) toast(`${n} ${n === 1 ? 'frase inviata' : 'frasi inviate'} dalla coda`); });
  }

  async function aggiornaContesto(manuale) {
    const b = el('btn-refresh');
    if (b) b.classList.add('is-spinning');
    try {
      await NET.scaricaContesto();
      renderContesto();
      if (manuale) toast('Contesto aggiornato');
    } catch (e) {
      if (manuale) toast(e.message, 'warn');
    } finally {
      if (b) b.classList.remove('is-spinning');
    }
  }

  // ─── CONTESTO DI OGGI ───────────────────────────────
  function barra(lbl, v, target, unita) {
    const pct = target ? Math.min(100, Math.round(v / target * 100)) : 0;
    return `
      <div class="ctx-macro">
        <div class="ctx-macro-top">
          <span>${lbl}</span>
          <b>${Math.round(v)}${unita}</b>${target ? `<em>/ ${target}${unita}</em>` : ''}
        </div>
        <div class="ctx-macro-bar"><span style="width:${pct}%"></span></div>
      </div>`;
  }

  function renderContesto() {
    const host = el('contesto');
    if (!host) return;
    const c = CTX.get();

    if (!c) {
      host.innerHTML = `<div class="ctx-vuoto">
        Il PC non ha ancora pubblicato niente. Apri Champion sul PC:
        il contesto arriva da solo.
      </div>`;
      return;
    }

    const o = c.oggi || {};
    const t = c.targetNutrizione || {};
    const suOggi = (o.data === CS.todayISO());
    const inCoda = NET.stato().inCoda;

    host.innerHTML = `
      <div class="ctx-head">
        <span class="ctx-eyebrow">${suOggi ? 'OGGI' : 'ULTIMO GIORNO REGISTRATO · ' + esc(fmtData(o.data))}</span>
        <span class="ctx-eta">${CTX.etaMinuti() < 60 ? 'aggiornato' : 'dal PC ' + fmtEta()}</span>
      </div>
      <div class="ctx-numeri">
        ${cella('⏱', DURATA.compatta(o.oreAllenamento || 0), 'allenamento')}
        ${cella('🥊', String(o.sessioni || 0), 'sessioni')}
        ${cella('⚖', c.ultimoPeso ? c.ultimoPeso.kg + 'kg' : '—', 'ultimo peso')}
        ${cella('🏃', (o.kmCorsa || 0) + 'km', 'corsa')}
      </div>
      ${(t.kcal || o.kcal) ? `<div class="ctx-macros">
        ${barra('Calorie', o.kcal || 0, t.kcal, ' kcal')}
        ${barra('Proteine', o.pro || 0, t.pro, ' g')}
      </div>` : ''}
      ${renderOro(c.oro)}
      ${renderObiettivi(c.obiettivi)}
      ${inCoda ? `<div class="ctx-coda">📦 ${inCoda} ${inCoda === 1 ? 'frase in attesa di rete' : 'frasi in attesa di rete'}</div>` : ''}
    `;
  }

  /** La settimana d'oro: non un punteggio, ma cosa manca ancora. */
  function renderOro(oro) {
    if (!oro || !oro.totali) return '';
    if (oro.gold) {
      return `<div class="ctx-oro is-gold">◆ SETTIMANA D'ORO COMPLETA</div>`;
    }
    const manca = oro.mancanti.slice(0, 2)
      .map(m => `${esc(m.label)} <b>${esc(m.val)}</b>`).join(' · ');
    return `
      <div class="ctx-oro">
        <div class="ctx-oro-head">
          <span>SETTIMANA D'ORO</span><b>${oro.fatti}/${oro.totali}</b>
        </div>
        ${manca ? `<div class="ctx-oro-manca">manca: ${manca}</div>` : ''}
      </div>`;
  }

  /** I due obiettivi più vicini al traguardo: quelli su cui vale la pena spingere. */
  function renderObiettivi(lista) {
    if (!Array.isArray(lista) || !lista.length) return '';
    const top = [...lista].sort((a, b) => b.pct - a.pct).slice(0, 2);
    return `
      <div class="ctx-obj">
        ${top.map(o => `
          <div class="ctx-obj-row">
            <div class="ctx-obj-top">
              <span>${esc(o.descrizione || '—')}</span>
              <b>${o.pct}%</b>
            </div>
            <div class="ctx-macro-bar"><span style="width:${Math.min(100, o.pct)}%"></span></div>
          </div>`).join('')}
      </div>`;
  }

  function cella(ico, val, lbl) {
    return `<div class="ctx-cell"><span class="ctx-ico">${ico}</span>
      <b class="ctx-val">${esc(val)}</b><span class="ctx-lbl">${esc(lbl)}</span></div>`;
  }

  function fmtEta() {
    const m = CTX.etaMinuti();
    if (!isFinite(m)) return 'mai';
    if (m < 60) return m + ' min fa';
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' ora fa' : ' ore fa');
    const g = Math.round(h / 24);
    return g + (g === 1 ? ' giorno fa' : ' giorni fa');
  }

  // ─── DETTATURA ──────────────────────────────────────
  function supportaVoce() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function initVoce() {
    const btn = el('btn-mic');
    if (!supportaVoce()) {
      // Niente bottone finto: se non c'è, si scrive. Su iOS Safari
      // il riconoscimento non esiste e fingere sarebbe peggio.
      btn.classList.add('is-off');
      btn.title = 'Il tuo browser non detta — scrivi qui sotto';
      btn.addEventListener('click', () => {
        toast('Questo browser non supporta la dettatura: scrivi la frase', 'warn');
        el('testo').focus();
      });
      return;
    }
    btn.addEventListener('click', () => (inAscolto ? fermaVoce() : avviaVoce()));
  }

  function avviaVoce() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new R();
    rec.lang = 'it-IT';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    // Ogni dettatura riparte da zero: chi tocca il microfono vuole dire una
    // cosa nuova, non aggiungerla in coda a quella di prima.
    const ta = el('testo');
    ta.value = '';
    el('preview').innerHTML = '';
    el('azioni').innerHTML = '';
    parsed = null;
    const base = '';

    rec.onstart = () => {
      inAscolto = true;
      el('btn-mic').classList.add('is-live');
      el('mic-hint').textContent = 'Ti ascolto…';
    };

    rec.onresult = (ev) => {
      let finale = '', parziale = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finale += r[0].transcript;
        else parziale += r[0].transcript;
      }
      ta.value = (base ? base + ' ' : '') + (finale || parziale);
      el('mic-hint').textContent = parziale ? '…' + parziale.slice(-40) : 'Ti ascolto…';
    };

    rec.onerror = (ev) => {
      const msg = {
        'not-allowed': 'Permesso microfono negato: attivalo dalle impostazioni del sito',
        'service-not-allowed': 'Permesso microfono negato',
        'no-speech': 'Non ho sentito niente',
        'audio-capture': 'Microfono non disponibile',
        'network': 'La dettatura ha bisogno di connessione — scrivi la frase',
        'aborted': '',
      }[ev.error] || ('Dettatura non riuscita (' + ev.error + ')');
      if (msg) toast(msg, 'warn');
    };

    rec.onend = () => {
      inAscolto = false;
      el('btn-mic').classList.remove('is-live');
      el('mic-hint').textContent = '';
      // Chiudere la bocca è già la conferma: leggo senza chiedere altro.
      if (ta.value.trim()) leggi();
    };

    try { rec.start(); }
    catch (e) { toast('Dettatura non avviata: ' + e.message, 'warn'); }
  }

  function fermaVoce() {
    if (rec) { try { rec.stop(); } catch { /* già ferma */ } }
  }

  // ─── ANTEPRIMA ──────────────────────────────────────
  function renderRiga(it, i) {
    const numerico = typeof it.valore === 'number';
    const alternative = (it.alternative && it.alternative.length && it.alimento)
      ? `<select class="riga-alt" data-i="${i}" aria-label="alimento">
           <option value="">${esc(it.alimento.nome)}</option>
           ${it.alternative.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
         </select>` : '';
    // Per le durate i due campi sono già la lettura in chiaro: ripeterla sotto
    // sarebbe rumore. Resta solo quando manca il dato, dove serve davvero.
    const sub = (it.durata && it.valore > 0) ? ''
      : it.sub || (it.macros
        ? `${it.macros.kcal} kcal · ${it.macros.pro}g pro · ${it.macros.carb}g carb · ${it.macros.fat}g gr`
        : '');
    return `
      <div class="riga ${it.confidenza === 'media' ? 'is-incerto' : ''}" data-i="${i}">
        <span class="riga-ico">${it.icona || '•'}</span>
        <div class="riga-main">
          <div class="riga-lbl">${esc(it.label)}</div>
          ${sub ? `<div class="riga-sub" data-sub="${i}">${esc(sub)}</div>` : ''}
          ${alternative}
        </div>
        <div class="riga-val">
          ${it.durata
            ? DURATA.campi(it.valore, `data-dur="${i}"`)
            : numerico
              ? `<input class="riga-input" type="number" inputmode="decimal" step="0.1" min="0"
                   value="${it.valore}" data-i="${i}" aria-label="valore">
                 <span class="riga-unita">${esc(it.unita || '')}</span>`
              : `<span class="riga-fisso">${esc(it.valore)}</span>
                 <span class="riga-unita">${esc(it.unita || '')}</span>`}
        </div>
        <button class="riga-del" data-del="${i}" aria-label="togli">×</button>
      </div>`;
  }

  function renderPreview(p) {
    const host = el('preview');
    const azioni = el('azioni');

    const nonPronto = !CTX.vocabPronto();

    if (!p.intents.length) {
      // Senza il vocabolario del PC il parser non riconosce quasi niente:
      // dire «non ho trovato nulla» darebbe la colpa alla frase, quando la
      // causa è un'altra e ha una soluzione precisa.
      host.innerHTML = nonPronto
        ? `<div class="vuoto">
             <div class="vuoto-ico">📡</div>
             <div class="vuoto-titolo">NON HO ANCORA IL VOCABOLARIO DEL PC</div>
             <div class="vuoto-testo">
               Apri Champion sul PC una volta: da lì scendono aree, fondamentali
               e tipi di allenamento. Intanto posso mandare la frase così com'è —
               la legge lui, che li ha tutti.
             </div>
           </div>`
        : `<div class="vuoto">
             <div class="vuoto-ico">🤔</div>
             <div class="vuoto-titolo">NON HO TROVATO NULLA DA REGISTRARE</div>
             <div class="vuoto-testo">
               Riconosco ore e tipi di allenamento, volume, corsa, peso, sonno,
               pasti, voti di aree e fondamentali, umore.
             </div>
             ${p.nonRiconosciuto.length
               ? `<div class="ignorato"><b>Ignorato:</b> ${p.nonRiconosciuto.map(esc).join(' · ')}</div>`
               : ''}
           </div>`;
      // Anche senza interpretazione la frase può essere mandata: il PC ha
      // il vocabolario completo e potrebbe capirla meglio.
      azioni.innerHTML = `
        <button class="btn ghost" data-riscrivi>RISCRIVI</button>
        <button class="btn ${nonPronto ? 'primary' : ''}" data-invia-grezzo>MANDA COSÌ AL PC</button>`;
      wireAzioni();
      return;
    }

    host.innerHTML = `
      <div class="prev-head">
        <span class="prev-eyebrow">HO CAPITO</span>
        <label class="prev-data">
          <span id="prev-data-lbl">${esc(fmtData(p.data))}</span>
          <input type="date" id="prev-data" value="${esc(p.data)}" aria-label="giorno">
        </label>
      </div>
      ${nonPronto ? `<div class="avviso">Il vocabolario del PC non è ancora arrivato:
        mando la frase così com'è, la rilegge lui.</div>` : ''}
      <div class="righe">${p.intents.map(renderRiga).join('')}</div>
      ${p.nonRiconosciuto.length
        ? `<div class="ignorato"><b>Non ho capito:</b> ${p.nonRiconosciuto.map(esc).join(' · ')}</div>`
        : ''}`;

    azioni.innerHTML = `
      <button class="btn ghost" data-riscrivi>RISCRIVI</button>
      <button class="btn primary" data-invia>MANDA AL PC →</button>`;

    wireRighe();
    wireAzioni();
  }

  function wireRighe() {
    const host = el('preview');

    // Durate: due campi, ore e minuti. Si aggiorna l'intent a ogni tasto, ma
    // la rimessa in forma (90 min → 1 h 30 min) avviene quando si esce dal
    // campo, per non riscrivere sotto le dita di chi sta ancora digitando.
    host.querySelectorAll('[data-dur]').forEach(box => {
      const it = parsed.intents[Number(box.dataset.dur)];
      if (!it) return;
      box.addEventListener('input', () => { it.valore = DURATA.leggiCampi(box); });
      box.addEventListener('change', () => { it.valore = DURATA.sistemaCampi(box); });
    });
    // Il giorno è modificabile: se la frase non diceva quando, il parser
    // mette oggi — e a volte si racconta la sera prima.
    const data = host.querySelector('#prev-data');
    if (data) {
      data.addEventListener('change', () => {
        if (!data.value) { data.value = parsed.data; return; }
        parsed.data = data.value;
        const lbl = host.querySelector('#prev-data-lbl');
        if (lbl) lbl.textContent = fmtData(data.value);
      });
    }
    host.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.del);
        if (parsed.intents[i]) parsed.intents[i]._rimosso = true;
        b.closest('.riga').classList.add('is-rimosso');
        b.disabled = true;
      });
    });
    host.querySelectorAll('.riga-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const it = parsed.intents[Number(inp.dataset.i)];
        if (!it) return;
        const sub = host.querySelector(`[data-sub="${inp.dataset.i}"]`);
        if (!sub) return;
        // La lettura in chiaro segue quello che scrivi: correggi 90 e sotto
        // leggi subito «1 ora e 30 min», senza dover fare il conto in testa.
        if (it.durata) {
          sub.textContent = DURATA.fmt(DURATA.daMinuti(parseFloat(inp.value) || 0), { zero: 'da riempire' });
        } else if (it.target === 'pasti' && it.alimento) {
          const m = NLP.macrosPer(it.alimento, parseFloat(inp.value) || 0);
          sub.textContent = `${m.kcal} kcal · ${m.pro}g pro · ${m.carb}g carb · ${m.fat}g gr`;
        }
      });
    });
    host.querySelectorAll('.riga-alt').forEach(sel => {
      sel.addEventListener('change', () => {
        const it = parsed.intents[Number(sel.dataset.i)];
        if (!it || !sel.value) return;
        const nuovo = (window.FOOD_DB_DATA || []).find(a => a.nome === sel.value);
        if (!nuovo) return;
        it.alimento = nuovo;
        it.campo = nuovo.nome;
        it.label = 'Pasto · ' + nuovo.nome;
        it.macros = NLP.macrosPer(nuovo, it.valore);
        const riga = sel.closest('.riga');
        riga.querySelector('.riga-lbl').textContent = it.label;
        const sub = riga.querySelector('.riga-sub');
        if (sub) sub.textContent =
          `${it.macros.kcal} kcal · ${it.macros.pro}g pro · ${it.macros.carb}g carb · ${it.macros.fat}g gr`;
      });
    });
  }

  function wireAzioni() {
    const a = el('azioni');
    a.querySelector('[data-riscrivi]')?.addEventListener('click', () => {
      el('preview').innerHTML = '';
      a.innerHTML = '';
      const ta = el('testo');
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    a.querySelector('[data-invia]')?.addEventListener('click', () => invia(false));
    a.querySelector('[data-invia-grezzo]')?.addEventListener('click', () => invia(true));
  }

  /** Riallinea gli intent ai valori corretti a mano prima di spedirli. */
  function raccogli() {
    const host = el('preview');
    host.querySelectorAll('[data-dur]').forEach(box => {
      const it = parsed.intents[Number(box.dataset.dur)];
      if (it) it.valore = DURATA.leggiCampi(box);
    });
    host.querySelectorAll('.riga-input').forEach(inp => {
      const i = Number(inp.dataset.i);
      const v = parseFloat(inp.value);
      if (parsed.intents[i] && !isNaN(v)) parsed.intents[i].valore = v;
    });
    parsed.intents.forEach(it => {
      if (it.target === 'pasti' && it.alimento) it.macros = NLP.macrosPer(it.alimento, it.valore);
    });
    return parsed.intents.filter(x => !x._rimosso);
  }

  function leggi() {
    const testo = el('testo').value.trim();
    if (!testo) return;
    try {
      parsed = NLP.parse(testo);
    } catch (e) {
      console.error('[APP] parse', e);
      parsed = { data: CS.todayISO(), intents: [], nonRiconosciuto: [], testoOriginale: testo };
    }
    renderPreview(parsed);
  }

  // ─── INVIO ──────────────────────────────────────────
  async function invia(grezzo) {
    if (!parsed) return;
    // Senza il vocabolario del PC l'interpretazione locale è peggiore della
    // sua: si manda la frase nuda e la legge lui, che ha i cataloghi veri.
    const mandaIntents = !grezzo && CTX.vocabPronto();
    const intents = mandaIntents ? raccogli() : [];
    if (mandaIntents && !intents.length) return toast('Non è rimasto niente da mandare', 'warn');

    const msg = {
      testo: parsed.testoOriginale || el('testo').value.trim(),
      data: parsed.data,
      intents,
      creatoIl: new Date().toISOString(),
    };

    const btn = el('azioni').querySelector('[data-invia], [data-invia-grezzo]');
    const etichetta = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'MANDO…'; }

    try {
      const esito = await NET.invia(msg);
      pushStorico(msg, esito);
      mostraFatto(msg, esito);
    } catch (e) {
      toast(e.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = etichetta; }
    }
  }

  function mostraFatto(msg, esito) {
    const inCoda = esito === 'in-coda';
    el('preview').innerHTML = `
      <div class="fatto">
        <div class="fatto-ico">${inCoda ? '📦' : '✓'}</div>
        <div class="fatto-titolo">${inCoda ? 'SALVATA, PARTE APPENA TORNA LA RETE' : 'ARRIVATA AL PC'}</div>
        <div class="fatto-testo">
          ${inCoda
            ? 'Resta sul telefono finché non c\'è connessione.'
            : `Su Champion la trovi in attesa: apri la casella di posta e dai la conferma
               e viene registrata su <b>${esc(fmtData(msg.data))}</b>.`}
        </div>
      </div>`;
    el('azioni').innerHTML = `<button class="btn primary" data-nuova>DIMMI ALTRO</button>`;
    el('azioni').querySelector('[data-nuova]').addEventListener('click', nuova);
    el('testo').value = '';
    parsed = null;
    renderContesto();
    renderStorico();
  }

  function nuova() {
    el('preview').innerHTML = '';
    el('azioni').innerHTML = '';
    el('testo').value = '';
    parsed = null;
    if (supportaVoce()) avviaVoce();
    else el('testo').focus();
  }

  // ─── STORICO LOCALE ─────────────────────────────────
  function storico() {
    try { return JSON.parse(localStorage.getItem(STORICO_KEY)) || []; }
    catch { return []; }
  }

  function pushStorico(msg, esito) {
    const list = storico();
    list.unshift({ testo: msg.testo, data: msg.data, quando: msg.creatoIl, esito, voci: msg.intents.length });
    try { localStorage.setItem(STORICO_KEY, JSON.stringify(list.slice(0, MAX_STORICO))); }
    catch (e) { console.warn('[APP] storico non salvato:', e.message); }
  }

  function renderStorico() {
    const host = el('storico');
    if (!host) return;
    const list = storico();
    if (!list.length) { host.innerHTML = ''; return; }
    host.innerHTML = `
      <div class="storico-titolo">MANDATE DI RECENTE</div>
      ${list.slice(0, 6).map(s => `
        <div class="storico-riga">
          <span class="storico-quando">${esc(fmtData(s.data))}</span>
          <span class="storico-testo">${esc(s.testo)}</span>
          <span class="storico-esito">${s.esito === 'in-coda' ? '📦' : '✓'}</span>
        </div>`).join('')}`;
  }

  // ─── STATO IN ALTO ──────────────────────────────────
  function renderStato() {
    const s = NET.stato();
    const dot = el('stato-dot');
    const txt = el('stato-txt');
    if (!dot) return;
    const [cls, label] = !s.online ? ['is-off', 'SENZA RETE']
      : s.inCoda ? ['is-warn', s.inCoda + ' IN CODA']
      : ['is-ok', 'COLLEGATO'];
    dot.className = 'stato-dot ' + cls;
    txt.textContent = label;
    const mail = el('stato-mail');
    if (mail) mail.textContent = s.email || '';
  }

  function renderTutto() {
    renderStato();
    renderContesto();
    renderStorico();
  }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    NET.init();
    NET.onChange(() => { renderStato(); });

    initLogin();
    initVoce();

    el('btn-leggi').addEventListener('click', leggi);
    el('testo').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); leggi(); }
    });
    el('btn-refresh').addEventListener('click', () => aggiornaContesto(true));
    el('btn-esci').addEventListener('click', () => {
      if (!confirm('Esci dall\'account su questo telefono?')) return;
      NET.esci();
      mostra('login');
    });

    // Tornando sull'app dopo che il PC ha applicato le frasi, i numeri
    // devono essere quelli nuovi.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && NET.connesso()) {
        aggiornaContesto();
        NET.svuotaCoda();
      }
    });

    if (NET.connesso()) entra();
    else mostra('login');

    // Scorciatoia "Detta subito" dalla schermata home
    if (/[?&]detta=1/.test(location.search) && NET.connesso() && supportaVoce()) {
      setTimeout(avviaVoce, 400);
    }

    const ver = el('app-ver');
    if (ver) ver.textContent = 'v' + VERSIONE_APP;

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          // Il guscio in cache rende l'apertura istantanea, ma senza questo
          // controllo l'app resterebbe vecchia finché non si svuota la cache a
          // mano: la pagina che stai guardando è servita dal service worker
          // precedente, che non sa di essere stato superato.
          reg.update().catch(() => { /* offline: si riproverà alla prossima apertura */ });
          reg.addEventListener('updatefound', () => {
            const nuovo = reg.installing;
            if (!nuovo) return;
            nuovo.addEventListener('statechange', () => {
              // `controller` c'è solo se un service worker stava già girando:
              // alla primissima installazione non c'è niente da ricaricare.
              if (nuovo.state !== 'activated' || !navigator.serviceWorker.controller) return;
              if (sessionStorage.getItem('csm_ricaricata')) return;   // niente giri infiniti
              sessionStorage.setItem('csm_ricaricata', '1');
              toast('Nuova versione, un attimo…');
              setTimeout(() => location.reload(), 700);
            });
          });
        })
        .catch(e => console.warn('[APP] service worker non registrato:', e.message));
    }
  }

  return { init, leggi, invia, renderContesto, _parsed: () => parsed };

})();

document.addEventListener('DOMContentLoaded', APP.init);
