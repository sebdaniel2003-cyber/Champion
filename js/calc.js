/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — CALC ENGINE
   Tutte le aggregazioni partono da qui.
   Le viste leggono, NON ricalcolano in proprio.
   ═══════════════════════════════════════════════════════ */

const CALC = (function () {

  // ─── Helpers ────────────────────────────────────────
  function inRange(iso, start, end) {
    const d = new Date(iso);
    return d >= start && d <= end;
  }

  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + (b || 0), 0);
  }

  // ─── REVISIONI per periodo ──────────────────────────
  function revsInWeek(date) {
    const { start, end } = CS.weekRange(date);
    return CS.state.revisioni.filter(r => inRange(r.data, start, end));
  }

  function revsInMonth(date) {
    const d = date instanceof Date ? date : new Date(date);
    const month = d.getMonth();
    const year = d.getFullYear();
    return CS.state.revisioni.filter(r => {
      const rd = new Date(r.data);
      return rd.getMonth() === month && rd.getFullYear() === year;
    });
  }

  function revsLastN(n) {
    const sorted = [...CS.state.revisioni].sort((a, b) => b.data.localeCompare(a.data));
    return sorted.slice(0, n);
  }

  // ─── AGGREGAZIONI revisioni ──────────────────────────
  function aggregateRevs(revs) {
    const trained = revs.filter(r => !r.riposo && (r.oreAllenamento || r.tipo?.length));
    const out = {
      sessioni: trained.length,
      ore: sum(trained.map(r => Number(r.oreAllenamento) || 0)),
      tecnica: avg(trained.map(r => r.tecnica).filter(Boolean)),
      intensita: avg(trained.map(r => r.intensita).filter(Boolean)),
      affaticamento: avg(trained.map(r => r.affaticamento).filter(Boolean)),
      sonnoMedio: avg(revs.map(r => Number(r.sonnoOre) || 0).filter(Boolean)),
      sonnoQualita: avg(revs.map(r => r.sonnoQualita).filter(Boolean)),
      flessioni: sum(revs.map(r => Number(r.flessioni) || 0)),
      squat: sum(revs.map(r => Number(r.squat) || 0)),
      addominali: sum(revs.map(r => Number(r.addominali) || 0)),
      kmCorsa: sum(revs.map(r => Number(r.kmCorsa) || 0)),
      moodPrevalente: prevailingMood(revs),
    };
    // Settings v4: aggrega anche le chiavi extra (predef + custom con prefisso x_)
    // Predefiniti: key diretto (es. orePesi). Custom: x_<key>.
    const extraKeys = new Set();
    revs.forEach(r => {
      Object.keys(r).forEach(k => {
        if (k.startsWith('x_')) extraKeys.add(k);
      });
    });
    try {
      const cfg = CS.state.revFieldsConfig;
      if (cfg) {
        Object.entries(cfg.predefinedExtras || {}).forEach(([k, m]) => {
          if (m.enabled) extraKeys.add(k);
        });
      }
    } catch (e) {}
    extraKeys.forEach(k => {
      out[k] = sum(revs.map(r => Number(r[k]) || 0));
    });
    return out;
  }

  function prevailingMood(revs) {
    const moodCount = {};
    revs.forEach(r => {
      (r.mood || []).forEach(m => {
        moodCount[m] = (moodCount[m] || 0) + 1;
      });
    });
    let max = null, maxV = 0;
    for (const m in moodCount) {
      if (moodCount[m] > maxV) { max = m; maxV = moodCount[m]; }
    }
    return max;
  }

  // ─── PESO ────────────────────────────────────────────
  function pesoMedio7gg(date) {
    const d = date ? new Date(date) : new Date();
    const start = new Date(d); start.setDate(d.getDate() - 7);
    const recent = CS.state.pesate.filter(p => inRange(p.data, start, d));
    return avg(recent.map(p => p.kg));
  }

  function pesoTrend7gg() {
    if (CS.state.pesate.length < 2) return 0;
    const now = pesoMedio7gg();
    const past = new Date(); past.setDate(past.getDate() - 7);
    const before = pesoMedio7gg(past);
    if (!now || !before) return 0;
    return now - before;
  }

  function pesoCurrent() {
    const last = CS.getLastPesata();
    return last ? last.kg : null;
  }

  // ─── SONNO ───────────────────────────────────────────
  function sonnoMedio(days = 7) {
    const d = new Date();
    const start = new Date(d); start.setDate(d.getDate() - days);
    const recent = CS.state.sonno.filter(s => inRange(s.data, start, d));
    return avg(recent.map(s => s.ore));
  }

  // ─── STREAK GIORNI ALLENAMENTO ──────────────────────
  function streakDays() {
    const revs = [...CS.state.revisioni].sort((a, b) => b.data.localeCompare(a.data));
    if (!revs.length) return 0;
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cursor = new Date(today);
    for (let i = 0; i < 365; i++) {
      const iso = CS.isoDateOnly(cursor);
      const rev = revs.find(r => r.data === iso);
      if (rev && !rev.riposo && (rev.oreAllenamento > 0)) {
        streak++;
      } else if (rev && rev.riposo) {
        // riposo non rompe streak
      } else {
        // se è oggi e non ho ancora compilato, non rompo
        if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  // ─── STATUS giorno calendario (DASHBOARD) ───────────
  // 'allenato' | 'riposo' | 'oggi' | 'perso' | 'futuro'
  function dayStatus(date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    const iso = CS.isoDateOnly(d);
    const isToday = d.getTime() === today.getTime();
    const isFuture = d.getTime() > today.getTime();
    const rev = CS.state.revisioni.find(r => r.data === iso);
    if (isToday) return 'oggi';
    if (isFuture) return 'futuro';
    if (rev && rev.riposo) return 'riposo';
    if (rev && (rev.oreAllenamento > 0)) return 'allenato';
    return 'perso'; // giorno passato senza revisione o senza allenamento
  }

  // ─── GIORNATA D'ORO (criteri per singolo giorno) ────
  // 1) Ore allenamento ≥ criteriOro.sett.oreMinime (default 2)
  // 2) Sessioni giorno ≥ 2
  // 3) Tecnica ≥ 8
  // 4) Flessioni + Squat + Addominali ognuno ≥ target (letto da obiettivo giornaliero attivo, fallback criteriOro)
  // Ritorna { gold, criteri:[{id,label,met,cur,tgt}], met:0..4, riposo, hasRev, state:'empty'|'red'|'orange'|'gold'|'rest' }
  function giornataOroCheck(dateIso) {
    const rev = CS.state.revisioni.find(r => r.data === dateIso);
    if (!rev) {
      return { gold: false, criteri: [], met: 0, riposo: false, hasRev: false, state: 'empty' };
    }
    if (rev.riposo) {
      return { gold: false, criteri: [], met: 0, riposo: true, hasRev: true, state: 'rest' };
    }
    const c = (CS.state.criteriOro && CS.state.criteriOro.sett) || { oreMinime: 2 };
    const oreMin = Number(c.oreMinime) || 2;
    const tgtFless = CS.getTargetVolumeForDay(dateIso, 'flessioni');
    const tgtSquat = CS.getTargetVolumeForDay(dateIso, 'squat');
    const tgtAddo  = CS.getTargetVolumeForDay(dateIso, 'addominali');
    const ore = Number(rev.oreAllenamento) || 0;
    const sess = Number(rev.sessioniGiorno) || (Array.isArray(rev.dettagliSessioni) ? rev.dettagliSessioni.length : 0);
    const tec = Number(rev.tecnica) || 0;
    const fless = Number(rev.flessioni) || 0;
    const squat = Number(rev.squat) || 0;
    const addo = Number(rev.addominali) || 0;
    const volumeMet = fless >= tgtFless && squat >= tgtSquat && addo >= tgtAddo;
    const criteri = [
      { id: 'ore', label: `≥${oreMin}h allenamento`, met: ore >= oreMin, cur: ore, tgt: oreMin },
      { id: 'sess', label: '≥2 sessioni', met: sess >= 2, cur: sess, tgt: 2 },
      { id: 'tec', label: 'Tecnica ≥8', met: tec >= 8, cur: tec, tgt: 8 },
      { id: 'vol', label: `Volume ${tgtFless}/${tgtSquat}/${tgtAddo}`, met: volumeMet, cur: `${fless}/${squat}/${addo}`, tgt: `${tgtFless}/${tgtSquat}/${tgtAddo}` },
    ];
    const met = criteri.filter(x => x.met).length;
    const gold = met === 4;
    const state = gold ? 'gold' : (met >= 2 ? 'orange' : 'red');
    return { gold, criteri, met, riposo: false, hasRev: true, state };
  }

  // ─── SETTIMANA D'ORO (criteri NUOVI 2026-06-22, estesi 2026-07-01) ─
  // 1) Allenamento 6 giorni su 7
  // 2) Almeno 2h/gg (nei 6 giorni di allenamento)
  // 3) 50 flessioni + 50 squat + 50 addo ogni giorno (nei 6 giorni)
  // 4) Corsa almeno 3 volte a settimana
  // 5) ≥4 giorni con ≥2 sessioni
  // 6) ≥5 giornate d'oro (aggregato)
  function settimanaTopCheck(date) {
    const c = (CS.state.criteriOro && CS.state.criteriOro.sett) || {
      giorniAllenamento: 6, oreMinime: 2, flessioniGiorno: 50, squatGiorno: 50, addoGiorno: 50, corseSett: 3,
    };
    const revs = revsInWeek(date);
    const allenati = revs.filter(r => !r.riposo && (Number(r.oreAllenamento) > 0));
    const giorniAllen = allenati.length;
    const giorniConOreOK = allenati.filter(r => Number(r.oreAllenamento) >= c.oreMinime).length;
    const giorniConVolumi = allenati.filter(r => {
      const tf = CS.getTargetVolumeForDay(r.data, 'flessioni');
      const ts = CS.getTargetVolumeForDay(r.data, 'squat');
      const ta = CS.getTargetVolumeForDay(r.data, 'addominali');
      return (Number(r.flessioni) || 0) >= tf
          && (Number(r.squat) || 0) >= ts
          && (Number(r.addominali) || 0) >= ta;
    }).length;
    const giorniConSess = allenati.filter(r => {
      const s = Number(r.sessioniGiorno) || (Array.isArray(r.dettagliSessioni) ? r.dettagliSessioni.length : 0);
      return s >= 2;
    }).length;
    // Corse della settimana: da r.kmCorsa > 0 OPPURE da CS.state.corsa entries
    const { start, end } = CS.weekRange(date);
    const corseDaRev = allenati.filter(r => (Number(r.kmCorsa) || 0) > 0).length;
    const corseDaLog = (CS.state.corsa || []).filter(c => inRange(c.data, start, end)).length;
    const corse = Math.max(corseDaRev, corseDaLog);
    // Giornate d'oro nella settimana
    const giornateOro = revs.filter(r => giornataOroCheck(r.data).gold).length;

    const criteri = [
      { id: 'giorni', label: `Allenamento ≥${c.giorniAllenamento}gg/7`, met: giorniAllen >= c.giorniAllenamento, val: `${giorniAllen}/7` },
      { id: 'ore', label: `≥${c.oreMinime}h/giorno`, met: giorniConOreOK >= c.giorniAllenamento, val: `${giorniConOreOK}/${c.giorniAllenamento}` },
      { id: 'sess', label: '≥2 sessioni ≥4gg/7', met: giorniConSess >= 4, val: `${giorniConSess}/4` },
      { id: 'volumi', label: `Volume target 6gg/7`, met: giorniConVolumi >= c.giorniAllenamento, val: `${giorniConVolumi}/${c.giorniAllenamento}` },
      { id: 'corse', label: `Corsa ≥${c.corseSett}/sett`, met: corse >= c.corseSett, val: `${corse}/${c.corseSett}` },
      { id: 'oro', label: '≥5 giornate d\'oro', met: giornateOro >= 5, val: `${giornateOro}/5` },
    ];
    const met = criteri.filter(x => x.met).length;
    return { gold: met === criteri.length, criteri, met, giornateOro, giorniAllenati: giorniAllen };
  }

  // ─── MESE D'ORO (criteri NUOVI) ─────────────────────
  // ≥ N settimane d'oro nel mese (default 3)
  function meseTopCheck(date) {
    const c = (CS.state.criteriOro && CS.state.criteriOro.mese) || { settimaneTop: 3 };
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear(), month = d.getMonth();
    const settInMese = settimaneInMese(year, month);
    let topCount = 0;
    settInMese.forEach(monday => {
      if (settimanaTopCheck(monday).gold) topCount++;
    });
    const criteri = [
      { id: 'sett_oro', label: `≥${c.settimaneTop} settimane d'oro`, met: topCount >= c.settimaneTop, val: `${topCount}/${settInMese.length}` },
    ];
    return { gold: topCount >= c.settimaneTop, criteri, met: criteri.filter(x => x.met).length, settTop: topCount, settTotal: settInMese.length };
  }

  function settimaneInMese(year, month) {
    // Ritorna array di Date (lunedì) di ogni settimana il cui inizio cade nel mese
    const result = [];
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    let cursor = new Date(first);
    // Trova primo lunedì >= first (incluso)
    const day = cursor.getDay() || 7;
    if (day !== 1) cursor.setDate(cursor.getDate() + (8 - day));
    while (cursor <= last) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return result;
  }

  // ─── PESO PACE (FISICA / peso) ──────────────────────
  // Stato: 'in_linea' | 'ritardo' | 'molto_ritardo' | 'raggiunto' | 'no_data'
  function pesoPaceStato() {
    const current = pesoCurrent();
    const target = CS.state.profile.pesoTarget;
    const dataTarget = CS.state.goalPace && CS.state.goalPace.dataTarget;
    if (!current || !target) return { stato: 'no_data', label: '—' };
    if (current <= target) return { stato: 'raggiunto', label: '🎯 RAGGIUNTO' };
    if (!dataTarget) return { stato: 'no_data', label: 'Imposta data target' };

    const oggi = new Date();
    const fine = new Date(dataTarget);
    const settRimaste = Math.max(0.5, (fine - oggi) / (1000 * 60 * 60 * 24 * 7));
    const kgRichiesti = current - target;
    const kgSettRichiesti = kgRichiesti / settRimaste;

    // Ritmo attuale: media ultimi 30gg
    const past30 = pesoMedio7gg(addDays(new Date(), -30));
    const now = pesoMedio7gg() || current;
    const kgInMese = past30 ? (past30 - now) : 0;  // positivo = sto calando
    const kgSettAttuale = kgInMese / 4.34;

    if (kgSettAttuale >= kgSettRichiesti * 0.95) {
      return { stato: 'in_linea', label: '✓ IN LINEA', kgSettRichiesti, kgSettAttuale, settRimaste };
    }
    const gap = (kgSettRichiesti - kgSettAttuale);
    const settRitardo = gap > 0 && kgSettAttuale > 0 ? Math.round(kgRichiesti / kgSettAttuale - settRimaste) : 99;
    if (settRitardo > 8) return { stato: 'molto_ritardo', label: `⚠⚠ MOLTO IN RITARDO (~${settRitardo} sett)`, kgSettRichiesti, kgSettAttuale, settRimaste };
    return { stato: 'ritardo', label: `⚠ IN RITARDO ~${Math.max(1, settRitardo)} sett`, kgSettRichiesti, kgSettAttuale, settRimaste };
  }

  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // ─── CORSA: PACE + ZONE FC ──────────────────────────
  function corsaPace(km, durataMin) {
    if (!km || !durataMin || km <= 0) return null;
    const minPerKm = durataMin / km;
    const m = Math.floor(minPerKm);
    const s = Math.round((minPerKm - m) * 60);
    return { totMin: minPerKm, formatted: `${m}:${String(s).padStart(2, '0')}` };
  }
  function corsaFCMax(eta) {
    return 220 - (eta || CS.state.profile.eta || 26);
  }
  function corsaZone(eta) {
    const fcMax = corsaFCMax(eta);
    return [
      { id: 'Z1', label: 'Recupero',  min: Math.round(fcMax * 0.50), max: Math.round(fcMax * 0.60) },
      { id: 'Z2', label: 'Endurance', min: Math.round(fcMax * 0.60), max: Math.round(fcMax * 0.70) },
      { id: 'Z3', label: 'Aerobica',  min: Math.round(fcMax * 0.70), max: Math.round(fcMax * 0.80) },
      { id: 'Z4', label: 'Soglia',    min: Math.round(fcMax * 0.80), max: Math.round(fcMax * 0.90) },
      { id: 'Z5', label: 'Massimale', min: Math.round(fcMax * 0.90), max: fcMax },
    ];
  }
  function corsaZonaByFC(fc, eta) {
    if (!fc) return null;
    const z = corsaZone(eta);
    return z.find(zone => fc >= zone.min && fc <= zone.max) || (fc > z[4].max ? z[4] : z[0]);
  }
  function corsaKmSett(date) {
    const { start, end } = CS.weekRange(date || new Date());
    return sum((CS.state.corsa || []).filter(c => inRange(c.data, start, end)).map(c => Number(c.km) || 0));
  }
  function corsaPaceMedio(days = 30) {
    const start = new Date(); start.setDate(start.getDate() - days);
    const recent = (CS.state.corsa || []).filter(c => new Date(c.data) >= start && c.km && c.durataMin);
    if (!recent.length) return null;
    const totMin = sum(recent.map(c => c.durataMin));
    const totKm = sum(recent.map(c => c.km));
    return corsaPace(totKm, totMin);
  }

  // ─── SONNO: DEBITO + CORRELAZIONI ───────────────────
  function sonnoDebito(targetH, days = 7) {
    const t = targetH || 7.5;
    const d = new Date();
    const start = new Date(d); start.setDate(d.getDate() - days);
    const recent = (CS.state.sonno || []).filter(s => inRange(s.data, start, d));
    if (!recent.length) return 0;
    return sum(recent.map(s => Math.max(0, t - (s.ore || 0))));
  }
  function sonnoCorrelazioneTecnica(sogliaH = 7) {
    // Confronta tecnica media nei giorni con sonno < soglia vs >= soglia
    const sonnoMap = new Map();
    (CS.state.sonno || []).forEach(s => sonnoMap.set(s.data, s.ore));
    const tecBassi = [], tecAlti = [];
    CS.state.revisioni.forEach(r => {
      if (!r.tecnica) return;
      const ore = sonnoMap.get(r.data) || r.sonnoOre;
      if (!ore) return;
      if (ore < sogliaH) tecBassi.push(r.tecnica);
      else tecAlti.push(r.tecnica);
    });
    return {
      sogliaH,
      tecnicaConPocoSonno: avg(tecBassi),
      tecnicaConBuonSonno: avg(tecAlti),
      campioneBasso: tecBassi.length,
      campioneAlto: tecAlti.length,
    };
  }

  // ─── INFORTUNI: PATTERN DETECTION ───────────────────
  function infortuniPattern(monthsBack = 6) {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const recenti = (CS.state.infortuni || []).filter(i => new Date(i.dataInizio) >= cutoff);
    const byParte = new Map();
    recenti.forEach(i => {
      const k = (i.parte || '').toLowerCase().trim();
      if (!k) return;
      if (!byParte.has(k)) byParte.set(k, []);
      byParte.get(k).push(i);
    });
    const pattern = [];
    byParte.forEach((arr, parte) => {
      if (arr.length >= 2) {
        pattern.push({
          parte,
          count: arr.length,
          episodi: arr,
          warning: arr.length >= 3 ? 'critica' : 'attenzione',
        });
      }
    });
    return pattern;
  }

  // ─── SESSIONI (TECNICA) ─────────────────────────────
  function sessioniSett(date) {
    const { start, end } = CS.weekRange(date || new Date());
    return (CS.state.sessioni || []).filter(s => inRange(s.data, start, end));
  }
  function sessioniOreSett(date) {
    const sess = sessioniSett(date);
    return sum(sess.map(s => {
      if (!s.oraInizio || !s.oraFine) return 0;
      const [h1, m1] = s.oraInizio.split(':').map(Number);
      const [h2, m2] = s.oraFine.split(':').map(Number);
      return ((h2 + m2 / 60) - (h1 + m1 / 60));
    }));
  }

  // ─── RADAR AREE (confronto temporale) ───────────────
  function radarAreaData(currentDays = 30, comparisonDaysBack = 90) {
    return CS.AREE_TECNICHE.map(area => {
      const current = votoMedioArea(area, currentDays);
      // comparison: voti tra "currentDays" e "currentDays + comparisonDaysBack"
      const startOld = new Date(); startOld.setDate(startOld.getDate() - (currentDays + comparisonDaysBack));
      const endOld = new Date(); endOld.setDate(endOld.getDate() - currentDays);
      const votiOld = CS.state.areeVoti.filter(v =>
        v.area === area &&
        new Date(v.data) >= startOld && new Date(v.data) < endOld);
      const comparison = avg(votiOld.map(v => v.voto));
      return { area, current: current || 0, comparison: comparison || 0 };
    });
  }

  // Come radarAreaData ma sui FONDAMENTALI (esercizi). Restituisce { area, current, comparison } per uniformità di rendering.
  function radarFondData(currentDays = 30, comparisonDaysBack = 90) {
    return CS.FONDAMENTALI.map(esercizio => {
      const current = votoMedioFond(esercizio, currentDays);
      const startOld = new Date(); startOld.setDate(startOld.getDate() - (currentDays + comparisonDaysBack));
      const endOld = new Date(); endOld.setDate(endOld.getDate() - currentDays);
      const votiOld = CS.state.fondVoti.filter(v =>
        v.esercizio === esercizio &&
        new Date(v.data) >= startOld && new Date(v.data) < endOld);
      const comparison = avg(votiOld.map(v => v.voto));
      return { area: esercizio, current: current || 0, comparison: comparison || 0 };
    });
  }

  // ─── OBIETTIVI ───────────────────────────────────────
  // Trova la rev aggregata (settimanale o mensile) salvata per il periodo dell'obiettivo,
  // oppure null. Usata come fallback quando le daily non coprono il periodo.
  function findAggRevForPeriod(scadenza, periodo) {
    if (scadenza === 'settimanale') {
      // periodo "YYYY-Www" → calcola lunedì
      const [year, w] = (periodo || '').split('-W');
      if (!year || !w) return null;
      const jan1 = new Date(Number(year), 0, 1);
      const days = (Number(w) - 1) * 7;
      const monday = new Date(jan1);
      monday.setDate(jan1.getDate() + days);
      // Allinea al lunedì (jan1 potrebbe non essere lunedì)
      const day = monday.getDay() || 7;
      monday.setDate(monday.getDate() - day + 1);
      const iso = CS.isoDateOnly(monday);
      return (CS.state.revSettimanali || []).find(r => r.weekStartISO === iso) || null;
    }
    if (scadenza === 'mensile') {
      return (CS.state.revMensili || []).find(r => r.monthKey === periodo) || null;
    }
    return null;
  }

  // Estrae il valore della metrica dalla rev aggregata.
  // Per categoria='custom' usa obj.customKey (es. 'x_orePesi') letto direttamente dall'aggregato.
  function aggRevValue(aggRev, categoria, customKey) {
    if (!aggRev) return 0;
    switch (categoria) {
      case 'ore':        return Number(aggRev.oreTot) || 0;
      case 'sessioni':   return Number(aggRev.sessTot) || 0;
      case 'flessioni':  return Number(aggRev.flessTot) || 0;
      case 'squat':      return Number(aggRev.squatTot) || 0;
      case 'addominali': return Number(aggRev.addoTot) || 0;
      case 'km':         return Number(aggRev.kmTot) || 0;
      case 'sonno':      return Number(aggRev.sonnoMedio) || 0;
      case 'custom':     return customKey ? (Number(aggRev[customKey]) || 0) : 0;
      default:           return 0;
    }
  }

  function progressObiettivo(obj) {
    // Per obiettivi non auto, è già su obj.completed o manual progress
    if (!obj.auto) {
      if (obj.scadenza === 'giornaliero') return { current: obj.completed ? obj.target : 0, pct: obj.completed ? 100 : 0 };
      return { current: obj.currentManual || 0, pct: Math.min(100, ((obj.currentManual || 0) / obj.target) * 100) };
    }
    // Auto: somma dai dati base (daily)
    const revs = revsForPeriod(obj.scadenza, obj.periodo);
    let current = 0;
    switch (obj.categoria) {
      case 'ore': current = sum(revs.map(r => Number(r.oreAllenamento) || 0)); break;
      case 'sessioni': current = revs.filter(r => !r.riposo && r.oreAllenamento > 0).length; break;
      case 'flessioni': current = sum(revs.map(r => Number(r.flessioni) || 0)); break;
      case 'squat': current = sum(revs.map(r => Number(r.squat) || 0)); break;
      case 'addominali': current = sum(revs.map(r => Number(r.addominali) || 0)); break;
      case 'km': current = sum(revs.map(r => Number(r.kmCorsa) || 0)); break;
      case 'tecnica':
        const tec = revs.map(r => r.tecnica).filter(Boolean);
        current = tec.length ? avg(tec) : 0;
        break;
      case 'sonno':
        const sl = revs.map(r => Number(r.sonnoOre) || 0).filter(Boolean);
        current = sl.length ? avg(sl) : 0;
        break;
      case 'peso':
        current = pesoCurrent() || 0;
        break;
      case 'custom': {
        const key = obj.customKey;
        if (key) current = sum(revs.map(r => Number(r[key]) || 0));
        break;
      }
    }
    // Fallback: se le daily non hanno coperto nulla per questo obiettivo, prova la rev aggregata
    // salvata (settimanale/mensile). Priorità: daily > rev aggregata. Mai sommare le due fonti.
    if (current === 0 && (obj.scadenza === 'settimanale' || obj.scadenza === 'mensile')) {
      const aggRev = findAggRevForPeriod(obj.scadenza, obj.periodo);
      const fallback = aggRevValue(aggRev, obj.categoria, obj.customKey);
      if (fallback > 0) current = fallback;
    }
    const pct = obj.target > 0 ? Math.min(100, (current / obj.target) * 100) : 0;
    return { current, pct };
  }

  function revsForPeriod(scadenza, periodo) {
    if (scadenza === 'giornaliero') return CS.state.revisioni.filter(r => r.data === periodo);
    if (scadenza === 'settimanale') {
      // periodo è "YYYY-Www" → ottieni range
      const [year, w] = periodo.split('-W');
      const jan1 = new Date(Number(year), 0, 1);
      const days = (Number(w) - 1) * 7;
      const monday = new Date(jan1);
      monday.setDate(jan1.getDate() + days);
      return revsInWeek(monday);
    }
    if (scadenza === 'mensile') {
      const [year, month] = periodo.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      return revsInMonth(d);
    }
    if (scadenza === 'annuale') {
      const year = Number(periodo);
      return CS.state.revisioni.filter(r => new Date(r.data).getFullYear() === year);
    }
    return [];
  }

  function obiettiviForPeriod(scadenza, periodo) {
    return CS.state.obiettivi.filter(o => o.scadenza === scadenza && (!periodo || o.periodo === periodo));
  }

  function pctObiettiviCompletati(scadenza, periodo) {
    let objs;
    if (scadenza === 'giornaliero') {
      objs = obiettiviForPeriod(scadenza, periodo || CS.todayISO());
    } else {
      objs = obiettiviForPeriod(scadenza);
    }
    if (!objs.length) return 0;
    const compl = objs.filter(o => {
      if (o.scadenza === 'giornaliero') return o.completed;
      return progressObiettivo(o).pct >= 100;
    }).length;
    return Math.round((compl / objs.length) * 100);
  }

  // ─── AREE / FONDAMENTALI ─────────────────────────────
  function votoMedioArea(area, days = 30) {
    const start = new Date(); start.setDate(start.getDate() - days);
    const voti = CS.state.areeVoti.filter(v => v.area === area && new Date(v.data) >= start);
    return avg(voti.map(v => v.voto));
  }

  function votoMedioFond(esercizio, days = 30) {
    const start = new Date(); start.setDate(start.getDate() - days);
    const voti = CS.state.fondVoti.filter(v => v.esercizio === esercizio && new Date(v.data) >= start);
    return avg(voti.map(v => v.voto));
  }

  function trendArea(area) {
    const ora = votoMedioArea(area, 30);
    const prima = votoMedioArea(area, 60);
    if (!ora || !prima) return 0;
    return ora - prima;
  }

  // ─── SPARKLINE data per archivio ────────────────────
  function sparkRevisioniMese() {
    const days = 30;
    const today = new Date();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i));
      const rev = CS.state.revisioni.find(r => r.data === CS.isoDateOnly(d));
      return rev ? (rev.oreAllenamento || 0) : 0;
    });
  }

  function sparkPesoMese() {
    const days = 30;
    const today = new Date();
    let last = pesoCurrent() || 0;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i));
      const p = CS.state.pesate.find(x => x.data === CS.isoDateOnly(d));
      if (p) last = p.kg;
      return last;
    });
  }

  function sparkSonnoMese() {
    const days = 30;
    const today = new Date();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i));
      const iso = CS.isoDateOnly(d);
      const s = CS.state.sonno.find(x => x.data === iso);
      const r = CS.state.revisioni.find(x => x.data === iso);
      return s?.ore || r?.sonnoOre || 0;
    });
  }

  // ─── PERSONAL RECORDS ───────────────────────────────
  function records() {
    const allRevs = CS.state.revisioni || [];
    const allCorsa = CS.state.corsa || [];
    const allPesate = CS.state.pesate || [];
    const tecnicaValori = allRevs.map(r => Number(r.tecnica) || 0).filter(x => x > 0);
    const fAll = allRevs.filter(r => Number(r.flessioni) > 0);
    const sAll = allRevs.filter(r => Number(r.squat) > 0);
    const oreAll = allRevs.filter(r => Number(r.oreAllenamento) > 0);
    const kmAll = allCorsa.filter(c => Number(c.km) > 0);
    const tecAll = allRevs.filter(r => Number(r.tecnica) > 0);
    const pickMax = (arr, key) => arr.reduce((best, x) => (Number(x[key]) > Number(best[key] || 0) ? x : best), {});
    const pickMin = (arr, key) => arr.reduce((best, x) => (best[key] === undefined || Number(x[key]) < Number(best[key]) ? x : best), {});
    const recF = pickMax(fAll, 'flessioni');
    const recS = pickMax(sAll, 'squat');
    const recO = pickMax(oreAll, 'oreAllenamento');
    const recK = pickMax(kmAll, 'km');
    const recT = pickMax(tecAll, 'tecnica');
    const recP = pickMin(allPesate, 'kg');
    return {
      maxFlessioni: { val: Number(recF.flessioni) || 0, data: recF.data || null },
      maxSquat:     { val: Number(recS.squat) || 0,     data: recS.data || null },
      maxOreGiorno: { val: Number(recO.oreAllenamento) || 0, data: recO.data || null },
      maxKmCorsa:   { val: Number(recK.km) || 0, data: recK.data || null },
      maxTecnica:   { val: Number(recT.tecnica) || 0, data: recT.data || null },
      pesoMin:      { val: Number(recP.kg) || 0, data: recP.data || null },
      maxStreak:    streakMax(),
    };
  }

  // ─── STREAK MIGLIORE DI SEMPRE ──────────────────────
  function streakMax() {
    const days = (CS.state.revisioni || []).map(r => r.data).sort();
    if (!days.length) return { val: 0, start: null, end: null };
    let bestLen = 0, bestStart = null, bestEnd = null;
    let curLen = 0, curStart = null, prev = null;
    days.forEach(iso => {
      const dt = new Date(iso);
      if (prev) {
        const diff = Math.round((dt - prev) / 86400000);
        if (diff === 1) {
          curLen++;
        } else {
          if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = CS.isoDateOnly(prev); }
          curLen = 1; curStart = iso;
        }
      } else {
        curLen = 1; curStart = iso;
      }
      prev = dt;
    });
    if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = CS.isoDateOnly(prev); }
    return { val: bestLen, start: bestStart, end: bestEnd };
  }

  // ─── DASHBOARD HELPERS ──────────────────────────────
  function volumiSett(date) {
    const revs = revsInWeek(date || new Date());
    return {
      flessioni: sum(revs.map(r => Number(r.flessioni) || 0)),
      squat: sum(revs.map(r => Number(r.squat) || 0)),
      addominali: sum(revs.map(r => Number(r.addominali) || 0)),
      kmCorsa: sum(revs.map(r => Number(r.kmCorsa) || 0)) + corsaKmSett(date),
    };
  }
  function oreSettVsTarget(date) {
    const ore = sum(revsInWeek(date || new Date()).map(r => Number(r.oreAllenamento) || 0));
    const target = (CS.state.targetSett && CS.state.targetSett.oreAllenamento) || 14;
    const pct = target > 0 ? Math.min(100, (ore / target) * 100) : 0;
    // Delta vs settimana precedente
    const past = new Date(date || new Date()); past.setDate(past.getDate() - 7);
    const orePast = sum(revsInWeek(past).map(r => Number(r.oreAllenamento) || 0));
    return { ore, target, pct, deltaVsPrev: ore - orePast };
  }
  function prossimoObiettivo() {
    const objs = (CS.state.obiettivi || []).filter(o => !o.completed);
    if (!objs.length) return null;
    // Ordina per scadenza più vicina
    const today = new Date();
    const withDays = objs.map(o => {
      let deadline = null;
      if (o.scadenza === 'giornaliero') deadline = new Date(o.periodo);
      else if (o.scadenza === 'settimanale') {
        const [y, w] = (o.periodo || '').split('-W');
        deadline = new Date(Number(y), 0, (Number(w) || 1) * 7);
      } else if (o.scadenza === 'mensile') {
        const [y, m] = (o.periodo || '').split('-');
        deadline = new Date(Number(y), Number(m), 0);
      } else if (o.scadenza === 'annuale') {
        deadline = new Date(Number(o.periodo) || today.getFullYear(), 11, 31);
      }
      const daysLeft = deadline ? Math.ceil((deadline - today) / 86400000) : 9999;
      return { obj: o, deadline, daysLeft };
    });
    withDays.sort((a, b) => a.daysLeft - b.daysLeft);
    const next = withDays.find(x => x.daysLeft >= 0) || withDays[0];
    return next || null;
  }

  // ─── CONFRONTO MESE (ARCHIVIO) ──────────────────────
  function confrontoMese(date) {
    const d = date instanceof Date ? date : new Date(date);
    const cur = revsInMonth(d);
    const past = new Date(d); past.setMonth(d.getMonth() - 1);
    const prev = revsInMonth(past);
    const aggCur = aggregateRevs(cur);
    const aggPrev = aggregateRevs(prev);
    return {
      mese: { y: d.getFullYear(), m: d.getMonth() + 1, agg: aggCur },
      precedente: { y: past.getFullYear(), m: past.getMonth() + 1, agg: aggPrev },
    };
  }

  // ─── HELPERS TEMPORALI per archivio Focus (v9) ──────
  function weekOrdinalOfMonth(weekStartISO) {
    if (!weekStartISO) return 0;
    const d = new Date(weekStartISO);
    if (isNaN(d)) return 0;
    return Math.floor((d.getDate() - 1) / 7) + 1; // 1..5
  }

  function isoWeekString(d) {
    const date = (d instanceof Date) ? new Date(d) : new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  function _yyyymmFromIso(iso) {
    if (!iso) return null;
    const s = String(iso);
    return s.length >= 7 ? s.slice(0, 7) : null;
  }

  function getMonthsAvailable() {
    const set = new Set();
    (CS.state.revisioni || []).forEach(r => { const m = _yyyymmFromIso(r.data); if (m) set.add(m); });
    (CS.state.revSettimanali || []).forEach(r => { const m = _yyyymmFromIso(r.weekStartISO); if (m) set.add(m); });
    (CS.state.revMensili || []).forEach(r => { if (r.monthKey) set.add(r.monthKey); });
    (CS.state.obiettivi || []).forEach(o => {
      if (!o.periodo) return;
      if (o.scadenza === 'mensile') set.add(o.periodo);
      else if (o.scadenza === 'giornaliero') { const m = _yyyymmFromIso(o.periodo); if (m) set.add(m); }
      else if (o.scadenza === 'settimanale') {
        // periodo 'YYYY-Www' → calcola mese del lunedì
        const m = (o.periodo || '').match(/^(\d{4})-W(\d{1,2})$/);
        if (m) {
          const jan1 = new Date(Number(m[1]), 0, 1);
          const monday = new Date(jan1);
          monday.setDate(jan1.getDate() + (Number(m[2]) - 1) * 7);
          set.add(`${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}`);
        }
      }
    });
    // include mese corrente come fallback
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    return Array.from(set).sort().reverse();
  }

  function getYearsAvailable() {
    const set = new Set();
    (CS.state.revisioni || []).forEach(r => { if (r.data) set.add(r.data.slice(0, 4)); });
    (CS.state.revSettimanali || []).forEach(r => { if (r.weekStartISO) set.add(r.weekStartISO.slice(0, 4)); });
    (CS.state.revMensili || []).forEach(r => { if (r.monthKey) set.add(r.monthKey.slice(0, 4)); });
    (CS.state.obiettivi || []).forEach(o => {
      if (!o.periodo) return;
      if (o.scadenza === 'annuale') set.add(String(o.periodo));
      else set.add(String(o.periodo).slice(0, 4));
    });
    set.add(String(new Date().getFullYear()));
    return Array.from(set).filter(y => /^\d{4}$/.test(y)).sort().reverse().map(Number);
  }

  function getWeeksOfMonth(monthKey) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return [];
    const [y, m] = monthKey.split('-').map(Number);
    const out = [];
    const last = new Date(y, m, 0).getDate(); // ultimo giorno del mese
    for (let day = 1; day <= last; day++) {
      const d = new Date(y, m - 1, day);
      // lunedì = 1 (JS getDay: 1)
      if (d.getDay() === 1) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const ord = weekOrdinalOfMonth(iso);
        const ordLabel = ['1ª', '2ª', '3ª', '4ª', '5ª'][ord - 1] || `${ord}ª`;
        const monthName = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'][m - 1];
        out.push({
          weekStartISO: iso,
          weekISO: isoWeekString(d),
          ordinal: ord,
          label: `${ordLabel} sett. di ${monthName}`,
        });
      }
    }
    return out;
  }

  function getDaysAvailable() {
    const set = new Set();
    (CS.state.revisioni || []).forEach(r => { if (r.data) set.add(r.data); });
    set.add(CS.todayISO ? CS.todayISO() : new Date().toISOString().slice(0, 10));
    return Array.from(set).sort().reverse();
  }

  // Periodo precedente per ogni scadenza (per confronto delta archivio obiettivi v10)
  function previousPeriodValue(periodo, scadenza) {
    if (!periodo || !scadenza) return null;
    if (scadenza === 'giornaliero') {
      const d = new Date(periodo);
      if (isNaN(d)) return null;
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (scadenza === 'settimanale') {
      const m = String(periodo).match(/^(\d{4})-W(\d{1,2})$/);
      if (!m) return null;
      const year = Number(m[1]); const week = Number(m[2]);
      const jan4 = new Date(year, 0, 4);
      const jan4Day = (jan4.getDay() + 6) % 7;
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - jan4Day + (week - 1) * 7);
      monday.setDate(monday.getDate() - 7);
      return isoWeekString(monday);
    }
    if (scadenza === 'mensile') {
      const m = String(periodo).match(/^(\d{4})-(\d{1,2})$/);
      if (!m) return null;
      const y = Number(m[1]); const mo = Number(m[2]);
      const prev = new Date(y, mo - 2, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }
    if (scadenza === 'annuale') {
      const y = Number(periodo);
      if (isNaN(y)) return null;
      return String(y - 1);
    }
    return null;
  }

  // ─── PUBLIC ─────────────────────────────────────────
  return {
    // helpers e utility
    inRange, avg, sum, addDays,

    // helpers temporali (Focus archivio v9)
    weekOrdinalOfMonth, isoWeekString, getMonthsAvailable, getYearsAvailable,
    getWeeksOfMonth, getDaysAvailable, previousPeriodValue,

    // revisioni / aggregazioni
    revsInWeek, revsInMonth, revsLastN, aggregateRevs, prevailingMood,

    // peso / sonno / streak
    pesoMedio7gg, pesoTrend7gg, pesoCurrent, pesoPaceStato,
    sonnoMedio, sonnoDebito, sonnoCorrelazioneTecnica,
    streakDays, streakMax,

    // criteri oro (NUOVI)
    giornataOroCheck, settimanaTopCheck, meseTopCheck, settimaneInMese,

    // dashboard helpers
    dayStatus, volumiSett, oreSettVsTarget, prossimoObiettivo,

    // obiettivi
    progressObiettivo, obiettiviForPeriod, pctObiettiviCompletati, revsForPeriod,

    // aree e fondamentali
    votoMedioArea, votoMedioFond, trendArea, radarAreaData, radarFondData,

    // corsa
    corsaPace, corsaFCMax, corsaZone, corsaZonaByFC, corsaKmSett, corsaPaceMedio,

    // sessioni
    sessioniSett, sessioniOreSett,

    // infortuni
    infortuniPattern,

    // sparkline data
    sparkRevisioniMese, sparkPesoMese, sparkSonnoMese,

    // record + confronto
    records, confrontoMese,
  };

})();
