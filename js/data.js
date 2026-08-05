/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — DATA LAYER
   Single source of truth + load/save + export/import
   ═══════════════════════════════════════════════════════ */

const CS = (function () {

  const STORAGE_KEY = 'cs_v8';
  const SCHEMA_VERSION = 6;

  // ─── SCHEMA DEFAULT ──────────────────────────────────
  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      meta: {
        createdAt: new Date().toISOString(),
        lastBackupAt: null,
      },
      profile: {
        nome: 'DANIEL',
        eta: 26,
        altezza: 188,
        pesoTarget: 91,
        prossimoMatch: null, // ISO date
      },

      // ─── FOCUS: visione long-term ───
      visione: {
        y1: '',  // "Fra 1 anno io sono..."
        y3: '',  // "Fra 3 anni io sono..."
        y5: '',  // "Fra 5 anni io sono..."
      },

      // ─── FOCUS: calendario eventi ───
      eventi: [],   // {id, data, tipo:'match'|'medico'|'seminario'|'altro', titolo, note}

      // ─── DATI INSERITI DALL'UTENTE (source of truth) ───
      revisioni: [],   // revisioni giornaliere — schema: {id, data, oreAllenamento (auto-somma da dettagliSessioni), sessioniGiorno (= dettagliSessioni.length), dettagliSessioni:[{ore, tipo}], tipo[] (legacy: unione tipi), tecnica, intensita, affaticamento, riposo, sonnoOre, sonnoQualita, mood[], flessioni, squat, addominali, kmCorsa, bene, migliora, ...extras}
      revSettimanali: [],
      revMensili: [],

      pesate: [],       // {id, data, kg, note}
      sonno: [],        // {id, data, ore, qualita}   (qualita 1-5)
      pasti: [],        // {id, data, ora, tipo, alimenti:[{nome,g,kcal,pro,carb,fat}]}
      corsa: [],        // {id, data, tipo, km, durataMin, fcMedia, kcal, note}
      infortuni: [],    // {id, dataInizio, dataFine|null, parte, gravita, sintomi, terapia, note, recoveryPercent, log:[{data,nota,recovery}]}

      areeVoti: [],     // {id, data, area, voto, bene, male, migliora}
      fondVoti: [],     // {id, data, esercizio, voto, bene, male, migliora}

      // ─── TECNICA: sessioni dettagliate ───
      sessioni: [],     // {id, data, oraInizio, oraFine, luogo, tipo:[], esercizi:[{nome,sets,durata,intensita}], areeVoti:[{area,voto}], fcMedia, moodPre, moodPost, note}

      obiettivi: [],    // {id, descrizione, categoria, unita, target, scadenza, periodo, auto, completed, currentManual}

      // ─── PESO: goal pace (data target manuale) ───
      goalPace: {
        dataTarget: null,  // ISO date — utente imposta "voglio essere a pesoTarget entro questa data"
      },

      // ─── CONFIGURAZIONE ───
      // Criteri oro NUOVI (rivoluzione 2026-06-22)
      criteriOro: {
        sett: {
          giorniAllenamento: 6,   // su 7
          oreMinime: 2,           // ore/giorno minimo nei giorni di allenamento
          flessioniGiorno: 50,
          squatGiorno: 50,
          addoGiorno: 50,         // v3: addominali target/giorno
          corseSett: 3,
        },
        mese: {
          settimaneTop: 3,        // su 4 settimane
        },
        sonnoTargetH: 8,          // v3: target ore sonno medio
      },
      targetSett: {
        oreAllenamento: 14,                              // 2h/giorno × 7gg
        kmCorsa: 20,
        sessioni: 14,                                    // 2 sessioni/giorno × 7gg
      },
      targetNutrizione: {
        kcal: 3000,
        pro: 165,
        carb: 360,
        fat: 85,
      },

      // ─── ASSISTENTE: storia messaggi + snooze ───
      assistantHistory: [], // {id, data, persona, ruleId, messaggio, domanda, risposte, scelta, azione, snoozedUntil}

      // ─── SETTINGS v4: personalizzazione campi revisione + cataloghi modificabili ───
      revFieldsConfig: defaultRevFieldsConfig(),
      cataloghi: {
        tipiAllenamento: TIPI_ALLENAMENTO.map(t => ({ ...t })),
        mood:            MOOD_LIST.map(m => ({ ...m })),
      },
    };
  }

  // Default per revFieldsConfig — usato sia in emptyState che nella migrazione v4
  function defaultRevFieldsConfig() {
    return {
      coreVisibility: {
        intensita: true, affaticamento: true, moodChips: true, sonnoQualita: true,
        flessioni: true, squat: true, addominali: true, kmCorsa: true,
      },
      predefinedExtras: {
        orePesi:         { enabled: false, label: 'Ore sala pesi', unit: 'h',    icon: '🏋', scope: ['daily','weekly','monthly'] },
        kmBici:          { enabled: false, label: 'Km bici',       unit: 'km',   icon: '🚴', scope: ['daily','weekly','monthly'] },
        minStretching:   { enabled: false, label: 'Stretching',    unit: 'min',  icon: '🧘', scope: ['daily','weekly']           },
        minMeditazione:  { enabled: false, label: 'Meditazione',   unit: 'min',  icon: '🧠', scope: ['daily']                    },
        kcal:            { enabled: false, label: 'Calorie',       unit: 'kcal', icon: '🔥', scope: ['daily']                    },
        passi:           { enabled: false, label: 'Passi',         unit: '',     icon: '👣', scope: ['daily','weekly']           },
        pesoBilanciere:  { enabled: false, label: 'Carico max',    unit: 'kg',   icon: '🏋', scope: ['weekly','monthly']         },
        minRespirazione: { enabled: false, label: 'Respirazione',  unit: 'min',  icon: '🌬', scope: ['daily']                    },
      },
      customMetrics: [], // { id, key, label, unit, icon, scope[], createdAt }
    };
  }

  // Migrazione v3 → v4 — isolata per riusabilità (anche da restore handler)
  function migrateToV4(parsed) {
    if (!parsed.revFieldsConfig) parsed.revFieldsConfig = defaultRevFieldsConfig();
    if (!parsed.cataloghi) {
      parsed.cataloghi = {
        tipiAllenamento: TIPI_ALLENAMENTO.map(t => ({ ...t })),
        mood:            MOOD_LIST.map(m => ({ ...m })),
      };
    }
    return parsed;
  }

  // ─── LISTE STATICHE ──────────────────────────────────
  const AREE_TECNICHE = [
    'Jab', 'Diretto', 'Gancio', 'Montante',
    'Difesa', 'Cambio Ritmo', 'Distanza', 'Footwork',
    'Combinazioni', 'Potenza', 'Resistenza', 'Velocità',
    'Testa',
  ];

  const FONDAMENTALI = [
    'Sacco', 'Corda', 'Vuoto Normale', 'Vuoto Pesi',
    'Sparring', 'Figure', 'Palestra',
  ];

  const TIPI_ALLENAMENTO = [
    { id: 'pugilato', label: 'Pugilato', icon: '🥊' },
    { id: 'pesi', label: 'Sala Pesi', icon: '🏋' },
    { id: 'casa', label: 'Allenamento Casa', icon: '🏠' },
    { id: 'corsa', label: 'Corsa', icon: '🏃' },
    { id: 'sparring', label: 'Sparring', icon: '🤜' },
    { id: 'tecnica', label: 'Solo Tecnica', icon: '🎯' },
  ];

  const MOOD_LIST = [
    { id: 'feroce', label: 'Feroce', icon: '😤', positive: true },
    { id: 'fiamme', label: 'In Fiamme', icon: '🔥', positive: true },
    { id: 'determinato', label: 'Determinato', icon: '💪', positive: true },
    { id: 'normale', label: 'Normale', icon: '😐', neutral: true },
    { id: 'stanco', label: 'Stanco', icon: '😴', negative: true },
    { id: 'frustrato', label: 'Frustrato', icon: '😠', negative: true },
    { id: 'senzaVoglia', label: 'Senza Voglia', icon: '😶', negative: true },
    { id: 'distratto', label: 'Distratto', icon: '🌀', negative: true },
    { id: 'ansioso', label: 'Ansioso', icon: '😬', negative: true },
    { id: 'concentrato', label: 'Concentrato', icon: '🎯', positive: true },
  ];

  const CATEGORIE_OBIETTIVO = [
    { id: 'ore', label: 'Ore allenamento', unita: 'h' },
    { id: 'sessioni', label: 'Sessioni', unita: 'sess' },
    { id: 'flessioni', label: 'Flessioni', unita: 'rip' },
    { id: 'squat', label: 'Squat', unita: 'rip' },
    { id: 'addominali', label: 'Addominali', unita: 'rip' },
    { id: 'km', label: 'Km corsa', unita: 'km' },
    { id: 'peso', label: 'Peso (kg)', unita: 'kg' },
    { id: 'tecnica', label: 'Tecnica media', unita: '/10' },
    { id: 'sonno', label: 'Ore sonno medio', unita: 'h' },
    { id: 'custom', label: 'Metrica personalizzata', unita: '' },
    { id: 'libero', label: 'Libero (manuale)', unita: '' },
  ];

  // Inferisce la categoria auto-tracciabile da descrizione/unità.
  // Ritorna { categoria, unita } se trovata, altrimenti null.
  // Usato per collegare obiettivi creati come "libero" alle revisioni.
  function inferObiettivoCategoria(o) {
    const desc = String(o.descrizione || '').toLowerCase();
    const unita = String(o.unita || '').toLowerCase();
    if (/\bflessio\w*/.test(desc) || /\bfless\b/.test(desc)) return { categoria: 'flessioni', unita: 'rip' };
    if (/\bsquat\w*/.test(desc)) return { categoria: 'squat', unita: 'rip' };
    if (/\baddomi\w*|core\b/.test(desc)) return { categoria: 'addominali', unita: 'rip' };
    if (/\bore?\s*(di\s*)?allena\w*|allenamento\s*ore|h\s*allen/.test(desc) || (unita === 'h' && /allen/.test(desc))) return { categoria: 'ore', unita: 'h' };
    if (/\bsessio\w*/.test(desc) || unita === 'sess') return { categoria: 'sessioni', unita: 'sess' };
    if (/\bkm\b|chilom|corsa\s*\d|\bkm\s*corsa/.test(desc) || unita === 'km') return { categoria: 'km', unita: 'km' };
    if (/\bpeso\b|\bkg\b\s*peso/.test(desc) || unita === 'kg') return { categoria: 'peso', unita: 'kg' };
    if (/\btecnica\b|voto\s*tec/.test(desc)) return { categoria: 'tecnica', unita: '/10' };
    if (/\bsonno\b|\bdorm\w*/.test(desc)) return { categoria: 'sonno', unita: 'h' };
    return null;
  }

  // ─── TARGET VOLUME PER GIORNO ───────────────────────
  // Legge il target del giorno per una categoria volume (flessioni/squat/addominali)
  // priorità: obiettivo GIORNALIERO auto attivo per quel giorno → criteriOro.sett fallback
  function getTargetVolumeForDay(dateIso, categoria) {
    const key = categoria === 'flessioni' ? 'flessioniGiorno'
              : categoria === 'squat'     ? 'squatGiorno'
              : categoria === 'addominali'? 'addoGiorno'
              : null;
    const fallback = (key && state && state.criteriOro && state.criteriOro.sett && state.criteriOro.sett[key]) || 50;
    if (!state || !Array.isArray(state.obiettivi)) return fallback;
    const obj = state.obiettivi.find(o =>
      o && o.scadenza === 'giornaliero'
      && o.categoria === categoria
      && o.periodo === dateIso
      && Number(o.target) > 0
    );
    return obj ? Number(obj.target) : fallback;
  }

  // ─── STATE ───────────────────────────────────────────
  let state = null;

  // ─── PERSISTENCE ─────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Prova migrazione da v7
        const v7 = tryMigrateV7();
        if (v7) {
          state = v7;
          save();
          return state;
        }
        state = emptyState();
        save();
        return state;
      }
      const parsed = JSON.parse(raw);
      // Future migrazioni schema:
      if (!parsed.schemaVersion || parsed.schemaVersion < SCHEMA_VERSION) {
        // v1 → v2: collega obiettivi 'libero' a categoria auto inferita da descrizione
        if ((!parsed.schemaVersion || parsed.schemaVersion < 2) && Array.isArray(parsed.obiettivi)) {
          let n = 0;
          parsed.obiettivi.forEach(o => {
            const needsInfer = !o.auto && (o.categoria === 'libero' || !o.categoria);
            if (!needsInfer) return;
            const inf = inferObiettivoCategoria(o);
            if (inf) {
              o.auto = true;
              o.categoria = inf.categoria;
              if (!o.unita) o.unita = inf.unita;
              n++;
            }
          });
          if (n > 0) console.log(`[CS] Migrazione v2: ${n} obiettivi collegati a categoria auto`);
        }
        // v2 → v3: estendi criteriOro con sonnoTargetH e addoGiorno
        if ((!parsed.schemaVersion || parsed.schemaVersion < 3) && parsed.criteriOro) {
          parsed.criteriOro.sett = parsed.criteriOro.sett || {};
          if (parsed.criteriOro.sett.addoGiorno == null) parsed.criteriOro.sett.addoGiorno = 50;
          if (parsed.criteriOro.sonnoTargetH == null) parsed.criteriOro.sonnoTargetH = 8;
        }
        // v3 → v4: settings (revFieldsConfig + cataloghi)
        if (!parsed.schemaVersion || parsed.schemaVersion < 4) {
          migrateToV4(parsed);
          console.log('[CS] Migrazione v4: revFieldsConfig + cataloghi inizializzati');
        }
        // v4 → v5: bump target ore allenamento settimanali da 12 (1.7h/gg) a 14 (2h/gg)
        // Solo se valore è ancora il vecchio default (utenti che hanno modificato esplicitamente sono preservati)
        if ((!parsed.schemaVersion || parsed.schemaVersion < 5) && parsed.targetSett) {
          if (Number(parsed.targetSett.oreAllenamento) === 12) {
            parsed.targetSett.oreAllenamento = 14;
            console.log('[CS] Migrazione v5: targetSett.oreAllenamento 12→14 (2h/gg)');
          }
        }
        // v5 → v6: bump target sessioni settimanali da 5 a 14 (2 sess/giorno × 7gg)
        // Solo se il valore è ancora il vecchio default 5
        if ((!parsed.schemaVersion || parsed.schemaVersion < 6) && parsed.targetSett) {
          if (Number(parsed.targetSett.sessioni) === 5) {
            parsed.targetSett.sessioni = 14;
            console.log('[CS] Migrazione v6: targetSett.sessioni 5→14 (2 sess/gg)');
          }
        }
        parsed.schemaVersion = SCHEMA_VERSION;
      }
      state = mergeDefaults(parsed);
      save();
      return state;
    } catch (e) {
      console.error('[CS] load error:', e);
      state = emptyState();
      return state;
    }
  }

  // OTTIMIZZAZIONE SAVE:
  // Ogni CRUD chiama save(). Operazioni composite (es. compilazione revisione,
  // import, pasti multipli) chiamavano JSON.stringify dell'INTERO stato N volte
  // di fila nello stesso tick. Ora le scritture nello stesso tick vengono
  // coalizzate in una sola tramite queueMicrotask: identica affidabilità
  // (la scrittura avviene comunque prima di qualsiasi evento successivo),
  // ma 1 stringify invece di N.
  let _savePending = false;

  function _writeNow() {
    _savePending = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Segnale simmetrico a 'cs:save-error': ci si aggancia la sincronia
      // per ripubblicare il contesto sul telefono.
      window.dispatchEvent(new CustomEvent('cs:saved'));
      return true;
    } catch (e) {
      console.error('[CS] save error (storage full?):', e);
      window.dispatchEvent(new CustomEvent('cs:save-error', { detail: e.message }));
      return false;
    }
  }

  function save() {
    if (_savePending) return true;
    _savePending = true;
    queueMicrotask(_writeNow);
    return true;
  }

  // Flush di sicurezza: se la pagina viene chiusa/nascosta con una scrittura
  // in coda, la eseguiamo immediatamente (pagehide copre chiusura tab,
  // visibilitychange copre cambio app su mobile).
  window.addEventListener('pagehide', () => { if (_savePending) _writeNow(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _savePending) _writeNow();
  });

  function mergeDefaults(loaded) {
    const def = emptyState();
    // shallow merge top-level keys
    Object.keys(def).forEach(k => {
      if (loaded[k] === undefined) loaded[k] = def[k];
      // se è oggetto profile/criteri/target, merge profondo 1 livello
      else if (typeof def[k] === 'object' && !Array.isArray(def[k]) && def[k] !== null) {
        loaded[k] = Object.assign({}, def[k], loaded[k]);
      }
    });
    return loaded;
  }

  // ─── MIGRAZIONE DA v7 ────────────────────────────────
  function num(x) {
    if (x === null || x === undefined || x === '') return 0;
    const n = Number(x);
    return isNaN(n) ? 0 : n;
  }

  // Detect: oggetto sembra un export v7? (no schemaVersion + chiavi tipiche v7)
  function looksLikeV7(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.schemaVersion) return false;
    return Array.isArray(obj.archDaily) || Array.isArray(obj.areeSt)
        || Array.isArray(obj.fondSt) || Array.isArray(obj.annuali)
        || Array.isArray(obj.archGiorn) || Array.isArray(obj.archWeekly);
  }

  // Converte un oggetto v7 parsato in uno stato v8 completo
  function migrateV7Object(v7) {
    const newState = emptyState();
    newState.meta.importedFromV7 = true;

    // Profile
    if (v7.nome) newState.profile.nome = v7.nome;
    if (v7.eta) newState.profile.eta = num(v7.eta);
    if (v7.pesoTarget) newState.profile.pesoTarget = num(v7.pesoTarget);
    if (v7.matchDate && v7.matchDate !== 'TBD') newState.profile.prossimoMatch = v7.matchDate;

    // Peso corrente → prima pesata
    if (v7.peso && num(v7.peso) > 0) {
      newState.pesate.push({
        id: uid(), data: todayISO(), kg: num(v7.peso), note: 'Importato da v7'
      });
    }

    // Revisioni giornaliere (archDaily nuovo / archGiorn vecchio)
    const daily = Array.isArray(v7.archDaily) ? v7.archDaily
                : Array.isArray(v7.archGiorn) ? v7.archGiorn : [];
    newState.revisioni = daily.map(r => ({
      id: String(r.id || uid()),
      data: r.data,
      sett: r.sett || '',
      allena: r.allena || '',
      bene: r.bene || '',
      male: r.male || '',
      migliora: r.migliora || '',
      tecnica: num(r.tecnica),
      soddi: num(r.soddi),
      affat: num(r.affat),
      mood: r.mood || '',
      ore: r.ore || '',
      oreH: num(r.oreH),
      km: num(r.km),
      mincorsa: r.mincorsa || '',
      lettura: r.lettura || '',
      social: num(r.social),
      sonno: num(r.sonno),
      objPct: num(r.objPct),
      domani: r.domani || '',
      rifless: r.rifless || ''
    }));

    // Revisioni settimanali
    const weekly = Array.isArray(v7.archWeekly) ? v7.archWeekly
                 : Array.isArray(v7.archSettimane) ? v7.archSettimane : [];
    newState.revSettimanali = weekly.map(w => ({
      id: String(w.id || uid()),
      periodo: w.periodo || '',
      sett: w.sett || '',
      sessioni: w.sessioni || '',
      mT: num(w.mT), mS: num(w.mS), mA: num(w.mA),
      ore: w.ore || '', oreH: num(w.oreH),
      diff: w.diff || '', km: num(w.km), social: num(w.social),
      mood: w.mood || '', bene: w.bene || '', male: w.male || '',
      migliora: w.migliora || '', obv: w.obv || '',
      pct: num(w.pct), rifless: w.rifless || ''
    }));

    // Revisioni mensili
    if (Array.isArray(v7.archMonthly)) {
      newState.revMensili = v7.archMonthly.map(m => Object.assign({ id: String(m.id || uid()) }, m));
    }

    // Pesate
    if (Array.isArray(v7.pesate)) {
      v7.pesate.forEach(p => newState.pesate.push({
        id: String(p.id || uid()),
        data: p.d || p.data,
        kg: num(p.p || p.kg),
        note: p.n || p.note || ''
      }));
    }

    // Sonno (sonnoLog esplicito)
    if (Array.isArray(v7.sonnoLog)) {
      newState.sonno = v7.sonnoLog.map(s => ({
        id: String(s.id || uid()), data: s.data || s.d,
        ore: num(s.ore), qualita: num(s.qualita) || 3
      }));
    }
    // Sonno (estratto dalle revisioni daily)
    daily.forEach(r => {
      const ore = num(r.sonno);
      if (ore > 0 && r.data && !newState.sonno.find(x => x.data === r.data)) {
        newState.sonno.push({ id: uid(), data: r.data, ore, qualita: 3 });
      }
    });

    // Aree (storico voti)
    if (Array.isArray(v7.areeSt)) {
      newState.areeVoti = v7.areeSt.map(v => ({
        id: String(v.id || uid()), data: v.data, area: v.area,
        voto: num(v.voto), bene: v.bene || '', male: v.male || '', migliora: v.migliora || ''
      }));
    }

    // Fondamentali (storico voti)
    if (Array.isArray(v7.fondSt)) {
      newState.fondVoti = v7.fondSt.map(v => ({
        id: String(v.id || uid()), data: v.data,
        esercizio: v.eser || v.area || v.esercizio || '',
        voto: num(v.voto), bene: v.bene || '', male: v.male || '', migliora: v.migliora || ''
      }));
    }

    // Corsa
    if (v7.corsa && Array.isArray(v7.corsa.sessioni)) {
      newState.corsa = v7.corsa.sessioni.map(c => ({
        id: String(c.id || uid()), data: c.data, tipo: c.tipo,
        km: num(c.km), durataMin: num(c.durata_min || c.durataMin),
        fcMedia: num(c.fc || c.fcMedia), kcal: num(c.kcal), note: c.note || ''
      }));
    }

    // Infortuni
    if (Array.isArray(v7.infortuni)) {
      newState.infortuni = v7.infortuni.map(i => ({
        id: String(i.id || uid()), dataInizio: i.data || i.dataInizio,
        dataFine: i.risolto ? todayISO() : null,
        parte: i.parte, gravita: i.gravita,
        sintomi: i.sintomi || '', terapia: i.terapia || '', note: i.note || ''
      }));
    }

    // Nutrizione
    if (v7.nutr) {
      if (v7.nutr.target) newState.targetNutrizione = Object.assign(newState.targetNutrizione, v7.nutr.target);
      if (Array.isArray(v7.nutr.pasti)) newState.pasti = v7.nutr.pasti;
    }

    // Obiettivi mensili correnti
    const periodoMese = monthKey(new Date());
    if (Array.isArray(v7.obv)) {
      v7.obv.forEach(o => newState.obiettivi.push({
        id: uid(),
        descrizione: o.n || o.desc || '',
        categoria: 'libero', unita: o.u || o.unit || '',
        target: num(o.tn) || num(o.t) || num(o.target) || 0,
        scadenza: 'mensile', periodo: periodoMese,
        auto: false, completed: false,
        currentManual: num(o.c)
      }));
    }

    // Obiettivi annuali
    const anno = String(new Date().getFullYear());
    if (Array.isArray(v7.annuali)) {
      v7.annuali.forEach(o => {
        const tot = Array.isArray(o.v) ? o.v.reduce((a, b) => a + num(b), 0) : 0;
        newState.obiettivi.push({
          id: uid(),
          descrizione: o.n || o.desc || '',
          categoria: 'libero', unita: o.unit || '',
          target: num(o.t) || num(o.target) || 0,
          scadenza: 'annuale', periodo: anno,
          auto: false, completed: false,
          currentManual: tot,
          progressiMese: Array.isArray(o.v) ? o.v.slice() : []
        });
      });
    }

    // Obiettivi mensili archiviati (mesi passati)
    if (Array.isArray(v7.archObj)) {
      const meseMap = {
        'Gennaio': '01', 'Febbraio': '02', 'Marzo': '03', 'Aprile': '04',
        'Maggio': '05', 'Giugno': '06', 'Luglio': '07', 'Agosto': '08',
        'Settembre': '09', 'Ottobre': '10', 'Novembre': '11', 'Dicembre': '12'
      };
      v7.archObj.forEach(arc => {
        if (!Array.isArray(arc.obv)) return;
        const mm = meseMap[arc.mese] || '01';
        const periodo = `${arc.anno || anno}-${mm}`;
        arc.obv.forEach(o => newState.obiettivi.push({
          id: uid(),
          descrizione: o.n || '',
          categoria: 'libero', unita: o.u || '',
          target: num(o.tn) || num(o.t) || 0,
          scadenza: 'mensile', periodo,
          auto: false,
          completed: num(o.c) >= (num(o.tn) || num(o.t) || 1),
          currentManual: num(o.c),
          archiviato: true
        }));
      });
    }

    console.log('[CS] Migrazione v7 →', {
      revisioni: newState.revisioni.length,
      revSett: newState.revSettimanali.length,
      areeVoti: newState.areeVoti.length,
      fondVoti: newState.fondVoti.length,
      obiettivi: newState.obiettivi.length,
      sonno: newState.sonno.length,
      pesate: newState.pesate.length
    });

    return newState;
  }

  // Migrazione automatica all'avvio: cerca cs_v7 in localStorage
  function tryMigrateV7() {
    try {
      const raw = localStorage.getItem('cs_v7');
      if (!raw) return null;
      return migrateV7Object(JSON.parse(raw));
    } catch (e) {
      console.warn('[CS] Migrazione v7 fallita:', e);
      return null;
    }
  }

  // ─── EXPORT / IMPORT ─────────────────────────────────
  function exportJSON() {
    state.meta.lastBackupAt = new Date().toISOString();
    save();
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `champion-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);

          // Auto-detect: se è un backup v7, converti al volo
          if (!parsed.schemaVersion && looksLikeV7(parsed)) {
            const migrated = migrateV7Object(parsed);
            state = migrated;
            save();
            resolve(state);
            return;
          }

          if (!parsed.schemaVersion) throw new Error('File non valido (schema mancante)');
          state = mergeDefaults(parsed);
          save();
          resolve(state);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Errore lettura file'));
      reader.readAsText(file);
    });
  }

  // ─── UTILITY ─────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    // FIX timezone: usa data LOCALE, non UTC. `toISOString()` ritorna UTC,
    // quindi in CEST (UTC+2) cliccare a mezzanotte poteva salvare sulla data sbagliata.
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function monthKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function weekKey(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    // Lunedì come primo giorno
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function weekRange(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    const day = d.getDay() || 7;       // dom = 7
    const mon = new Date(d);
    mon.setDate(d.getDate() - day + 1);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { start: mon, end: sun };
  }

  function daysOfWeek(date) {
    const { start } = weekRange(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }

  function isoDateOnly(date) {
    // FIX timezone: ritorna data LOCALE.
    // Se in input è già una stringa "YYYY-MM-DD...", restituisci la slice senza riconvertire
    // (riconvertire una ISO via new Date() la interpreta come UTC e perde 1 giorno in fusi negativi).
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      return date.slice(0, 10);
    }
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fmtDate(iso, opts = {}) {
    if (!iso) return '—';
    const d = new Date(iso);
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    if (opts.short) return `${d.getDate()} ${months[d.getMonth()]}`;
    if (opts.long) return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    return d.toLocaleDateString('it-IT');
  }

  function fmtNumber(n, decimals = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(decimals);
  }

  // ─── CRUD HELPERS ────────────────────────────────────
  function addRevisione(rev) {
    rev.id = rev.id || uid();
    rev.data = rev.data || todayISO();
    // Replace if same date
    const existing = state.revisioni.findIndex(r => r.data === rev.data);
    if (existing >= 0) state.revisioni[existing] = rev;
    else state.revisioni.push(rev);
    save();
    window.dispatchEvent(new CustomEvent('cs:rev-saved', { detail: rev }));
    return rev;
  }

  function getRevByDate(date) {
    return state.revisioni.find(r => r.data === isoDateOnly(date)) || null;
  }

  // ── Revisioni Settimanali / Mensili (compilazione manuale) ─────
  function addRevSettimanale(rev) {
    rev.id = rev.id || uid();
    rev.weekStartISO = rev.weekStartISO || todayISO();
    state.revSettimanali = state.revSettimanali || [];
    const i = state.revSettimanali.findIndex(r => r.weekStartISO === rev.weekStartISO);
    if (i >= 0) state.revSettimanali[i] = rev;
    else state.revSettimanali.push(rev);
    save();
    window.dispatchEvent(new CustomEvent('cs:rev-saved', { detail: { ...rev, _kind: 'weekly' } }));
    return rev;
  }
  function getRevSettByStart(iso) {
    return (state.revSettimanali || []).find(r => r.weekStartISO === iso) || null;
  }
  function addRevMensile(rev) {
    rev.id = rev.id || uid();
    rev.monthKey = rev.monthKey || todayISO().slice(0, 7);
    state.revMensili = state.revMensili || [];
    const i = state.revMensili.findIndex(r => r.monthKey === rev.monthKey);
    if (i >= 0) state.revMensili[i] = rev;
    else state.revMensili.push(rev);
    save();
    window.dispatchEvent(new CustomEvent('cs:rev-saved', { detail: { ...rev, _kind: 'monthly' } }));
    return rev;
  }
  function getRevMensByKey(monthKey) {
    return (state.revMensili || []).find(r => r.monthKey === monthKey) || null;
  }

  function addPesata(p) {
    p.id = p.id || uid();
    p.data = p.data || todayISO();
    state.pesate.push(p);
    state.pesate.sort((a, b) => a.data.localeCompare(b.data));
    save();
    window.dispatchEvent(new CustomEvent('cs:weight-saved', { detail: p }));
    return p;
  }

  function getLastPesata() {
    if (!state.pesate.length) return null;
    return state.pesate[state.pesate.length - 1];
  }

  function addSonno(s) {
    s.id = s.id || uid();
    s.data = s.data || todayISO();
    const existing = state.sonno.findIndex(x => x.data === s.data);
    if (existing >= 0) state.sonno[existing] = s;
    else state.sonno.push(s);
    state.sonno.sort((a, b) => a.data.localeCompare(b.data));
    save();
    return s;
  }

  function addObiettivo(o) {
    o.id = o.id || uid();
    o.completed = o.completed || false;
    // Auto-collega categoria se l'utente ha lasciato 'libero' ma la descrizione è chiara
    if (!o.auto && (o.categoria === 'libero' || !o.categoria)) {
      const inf = inferObiettivoCategoria(o);
      if (inf) {
        o.auto = true;
        o.categoria = inf.categoria;
        if (!o.unita) o.unita = inf.unita;
      }
    }
    state.obiettivi.push(o);
    save();
    return o;
  }

  function updateObiettivo(id, patch) {
    const idx = state.obiettivi.findIndex(o => o.id === id);
    if (idx < 0) return null;
    state.obiettivi[idx] = Object.assign(state.obiettivi[idx], patch);
    save();
    return state.obiettivi[idx];
  }

  function deleteObiettivo(id) {
    state.obiettivi = state.obiettivi.filter(o => o.id !== id);
    save();
  }

  function addAreaVoto(v) {
    v.id = v.id || uid();
    v.data = v.data || todayISO();
    state.areeVoti.push(v);
    save();
    return v;
  }

  function addFondVoto(v) {
    v.id = v.id || uid();
    v.data = v.data || todayISO();
    state.fondVoti.push(v);
    save();
    return v;
  }

  function addCorsa(c) {
    c.id = c.id || uid();
    c.data = c.data || todayISO();
    state.corsa.push(c);
    save();
    return c;
  }

  function addInfortunio(i) {
    i.id = i.id || uid();
    i.dataInizio = i.dataInizio || todayISO();
    state.infortuni.push(i);
    save();
    return i;
  }

  function updateInfortunio(id, patch) {
    const idx = state.infortuni.findIndex(x => x.id === id);
    if (idx < 0) return null;
    state.infortuni[idx] = Object.assign(state.infortuni[idx], patch);
    save();
    return state.infortuni[idx];
  }

  function addPasto(p) {
    p.id = p.id || uid();
    p.data = p.data || todayISO();
    state.pasti.push(p);
    save();
    return p;
  }

  function addAbitudine(a) {
    a.id = a.id || uid();
    a.data = a.data || todayISO();
    const idx = state.abitudini.findIndex(x => x.data === a.data);
    if (idx >= 0) state.abitudini[idx] = a;
    else state.abitudini.push(a);
    state.abitudini.sort((x, y) => x.data.localeCompare(y.data));
    save();
    return a;
  }

  function addCheckpoint(c) {
    c.id = c.id || uid();
    c.status = c.status || 'planned';
    state.checkpoint.push(c);
    state.checkpoint.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    save();
    return c;
  }

  function updateCheckpoint(id, patch) {
    const idx = state.checkpoint.findIndex(c => c.id === id);
    if (idx < 0) return null;
    state.checkpoint[idx] = Object.assign(state.checkpoint[idx], patch);
    save();
    return state.checkpoint[idx];
  }

  function deleteCheckpoint(id) {
    state.checkpoint = state.checkpoint.filter(c => c.id !== id);
    save();
  }

  function addQuizSessione(q) {
    q.id = q.id || uid();
    q.data = q.data || todayISO();
    state.quizSessioni.push(q);
    save();
    return q;
  }

  function setIdentita(patch) {
    // LEGACY — manteniamo per compat, ma 'identita' non è più nello schema default
    state.identita = Object.assign({}, state.identita || {}, patch);
    save();
    return state.identita;
  }

  // ─── EVENTI (FOCUS / calendario) ────────────────────
  function addEvento(e) {
    e.id = e.id || uid();
    e.data = e.data || todayISO();
    e.tipo = e.tipo || 'altro';
    state.eventi = state.eventi || [];
    state.eventi.push(e);
    state.eventi.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    save();
    return e;
  }
  function updateEvento(id, patch) {
    state.eventi = state.eventi || [];
    const idx = state.eventi.findIndex(x => x.id === id);
    if (idx < 0) return null;
    state.eventi[idx] = Object.assign(state.eventi[idx], patch);
    state.eventi.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    save();
    return state.eventi[idx];
  }
  function deleteEvento(id) {
    state.eventi = (state.eventi || []).filter(x => x.id !== id);
    save();
  }

  // ─── VISIONE (FOCUS / visione) ──────────────────────
  function setVisione(patch) {
    state.visione = Object.assign({ y1: '', y3: '', y5: '' }, state.visione || {}, patch);
    save();
    return state.visione;
  }

  // ─── SESSIONI (TECNICA / sessioni) ──────────────────
  function addSessione(s) {
    s.id = s.id || uid();
    s.data = s.data || todayISO();
    state.sessioni = state.sessioni || [];
    state.sessioni.push(s);
    state.sessioni.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    save();
    return s;
  }
  function updateSessione(id, patch) {
    state.sessioni = state.sessioni || [];
    const idx = state.sessioni.findIndex(x => x.id === id);
    if (idx < 0) return null;
    state.sessioni[idx] = Object.assign(state.sessioni[idx], patch);
    save();
    return state.sessioni[idx];
  }
  function deleteSessione(id) {
    state.sessioni = (state.sessioni || []).filter(x => x.id !== id);
    save();
  }

  // ─── GOAL PACE (FISICA / peso) ──────────────────────
  function setGoalPace(patch) {
    state.goalPace = Object.assign({ dataTarget: null }, state.goalPace || {}, patch);
    save();
    return state.goalPace;
  }

  // ─── CRITERI ORO (modificabili da Archivio/Revisioni/Oro) ───
  function updateCriteriOro(patch) {
    // patch: { sett:{...}, mese:{...}, sonnoTargetH? } — merge profondo 1 livello
    const cur = state.criteriOro || {};
    state.criteriOro = {
      sett: Object.assign({}, cur.sett || {}, patch.sett || {}),
      mese: Object.assign({}, cur.mese || {}, patch.mese || {}),
      sonnoTargetH: patch.sonnoTargetH != null ? Number(patch.sonnoTargetH) : (cur.sonnoTargetH || 8),
    };
    save();
    return state.criteriOro;
  }

  // ─── PROFILE update (FISICA, eta per FCmax, target peso) ───
  function setProfile(patch) {
    state.profile = Object.assign({}, state.profile, patch);
    save();
    return state.profile;
  }

  // ─── DELETE helpers (per gestione UI ricca) ─────────
  function deletePesata(id) {
    state.pesate = state.pesate.filter(p => p.id !== id);
    save();
  }
  function deleteRevisione(date) {
    state.revisioni = state.revisioni.filter(r => r.data !== date);
    save();
  }
  function deleteCorsa(id) {
    state.corsa = state.corsa.filter(c => c.id !== id);
    save();
  }
  function deletePasto(id) {
    state.pasti = state.pasti.filter(p => p.id !== id);
    save();
  }
  function updatePasto(id, patch) {
    const idx = state.pasti.findIndex(p => p.id === id);
    if (idx < 0) return null;
    state.pasti[idx] = Object.assign(state.pasti[idx], patch);
    save();
    return state.pasti[idx];
  }
  function deleteInfortunio(id) {
    state.infortuni = state.infortuni.filter(i => i.id !== id);
    save();
  }
  function deleteAreaVoto(id) {
    state.areeVoti = state.areeVoti.filter(v => v.id !== id);
    save();
  }
  function deleteFondVoto(id) {
    state.fondVoti = state.fondVoti.filter(v => v.id !== id);
    save();
  }

  // ─── ASSISTENT history (snooze + risposte) ──────────
  function logAssistantInteraction(entry) {
    entry.id = entry.id || uid();
    entry.data = entry.data || new Date().toISOString();
    state.assistantHistory = state.assistantHistory || [];
    state.assistantHistory.push(entry);
    // Cap a 500 voci
    if (state.assistantHistory.length > 500) {
      state.assistantHistory = state.assistantHistory.slice(-500);
    }
    save();
    return entry;
  }
  function snoozeRule(ruleId, untilISO) {
    return logAssistantInteraction({
      ruleId, snoozedUntil: untilISO, azione: 'snooze',
    });
  }
  function isRuleSnoozed(ruleId) {
    const now = new Date().toISOString();
    return (state.assistantHistory || []).some(h =>
      h.ruleId === ruleId && h.snoozedUntil && h.snoozedUntil > now);
  }

  // ─── RESET ───────────────────────────────────────────
  function resetAll() {
    state = emptyState();
    save();
    return state;
  }

  // ─── SETTINGS v4: API revFieldsConfig + cataloghi ────
  // Reserved keys che non possono essere usati come custom metric (collisioni con core)
  const RESERVED_KEYS = new Set([
    'id', 'data', 'oreAllenamento', 'tipo', 'tecnica', 'intensita', 'affaticamento',
    'riposo', 'sonnoOre', 'sonnoQualita', 'mood', 'flessioni', 'squat', 'addominali',
    'kmCorsa', 'bene', 'migliora',
    'weekStartISO', 'weekEndISO', 'monthKey',
    'oreTot', 'sessTot', 'flessTot', 'squatTot', 'addoTot', 'kmTot',
    'sonnoMedio', 'pesoFine', 'settOro', 'focusProssima', 'focusProssimo',
  ]);

  // Slug semplice: rimuove accenti, spazi → camelCase, lowercase
  function slugifyKey(label) {
    if (!label) return '';
    const noAccents = label.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = noAccents.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/);
    if (!words.length) return '';
    return words[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  function getEnabledFields(scope) {
    const cfg = state.revFieldsConfig || defaultRevFieldsConfig();
    const extras = [];
    Object.entries(cfg.predefinedExtras || {}).forEach(([k, m]) => {
      if (m.enabled && (m.scope || []).includes(scope)) {
        extras.push({ source: 'predef', key: k, label: m.label, unit: m.unit, icon: m.icon });
      }
    });
    (cfg.customMetrics || []).forEach(m => {
      if ((m.scope || []).includes(scope)) {
        extras.push({ source: 'custom', key: `x_${m.key}`, label: m.label, unit: m.unit, icon: m.icon, id: m.id });
      }
    });
    return { extras, core: cfg.coreVisibility || {} };
  }

  function toggleCoreField(fieldKey, enabled) {
    state.revFieldsConfig = state.revFieldsConfig || defaultRevFieldsConfig();
    state.revFieldsConfig.coreVisibility = state.revFieldsConfig.coreVisibility || {};
    state.revFieldsConfig.coreVisibility[fieldKey] = !!enabled;
    save();
  }

  function togglePredefinedExtra(key, enabled) {
    state.revFieldsConfig = state.revFieldsConfig || defaultRevFieldsConfig();
    const m = state.revFieldsConfig.predefinedExtras?.[key];
    if (!m) return;
    m.enabled = !!enabled;
    save();
  }

  function updatePredefinedExtraScope(key, scope) {
    const m = state.revFieldsConfig?.predefinedExtras?.[key];
    if (!m) return;
    m.scope = Array.isArray(scope) ? scope : [];
    save();
  }

  // Ritorna { ok, error?, metric? }
  function addCustomMetric(spec) {
    state.revFieldsConfig = state.revFieldsConfig || defaultRevFieldsConfig();
    const list = state.revFieldsConfig.customMetrics || (state.revFieldsConfig.customMetrics = []);
    if (list.length >= 20) return { ok: false, error: 'Limite di 20 metriche custom raggiunto' };
    const label = (spec.label || '').trim();
    if (!label) return { ok: false, error: 'Nome richiesto' };
    const key = spec.key ? slugifyKey(spec.key) : slugifyKey(label);
    if (!key) return { ok: false, error: 'Nome non valido' };
    if (RESERVED_KEYS.has(key)) return { ok: false, error: `Nome riservato (${key}). Scegline un altro.` };
    if (list.some(m => m.key === key)) return { ok: false, error: 'Esiste già una metrica con questo nome' };
    const metric = {
      id: uid(),
      key,
      label,
      unit: (spec.unit || '').slice(0, 8),
      icon: spec.icon || '📌',
      scope: Array.isArray(spec.scope) && spec.scope.length ? spec.scope : ['daily'],
      createdAt: new Date().toISOString(),
    };
    list.push(metric);
    save();
    return { ok: true, metric };
  }

  function updateCustomMetric(id, patch) {
    const list = state.revFieldsConfig?.customMetrics || [];
    const idx = list.findIndex(m => m.id === id);
    if (idx < 0) return null;
    // key e id immutabili
    const m = list[idx];
    if (patch.label != null) m.label = String(patch.label).trim();
    if (patch.unit != null)  m.unit  = String(patch.unit).slice(0, 8);
    if (patch.icon != null)  m.icon  = patch.icon;
    if (Array.isArray(patch.scope)) m.scope = patch.scope;
    save();
    return m;
  }

  function deleteCustomMetric(id) {
    const list = state.revFieldsConfig?.customMetrics || [];
    const m = list.find(x => x.id === id);
    if (!m) return { ok: false };
    // Trova obiettivi che referenziano questa metrica
    const customKey = `x_${m.key}`;
    const refObjs = (state.obiettivi || []).filter(o => o.categoria === 'custom' && o.customKey === customKey);
    // Demoti obiettivi a libero/manuale
    refObjs.forEach(o => {
      o.auto = false;
      o.categoria = 'libero';
      delete o.customKey;
    });
    state.revFieldsConfig.customMetrics = list.filter(x => x.id !== id);
    save();
    return { ok: true, demotedObjectives: refObjs.length };
  }

  function updateCatalogo(which, items) {
    if (which !== 'tipiAllenamento' && which !== 'mood') return null;
    state.cataloghi = state.cataloghi || {
      tipiAllenamento: TIPI_ALLENAMENTO.map(t => ({ ...t })),
      mood: MOOD_LIST.map(m => ({ ...m })),
    };
    state.cataloghi[which] = Array.isArray(items) ? items : [];
    save();
    return state.cataloghi[which];
  }

  function resetCatalogo(which) {
    const def = which === 'tipiAllenamento'
      ? TIPI_ALLENAMENTO.map(t => ({ ...t }))
      : MOOD_LIST.map(m => ({ ...m }));
    return updateCatalogo(which, def);
  }

  // Conta le revisioni esistenti che hanno un valore non-zero per un campo (per UI badge)
  function countRevsWithField(fieldKey) {
    const revs = state.revisioni || [];
    return revs.filter(r => {
      const v = r[fieldKey];
      return v != null && v !== 0 && v !== '';
    }).length;
  }

  // ─── PUBLIC API ──────────────────────────────────────
  return {
    // state access
    get state() { return state; },
    load, save,

    // constants
    AREE_TECNICHE, FONDAMENTALI, TIPI_ALLENAMENTO, MOOD_LIST, CATEGORIE_OBIETTIVO,

    // export/import
    exportJSON, importJSON, resetAll,

    // utility
    uid, todayISO, monthKey, weekKey, weekRange, daysOfWeek, isoDateOnly, fmtDate, fmtNumber,

    // CRUD revisioni / corpo
    addRevisione, getRevByDate, deleteRevisione,
    addRevSettimanale, getRevSettByStart, addRevMensile, getRevMensByKey,
    addPesata, getLastPesata, deletePesata,
    addSonno,
    addObiettivo, updateObiettivo, deleteObiettivo,
    addAreaVoto, deleteAreaVoto,
    addFondVoto, deleteFondVoto,
    addCorsa, deleteCorsa,
    addInfortunio, updateInfortunio, deleteInfortunio,
    addPasto, updatePasto, deletePasto,

    // Nuove entità v8-rev (2026-06-22)
    addEvento, updateEvento, deleteEvento,
    setVisione,
    addSessione, updateSessione, deleteSessione,
    setGoalPace,
    updateCriteriOro,
    setProfile,

    // Assistente
    logAssistantInteraction, snoozeRule, isRuleSnoozed,

    // Settings v4
    getEnabledFields, toggleCoreField, togglePredefinedExtra, updatePredefinedExtraScope,
    addCustomMetric, updateCustomMetric, deleteCustomMetric,
    updateCatalogo, resetCatalogo, countRevsWithField,
    inferObiettivoCategoria, slugifyKey,
    getTargetVolumeForDay,

    // LEGACY (mantenuti per compat con UI ancora da riscrivere — fase 7 cleanup)
    addAbitudine, addCheckpoint, updateCheckpoint, deleteCheckpoint,
    addQuizSessione, setIdentita,
  };

})();

// Load all'avvio (sincrono)
CS.load();
