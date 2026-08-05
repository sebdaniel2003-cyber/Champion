/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — ASSISTENTE: REGOLE
   Riscrittura 2026-06-22 (rivoluzione)
   ~30 regole · 4 personalità · sistema conversazionale
   ═══════════════════════════════════════════════════════

   Schema regola:
   {
     id:         'string univoco',
     persona:    'coach' | 'nutrizione' | 'mentale' | 'recupero',
     icon:       '🥊' | '🥗' | '🧠' | '🚑',
     severity:   'critica' | 'attenzione' | 'positivo' | 'info',
     pages:      ['dashboard', 'fisica/peso', ...]   // pagine in cui mostrare widget contestuale
     condition:  () => boolean,
     message:    () => 'analisi del dato',
     question:   () => 'domanda da porre all utente' (opzionale)
     answers:    () => [ { label, action } ]         // azioni:
                       //   goto:section/sub
                       //   snooze:1d|3d|7d
                       //   ack
                       //   modal:nomeModale
     cta:        { label, route }                    // shortcut (opzionale, alternativa a answers)
   }
   ═══════════════════════════════════════════════════════ */

const PERSONA_LABEL = {
  coach:      'COACH',
  nutrizione: 'NUTRIZIONE',
  mentale:    'MENTALE',
  recupero:   'RECUPERO',
};

const PERSONA_ICON = {
  coach: '🥊', nutrizione: '🥗', mentale: '🧠', recupero: '🚑',
};

const PERSONA_INTRO = {
  coach:      'Disciplina, volumi, qualità tecnica. Ti tiene in carreggiata.',
  nutrizione: 'Peso, kcal, idratazione, recupero alimentare. Ti calibra.',
  mentale:    'Mood, sonno, focus, visione. Ti tiene lucido.',
  recupero:   'Infortuni, scarico, rigenerazione. Ti tiene intero.',
};

const ASSISTANT_RULES = [

  // ═════════════════════════════════════════════════════
  // 🥊 COACH (8 regole)
  // ═════════════════════════════════════════════════════
  {
    id: 'coach_streak_alto',
    persona: 'coach', icon: '🥊', severity: 'positivo',
    pages: ['dashboard'],
    condition: () => CALC.streakDays() >= 5,
    message: () => `${CALC.streakDays()}° giorno consecutivo di allenamento. Costanza top.`,
    question: () => 'Vuoi alzare il target settimanale?',
    answers: () => [
      { label: 'SÌ, +1h', action: 'modal:targetSettUp' },
      { label: 'OK COSÌ', action: 'ack' },
    ],
  },
  {
    id: 'coach_salto_3gg',
    persona: 'coach', icon: '🥊', severity: 'attenzione',
    pages: ['dashboard', 'tecnica/sessioni'],
    condition: () => {
      const last3 = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i - 1);
        return CS.state.revisioni.find(r => r.data === CS.isoDateOnly(d));
      });
      return last3.every(r => !r || r.riposo || !r.oreAllenamento);
    },
    message: () => '3 giorni senza allenamento attivo. Tutto ok? Riprendi anche solo 30 min.',
    question: () => 'Come ripartiamo?',
    answers: () => [
      { label: 'SESSIONE OGGI',     action: 'goto:tecnica/sessioni' },
      { label: 'DOMANI MATTINA',    action: 'snooze:1d' },
      { label: 'STOP, INFORTUNATO', action: 'goto:tecnica/infortuni' },
    ],
  },
  {
    id: 'coach_tecnica_calo',
    persona: 'coach', icon: '🥊', severity: 'attenzione',
    pages: ['tecnica/aree'],
    condition: () => {
      const recent = CALC.revsLastN(5).map(r => r.tecnica).filter(Boolean);
      const past   = CALC.revsLastN(35).slice(5).map(r => r.tecnica).filter(Boolean);
      if (recent.length < 3 || past.length < 3) return false;
      return (CALC.avg(past) - CALC.avg(recent)) >= 1.5;
    },
    message: () => {
      const r = CALC.avg(CALC.revsLastN(5).map(x => x.tecnica).filter(Boolean));
      const p = CALC.avg(CALC.revsLastN(35).slice(5).map(x => x.tecnica).filter(Boolean));
      return `Tecnica in calo: ${r.toFixed(1)} vs ${p.toFixed(1)} del mese.`;
    },
    question: () => 'Su cosa concentriamo la prossima sessione?',
    answers: () => [
      { label: 'AREE DEBOLI',  action: 'goto:tecnica/aree' },
      { label: 'FONDAMENTALI', action: 'goto:tecnica/fondamentali' },
      { label: 'NUOVA SESS.',  action: 'goto:tecnica/sessioni' },
    ],
  },
  {
    id: 'coach_ore_sett_basse',
    persona: 'coach', icon: '🥊', severity: 'info',
    pages: ['dashboard'],
    condition: () => {
      const r = CALC.oreSettVsTarget();
      const today = new Date().getDay() || 7;
      return today >= 4 && r.pct < 50;     // da giovedì in poi sotto 50%
    },
    message: () => {
      const r = CALC.oreSettVsTarget();
      return `Allenamento della settimana: ${CS.fmtDurata(r.ore)} su ${CS.fmtDurata(r.target)} (${Math.round(r.pct)}%). Ne servono ancora ${CS.fmtDurata(r.target - r.ore)}.`;
    },
    question: () => 'Vuoi pianificare le sessioni mancanti?',
    answers: () => [
      { label: 'PIANIFICA',  action: 'goto:tecnica/sessioni' },
      { label: 'CALA TARGET', action: 'modal:targetSettDown' },
      { label: 'OK SO',      action: 'ack' },
    ],
  },
  {
    id: 'coach_target_sett_ok',
    persona: 'coach', icon: '🥊', severity: 'positivo',
    pages: ['dashboard'],
    condition: () => {
      const r = CALC.oreSettVsTarget();
      return r.pct >= 100;
    },
    message: () => {
      const r = CALC.oreSettVsTarget();
      return `Target settimanale raggiunto: ${r.ore.toFixed(1)}/${r.target}h.`;
    },
    question: () => 'Settimana chiusa. Cosa facciamo?',
    answers: () => [
      { label: 'CONTINUO',     action: 'ack' },
      { label: 'GIORNO OFF',   action: 'modal:planRest' },
      { label: 'ALZA TARGET',  action: 'modal:targetSettUp' },
    ],
  },
  {
    id: 'coach_area_dormiente',
    persona: 'coach', icon: '🥊', severity: 'info',
    pages: ['tecnica/aree'],
    condition: () => {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
      return CS.AREE_TECNICHE.some(area => {
        const latest = (CS.state.areeVoti || [])
          .filter(v => v.area === area)
          .sort((a, b) => b.data.localeCompare(a.data))[0];
        return latest && new Date(latest.data) < cutoff;
      });
    },
    message: () => {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
      const stale = CS.AREE_TECNICHE.find(area => {
        const latest = (CS.state.areeVoti || [])
          .filter(v => v.area === area)
          .sort((a, b) => b.data.localeCompare(a.data))[0];
        return latest && new Date(latest.data) < cutoff;
      });
      return `Area "${stale}" non valutata da 2+ settimane.`;
    },
    question: () => 'Cosa fare?',
    answers: () => [
      { label: 'VALUTA ORA',   action: 'goto:tecnica/aree' },
      { label: 'LA SETT. PROX', action: 'snooze:7d' },
    ],
  },
  {
    id: 'coach_sett_oro_vicina',
    persona: 'coach', icon: '🥊', severity: 'positivo',
    pages: ['dashboard'],
    condition: () => {
      const c = CALC.settimanaTopCheck(new Date());
      return c.met >= 3 && !c.gold;
    },
    message: () => {
      const c = CALC.settimanaTopCheck(new Date());
      const m = c.criteri.find(x => !x.met);
      return `Settimana d'oro a un passo. Manca: ${m.label} (${m.val}).`;
    },
    question: () => 'Quanto ti spingi?',
    answers: () => [
      { label: 'CHIUDO LA SETT.', action: 'ack' },
      { label: 'STO BENE COSÌ',   action: 'ack' },
    ],
  },
  {
    id: 'coach_volume_volumi',
    persona: 'coach', icon: '🥊', severity: 'info',
    pages: ['dashboard'],
    condition: () => {
      const v = CALC.volumiSett();
      const c = (CS.state.criteriOro && CS.state.criteriOro.sett) || {};
      const targetF = (c.flessioniGiorno || 50) * (c.giorniAllenamento || 6);
      return v.flessioni > 0 && v.flessioni < targetF * 0.5;
    },
    message: () => {
      const v = CALC.volumiSett();
      return `Volumi sett. bassi: ${v.flessioni} flessioni, ${v.squat} squat.`;
    },
    question: () => '+50 fless + 50 squat oggi?',
    answers: () => [
      { label: 'FATTO',    action: 'ack' },
      { label: 'STASERA',  action: 'snooze:1d' },
    ],
  },

  // ═════════════════════════════════════════════════════
  // 🥗 NUTRIZIONE (7 regole)
  // ═════════════════════════════════════════════════════
  {
    id: 'nutri_peso_su_2sett',
    persona: 'nutrizione', icon: '🥗', severity: 'attenzione',
    pages: ['fisica/peso'],
    condition: () => {
      const w0 = CALC.pesoMedio7gg(new Date());
      const w2 = CALC.pesoMedio7gg(CALC.addDays(new Date(), -14));
      return w0 && w2 && (w0 - w2) >= 0.5;
    },
    message: () => {
      const w0 = CALC.pesoMedio7gg(new Date());
      const w2 = CALC.pesoMedio7gg(CALC.addDays(new Date(), -14));
      return `Peso in salita: +${(w0 - w2).toFixed(1)}kg in 2 settimane.`;
    },
    question: () => 'Da dove partiamo?',
    answers: () => [
      { label: 'CONTROLLA KCAL', action: 'goto:fisica/nutrizione' },
      { label: 'PIÙ CARDIO',     action: 'goto:fisica/corsa' },
      { label: 'È MASSA',        action: 'ack' },
    ],
  },
  {
    id: 'nutri_peso_target_vicino',
    persona: 'nutrizione', icon: '🥗', severity: 'positivo',
    pages: ['fisica/peso', 'dashboard'],
    condition: () => {
      const cur = CALC.pesoCurrent();
      if (!cur) return false;
      return Math.abs(cur - CS.state.profile.pesoTarget) < 1;
    },
    message: () => {
      const cur = CALC.pesoCurrent();
      const delta = Math.abs(cur - CS.state.profile.pesoTarget);
      return `A ${delta.toFixed(1)}kg dal target ${CS.state.profile.pesoTarget}kg. Mantieni linea, no tagli drastici.`;
    },
    question: () => 'Vuoi un piano di mantenimento?',
    answers: () => [
      { label: 'SÌ', action: 'goto:fisica/nutrizione' },
      { label: 'OK', action: 'ack' },
    ],
  },
  {
    id: 'nutri_pesata_mancante',
    persona: 'nutrizione', icon: '🥗', severity: 'info',
    pages: ['dashboard', 'fisica/peso'],
    condition: () => {
      const last = CS.getLastPesata();
      if (!last) return true;
      const days = (new Date() - new Date(last.data)) / 86400000;
      return days > 7;
    },
    message: () => {
      const last = CS.getLastPesata();
      if (!last) return 'Nessuna pesata registrata. Inizia: mattino, a digiuno.';
      const d = Math.floor((new Date() - new Date(last.data)) / 86400000);
      return `Ultima pesata ${d} giorni fa. Senza dati il pace è cieco.`;
    },
    question: () => 'Quando ti pesi?',
    answers: () => [
      { label: 'ORA',          action: 'goto:fisica/peso' },
      { label: 'DOMANI MATTINA', action: 'snooze:1d' },
    ],
  },
  {
    id: 'nutri_goal_pace_ritardo',
    persona: 'nutrizione', icon: '🥗', severity: 'attenzione',
    pages: ['fisica/peso'],
    condition: () => {
      const p = CALC.pesoPaceStato();
      return p.stato === 'ritardo' || p.stato === 'molto_ritardo';
    },
    message: () => {
      const p = CALC.pesoPaceStato();
      if (!p.kgSettRichiesti) return p.label;
      return `${p.label}. Servono ${p.kgSettRichiesti.toFixed(2)}kg/sett, vai a ${(p.kgSettAttuale || 0).toFixed(2)}kg/sett.`;
    },
    question: () => 'Modifichiamo il piano?',
    answers: () => [
      { label: 'CALA KCAL',      action: 'goto:fisica/nutrizione' },
      { label: 'SPOSTA TARGET',  action: 'modal:setGoalPace' },
      { label: 'OK INSISTO',     action: 'ack' },
    ],
  },
  {
    id: 'nutri_goal_pace_ok',
    persona: 'nutrizione', icon: '🥗', severity: 'positivo',
    pages: ['fisica/peso'],
    condition: () => CALC.pesoPaceStato().stato === 'in_linea',
    message: () => 'Pace peso in linea col target. Procedere senza modifiche.',
  },
  {
    id: 'nutri_recupero_dopo_intensa',
    persona: 'nutrizione', icon: '🥗', severity: 'info',
    pages: ['dashboard', 'fisica/nutrizione'],
    condition: () => {
      const yesterday = CS.isoDateOnly(CALC.addDays(new Date(), -1));
      const r = CS.state.revisioni.find(x => x.data === yesterday);
      return r && (r.affaticamento || 0) >= 8;
    },
    message: () => 'Ieri sessione molto pesante. Oggi serve +200kcal e 8h+ di sonno.',
    question: () => 'Hai mangiato carbo + proteine post-allenamento?',
    answers: () => [
      { label: 'SÌ',    action: 'ack' },
      { label: 'NO',    action: 'goto:fisica/nutrizione' },
    ],
  },
  {
    id: 'nutri_pasti_non_loggati',
    persona: 'nutrizione', icon: '🥗', severity: 'info',
    pages: ['fisica/nutrizione'],
    condition: () => {
      const cutoff = CALC.addDays(new Date(), -3);
      const recent = (CS.state.pasti || []).filter(p => new Date(p.data) >= cutoff);
      return recent.length === 0;
    },
    message: () => 'Nessun pasto loggato negli ultimi 3 giorni.',
    question: () => 'Vuoi iniziare il log?',
    answers: () => [
      { label: 'SÌ',         action: 'goto:fisica/nutrizione' },
      { label: 'NON ORA',    action: 'snooze:3d' },
    ],
  },

  // ═════════════════════════════════════════════════════
  // 🧠 MENTALE (8 regole)
  // ═════════════════════════════════════════════════════
  {
    id: 'mentale_mood_neg_3gg',
    persona: 'mentale', icon: '🧠', severity: 'attenzione',
    pages: ['dashboard'],
    condition: () => {
      const last3 = CALC.revsLastN(3);
      if (last3.length < 3) return false;
      return last3.every(r => (r.mood || []).some(m =>
        (CS.MOOD_LIST.find(x => x.id === m) || {}).negative));
    },
    message: () => 'Mood basso da 3 giorni di fila. Forse serve 1 giorno OFF vero.',
    question: () => 'Cosa ti aiuta di più?',
    answers: () => [
      { label: 'GIORNO OFF',     action: 'modal:planRest' },
      { label: 'CAMBIO ROUTINE', action: 'goto:focus/visione' },
      { label: 'ALLENO COMUNQUE', action: 'ack' },
    ],
  },
  {
    id: 'mentale_mood_top_streak',
    persona: 'mentale', icon: '🧠', severity: 'positivo',
    pages: ['dashboard'],
    condition: () => {
      const last3 = CALC.revsLastN(3);
      if (last3.length < 3) return false;
      return last3.every(r => (r.mood || []).some(m =>
        ['feroce', 'fiamme', 'concentrato'].includes(m)));
    },
    message: () => 'Sei in fase top da 3 giorni. Sfrutta questo momentum.',
    question: () => 'Cosa attacchi oggi?',
    answers: () => [
      { label: 'SESS. PESANTE',  action: 'goto:tecnica/sessioni' },
      { label: 'NUOVA AREA',     action: 'goto:tecnica/aree' },
      { label: 'TUTTO COME OGGI', action: 'ack' },
    ],
  },
  {
    id: 'mentale_sonno_debito',
    persona: 'mentale', icon: '🧠', severity: 'attenzione',
    pages: ['fisica/sonno', 'dashboard'],
    condition: () => {
      const s = CALC.sonnoMedio(7);
      return s && s < 7;
    },
    message: () => {
      const s = CALC.sonnoMedio(7);
      return `Sonno medio ${CS.fmtDurata(s)} a notte. Sotto le 7 ore tecnica e recupero soffrono.`;
    },
    question: () => 'Quando torni a 8h?',
    answers: () => [
      { label: 'STASERA',     action: 'ack' },
      { label: 'DOMANI',      action: 'snooze:1d' },
      { label: 'NON POSSO',   action: 'goto:fisica/sonno' },
    ],
  },
  {
    id: 'mentale_sonno_qualita',
    persona: 'mentale', icon: '🧠', severity: 'info',
    pages: ['fisica/sonno'],
    condition: () => {
      const last3 = (CS.state.sonno || []).slice(-3);
      return last3.length >= 3 && last3.every(s => (s.qualita || 5) < 3);
    },
    message: () => 'Qualità sonno bassa 3 notti di fila.',
    question: () => 'Cosa proviamo?',
    answers: () => [
      { label: 'NO SCHERMI 1h',   action: 'ack' },
      { label: 'NO CAFFÈ DOPO 14', action: 'ack' },
      { label: 'CONTROLLO AMBIENTE', action: 'ack' },
    ],
  },
  {
    id: 'mentale_rev_mancante_sera',
    persona: 'mentale', icon: '🧠', severity: 'info',
    pages: ['dashboard'],
    condition: () => {
      const today = CS.todayISO();
      const rev = CS.state.revisioni.find(r => r.data === today);
      const hour = new Date().getHours();
      return !rev && hour >= 21;
    },
    message: () => 'Revisione di oggi mancante. 2 minuti adesso ti salvano la settimana.',
    cta: { label: 'COMPILA ORA', route: 'archivio/revisioni' },
    answers: () => [
      { label: 'COMPILO',  action: 'modal:openRevDaily' },
      { label: 'DOMANI',   action: 'snooze:1d' },
    ],
  },
  {
    id: 'mentale_riflessione_assente',
    persona: 'mentale', icon: '🧠', severity: 'info',
    pages: ['archivio/revisioni'],
    condition: () => {
      const last7 = CALC.revsLastN(7);
      if (last7.length < 5) return false;
      return last7.every(r => !r.bene && !r.male && !r.riflessione);
    },
    message: () => 'Le ultime revisioni sono solo numeri. Scrivi cosa senti — vale più del voto.',
    question: () => 'Vuoi farlo ora?',
    answers: () => [
      { label: 'SÌ',     action: 'modal:openRevDaily' },
      { label: 'DOPO',   action: 'snooze:1d' },
    ],
  },
  {
    id: 'mentale_sonno_tecnica',
    persona: 'mentale', icon: '🧠', severity: 'info',
    pages: ['fisica/sonno'],
    condition: () => {
      const c = CALC.sonnoCorrelazioneTecnica(7);
      if (!c.tecnicaConPocoSonno || !c.tecnicaConBuonSonno) return false;
      if (c.campioneBasso < 3 || c.campioneAlto < 3) return false;
      return (c.tecnicaConBuonSonno - c.tecnicaConPocoSonno) >= 1;
    },
    message: () => {
      const c = CALC.sonnoCorrelazioneTecnica(7);
      return `Quando dormi ≥7h la tecnica sale: ${c.tecnicaConBuonSonno.toFixed(1)} vs ${c.tecnicaConPocoSonno.toFixed(1)}.`;
    },
  },
  {
    id: 'mentale_visione_assente',
    persona: 'mentale', icon: '🧠', severity: 'info',
    pages: ['focus/visione'],
    condition: () => {
      const v = CS.state.visione || {};
      return !v.y1 && !v.y3 && !v.y5;
    },
    message: () => 'Visione 1y/3y/5y vuota. Senza direzione, il lavoro è solo movimento.',
    cta: { label: 'SCRIVI VISIONE', route: 'focus/visione' },
  },

  // ═════════════════════════════════════════════════════
  // 🚑 RECUPERO (7 regole)
  // ═════════════════════════════════════════════════════
  {
    id: 'recupero_infortunio_attivo',
    persona: 'recupero', icon: '🚑', severity: 'critica',
    pages: ['dashboard', 'tecnica/infortuni', 'tecnica/sessioni'],
    condition: () => (CS.state.infortuni || []).some(i => !i.dataFine),
    message: () => {
      const inf = (CS.state.infortuni || []).find(i => !i.dataFine);
      if (!inf) return '';
      const days = Math.floor((new Date() - new Date(inf.dataInizio)) / 86400000);
      return `${inf.parte} attivo · gravità ${inf.gravita}/10 · ${days}gg. Evita carichi sulla zona.`;
    },
    cta: { label: 'VEDI INFORTUNI', route: 'tecnica/infortuni' },
  },
  {
    id: 'recupero_infortunio_old',
    persona: 'recupero', icon: '🚑', severity: 'info',
    pages: ['tecnica/infortuni'],
    condition: () => (CS.state.infortuni || []).some(i => {
      if (i.dataFine) return false;
      return (new Date() - new Date(i.dataInizio)) / 86400000 > 14;
    }),
    message: () => {
      const inf = (CS.state.infortuni || []).find(i => !i.dataFine
        && (new Date() - new Date(i.dataInizio)) / 86400000 > 14);
      if (!inf) return '';
      const d = Math.floor((new Date() - new Date(inf.dataInizio)) / 86400000);
      return `${inf.parte} attivo da ${d}gg. Aggiorna lo stato?`;
    },
    question: () => 'Come va?',
    answers: () => [
      { label: 'RISOLTO',     action: 'modal:closeInjury' },
      { label: 'IN CURA',     action: 'goto:tecnica/infortuni' },
      { label: 'PEGGIORATO',  action: 'goto:tecnica/infortuni' },
    ],
  },
  {
    id: 'recupero_pattern',
    persona: 'recupero', icon: '🚑', severity: 'attenzione',
    pages: ['tecnica/infortuni'],
    condition: () => CALC.infortuniPattern(6).length > 0,
    message: () => {
      const p = CALC.infortuniPattern(6)[0];
      return `${p.count} infortuni a "${p.parte}" in 6 mesi. Valuta mobilità + tecnica + scarpe.`;
    },
    question: () => 'Vuoi vedere lo storico?',
    answers: () => [
      { label: 'STORICO', action: 'goto:tecnica/infortuni' },
      { label: 'OK',      action: 'ack' },
    ],
  },
  {
    id: 'recupero_completato',
    persona: 'recupero', icon: '🚑', severity: 'positivo',
    pages: ['tecnica/infortuni'],
    condition: () => (CS.state.infortuni || []).some(i => {
      if (!i.dataFine) return false;
      const d = (new Date() - new Date(i.dataFine)) / 86400000;
      return d > 28 && d < 35;
    }),
    message: () => 'Ultimo infortunio risolto da 30+ giorni. Torna al 100% con gradualità.',
  },
  {
    id: 'recupero_giornata_off',
    persona: 'recupero', icon: '🚑', severity: 'attenzione',
    pages: ['dashboard'],
    condition: () => {
      const streak = CALC.streakDays();
      const last7 = CALC.revsLastN(7);
      const aff = CALC.avg(last7.map(r => r.affaticamento).filter(Boolean));
      return streak >= 7 && aff && aff >= 7;
    },
    message: () => {
      const aff = CALC.avg(CALC.revsLastN(7).map(r => r.affaticamento).filter(Boolean));
      return `${CALC.streakDays()}gg di fila e affaticamento medio ${aff.toFixed(1)}/10. Giornata OFF.`;
    },
    question: () => 'Quando?',
    answers: () => [
      { label: 'OGGI',     action: 'modal:planRest' },
      { label: 'DOMANI',   action: 'snooze:1d' },
      { label: 'STO BENE', action: 'ack' },
    ],
  },
  {
    id: 'recupero_fc_alta_post_carico',
    persona: 'recupero', icon: '🚑', severity: 'info',
    pages: ['fisica/corsa'],
    condition: () => {
      const last = (CS.state.corsa || []).slice(-1)[0];
      if (!last || !last.fcMedia) return false;
      const fcMax = CALC.corsaFCMax();
      return last.fcMedia >= fcMax * 0.9;
    },
    message: () => {
      const last = (CS.state.corsa || []).slice(-1)[0];
      return `Ultima corsa FC media ${last.fcMedia} (zona massimale). Recupero attivo prossima uscita.`;
    },
  },
  {
    id: 'recupero_sonno_post_intensa',
    persona: 'recupero', icon: '🚑', severity: 'attenzione',
    pages: ['fisica/sonno'],
    condition: () => {
      const yesterday = CS.isoDateOnly(CALC.addDays(new Date(), -1));
      const r = CS.state.revisioni.find(x => x.data === yesterday);
      const s = (CS.state.sonno || []).find(x => x.data === yesterday);
      if (!r || !s) return false;
      return (r.affaticamento || 0) >= 7 && (s.ore || 0) < 6;
    },
    message: () => 'Ieri sessione tosta + meno di 6h di sonno. Recupero compromesso.',
    question: () => 'Stanotte?',
    answers: () => [
      { label: '+1h DI SONNO',  action: 'ack' },
      { label: 'GIORNO LEGGERO', action: 'modal:planLight' },
    ],
  },

  // ═════════════════════════════════════════════════════
  // v8.2 — INTELLIGENZA INCROCIATA (context engine)
  // Tutte le condition/message ricevono C = ASSISTANT_CTX
  // ═════════════════════════════════════════════════════

  // 1 ── ACWR: picco di carico acuto vs cronico (rischio infortunio)
  {
    id: 'recupero_acwr_alto',
    persona: 'recupero', icon: '🚑', severity: 'critica',
    pages: ['dashboard', 'tecnica/sessioni'],
    condition: (C) => C && C.load.acwr != null && C.load.acwr >= 1.5 && !C.state.infortunioAttivo,
    message: (C) => `Carico a ${C.load.acwr.toFixed(1)}× il tuo cronico (${CS.fmtDurata(C.load.ore7)} in 7gg contro una media di ${CS.fmtDurata(C.load.cronicoSett)} a settimana). Sopra 1.5 il rischio infortunio sale in modo netto: il corpo non ha ancora assorbito questa accelerazione.`,
    question: () => 'Come gestiamo le prossime 48h?',
    answers: () => [
      { label: 'RIPOSO OGGI',    action: 'modal:planRest' },
      { label: 'GIORNO LEGGERO', action: 'modal:planLight' },
      { label: 'RISCHIO CALCOLATO', action: 'ack' },
    ],
  },

  // 2 ── Evento a ≤14gg: consolidare, non sperimentare
  {
    id: 'coach_evento_14gg',
    persona: 'coach', icon: '🥊', severity: 'attenzione',
    pages: ['dashboard', 'focus/eventi', 'tecnica/sessioni'],
    cooldownDays: 4,
    condition: (C) => C && C.time.nextEvent && C.time.nextEvent.giorni <= 14 && C.time.nextEvent.giorni > 3,
    message: (C) => {
      const e = C.time.nextEvent;
      return `${(e.titolo || e.tipo || 'Evento').toUpperCase()} tra ${e.giorni} giorni. Da qui in poi si consolida ciò che sai fare: niente tecniche nuove, niente esperimenti di carico. Rifinisci i fondamentali col voto più alto.`;
    },
    question: () => 'Il piano di avvicinamento è chiaro?',
    answers: () => [
      { label: 'VEDI EVENTO',    action: 'goto:focus/eventi' },
      { label: 'PIANO SESSIONI', action: 'goto:tecnica/sessioni' },
      { label: 'CHIARO',         action: 'ack' },
    ],
  },

  // 3 ── Evento a ≤3gg: taper
  {
    id: 'coach_evento_3gg',
    persona: 'coach', icon: '🥊', severity: 'critica',
    pages: ['dashboard'],
    cooldownDays: 1,
    condition: (C) => C && C.time.nextEvent && C.time.nextEvent.giorni <= 3 && C.time.nextEvent.giorni >= 0,
    message: (C) => {
      const e = C.time.nextEvent;
      return e.giorni === 0
        ? `Oggi: ${(e.titolo || e.tipo || 'evento').toUpperCase()}. Il lavoro è fatto. Riscaldamento, visualizzazione, esecuzione.`
        : `${(e.titolo || e.tipo || 'Evento').toUpperCase()} tra ${e.giorni} giorn${e.giorni === 1 ? 'o' : 'i'}. Fase taper: solo scarico attivo, sonno pieno e visualizzazione. Ogni ora di allenamento duro da qui in poi toglie, non aggiunge.`;
    },
    answers: () => [
      { label: 'GIORNO LEGGERO', action: 'modal:planLight' },
      { label: 'RIPOSO PIENO',   action: 'modal:planRest' },
      { label: 'OK',             action: 'ack' },
    ],
  },

  // 4 ── Settimana d'oro chiudibile: piano concreto con i criteri esatti
  {
    id: 'coach_oro_chiudibile',
    persona: 'coach', icon: '🥊', severity: 'attenzione',
    pages: ['dashboard'],
    cooldownDays: 1,
    condition: (C) => {
      if (!C || !C.state.sett || C.state.sett.gold) return false;
      const manc = C.state.settMancanti.length;
      // giovedì in poi, 1-2 criteri mancanti, giorni sufficienti
      return C.time.dow >= 3 && manc >= 1 && manc <= 2 && C.state.giorniRimanentiSett >= manc - 1;
    },
    message: (C) => {
      const lista = C.state.settMancanti.map(c => `${c.label} (sei a ${c.val})`).join(' e ');
      const gg = C.state.giorniRimanentiSett + 1; // incluso oggi
      return `La settimana d'oro è a ${C.state.sett.met}/${C.state.sett.criteri.length}. In ${gg} giorn${gg === 1 ? 'o' : 'i'} ti manca solo: ${lista}. È matematicamente chiudibile.`;
    },
    question: () => 'La chiudiamo?',
    answers: () => [
      { label: 'VEDI CRITERI', action: 'goto:tecnica/sessioni' },
      { label: 'CI PENSO',     action: 'snooze:1d' },
    ],
  },

  // 5 ── Rientro post-infortunio troppo rapido
  {
    id: 'recupero_rientro_veloce',
    persona: 'recupero', icon: '🚑', severity: 'attenzione',
    pages: ['dashboard', 'tecnica/infortuni'],
    cooldownDays: 3,
    condition: (C) => C && C.state.infortunioChiusoRecente
      && C.state.orePreInfortunio != null && C.state.orePreInfortunio > 2
      && C.load.ore7 >= C.state.orePreInfortunio * 0.9,
    message: (C) => {
      const inf = C.state.infortunioChiusoRecente;
      return `"${inf.parte || 'Infortunio'}" chiuso solo ${inf.giorniFa} giorni fa e sei già a ${CS.fmtDurata(C.load.ore7)} a settimana — il ${Math.round((C.load.ore7 / C.state.orePreInfortunio) * 100)}% del carico che avevi PRIMA dello stop. Le ricadute nascono quasi sempre qui: rientro a piena intensità senza rampa.`;
    },
    question: () => 'Riduciamo la rampa?',
    answers: () => [
      { label: 'GIORNO LEGGERO', action: 'modal:planLight' },
      { label: 'MONITORO',       action: 'snooze:3d' },
      { label: 'STO BENE',       action: 'ack' },
    ],
  },

  // 6 ── Dimagrimento troppo rapido (perdi anche muscolo)
  {
    id: 'nutri_dimagrimento_rapido',
    persona: 'nutrizione', icon: '🥗', severity: 'attenzione',
    pages: ['dashboard', 'fisica/peso', 'fisica/nutrizione'],
    cooldownDays: 4,
    condition: (C) => C && C.trends.pesoPctSett != null
      && C.trends.pesateCount14 >= 4 && C.trends.pesoPctSett <= -1.0,
    message: (C) => `Stai perdendo ${Math.abs(C.trends.pesoKgSett).toFixed(1)}kg/settimana (${Math.abs(C.trends.pesoPctSett).toFixed(1)}% del peso corporeo). Oltre l'1%/sett una parte è massa muscolare, non solo grasso — per un pugile è potenza che se ne va. Serve più cibo, non meno.`,
    question: () => 'Rivediamo l\'apporto?',
    answers: () => [
      { label: 'VEDI NUTRIZIONE', action: 'goto:fisica/nutrizione' },
      { label: 'È VOLUTO',        action: 'snooze:7d' },
    ],
  },

  // 7 ── Spinta a serbatoio vuoto (mood basso × carico alto)
  {
    id: 'mentale_serbatoio_vuoto',
    persona: 'mentale', icon: '🧠', severity: 'attenzione',
    pages: ['dashboard'],
    cooldownDays: 2,
    condition: (C) => C && C.state.moodNegDays >= 2
      && C.state.oreVsTarget && C.state.oreVsTarget.ore >= C.state.oreVsTarget.target,
    message: (C) => `Mood negativo in ${C.state.moodNegDays} degli ultimi 3 giorni mentre sei già a ${CS.fmtDurata(C.state.oreVsTarget.ore)} su ${CS.fmtDurata(C.state.oreVsTarget.target)}. Stai spingendo col serbatoio vuoto: il volume c'è, è la testa che sta pagando il conto. Un giorno OFF adesso vale più di 2h in più.`,
    question: () => 'Come la giochiamo?',
    answers: () => [
      { label: 'GIORNO OFF',  action: 'modal:planRest' },
      { label: 'SOLO OGGI LIGHT', action: 'modal:planLight' },
      { label: 'REGGO',       action: 'ack' },
    ],
  },

  // 8 ── Deriva tecnica silenziosa (pendenza voti 30gg)
  {
    id: 'coach_deriva_tecnica',
    persona: 'coach', icon: '🥊', severity: 'info',
    pages: ['dashboard', 'tecnica/aree', 'tecnica/fondamentali'],
    cooldownDays: 5,
    condition: (C) => C && C.trends.tecnicaSlopeSett != null && C.trends.tecnicaSlopeSett <= -0.15,
    message: (C) => `I tuoi voti tecnici scendono di ${Math.abs(C.trends.tecnicaSlopeSett).toFixed(1)} punti a settimana da un mese (${C.trends.votiCount30} rilevazioni). Nessun crollo, ma la deriva è costante — di solito significa che ti alleni tanto e rifinisci poco.`,
    question: () => 'Dove intervieni?',
    answers: () => [
      { label: 'VEDI AREE',        action: 'goto:tecnica/aree' },
      { label: 'VEDI FONDAMENTALI', action: 'goto:tecnica/fondamentali' },
      { label: 'NOTATO',           action: 'ack' },
    ],
  },

  // 9 ── Pattern giorno-debole (salti sempre lo stesso giorno)
  {
    id: 'mentale_pattern_giorno_debole',
    persona: 'mentale', icon: '🧠', severity: 'info',
    pages: ['dashboard', 'assistente'],
    cooldownDays: 7,
    condition: (C) => C && !!C.patterns.dowSkip,
    message: (C) => {
      const p = C.patterns.dowSkip;
      return `Nelle ultime 8 settimane hai saltato la revisione di ${p.nome} ${p.misses} volte su 8 — il doppio degli altri giorni. Non è un caso: è un pattern. Capire cosa succede il ${p.nome} vale più di qualsiasi motivazione.`;
    },
    question: (C) => `Cosa c'è di diverso il ${C.patterns.dowSkip.nome}?`,
    answers: () => [
      { label: 'HO CAPITO COSA',  action: 'ack' },
      { label: 'CI RIFLETTO',     action: 'snooze:7d' },
    ],
  },

  // 10 ── Chiusura settimana/mese (revisioni aggregate mancanti)
  {
    id: 'mentale_chiusura_settimana',
    persona: 'mentale', icon: '🧠', severity: 'attenzione',
    pages: ['dashboard'],
    time: 'sera',
    cooldownDays: 1,
    condition: (C) => {
      if (!C || !C.time.isDomenica || C.time.fascia !== 'sera') return false;
      if (typeof CS.getRevSettByStart !== 'function') return false;
      const { start } = CS.weekRange(new Date());
      return !CS.getRevSettByStart(CS.isoDateOnly(start));
    },
    message: () => 'Domenica sera: la settimana si chiude adesso, con la revisione settimanale. Cinque minuti per capire cosa ha funzionato valgono più della prossima sessione.',
    answers: () => [
      { label: 'COMPILA ORA', action: 'modal:openRevDaily' },
      { label: 'DOPO',        action: 'snooze:1d' },
    ],
  },

  // 11 ── Corsa in stallo: volume su, pace giù
  {
    id: 'coach_corsa_stallo',
    persona: 'coach', icon: '🥊', severity: 'info',
    pages: ['dashboard', 'fisica/corsa'],
    cooldownDays: 5,
    condition: (C) => {
      const t = C && C.trends.corsaTrend;
      return t && t.kmRecenti > t.kmPrec * 1.1
        && t.paceRecente != null && t.pacePrec != null
        && t.paceRecente > t.pacePrec * 1.04;
    },
    message: (C) => {
      const t = C.trends.corsaTrend;
      const fmt = p => `${Math.floor(p)}'${String(Math.round((p % 1) * 60)).padStart(2, '0')}"`;
      return `Ultime 4 corse: ${t.kmRecenti.toFixed(1)}km (su dal ${Math.round((t.kmRecenti / t.kmPrec - 1) * 100)}%) ma pace peggiorato da ${fmt(t.pacePrec)} a ${fmt(t.paceRecente)}/km. Più volume con gambe meno fresche = stai correndo stanco. Il fiato per il ring si costruisce recuperato.`;
    },
    answers: () => [
      { label: 'VEDI CORSE', action: 'goto:fisica/corsa' },
      { label: 'NOTATO',     action: 'ack' },
    ],
  },

  // 12 ── Streak a rischio: sera, zero ore, niente riposo pianificato
  {
    id: 'coach_streak_rischio',
    persona: 'coach', icon: '🥊', severity: 'attenzione',
    pages: ['dashboard'],
    time: 'sera',
    cooldownDays: 1,
    condition: (C) => C && C.time.fascia === 'sera' && C.state.streak >= 5
      && C.load.oreOggi === 0 && !C.state.riposoOggi,
    message: (C) => `${C.state.streak} giorni consecutivi e oggi sei ancora a zero. A mezzanotte la streak si azzera — oppure è un riposo voluto: allora dichiaralo, così resta una scelta e non un buco.`,
    question: () => 'Cosa è, stasera?',
    answers: () => [
      { label: 'MI ALLENO ORA',   action: 'modal:openRevDaily' },
      { label: 'RIPOSO VOLUTO',   action: 'modal:planRest' },
    ],
  },
];

/* Export ai globali (usati da assistant.js e ui/assistant.js) */
window.ASSISTANT_RULES = ASSISTANT_RULES;
window.PERSONA_LABEL = PERSONA_LABEL;
window.PERSONA_ICON = PERSONA_ICON;
window.PERSONA_INTRO = PERSONA_INTRO;
