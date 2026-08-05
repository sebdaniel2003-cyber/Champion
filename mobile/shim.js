/* ═══════════════════════════════════════════════════════
   CHAMPION — ASSISTENTE (telefono) · CONTESTO E VOCABOLARIO
   ═══════════════════════════════════════════════════════
   Il parser `js/nlp.js` è lo stesso del PC, e costruisce il suo
   vocabolario a runtime leggendo i cataloghi del sistema da un
   oggetto globale `CS`. Sul PC quello è il modulo dati completo;
   qui non esiste nulla di simile — e non deve esistere, perché il
   telefono non possiede lo stato e non lo scrive mai.

   Questo file mette al suo posto un CS ridotto all'osso, alimentato
   dal contesto che il PC pubblica su `champion_snapshot`: aree,
   fondamentali, tipi di allenamento, umori, campi attivi. Così il
   telefono riconosce ESATTAMENTE ciò che esiste sul PC, né più né meno.

   Le proprietà sono getter, non copie: il contesto arriva dalla rete
   dopo il primo render, e il vocabolario deve vedere subito il nuovo.
   ═══════════════════════════════════════════════════════ */

const CTX = (function () {

  const KEY = 'csm_ctx';
  let ctx = null;

  function load() {
    try { ctx = JSON.parse(localStorage.getItem(KEY)) || null; }
    catch { ctx = null; }
    return ctx;
  }

  function save(nuovo) {
    ctx = nuovo || null;
    try {
      if (ctx) localStorage.setItem(KEY, JSON.stringify(ctx));
      else localStorage.removeItem(KEY);
    } catch (e) { console.warn('[CTX] salvataggio fallito:', e.message); }
    return ctx;
  }

  function get() { return ctx; }

  /** Il vocabolario è utilizzabile solo se il PC ha davvero pubblicato
   *  i cataloghi. Senza, il parser riconoscerebbe metà delle frasi e
   *  produrrebbe un'interpretazione peggiore di quella che farebbe il PC:
   *  in quel caso conviene mandare la frase grezza e lasciarla leggere a lui. */
  function vocabPronto() {
    const c = ctx && ctx.cataloghi;
    return !!(c && Array.isArray(c.aree) && c.aree.length &&
              Array.isArray(c.fondamentali) && c.fondamentali.length);
  }

  /** Quanto è vecchio il contesto, in minuti. */
  function etaMinuti() {
    if (!ctx || !ctx.aggiornatoIl) return Infinity;
    const t = Date.parse(ctx.aggiornatoIl);
    return isNaN(t) ? Infinity : Math.max(0, Math.round((Date.now() - t) / 60000));
  }

  load();
  return { load, save, get, vocabPronto, etaMinuti };

})();


/* ─── CS ridotto: solo ciò che il parser legge ───────────
   Ogni voce ha un fallback vuoto, così `NLP.parse` non lancia mai
   anche quando il contesto non è ancora arrivato. */
const CS = {

  get state() {
    const c = CTX.get() || {};
    return {
      cataloghi: {
        tipiAllenamento: (c.cataloghi && c.cataloghi.tipiAllenamento) || [],
        mood: (c.cataloghi && c.cataloghi.mood) || [],
      },
      revFieldsConfig: { coreVisibility: c.campiAttivi || {} },
      targetNutrizione: c.targetNutrizione || {},
      profile: c.profilo || {},
    };
  },

  get AREE_TECNICHE() {
    const c = CTX.get();
    return (c && c.cataloghi && c.cataloghi.aree) || [];
  },

  get FONDAMENTALI() {
    const c = CTX.get();
    return (c && c.cataloghi && c.cataloghi.fondamentali) || [];
  },

  get TIPI_ALLENAMENTO() {
    const c = CTX.get();
    return (c && c.cataloghi && c.cataloghi.tipiAllenamento) || [];
  },

  get MOOD_LIST() {
    const c = CTX.get();
    return (c && c.cataloghi && c.cataloghi.mood) || [];
  },

  /** Sul PC restituisce i campi attivi della revisione; qui serve solo
   *  il ramo `extras`, cioè le metriche che l'utente ha acceso. */
  getEnabledFields() {
    const c = CTX.get();
    return { extras: (c && c.metricheExtra) || [], core: [] };
  },

  todayISO() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
};
