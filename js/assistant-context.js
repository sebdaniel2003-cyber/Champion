/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8.2 — ASSISTANT CONTEXT ENGINE
   Il "secondo cervello": un contesto unico, calcolato una
   volta per ciclo di evaluate(), condiviso da tutte le
   regole. Tutto deterministico, tutto da dati reali.

   ASSISTANT_CTX.build()  → ricalcola e ritorna il contesto
   ASSISTANT_CTX.get()    → contesto corrente (build se assente)
   Struttura: { time, load, trends, state, gaps, patterns, memory }
   ═══════════════════════════════════════════════════════ */

const ASSISTANT_CTX = (function () {

  let ctx = null;

  // ─── STATISTICA ─────────────────────────────────────
  // Regressione lineare semplice: values = [{x: giorniFa (negativo→passato), y}]
  // Ritorna pendenza per unità di x (qui: per giorno).
  function slope(pts) {
    if (!pts || pts.length < 3) return null;
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.x, 0) / n;
    const my = pts.reduce((a, p) => a + p.y, 0) / n;
    let num = 0, den = 0;
    pts.forEach(p => { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; });
    return den === 0 ? null : num / den;
  }

  function daysAgo(iso, today) {
    return Math.round((today - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  }

  // ─── BUILD ──────────────────────────────────────────
  function build() {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const todayISO = CS.todayISO();
    const S = CS.state;

    // ═══ TIME ═══
    const h = now.getHours();
    const dow = (now.getDay() + 6) % 7; // 0=lun … 6=dom
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const nextEvent = (S.eventi || [])
      .filter(e => e.data && e.data >= todayISO)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(e => ({ ...e, giorni: -daysAgo(e.data, today) }))[0] || null;

    const time = {
      now, hour: h,
      fascia: h < 12 ? 'mattina' : h < 18 ? 'pomeriggio' : 'sera',
      dow, // 0=lun … 6=dom
      isDomenica: dow === 6,
      isFineMese: now.getDate() >= lastDayOfMonth - 1,
      nextEvent,
    };

    // ═══ LOAD (ore allenamento) ═══
    const revs = S.revisioni || [];
    const oreInLastN = (n) => revs.reduce((a, r) => {
      const d = daysAgo(r.data, today);
      return (d >= 0 && d < n) ? a + (Number(r.oreAllenamento) || 0) : a;
    }, 0);
    const ore3 = oreInLastN(3), ore7 = oreInLastN(7), ore28 = oreInLastN(28);
    const oreOggi = revs.filter(r => r.data === todayISO)
      .reduce((a, r) => a + (Number(r.oreAllenamento) || 0), 0);
    // ACWR: carico acuto (7gg) / cronico (media settimanale su 28gg).
    // Affidabile solo con un cronico minimo (≥8h/28gg).
    const cronicoSett = ore28 / 4;
    const acwr = (ore28 >= 8 && cronicoSett > 0) ? ore7 / cronicoSett : null;

    const load = { ore3, ore7, ore28, oreOggi, cronicoSett, acwr };

    // ═══ TRENDS ═══
    // Peso: pendenza kg/giorno su 14gg → kg/settimana e %/settimana
    const pesate14 = (S.pesate || [])
      .map(p => ({ x: -daysAgo(p.data, today), y: Number(p.kg) }))
      .filter(p => p.x >= -14 && p.x <= 0 && p.y > 0);
    const pesoSlopeDay = slope(pesate14);
    const pesoCurrent = CALC.pesoCurrent();
    const pesoKgSett = pesoSlopeDay != null ? pesoSlopeDay * 7 : null;
    const pesoPctSett = (pesoKgSett != null && pesoCurrent)
      ? (pesoKgSett / pesoCurrent) * 100 : null;

    // Sonno: pendenza h/giorno su 7gg + media
    const sonno7 = (S.sonno || [])
      .map(s => ({ x: -daysAgo(s.data, today), y: Number(s.ore) }))
      .filter(s => s.x >= -7 && s.x <= 0 && s.y > 0);
    const sonnoSlope = slope(sonno7);
    const sonnoMedia7 = sonno7.length
      ? sonno7.reduce((a, s) => a + s.y, 0) / sonno7.length : null;

    // Tecnica: pendenza voto/giorno su 30gg (aree + fondamentali) → per settimana
    const voti30 = [...(S.areeVoti || []), ...(S.fondVoti || [])]
      .map(v => ({ x: -daysAgo(v.data, today), y: Number(v.voto) }))
      .filter(v => v.x >= -30 && v.x <= 0 && v.y > 0);
    const tecnicaSlopeSett = voti30.length >= 6 ? (slope(voti30) || 0) * 7 : null;

    // Corsa: ultime 4 vs 4 precedenti — km e pace (min/km)
    const corse = (S.corsa || [])
      .filter(c => Number(c.km) > 0 && Number(c.durataMin) > 0)
      .sort((a, b) => b.data.localeCompare(a.data));
    const paceOf = arr => {
      const km = arr.reduce((a, c) => a + Number(c.km), 0);
      const min = arr.reduce((a, c) => a + Number(c.durataMin), 0);
      return km > 0 ? min / km : null;
    };
    const corsaTrend = corse.length >= 8 ? {
      kmRecenti:  corse.slice(0, 4).reduce((a, c) => a + Number(c.km), 0),
      kmPrec:     corse.slice(4, 8).reduce((a, c) => a + Number(c.km), 0),
      paceRecente: paceOf(corse.slice(0, 4)),
      pacePrec:    paceOf(corse.slice(4, 8)),
    } : null;

    const trends = { pesoKgSett, pesoPctSett, pesateCount14: pesate14.length,
                     sonnoSlope, sonnoMedia7, tecnicaSlopeSett, votiCount30: voti30.length,
                     corsaTrend };

    // ═══ STATE ═══
    const sett = CALC.settimanaTopCheck(now);
    const settMancanti = (sett.criteri || []).filter(c => !c.met);
    const infortunioAttivo = (S.infortuni || []).find(i => !i.dataFine) || null;
    const infChiusi = (S.infortuni || [])
      .filter(i => i.dataFine)
      .sort((a, b) => b.dataFine.localeCompare(a.dataFine));
    const infortunioChiusoRecente = infChiusi[0] && daysAgo(infChiusi[0].dataFine, today) <= 14
      ? { ...infChiusi[0], giorniFa: daysAgo(infChiusi[0].dataFine, today) } : null;
    // Carico pre-infortunio: ore nei 7gg prima di dataInizio dell'ultimo infortunio chiuso
    let orePreInfortunio = null;
    if (infortunioChiusoRecente && infortunioChiusoRecente.dataInizio) {
      const t0 = new Date(infortunioChiusoRecente.dataInizio); t0.setHours(0, 0, 0, 0);
      orePreInfortunio = revs.reduce((a, r) => {
        const d = Math.round((t0 - new Date(r.data).setHours(0, 0, 0, 0)) / 86400000);
        return (d > 0 && d <= 7) ? a + (Number(r.oreAllenamento) || 0) : a;
      }, 0);
    }
    // Mood negativi negli ultimi 3 giorni con revisione
    const last3 = CALC.revsLastN(3);
    const moodNegDays = last3.filter(r => (r.mood || []).some(m =>
      ((CS.MOOD_LIST || []).find(x => x.id === m) || {}).negative)).length;

    const oreVsTarget = CALC.oreSettVsTarget(now);
    const riposoOggi = revs.some(r => r.data === todayISO && r.riposo);

    const state = {
      streak: CALC.streakDays(),
      sett, settMancanti,
      giorniRimanentiSett: 6 - dow, // giorni ancora disponibili dopo oggi (dom → 0)
      infortunioAttivo, infortunioChiusoRecente, orePreInfortunio,
      moodNegDays,
      oreVsTarget,
      pesoCurrent, pesoTarget: (S.profile || {}).pesoTarget || null,
      riposoOggi,
    };

    // ═══ GAPS (giorni dall'ultimo …) ═══
    const lastOf = (arr, field = 'data') => {
      const d = (arr || []).map(x => x[field]).filter(Boolean).sort().pop();
      return d ? daysAgo(d, today) : null;
    };
    const gaps = {
      pesata: lastOf(S.pesate),
      corsa: lastOf(S.corsa),
      revisione: lastOf(revs),
      pasto: lastOf(S.pasti),
      riflessione: lastOf(revs.filter(r => (r.bene || '').trim() || (r.migliora || '').trim())),
    };

    // ═══ PATTERNS ═══
    // Giorno della settimana sistematicamente saltato (ultime 8 settimane):
    // un dow è "debole" se ha ≥3 assenze di revisione e un tasso di assenza
    // almeno doppio rispetto alla media degli altri giorni.
    const misses = [0, 0, 0, 0, 0, 0, 0], slots = [0, 0, 0, 0, 0, 0, 0];
    const revSet = new Set(revs.map(r => r.data));
    for (let d = 1; d <= 56; d++) {
      const day = new Date(today); day.setDate(today.getDate() - d);
      const iso = CS.isoDateOnly(day);
      const wd = (day.getDay() + 6) % 7;
      slots[wd]++;
      if (!revSet.has(iso)) misses[wd]++;
    }
    let dowSkip = null;
    if (revs.length >= 20) {
      const rates = misses.map((m, i) => slots[i] ? m / slots[i] : 0);
      const NOMI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
      rates.forEach((r, i) => {
        const others = rates.filter((_, j) => j !== i);
        const avgOthers = others.reduce((a, b) => a + b, 0) / others.length;
        if (misses[i] >= 4 && r >= 0.5 && r >= avgOthers * 2 && (!dowSkip || r > dowSkip.rate)) {
          dowSkip = { dow: i, nome: NOMI[i], rate: r, misses: misses[i] };
        }
      });
    }
    const patterns = { dowSkip };

    // ═══ MEMORY (assistantHistory finalmente riletta) ═══
    const hist = S.assistantHistory || [];
    const perRule = {};
    hist.forEach(hh => {
      if (!hh.ruleId) return;
      const m = perRule[hh.ruleId] = perRule[hh.ruleId] ||
        { ackCount: 0, snoozeCount: 0, gotoCount: 0, lastAckTs: null, lastAnyTs: null };
      const ts = hh.data ? Date.parse(hh.data) : null;
      if (ts && (!m.lastAnyTs || ts > m.lastAnyTs)) m.lastAnyTs = ts;
      const az = hh.azione || '';
      if (az === 'ack') { m.ackCount++; if (ts && (!m.lastAckTs || ts > m.lastAckTs)) m.lastAckTs = ts; }
      else if (az.startsWith('snooze')) m.snoozeCount++;
      else if (az.startsWith('goto')) m.gotoCount++;
    });

    const memory = {
      perRule,
      // ack recente → cooldown (la regola non torna identica per N giorni;
      // N raddoppia se la snoozzi spesso: apprendimento passivo)
      isCoolingDown(ruleId, baseDays = 2) {
        const m = perRule[ruleId];
        if (!m || !m.lastAckTs) return false;
        const days = m.snoozeCount >= 3 ? baseDays * 2 : baseDays;
        return (Date.now() - m.lastAckTs) < days * 86400000;
      },
      // moltiplicatore di priorità appreso dalle tue risposte
      engagement(ruleId) {
        const m = perRule[ruleId];
        if (!m) return 0;
        return Math.max(-30, Math.min(30, m.gotoCount * 8 - m.snoozeCount * 10));
      },
    };

    ctx = { time, load, trends, state, gaps, patterns, memory };
    return ctx;
  }

  return {
    build,
    get: () => ctx || build(),
    invalidate: () => { ctx = null; },
    _slope: slope, // esposto per test
  };

})();
