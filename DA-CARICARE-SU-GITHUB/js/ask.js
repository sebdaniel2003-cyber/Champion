/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — ASK (domande sui tuoi numeri)
   "quante flessioni ho fatto ieri / la scorsa settimana / a settembre?"
   Solo lettura: legge le revisioni, le pesate, il log corsa e gli obiettivi
   già salvati. Non scrive niente e non inventa niente: un giorno senza
   revisione vale 0 e la risposta lo dice.

   ASK.rispondi(testo) → { ok, domanda, periodo, righe, obiettivi, note, suggerimenti }
   ═══════════════════════════════════════════════════════ */

const ASK = (function () {

  // ─── utilità date (tutto in ora LOCALE) ─────────────
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunedi = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const giorniTra = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const etichettaGiorno = (s) => { const d = parse(s); return `${GIORNI[d.getDay()].slice(0, 3)} ${d.getDate()}/${d.getMonth() + 1}`; };
  const fmtData = (s) => { const d = parse(s); return `${d.getDate()} ${MESI[d.getMonth()].slice(0, 3)}`; };

  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, ' ').replace(/[?!.,;:()]/g, ' ').replace(/\s+/g, ' ').trim();

  // ─── PERIODO ────────────────────────────────────────
  // Ritorna { da, a, label, kind, esplicito, prec } — `prec` è il periodo
  // precedente di pari lunghezza (per il confronto), null se non ha senso.
  function periodo(t, oggi) {
    const mk = (da, a, label, kind, prec) => ({ da, a, label, kind, esplicito: true, prec: prec || null });
    let m;

    if ((m = t.match(/ultim[ei]\s+(\d+)\s+(giorn|settiman|mes)/))) {
      const n = Math.max(1, Number(m[1]));
      const gg = m[2] === 'giorn' ? n : m[2] === 'settiman' ? n * 7 : n * 30;
      const da = addDays(oggi, -(gg - 1));
      return mk(da, oggi, `ultimi ${n} ${m[2] === 'giorn' ? 'giorni' : m[2] === 'settiman' ? 'settimane' : 'mesi'}`, 'ultimi',
        { da: addDays(da, -gg), a: addDays(da, -1) });
    }
    if (/ultim[oa]\s+settimana/.test(t)) return mk(addDays(oggi, -6), oggi, 'ultimi 7 giorni', 'ultimi', { da: addDays(oggi, -13), a: addDays(oggi, -7) });
    if (/ultimo\s+mese/.test(t)) return mk(addDays(oggi, -29), oggi, 'ultimi 30 giorni', 'ultimi', { da: addDays(oggi, -59), a: addDays(oggi, -30) });

    if ((m = t.match(/(\d+)\s+giorn\w*\s+fa/))) { const d = addDays(oggi, -Number(m[1])); return mk(d, d, `${etichettaGiorno(d)}`, 'giorno'); }
    if (/\baltro ?ieri\b|\bl altro ieri\b/.test(t)) { const d = addDays(oggi, -2); return mk(d, d, `l'altro ieri (${etichettaGiorno(d)})`, 'giorno'); }
    if (/\bieri\b/.test(t)) { const d = addDays(oggi, -1); return mk(d, d, `ieri (${etichettaGiorno(d)})`, 'giorno'); }
    if (/\boggi\b/.test(t)) return mk(oggi, oggi, `oggi (${etichettaGiorno(oggi)})`, 'giorno');

    const sett = (lun, label) => mk(lun, addDays(lun, 6), label, 'settimana', { da: addDays(lun, -7), a: addDays(lun, -1) });
    if (/(scors[ao] settimana|settimana scors[ao]|settimana passata|passata settimana)/.test(t)) {
      const lun = addDays(lunedi(oggi), -7); return sett(lun, `settimana scorsa (${fmtData(lun)} → ${fmtData(addDays(lun, 6))})`);
    }
    if ((m = t.match(/(\d+)\s+settimane?\s+fa/))) {
      const lun = addDays(lunedi(oggi), -7 * Number(m[1])); return sett(lun, `${m[1]} settimane fa (${fmtData(lun)} → ${fmtData(addDays(lun, 6))})`);
    }
    if (/(questa settimana|settimana corrente|in settimana|della settimana)/.test(t)) {
      const lun = lunedi(oggi); return sett(lun, `questa settimana (${fmtData(lun)} → ${fmtData(addDays(lun, 6))})`);
    }

    const meseP = (y, mo, label) => {
      const da = `${y}-${p2(mo + 1)}-01`;
      const a = iso(new Date(y, mo + 1, 0));
      const pm = new Date(y, mo - 1, 1);
      return mk(da, a, label, 'mese', { da: iso(pm), a: iso(new Date(pm.getFullYear(), pm.getMonth() + 1, 0)) });
    };
    const now = parse(oggi);
    if (/(scors[ao] mese|mese scors[ao]|mese passato|passato mese)/.test(t)) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return meseP(d.getFullYear(), d.getMonth(), `${MESI[d.getMonth()]} ${d.getFullYear()} (mese scorso)`);
    }
    if (/(questo mese|mese corrente|in questo mese)/.test(t)) return meseP(now.getFullYear(), now.getMonth(), `${MESI[now.getMonth()]} ${now.getFullYear()} (questo mese)`);
    for (let i = 0; i < 12; i++) {
      if (new RegExp(`\\b${MESI[i]}\\b`).test(t)) {
        const ym = t.match(/\b(20\d\d)\b/);
        const y = ym ? Number(ym[1]) : (i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear());
        return meseP(y, i, `${MESI[i]} ${y}`);
      }
    }

    if (/(scors[ao] anno|anno scors[ao]|anno passato)/.test(t)) {
      const y = now.getFullYear() - 1;
      return mk(`${y}-01-01`, `${y}-12-31`, `${y}`, 'anno', { da: `${y - 1}-01-01`, a: `${y - 1}-12-31` });
    }
    if (/(quest anno|questo anno|anno corrente|dall inizio dell anno)/.test(t) || new RegExp(`\\b${now.getFullYear()}\\b`).test(t)) {
      const y = now.getFullYear();
      return mk(`${y}-01-01`, oggi, `${y} (da inizio anno)`, 'anno', { da: `${y - 1}-01-01`, a: `${y - 1}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}` });
    }
    if (/(sempre|in totale|totale|complessiv|dall inizio)/.test(t)) {
      const primo = ((CS.state.revisioni || []).map(r => r.data).filter(Boolean).sort()[0]) || oggi;
      return mk(primo, oggi, `da sempre (dal ${fmtData(primo)})`, 'sempre');
    }

    for (let i = 0; i < 7; i++) {
      const nome = norm(GIORNI[i]);
      if (new RegExp(`\\b${nome}\\b`).test(t)) {
        let d = oggi;
        const scorso = /scors[ao]|passato/.test(t);
        for (let k = scorso ? 1 : 0; k < 14; k++) { const c = addDays(oggi, -k); if (parse(c).getDay() === i) { d = c; break; } }
        return mk(d, d, `${GIORNI[i]} ${fmtData(d)}`, 'giorno');
      }
    }

    const lun = lunedi(oggi);
    return { da: lun, a: addDays(lun, 6), label: `questa settimana (${fmtData(lun)} → ${fmtData(addDays(lun, 6))})`, kind: 'settimana', esplicito: false,
      prec: { da: addDays(lun, -7), a: addDays(lun, -1) } };
  }

  // ─── METRICHE ───────────────────────────────────────
  // somma: totali; media: media sui giorni che hanno il dato.
  const METRICHE = {
    flessioni:  { label: 'Flessioni',  ico: '💪', unit: '',    tipo: 'somma', cat: 'flessioni', f: (r) => Number(r.flessioni) || 0 },
    squat:      { label: 'Squat',      ico: '🦵', unit: '',    tipo: 'somma', cat: 'squat',     f: (r) => Number(r.squat) || 0 },
    addominali: { label: 'Addominali', ico: '🔥', unit: '',    tipo: 'somma', cat: 'addominali', f: (r) => Number(r.addominali) || 0 },
    corsa:      { label: 'Corsa',      ico: '🏃', unit: 'km',  tipo: 'somma', cat: 'km',        dec: 1, f: (r, d, ctx) => (Number(r && r.kmCorsa) || 0) + (ctx.corsaLog[d] || 0) },
    ore:        { label: 'Ore di allenamento', ico: '⏱', unit: 'h', tipo: 'somma', cat: 'ore', dec: 1, f: (r) => Number(r.oreAllenamento) || 0 },
    sessioni:   { label: 'Sessioni',   ico: '🥊', unit: '',    tipo: 'somma', cat: 'sessioni',
                  f: (r) => (r && !r.riposo && (Number(r.oreAllenamento) || 0) > 0) ? (Array.isArray(r.dettagliSessioni) && r.dettagliSessioni.length ? r.dettagliSessioni.length : (Number(r.sessioniGiorno) || 1)) : 0 },
    giorni:     { label: 'Giorni allenati', ico: '🗓', unit: '', tipo: 'somma', f: (r) => (r && !r.riposo && (Number(r.oreAllenamento) || 0) > 0) ? 1 : 0 },
    riposo:     { label: 'Giorni di riposo', ico: '🛌', unit: '', tipo: 'somma', f: (r) => (r && r.riposo) ? 1 : 0 },
    sonno:      { label: 'Sonno',      ico: '😴', unit: 'h',   tipo: 'media', dec: 1, f: (r, d, ctx) => Number(r && r.sonnoOre) || ctx.sonnoLog[d] || null },
    tecnica:    { label: 'Voto tecnica', ico: '🎯', unit: '/10', tipo: 'media', dec: 1, f: (r) => Number(r && r.tecnica) || null },
    intensita:  { label: 'Intensità',  ico: '🔥', unit: '/10', tipo: 'media', dec: 1, f: (r) => Number(r && r.intensita) || null },
    affaticamento: { label: 'Affaticamento', ico: '🥵', unit: '/10', tipo: 'media', dec: 1, f: (r) => Number(r && r.affaticamento) || null },
    lettura:    { label: 'Lettura',    ico: '📖', unit: 'min', tipo: 'somma', f: (r) => Number(r && r.letturaMin) || 0 },
  };
  const RIEPILOGO = ['giorni', 'ore', 'flessioni', 'squat', 'addominali', 'corsa', 'sonno', 'affaticamento'];

  // parole chiave → metrica (ordine = priorità; più metriche nella stessa frase vengono tutte restituite)
  const KW = [
    ['flessioni', /fless/], ['squat', /squat/], ['addominali', /addomin|addome|crunch/],
    ['corsa', /\b(corsa|corse|km|chilometri|corso|corsi|corro|corsetta)\b/],
    ['sonno', /dorm|sonno|riposat[oa] bene/], ['tecnica', /tecnic|voto|voti/],
    ['affaticamento', /fatica|stanchezz|affatic|stanco/], ['intensita', /intensit/],
    ['lettura', /lettur|letto|leggere/],
    ['riposo', /giorni? di riposo|riposat[oi]|riposo/],
    ['sessioni', /session/],
    ['giorni', /allenament|allenat|giorni? di (allenamento|palestra)/],
    ['ore', /\bore\b|tempo (di )?allen|quanto (tempo )?mi sono allenat/],
  ];

  function metriche(t) {
    const out = [];
    KW.forEach(([k, re]) => { if (re.test(t) && !out.includes(k)) out.push(k); });
    // "allenamenti" porta sia i giorni sia le ore: più utile della sola parola
    if (out.includes('giorni') && !out.includes('ore') && !out.includes('sessioni')) out.push('ore');
    return out;
  }

  // ─── DATI ───────────────────────────────────────────
  function contesto() {
    const S = CS.state || {};
    const revBy = new Map();
    (S.revisioni || []).forEach(r => { if (r && r.data) revBy.set(r.data, r); });
    const corsaLog = {};
    (S.corsa || []).forEach(c => { if (c && c.data) corsaLog[c.data] = (corsaLog[c.data] || 0) + (Number(c.km) || 0); });
    const sonnoLog = {};
    (S.sonno || []).forEach(x => { if (x && x.data && Number(x.ore) > 0) sonnoLog[x.data] = Number(x.ore); });
    return { revBy, corsaLog, sonnoLog, S };
  }

  function valori(ctx, key, da, a, oggi) {
    const M = METRICHE[key];
    const fine = a > oggi ? oggi : a;
    const perGiorno = [];
    for (let d = da; d <= fine; d = addDays(d, 1)) {
      const r = ctx.revBy.get(d) || null;
      let v;
      try { v = M.f(r, d, ctx); } catch (e) { v = null; }
      perGiorno.push({ iso: d, val: v, rev: !!r });
    }
    return perGiorno;
  }

  function aggrega(M, perGiorno) {
    const vals = perGiorno.map(g => g.val).filter(v => v != null && !(M.tipo === 'media' && !(v > 0)));
    if (M.tipo === 'media') {
      return { totale: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null, n: vals.length };
    }
    return { totale: perGiorno.reduce((x, g) => x + (Number(g.val) || 0), 0), n: vals.length };
  }

  // Obiettivo corrispondente al periodo, solo se il periodo è esattamente una scadenza
  // calcolata dall'app (giorno, settimana ISO, mese, anno).
  function chiavePeriodoObiettivo(p) {
    if (p.kind === 'giorno') return { scadenza: 'giornaliero', periodo: p.da };
    if (p.kind === 'settimana') return { scadenza: 'settimanale', periodo: CS.weekKey(parse(p.da)) };
    if (p.kind === 'mese') return { scadenza: 'mensile', periodo: p.da.slice(0, 7) };
    if (p.kind === 'anno' && p.da.endsWith('-01-01')) return { scadenza: 'annuale', periodo: p.da.slice(0, 4) };
    return null;
  }

  function obiettiviDel(p) {
    const k = chiavePeriodoObiettivo(p);
    if (!k) return null;
    return (CS.state.obiettivi || [])
      .filter(o => o && o.scadenza === k.scadenza && o.periodo === k.periodo && Number(o.target) > 0)
      .map(o => {
        let cur = 0, pct = 0;
        try { const pr = CALC.progressObiettivo(o); cur = pr.current; pct = pr.pct; } catch (e) { /* obiettivo non calcolabile */ }
        return { id: o.id, nome: o.descrizione || o.categoria, categoria: o.categoria, unita: o.unita || '', target: Number(o.target), cur, pct, scadenza: o.scadenza, auto: !!o.auto };
      });
  }

  // ─── PERCHÉ SONO CALATO ─────────────────────────────
  // Non è una prova di causa: mette a confronto due finestre di pari lunghezza
  // (le ultime e quelle subito prima), dice cosa è sceso e cosa, nello stesso
  // periodo, è cambiato nei dati che registri. Le coincidenze si leggono come
  // indizi. Se i dati non bastano o non c'è un legame chiaro, lo dice.
  const RE_PERCHE = /\b(perche|come mai|per quale motivo|motivo|colpa|cosa e successo|che succede|cosa succede)\b/;
  const RE_CALO = /(cal[aoi]|calat|calo|scend|sces|peggior|peggio|\bgiu\b|diminu|crollat|crollo|indietro|rendo meno|va male|andat[oa] male|stanc|fiacc|bassi|basso|\bmeno\b)/;

  function mediaPerGiornoRev(M, perGiorno) {
    const conRev = perGiorno.filter(g => g.rev);
    if (!conRev.length) return { v: null, n: 0 };
    if (M.tipo === 'media') {
      const vals = conRev.map(g => g.val).filter(x => x != null && x > 0);
      return { v: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
    }
    return { v: conRev.reduce((a, g) => a + (Number(g.val) || 0), 0) / conRev.length, n: conRev.length };
  }

  function perche(t, p, ctx, oggi) {
    // finestra: quella chiesta se ha un precedente sensato, altrimenti gli ultimi 14 giorni
    let A, B, label;
    if (p.esplicito && p.prec && p.kind !== 'giorno') { A = { da: p.da, a: p.a > oggi ? oggi : p.a }; B = p.prec; label = p.label; }
    else { A = { da: addDays(oggi, -13), a: oggi }; B = { da: addDays(oggi, -27), a: addDays(oggi, -14) }; label = 'ultimi 14 giorni'; }

    // Periodo ancora aperto (es. questo mese a metà): il precedente si accorcia alla stessa lunghezza,
    // altrimenti i totali (giorni allenati, km) risultano "in calo" solo perché il confronto è più corto.
    const lenA = giorniTra(A.da, A.a) + 1;
    if (giorniTra(B.da, B.a) + 1 > lenA) B = { da: B.da, a: addDays(B.da, lenA - 1) };
    const pa = (k) => valori(ctx, k, A.da, A.a, oggi);
    const pb = (k) => valori(ctx, k, B.da, B.a, oggi);
    const dati = {};
    ['tecnica', 'flessioni', 'squat', 'addominali', 'ore', 'giorni', 'riposo', 'corsa', 'sonno', 'affaticamento', 'intensita'].forEach(k => {
      const M = METRICHE[k];
      const ga = pa(k), gb = pb(k);
      dati[k] = { M, ga, gb, a: mediaPerGiornoRev(M, ga), b: mediaPerGiornoRev(M, gb), tA: aggrega(M, ga).totale, tB: aggrega(M, gb).totale };
    });
    const revA = pa('ore').filter(g => g.rev).length, revB = pb('ore').filter(g => g.rev).length;
    const note = [];
    if (revA < 4 || revB < 4) {
      return { ok: true, tipo: 'perche', periodo: { ...p, label }, calati: [], cause: [], conclusione: `Non ho abbastanza revisioni per confrontare due periodi (${revA} negli ultimi giorni, ${revB} in quelli prima): servono almeno 4 per parte.`, note: ['Più revisioni compili, più il confronto diventa affidabile.'], suggerimenti: SUGGERIMENTI };
    }

    const fmt = (v, dec) => v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const rel = (a, b) => (b > 0 && a != null) ? ((a - b) / b) * 100 : null;

    // 1) cosa è calato
    const calati = [];
    const prova = (k, soglia, etichetta, dec, usaTot) => {
      const d = dati[k];
      const a = usaTot ? d.tA : d.a.v, b = usaTot ? d.tB : d.b.v;
      const r = rel(a, b);
      if (r != null && r <= -soglia) calati.push({ key: k, label: etichetta || d.M.label, prima: b, dopo: a, unit: d.M.unit, dec, delta: r, ico: d.M.ico });
    };
    if (dati.tecnica.a.n >= 2 && dati.tecnica.b.n >= 2) prova('tecnica', 4, 'Voto tecnica', 1);
    prova('flessioni', 8, 'Flessioni al giorno', 0);
    prova('squat', 8, 'Squat al giorno', 0);
    prova('addominali', 8, 'Addominali al giorno', 0);
    prova('ore', 10, 'Ore al giorno', 1);
    prova('giorni', 10, 'Giorni allenati', 0, true);
    prova('corsa', 15, 'Km di corsa', 1, true);
    // se nella domanda c'è una metrica precisa (es. "calato di tecnica") passa avanti lei
    const fuoco = metriche(t).map(k => k === 'giorni' ? 'giorni' : k);
    calati.sort((x, y) => (fuoco.includes(y.key) ? 1 : 0) - (fuoco.includes(x.key) ? 1 : 0) || x.delta - y.delta);

    // 2) cosa è cambiato nello stesso periodo (indizi)
    const cause = [];
    const dS = dati.sonno, dF = dati.affaticamento, dI = dati.intensita;
    if (dS.a.v != null && dS.b.v != null && dS.a.v <= dS.b.v - 0.4)
      cause.push({ k: 'SONNO', testo: 'Dormi meno', prima: `${fmt(dS.b.v, 1)} h`, dopo: `${fmt(dS.a.v, 1)} h`, peso: (dS.b.v - dS.a.v) * 2 });
    if (dF.a.v != null && dF.b.v != null && dF.a.v >= dF.b.v + 0.7)
      cause.push({ k: 'FATICA', testo: 'Più affaticamento', prima: `${fmt(dF.b.v, 1)}/10`, dopo: `${fmt(dF.a.v, 1)}/10`, peso: dF.a.v - dF.b.v });
    if (dI.a.v != null && dI.b.v != null && dI.a.v >= dI.b.v + 0.7)
      cause.push({ k: 'INTENSITÀ', testo: 'Allenamenti più intensi', prima: `${fmt(dI.b.v, 1)}/10`, dopo: `${fmt(dI.a.v, 1)}/10`, peso: dI.a.v - dI.b.v });
    const oreTotA = dati.ore.tA, oreTotB = dati.ore.tB;
    if (oreTotB > 0 && oreTotA >= oreTotB * 1.15)
      cause.push({ k: 'CARICO', testo: 'Più ore di allenamento', prima: `${fmt(oreTotB, 1)} h`, dopo: `${fmt(oreTotA, 1)} h`, peso: ((oreTotA - oreTotB) / oreTotB) * 5 });
    const rA = dati.riposo.tA, rB = dati.riposo.tB;
    if (rA <= rB - 2 && dati.giorni.tA >= dati.giorni.tB)
      cause.push({ k: 'RIPOSO', testo: 'Meno giorni di riposo', prima: `${rB}`, dopo: `${rA}`, peso: (rB - rA) * 0.8 });
    const negMood = (g) => g.filter(x => x.rev).reduce((n, x) => {
      const r = ctx.revBy.get(x.iso); const m = Array.isArray(r && r.mood) ? r.mood : [];
      return n + (m.some(id => ((CS.MOOD_LIST || []).find(y => y.id === id) || {}).negative) ? 1 : 0);
    }, 0);
    const mA = negMood(dati.ore.ga), mB = negMood(dati.ore.gb);
    if (mA >= mB + 2) cause.push({ k: 'MOOD', testo: 'Più giorni con umore negativo', prima: `${mB}`, dopo: `${mA}`, peso: (mA - mB) * 0.8 });
    const inf = (ctx.S.infortuni || []).filter(i => i && i.dataInizio && (i.dataInizio >= A.da || !i.dataFine));
    if (inf.length) cause.push({ k: 'CORPO', testo: `Infortunio: ${inf[0].parte || 'da verificare'}`, prima: '', dopo: inf[0].dataFine ? 'chiuso' : 'aperto', peso: 2 });
    const pes = (ctx.S.pesate || []).filter(x => x.data >= B.da && x.data <= A.a).sort((x, y) => x.data.localeCompare(y.data));
    if (pes.length >= 2 && Math.abs(pes[pes.length - 1].kg - pes[0].kg) >= 1)
      cause.push({ k: 'PESO', testo: pes[pes.length - 1].kg < pes[0].kg ? 'Peso in discesa' : 'Peso in salita', prima: `${fmt(pes[0].kg, 1)} kg`, dopo: `${fmt(pes[pes.length - 1].kg, 1)} kg`, peso: Math.abs(pes[pes.length - 1].kg - pes[0].kg) * 0.6 });
    cause.sort((x, y) => y.peso - x.peso);

    // 3) conclusione onesta
    let conclusione;
    if (!calati.length) {
      conclusione = 'Nei numeri che registri non vedo un calo netto tra i due periodi.';
      if (cause.length) conclusione += ' Qualcosa però è cambiato: lo trovi qui sotto.';
    } else if (cause.length) {
      const prima = calati[0];
      conclusione = `${fuoco.includes(prima.key) ? 'Il calo di' : 'Il calo più netto è'} «${prima.label}» (${Math.round(prima.delta)}%). Nello stesso periodo ${cause.length === 1 ? 'è cambiata una cosa' : 'sono cambiate ' + cause.length + ' cose'}: ${cause.slice(0, 3).map(c => c.testo.toLowerCase()).join(', ')}. È un indizio, non una prova.`;
    } else {
      conclusione = `Il calo più netto è «${calati[0].label}» (${Math.round(calati[0].delta)}%), ma sonno, fatica, intensità, ore e umore sono rimasti stabili: dai dati non trovo una causa chiara.`;
      note.push('Può dipendere da cose che qui non registri (stress, alimentazione, motivazione). Per un ragionamento più ampio sulla tua situazione, chiedi un\'analisi a Claude Code.');
    }
    if (revA < revB - 3) note.push(`Negli ultimi giorni hai compilato meno revisioni (${revA} contro ${revB}): il confronto è meno solido.`);
    return { ok: true, tipo: 'perche', periodo: { ...p, label: `${label} · confrontati con i ${giorniTra(B.da, B.a) + 1} giorni prima` }, calati, cause, conclusione, note, suggerimenti: SUGGERIMENTI };
  }

  // ─── RISPOSTA ───────────────────────────────────────
  // ─── REFUSI: «flessionni», «settimna», «scrsa» ──────
  const VOCAB = ['flessioni', 'squat', 'addominali', 'addome', 'corsa', 'corse', 'sonno', 'dormito', 'tecnica', 'settimana', 'settimane', 'scorsa', 'scorso',
    'mese', 'mesi', 'ieri', 'oggi', 'obiettivi', 'obiettivo', 'allenamento', 'allenamenti', 'allenato', 'allenata', 'perche', 'calato', 'peggio', 'peso', 'giorni', 'giorno',
    'ultimi', 'ultime', 'questo', 'questa', 'anno', 'media', 'record', 'migliore', 'peggiore', 'confronta', 'contro', 'rispetto', 'manca', 'mancano', 'fatica',
    'affaticamento', 'intensita', 'lettura', 'riposo', 'sessioni', 'quante', 'quanti', 'quanto', 'ultima', 'volta', 'consecutivi', 'streak', 'riepilogo',
    'obiettivo', 'settimanale', 'mensile', 'giornaliera', 'domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato',
    'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const VOCAB_SET = new Set(VOCAB);

  function distanza(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }
  function correggi(t) {
    return t.split(' ').map(w => {
      if (w.length < 5 || VOCAB_SET.has(w) || /\d/.test(w)) return w;
      const max = w.length >= 9 ? 2 : 1;
      let best = null, bd = 9, tie = false;
      VOCAB.forEach(v => { const d = distanza(w, v); if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd) tie = true; });
      return (best && bd <= max && !tie) ? best : w;
    }).join(' ');
  }

  // ─── SUPPORTI ───────────────────────────────────────
  const fineEff = (p, oggi) => p.a > oggi ? oggi : p.a;
  const etichettaMetrica = (k) => METRICHE[k] ? METRICHE[k].label : k;
  const giorniConDato = (M, pg) => pg.filter(g => g.val != null && g.val > 0).length;

  // Serie settimanale (ultime 8 settimane di calendario) per una metrica: per il grafico di tendenza.
  function trendSettimane(ctx, key, oggi, n) {
    const M = METRICHE[key];
    const out = [];
    const lunCorr = lunedi(oggi);
    for (let i = n - 1; i >= 0; i--) {
      const da = addDays(lunCorr, -7 * i);
      const pg = valori(ctx, key, da, addDays(da, 6), oggi);
      const ag = aggrega(M, pg);
      out.push({ da, val: ag.totale, corrente: i === 0 });
    }
    return out;
  }

  function bucket(ctx, key, da, a, oggi, gran) {
    // gran: 'giorno' | 'settimana' | 'mese' → lista {label, da, a, val, n}
    const M = METRICHE[key];
    const fine = a > oggi ? oggi : a;
    const out = [];
    if (gran === 'giorno') {
      valori(ctx, key, da, fine, oggi).forEach(g => out.push({ label: etichettaGiorno(g.iso), da: g.iso, a: g.iso, val: g.val, rev: g.rev }));
      return out;
    }
    let cur = gran === 'settimana' ? lunedi(da) : `${da.slice(0, 7)}-01`;
    for (let g = 0; g < 400 && cur <= fine; g++) {
      const fineB = gran === 'settimana' ? addDays(cur, 6) : iso(new Date(parse(cur).getFullYear(), parse(cur).getMonth() + 1, 0));
      const dd = cur < da ? da : cur, aa = fineB > fine ? fine : fineB;
      const pg = valori(ctx, key, dd, aa, oggi);
      const ag = aggrega(M, pg);
      const completo = fineB <= fine;
      const label = gran === 'settimana' ? `${fmtData(cur)} → ${fmtData(fineB)}` : `${MESI[parse(cur).getMonth()]} ${parse(cur).getFullYear()}`;
      out.push({ label: completo ? label : `${label} (in corso)`, da: dd, a: aa, val: ag.totale, completo, nGiorni: pg.filter(x => x.rev).length });
      cur = gran === 'settimana' ? addDays(cur, 7) : iso(new Date(parse(cur).getFullYear(), parse(cur).getMonth() + 1, 1));
    }
    return out;
  }

  // ─── RISPOSTE SPECIALI ──────────────────────────────
  function rStato() {
    let v = null;
    try { v = ASSISTANT.getVerdict(); } catch (e) { /* verdetto non disponibile */ }
    if (!v) return { ok: false, tipo: 'stato', note: ['Per ora non riesco a leggere il verdetto di oggi.'] };
    return { ok: true, tipo: 'stato', stato: { titolo: v.titolo, frase: v.frase, prontezza: v.prontezza, consiglio: v.consiglio, domani: v.domani, segnali: v.fr || [], lv: v.lv }, note: [] };
  }

  function rSerie() {
    let cur = 0, best = { val: 0 };
    try { cur = CALC.streakDays(); best = CALC.streakMax() || best; } catch (e) { /* calc non disponibile */ }
    return { ok: true, tipo: 'serie', serie: { corrente: cur, migliore: best.val || 0, da: best.start || null, a: best.end || null }, note: ['La serie non si interrompe con un riposo dichiarato.'] };
  }

  function rUltima(keys, ctx, oggi) {
    const k = keys.find(x => METRICHE[x]) || 'giorni';
    const M = METRICHE[k];
    const giorni = [...ctx.revBy.keys()].sort().reverse();
    let ultima = null, penultima = null;
    for (const d of giorni) {
      let v; try { v = M.f(ctx.revBy.get(d), d, ctx); } catch (e) { v = null; }
      if (v != null && v > 0) { if (!ultima) ultima = { iso: d, val: v }; else { penultima = { iso: d, val: v }; break; } }
    }
    return { ok: true, tipo: 'ultima', metrica: { key: k, label: M.label, ico: M.ico, unit: M.unit, dec: M.dec || 0 },
      ultima: ultima && { ...ultima, fa: giorniTra(ultima.iso, oggi), label: etichettaGiorno(ultima.iso) },
      penultima: penultima && { ...penultima, label: etichettaGiorno(penultima.iso) }, note: ultima ? [] : ['Non trovo nessuna volta nei dati salvati.'] };
  }

  function rRecord(t, keys, p, ctx, oggi) {
    const k = keys.find(x => METRICHE[x]) || 'ore';
    const M = METRICHE[k];
    const gran = /settiman/.test(t) ? 'settimana' : /\bmes[ei]\b/.test(t) ? 'mese' : 'giorno';
    const pp = p.esplicito ? p : (() => { const primo = ([...ctx.revBy.keys()].sort()[0]) || oggi; return { da: primo, a: oggi, label: `da sempre (dal ${fmtData(primo)})`, kind: 'sempre', esplicito: true }; })();
    let b = bucket(ctx, k, pp.da, pp.a, oggi, gran).filter(x => x.val != null && x.val > 0);
    if (gran !== 'giorno') b = b.filter(x => x.completo !== false || b.length < 3);
    const ord = [...b].sort((x, y) => y.val - x.val);
    const peggiore = ord.length > 3 ? ord[ord.length - 1] : null;
    return { ok: ord.length > 0, tipo: 'record', periodo: pp, metrica: { key: k, label: M.label, ico: M.ico, unit: M.unit, dec: M.dec || 0, tipo: M.tipo },
      gran, migliori: ord.slice(0, 3), peggiore, n: ord.length, note: ord.length ? (gran !== 'giorno' ? ['Le settimane e i mesi ancora in corso sono esclusi se ce ne sono di completi.'] : []) : ['Nessun dato per questo periodo.'] };
  }

  function rMedia(t, keys, p, ctx, oggi) {
    const ks = keys.filter(x => METRICHE[x]);
    const lista = ks.length ? ks : ['ore', 'flessioni', 'squat', 'addominali'];
    const gran = /(al mese|mensil|ogni mese|per mese)/.test(t) ? 'mese' : /(a settimana|settimanal|ogni settimana|per settimana)/.test(t) ? 'settimana'
      : /(al giorno|giornalier|ogni giorno)/.test(t) ? 'giorno' : (giorniTra(p.da, fineEff(p, oggi)) >= 27 ? 'settimana' : 'giorno');
    const righe = lista.map(k => {
      const M = METRICHE[k];
      let b = bucket(ctx, k, p.da, p.a, oggi, gran);
      if (gran === 'giorno') b = b.filter(x => x.rev);
      else if (b.some(x => x.completo)) b = b.filter(x => x.completo);
      const vals = b.map(x => x.val).filter(v => v != null && !(M.tipo === 'media' && !(v > 0)));
      const media = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
      return { key: k, label: M.label, ico: M.ico, unit: M.unit, dec: (M.dec || 0) + (gran === 'giorno' && !(M.dec) ? 0 : 0), media, n: vals.length };
    });
    const nomeG = { giorno: 'al giorno', settimana: 'a settimana', mese: 'al mese' }[gran];
    return { ok: righe.some(r => r.media != null), tipo: 'media', periodo: p, righe, gran, nomeG, note: [gran === 'giorno' ? 'Media sui giorni con revisione.' : 'Media sulle ' + (gran === 'settimana' ? 'settimane' : 'mesi') + ' complete del periodo.'] };
  }

  function rConfronto(t, keysIn, oggi, ctx) {
    const m = t.match(/^(.*?)\b(contro|rispetto a|rispetto al|rispetto alla|rispetto ai|vs|paragonat[oa] a|confrontat[oa] con|e quello|con)\b(.*)$/);
    if (!m) return null;
    const sx = m[1].replace(/\bconfronta\b/, ' ').trim(), dx = m[3].trim();
    const pA = periodo(sx || t, oggi);
    let pB = periodo(dx, oggi);
    if (!pA.esplicito) return null;
    if (!pB.esplicito || (/\b(scors[ao]|precedente|prima|passat[ao])\b/.test(dx) && !/(settimana|mese|anno|ieri|oggi)/.test(dx.replace(/scors[ao]|precedente|passat[ao]/g, '')))) {
      if (!pA.prec) return null;
      pB = { da: pA.prec.da, a: pA.prec.a, label: 'periodo precedente', kind: pA.kind, esplicito: true };
    }
    const notaAllinea = [];
    const lA = giorniTra(pA.da, fineEff(pA, oggi)) + 1, lB = giorniTra(pB.da, pB.a) + 1;
    if (pA.a > oggi && lA < lB) { pB = { ...pB, a: addDays(pB.da, lA - 1), label: `${pB.label} (primi ${lA} giorni)` }; notaAllinea.push(`Il periodo di sinistra è ancora in corso (${lA} giorni): ho confrontato con i primi ${lA} giorni dell'altro, così i totali sono alla pari.`); }
    const ks = (keysIn.length ? keysIn : RIEPILOGO).filter(x => METRICHE[x]);
    const righe = ks.map(k => {
      const M = METRICHE[k];
      const a = aggrega(M, valori(ctx, k, pA.da, pA.a, oggi)), b = aggrega(M, valori(ctx, k, pB.da, pB.a, oggi));
      const d = (b.totale > 0 && a.totale != null) ? ((a.totale - b.totale) / b.totale) * 100 : null;
      return { key: k, label: M.label, ico: M.ico, unit: M.unit, dec: M.dec || 0, a: a.totale, b: b.totale, delta: d };
    });
    const lenA = giorniTra(pA.da, fineEff(pA, oggi)) + 1, lenB = giorniTra(pB.da, fineEff(pB, oggi)) + 1;
    const note = notaAllinea.slice();
    if (Math.abs(lenA - lenB) > 1) note.push(`Attenzione: i due periodi hanno lunghezze diverse (${lenA} e ${lenB} giorni): i totali non sono alla pari.`);
    return { ok: righe.length > 0, tipo: 'confronto', A: pA, B: pB, righe, note };
  }

  function rManca(p, ctx, oggi) {
    const S = ctx.S;
    const riposoFisso = (S.piano && Array.isArray(S.piano.riposoFisso)) ? S.piano.riposoFisso : [1];
    const periodi = [];
    if (p.esplicito && (p.kind === 'settimana' || p.kind === 'mese')) periodi.push(p);
    else {
      const lun = lunedi(oggi);
      periodi.push({ da: lun, a: addDays(lun, 6), kind: 'settimana', label: 'questa settimana' });
      periodi.push({ da: `${oggi.slice(0, 7)}-01`, a: iso(new Date(parse(oggi).getFullYear(), parse(oggi).getMonth() + 1, 0)), kind: 'mese', label: 'questo mese' });
    }
    const out = [];
    periodi.forEach(per => {
      const lista = obiettiviDel(per) || [];
      let utili = 0;
      for (let d = per.a >= oggi && per.da <= oggi ? oggi : per.da; d <= per.a; d = addDays(d, 1)) if (!riposoFisso.includes((parse(d).getDay() + 6) % 7)) utili++;
      lista.forEach(o => {
        const resto = Math.max(0, o.target - o.cur);
        out.push({ periodo: per.label || per.kind, scadenza: o.scadenza, nome: o.nome, unita: o.unita, cur: o.cur, target: o.target, resto, pct: o.pct,
          giorni: utili, quota: (utili > 0 && per.a >= oggi) ? resto / utili : null, chiuso: per.a < oggi });
      });
    });
    return { ok: true, tipo: 'manca', righe: out, note: out.length ? ['La quota giornaliera divide quello che manca per i giorni che restano, esclusi i tuoi giorni di riposo fisso.'] : ['Non ci sono obiettivi salvati per questi periodi.'] };
  }

  function rPesoObiettivo(ctx, oggi) {
    const pes = (ctx.S.pesate || []).filter(x => x && x.data && Number(x.kg) > 0).sort((a, b) => a.data.localeCompare(b.data));
    const target = Number((ctx.S.profile || {}).pesoTarget) || null;
    if (!pes.length) return { ok: false, tipo: 'peso', note: ['Non ci sono pesate salvate.'] };
    const ult = pes[pes.length - 1];
    const finestra = pes.filter(x => giorniTra(x.data, oggi) <= 28);
    let ritmo = null;
    if (finestra.length >= 2) {
      const g = giorniTra(finestra[0].data, finestra[finestra.length - 1].data);
      if (g >= 7) ritmo = ((finestra[finestra.length - 1].kg - finestra[0].kg) / g) * 7;
    }
    const mancano = target != null ? ult.kg - target : null;
    let settimane = null;
    if (mancano != null && ritmo != null && Math.abs(ritmo) > 0.02 && ((mancano > 0 && ritmo < 0) || (mancano < 0 && ritmo > 0))) settimane = Math.abs(mancano / ritmo);
    const note = [];
    if (target == null) note.push('Non hai impostato un peso obiettivo nel profilo.');
    if (ritmo == null) note.push('Per stimare il ritmo servono almeno 2 pesate a più di una settimana di distanza negli ultimi 28 giorni.');
    return { ok: true, tipo: 'peso', peso: { ultimo: ult, target, mancano, ritmo, settimane, giorniFa: giorniTra(ult.data, oggi), n28: finestra.length }, note };
  }

  // ─── RISPOSTA ───────────────────────────────────────
  const SUGGERIMENTI = ['Come sto oggi?', 'Perché sono calato?', 'Come è andata la settimana scorsa?', 'Quanto mi manca per gli obiettivi?', 'Qual è stata la mia settimana migliore?',
    'Confronta questo mese con il mese scorso', 'Quanti giorni di fila?', 'Quando ho corso l\'ultima volta?'];

  const RE_STATO = /\b(come sto|come sono messo|come mi trovo|come va oggi|cosa devo fare|cosa faccio oggi|che faccio oggi|posso allenarmi|devo riposare|devo allenarmi|oggi mi alleno|sono pronto|prontezza)\b/;
  const RE_RECORD = /(migliore|peggiore|record|massimo|minimo|piu alto|piu basso|picco)/;
  const RE_MEDIA = /(\bmedia\b|in media|mediamente|di media)/;
  const RE_SERIE = /(di fila|consecutiv|streak|\bserie\b)/;
  const RE_ULTIMA = /(ultima volta|da quanto tempo|da quanti giorni|quando (ho|e stata|e stato|mi sono))/;
  const RE_MANCA = /(\bmanca\b|mancano|quanto devo|quante ne devo|rimane|rimangono|ancora da fare|quanto resta|mi resta)/;
  const RE_RIEPILOGO = /riepilogo|riassunt|sintesi|resoconto|com e andat|come e andat|cosa ho fatto|tutto|bilancio/;

  // Modifica "slot" da una domanda precedente: «e ieri?», «e gli squat?»
  function rispondi(testo, prev) {
    const domanda = String(testo || '').trim();
    if (!domanda) return { ok: false, domanda, note: ['Scrivimi una domanda, per esempio «quante flessioni ho fatto ieri?»'], suggerimenti: SUGGERIMENTI };
    const t = correggi(norm(domanda));
    const oggi = CS.todayISO();
    const ctx = contesto();
    let p = periodo(t, oggi);
    let keys = metriche(t);
    const chiedePeso = /\bpeso\b|pesat|\bkg\b|chili/.test(t);
    const intento = /\b(contro|rispetto a|rispetto al|rispetto alla|vs|paragon|confront)/.test(t) || RE_STATO.test(t) || RE_RECORD.test(t) || RE_MEDIA.test(t) || RE_SERIE.test(t) || RE_ULTIMA.test(t) || RE_MANCA.test(t)
      || /obiettiv|target|traguard/.test(t) || (RE_PERCHE.test(t) && RE_CALO.test(t));

    // follow-up: manca la metrica → riprendi quella di prima; manca il periodo → riprendi il periodo di prima
    let seguito = false;
    if (prev && !intento) {
      if (!keys.length && !chiedePeso && p.esplicito && prev.keys && prev.keys.length) { keys = prev.keys.slice(); seguito = true; }
      else if (keys.length && !p.esplicito && prev.p && prev.p.esplicito) { p = prev.p; seguito = true; }
    }
    const out = (r, extra) => Object.assign({ domanda, suggerimenti: SUGGERIMENTI, seguito }, r, extra || {});
    const capito = (pp, ks) => ({ periodo: pp ? pp.label : null, cosa: (ks || []).filter(k => METRICHE[k]).map(etichettaMetrica), keys: (ks || []).filter(k => METRICHE[k]), modificabile: true });
    const ricorda = (tipo, ks, pp) => ({ tipo, keys: ks, p: pp });

    if (RE_STATO.test(t)) return out(rStato(), { capito: { periodo: 'oggi', cosa: ['verdetto'] } });
    if (RE_PERCHE.test(t) && RE_CALO.test(t)) return out(perche(t, p, ctx, oggi), { capito: { periodo: null, cosa: ['perché sono calato'] } });

    const conf = (/\b(contro|rispetto a|rispetto al|rispetto alla|rispetto ai|vs|paragonat|confront)/.test(t)) ? rConfronto(t, keys, oggi, ctx) : null;
    if (conf) return out(conf, { capito: { periodo: `${conf.A.label} ↔ ${conf.B.label}`, cosa: conf.righe.map(r => r.label) }, contesto: ricorda('confronto', keys, conf.A) });

    if (RE_SERIE.test(t)) return out(rSerie(), { capito: { periodo: null, cosa: ['giorni di fila'] } });
    if (RE_ULTIMA.test(t)) { const r = rUltima(keys, ctx, oggi); return out(r, { capito: { periodo: null, cosa: [r.metrica.label] }, contesto: ricorda('ultima', keys, null) }); }
    if (RE_RECORD.test(t)) { const r = rRecord(t, keys, p, ctx, oggi); return out(r, { capito: { periodo: r.periodo.label, cosa: [r.metrica.label], keys: [r.metrica.key], modificabile: true }, contesto: ricorda('record', [r.metrica.key], r.periodo) }); }
    if (RE_MEDIA.test(t) && !chiedePeso) {
      if (!p.esplicito) {
        const sett = /(a settimana|settimanal|ogni settimana|per settimana)/.test(t), mese = /(al mese|mensil|ogni mese|per mese)/.test(t);
        const primo = ([...ctx.revBy.keys()].sort()[0]) || oggi;
        p = mese ? { da: primo, a: oggi, label: `da sempre (dal ${fmtData(primo)})`, kind: 'sempre', esplicito: true }
          : sett ? { da: addDays(oggi, -55), a: oggi, label: 'ultime 8 settimane', kind: 'ultimi', esplicito: true }
          : { da: addDays(oggi, -29), a: oggi, label: 'ultimi 30 giorni', kind: 'ultimi', esplicito: true };
      }
      const r = rMedia(t, keys, p, ctx, oggi); return out(r, { capito: { periodo: p.label, cosa: r.righe.map(x => x.label), keys: r.righe.map(x => x.key), modificabile: true }, contesto: ricorda('media', r.righe.map(x => x.key), p) }); }
    if (chiedePeso && /(obiettiv|target|manca|raggiung|quando arrivo|quanto devo)/.test(t)) return out(rPesoObiettivo(ctx, oggi), { capito: { periodo: null, cosa: ['peso e obiettivo'] } });
    if (RE_MANCA.test(t) || (/obiettiv/.test(t) && /(manca|mancano|rimane|resta|quanto)/.test(t))) { const r = rManca(p, ctx, oggi); return out(r, { capito: { periodo: p.esplicito ? p.label : 'questa settimana e questo mese', cosa: ['obiettivi'] } }); }

    // obiettivi del periodo
    if (/obiettiv|target|traguard/.test(t)) {
      const ob = obiettiviDel(p);
      const note = [];
      if (!p.esplicito) note.push('Non hai detto il periodo: ti mostro questa settimana.');
      if (ob === null) note.push('Gli obiettivi hanno periodi precisi: chiedimi un giorno, una settimana, un mese o un anno (es. «obiettivi della settimana scorsa»).');
      else if (!ob.length) note.push('Per questo periodo non c\'è nessun obiettivo salvato.');
      return out({ ok: true, tipo: 'obiettivi', periodo: p, obiettivi: ob || [], note }, { capito: { periodo: p.label, cosa: ['obiettivi'] }, contesto: ricorda('obiettivi', [], p) });
    }

    // numeri di una o più metriche (con riepilogo se non ne nomini nessuna)
    const parolaRiepilogo = RE_RIEPILOGO.test(t);
    const riepilogo = !keys.length && !chiedePeso && (parolaRiepilogo || p.esplicito);
    if (riepilogo) keys = RIEPILOGO.slice();

    const note = [];
    if (!p.esplicito) note.push('Non hai detto il periodo: ti mostro questa settimana.');
    const singola = keys.length === 1;
    const righe = keys.map(key => {
      const M = METRICHE[key];
      const pg = valori(ctx, key, p.da, p.a, oggi);
      const ag = aggrega(M, pg);
      let prec = null;
      if (p.prec) prec = aggrega(M, valori(ctx, key, p.prec.da, p.prec.a, oggi)).totale;
      let delta = null;
      if (prec != null && ag.totale != null && prec > 0) delta = ((ag.totale - prec) / prec) * 100;
      let ob = null;
      if (M.cat) { const lista = obiettiviDel(p); ob = lista && lista.find(o => o.categoria === M.cat) || null; }
      return { key, label: M.label, ico: M.ico, unit: M.unit, dec: M.dec || 0, tipo: M.tipo, totale: ag.totale, n: ag.n, giorniConDato: giorniConDato(M, pg),
        perGiorno: pg, prec, delta, obiettivo: ob,
        trend: (singola && p.kind !== 'giorno') ? trendSettimane(ctx, key, oggi, 8) : null };
    });

    let peso = null;
    if (chiedePeso) {
      const pes = (CS.state.pesate || []).filter(x => x.data >= p.da && x.data <= fineEff(p, oggi)).sort((a, b) => a.data.localeCompare(b.data));
      const prima = (CS.state.pesate || []).filter(x => x.data < p.da).sort((a, b) => a.data.localeCompare(b.data)).pop() || null;
      peso = { n: pes.length, primo: pes[0] || null, ultimo: pes[pes.length - 1] || null, prima };
    }

    const fine = fineEff(p, oggi);
    const totGiorni = Math.max(0, giorniTra(p.da, fine) + 1);
    // Sul telefono lo storico è di 90 giorni (CS.state.storicoDa): prima di quella data i dati NON ci sono,
    // non sono zero. Lo dico, e non conto quei giorni come "senza revisione".
    const limite = ctx.S.storicoDa || null;
    let senza = 0;
    for (let d = (limite && p.da < limite) ? limite : p.da; d <= fine; d = addDays(d, 1)) if (!ctx.revBy.has(d) && d !== oggi) senza++;
    if (limite && p.da < limite) note.push(`Su questo telefono ho solo gli ultimi 90 giorni (dal ${fmtData(limite)}): prima di quella data i numeri non ci sono, non sono zero. Per il resto apri il PC.`);
    if (p.kind !== 'giorno' && senza > 0) note.push(`${senza} ${senza === 1 ? 'giorno' : 'giorni'} su ${totGiorni} senza revisione: contati come 0.`);
    if (p.kind === 'giorno' && senza > 0) note.push('Per questo giorno non c\'è nessuna revisione salvata.');
    if (p.a > oggi && p.kind !== 'giorno') note.push('Il periodo non è ancora finito: i numeri arrivano fino a oggi.');
    if (!righe.length && !peso) note.push('Non ho capito di cosa vuoi sapere: prova con flessioni, squat, addominali, corsa, ore, sonno, peso o obiettivi — oppure scegli uno dei suggerimenti.');

    return out({ ok: righe.length > 0 || !!peso, tipo: riepilogo ? 'riepilogo' : 'metriche', periodo: p, righe, peso, note, giorniTot: totGiorni, giorniSenza: senza },
      { capito: capito(p, keys), contesto: ricorda('metriche', keys, p) });
  }

  // ─── COSE CHE HO NOTATO (proattivo) ─────────────────
  function notato() {
    const oggi = CS.todayISO();
    const ctx = contesto();
    const S = ctx.S;
    const out = [];
    const dow = (parse(oggi).getDay() + 6) % 7;

    // 1) obiettivi settimanali in ritardo rispetto ai giorni passati
    try {
      const lun = lunedi(oggi);
      const lista = obiettiviDel({ da: lun, a: addDays(lun, 6), kind: 'settimana' }) || [];
      const attesa = ((dow + 1) / 7) * 100;
      const indietro = lista.filter(o => o.pct < attesa - 15).sort((a, b) => a.pct - b.pct)[0];
      if (indietro) out.push({ ico: '🎯', k: 'OBIETTIVI', testo: `${indietro.nome}: ${Math.round(indietro.pct)}% dell'obiettivo settimanale, con ${Math.round(attesa)}% di settimana già passata.`, q: 'Quanto mi manca per gli obiettivi?' });
    } catch (e) { /* senza obiettivi non si segnala */ }

    // 2) sonno
    const a = valori(ctx, 'sonno', addDays(oggi, -6), oggi, oggi), b = valori(ctx, 'sonno', addDays(oggi, -13), addDays(oggi, -7), oggi);
    const mA = mediaPerGiornoRev(METRICHE.sonno, a), mB = mediaPerGiornoRev(METRICHE.sonno, b);
    if (mA.n >= 3 && mA.v != null && (mA.v < 6.5 || (mB.v != null && mA.v <= mB.v - 0.5)))
      out.push({ ico: '😴', k: 'SONNO', testo: `Dormi in media ${mA.v.toFixed(1).replace('.', ',')} h negli ultimi 7 giorni${mB.v != null ? ` (prima ${mB.v.toFixed(1).replace('.', ',')} h)` : ''}.`, q: 'Come ho dormito questa settimana?' });

    // 3) serie lunga
    let serie = 0; try { serie = CALC.streakDays(); } catch (e) { /* ignora */ }
    if (serie >= 5) out.push({ ico: '🔥', k: 'SERIE', testo: `${serie} giorni di allenamento di fila.`, q: 'Come sto oggi?' });

    // 4) settimana scorsa appena chiusa
    if (dow <= 2 && ctx.revBy.size > 7) out.push({ ico: '🗓', k: 'SETTIMANA', testo: 'La settimana scorsa è chiusa: vuoi il riepilogo?', q: 'Come è andata la settimana scorsa?' });

    // 5) peso fermo da giorni
    const pes = (S.pesate || []).filter(x => x && x.data).sort((x, y) => x.data.localeCompare(y.data));
    if (pes.length && giorniTra(pes[pes.length - 1].data, oggi) >= 7)
      out.push({ ico: '⚖️', k: 'PESO', testo: `Non ti pesi da ${giorniTra(pes[pes.length - 1].data, oggi)} giorni.`, q: 'Quanto mi manca al peso obiettivo?' });

    // 6) revisione di ieri mancante
    const ieri = addDays(oggi, -1);
    if (ctx.revBy.size > 7 && !ctx.revBy.has(ieri)) out.push({ ico: '📝', k: 'DATI', testo: 'Ieri non hai compilato la revisione.', azione: 'capture' });

    return out.slice(0, 4);
  }

  // ─── PACCHETTO PER CLAUDE CODE (analisi approfondita) ─
  function pacchetto(domanda) {
    const oggi = CS.todayISO();
    const ctx = contesto();
    const S = ctx.S;
    const ultimi = [];
    for (let d = addDays(oggi, -29); d <= oggi; d = addDays(d, 1)) {
      const r = ctx.revBy.get(d);
      if (!r) { ultimi.push({ data: d, nessuna_revisione: true }); continue; }
      ultimi.push({ data: d, riposo: !!r.riposo, ore: r.oreAllenamento || 0, intensita: r.intensita || null, affaticamento: r.affaticamento || null, sonno_h: r.sonnoOre || ctx.sonnoLog[d] || null,
        tecnica: r.tecnica || null, flessioni: r.flessioni || 0, squat: r.squat || 0, addominali: r.addominali || 0, km_corsa: (r.kmCorsa || 0) + (ctx.corsaLog[d] || 0),
        tipo: r.tipo || [], mood: r.mood || [], bene: r.bene || '', male: r.male || '', migliora: r.migliora || '' });
    }
    let verdetto = null; try { const v = ASSISTANT.getVerdict(); verdetto = { titolo: v.titolo, frase: v.frase, prontezza: v.prontezza, consiglio: v.consiglio && v.consiglio.tipo, domani: v.domani && v.domani.titolo, segnali: (v.fr || []).map(f => `${f.k}: ${f.v}`) }; } catch (e) { /* senza verdetto */ }
    const lunCorr = lunedi(oggi);
    const dati = {
      oggi, piano: S.piano || null, obiettivi_giornalieri: S.targetGiorn ? { flessioni: S.targetGiorn.flessioni, squat: S.targetGiorn.squat, addominali: S.targetGiorn.addominali, km_corsa: S.targetGiorn.kmCorsa, corse_a_settimana: S.targetGiorn.corsaSett } : null,
      obiettivi_settimana: obiettiviDel({ da: lunCorr, a: addDays(lunCorr, 6), kind: 'settimana' }),
      obiettivi_mese: obiettiviDel({ da: `${oggi.slice(0, 7)}-01`, a: oggi, kind: 'mese' }),
      pesate_recenti: (S.pesate || []).slice(-10).map(x => ({ data: x.data, kg: x.kg })), peso_obiettivo: (S.profile || {}).pesoTarget || null,
      infortuni: (S.infortuni || []).map(i => ({ parte: i.parte, dal: i.dataInizio, al: i.dataFine || null, gravita: i.gravita })),
      verdetto_di_oggi: verdetto, ultimi_30_giorni: ultimi,
    };
    return [
      'Sei il mio coach di pugilato e il mio secondo cervello. Qui sotto trovi i miei dati degli ultimi 30 giorni, presi dall\'app Champion.',
      `La mia domanda: ${domanda || 'fai un\'analisi generale: come sto andando, cosa devo cambiare, cosa ho trascurato?'}`,
      'Ragiona sui dati (non solo ripeterli): collega cause ed effetti, dimmi cosa conta davvero, sii onesto se i dati non bastano, e chiudi con 2-3 azioni concrete per i prossimi giorni.',
      'Preferisco poche cose giuste a un elenco lungo. Rispondi in italiano.',
      '', '```json', JSON.stringify(dati), '```',
    ].join('\n');
  }

  const PAROLE = { flessioni: 'flessioni', squat: 'squat', addominali: 'addominali', corsa: 'corsa', ore: 'ore di allenamento', giorni: 'allenamenti', sonno: 'sonno', tecnica: 'voto tecnica', affaticamento: 'affaticamento', intensita: 'intensità', lettura: 'lettura', riposo: 'giorni di riposo', sessioni: 'sessioni' };
  return { rispondi, notato, pacchetto, SUGGERIMENTI, PAROLE, METRICHE_CHIAVI: Object.keys(PAROLE), _periodo: periodo, _norm: norm, _correggi: correggi };

})();
