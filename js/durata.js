/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — DURATE
   ═══════════════════════════════════════════════════════
   Una regola sola, valida ovunque:

     da 0 a 59 min  →  minuti        45 min · 30 min · 5 min
     da 1 ora in su →  ore           1 h · 1 h 30 min · 2 h 45 min

   Sotto l'ora la lettera «h» non compare mai, e `0,75` non deve
   comparire da nessuna parte: nessuno pensa il proprio allenamento
   in frazioni di ora.

   Il numero salvato su disco resta in ORE decimali (`1.5`), perché
   su quello si reggono medie, criteri oro, confronti fra periodi e
   tutti i grafici già scritti. È formato interno, come i millisecondi
   dentro una data: si converte solo quando si mostra o si scrive.

   Questo file è caricato SIA dal PC SIA dal telefono — uno solo, non
   due copie che col tempo divergono (stessa scelta fatta per nlp.js).
   ═══════════════════════════════════════════════════════ */

const DURATA = (function () {

  /** Ore decimali → minuti interi. */
  function inMinuti(ore) {
    return Math.round((Number(ore) || 0) * 60);
  }

  /** Minuti → ore decimali, con la precisione che basta al minuto. */
  function daMinuti(min) {
    return +(((Number(min) || 0) / 60).toFixed(4));
  }

  function scomponi(ore) {
    const tot = inMinuti(Math.abs(Number(ore) || 0));
    return { neg: (Number(ore) || 0) < 0, tot, h: Math.floor(tot / 60), m: tot % 60 };
  }

  /**
   * La forma che si legge ovunque: liste, testi, riepiloghi.
   *   0.75 → "45 min"      1 → "1 h"      1.5 → "1 h 30 min"
   * @param {number} ore
   * @param {{zero?: string, segno?: boolean}} [opts]
   *   zero  — cosa mostrare quando la durata è nulla (default "—")
   *   segno — anteporre + / − (per i confronti «vs settimana scorsa»)
   */
  function fmt(ore, opts = {}) {
    const { neg, tot, h, m } = scomponi(ore);
    if (!tot) return opts.zero !== undefined ? opts.zero : '—';

    let s;
    if (h === 0)      s = `${m} min`;
    else if (m === 0) s = `${h} h`;
    else              s = `${h} h ${m} min`;

    if (opts.segno) s = (neg ? '−' : '+') + ' ' + s;
    else if (neg)   s = '−' + s;
    return s;
  }

  /**
   * Forma compatta per assi e tooltip dei grafici, dove «1 ora e 30 min»
   * sopra ogni colonna renderebbe tutto illeggibile.
   *   0.75 → "45min"       1 → "1h"         1.5 → "1h30"
   * Anche qui, sotto l'ora restano i minuti puliti.
   */
  function compatta(ore, opts = {}) {
    const { neg, tot, h, m } = scomponi(ore);
    if (!tot) return opts.zero !== undefined ? opts.zero : '0';
    let s;
    if (h === 0)      s = `${m}min`;
    else if (m === 0) s = `${h}h`;
    else              s = `${h}h${String(m).padStart(2, '0')}`;
    return neg ? '−' + s : s;
  }

  /** Come `fmt`, ma partendo già dai minuti (campi di inserimento). */
  function fmtMinuti(min, opts) {
    return fmt(daMinuti(min), opts);
  }

  /* ─── CAMPI DI MODIFICA ─────────────────────────────
     Una durata non si corregge scrivendo "90": si corregge dicendo 1 h e 30
     min. Quindi due campi, e quello delle ore compare solo quando servono —
     sotto l'ora resta il solo numero di minuti, come nella regola.

     Stanno qui e non nelle pagine perché li usano sia il telefono sia la
     casella di posta del PC: due copie, prima o poi, divergono. */

  function campi(minuti, idAttr = '') {
    const tot = Math.max(0, Math.round(Number(minuti) || 0));
    const h = Math.floor(tot / 60), m = tot % 60;
    return `<span class="dur-campi" ${idAttr}>` +
      `<input class="dur-ore" type="number" min="0" step="1" inputmode="numeric" ` +
        `value="${h || ''}" placeholder="0" aria-label="ore"${h ? '' : ' hidden'}>` +
      `<span class="dur-u dur-u-h"${h ? '' : ' hidden'}>h</span>` +
      `<input class="dur-min" type="number" min="0" step="5" inputmode="numeric" ` +
        `value="${m}" placeholder="0" aria-label="minuti">` +
      `<span class="dur-u">min</span>` +
      `</span>`;
  }

  /** Minuti totali attualmente scritti nella coppia di campi. */
  function leggiCampi(root) {
    if (!root) return 0;
    const h = Number((root.querySelector('.dur-ore') || {}).value) || 0;
    const m = Number((root.querySelector('.dur-min') || {}).value) || 0;
    return Math.max(0, h * 60 + m);
  }

  /** Riporta i campi in forma canonica: 90 nei minuti diventa 1 h e 30 min,
   *  e il campo delle ore compare da solo. Da chiamare quando si esce dal
   *  campo, non a ogni tasto premuto: riscrivere sotto le dita chi sta
   *  ancora digitando fa danni. */
  function sistemaCampi(root) {
    const tot = leggiCampi(root);
    const h = Math.floor(tot / 60), m = tot % 60;
    const io = root.querySelector('.dur-ore');
    const im = root.querySelector('.dur-min');
    const uh = root.querySelector('.dur-u-h');
    if (io) { io.value = h || ''; io.hidden = !h; }
    if (uh) uh.hidden = !h;
    if (im) im.value = m;
    return tot;
  }

  return { fmt, compatta, fmtMinuti, inMinuti, daMinuti, campi, leggiCampi, sistemaCampi };

})();
