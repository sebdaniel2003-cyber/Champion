/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — DURATE
   ═══════════════════════════════════════════════════════
   Una regola sola, valida ovunque:

     sotto l'ora  →  minuti          45 min · 30 min · 5 min
     dall'ora su  →  ore             1 ora · 1 ora e 30 min · 2 ore

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
   * Forma estesa, quella che si legge nei testi e nelle liste.
   *   0.75 → "45 min"      1 → "1 ora"      1.5 → "1 ora e 30 min"
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
    else if (m === 0) s = h === 1 ? '1 ora' : `${h} ore`;
    else              s = (h === 1 ? '1 ora' : `${h} ore`) + ` e ${m} min`;

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

  return { fmt, compatta, fmtMinuti, inMinuti, daMinuti };

})();
