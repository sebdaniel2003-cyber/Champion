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


/* ─── Stato ricostruito dal contesto ─────────────────────
   Oltre a ciò che legge il parser, qui nasce la forma "da PC" dei dati
   (revisioni, obiettivi, pesate…) che `js/ask.js` si aspetta, a partire
   dallo storico di 90 giorni pubblicato dal PC (`ctx.storico`). */
let _cacheStato = null, _cacheChiave = null;
function costruisciStato(c) {
  const st = c.storico || {};
  return {
    cataloghi: {
      tipiAllenamento: (c.cataloghi && c.cataloghi.tipiAllenamento) || [],
      mood: (c.cataloghi && c.cataloghi.mood) || [],
    },
    revFieldsConfig: { coreVisibility: c.campiAttivi || {} },
    targetNutrizione: c.targetNutrizione || {},
    profile: c.profilo || {},

    // — per CHIEDI —
    storicoDa: st.da || null,
    revisioni: (st.revisioni || []).map(g => ({
      data: g.data, oreAllenamento: g.ore, sessioniGiorno: g.ses, dettagliSessioni: null,
      flessioni: g.fl, squat: g.sq, addominali: g.ad, kmCorsa: g.km, sonnoOre: g.sonno,
      riposo: !!g.rip, tecnica: g.tec, intensita: g.int, affaticamento: g.aff, letturaMin: g.lett, mood: g.mood || [],
    })),
    corsa: st.corsa || [],
    sonno: st.sonno || [],
    pesate: (() => { const l = (st.pesate || []).slice(); if (st.pesataPrima) l.unshift(st.pesataPrima); return l; })(),
    obiettivi: (st.obiettivi || []).map((o, i) => ({
      id: 'o' + i, descrizione: o.nome, categoria: o.cat, unita: o.un, target: o.tg,
      scadenza: o.sc, periodo: o.per, auto: !!o.auto, completed: !!o.comp, currentManual: o.man || 0,
    })),
    infortuni: (st.infortuni || []).map(i => ({ parte: i.parte, dataInizio: i.dal, dataFine: i.al, gravita: i.gravita })),
    piano: c.piano || { riposoFisso: [1] },
    targetGiorn: c.targetGiorn || null,
  };
}

/* ─── CS ridotto: solo ciò che il parser legge ───────────
   Ogni voce ha un fallback vuoto, così `NLP.parse` non lancia mai
   anche quando il contesto non è ancora arrivato. */
const CS = {

  get state() {
    const c = CTX.get() || {};
    if (!_cacheStato || _cacheChiave !== c.aggiornatoIl) {
      _cacheStato = costruisciStato(c);
      _cacheChiave = c.aggiornatoIl;
    }
    return _cacheStato;
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
