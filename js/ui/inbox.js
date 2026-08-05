/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — CASELLA DI POSTA
   ═══════════════════════════════════════════════════════
   Due percorsi, una sola schermata di conferma:

   1. Scrivi/detti qui sul PC  → anteprima immediata → CONFERMA
   2. Arriva dal telefono      → resta in coda con un badge,
                                 la rivedi quando vuoi

   Niente viene MAI scritto senza che tu l'abbia visto: il
   riconoscimento vocale sbaglia i numeri, e un dato sbagliato
   sporca medie e grafici per sempre.

   Coda su localStorage `cs_inbox`, separata da `cs_v8` così
   non tocca lo schema versionato né i backup.
   ═══════════════════════════════════════════════════════ */

const INBOX = (function () {

  const KEY = 'cs_inbox';

  // ─── STORE ──────────────────────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }
  function persist(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { console.error('[INBOX] save', e); }
    BUS.emit('inbox:change', list.length);
  }

  function pending()  { return load().filter(x => x.stato === 'pending'); }
  function count()    { return pending().length; }

  /** Mette in coda un messaggio arrivato da fuori (telefono). */
  function push(testo, origine = 'telefono') {
    const parsed = NLP.parse(testo);
    const list = load();
    list.push({
      id: 'ib_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      creatoIl: new Date().toISOString(),
      origine, testo, stato: 'pending',
      data: parsed.data, intents: parsed.intents, nonRiconosciuto: parsed.nonRiconosciuto,
    });
    persist(list);
    return parsed;
  }

  /** Assorbe i messaggi arrivati da Supabase. Idempotente: gli id remoti
   *  già presenti vengono ignorati, così il polling non duplica nulla. */
  function ingest(righe) {
    const list = load();
    const visti = new Set(list.map(x => x.remoteId).filter(Boolean));
    let nuovi = 0;
    for (const r of righe) {
      if (visti.has(r.id)) continue;
      // Se il telefono ha già interpretato la frase uso i suoi intent,
      // altrimenti la rileggo qui (stesso parser, stesso risultato).
      const intents = Array.isArray(r.intents) && r.intents.length
        ? r.intents : NLP.parse(r.testo).intents;
      const nonRic = Array.isArray(r.intents) && r.intents.length
        ? [] : NLP.parse(r.testo).nonRiconosciuto;
      list.push({
        id: 'ib_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        remoteId: r.id,
        creatoIl: r.creato_il || new Date().toISOString(),
        origine: r.origine || 'telefono',
        testo: r.testo,
        stato: 'pending',
        data: r.data || (NLP.parse(r.testo).data),
        intents, nonRiconosciuto: nonRic,
      });
      nuovi++;
    }
    if (nuovi) {
      persist(list);
      UI.toast(`${nuovi} ${nuovi === 1 ? 'messaggio' : 'messaggi'} dal telefono`, 'ok');
    }
    return nuovi;
  }

  function setStato(id, stato) {
    const list = load();
    const it = list.find(x => x.id === id);
    if (it) {
      it.stato = stato;
      it.chiusoIl = new Date().toISOString();
      // chiude anche sul server, così non torna al prossimo giro
      if (it.remoteId && typeof SYNC !== 'undefined') {
        SYNC.chiudi([it.remoteId], stato === 'applied' ? 'applied' : 'discarded');
      }
    }
    // tiene solo gli ultimi 50 chiusi, per non gonfiare lo storage
    const chiusi = list.filter(x => x.stato !== 'pending');
    const tieni = new Set(chiusi.slice(-50).map(x => x.id));
    persist(list.filter(x => x.stato === 'pending' || tieni.has(x.id)));
  }

  // ─── ANTEPRIMA (il cuore della conferma) ────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function fmtData(iso) {
    try {
      return CS.fmtDate(iso, { long: true });
    } catch { return iso; }
  }

  function renderRow(it, i) {
    const numerico = typeof it.valore === 'number';
    const alternative = (it.alternative && it.alternative.length)
      ? `<select class="ib-alt" data-i="${i}">
           <option value="">${esc(it.alimento.nome)}</option>
           ${it.alternative.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
         </select>` : '';
    return `
      <div class="ib-row ${it.confidenza === 'media' ? 'is-incerto' : ''}" data-i="${i}">
        <span class="ib-row-ico">${it.icona || '•'}</span>
        <div class="ib-row-main">
          <div class="ib-row-lbl">${esc(it.label)}</div>
          ${it.sub ? `<div class="ib-row-sub">${esc(it.sub)}</div>` : ''}
          ${alternative}
        </div>
        <div class="ib-row-val">
          ${numerico
            ? `<input class="ib-val-input" type="number" step="0.1" value="${it.valore}" data-i="${i}" aria-label="valore">`
            : `<span class="ib-val-fixed">${esc(it.valore)}</span>`}
          <span class="ib-row-unit">${esc(it.unita || '')}</span>
        </div>
        <button class="ib-row-del" data-del="${i}" title="Togli questa voce" aria-label="Togli">×</button>
      </div>`;
  }

  function renderPreview(parsed) {
    const n = parsed.intents.length;
    if (!n) {
      return `
        <div class="ib-empty-parse">
          <div class="ib-empty-ico">🤔</div>
          <div class="ib-empty-title">NON HO TROVATO NULLA DA REGISTRARE</div>
          <div class="ib-empty-text">
            Riconosco solo ciò che esiste nel sistema: ore e tipi di allenamento,
            volume, corsa, peso, sonno, pasti, voti di aree e fondamentali, umore.
          </div>
          ${parsed.nonRiconosciuto.length
            ? `<div class="ib-unknown"><b>Ignorato:</b> ${parsed.nonRiconosciuto.map(esc).join(' · ')}</div>`
            : ''}
        </div>`;
    }
    return `
      <div class="ib-preview-head">
        <span class="ib-preview-eyebrow">HO CAPITO</span>
        <span class="ib-preview-date">${esc(fmtData(parsed.data))}</span>
      </div>
      <div class="ib-rows">${parsed.intents.map(renderRow).join('')}</div>
      ${parsed.nonRiconosciuto.length
        ? `<div class="ib-unknown"><b>Non ho capito (ignorato):</b> ${parsed.nonRiconosciuto.map(esc).join(' · ')}</div>`
        : ''}`;
  }

  // Riallinea gli intent ai valori modificati a mano prima di applicare
  function harvest(root, parsed) {
    root.querySelectorAll('.ib-val-input').forEach(inp => {
      const i = Number(inp.dataset.i);
      const v = parseFloat(inp.value);
      if (parsed.intents[i] && !isNaN(v)) parsed.intents[i].valore = v;
    });
    root.querySelectorAll('.ib-alt').forEach(sel => {
      const i = Number(sel.dataset.i);
      const it = parsed.intents[i];
      if (!it || !sel.value) return;
      const nuovo = (window.FOOD_DB_DATA || []).find(a => a.nome === sel.value);
      if (nuovo) {
        it.alimento = nuovo;
        it.campo = nuovo.nome;
        it.macros = NLP.macrosPer(nuovo, it.valore);
      }
    });
    // ricalcola le macro dopo un'eventuale modifica dei grammi
    parsed.intents.forEach(it => {
      if (it.target === 'pasti' && it.alimento) it.macros = NLP.macrosPer(it.alimento, it.valore);
    });
    return parsed.intents.filter(x => !x._rimosso);
  }

  function wirePreview(root, parsed, onChange) {
    root.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        parsed.intents[Number(b.dataset.del)]._rimosso = true;
        b.closest('.ib-row').classList.add('is-rimosso');
        onChange && onChange();
      });
    });
    root.querySelectorAll('.ib-val-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const it = parsed.intents[Number(inp.dataset.i)];
        if (it && it.target === 'pasti' && it.alimento) {
          const v = parseFloat(inp.value) || 0;
          const m = NLP.macrosPer(it.alimento, v);
          const sub = inp.closest('.ib-row').querySelector('.ib-row-sub');
          if (sub) sub.textContent = `${m.kcal} kcal · ${m.pro}g pro · ${m.carb}g carb · ${m.fat}g gr`;
        }
      });
    });
  }

  // ─── RIEPILOGO DOPO L'APPLICAZIONE ──────────────────
  // Se hai registrato del cibo, ti dice a che punto sei sui target di oggi.
  function riepilogoNutrizionale(data) {
    try {
      const pasti = (CS.state.pasti || []).filter(p => p.data === data);
      if (!pasti.length) return '';
      const tot = pasti.reduce((a, p) => {
        (p.alimenti || []).forEach(x => {
          a.kcal += Number(x.kcal) || 0; a.pro += Number(x.pro) || 0;
          a.carb += Number(x.carb) || 0; a.fat += Number(x.fat) || 0;
        });
        return a;
      }, { kcal: 0, pro: 0, carb: 0, fat: 0 });
      const t = CS.state.targetNutrizione || {};
      const riga = (lbl, v, target, u) => {
        const pct = target ? Math.min(100, Math.round(v / target * 100)) : 0;
        return `<div class="ib-macro">
          <div class="ib-macro-top"><span>${lbl}</span><b>${Math.round(v)}${u}</b>${target ? `<em>/ ${target}${u}</em>` : ''}</div>
          <div class="ib-macro-bar"><span style="width:${pct}%"></span></div>
        </div>`;
      };
      return `<div class="ib-macros">
        <div class="ib-macros-title">OGGI HAI MANGIATO</div>
        ${riga('Calorie', tot.kcal, t.kcal, ' kcal')}
        ${riga('Proteine', tot.pro, t.pro, ' g')}
        ${riga('Carboidrati', tot.carb, t.carb, ' g')}
        ${riga('Grassi', tot.fat, t.fat, ' g')}
      </div>`;
    } catch { return ''; }
  }

  // ─── CATTURA: scrivi qui sul PC ─────────────────────
  function capture(testoIniziale) {
    const m = UI.modal(`
      <div class="ib-wrap">
        <div class="ib-head">
          <div>
            <div class="rev-step-eyebrow">ASSISTENTE</div>
            <h2 class="fx-display ib-title">DIMMI COSA HAI FATTO</h2>
          </div>
          <button class="action-btn" data-close aria-label="chiudi">✕</button>
        </div>
        <div class="ib-input-row">
          <textarea class="ib-input" id="ib-text" rows="2"
            placeholder="es. 2 ore allenamento, 1 ora sala pesi 1 ora pugilato"></textarea>
          <button class="btn primary ib-go" id="ib-go">LEGGI</button>
        </div>
        <div class="ib-hint">Scrivi in italiano normale. Registro solo ciò che esiste nel sistema.</div>
        <div class="ib-preview" id="ib-preview"></div>
        <div class="ib-actions" id="ib-actions"></div>
      </div>
    `, { exclusive: true });
    m.el.classList.add('lg', 'ib-modal');

    const ta = m.el.querySelector('#ib-text');
    const prev = m.el.querySelector('#ib-preview');
    const actions = m.el.querySelector('#ib-actions');
    let parsed = null;

    function leggi() {
      const testo = ta.value.trim();
      if (!testo) return;
      parsed = NLP.parse(testo);
      prev.innerHTML = renderPreview(parsed);
      wirePreview(prev, parsed);
      actions.innerHTML = parsed.intents.length
        ? `<button class="btn ghost" id="ib-annulla">RISCRIVI</button>
           <button class="btn-cta" id="ib-conferma">✓ CONFERMA E REGISTRA</button>`
        : '';
      actions.querySelector('#ib-annulla')?.addEventListener('click', () => {
        prev.innerHTML = ''; actions.innerHTML = ''; ta.focus(); ta.select();
      });
      actions.querySelector('#ib-conferma')?.addEventListener('click', conferma);
      FX.staggerIn(prev.querySelector('.ib-rows'), '.ib-row', 45);
    }

    function conferma() {
      const intents = harvest(prev, parsed);
      if (!intents.length) return UI.toast('Nessuna voce da registrare', 'warn');
      const res = NLP.apply(parsed.data, intents);
      if (res.err.length) console.error('[INBOX] apply', res.err);
      UI.toast(`${res.ok} ${res.ok === 1 ? 'voce registrata' : 'voci registrate'}`, 'ok');
      FX.glowBurst(m.el, 'var(--neon)');

      const macros = riepilogoNutrizionale(parsed.data);
      prev.innerHTML = `<div class="ib-done">
          <div class="ib-done-ico">✓</div>
          <div class="ib-done-txt">Registrato su ${esc(fmtData(parsed.data))}</div>
        </div>${macros}`;
      actions.innerHTML = `<button class="btn ghost" id="ib-altro">AGGIUNGI ALTRO</button>
        <button class="btn primary" data-close>CHIUDI</button>`;
      actions.querySelector('#ib-altro').addEventListener('click', () => {
        ta.value = ''; prev.innerHTML = ''; actions.innerHTML = ''; ta.focus();
      });
      actions.querySelector('[data-close]').addEventListener('click', () => {
        m.close();
        const cur = ROUTER.current();
        if (cur.section) ROUTER.go(cur.section, cur.sub);
      });
    }

    m.el.querySelector('#ib-go').addEventListener('click', leggi);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); leggi(); }
    });

    if (testoIniziale) { ta.value = testoIniziale; leggi(); }
    setTimeout(() => ta.focus(), 60);
    return m;
  }

  // ─── CODA: quello che è arrivato dal telefono ───────
  function open() {
    const items = pending();
    const body = items.length
      ? items.map(it => `
          <article class="ib-msg" data-id="${it.id}">
            <div class="ib-msg-head">
              <span class="ib-msg-origine">${it.origine === 'telefono' ? '📱' : '💻'} ${esc(it.origine)}</span>
              <span class="ib-msg-quando">${esc(fmtData(it.data))}</span>
            </div>
            <div class="ib-msg-testo">“${esc(it.testo)}”</div>
            <div class="ib-msg-prev"></div>
            <div class="ib-msg-actions">
              <button class="btn-sm ib-scarta" data-id="${it.id}">SCARTA</button>
              <button class="btn-sm ib-applica" data-id="${it.id}">✓ REGISTRA</button>
            </div>
          </article>`).join('')
      : UI.empty('📭', 'CASELLA VUOTA', 'Qui arriva quello che detti dal telefono.');

    const m = UI.modal(`
      <div class="ib-wrap">
        <div class="ib-head">
          <div>
            <div class="rev-step-eyebrow">CASELLA DI POSTA</div>
            <h2 class="fx-display ib-title">DAL TELEFONO</h2>
          </div>
          <button class="action-btn" data-close aria-label="chiudi">✕</button>
        </div>
        <div class="ib-msgs">${body}</div>
      </div>
    `, { exclusive: true });
    m.el.classList.add('lg', 'ib-modal');

    // anteprima dentro ogni messaggio
    items.forEach(it => {
      const host = m.el.querySelector(`.ib-msg[data-id="${it.id}"] .ib-msg-prev`);
      if (!host) return;
      const parsed = { data: it.data, intents: it.intents, nonRiconosciuto: it.nonRiconosciuto };
      host.innerHTML = renderPreview(parsed);
      wirePreview(host, parsed);
      host._parsed = parsed;
    });

    m.el.querySelectorAll('.ib-applica').forEach(b => {
      b.addEventListener('click', () => {
        const card = b.closest('.ib-msg');
        const host = card.querySelector('.ib-msg-prev');
        const parsed = host._parsed;
        const intents = harvest(host, parsed);
        const res = NLP.apply(parsed.data, intents);
        setStato(b.dataset.id, 'applied');
        UI.toast(`${res.ok} voci registrate`, 'ok');
        card.classList.add('is-done');
        setTimeout(() => { card.remove(); refreshBadge(); }, 400);
      });
    });
    m.el.querySelectorAll('.ib-scarta').forEach(b => {
      b.addEventListener('click', () => {
        setStato(b.dataset.id, 'scartato');
        b.closest('.ib-msg').remove();
        refreshBadge();
      });
    });
    return m;
  }

  // ─── BADGE sull'orb assistente ──────────────────────
  function refreshBadge() {
    const orb = document.getElementById('assistant-widget');
    if (!orb) return;
    const n = count();
    let b = orb.querySelector('.ib-badge');
    if (!n) { b && b.remove(); return; }
    if (!b) {
      b = document.createElement('span');
      b.className = 'ib-badge';
      orb.appendChild(b);
    }
    b.textContent = n > 9 ? '9+' : String(n);
    b.title = `${n} in attesa dal telefono`;
  }

  function init() {
    BUS.on('inbox:change', refreshBadge);
    BUS.on('route:change', refreshBadge);
    refreshBadge();
  }

  return { init, capture, open, push, ingest, pending, count, refreshBadge, renderPreview, wirePreview, harvest };

})();
