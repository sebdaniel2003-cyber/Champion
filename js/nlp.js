/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — NLP: dal parlato ai dati
   ═══════════════════════════════════════════════════════
   NON è un modello di linguaggio: è un parser che conosce
   ESATTAMENTE ciò che il sistema contiene. Il vocabolario
   viene costruito a runtime dai cataloghi reali (tipi di
   allenamento, aree, fondamentali, mood, alimenti, campi
   core, metriche custom attivate).

   Conseguenza voluta: ciò che non è nel sistema non viene
   riconosciuto e non scrive nulla — finisce in
   `nonRiconosciuto` e viene mostrato all'utente.

   Uso:
     const r = NLP.parse("2 ore allenamento, 1 ora sala pesi");
     r.data            → '2026-08-04'
     r.intents[]       → { target, campo, valore, label, ... }
     r.nonRiconosciuto → ['frammenti non capiti']
   ═══════════════════════════════════════════════════════ */

const NLP = (function () {

  // ─── NUMERI A PAROLE ────────────────────────────────
  const NUM_WORDS = {
    zero: 0, un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
    sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
    tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17,
    diciotto: 18, diciannove: 19, venti: 20, venticinque: 25, trenta: 30,
    quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80,
    novanta: 90, cento: 100, duecento: 200, trecento: 300, cinquecento: 500,
    mille: 1000, mezza: 0.5, mezzo: 0.5, mezzora: 0.5,
  };

  // ─── UNITÀ ──────────────────────────────────────────
  // normalizzata → varianti accettate
  const UNITS = {
    h:   ['ore', 'ora', 'h', 'hr'],
    min: ['minuti', 'minuto', 'min', "m'"],
    kg:  ['kg', 'chili', 'chilo', 'chilogrammi', 'kilogrammi'],
    g:   ['g', 'gr', 'grammi', 'grammo'],
    km:  ['km', 'chilometri', 'chilometro'],
    rip: ['ripetizioni', 'ripetizione', 'rip', 'volte', 'volta'],
    pt:  ['voto', 'punti', 'punto', 'su dieci', 'su 10'],
  };
  const UNIT_LOOKUP = (() => {
    const m = new Map();
    for (const [norm, vars] of Object.entries(UNITS)) vars.forEach(v => m.set(v, norm));
    return m;
  })();

  // ─── DURATE ─────────────────────────────────────────
  // Dentro gli intent il tempo viaggia in MINUTI: è l'unità in cui lo dici
  // («45 min») e in cui lo correggi nell'anteprima. Diventa ore decimali una
  // volta sola, in `apply`, perché è quello il formato su disco.
  function inMin(n) {
    return Math.round(n.unita === 'min' ? n.valore : n.valore * 60);
  }
  /** Lettura in chiaro sotto l'etichetta: 90 → «1 ora e 30 min». */
  function leggibile(min) {
    if (typeof DURATA !== 'undefined') return DURATA.fmt(DURATA.daMinuti(min), { zero: 'da riempire' });
    return min ? min + ' min' : 'da riempire';
  }
  /** Valore pronto per la scrittura: le durate tornano ore. */
  function valoreScritto(it) {
    if (!it.durata) return it.valore;
    return typeof DURATA !== 'undefined'
      ? DURATA.daMinuti(it.valore)
      : +(((Number(it.valore) || 0) / 60).toFixed(4));
  }

  // ─── NORMALIZZAZIONE ────────────────────────────────
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')  // via gli accenti
      .replace(/['’]/g, ' ')
      .replace(/[^\w\s.,:/-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── VOCABOLARIO (dal sistema, a runtime) ───────────
  function catalogo(nome, fallback) {
    const c = (typeof CS !== 'undefined' && CS.state && CS.state.cataloghi) || {};
    const list = c[nome];
    return (Array.isArray(list) && list.length) ? list : (fallback || []);
  }

  function buildVocab() {
    const CSok = typeof CS !== 'undefined';

    // Tipi di allenamento — preferisce il catalogo modificabile dall'utente
    const tipi = catalogo('tipiAllenamento', CSok ? CS.TIPI_ALLENAMENTO : []).map(t => ({
      id: t.id, label: t.label, icon: t.icon || '🥊',
      alias: [norm(t.label), norm(t.id)].concat(TIPO_ALIAS[t.id] || []),
    }));

    const mood = catalogo('mood', CSok ? CS.MOOD_LIST : []).map(m => ({
      id: m.id, label: m.label, icon: m.icon || '🎭',
      alias: [norm(m.label), norm(m.id)].concat(MOOD_ALIAS[m.id] || []),
    }));

    const aree = (CSok ? CS.AREE_TECNICHE : []).map(a => ({
      nome: a, alias: [norm(a)].concat(AREA_ALIAS[a] || []),
    }));

    const fond = (CSok ? CS.FONDAMENTALI : []).map(f => ({
      nome: f, alias: [norm(f)].concat(FOND_ALIAS[f] || []),
    }));

    const alimenti = (typeof window !== 'undefined' && window.FOOD_DB_DATA) || [];

    // Campi core: solo quelli che l'utente non ha nascosto
    const cfg = (CSok && CS.state.revFieldsConfig) || {};
    const core = cfg.coreVisibility || {};

    // Metriche extra attivate (predefinite + custom dell'utente)
    const extras = (CSok && CS.getEnabledFields)
      ? (CS.getEnabledFields('daily').extras || []) : [];

    return { tipi, mood, aree, fond, alimenti, core, extras };
  }

  // Sinonimi: come si dicono davvero le cose, oltre all'etichetta ufficiale
  const TIPO_ALIAS = {
    pugilato: ['boxe', 'pugilato', 'box', 'palestra di boxe', 'pugni', 'ring', 'colpi'],
    pesi:     ['sala pesi', 'pesi', 'palestra', 'sala attrezzi', 'weight', 'bilanciere',
               'manubri', 'ferri', 'panca'],
    casa:     ['casa', 'a casa', 'allenamento casa', 'home', 'in camera', 'a corpo libero'],
    corsa:    ['corsa', 'corso', 'run', 'running', 'jogging', 'corsetta', 'camminata',
               'passeggiata', 'giro di corsa', 'fondo'],
    sparring: ['sparring', 'sparr', 'guanti', 'incontro', 'match'],
    tecnica:  ['tecnica', 'solo tecnica', 'tecnico', 'riscaldamento', 'stretching',
               'defaticamento', 'mobilita', 'allungamento'],
  };
  const MOOD_ALIAS = {
    feroce: ['feroce', 'carico', 'carica', 'una bestia', 'a mille'],
    fiamme: ['in fiamme', 'fiamme', 'fuoco', 'on fire'],
    determinato: ['determinato', 'determinata', 'motivato', 'motivata', 'deciso'],
    normale: ['normale', 'cosi cosi', 'nella media', 'niente di che'],
    stanco: ['stanco', 'stanca', 'distrutto', 'morto', 'esausto', 'a pezzi', 'cotto', 'fuso'],
    frustrato: ['frustrato', 'incazzato', 'arrabbiato', 'nervoso', 'furioso'],
    senzaVoglia: ['senza voglia', 'svogliato', 'demotivato', 'controvoglia', 'senza stimoli'],
    distratto: ['distratto', 'sbadato', 'con la testa altrove'],
    ansioso: ['ansioso', 'ansia', 'agitato', 'teso'],
    concentrato: ['concentrato', 'lucido', 'focus', 'sul pezzo'],
  };
  const AREA_ALIAS = {
    'Jab': ['jab', 'sinistro', 'jeb', 'diretto sinistro'],
    'Diretto': ['diretto', 'destro', 'due', 'cross'],
    'Gancio': ['gancio', 'ganci', 'hook'],
    'Montante': ['montante', 'montanti', 'uppercut'],
    'Difesa': ['difesa', 'difese', 'guardia', 'schivate', 'schivata', 'parate', 'slip'],
    'Cambio Ritmo': ['cambio ritmo', 'ritmo', 'cambio di ritmo', 'cambi di ritmo'],
    'Distanza': ['distanza', 'misura', 'gestione della distanza'],
    'Footwork': ['footwork', 'gambe', 'piedi', 'spostamenti', 'movimento', 'passo'],
    'Combinazioni': ['combinazioni', 'combinazione', 'combo', 'serie'],
    'Potenza': ['potenza', 'forza dei colpi', 'forza', 'colpo pesante'],
    'Resistenza': ['resistenza', 'fiato', 'tenuta', 'condizione', 'gas'],
    'Velocità': ['velocita', 'rapidita', 'esplosivita', 'mani veloci'],
    'Testa': ['testa', 'mentale', 'lucidita', 'freddezza', 'concentrazione'],
  };
  // Un fondamentale non è un "tipo di allenamento", ma se dici quante ore ci hai
  // messo è comunque tempo allenato: lo si registra come sessione del tipo più vicino.
  const FOND_TO_TIPO = {
    'Sacco': 'pugilato', 'Corda': 'pugilato', 'Vuoto Normale': 'tecnica',
    'Vuoto Pesi': 'tecnica', 'Sparring': 'sparring', 'Figure': 'tecnica',
    'Palestra': 'pesi',
  };

  const FOND_ALIAS = {
    'Sacco': ['sacco', 'sacchi', 'heavy bag', 'al sacco', 'sacco pesante'],
    'Corda': ['corda', 'saltelli', 'salto della corda', 'saltare la corda', 'cordicella'],
    'Vuoto Normale': ['vuoto normale', 'vuoto', 'shadow', 'shadow boxing', 'a vuoto', 'ombra'],
    'Vuoto Pesi': ['vuoto pesi', 'vuoto con pesi', 'vuoto coi pesi'],
    'Sparring': ['sparring', 'sparr'],
    'Figure': ['figure', 'colpitori', 'guantoni', 'maestro'],
    'Palestra': ['palestra', 'sala pesi'],
  };

  // Parole chiave dei campi core della revisione
  const CORE_KEYS = {
    flessioni:  ['flessioni', 'flession', 'piegamenti', 'push up', 'pushup'],
    squat:      ['squat', 'squats'],
    addominali: ['addominali', 'addome', 'addominale', 'crunch'],
    kmCorsa:    ['corsa', 'corso', 'corse', 'run', 'running', 'jogging'],
  };

  // ─── DATA ───────────────────────────────────────────
  const GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  function iso(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // Estrae la data e restituisce anche il testo ripulito da quell'espressione,
  // così il resto del parsing non inciampa nei numeri della data.
  function extractDate(text) {
    const oggi = new Date();
    let t = text;
    let data = iso(oggi);
    let trovata = false;

    const shift = (giorni) => { const d = new Date(oggi); d.setDate(d.getDate() - giorni); return iso(d); };

    // L'ordine conta: "dopodomani" contiene "domani", "l'altro ieri" contiene
    // "ieri". Vince la prima che combacia, quindi le più lunghe stanno sopra.
    const patterns = [
      [/\bdopodomani\b/,       () => shift(-2)],
      [/\bdomani\b/,           () => shift(-1)],
      [/\bl\s*altro\s*ieri\b/, () => shift(2)],
      [/\bavantieri\b/,        () => shift(2)],
      [/\bieri\b/,             () => shift(1)],
      [/\boggi\b/,             () => shift(0)],
      [/\bstamattina\b|\bstamane\b|\bstasera\b|\bstanotte\b/, () => shift(0)],
    ];
    for (const [re, fn] of patterns) {
      if (re.test(t)) { data = fn(); t = t.replace(re, ' '); trovata = true; break; }
    }

    // "3 giorni fa", "una settimana fa", "due settimane fa", "un mese fa"
    if (!trovata) {
      const numWordRe = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
      const m = t.match(new RegExp(
        '\\b(?:(' + numWordRe + ')|(\\d{1,3}))\\s+(giorn[oi]|settiman[ae]|mes[ei])\\s+fa\\b'));
      if (m) {
        const quanti = m[1] != null ? NUM_WORDS[m[1]] : Number(m[2]);
        const passo = /^giorn/.test(m[3]) ? 1 : /^settiman/.test(m[3]) ? 7 : 30;
        data = shift(quanti * passo);
        t = t.replace(m[0], ' ');
        trovata = true;
      }
    }

    // "lunedì", "sabato" → l'occorrenza più recente nel passato
    if (!trovata) {
      const m = t.match(new RegExp('\\b(' + GIORNI.join('|') + ')\\b'));
      if (m) {
        const target = GIORNI.indexOf(m[1]);
        const d = new Date(oggi);
        let diff = (d.getDay() - target + 7) % 7;
        if (diff === 0) diff = 7;          // "lunedì" detto di lunedì = quello scorso
        d.setDate(d.getDate() - diff);
        data = iso(d); t = t.replace(m[0], ' '); trovata = true;
      }
    }

    // "il 3 agosto" / "3 agosto" / "il primo agosto" / "12 marzo 2025"
    if (!trovata) {
      const m = t.match(new RegExp(
        '\\b(primo|\\d{1,2})\\s+(' + MESI.join('|') + ')(?:\\s+(\\d{4}))?\\b'));
      if (m) {
        const giorno = m[1] === 'primo' ? 1 : Number(m[1]);
        const d = new Date(m[3] ? Number(m[3]) : oggi.getFullYear(), MESI.indexOf(m[2]), giorno);
        // Senza anno vale l'occorrenza passata: un diario racconta ciò che è
        // già successo. Con l'anno scritto si prende quello, e basta.
        if (!m[3] && d > oggi) d.setFullYear(d.getFullYear() - 1);
        data = iso(d); t = t.replace(m[0], ' '); trovata = true;
      }
    }

    // "3/8" o "03/08/2026" — con validazione dei range, altrimenti un peso
    // come "93.4" verrebbe scambiato per la data 93/4 e sparirebbe dal testo.
    if (!trovata) {
      const m = t.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/);
      if (m) {
        const gg = Number(m[1]), mm = Number(m[2]);
        const separatore = m[0].includes('/');
        // il punto è ammesso solo con l'anno esplicito: "3.8" è quasi sempre un decimale
        if (gg >= 1 && gg <= 31 && mm >= 1 && mm <= 12 && (separatore || m[3])) {
          const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : oggi.getFullYear();
          const d = new Date(y, mm - 1, gg);
          if (!isNaN(d)) { data = iso(d); t = t.replace(m[0], ' '); trovata = true; }
        }
      }
    }

    // "il 12" da solo → giorno del mese corrente (o del mese scorso se non è
    // ancora arrivato). La negazione esclude i casi in cui quel numero è una
    // quantità e non una data: "il 12 di sacco" non è il dodici del mese.
    if (!trovata) {
      const m = t.match(/\b(?:il|lo)\s+(\d{1,2})\b(?!\s*(?:min|minut|or[ae]|km|kg|g|grammi|rip|volte|flession|squat|addominal|punti|voto))/);
      if (m) {
        const gg = Number(m[1]);
        if (gg >= 1 && gg <= 31) {
          const d = new Date(oggi.getFullYear(), oggi.getMonth(), gg);
          if (d > oggi) d.setMonth(d.getMonth() - 1);
          data = iso(d); t = t.replace(m[0], ' '); trovata = true;
        }
      }
    }

    return { data, testo: t.replace(/\s+/g, ' ').trim(), esplicita: trovata };
  }

  // ─── NUMERI NEL TESTO ───────────────────────────────
  // Ritorna [{ valore, unita, start, end }] in ordine di comparsa.
  function findNumbers(t) {
    const out = [];
    const numWordRe = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
    const unitRe = [...UNIT_LOOKUP.keys()].sort((a, b) => b.length - a.length)
      .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(
      '(?:\\b(' + numWordRe + ')\\b|(\\d+(?:[.,]\\d+)?))\\s*(' + unitRe + ')?\\b', 'g');
    let m;
    while ((m = re.exec(t))) {
      const valore = m[1] != null ? NUM_WORDS[m[1]] : parseFloat(m[2].replace(',', '.'));
      if (valore == null || isNaN(valore)) continue;
      out.push({
        valore,
        unita: m[3] ? UNIT_LOOKUP.get(m[3]) : null,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    return out;
  }

  // Finestra di testo attorno a un numero: quello che lo segue fino al numero
  // successivo, più le parole che lo precedono. Serve a capire a COSA si
  // riferisce ("1 ora pugilato" vs "flessioni 60").
  function contextOf(t, nums, i) {
    const cur = nums[i];
    const prevEnd = i > 0 ? nums[i - 1].end : 0;
    const nextStart = i < nums.length - 1 ? nums[i + 1].start : t.length;
    return {
      dopo:  t.slice(cur.end, nextStart).trim(),
      prima: t.slice(prevEnd, cur.start).trim(),
      tutto: (t.slice(prevEnd, cur.start) + ' ' + t.slice(cur.end, nextStart)).trim(),
    };
  }

  // In italiano l'ordine dominante è "N cosa" ("60 flessioni", "1 ora pugilato"),
  // quindi il testo DOPO il numero ha sempre la precedenza. Quello prima serve
  // solo come ripiego ("jab voto 8", "flessioni 60"): senza questa priorità
  // "60 flessioni 80 squat" attribuirebbe "flessioni" anche all'80.
  // Vince la parola più VICINA al numero, non semplicemente quella che segue:
  // "footwork 9 e difesa 5" → il 9 è di footwork (prima, distanza 0), non di
  // difesa (dopo, distanza 1). A parità vince quella dopo, perché l'ordine
  // "N cosa" è il più comune in italiano.
  function resolve(ctx, fn) {
    const d = fn(ctx.dopo);
    const p = fn(ctx.prima);
    if (!d) return p || null;
    if (!p) return d;
    const parole = s => (s.trim() ? s.trim().split(/\s+/).length : 0);
    const distD = parole(ctx.dopo.slice(0, d.pos));
    const distP = parole(ctx.prima.slice(p.pos + (p.match || '').length));
    return distD <= distP ? d : p;
  }

  // "due ore e mezza" sono due numeri (2 e 0.5) ma un solo valore: 2.5.
  // Senza questa fusione diventerebbero due sessioni separate.
  // Stessa cosa per "un'ora e 30", che è una durata sola: 90 minuti.
  function mergeMezz(t, nums) {
    const out = [];
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i], next = nums[i + 1];
      const congiunte = next && !next.unita && /^\s*e\s*$/.test(t.slice(n.end, next.start));
      if (congiunte && next.valore === 0.5) {
        out.push({ valore: n.valore + 0.5, unita: n.unita, start: n.start, end: next.end });
        i++;                                  // consuma anche "mezza"
      } else if (congiunte && n.unita === 'h' && next.valore >= 1 && next.valore < 60) {
        // "1 ora e 30" → 90 minuti, non un'ora e poi un trenta per aria
        out.push({ valore: n.valore * 60 + next.valore, unita: 'min', start: n.start, end: next.end });
        i++;
      } else out.push(n);
    }
    return out;
  }

  // Modi di dire che nascondono un numero. Si riscrivono in forma canonica
  // PRIMA di cercare i numeri, così il resto del parser non deve saperne nulla.
  function normalizzaDurate(t) {
    return t
      .replace(/\borett[ae]\b/g, m => (m === 'orette' ? 'ore' : 'ora'))
      .replace(/\btre\s+quarti\s+d\s*ora\b/g, '45 min')
      .replace(/\b(?:un|1)\s+quarto\s+d\s*ora\b/g, '15 min')
      .replace(/\bmezz\s*ora\b/g, '30 min')
      .replace(/\bmezzora\b/g, '30 min')
      // "un'ora" diventa "un ora" dopo la normalizzazione: qui torna un numero
      .replace(/\bun\s+ora\b/g, '1 ora');
  }

  const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Confine di parola tollerante alla punteggiatura: senza questo,
  // "di pugilato," non verrebbe riconosciuto per colpa della virgola.
  const BOUND_L = '(^|[\\s,;.:!?()-])';
  const BOUND_R = '([\\s,;.:!?()-]|$)';
  function wordRe(w) { return new RegExp(BOUND_L + escRe(w) + BOUND_R); }

  // In italiano il plurale cambia l'ultima vocale ("gancio" → "ganci",
  // "sacco" → "sacchi"): confrontando le radici, un alias scritto al singolare
  // riconosce anche il plurale senza doverli elencare tutti.
  const IRREGOLARI = { uova: 'uovo', dita: 'dito', braccia: 'braccio', ginocchia: 'ginocchio' };
  function radice(p) {
    const w = IRREGOLARI[p] || p;
    return w.replace(/(chi|che|ghi|ghe)$/, 'c')   // sacchi → sac, panche → panc
            .replace(/[aeio]$/, '');              // ganci → ganc, gancio → ganci→ganc
  }

  /** Le parole del testo che hanno la stessa radice della voce cercata. */
  function stessaRadice(testo, alias) {
    if (alias.length < 4 || alias.includes(' ')) return null;
    const r = radice(alias);
    if (r.length < 3) return null;
    const re = new RegExp(BOUND_L + escRe(r) + '[a-z]{0,3}' + BOUND_R);
    const m = testo.match(re);
    if (!m) return null;
    return { pos: m.index + m[1].length, match: m[0].trim() };
  }

  // Cerca l'alias più specifico presente nel testo.
  // Ritorna { voce, match, pos } dove pos è l'inizio REALE della parola.
  function findVoce(testo, voci) {
    let best = null;
    let ripiego = null;                    // per radice: vale solo se non c'è di meglio
    for (const v of voci) {
      for (const a of v.alias) {
        if (!a) continue;
        const m = testo.match(wordRe(a));
        if (m) {
          const pos = m.index + m[1].length;
          if (!best || a.length > best.match.length) best = { voce: v, match: a, pos };
          continue;
        }
        if (best) continue;
        const r = stessaRadice(testo, a);
        if (r && (!ripiego || a.length > ripiego.match.length)) {
          ripiego = { voce: v, match: r.match, pos: r.pos };
        }
      }
    }
    return best || ripiego;
  }

  // Cerca una parola chiave SOLO se è a ridosso del numero. Serve contro le
  // catture a distanza: in "80 squat, ho dormito 8 ore" la parola "dormito"
  // è nella finestra dell'80 ma non lo riguarda.
  function kwNear(ctx, keys, maxDist = 1) {
    const parole = s => (s.trim() ? s.trim().split(/\s+/).length : 0);
    for (const k of keys) {
      const md = ctx.dopo.match(wordRe(k));
      if (md && parole(ctx.dopo.slice(0, md.index + md[1].length)) <= maxDist) return k;
      const mp = ctx.prima.match(wordRe(k));
      if (mp && parole(ctx.prima.slice(mp.index + mp[1].length + k.length)) <= maxDist) return k;
    }
    return null;
  }

  const KW_SESSIONE = ['sessione', 'sessioni', 'seduta', 'sedute', 'allenamento', 'allenamenti'];
  // Verbi che raccontano un allenamento fatto: bastano a creare una sessione
  // anche quando non è stato detto nessun numero ("oggi ho fatto sparring").
  const KW_FATTO = /\b(ho fatto|fatto|ho tirato|tirato|mi sono allenato|allenato|ho fatto una sessione di|seduta di)\b/;
  const KW_SONNO = ['dormito', 'dormite', 'dormita', 'sonno', 'notte', 'riposato'];
  const KW_PESO  = ['peso', 'pesato', 'pesata', 'bilancia', 'peso corporeo'];

  function findCore(testo) {
    let best = null;
    for (const [campo, keys] of Object.entries(CORE_KEYS)) {
      for (const k of keys) {
        const m = testo.match(wordRe(k));
        if (m && (!best || k.length > best.match.length)) {
          best = { campo, match: k, pos: m.index + m[1].length };
        }
      }
    }
    return best;
  }

  // ─── ALIMENTI ───────────────────────────────────────
  function findAlimento(testo, alimenti) {
    if (!alimenti.length) return null;
    const t = norm(testo);
    let best = null;
    for (const a of alimenti) {
      const n = norm(a.nome);
      let score = 0;
      if (t === n) score = 100;
      else if (wordRe(n).test(t)) score = 80 + n.length;
      else {
        // il nome del cibo contiene una parola del testo ("pollo" → "Petto di pollo")
        const parole = t.split(/[\s,;.]+/).filter(w => w.length > 3);
        for (const w of parole) {
          if (wordRe(w).test(n)) {
            score = Math.max(score, 40 + w.length - n.split(' ').length);
          }
        }
      }
      if (score > 0 && (!best || score > best.score)) best = { alimento: a, score };
    }
    if (!best) return null;
    // alternative con punteggio vicino → l'utente potrà scegliere in conferma
    const alt = alimenti.filter(a => {
      if (a.nome === best.alimento.nome) return false;
      const n = norm(a.nome);
      return t.split(/[\s,;.]+/).filter(w => w.length > 3).some(w => wordRe(w).test(n));
    }).slice(0, 5).map(a => a.nome);
    return { alimento: best.alimento, alternative: alt };
  }

  function macrosPer(alimento, grammi) {
    const f = grammi / 100;
    return {
      kcal: Math.round((alimento.kcal || 0) * f),
      pro:  +(((alimento.pro  || 0) * f).toFixed(1)),
      carb: +(((alimento.carb || 0) * f).toFixed(1)),
      fat:  +(((alimento.fat  || 0) * f).toFixed(1)),
    };
  }

  // ─── PARSE ──────────────────────────────────────────
  function parse(testoOriginale) {
    const V = buildVocab();
    const grezzo = normalizzaDurate(norm(testoOriginale));
    const { data, testo } = extractDate(grezzo);

    const intents = [];
    const consumati = [];              // span [start,end] già interpretati
    const usati = new Set();           // indici di numeri già assorbiti da un'altra regola
    const nums = mergeMezz(testo, findNumbers(testo));

    const pushIntent = (it, span) => {
      intents.push(it);
      if (span) consumati.push(span);
    };

    // Indica che si parla di cibo (attiva l'interpretazione dei grammi)
    const contestoCibo = /\bmangiat|\bpranzo\b|\bcena\b|\bcolazione\b|\bspuntino\b|\bmerenda\b|\bpasto\b|\bmangio\b/.test(testo);
    const tipoPasto = /\bcolazione\b/.test(testo) ? 'colazione'
                    : /\bpranzo\b/.test(testo) ? 'pranzo'
                    : /\bcena\b/.test(testo) ? 'cena'
                    : /\bspuntino\b|\bmerenda\b/.test(testo) ? 'spuntino' : 'pranzo';

    for (let i = 0; i < nums.length; i++) {
      if (usati.has(i)) continue;        // già assorbito (es. la durata di "3 sessioni da 45 min")
      const n = nums[i];
      const ctx = contextOf(testo, nums, i);
      const span = [n.start, n.end];

      // ── QUANTE SESSIONI ──
      // "una sessione di allenamento", "due sessioni di pugilato",
      // "tre sessioni da 45 min". Il numero conta le sessioni, non le ore.
      if (!n.unita && Number.isInteger(n.valore) && n.valore >= 1 && n.valore <= 10 &&
          kwNear(ctx, KW_SESSIONE, 2)) {
        const tipo = resolve(ctx, s => findVoce(s, V.tipi));
        // "da 45 min" più avanti nella frase: è la durata di ognuna
        let minuti = 0;
        for (let k = i + 1; k < nums.length; k++) {
          if (nums[k].unita === 'h' || nums[k].unita === 'min') {
            minuti = inMin(nums[k]);
            usati.add(k);
            consumati.push([nums[k].start, nums[k].end]);
            break;
          }
        }
        for (let s = 0; s < n.valore; s++) {
          pushIntent({
            target: 'sessione', campo: tipo ? tipo.voce.id : '', valore: minuti, unita: 'min',
            durata: true, sub: leggibile(minuti),
            label: 'Sessione' + (tipo ? ' · ' + tipo.voce.label : ''),
            icona: tipo ? tipo.voce.icon : '🥊',
            confidenza: minuti ? 'alta' : 'media',
          }, s === 0 ? span : null);
        }
        continue;
      }

      // ── VOTO su area o fondamentale ──
      // "velocità voto 7" / "voto 7 al sacco" / "sacco 8 su 10"
      // Un voto non ha unità (o ha "voto"/"punti"): se il numero porta ore,
      // minuti, kg, grammi o km NON è un voto, anche se la parola "voto"
      // compare altrove nella frase ("1 ora di sacco e voto 8 al jab").
      const puoEssereVoto = !n.unita || n.unita === 'pt';
      const parlaDiVoto = n.unita === 'pt' || !!kwNear(ctx, ['voto', 'punti', 'su dieci'], 2);
      if (puoEssereVoto && (parlaDiVoto || (n.valore >= 0 && n.valore <= 10))) {
        const area = resolve(ctx, s => findVoce(s, V.aree));
        const fond = resolve(ctx, s => findVoce(s, V.fond));
        // Se il testo contiene sia un'area sia un fondamentale (es. "voto 8 al
        // jab" con "sacco" nella stessa frase) vince quello più vicino al numero;
        // a parità, l'alias più specifico.
        const parole = s => (s.trim() ? s.trim().split(/\s+/).length : 0);
        const dist = (r) => {
          if (!r) return Infinity;
          const inDopo = ctx.dopo.match(wordRe(r.match));
          if (inDopo) return parole(ctx.dopo.slice(0, inDopo.index + inDopo[1].length));
          const inPrima = ctx.prima.match(wordRe(r.match));
          if (inPrima) return parole(ctx.prima.slice(inPrima.index + inPrima[1].length + r.match.length));
          return Infinity;
        };
        let scelta = null;
        if (area && fond) {
          const da = dist(area), df = dist(fond);
          scelta = da !== df ? (da < df ? 'area' : 'fond')
                             : (area.match.length >= fond.match.length ? 'area' : 'fond');
        } else scelta = area ? 'area' : fond ? 'fond' : null;
        if (scelta && n.valore >= 0 && n.valore <= 10) {
          const nome = scelta === 'area' ? area.voce.nome : fond.voce.nome;
          pushIntent({
            target: scelta === 'area' ? 'areeVoti' : 'fondVoti',
            campo: nome, valore: n.valore, unita: '/10',
            label: (scelta === 'area' ? 'Voto area · ' : 'Voto fondamentale · ') + nome,
            icona: scelta === 'area' ? '🎯' : '💪',
            confidenza: parlaDiVoto ? 'alta' : 'media',
          }, span);
          continue;
        }
      }

      // ── PESO CORPOREO ──
      if (n.unita === 'kg' && kwNear(ctx, KW_PESO, 2)) {
        pushIntent({
          target: 'pesate', campo: 'kg', valore: n.valore, unita: 'kg',
          label: 'Peso corporeo', icona: '⚖️', confidenza: 'alta',
        }, span);
        continue;
      }

      // ── SONNO ──
      if ((n.unita === 'h' || n.unita === 'min' || !n.unita) && kwNear(ctx, KW_SONNO, 1)) {
        const min = inMin(n);
        pushIntent({
          target: 'sonno', campo: 'ore', valore: min, unita: 'min', durata: true,
          label: 'Sonno', sub: leggibile(min), icona: '🌙', confidenza: 'alta',
        }, span);
        continue;
      }

      // ── CIBO: grammi di un alimento ──
      if (n.unita === 'g' || (contestoCibo && !n.unita)) {
        const found = findAlimento(ctx.dopo || ctx.tutto, V.alimenti);
        if (found) {
          const m = macrosPer(found.alimento, n.valore);
          pushIntent({
            target: 'pasti', campo: found.alimento.nome, valore: n.valore, unita: 'g',
            tipoPasto,
            alimento: found.alimento, alternative: found.alternative, macros: m,
            label: `${found.alimento.nome} · ${n.valore}g`,
            sub: `${m.kcal} kcal · ${m.pro}g pro · ${m.carb}g carb · ${m.fat}g gr`,
            icona: '🍽', confidenza: found.alternative.length ? 'media' : 'alta',
          }, span);
          continue;
        }
      }

      // ── CORSA in km ──
      if (n.unita === 'km') {
        pushIntent({
          target: 'corsa', campo: 'km', valore: n.valore, unita: 'km',
          label: 'Corsa', icona: '🏃', confidenza: 'alta',
        }, span);
        continue;
      }

      // ── DURATE: sessione di un tipo, oppure totale allenamento ──
      if (n.unita === 'h' || n.unita === 'min') {
        const minuti = inMin(n);

        // metrica extra attivata dall'utente (es. "20 minuti meditazione")
        const extra = V.extras.find(e => wordRe(norm(e.label)).test(ctx.dopo || ctx.tutto));
        if (extra) {
          const eDurata = extra.unit === 'h';
          pushIntent({
            target: 'revisione', campo: extra.key,
            valore: eDurata ? minuti : n.valore,
            unita: eDurata ? 'min' : (extra.unit || ''),
            durata: eDurata, sub: eDurata ? leggibile(minuti) : '',
            label: extra.label, icona: extra.icon || '📌', confidenza: 'alta',
          }, span);
          continue;
        }

        const tipo = resolve(ctx, s => findVoce(s, V.tipi));
        const generico = /\ballenament|\btotale\b|\bmi sono allenato\b/.test(ctx.dopo || ctx.tutto);

        if (tipo) {
          pushIntent({
            target: 'sessione', campo: tipo.voce.id, valore: minuti, unita: 'min',
            durata: true, sub: leggibile(minuti),
            label: 'Sessione · ' + tipo.voce.label, icona: tipo.voce.icon, confidenza: 'alta',
          }, span);
          continue;
        }

        // Durata riferita a un FONDAMENTALE ("30 minuti di corda", "1 ora di sacco"):
        // è comunque tempo di allenamento, lo si registra come sessione del tipo
        // più vicino, dichiarandolo nell'etichetta.
        const f = resolve(ctx, s => findVoce(s, V.fond));
        if (f) {
          const tipoId = FOND_TO_TIPO[f.voce.nome] || 'tecnica';
          const t = V.tipi.find(x => x.id === tipoId) || { id: tipoId, label: tipoId, icon: '🥊' };
          pushIntent({
            target: 'sessione', campo: t.id, valore: minuti, unita: 'min',
            durata: true, sub: leggibile(minuti),
            label: `Sessione · ${t.label} (${f.voce.nome.toLowerCase()})`,
            icona: t.icon, confidenza: 'media',
          }, span);
          continue;
        }

        if (generico || /\ballenament|\btotale\b/.test(ctx.tutto)) {
          pushIntent({
            target: 'revisione', campo: 'oreAllenamento', valore: minuti, unita: 'min',
            durata: true, sub: leggibile(minuti),
            label: 'Allenamento (totale)', icona: '⏱', confidenza: 'alta',
          }, span);
          continue;
        }
      }

      // ── VOLUME DI CONDIZIONAMENTO ──
      const core = resolve(ctx, s => findCore(s));
      if (core && V.core[core.campo] !== false) {
        if (core.campo === 'kmCorsa') {
          pushIntent({
            target: 'corsa', campo: 'km', valore: n.valore, unita: 'km',
            label: 'Corsa', icona: '🏃', confidenza: 'media',
          }, span);
        } else {
          pushIntent({
            target: 'revisione', campo: core.campo, valore: n.valore, unita: 'rip',
            label: core.campo.charAt(0).toUpperCase() + core.campo.slice(1),
            icona: { flessioni: '💪', squat: '🦵', addominali: '🔥' }[core.campo] || '⚡',
            confidenza: 'alta',
          }, span);
        }
        continue;
      }
    }

    // ── SESSIONE SENZA NUMERI ──
    // "oggi ho fatto sparring": non c'è nessuna cifra, ma un allenamento c'è.
    // Nasce a durata vuota, che l'anteprima chiede di riempire — meglio di
    // inventare un'ora che non hai fatto.
    const giaAllenamento = intents.some(x =>
      x.target === 'sessione' || (x.target === 'revisione' && x.campo === 'oreAllenamento'));
    if (!giaAllenamento && KW_FATTO.test(testo)) {
      const t = findVoce(testo, V.tipi);
      const f = t ? null : findVoce(testo, V.fond);
      const voce = t ? t.voce
                     : f ? (V.tipi.find(x => x.id === (FOND_TO_TIPO[f.voce.nome] || 'tecnica')) || null)
                         : null;
      if (voce) {
        pushIntent({
          target: 'sessione', campo: voce.id, valore: 0, unita: 'min',
          durata: true, sub: leggibile(0),
          label: 'Sessione · ' + voce.label + (f ? ` (${f.voce.nome.toLowerCase()})` : ''),
          icona: voce.icon, confidenza: 'media',
        }, null);
      }
    }

    // ── MOOD (non ha numeri: si cerca su tutto il testo) ──
    const moodTrovati = V.mood.filter(m =>
      m.alias.some(a => a && wordRe(a).test(testo)));
    for (const m of moodTrovati) {
      // "sparring" non deve diventare mood, e simili: i mood sono aggettivi
      pushIntent({
        target: 'revisione', campo: 'mood', valore: m.id, unita: '',
        label: 'Umore · ' + m.label, icona: m.icon, confidenza: 'media',
      }, null);
    }

    // ── COSA NON È STATO CAPITO ──
    // Tolgo dal testo le parti interpretate e i riempitivi; ciò che avanza
    // e ha senso viene mostrato all'utente come "non riconosciuto".
    const nonRiconosciuto = residuo(testo, consumati, intents);

    return { data, intents, nonRiconosciuto, testoOriginale };
  }

  const RIEMPITIVI = new Set(('oggi ieri ho fatto poi e ed di del della dei al alla a in con per ' +
    'mi sono allenato allenata stato stata anche circa tipa tipo un uno una il lo la i gli le ' +
    'più piu meno che quindi ma però pero cosa niente nulla su da come dopo prima molto poco ' +
    'aggiungi metti segna registra nota scrivi voto punti totale minuti ore ora grammi kg km ' +
    'mangiato mangio pranzo cena colazione spuntino merenda pasto dormito sonno notte peso ' +
    'pesato bilancia allenamento allenamenti sessione sessioni').split(' '));

  function residuo(testo, consumati, intents) {
    // maschera le porzioni numeriche già usate
    let t = testo;
    consumati.sort((a, b) => b[0] - a[0]).forEach(([s, e]) => {
      t = t.slice(0, s) + ' '.repeat(e - s) + t.slice(e);
    });
    // togli i termini che hanno generato un intent
    for (const it of intents) {
      const termini = [it.campo, it.label, it.alimento && it.alimento.nome]
        .filter(x => typeof x === 'string');
      for (const term of termini) {
        for (const w of norm(term).split(' ')) {
          if (w.length > 2) t = t.replace(new RegExp('(^|\\s)' + w + '(?=\\s|$)', 'g'), ' ');
        }
      }
    }
    // togli anche gli alias dei cataloghi che compaiono (es. "sala pesi")
    const V = buildVocab();
    [...V.tipi, ...V.mood].forEach(v => v.alias.forEach(a => {
      if (a && a.length > 2) t = t.replace(new RegExp('(^|\\s)' + a + '(?=\\s|$)', 'g'), ' ');
    }));
    [...V.aree, ...V.fond].forEach(v => v.alias.forEach(a => {
      if (a && a.length > 2) t = t.replace(new RegExp('(^|\\s)' + a + '(?=\\s|$)', 'g'), ' ');
    }));

    return t.split(/[,;.\n]|\s-\s/)
      .map(f => f.split(' ').filter(w => w && !RIEMPITIVI.has(w) && !/^\d+[.,]?\d*$/.test(w)).join(' ').trim())
      .filter(f => f.length > 2)
      .slice(0, 6);
  }

  // ─── APPLICAZIONE ───────────────────────────────────
  // Trasforma gli intent in scritture reali, riusando SOLO le CRUD esistenti.
  function apply(data, intents) {
    if (typeof CS === 'undefined') return { ok: 0, err: ['CS non disponibile'] };
    const err = [];
    let ok = 0;

    // Le modifiche alla revisione giornaliera si accumulano e si scrivono in
    // un colpo solo: addRevisione fa upsert per data e sovrascriverebbe.
    const rev = Object.assign({}, CS.getRevByDate(data) || { data });
    rev.data = data;
    let revTocca = false;

    for (const it of intents) {
      try {
        switch (it.target) {
          case 'revisione':
            if (it.campo === 'mood') {
              rev.mood = [...new Set([...(rev.mood || []), it.valore])];
            } else {
              rev[it.campo] = valoreScritto(it);
            }
            revTocca = true; ok++;
            break;

          case 'sessione': {
            rev.dettagliSessioni = rev.dettagliSessioni || [];
            rev.dettagliSessioni.push({ ore: valoreScritto(it), tipo: it.campo });
            rev.sessioniGiorno = rev.dettagliSessioni.length;
            rev.tipo = [...new Set(rev.dettagliSessioni.map(s => s.tipo))];
            revTocca = true; ok++;
            break;
          }

          case 'pesate':
            CS.addPesata({ data, kg: it.valore, note: 'da assistente' });
            ok++; break;

          case 'sonno':
            CS.addSonno({ data, ore: valoreScritto(it), qualita: 3, note: 'da assistente' });
            ok++; break;

          case 'corsa':
            CS.addCorsa({ data, tipo: 'lento', km: it.valore, durataMin: 0, note: 'da assistente' });
            rev.kmCorsa = (Number(rev.kmCorsa) || 0) + it.valore;
            revTocca = true; ok++;
            break;

          case 'areeVoti':
            CS.addAreaVoto({ data, area: it.campo, voto: it.valore, note: 'da assistente' });
            ok++; break;

          case 'fondVoti':
            CS.addFondVoto({ data, esercizio: it.campo, voto: it.valore, note: 'da assistente' });
            ok++; break;

          case 'pasti': {
            const a = it.alimento;
            CS.addPasto({
              data, ora: '', tipo: it.tipoPasto || 'pranzo',
              alimenti: [{
                nome: a.nome, g: it.valore,
                kcal: it.macros.kcal, pro: it.macros.pro,
                carb: it.macros.carb, fat: it.macros.fat,
              }],
            });
            ok++; break;
          }

          default:
            err.push('target sconosciuto: ' + it.target);
        }
      } catch (e) {
        err.push((it.label || it.target) + ': ' + e.message);
      }
    }

    if (revTocca) {
      // ore totali: se non dichiarate esplicitamente, sono la somma delle sessioni
      if (Array.isArray(rev.dettagliSessioni) && rev.dettagliSessioni.length) {
        const somma = rev.dettagliSessioni.reduce((s, x) => s + (Number(x.ore) || 0), 0);
        if (!rev.oreAllenamento || somma > rev.oreAllenamento) {
          rev.oreAllenamento = +somma.toFixed(2);
        }
      }
      CS.addRevisione(rev);
    }
    return { ok, err };
  }

  return { parse, apply, buildVocab, norm, macrosPer, findAlimento, _findNumbers: findNumbers };

})();
