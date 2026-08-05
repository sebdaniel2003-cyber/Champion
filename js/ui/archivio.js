/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — ARCHIVIO
   Sub-routes: panoramica · focus · fisica · tecnica · revisioni

   PANORAMICA: dashboard di card KPI con sparkline reali e
   selettore W/M/Y. Le altre 4 sub sono drill-down puri.

   Riscritta 2026-06-23.
   ═══════════════════════════════════════════════════════ */

(function () {

  // ═══════════════════════════════════════════════════════
  // 1. STATE & PILL CONFIG
  // ═══════════════════════════════════════════════════════

  // Stato runtime del filtro (per ogni sub-tab di drill-down)
  // NOTA: la sub-tab "infortuni" è stata promossa-->rientrata come pill di FISICA (archivio v3.2).
  // filterState.infortuni resta per backward-compat con renderInfortuniRoot/handlers già esistenti.
  // v3.3: per le 3 zone semantiche pill=null è la "vista OVERVIEW" (KPI card),
  // pill='<id>' è la "vista PILL" (drill specifico). Revisioni non è una zona.
  const filterState = {
    focus:     { pill: null,          search: '', drillKey: null, dateFrom: '', dateTo: '', statusFilter: 'all', scadenza: null, filterMonth: '', filterWeek: 'all', filterYear: '', period: 'YTD' },
    fisica:    { pill: null,          search: '', drillKey: null, dateFrom: '', dateTo: '', period: 'YTD' },
    tecnica:   { pill: null,          search: '', drillKey: null, dateFrom: '', dateTo: '' },
    infortuni: { drillKey: null, dateFrom: '', dateTo: '', gravitaFilter: 'all' },
    revisioni: { pill: 'giornaliere', search: '' },
  };

  // Stato collapse per obj-l2-period-group (chiave: "scadenza|periodValue" → true se collassato)
  let _objL2Collapsed = {};

  // Pills che usano vista a 2 livelli (categorie → dettaglio)
  const DRILL_PILLS_TECNICA = new Set(['voti_aree', 'voti_fond']);
  const DRILL_PILLS_FOCUS   = new Set(['obiettivi', 'obiettivi_giorn', 'obiettivi_sett', 'obiettivi_mens', 'obiettivi_ann', 'eventi', 'ore', 'sessioni']);
  const DRILL_PILLS_FISICA  = new Set(['volume', 'corse', 'pasti', 'pesate', 'sonno']);
  function isDrillPill(pill) {
    return DRILL_PILLS_TECNICA.has(pill) || DRILL_PILLS_FOCUS.has(pill) || DRILL_PILLS_FISICA.has(pill);
  }

  // Un obiettivo è "fatto" se completed=true OPPURE auto+pct>=100 (calcolato dalle revisioni)
  function isObiettivoDone(o) {
    if (!o) return false;
    if (o.completed) return true;
    if (o.auto && CALC.progressObiettivo) {
      try { return (CALC.progressObiettivo(o).pct || 0) >= 100; } catch (e) { return false; }
    }
    return false;
  }

  // Chart.js instance per la vista L2 (gestione lifecycle)
  let archiveChart = null;

  // OTTIMIZZAZIONE MEMORIA: quando si naviga via dall'archivio, il router
  // svuota il DOM ma l'istanza Chart.js resta viva (con il suo listener di
  // resize e i riferimenti al canvas rimosso) finché non viene distrutta.
  // Ogni visita all'archivio accumulava così un'istanza morta. Ora il chart
  // viene distrutto a ogni cambio di route che lascia la sezione.
  BUS.on('route:change', ({ section } = {}) => {
    if (section !== 'archivio' && archiveChart) {
      try { archiveChart.destroy(); } catch (e) {}
      archiveChart = null;
    }
  });

  const PILLS = {
    focus: [
      { id: 'obiettivi_giorn', label: 'Obiettivi giornalieri' },
      { id: 'obiettivi_sett',  label: 'Obiettivi settimanali' },
      { id: 'obiettivi_mens',  label: 'Obiettivi mensili' },
      { id: 'obiettivi_ann',   label: 'Obiettivi annuali' },
      { id: 'eventi',          label: 'Eventi passati' },
      { id: 'sessioni',        label: 'Sessioni' },
      { id: 'ore',             label: 'Ore allenamento' },
      { id: 'streak',          label: 'Streak' },
    ],
    fisica: [
      { id: 'pesate',    label: 'Pesate' },
      { id: 'pasti',     label: 'Pasti' },
      { id: 'corse',     label: 'Corse' },
      { id: 'sonno',     label: 'Sonno' },
      { id: 'volume',    label: 'Volume condiz.' },
      { id: 'infortuni', label: 'Infortuni' },
    ],
    tecnica: [
      { id: 'voti_aree',  label: 'Voti aree' },
      { id: 'voti_fond',  label: 'Voti fondamentali' },
    ],
    revisioni: [
      { id: 'giornaliere', label: 'Giornaliere' },
      { id: 'settimanali', label: 'Settimanali' },
      { id: 'mensili',     label: 'Mensili' },
      { id: 'oro',         label: 'Oro · criteri' },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // 2. PANORAMICA — Dashboard KPI con sparkline + W/M/Y
  // ═══════════════════════════════════════════════════════

  const panoState = { period: '30GG', yearInfo: null };  // '30GG' | 'YTD' | 'TUTTO'

  // Spec dichiarativa delle card KPI
  // zone: 'fisica' | 'focus' | 'tecnica' — driver della PANORAMICA overview a 3 super-card
  const PANO_CARDS = [
    { id: 'ore',       label: 'ORE ALLENAMENTO', icon: '⏱', reducer: 'sumOre',         fmtBig: v => v.toFixed(1), unit: 'h',     subTpl: 'delta_h',     zone: 'focus',   targetSub: 'focus',   targetPill: 'ore' },
    { id: 'sess',      label: 'SESSIONI',        icon: '🥊', reducer: 'countSessioni',  fmtBig: v => String(v),    unit: '',      subTpl: 'media_unit',  zone: 'focus',   targetSub: 'focus',   targetPill: 'sessioni' },
    { id: 'votiAree',  label: 'VOTO MEDIO AREE', icon: '🎯', reducer: 'avgVotoAree',    fmtBig: v => v.toFixed(1), unit: '/10',   subTpl: 'voti_count',  zone: 'tecnica', targetSub: 'tecnica', targetPill: 'voti_aree' },
    { id: 'votiFond',  label: 'VOTI FONDAM.',    icon: '💪', reducer: 'avgVotoFond',    fmtBig: v => v.toFixed(1), unit: '/10',   subTpl: 'voti_count',  zone: 'tecnica', targetSub: 'tecnica', targetPill: 'voti_fond' },
    { id: 'peso',      label: 'PESO',            icon: '⚖️', reducer: 'lastKg',         fmtBig: v => v ? v.toFixed(1) : '—', unit: 'kg', subTpl: 'delta_kg',    zone: 'fisica',  targetSub: 'fisica',  targetPill: 'pesate' },
    { id: 'km',        label: 'KM CORSA',        icon: '🏃', reducer: 'sumKm',          fmtBig: v => v.toFixed(1), unit: 'km',    subTpl: 'pace_delta',  zone: 'fisica',  targetSub: 'fisica',  targetPill: 'corse' },
    { id: 'sonno',     label: 'SONNO MEDIO',     icon: '🌙', reducer: 'avgSonno',       fmtBig: v => v.toFixed(1), unit: 'h',     subTpl: 'qualita',     zone: 'fisica',  targetSub: 'fisica',  targetPill: 'sonno' },
    { id: 'volume',    label: 'VOLUME CONDIZ.',  icon: '⚡', reducer: 'sumReps',        fmtBig: v => String(Math.round(v)), unit: 'rip', subTpl: 'reps_break', zone: 'fisica', targetSub: 'fisica', targetPill: 'volume' },
    { id: 'obiettivi', label: 'OBIETTIVI',       icon: '✅', reducer: 'completedCount', fmtBig: v => String(v),    unit: '',      subTpl: 'pct_obj',     zone: 'focus',   targetSub: 'focus',   targetPill: 'obiettivi', trendType: 'ring' },
    { id: 'streak',    label: 'STREAK GIORNI',   icon: '🔥', reducer: 'streakNow',      fmtBig: v => String(v),    unit: 'gg',    subTpl: 'streak_max',  zone: 'focus',   targetSub: 'focus',   targetPill: 'streak', trendType: 'heatmap30' },
    { id: 'infortuni', label: 'INFORTUNI ATT.',  icon: '🩹', reducer: 'activeInjuries', fmtBig: v => String(v),    unit: '',      subTpl: 'inj_resolved', zone: 'fisica', targetSub: 'fisica',  targetPill: 'infortuni' },
  ];

  // ─── ZONE_META — 3 super-card overview (archivio v3.2) ─────────
  // Ogni zona ha: icona, label, colore accent, "hero" card (KPI principale),
  // miniIds (3-4 altre card della zona mostrate come mini-stat).
  const ZONE_META = {
    fisica: {
      label: 'FISICA',
      icon: '💪',
      tagline: 'corpo · sonno · carico',
      color: '#B45CFF',
      heroId: 'peso',
      miniIds: ['sonno', 'km', 'volume', 'infortuni'],
    },
    focus: {
      label: 'FOCUS',
      icon: '🎯',
      tagline: 'disciplina · obiettivi · costanza',
      color: '#B45CFF',
      heroId: 'obiettivi',
      miniIds: ['ore', 'sess', 'streak'],
    },
    tecnica: {
      label: 'TECNICA',
      icon: '🥊',
      tagline: 'aree · fondamentali',
      color: '#B45CFF',
      heroId: 'votiAree',
      miniIds: ['votiFond'],
    },
  };

  // ─── ENTRY: route handler panoramica ─────────────────
  function renderPanoramica() {
    return `
      <div class="page-header pano-header">
        <div>
          <h1 class="page-title">ARCHI<span class="accent">VIO</span> · PANORAMICA</h1>
          <div class="page-sub">3 zone · colpo d'occhio sui tuoi progressi</div>
        </div>
      </div>
      <div class="pano-period-bar">
        ${renderPeriodSwitcher(panoState.period)}
      </div>
      <div class="pano-zones-grid" id="pano-zones-grid">
        ${['fisica', 'focus', 'tecnica'].map(z => renderZoneOverviewCard(z)).join('')}
      </div>
    `;
  }

  // Shell della super-card zona (riempita al volo da animateZoneCards)
  function renderZoneOverviewCard(zoneId) {
    const m = ZONE_META[zoneId];
    if (!m) return '';
    const cards = PANO_CARDS.filter(c => c.zone === zoneId);
    const count = cards.length;
    return `
      <div class="zone-card" data-zone="${zoneId}">
        <div class="zone-card-head">
          <div class="zone-card-head-left">
            <span class="zone-card-ico">${m.icon}</span>
            <div class="zone-card-head-text">
              <div class="zone-card-title">${m.label}</div>
              <div class="zone-card-tagline">${m.tagline}</div>
            </div>
          </div>
          <div class="zone-card-count">${count} metric${count === 1 ? 'a' : 'he'}</div>
        </div>
        <div class="zone-card-hero">
          <div class="zone-card-hero-num">
            <span class="zone-card-score-big" data-zone-score>—</span><span class="zone-card-score-pct">%</span>
          </div>
          <div class="zone-card-score-label">INDICE ${m.label}</div>
          <div class="zone-card-score-bar"><div class="zone-card-score-bar-fill" data-zone-score-bar style="width:0%"></div></div>
        </div>
        <div class="zone-card-spark" data-zone-spark></div>
        <div class="zone-card-ministats" data-zone-ministats></div>
        <div class="zone-card-insight" data-zone-insight>—</div>
        <div class="zone-card-footer">
          <span class="zone-card-delta" data-zone-delta>—</span>
          <span class="zone-card-cta">apri ${m.label.toLowerCase()} →</span>
        </div>
      </div>
    `;
  }

  function renderPeriodSwitcher(period) {
    const PERIODS = [
      { id: '30GG',  label: '30 GG' },
      { id: 'YTD',   label: 'YTD' },
      { id: 'TUTTO', label: 'TUTTO' },
    ];
    return `
      <div class="vota-period-pills pano-period-pills" role="tablist">
        ${PERIODS.map(p =>
          `<button class="vota-pill pano-period-pill ${p.id === period ? 'active' : ''}" data-period="${p.id}" role="tab">${p.label}</button>`
        ).join('')}
      </div>
      <div class="pano-period-meta" id="pano-period-meta">${getPeriodMeta(period)}</div>
    `;
  }

  function getPeriodMeta(period) {
    const t = new Date();
    const mN = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    if (period === '30GG') {
      const back = new Date(t); back.setDate(t.getDate() - 29);
      return `${CS.fmtDate(CS.isoDateOnly(back), { short: true })} → ${CS.fmtDate(CS.isoDateOnly(t), { short: true })} · ultimi 30 giorni`;
    }
    if (period === 'YTD') {
      return `1 gen → ${t.getDate()} ${mN[t.getMonth()]} ${t.getFullYear()} · confronto vs YTD anno scorso`;
    }
    // TUTTO
    const yi = ensureYearStrategy();
    const nYears = yi.years.length;
    return `tutto lo storico · ${nYears} ann${nYears === 1 ? 'o' : 'i'} di dati`;
  }

  // Card "shell" senza dati — i dati li riempie animatePanoCards al volo
  function renderKpiCardShell(spec) {
    return `
      <div class="widget-card pano-card" data-card="${spec.id}" data-target-sub="${spec.targetSub}" data-target-pill="${spec.targetPill}">
        <div class="widget-card-head">
          <div class="pano-card-head-left">
            <span class="pano-card-ico">${spec.icon}</span>
            <span class="widget-label">${spec.label}</span>
          </div>
          <button class="pano-card-expand-btn" title="Espandi" aria-label="Espandi">↗</button>
        </div>
        <div class="widget-big" data-big>—<span class="widget-unit">${spec.unit}</span></div>
        <div class="widget-sub" data-sub>&nbsp;</div>
        <div class="widget-spark pano-card-spark" data-spark></div>
      </div>
    `;
  }

  // ─── DATA LAYER ──────────────────────────────────────

  // Detect anni con dati per scegliere strategy ANNO
  function detectYearsWithData() {
    const ys = new Set();
    const scan = (arr, key) => (arr || []).forEach(x => {
      const v = x[key];
      if (v && typeof v === 'string' && /^\d{4}/.test(v)) ys.add(Number(v.slice(0, 4)));
    });
    scan(CS.state.revisioni, 'data');
    scan(CS.state.pesate, 'data');
    scan(CS.state.corsa, 'data');
    scan(CS.state.areeVoti, 'data');
    const years = [...ys].sort((a, b) => a - b);
    const currentYear = new Date().getFullYear();
    if (!years.length || (years.length === 1 && years[0] === currentYear)) {
      return { years: years.length ? years : [currentYear], strategy: '1y', currentYear };
    }
    if (years.length >= 4) return { years, strategy: '4y+', currentYear };
    return { years, strategy: '2-3y', currentYear };
  }

  // Strategia ANNO viene cachata in panoState al primo render
  function ensureYearStrategy() {
    if (!panoState.yearInfo) panoState.yearInfo = detectYearsWithData();
    return panoState.yearInfo;
  }

  function getPeriodUnits(period) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mN = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

    if (period === '30GG') {
      // 30 buckets giornalieri, dal più vecchio (oggi-29) ad oggi
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const end = new Date(d); end.setHours(23, 59, 59, 999);
        out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, start: new Date(d), end });
      }
    } else if (period === 'YTD') {
      // Mesi da gen del current year fino al mese corrente incluso
      const yr = today.getFullYear();
      const curM = today.getMonth();
      for (let m = 0; m <= curM; m++) {
        const start = new Date(yr, m, 1);
        const end = m === curM
          ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
          : new Date(yr, m + 1, 0, 23, 59, 59, 999);
        out.push({ label: mN[m], start, end });
      }
    } else { // 'TUTTO'
      const yi = ensureYearStrategy();
      if (yi.strategy === '4y+') {
        // 5 (o N) unità annuali sull'arco completo
        const years = yi.years.slice(-5);
        years.forEach(y => {
          const start = new Date(y, 0, 1);
          const end = new Date(y, 11, 31, 23, 59, 59, 999);
          out.push({ label: String(y), start, end });
        });
      } else if (yi.strategy === '2-3y') {
        // Tutti i mesi di tutti gli anni con dati
        yi.years.forEach(y => {
          for (let m = 0; m < 12; m++) {
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
            const lbl = yi.years.length > 1 ? `${mN[m]} ${String(y).slice(2)}` : mN[m];
            out.push({ label: lbl, start, end });
          }
        });
      } else { // '1y'
        const yr = yi.currentYear;
        for (let m = 0; m < 12; m++) {
          const start = new Date(yr, m, 1);
          const end = new Date(yr, m + 1, 0, 23, 59, 59, 999);
          out.push({ label: mN[m], start, end });
        }
      }
    }
    return out;
  }

  function getPrevPeriodUnits(period) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mN = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

    if (period === '30GG') {
      // 30 giorni precedenti: dal -59 al -30
      for (let i = 59; i >= 30; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const end = new Date(d); end.setHours(23, 59, 59, 999);
        out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, start: new Date(d), end });
      }
    } else if (period === 'YTD') {
      // Stessi mesi (gen→mese corrente) ma dell'anno precedente
      const pY = today.getFullYear() - 1;
      const curM = today.getMonth();
      for (let m = 0; m <= curM; m++) {
        const start = new Date(pY, m, 1);
        const end = m === curM
          ? new Date(pY, today.getMonth(), today.getDate(), 23, 59, 59, 999)
          : new Date(pY, m + 1, 0, 23, 59, 59, 999);
        out.push({ label: mN[m], start, end });
      }
    } else { // 'TUTTO'
      // Nessun "periodo precedente" significativo per TUTTO: ritorna stessi units shiftati
      // (resta vuoto → prevVals saranno 0 → delta calcolato come "NUOVO")
      const yi = ensureYearStrategy();
      if (yi.strategy === '4y+') {
        // Shift di 5 anni indietro
        const years = yi.years.slice(-5).map(y => y - 5);
        years.forEach(y => {
          const start = new Date(y, 0, 1);
          const end = new Date(y, 11, 31, 23, 59, 59, 999);
          out.push({ label: String(y), start, end });
        });
      } else if (yi.strategy === '2-3y') {
        // Stesso numero di mesi shiftati di N anni indietro (N = numero anni nei dati)
        const shift = yi.years.length;
        yi.years.forEach(y => {
          for (let m = 0; m < 12; m++) {
            const start = new Date(y - shift, m, 1);
            const end = new Date(y - shift, m + 1, 0, 23, 59, 59, 999);
            out.push({ label: mN[m], start, end });
          }
        });
      } else { // '1y' → confronta con anno precedente, 12 mesi
        const pY = yi.currentYear - 1;
        for (let m = 0; m < 12; m++) {
          const start = new Date(pY, m, 1);
          const end = new Date(pY, m + 1, 0, 23, 59, 59, 999);
          out.push({ label: mN[m], start, end });
        }
      }
    }
    return out;
  }

  function computePeriodValue(spec, sparkVals) {
    if (!sparkVals || !sparkVals.length) return 0;
    if (spec.id === 'streak') return CALC.streakDays ? CALC.streakDays() : 0;
    if (spec.id === 'infortuni') return sparkVals[sparkVals.length - 1] || 0;
    if (spec.id === 'peso') return [...sparkVals].reverse().find(v => v > 0) || 0;
    if (CUMULATIVE_IDS.has(spec.id)) return sparkVals.reduce((a, b) => a + b, 0);
    const nz = sparkVals.filter(v => v > 0);
    return nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0;
  }

  // ─── REDUCERS ─── (tolleranti ai field-name v7 e v8)
  const REDUCERS = {
    // Ore allenamento (somma) — usa oreAllenamento OR oreH (legacy v7)
    sumOre(unit) {
      const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, unit.start, unit.end));
      return revs.reduce((a, r) => a + (Number(r.oreAllenamento) || Number(r.oreH) || 0), 0);
    },
    countSessioni(unit) {
      const ses = (CS.state.sessioni || []).filter(s => inRange(s.data, unit.start, unit.end));
      if (ses.length) return ses.length;
      // Fallback: conta revisioni con ore > 0 (per dati legacy senza tabella sessioni)
      const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, unit.start, unit.end));
      return revs.filter(r => (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0).length;
    },
    avgVotoAree(unit) {
      const voti = (CS.state.areeVoti || []).filter(v => inRange(v.data, unit.start, unit.end));
      if (!voti.length) return 0;
      return voti.reduce((a, v) => a + (Number(v.voto) || 0), 0) / voti.length;
    },
    avgVotoFond(unit) {
      const voti = (CS.state.fondVoti || []).filter(v => inRange(v.data, unit.start, unit.end));
      if (!voti.length) return 0;
      return voti.reduce((a, v) => a + (Number(v.voto) || 0), 0) / voti.length;
    },
    lastKg(unit) {
      const pes = (CS.state.pesate || []).filter(p => inRange(p.data, unit.start, unit.end));
      if (!pes.length) return null;
      pes.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
      return Number(pes[pes.length - 1].kg) || null;
    },
    sumKm(unit) {
      const cor = (CS.state.corsa || []).filter(c => inRange(c.data, unit.start, unit.end));
      return cor.reduce((a, c) => a + (Number(c.km) || 0), 0);
    },
    avgSonno(unit) {
      const son = (CS.state.sonno || []).filter(s => inRange(s.data, unit.start, unit.end));
      if (!son.length) return 0;
      return son.reduce((a, s) => a + (Number(s.ore) || 0), 0) / son.length;
    },
    sumReps(unit) {
      const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, unit.start, unit.end));
      return revs.reduce((a, r) =>
        a + (Number(r.flessioni) || 0) + (Number(r.squat) || 0) + (Number(r.addominali) || 0), 0);
    },
    completedCount(unit) {
      const obj = (CS.state.obiettivi || []).filter(isObiettivoDone);
      return obj.filter(o => {
        const dStr = o.periodo;
        if (!dStr) return false;
        // periodi possono essere YYYY-MM-DD, YYYY-MM, YYYY, YYYY-Www
        let d;
        if (/^\d{4}-W\d+$/.test(dStr)) {
          const [yy, ww] = dStr.split('-W');
          const j1 = new Date(Number(yy), 0, 1);
          d = new Date(j1); d.setDate(j1.getDate() + (Number(ww) - 1) * 7);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
          d = new Date(dStr);
        } else if (/^\d{4}-\d{2}$/.test(dStr)) {
          const [y, m] = dStr.split('-');
          d = new Date(Number(y), Number(m) - 1, 15);
        } else if (/^\d{4}$/.test(dStr)) {
          d = new Date(Number(dStr), 6, 1);
        } else {
          return false;
        }
        return d >= unit.start && d <= unit.end;
      }).length;
    },
    streakNow(_unit) {
      // Streak è sempre "ad oggi", non dipende dal periodo: lo ritorniamo solo nell'ultima unità
      return CALC.streakDays ? CALC.streakDays() : 0;
    },
    activeInjuries(unit) {
      // Conta infortuni APERTI al termine dell'unità (dataInizio <= end AND (dataFine null OR dataFine > end))
      const inj = (CS.state.infortuni || []).filter(i => {
        const di = new Date(i.dataInizio || i.data);
        if (di > unit.end) return false;
        if (!i.dataFine) return true;
        const df = new Date(i.dataFine);
        return df > unit.end;
      });
      return inj.length;
    },
  };

  // Builder valori sparkline per una card
  function buildSparkValues(spec, units) {
    return units.map(u => {
      const r = REDUCERS[spec.reducer](u);
      return r == null ? 0 : Number(r) || 0;
    });
  }

  // ═══════════════════════════════════════════════════════
  //   ZONE SCORE — indice % composito per super-card (v4.0)
  // ═══════════════════════════════════════════════════════
  function clampPct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }

  // Mediapesata escludendo le parti `null` (no dato) — i pesi mancanti vengono ridistribuiti.
  function weightedAvgWithMissing(parts) {
    let totW = 0, sum = 0;
    for (const k in parts) {
      const p = parts[k];
      if (p == null || p.value == null) continue;
      totW += p.weight;
      sum  += p.value * p.weight;
    }
    if (totW <= 0) return null;
    return sum / totW;
  }

  function periodDaysCount(units) {
    if (!units || !units.length) return 1;
    // Stima giorni totali nel periodo (sum delle durate di ogni unit in ms / 86400000)
    let ms = 0;
    units.forEach(u => { ms += (u.end - u.start); });
    return Math.max(1, Math.round(ms / 86400000));
  }

  // ── FISICA: peso(20) + sonno(20) + volume(20) + corsa(20) + infortuni(20) ──
  function computeZoneScoreFisica(units, prevUnits = []) {
    const co = (CS.state.criteriOro) || {};
    const sett = co.sett || {};
    const sonnoTarget = Number(co.sonnoTargetH) || 8;
    const pesoTarget  = Number((CS.state.profile || {}).pesoTarget) || null;
    const flessT = Number(sett.flessioniGiorno) || 50;
    const squatT = Number(sett.squatGiorno)     || 50;
    const addoT  = Number(sett.addoGiorno)      || 50;
    const corseTSett = Number(sett.corseSett)   || 3;
    const days = periodDaysCount(units);

    // Raw values aggregati su tutto il periodo (units = unione su tutti)
    const allUnit = { start: units[0].start, end: units[units.length - 1].end };
    const peso    = REDUCERS.lastKg(allUnit);

    // Peso periodo precedente (per calcolo tendenza)
    const prevAll = prevUnits.length
      ? { start: prevUnits[0].start, end: prevUnits[prevUnits.length - 1].end }
      : null;
    const pesoPrev = prevAll ? REDUCERS.lastKg(prevAll) : null;
    const sonno   = REDUCERS.avgSonno(allUnit);
    const reps    = REDUCERS.sumReps(allUnit);
    const km      = REDUCERS.sumKm(allUnit);
    const corsaCount = (CS.state.corsa || []).filter(c => {
      const d = new Date(c.data);
      return d >= allUnit.start && d <= allUnit.end;
    }).length;
    const infAttivi = REDUCERS.activeInjuries({ end: allUnit.end });

    const repsTargetGg = flessT + squatT + addoT;
    const repsDayAvg = reps / days;
    const corsaTargetTot = corseTSett * (days / 7);

    // Score peso: blend vicinanza al target (60%) + tendenza (40%)
    let pesoScore = null;
    if (pesoTarget && peso != null) {
      const gap          = Math.abs(peso - pesoTarget);
      const proximityPct = Math.max(0, (15 - gap) / 15 * 100);
      let trendPct = 50; // neutro se nessun dato precedente
      if (pesoPrev != null) {
        const prevGap     = Math.abs(pesoPrev - pesoTarget);
        const closerDelta = prevGap - gap; // positivo = avvicinamento al target
        trendPct = Math.max(0, Math.min(100, 50 + closerDelta / 5 * 50));
      }
      pesoScore = clampPct(0.6 * proximityPct + 0.4 * trendPct);
    }

    const parts = {
      peso: { value: pesoScore, weight: 20, raw: peso },
      sonno: sonno > 0
        ? { value: clampPct((sonno / sonnoTarget) * 100), weight: 20, raw: sonno }
        : { value: null, weight: 20, raw: 0 },
      volume: reps > 0
        ? { value: clampPct((repsDayAvg / repsTargetGg) * 100), weight: 20, raw: reps }
        : { value: null, weight: 20, raw: 0 },
      corsa: corsaTargetTot > 0
        ? { value: clampPct((corsaCount / corsaTargetTot) * 100), weight: 20, raw: { km, n: corsaCount } }
        : { value: null, weight: 20, raw: { km, n: corsaCount } },
      infortuni: { value: infAttivi <= 0 ? 100 : infAttivi === 1 ? 50 : 0, weight: 20, raw: infAttivi },
    };
    return { score: weightedAvgWithMissing(parts), parts };
  }

  // ── FOCUS: ore(30) + sessioni(30) + obiettivi(25) + streak(15) ──
  function computeZoneScoreFocus(units) {
    const co = (CS.state.criteriOro) || {};
    const sett = co.sett || {};
    const oreMin = Number(sett.oreMinime) || 2;
    const ggAllen = Number(sett.giorniAllenamento) || 6;
    const days = periodDaysCount(units);
    const allUnit = { start: units[0].start, end: units[units.length - 1].end };

    const oreTot = REDUCERS.sumOre(allUnit);
    const sessTot = REDUCERS.countSessioni(allUnit);
    const oreTargetTot = oreMin * days;
    const sessTargetTot = ggAllen * days / 7;
    // Obiettivi: totale del periodo e completati nel periodo (basato su scadenza/periodo)
    const allObj = (CS.state.obiettivi || []);
    const inPeriodObj = allObj.filter(o => {
      const k = o.periodo || o.scadenzaData || '';
      if (!k) return true; // include senza data esplicita
      const d = new Date(k); return d >= allUnit.start && d <= allUnit.end;
    });
    const objDone = inPeriodObj.filter(isObiettivoDone).length;
    const objTot  = inPeriodObj.length;
    const streak = (CALC.streakDays && CALC.streakDays()) || 0;

    const parts = {
      ore: oreTargetTot > 0
        ? { value: clampPct((oreTot / oreTargetTot) * 100), weight: 30, raw: oreTot }
        : { value: null, weight: 30, raw: oreTot },
      sessioni: sessTargetTot > 0
        ? { value: clampPct((sessTot / sessTargetTot) * 100), weight: 30, raw: sessTot }
        : { value: null, weight: 30, raw: sessTot },
      obiettivi: objTot > 0
        ? { value: clampPct((objDone / objTot) * 100), weight: 25, raw: { done: objDone, tot: objTot } }
        : { value: null, weight: 25, raw: { done: objDone, tot: objTot } },
      streak: { value: clampPct((streak / 30) * 100), weight: 15, raw: streak },
    };
    return { score: weightedAvgWithMissing(parts), parts };
  }

  // ── TECNICA: voti aree(60) + voti fond(40) ──
  function computeZoneScoreTecnica(units) {
    const allUnit = { start: units[0].start, end: units[units.length - 1].end };
    const ar = REDUCERS.avgVotoAree(allUnit);
    const fo = REDUCERS.avgVotoFond(allUnit);
    const parts = {
      votiAree: ar > 0
        ? { value: clampPct(ar * 10), weight: 60, raw: ar }
        : { value: null, weight: 60, raw: 0 },
      votiFond: fo > 0
        ? { value: clampPct(fo * 10), weight: 40, raw: fo }
        : { value: null, weight: 40, raw: 0 },
    };
    return { score: weightedAvgWithMissing(parts), parts };
  }

  function computeZoneScore(zoneId, units, prevUnits = []) {
    if (zoneId === 'fisica')  return computeZoneScoreFisica(units, prevUnits);
    if (zoneId === 'focus')   return computeZoneScoreFocus(units);
    if (zoneId === 'tecnica') return computeZoneScoreTecnica(units);
    return { score: null, parts: {} };
  }

  // Genera 1 frase insight in base ai deltas part-per-part
  function buildZoneInsight(zoneId, currRes, prevRes) {
    const cur = currRes.parts, prev = prevRes.parts;
    const tips = [];

    // FISICA
    if (zoneId === 'fisica') {
      if (cur.infortuni && cur.infortuni.raw > 0) {
        tips.push(`${cur.infortuni.raw} infortuni${cur.infortuni.raw > 1 ? '' : 'o'} attiv${cur.infortuni.raw > 1 ? 'i' : 'o'}`);
      }
      if (cur.sonno && cur.sonno.value != null && prev.sonno && prev.sonno.value != null) {
        const d = cur.sonno.value - prev.sonno.value;
        if (d <= -10) tips.push('sonno in calo');
        else if (d >= 10) tips.push('sonno in salita');
      }
      if (cur.volume && cur.volume.value != null) {
        if (cur.volume.value >= 100) tips.push('volume sopra target');
        else if (cur.volume.value < 50 && cur.volume.raw > 0) tips.push('volume sotto metà target');
      }
      if (cur.peso && cur.peso.value != null && prev.peso && prev.peso.value != null) {
        const d = (cur.peso.raw || 0) - (prev.peso.raw || 0);
        if (Math.abs(d) >= 0.5) tips.push(`peso ${d < 0 ? '↓' : '↑'} ${Math.abs(d).toFixed(1)}kg`);
      }
    }
    // FOCUS
    if (zoneId === 'focus') {
      if (cur.streak && cur.streak.raw > 0) tips.push(`streak ${cur.streak.raw}gg`);
      if (cur.obiettivi && cur.obiettivi.raw && cur.obiettivi.raw.tot > 0) {
        tips.push(`${cur.obiettivi.raw.done}/${cur.obiettivi.raw.tot} obiettivi`);
      }
      if (cur.ore && cur.ore.value != null) {
        if (cur.ore.value >= 100) tips.push('ore sopra target');
        else if (cur.ore.value < 50 && cur.ore.raw > 0) tips.push('ore sotto metà target');
      }
    }
    // TECNICA
    if (zoneId === 'tecnica') {
      if (cur.votiAree && cur.votiAree.value != null && prev.votiAree && prev.votiAree.value != null) {
        const d = cur.votiAree.value - prev.votiAree.value;
        if (d >= 5) tips.push('aree in salita');
        else if (d <= -5) tips.push('aree in calo');
      }
      if (cur.votiFond && cur.votiFond.value != null) {
        if (cur.votiFond.raw >= 8) tips.push('fondam. forti');
        else if (cur.votiFond.raw > 0 && cur.votiFond.raw < 5) tips.push('fondam. da rinforzare');
      }
    }

    if (!tips.length) {
      const s = currRes.score;
      if (s == null) return 'Nessun dato nel periodo';
      if (s >= 80) return 'Andamento ottimo, continua così';
      if (s >= 50) return 'Andamento nella media';
      return 'Andamento sotto media, recupera';
    }
    return tips.join(' · ');
  }

  // Tag temporale di confronto in base a periodo
  function getPeriodTag() {
    if (panoState.period === '30GG') return '30gg prec.';
    if (panoState.period === 'YTD')  return 'YTD anno scorso';
    return 'storico prec.';
  }

  // Sub-label dinamico per tipo
  function buildSubLabel(spec, units, sparkValues, lastIdx, periodCurr, periodPrev) {
    const curr = periodCurr !== undefined ? periodCurr : (sparkValues[lastIdx] || 0);
    const prev = periodPrev !== undefined ? periodPrev : (sparkValues[lastIdx - 1] || 0);
    const delta = (curr || 0) - (prev || 0);
    const periodTag = getPeriodTag();

    switch (spec.subTpl) {
      case 'delta_h': {
        const sign = delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ';
        const cls = delta > 0 ? 'good' : delta < 0 ? 'warn' : 'info';
        return { html: `${sign}${Math.abs(delta).toFixed(1)}h vs ${periodTag}`, cls };
      }
      case 'media_unit': {
        const media = sparkValues.slice(0, sparkValues.length).reduce((a, b) => a + b, 0) / sparkValues.length;
        const sign = delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ';
        const cls = delta > 0 ? 'good' : delta < 0 ? 'warn' : '';
        return { html: `media ${media.toFixed(1)} · ${sign}${Math.abs(delta).toFixed(0)} vs ${periodTag}`, cls };
      }
      case 'voti_count': {
        const pStart = units[0].start, pEnd = units[units.length - 1].end;
        const arr = spec.id === 'votiAree'
          ? (CS.state.areeVoti || []).filter(v => inRange(v.data, pStart, pEnd))
          : (CS.state.fondVoti || []).filter(v => inRange(v.data, pStart, pEnd));
        const sign = delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ';
        const cls = delta > 0 ? 'good' : delta < 0 ? 'warn' : '';
        return { html: `${arr.length} voti · ${sign}${Math.abs(delta).toFixed(1)} vs ${periodTag}`, cls };
      }
      case 'delta_kg': {
        if (!curr) return { html: 'nessuna pesata', cls: '' };
        if (!prev) return { html: 'nessuna pesata nel periodo prec.', cls: '' };
        const d = delta;
        const sign = d > 0 ? '↑ +' : d < 0 ? '↓ ' : '→ ';
        const cls = d <= 0 ? 'good' : 'warn';
        return { html: `${sign}${Math.abs(d).toFixed(1)}kg vs ${periodTag}`, cls };
      }
      case 'pace_delta': {
        const pStart = units[0].start, pEnd = units[units.length - 1].end;
        const cor = (CS.state.corsa || []).filter(c => inRange(c.data, pStart, pEnd));
        const totMin = cor.reduce((a, c) => a + (Number(c.durataMin) || 0), 0);
        const totKm  = cor.reduce((a, c) => a + (Number(c.km) || 0), 0);
        const pace = (totKm && totMin) ? CALC.corsaPace(totKm, totMin) : null;
        const sign = delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ';
        const cls = delta > 0 ? 'good' : delta < 0 ? 'warn' : '';
        return { html: `${pace ? 'pace ' + pace.formatted + ' · ' : ''}${sign}${Math.abs(delta).toFixed(1)}km vs ${periodTag}`, cls };
      }
      case 'qualita': {
        const pStart = units[0].start, pEnd = units[units.length - 1].end;
        const son = (CS.state.sonno || []).filter(s => inRange(s.data, pStart, pEnd));
        const avgQ = son.length ? (son.reduce((a, s) => a + (Number(s.qualita) || 0), 0) / son.length) : 0;
        const sign = delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ';
        const cls = delta >= 0 ? 'good' : 'warn';
        return { html: `qualità ${avgQ.toFixed(1)}/5 · ${sign}${Math.abs(delta).toFixed(1)}h vs ${periodTag}`, cls };
      }
      case 'reps_break': {
        const pStart = units[0].start, pEnd = units[units.length - 1].end;
        const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, pStart, pEnd));
        const fl = revs.reduce((a, r) => a + (Number(r.flessioni) || 0), 0);
        const sq = revs.reduce((a, r) => a + (Number(r.squat) || 0), 0);
        const ad = revs.reduce((a, r) => a + (Number(r.addominali) || 0), 0);
        return { html: `${fl} fless · ${sq} squat · ${ad} addome`, cls: '' };
      }
      case 'pct_obj': {
        const tot = (CS.state.obiettivi || []).length;
        const pct = tot ? Math.round((curr / tot) * 100) : 0;
        return { html: `${pct}% di ${tot} totali`, cls: pct >= 50 ? 'good' : 'info' };
      }
      case 'streak_max': {
        const sm = CALC.streakMax ? CALC.streakMax() : { val: 0 };
        return { html: `record: ${sm.val || 0} giorni`, cls: 'info' };
      }
      case 'inj_resolved': {
        const pStart = units[0].start, pEnd = units[units.length - 1].end;
        const ris = (CS.state.infortuni || []).filter(i =>
          i.dataFine && inRange(i.dataFine, pStart, pEnd)).length;
        return { html: `${ris} risolti nel periodo`, cls: curr > 0 ? 'warn' : 'good' };
      }
      default:
        return { html: '', cls: '' };
    }
  }

  // ─── ANIMAZIONI ──────────────────────────────────────

  // Popola le 3 super-card di PANORAMICA (v4.0 — indice % composito)
  function animateZoneCards(grid) {
    if (!grid) return;
    const period = panoState.period;
    const units = getPeriodUnits(period);
    const prevUnits = getPrevPeriodUnits(period);

    FX.staggerIn(grid, '.zone-card', 80);

    grid.querySelectorAll('.zone-card').forEach(card => {
      const zoneId = card.dataset.zone;
      const meta = ZONE_META[zoneId];
      if (!meta) return;

      // ── Calcola indice % zona ──
      const curr = computeZoneScore(zoneId, units, prevUnits);
      const prev = computeZoneScore(zoneId, prevUnits);
      const score = curr.score;
      const prevScore = prev.score;

      const scoreClass = score == null ? 'is-empty'
        : score >= 80 ? 'is-high'
        : score >= 50 ? 'is-mid'
        : 'is-low';
      card.classList.remove('is-low', 'is-mid', 'is-high', 'is-empty');
      card.classList.add(scoreClass);

      // ── Hero numero gigante + ring ──
      const bigEl = card.querySelector('[data-zone-score]');
      if (bigEl) {
        if (score == null) {
          bigEl.textContent = '—';
        } else {
          bigEl.textContent = '0';
          FX.countUp(bigEl, 0, Math.round(score), 900, { decimals: 0 });
        }
      }
      const scoreBarFill = card.querySelector('[data-zone-score-bar]');
      if (scoreBarFill) {
        requestAnimationFrame(() => {
          scoreBarFill.style.width = (score != null ? Math.round(score) : 0) + '%';
        });
      }

      // ── Sparkline indice nel periodo (% per ogni unit) ──
      const sparkEl = card.querySelector('[data-zone-spark]');
      if (sparkEl) {
        sparkEl.innerHTML = '';
        const sparkVals = units.map(u => {
          const r = computeZoneScore(zoneId, [u]);
          return r.score == null ? 0 : Math.round(r.score);
        });
        const labels = units.map(u => u.label);
        const delta = (score || 0) - (prevScore || 0);
        const color = score == null
          ? 'var(--muted)'
          : delta < 0 ? 'var(--warn)' : 'var(--neon)';
        const fill = 'rgba(180,92,255,0.10)';
        FX.drawSparkline(sparkEl, sparkVals, {
          height: 62, color, fill,
          hoverTip: true,
          labels,
          valueFormatter: v => `${v}%`,
        });
      }

      // ── Mini-stat: 1 riga per parte con valore reale + barra target ──
      const miniBox = card.querySelector('[data-zone-ministats]');
      if (miniBox) {
        miniBox.innerHTML = renderZoneMiniStats(zoneId, curr.parts);
        // CountUp dei valori reali
        Object.entries(curr.parts).forEach(([key, p]) => {
          if (p.value == null && !p.raw) return;
          const valEl = miniBox.querySelector(`[data-mini-key="${key}"] .cup`);
          if (!valEl) return;
          const rawNum = getMiniStatNum(zoneId, key, p);
          if (rawNum == null) return;
          const dec = rawNum % 1 !== 0 ? 1 : 0;
          FX.countUp(valEl, 0, rawNum, 700, { decimals: dec });
        });
        // Anima bar fill
        requestAnimationFrame(() => {
          miniBox.querySelectorAll('.zone-card-ministat-bar-fill').forEach(b => {
            const pct = Number(b.dataset.pct) || 0;
            b.style.width = pct + '%';
          });
        });
      }

      // ── Insight testuale ──
      const insEl = card.querySelector('[data-zone-insight]');
      if (insEl) insEl.textContent = buildZoneInsight(zoneId, curr, prev);

      // ── Footer delta vs periodo prec (in punti percentuali) ──
      const deltaEl = card.querySelector('[data-zone-delta]');
      if (deltaEl) {
        if (score == null && prevScore == null) {
          deltaEl.textContent = 'nessun dato';
          deltaEl.className = 'zone-card-delta is-flat';
        } else if (prevScore == null) {
          deltaEl.textContent = 'nuovo periodo';
          deltaEl.className = 'zone-card-delta is-up';
        } else {
          const d = (score || 0) - (prevScore || 0);
          const arrow = d > 0.5 ? '↑' : d < -0.5 ? '↓' : '→';
          const dir = d > 0.5 ? 'is-up' : d < -0.5 ? 'is-down' : 'is-flat';
          deltaEl.textContent = `${arrow} ${Math.abs(Math.round(d))} pp vs ${prevPeriodLabel(period)}`;
          deltaEl.className = 'zone-card-delta ' + dir;
        }
      }

      // ── Breathe condizionale ──
      FX.stopBreathe(card);
      if (zoneId === 'fisica' && curr.parts.infortuni && curr.parts.infortuni.raw > 0) {
        FX.breathe(card, 0.5, { variant: 'danger' });
      } else if (score != null && score >= 80) {
        FX.breathe(card, 0.3, { variant: 'neon' });
      }
    });
  }

  // ── Helpers per mini-stat (numero reale da mostrare per ogni "part") ──
  function getMiniStatNum(zoneId, key, p) {
    if (zoneId === 'fisica') {
      if (key === 'peso')     return p.raw == null ? null : Number(p.raw);
      if (key === 'sonno')    return Number(p.raw) || 0;
      if (key === 'volume')   return Number(p.raw) || 0;
      if (key === 'corsa')    return (p.raw && p.raw.km != null) ? Number(p.raw.km) : 0;
      if (key === 'infortuni') return Number(p.raw) || 0;
    }
    if (zoneId === 'focus') {
      if (key === 'ore')       return Number(p.raw) || 0;
      if (key === 'sessioni')  return Number(p.raw) || 0;
      if (key === 'obiettivi') return p.raw ? Number(p.raw.done) : 0;
      if (key === 'streak')    return Number(p.raw) || 0;
    }
    if (zoneId === 'tecnica') {
      if (key === 'votiAree') return Number(p.raw) || 0;
      if (key === 'votiFond') return Number(p.raw) || 0;
    }
    return null;
  }

  const ZONE_MINI_META = {
    fisica: {
      peso:      { ico: '⚖️', label: 'PESO',      unit: 'kg' },
      sonno:     { ico: '🌙', label: 'SONNO',     unit: 'h' },
      volume:    { ico: '⚡', label: 'VOLUME',    unit: 'rip' },
      corsa:     { ico: '🏃', label: 'KM CORSA',  unit: 'km' },
      infortuni: { ico: '🩹', label: 'INFORTUNI', unit: '' },
    },
    focus: {
      ore:       { ico: '⏱',  label: 'ORE',        unit: 'h' },
      sessioni:  { ico: '🥊', label: 'SESSIONI',   unit: '' },
      obiettivi: { ico: '✅', label: 'OBIETTIVI',  unit: '' },
      streak:    { ico: '🔥', label: 'STREAK',     unit: 'gg' },
    },
    tecnica: {
      votiAree: { ico: '🎯', label: 'AREE',    unit: '/10' },
      votiFond: { ico: '💪', label: 'FONDAM.', unit: '/10' },
    },
  };

  function renderZoneMiniStats(zoneId, parts) {
    const meta = ZONE_MINI_META[zoneId] || {};
    return Object.entries(parts).map(([key, p]) => {
      const m = meta[key] || { ico: '·', label: key.toUpperCase(), unit: '' };
      const pct = p.value == null ? 0 : Math.round(p.value);
      const noData = p.value == null && (p.raw == null || (typeof p.raw === 'object' && !p.raw.done && !p.raw.km));
      const valDisplay = noData ? '—' : '0';
      // Special label for obiettivi: "X / Y obiettivi"
      let valSuffix = m.unit;
      if (zoneId === 'focus' && key === 'obiettivi' && p.raw) {
        valSuffix = `/ ${p.raw.tot}`;
      }
      const barClass = pct >= 100 ? 'is-full' : pct >= 60 ? 'is-good' : pct >= 30 ? 'is-mid' : 'is-low';
      const pctLabel = noData ? '' : `<span class="zone-card-ministat-pct ${barClass}">${pct}%</span>`;
      return `
        <div class="zone-card-ministat" data-mini-key="${key}">
          <div class="zone-card-ministat-row">
            <span class="zone-card-ministat-ico">${m.ico}</span>
            <span class="zone-card-ministat-lbl">${m.label}</span>
            <span class="zone-card-ministat-val">
              <span class="cup">${valDisplay}</span><span class="zone-card-ministat-unit">${valSuffix}</span>
              ${pctLabel}
            </span>
          </div>
          <div class="zone-card-ministat-bar">
            <div class="zone-card-ministat-bar-fill ${barClass}" data-pct="${pct}" style="width:0%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function animatePanoCards(grid) {
    if (!grid) return;
    const period = panoState.period;
    const units = getPeriodUnits(period);
    const prevUnits = getPrevPeriodUnits(period);

    // Stagger entry CSS
    FX.staggerIn(grid, '.pano-card', 60);

    grid.querySelectorAll('.pano-card').forEach(card => {
      const id = card.dataset.card;
      const spec = PANO_CARDS.find(s => s.id === id);
      if (!spec) return;

      const sparkVals = buildSparkValues(spec, units);
      const sparkLabels = units.map(u => u.label);
      const currVal = computePeriodValue(spec, sparkVals);
      const prevVal = computePeriodValue(spec, buildSparkValues(spec, prevUnits));
      const delta = (currVal || 0) - (prevVal || 0);
      const sub = buildSubLabel(spec, units, sparkVals, units.length - 1, currVal, prevVal);

      // Numero grande con countUp
      const bigEl = card.querySelector('[data-big]');
      if (bigEl) {
        const big = spec.fmtBig(currVal);
        if (big === '—') {
          bigEl.innerHTML = `—<span class="widget-unit">${spec.unit}</span>`;
        } else {
          // detect decimali da fmtBig output
          const hasDec = String(big).includes('.');
          const decimals = hasDec ? 1 : 0;
          bigEl.innerHTML = `<span class="cup">0</span><span class="widget-unit">${spec.unit}</span>`;
          const cup = bigEl.querySelector('.cup');
          FX.countUp(cup, 0, Number(currVal) || 0, 700, { decimals });
        }
      }

      // Sub-label
      const subEl = card.querySelector('[data-sub]');
      if (subEl) {
        subEl.className = 'widget-sub ' + (sub.cls || '');
        subEl.innerHTML = sub.html || '&nbsp;';
      }

      // Trend visual
      const sparkEl = card.querySelector('[data-spark]');
      if (sparkEl) {
        sparkEl.innerHTML = '';
        if (spec.trendType === 'ring') {
          const tot = (CS.state.obiettivi || []).length;
          const pct = tot ? Math.round((currVal / tot) * 100) : 0;
          FX.ringProgress(sparkEl, pct, { size: 64, stroke: 6, center: `${pct}%` });
        } else if (spec.trendType === 'heatmap30') {
          renderHeatmap30(sparkEl);
        } else {
          // Sparkline standard
          const color = (spec.id === 'infortuni' && currVal > 0)
            ? 'var(--danger)'
            : (delta < 0 && spec.id !== 'peso') ? 'var(--warn)' : 'var(--neon)';
          const fill = (spec.id === 'infortuni' && currVal > 0)
            ? 'rgba(255,51,102,0.10)'
            : (delta < 0 && spec.id !== 'peso') ? 'rgba(245,158,11,0.10)' : 'rgba(180,92,255,0.10)';
          FX.drawSparkline(sparkEl, sparkVals, {
            height: 40, color, fill,
            hoverTip: true,
            labels: sparkLabels,
            valueFormatter: spec.fmtBig,
          });
        }
      }

      // Breathe selettivo
      FX.stopBreathe(card);
      if (spec.id === 'infortuni' && currVal > 0) {
        FX.breathe(card, 0.5, { variant: 'danger' });
      } else if (delta > 0 && spec.id !== 'peso' && currVal > 0) {
        FX.breathe(card, 0.3, { variant: 'neon' });
      } else if (spec.id === 'peso' && delta < 0 && currVal > 0) {
        // Peso che cala = buon segno verso target
        FX.breathe(card, 0.3, { variant: 'neon' });
      }
    });
  }

  function animateLeave(grid, cb) {
    if (!grid) { cb && cb(); return; }
    grid.classList.add('is-leaving');
    setTimeout(() => { grid.classList.remove('is-leaving'); cb && cb(); }, 180);
  }

  function renderHeatmap30(host) {
    // 30 celle: oggi a destra, 30gg fa a sinistra
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = CS.isoDateOnly(d);
      const rev = (CS.state.revisioni || []).find(r => r.data === iso);
      const ore = rev ? (Number(rev.oreAllenamento) || Number(rev.oreH) || 0) : 0;
      const intensity = ore > 0 ? Math.min(4, Math.max(1, Math.ceil(ore * 1.5))) : 0;
      const isToday = i === 0 ? 'is-today' : '';
      cells.push(
        intensity > 0
          ? `<div class="fx-heat-cell pano-heat-cell ${isToday}" data-intensity="${intensity}" title="${CS.fmtDate(iso, { short: true })} · ${ore.toFixed(1)}h"></div>`
          : `<div class="fx-heat-cell pano-heat-cell is-empty" title="${CS.fmtDate(iso, { short: true })} · —"></div>`
      );
    }
    host.innerHTML = `<div class="pano-heat-30">${cells.join('')}</div>`;
  }

  // ─── INSIGHT BUILDER (categoria-specifici) ──────────

  function buildInsights(spec, units, vals) {
    const out = [];
    const safeNum = n => (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : 0;
    const records = (CALC.records && CALC.records()) || {};

    try {
      switch (spec.id) {
        case 'ore': {
          // 🏆 Sessione max ore
          const r = records.maxOreGiorno;
          if (r && r.val && r.data) out.push({ icon: '🏆', tone: 'info', html: `Sessione più lunga: <b>${r.val.toFixed(1)} h</b> il ${CS.fmtDate(r.data, { long: true })}` });
          // 📈 Trend prima/seconda metà
          const half = Math.floor(vals.length / 2);
          if (half >= 2) {
            const a = vals.slice(0, half).reduce((x, y) => x + y, 0);
            const b = vals.slice(half).reduce((x, y) => x + y, 0);
            if (a > 0 || b > 0) {
              const diff = b - a;
              const pct = a > 0 ? Math.round((diff / a) * 100) : 0;
              const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
              const tone = diff > 0 ? 'good' : diff < 0 ? 'warn' : 'info';
              out.push({ icon: '📈', tone, html: `Trend: <b>${arrow} ${Math.abs(diff).toFixed(1)}h</b> seconda metà vs prima (${pct > 0 ? '+' : ''}${pct}%)` });
            }
          }
          // 🎯 Target settimanale
          if (CALC.oreSettVsTarget) {
            const t = CALC.oreSettVsTarget();
            const pctT = Math.round(t.pct);
            const tone = pctT >= 100 ? 'good' : pctT >= 70 ? 'info' : 'warn';
            out.push({ icon: '🎯', tone, html: `Target settimanale: <b>${t.ore.toFixed(1)}/${t.target}h</b> (${pctT}%)` });
          }
          // 😴 Correlazione sonno
          if (CALC.sonnoCorrelazioneTecnica) {
            const c = CALC.sonnoCorrelazioneTecnica(7);
            if (c && c.tecnicaConBuonSonno && c.tecnicaConPocoSonno) {
              const d = c.tecnicaConBuonSonno - c.tecnicaConPocoSonno;
              if (Math.abs(d) > 0.3) {
                out.push({ icon: '😴', tone: 'info', html: `Con ≥7h sonno: tecnica <b>${c.tecnicaConBuonSonno.toFixed(1)}</b> vs <b>${c.tecnicaConPocoSonno.toFixed(1)}</b> (${d > 0 ? '+' : ''}${d.toFixed(1)})` });
              }
            }
          }
          break;
        }

        case 'sess': {
          const tot = vals.reduce((a, b) => a + b, 0);
          out.push({ icon: '🥊', tone: 'info', html: `Totale sessioni nel periodo: <b>${Math.round(tot)}</b>` });
          const avg = vals.filter(v => v > 0).length ? (tot / vals.filter(v => v > 0).length) : 0;
          if (avg > 0) out.push({ icon: '📅', tone: 'info', html: `Media <b>${avg.toFixed(1)}</b> sessioni per ${periodWord(panoState.period, false).toLowerCase()} attivo` });
          const r = records.maxOreGiorno;
          if (r && r.val) out.push({ icon: '💪', tone: 'good', html: `Sessione più lunga: <b>${r.val.toFixed(1)} h</b> il ${CS.fmtDate(r.data, { long: true })}` });
          if (CALC.streakDays) {
            const sd = CALC.streakDays();
            if (sd > 0) out.push({ icon: '🔥', tone: 'good', html: `Streak attiva: <b>${sd} giorni</b> consecutivi` });
          }
          break;
        }

        case 'votiAree': {
          if (CS.AREE_TECNICHE && CALC.votoMedioArea) {
            const ranked = CS.AREE_TECNICHE
              .map(a => ({ area: a, voto: CALC.votoMedioArea(a, 90) || 0 }))
              .filter(x => x.voto > 0)
              .sort((a, b) => b.voto - a.voto);
            if (ranked.length) {
              const top = ranked[0];
              const weak = ranked[ranked.length - 1];
              out.push({ icon: '🎯', tone: 'good', html: `Area top: <b>${escapeHtml(top.area)}</b> · ${top.voto.toFixed(1)}/10` });
              if (ranked.length > 1 && weak.area !== top.area) {
                out.push({ icon: '📉', tone: 'warn', html: `Area da curare: <b>${escapeHtml(weak.area)}</b> · ${weak.voto.toFixed(1)}/10` });
              }
              // Area con maggior trend (positivo o negativo)
              if (CALC.trendArea) {
                const trends = CS.AREE_TECNICHE
                  .map(a => ({ area: a, t: CALC.trendArea(a) || 0 }))
                  .filter(x => Math.abs(x.t) > 0.3)
                  .sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
                if (trends.length) {
                  const tr = trends[0];
                  const arrow = tr.t > 0 ? '↑' : '↓';
                  const tone = tr.t > 0 ? 'good' : 'warn';
                  out.push({ icon: '📊', tone, html: `Maggior trend: <b>${escapeHtml(tr.area)}</b> ${arrow} ${Math.abs(tr.t).toFixed(1)} pts (30gg)` });
                }
              }
            }
          }
          const r = records.maxTecnica;
          if (r && r.val) out.push({ icon: '🏆', tone: 'info', html: `Voto tecnica record: <b>${r.val}/10</b> il ${CS.fmtDate(r.data, { long: true })}` });
          break;
        }

        case 'votiFond': {
          if (CS.FONDAMENTALI && CALC.votoMedioFond) {
            const ranked = CS.FONDAMENTALI
              .map(f => ({ f, voto: CALC.votoMedioFond(f, 90) || 0 }))
              .filter(x => x.voto > 0)
              .sort((a, b) => b.voto - a.voto);
            if (ranked.length) {
              out.push({ icon: '🥇', tone: 'good', html: `Fondamentale top: <b>${escapeHtml(ranked[0].f)}</b> · ${ranked[0].voto.toFixed(1)}/10` });
              if (ranked.length > 1) {
                const w = ranked[ranked.length - 1];
                out.push({ icon: '⚠', tone: 'warn', html: `Da migliorare: <b>${escapeHtml(w.f)}</b> · ${w.voto.toFixed(1)}/10` });
              }
            }
            // Crescita media 30 vs 60gg
            const grow = CS.FONDAMENTALI
              .map(f => (CALC.votoMedioFond(f, 30) || 0) - (CALC.votoMedioFond(f, 60) || 0))
              .filter(x => x !== 0);
            if (grow.length) {
              const m = grow.reduce((a, b) => a + b, 0) / grow.length;
              const arrow = m > 0 ? '↑' : m < 0 ? '↓' : '→';
              const tone = m > 0 ? 'good' : m < 0 ? 'warn' : 'info';
              out.push({ icon: '📈', tone, html: `Crescita media 30gg: <b>${arrow} ${Math.abs(m).toFixed(2)} pts</b> vs 60gg fa` });
            }
          }
          break;
        }

        case 'peso': {
          const tgt = CS.state.profile && CS.state.profile.pesoTarget;
          const curr = CALC.pesoCurrent && CALC.pesoCurrent();
          if (tgt && curr) {
            const diff = curr - tgt;
            const tone = diff <= 0 ? 'good' : diff < 3 ? 'info' : 'warn';
            out.push({ icon: '🎯', tone, html: `Target: <b>${tgt} kg</b> · ${diff > 0 ? 'mancano ' + diff.toFixed(1) + ' kg' : 'raggiunto! ' + Math.abs(diff).toFixed(1) + ' kg sotto target'}` });
          } else if (tgt) {
            out.push({ icon: '🎯', tone: 'info', html: `Target: <b>${tgt} kg</b> · nessuna pesata recente` });
          }
          if (CALC.pesoPaceStato) {
            const p = CALC.pesoPaceStato();
            if (p && p.label && p.stato !== 'no_data') {
              const tone = p.stato === 'raggiunto' || p.stato === 'in_linea' ? 'good'
                         : p.stato === 'ritardo' ? 'warn' : 'danger';
              out.push({ icon: '📅', tone, html: `Pace: <b>${p.label}</b>${p.kgSettRichiesti ? ' · richiesti ' + p.kgSettRichiesti.toFixed(2) + ' kg/sett' : ''}` });
            }
          }
          const r = records.pesoMin;
          if (r && r.val) out.push({ icon: '📉', tone: 'info', html: `Peso minimo storico: <b>${r.val.toFixed(1)} kg</b> il ${CS.fmtDate(r.data, { long: true })}` });
          if (CALC.pesoTrend7gg) {
            const t = CALC.pesoTrend7gg();
            if (Math.abs(t) > 0.05) {
              const arrow = t > 0 ? '↑' : '↓';
              const tone = t < 0 ? 'good' : 'warn';
              out.push({ icon: '📊', tone, html: `Trend 7gg: <b>${arrow} ${Math.abs(t).toFixed(2)} kg/sett</b>` });
            }
          }
          break;
        }

        case 'km': {
          if (CALC.corsaPaceMedio) {
            const p = CALC.corsaPaceMedio(30);
            if (p) out.push({ icon: '🏃', tone: 'info', html: `Pace medio 30gg: <b>${p.formatted} min/km</b>` });
          }
          if (CALC.corsaKmSett) {
            const km = CALC.corsaKmSett();
            if (km > 0) out.push({ icon: '📊', tone: 'good', html: `Settimana corrente: <b>${km.toFixed(1)} km</b>` });
          }
          const r = records.maxKmCorsa;
          if (r && r.val) out.push({ icon: '🏆', tone: 'good', html: `Corsa più lunga: <b>${r.val.toFixed(1)} km</b> il ${CS.fmtDate(r.data, { long: true })}` });
          if (CALC.corsaFCMax && CALC.corsaZone) {
            const fcMax = CALC.corsaFCMax();
            const z = CALC.corsaZone();
            if (z && z[3]) out.push({ icon: '❤', tone: 'info', html: `FC Max stimata: <b>${fcMax} bpm</b> · zona soglia ${z[3].min}-${z[3].max}` });
          }
          break;
        }

        case 'sonno': {
          if (CALC.sonnoDebito) {
            const d = CALC.sonnoDebito(7.5, 7);
            if (d > 0) {
              const tone = d > 5 ? 'danger' : d > 2 ? 'warn' : 'info';
              out.push({ icon: '💤', tone, html: `Debito 7gg: <b>${d.toFixed(1)}h</b> sotto target 7.5h` });
            } else {
              out.push({ icon: '💤', tone: 'good', html: `Nessun debito sonno: target 7.5h rispettato` });
            }
          }
          if (CALC.sonnoCorrelazioneTecnica) {
            const c = CALC.sonnoCorrelazioneTecnica(7);
            if (c && c.tecnicaConBuonSonno && c.tecnicaConPocoSonno) {
              out.push({ icon: '🧠', tone: 'info', html: `Tecnica con ≥7h: <b>${c.tecnicaConBuonSonno.toFixed(1)}</b> vs <b>${c.tecnicaConPocoSonno.toFixed(1)}</b> con &lt;7h (n=${c.campioneAlto}+${c.campioneBasso})` });
            }
          }
          const avgP = vals.filter(v => v > 0);
          if (avgP.length) {
            const m = avgP.reduce((a, b) => a + b, 0) / avgP.length;
            out.push({ icon: '📊', tone: 'info', html: `Media periodo: <b>${m.toFixed(1)}h/notte</b> (${avgP.length} notti registrate)` });
          }
          break;
        }

        case 'volume': {
          // Estrazione manuale per il periodo selezionato (somma su tutte units)
          const allUnits = units;
          let fl = 0, sq = 0, ad = 0;
          allUnits.forEach(u => {
            const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, u.start, u.end));
            fl += revs.reduce((a, r) => a + (Number(r.flessioni) || 0), 0);
            sq += revs.reduce((a, r) => a + (Number(r.squat) || 0), 0);
            ad += revs.reduce((a, r) => a + (Number(r.addominali) || 0), 0);
          });
          if (records.maxFlessioni && records.maxFlessioni.val)
            out.push({ icon: '💪', tone: 'info', html: `Flessioni periodo: <b>${fl}</b> · record <b>${records.maxFlessioni.val}</b> il ${CS.fmtDate(records.maxFlessioni.data, { long: true })}` });
          if (records.maxSquat && records.maxSquat.val)
            out.push({ icon: '🦵', tone: 'info', html: `Squat periodo: <b>${sq}</b> · record <b>${records.maxSquat.val}</b> il ${CS.fmtDate(records.maxSquat.data, { long: true })}` });
          if (CALC.volumiSett) {
            const v = CALC.volumiSett();
            if (v) out.push({ icon: '🔥', tone: 'good', html: `Settimana attuale: <b>${v.flessioni}f · ${v.squat}s · ${v.addominali}a</b>` });
          }
          const tot = fl + sq + ad;
          if (tot > 0) {
            const pf = Math.round((fl / tot) * 100);
            const ps = Math.round((sq / tot) * 100);
            const pa = 100 - pf - ps;
            out.push({ icon: '📈', tone: 'info', html: `Distribuzione: <b>${pf}%</b> flessioni · <b>${ps}%</b> squat · <b>${pa}%</b> addome` });
          }
          break;
        }

        case 'obiettivi': {
          const all = CS.state.obiettivi || [];
          const compl = all.filter(isObiettivoDone).length;
          const pct = all.length ? Math.round((compl / all.length) * 100) : 0;
          const tone = pct >= 70 ? 'good' : pct >= 30 ? 'info' : 'warn';
          out.push({ icon: '✅', tone, html: `Completati: <b>${compl} / ${all.length}</b> totali (${pct}%)` });
          if (CALC.prossimoObiettivo) {
            const next = CALC.prossimoObiettivo();
            if (next && next.obj) {
              const dl = next.daysLeft;
              const t = dl < 0 ? 'danger' : dl < 7 ? 'warn' : 'info';
              out.push({ icon: '⏳', tone: t, html: `Prossimo: <b>${escapeHtml(next.obj.descrizione || '—')}</b> · ${dl >= 0 ? dl + ' gg restanti' : 'in ritardo di ' + Math.abs(dl) + 'gg'}` });
            }
          }
          // % per scadenza
          if (CALC.pctObiettiviCompletati) {
            const pg = CALC.pctObiettiviCompletati('giornaliero');
            const ps = CALC.pctObiettiviCompletati('settimanale');
            const pm = CALC.pctObiettiviCompletati('mensile');
            const pa = CALC.pctObiettiviCompletati('annuale');
            out.push({ icon: '📅', tone: 'info', html: `Per scadenza: G <b>${pg}%</b> · S <b>${ps}%</b> · M <b>${pm}%</b> · A <b>${pa}%</b>` });
          }
          break;
        }

        case 'streak': {
          if (CALC.streakDays) {
            const sd = CALC.streakDays();
            out.push({ icon: '🔥', tone: sd >= 7 ? 'good' : 'info', html: `Streak attiva: <b>${sd} giorni</b> consecutivi` });
          }
          if (CALC.streakMax) {
            const sm = CALC.streakMax();
            if (sm && sm.val) {
              const rng = sm.start && sm.end ? `${CS.fmtDate(sm.start, { short: true })} → ${CS.fmtDate(sm.end, { short: true })}` : '';
              out.push({ icon: '🏆', tone: 'good', html: `Record di sempre: <b>${sm.val} giorni</b>${rng ? ' · ' + rng : ''}` });
            }
          }
          // Giorni riposo in periodo
          const allUnits = units;
          let riposo = 0;
          allUnits.forEach(u => {
            const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, u.start, u.end));
            riposo += revs.filter(r => r.riposo).length;
          });
          out.push({ icon: '📅', tone: 'info', html: `Giorni di riposo nel periodo: <b>${riposo}</b>` });
          break;
        }

        case 'infortuni': {
          const attivi = (CS.state.infortuni || []).filter(i => !i.dataFine).length;
          const tone = attivi > 0 ? 'danger' : 'good';
          out.push({ icon: attivi > 0 ? '🩹' : '✓', tone, html: attivi > 0 ? `Attivi oggi: <b>${attivi}</b>` : `Nessun infortunio attivo` });
          // Risolti in periodo
          const allUnits = units;
          let ris = 0;
          allUnits.forEach(u => {
            ris += (CS.state.infortuni || []).filter(i => i.dataFine && inRange(i.dataFine, u.start, u.end)).length;
          });
          out.push({ icon: '✓', tone: 'info', html: `Risolti nel periodo: <b>${ris}</b>` });
          // Pattern recidive
          if (CALC.infortuniPattern) {
            const pat = CALC.infortuniPattern(6);
            if (pat && pat.length) {
              const p = pat[0];
              const tone2 = p.warning === 'critica' ? 'danger' : 'warn';
              out.push({ icon: '⚠', tone: tone2, html: `Pattern recidive: <b>${escapeHtml(p.parte)}</b> (${p.count} episodi negli ultimi 6 mesi) — ${p.warning}` });
            }
          }
          // Durata media gg
          const risolti = (CS.state.infortuni || []).filter(i => i.dataInizio && i.dataFine);
          if (risolti.length) {
            const durs = risolti.map(i => Math.max(1, Math.round((new Date(i.dataFine) - new Date(i.dataInizio)) / 86400000)));
            const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
            out.push({ icon: '📊', tone: 'info', html: `Durata media infortunio: <b>${avg.toFixed(0)} giorni</b>` });
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[buildInsights] errore:', e);
    }
    return out;
  }

  // ─── EXPAND MODAL ────────────────────────────────────

  // Mapping spec.id → chiave records() per RECORD STORICO
  const RECORDS_MAP = {
    ore:     { key: 'maxOreGiorno', label: 'Sess. più ore', unit: 'h',  fmt: v => v.toFixed(1) },
    sess:    { key: 'maxOreGiorno', label: 'Sess. più ore', unit: 'h',  fmt: v => v.toFixed(1) },
    votiAree:{ key: 'maxTecnica',   label: 'Voto top',      unit: '/10',fmt: v => v.toFixed(1) },
    votiFond:{ key: 'maxTecnica',   label: 'Voto top',      unit: '/10',fmt: v => v.toFixed(1) },
    peso:    { key: 'pesoMin',      label: 'Peso min',      unit: 'kg', fmt: v => v.toFixed(1) },
    km:      { key: 'maxKmCorsa',   label: 'Corsa max',     unit: 'km', fmt: v => v.toFixed(1) },
    volume:  { key: 'maxFlessioni', label: 'Max fless.',    unit: '',   fmt: v => String(v) },
    sonno:   { key: null }, // gestito a parte
    obiettivi:{ key: null },
    streak:  { key: null },
    infortuni:{ key: null },
  };
  const CUMULATIVE_IDS = new Set(['ore','sess','km','volume','obiettivi']);
  const PUNTUALI_IDS   = new Set(['peso','sonno','votiAree','votiFond']);

  // Gradient helper per Chart.js
  function buildGradient(ctx, color = 'rgba(180,92,255,0.30)') {
    const c = ctx.chart.ctx;
    const area = ctx.chart.chartArea;
    if (!area) return color;
    const g = c.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(180,92,255,0)');
    return g;
  }

  // Chart type default per categoria
  function defaultChartType(specId) {
    if (PUNTUALI_IDS.has(specId)) return 'line';
    return 'bar';
  }

  // ─── HELPERS PER MODAL POPUP RICCO (v8.2) ────────────

  function prevPeriodLabel(period) {
    if (period === '30GG') return '30 giorni precedenti';
    if (period === 'YTD')  return 'YTD anno scorso';
    return 'periodo storico prec.';
  }

  function fmtDeltaPct(curr, prev) {
    if (!prev || prev === 0) {
      if (!curr) return { pct: 0, sign: '→', dir: 'flat', text: '0%' };
      return { pct: 100, sign: '↑', dir: 'up', text: 'NUOVO' };
    }
    const pct = Math.round(((curr - prev) / Math.abs(prev)) * 100);
    if (pct === 0) return { pct: 0, sign: '→', dir: 'flat', text: '0%' };
    if (pct > 0) return { pct, sign: '↑', dir: 'up', text: `+${pct}%` };
    return { pct: Math.abs(pct), sign: '↓', dir: 'down', text: `${pct}%` };
  }

  // Media storica per periodo (avg per giorno/sett/mese su tutta la history)
  function computeHistoricalAvg(spec) {
    try {
      const allDates = [];
      const collectDates = (arr, key) => (arr || []).forEach(x => x[key] && allDates.push(x[key]));
      collectDates(CS.state.revisioni, 'data');
      collectDates(CS.state.pesate, 'data');
      collectDates(CS.state.sonno, 'data');
      collectDates(CS.state.corsa, 'data');
      collectDates(CS.state.areeVoti, 'data');
      collectDates(CS.state.fondVoti, 'data');
      if (!allDates.length) return 0;
      allDates.sort();
      const first = new Date(allDates[0]); first.setHours(0,0,0,0);
      const today = new Date(); today.setHours(23,59,59,999);
      const fullUnit = { start: first, end: today };
      const totalDays = Math.max(1, Math.round((today - first) / 86400000));
      const reducer = REDUCERS[spec.reducer];
      if (!reducer) return 0;
      if (spec.id === 'streak' || spec.id === 'infortuni') return 0;
      const total = reducer(fullUnit);
      if (CUMULATIVE_IDS.has(spec.id)) {
        // average per day
        return totalDays > 0 ? total / totalDays : 0;
      }
      // PUNTUALI / medie: ritorna media tale-quale (è già una media o ultimo)
      // Per avg metrics (sonno, votiAree, votiFond), il reducer su fullUnit dà la media storica
      return total || 0;
    } catch (e) { return 0; }
  }

  // Trasforma media storica in scala "per unità del periodo" per confronto
  function historicalAvgPerUnit(spec, period) {
    const base = computeHistoricalAvg(spec); // per giorno (cumulativi) o valore medio (puntuali)
    if (spec.id === 'streak' || spec.id === 'infortuni') return 0;
    if (!CUMULATIVE_IDS.has(spec.id)) return base; // già media diretta
    // Cumulativi: base è per giorno → moltiplica per giorni nel bucket
    if (period === '30GG') return base; // bucket = 1 giorno
    if (period === 'YTD')  return base * 30; // bucket ≈ 1 mese
    // TUTTO: dipende da strategy
    const yi = panoState.yearInfo || ensureYearStrategy();
    if (yi.strategy === '4y+') return base * 365; // bucket = 1 anno
    return base * 30; // bucket = 1 mese
  }

  // Record metadata: { val, date, count, ageDays, isNewRecord }
  function getRecordMeta(spec, currMax) {
    try {
      const rmap = RECORDS_MAP[spec.id] || {};
      const records = (CALC.records && CALC.records()) || {};
      let val = 0, date = null, count = 0;
      if (rmap.key && records[rmap.key]) {
        val = Number(records[rmap.key].val) || 0;
        date = records[rmap.key].data || null;
      } else if (spec.id === 'streak') {
        const sm = CALC.streakMax && CALC.streakMax();
        if (sm) { val = sm.val || 0; date = sm.start; }
      } else if (spec.id === 'sonno') {
        const son = (CS.state.sonno || []);
        if (son.length) {
          const top = son.reduce((a, b) => ((Number(b.ore)||0) > (Number(a.ore)||0)) ? b : a, son[0]);
          val = Number(top.ore) || 0; date = top.data;
        }
      }
      // Count: quante volte si è raggiunto/eguagliato il record (entro 5%)
      if (val > 0) {
        const reducer = REDUCERS[spec.reducer];
        if (reducer && spec.id !== 'streak') {
          // approssima: per cumulativi conta giorni con val >= threshold; per puntuali idem
          const threshold = val * 0.95;
          // Scorri tutta la history per giorni
          try {
            const today = new Date(); today.setHours(23,59,59,999);
            const allDates = new Set();
            const collect = (arr, key) => (arr || []).forEach(x => x[key] && allDates.add(x[key].slice(0,10)));
            collect(CS.state.revisioni, 'data');
            collect(CS.state.pesate, 'data');
            collect(CS.state.sonno, 'data');
            collect(CS.state.corsa, 'data');
            let c = 0;
            [...allDates].forEach(iso => {
              const d = new Date(iso); d.setHours(0,0,0,0);
              const e = new Date(d); e.setHours(23,59,59,999);
              const r = reducer({ start: d, end: e });
              if (r >= threshold) c++;
            });
            count = c;
          } catch (e) { count = 1; }
        } else {
          count = 1;
        }
      }
      let ageDays = null;
      if (date) {
        ageDays = Math.round((Date.now() - new Date(date).getTime()) / 86400000);
      }
      const isNewRecord = currMax >= val && val > 0 && currMax > 0;
      return { val, date, count, ageDays, isNewRecord, isOld: ageDays != null && ageDays > 180 };
    } catch (e) { return { val: 0, date: null, count: 0, ageDays: null, isNewRecord: false, isOld: false }; }
  }

  // Volume breakdown: lista esercizi con valore + delta vs periodo precedente
  function getVolumeBreakdown(units, prevUnits) {
    const pStart = units[0].start, pEnd = units[units.length - 1].end;
    const ppStart = prevUnits[0].start, ppEnd = prevUnits[prevUnits.length - 1].end;
    const curr = (CS.state.revisioni || []).filter(r => inRange(r.data, pStart, pEnd));
    const prev = (CS.state.revisioni || []).filter(r => inRange(r.data, ppStart, ppEnd));
    const sumKey = (arr, key) => arr.reduce((a, r) => a + (Number(r[key]) || 0), 0);
    const types = [
      { key: 'flessioni', label: 'Flessioni' },
      { key: 'squat',     label: 'Squat' },
      { key: 'addominali',label: 'Addominali' },
    ];
    return types.map(t => ({
      label: t.label,
      value: sumKey(curr, t.key),
      prevValue: sumKey(prev, t.key),
    }));
  }

  // Smart insights v2: 5 categorie priorità, max 3 ritornati
  function buildSmartInsights(spec, period, units, prevUnits, vals, prevVals) {
    const out = [];
    const currTotal = computePeriodValue(spec, vals);
    const prevTotal = computePeriodValue(spec, prevVals);
    const prevWord = prevPeriodLabel(period);

    // 1. PERFORMANCE vs PERIODO PRECEDENTE
    try {
      if (prevTotal > 0) {
        const ratio = (currTotal - prevTotal) / Math.abs(prevTotal);
        if (ratio >= 0.2) {
          const lbl = period === '30GG' ? 'Periodo' : period === 'YTD' ? 'YTD' : 'Storico';
          out.push({ icon: '🔥', tone: 'good', html: `<b>${lbl} top</b>, +${Math.round(ratio * 100)}% vs ${prevWord}` });
        } else if (ratio >= -0.1) {
          out.push({ icon: '📊', tone: 'info', html: `In linea con ${prevWord} (${ratio >= 0 ? '+' : ''}${Math.round(ratio * 100)}%)` });
        } else if (ratio <= -0.2) {
          out.push({ icon: '⚠️', tone: 'warn', html: `Volume basso vs ${prevWord}: ${Math.round(ratio * 100)}%` });
        }
      } else if (currTotal > 0) {
        out.push({ icon: '🆕', tone: 'good', html: `Primo periodo con dati su questa metrica` });
      }
    } catch (e) {}

    // 2. PATTERN SETTIMANALE (giorno con più volume negli ultimi 30gg)
    try {
      if (spec.id !== 'streak' && spec.id !== 'infortuni' && CUMULATIVE_IDS.has(spec.id)) {
        const today = new Date(); today.setHours(0,0,0,0);
        const dayTotals = [0,0,0,0,0,0,0]; // lun..dom
        const dayCounts = [0,0,0,0,0,0,0];
        for (let i = 0; i < 30; i++) {
          const d = new Date(today); d.setDate(today.getDate() - i);
          const e = new Date(d); e.setHours(23,59,59,999);
          const v = REDUCERS[spec.reducer] ? REDUCERS[spec.reducer]({ start: d, end: e }) : 0;
          const dayIdx = (d.getDay() || 7) - 1; // 0=lun..6=dom
          dayTotals[dayIdx] += v;
          if (v > 0) dayCounts[dayIdx]++;
        }
        const avgs = dayTotals.map((t, i) => dayCounts[i] > 0 ? t / dayCounts[i] : 0);
        const dayNames = ['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'];
        const maxIdx = avgs.indexOf(Math.max(...avgs));
        const minIdx = avgs.indexOf(Math.min(...avgs.filter(v => v > 0)));
        if (avgs[maxIdx] > 0) {
          out.push({ icon: '📅', tone: 'info', html: `Sei più produttivo il <b>${dayNames[maxIdx]}</b> (ultimi 30gg)` });
        }
      }
    } catch (e) {}

    // 3. STREAK / CONSISTENZA (solo 30GG: ha senso contare giorni allenati)
    try {
      if (period === '30GG') {
        const now = new Date();
        // Conta giorni con allenamento negli ultimi 30 giorni (bucket = giorno)
        const trained = units.filter(u => {
          const revs = (CS.state.revisioni || []).filter(r => inRange(r.data, u.start, u.end));
          return revs.some(r => (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0);
        }).length;
        const elapsed = units.filter(u => u.end <= now).length;
        const lost = elapsed - trained;
        const ratioTrained = elapsed > 0 ? trained / elapsed : 0;
        if (ratioTrained >= 0.9 && trained >= 20) {
          out.push({ icon: '⚡', tone: 'good', html: `<b>Consistenza altissima</b>: ${trained}/${elapsed} giorni allenati` });
        } else if (ratioTrained >= 0.6) {
          out.push({ icon: '✓', tone: 'info', html: `Consistenza buona: <b>${trained}/${elapsed}</b> giorni allenati (${Math.round(ratioTrained*100)}%)` });
        } else if (lost >= 10) {
          out.push({ icon: '🚫', tone: 'warn', html: `<b>${lost} giorni</b> senza allenamento negli ultimi 30` });
        }
      }
    } catch (e) {}

    // 4. AVVICINAMENTO / NUOVO RECORD
    try {
      const recMeta = getRecordMeta(spec, Math.max(...vals, 0));
      const max = Math.max(...vals, 0);
      if (recMeta.val > 0 && max > 0) {
        if (max >= recMeta.val) {
          out.push({ icon: '🏆', tone: 'good', html: `<b>NUOVO RECORD</b>, hai superato il tuo massimo storico!` });
        } else {
          const gap = recMeta.val - max;
          const gapPct = recMeta.val > 0 ? (gap / recMeta.val) * 100 : 100;
          if (gapPct <= 10) {
            out.push({ icon: '🎯', tone: 'good', html: `Sei vicino al record, mancano <b>${spec.fmtBig(gap)} ${spec.unit}</b>` });
          }
        }
      }
    } catch (e) {}

    // 5. ANOMALIA RILEVATA
    try {
      if (vals.length >= 3) {
        const nonZero = vals.filter(v => v > 0);
        if (nonZero.length >= 2) {
          const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
          const maxV = Math.max(...vals);
          const maxIdx = vals.indexOf(maxV);
          if (avg > 0 && maxV > avg * 3 && units[maxIdx]) {
            out.push({ icon: '⚡', tone: 'info', html: `Picco anomalo il <b>${units[maxIdx].label}</b> (3x sopra la media)` });
          }
        }
      }
    } catch (e) {}

    return out.slice(0, 3);
  }

  // Mini-heatmap: distribuzione per unità nel periodo (30 giorni, mesi YTD, storico)
  function renderMonthlyMiniHeatmap(spec, period) {
    const today = new Date(); today.setHours(0,0,0,0);
    const reducer = REDUCERS[spec.reducer];
    if (!reducer) return '';

    let cells = []; let cols = 7; let title = 'DISTRIBUZIONE';
    let header = '';

    if (period === '30GG') {
      title = 'DISTRIBUZIONE 30 GIORNI';
      // 6 righe × 5 colonne = 30 celle (oggi in basso a destra)
      cols = 6;
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const e = new Date(d); e.setHours(23,59,59,999);
        const v = reducer({ start: d, end: e });
        cells.push({ v, iso: CS.isoDateOnly(d), label: `${d.getDate()}/${d.getMonth()+1}` });
      }
      header = `<div class="mini-heat-sublabel">30gg fa → oggi</div>`;
    } else if (period === 'YTD') {
      title = 'DISTRIBUZIONE YTD';
      const yr = today.getFullYear();
      const curM = today.getMonth();
      const mNames = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
      cols = Math.min(12, curM + 1);
      for (let m = 0; m <= curM; m++) {
        const start = new Date(yr, m, 1);
        const end = m === curM
          ? new Date(yr, today.getMonth(), today.getDate(), 23, 59, 59, 999)
          : new Date(yr, m + 1, 0, 23, 59, 59, 999);
        const v = reducer({ start, end });
        cells.push({ v, iso: `${yr}-${String(m+1).padStart(2,'0')}`, label: mNames[m] });
      }
      header = `<div class="mini-heat-header" style="grid-template-columns:repeat(${cols},1fr)">${
        Array.from({length: curM+1}, (_, m) => `<span>${mNames[m]}</span>`).join('')
      }</div>`;
    } else { // TUTTO
      const yi = ensureYearStrategy();
      const mNames = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
      if (yi.strategy === '4y+') {
        title = 'DISTRIBUZIONE STORICA (anni)';
        const years = yi.years.slice(-5);
        cols = years.length;
        years.forEach(y => {
          const start = new Date(y, 0, 1);
          const end = new Date(y, 11, 31, 23, 59, 59, 999);
          const v = reducer({ start, end });
          cells.push({ v, iso: String(y), label: String(y) });
        });
        header = `<div class="mini-heat-header" style="grid-template-columns:repeat(${cols},1fr)">${
          years.map(y => `<span>${y}</span>`).join('')
        }</div>`;
      } else if (yi.strategy === '2-3y') {
        title = 'DISTRIBUZIONE STORICA (mesi)';
        cols = 12;
        yi.years.forEach(y => {
          for (let m = 0; m < 12; m++) {
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
            const v = reducer({ start, end });
            cells.push({ v, iso: `${y}-${String(m+1).padStart(2,'0')}`, label: `${mNames[m]} ${String(y).slice(2)}` });
          }
        });
        header = `<div class="mini-heat-header" style="grid-template-columns:repeat(12,1fr)">${
          mNames.map(n => `<span>${n}</span>`).join('')
        }</div>`;
      } else { // 1y
        title = 'DISTRIBUZIONE ANNO';
        cols = 12;
        const yr = yi.currentYear;
        for (let m = 0; m < 12; m++) {
          const start = new Date(yr, m, 1);
          const end = new Date(yr, m + 1, 0, 23, 59, 59, 999);
          const v = reducer({ start, end });
          cells.push({ v, iso: `${yr}-${String(m+1).padStart(2,'0')}`, label: mNames[m] });
        }
        header = `<div class="mini-heat-header" style="grid-template-columns:repeat(12,1fr)">${
          mNames.map(n => `<span>${n}</span>`).join('')
        }</div>`;
      }
    }

    const validVals = cells.map(c => c.v).filter(v => v >= 0);
    const maxV = validVals.length ? Math.max(...validVals) : 0;
    const cellsHtml = cells.map(c => {
      if (c.v < 0) return `<div class="mini-heat-cell is-empty" title=""></div>`;
      const intensity = maxV > 0 ? Math.min(4, Math.ceil((c.v / maxV) * 4)) : 0;
      const isMax = c.v === maxV && c.v > 0;
      const cls = isMax ? 'is-max' : c.v > 0 ? `i${intensity}` : 'is-zero';
      const tip = `${c.label}: ${spec.fmtBig(c.v)} ${spec.unit}`;
      return `<div class="mini-heat-cell ${cls}" data-i="${intensity}" title="${tip}"></div>`;
    }).join('');

    return `
      <div class="modal-section-title">${title}</div>
      <div class="mini-heat-wrap">
        ${header}
        <div class="mini-heat-grid" style="grid-template-columns:repeat(${cols},1fr)">
          ${cellsHtml}
        </div>
        <div class="mini-heat-legend">
          <span>meno</span>
          <div class="mini-heat-cell i1"></div>
          <div class="mini-heat-cell i2"></div>
          <div class="mini-heat-cell i3"></div>
          <div class="mini-heat-cell i4"></div>
          <span>più</span>
        </div>
      </div>
    `;
  }

  function expandCardModal(spec) {
    const period = panoState.period;
    const units = getPeriodUnits(period);
    const prevUnits = getPrevPeriodUnits(period);
    const vals = buildSparkValues(spec, units);
    const prevVals = buildSparkValues(spec, prevUnits);
    const labels = units.map(u => u.label);

    // Statistiche periodo
    const valsNonZero = vals.filter(v => v > 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = valsNonZero.length ? (sum / valsNonZero.length) : 0;
    const max = vals.length ? Math.max(...vals) : 0;
    const maxIdx = vals.indexOf(max);
    const maxLabel = units[maxIdx] ? units[maxIdx].label : '—';

    // Valore principale del periodo + delta vs prev
    const currVal = computePeriodValue(spec, vals);
    const prevVal = computePeriodValue(spec, prevVals);
    const deltaInfo = fmtDeltaPct(currVal, prevVal);
    const prevWord = prevPeriodLabel(period);

    // TOTALE
    let totaleLabel, totaleVal, totaleDec;
    if (CUMULATIVE_IDS.has(spec.id)) {
      totaleLabel = 'TOTALE'; totaleVal = sum; totaleDec = String(spec.fmtBig(sum)).includes('.') ? 1 : 0;
    } else if (PUNTUALI_IDS.has(spec.id)) {
      totaleLabel = 'ULTIMO'; totaleVal = [...vals].reverse().find(v => v > 0) || 0; totaleDec = 1;
    } else if (spec.id === 'streak') {
      totaleLabel = 'ATTUALE'; totaleVal = CALC.streakDays ? CALC.streakDays() : 0; totaleDec = 0;
    } else {
      totaleLabel = 'ATTIVI OGGI'; totaleVal = (CS.state.infortuni || []).filter(i => !i.dataFine).length; totaleDec = 0;
    }

    // Obiettivo per progress bar TOTALE
    let goalVal = 0, goalLabel = '';
    const goalScale = (() => {
      if (period === '30GG') return { mul: 30 / 7, lbl: '30gg' };
      if (period === 'YTD') {
        const today = new Date();
        const start = new Date(today.getFullYear(), 0, 1);
        const weeksElapsed = Math.max(1, Math.ceil((today - start) / (7 * 86400000)));
        return { mul: weeksElapsed, lbl: 'YTD' };
      }
      // TUTTO
      const yi = panoState.yearInfo || ensureYearStrategy();
      if (yi.strategy === '4y+') return { mul: yi.years.length * 52, lbl: 'storico' };
      return { mul: yi.years.length * 52, lbl: 'storico' };
    })();
    if (spec.id === 'ore') {
      const tgt = (CS.state.profile && CS.state.profile.oreTargetSett) || 14;
      goalVal = tgt * goalScale.mul;
      goalLabel = `obiettivo ${goalScale.lbl}`;
    } else if (spec.id === 'km') {
      const tgt = (CS.state.profile && CS.state.profile.kmTargetSett) || 15;
      goalVal = tgt * goalScale.mul;
      goalLabel = `obiettivo ${goalScale.lbl}`;
    }
    const goalPct = goalVal > 0 ? Math.min(100, Math.round((totaleVal / goalVal) * 100)) : null;

    // MEDIA vs media storica
    const histAvg = historicalAvgPerUnit(spec, period);
    const mediaDiff = avg - histAvg;
    const mediaDir = Math.abs(mediaDiff) < 0.05 ? 'flat' : mediaDiff > 0 ? 'up' : 'down';

    // RECORD meta
    const recMeta = getRecordMeta(spec, max);
    const recDateLbl = recMeta.date ? CS.fmtDate(recMeta.date, { short: true }) : '';
    const recPctFromMax = recMeta.val > 0 && max > 0 ? Math.min(100, Math.round((max / recMeta.val) * 100)) : 0;

    // BREAKDOWN bars (solo per volume)
    let breakdownHtml = '';
    if (spec.id === 'volume') {
      const items = getVolumeBreakdown(units, prevUnits);
      const maxBd = Math.max(...items.map(i => i.value), 1);
      const topIdx = items.findIndex(i => i.value === maxBd && i.value > 0);
      breakdownHtml = `
        <div class="modal-section-title">BREAKDOWN ESERCIZI</div>
        <div class="modal-breakdown">
          ${items.map((it, idx) => {
            const pct = maxBd > 0 ? Math.round((it.value / maxBd) * 100) : 0;
            const isTop = idx === topIdx && it.value > 0;
            const dv = it.value - it.prevValue;
            const dCls = dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat';
            const dSign = dv > 0 ? '+' : '';
            const empty = it.value === 0;
            return `
              <div class="bd-row ${empty ? 'is-empty' : ''}">
                <div class="bd-head">
                  <span class="bd-label">${it.label}</span>
                  <span class="bd-val">${empty ? 'nessuna sessione' : `${it.value} reps`}</span>
                </div>
                <div class="bd-track">
                  <div class="bd-fill ${isTop ? 'is-top' : ''}" style="width:${empty ? 2 : pct}%"></div>
                </div>
                <div class="bd-delta bd-${dCls}">${empty ? '' : `${dSign}${dv} reps vs ${prevWord}`}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Smart insights (max 3)
    const smartIns = buildSmartInsights(spec, period, units, prevUnits, vals, prevVals);

    // Heatmap mini mensile (sostituisce tabella)
    const miniHeatHtml = renderMonthlyMiniHeatmap(spec, period);

    const periodLabels = { '30GG': '30 GIORNI', YTD: 'YTD', TUTTO: 'STORICO' };
    const periodChip = periodLabels[period] || period;

    // Stat MEDIA sub-text (sopra/sotto media storica)
    const mediaSub = histAvg > 0
      ? mediaDir === 'flat'
        ? `<span class="stat-sub stat-flat">in linea con media storica</span>`
        : mediaDir === 'up'
          ? `<span class="stat-sub stat-good">sopra media storica +${spec.fmtBig(Math.abs(mediaDiff))}</span>`
          : `<span class="stat-sub stat-warn">sotto media storica -${spec.fmtBig(Math.abs(mediaDiff))}</span>`
      : `<span class="stat-sub muted">no media storica</span>`;

    // Stat TOTALE sub-text (progress bar verso obiettivo)
    const totaleSub = goalPct != null
      ? `<div class="stat-progress"><div class="stat-progress-fill" style="width:${goalPct}%"></div></div>
         <span class="stat-sub">${spec.fmtBig(totaleVal)} / ${spec.fmtBig(goalVal)} ${spec.unit} · <b>${goalPct}%</b> ${goalLabel}</span>`
      : `<span class="stat-sub muted">nessun obiettivo impostato</span>`;

    // Stat MAX sub-text (distanza dal record)
    const maxSub = recMeta.val > 0
      ? recMeta.isNewRecord && max >= recMeta.val
        ? `<span class="stat-sub stat-pulse-gold">◆ NUOVO RECORD</span>`
        : `<div class="stat-progress"><div class="stat-progress-fill" style="width:${recPctFromMax}%"></div></div>
           <span class="stat-sub">a <b>${recPctFromMax}%</b> dal record (${spec.fmtBig(recMeta.val)} ${spec.unit})</span>`
      : `<span class="stat-sub muted">no record storico</span>`;

    // Stat RECORD sub-text (count + age)
    const recSub = recMeta.val > 0
      ? `<span class="stat-sub ${recMeta.isOld ? 'stat-stale' : ''}">${recDateLbl ? `il ${recDateLbl}` : ''} · raggiunto <b>${recMeta.count}</b> volt${recMeta.count === 1 ? 'a' : 'e'}${recMeta.isOld ? ' · record datato, puoi batterlo' : ''}</span>`
      : `<span class="stat-sub muted">nessun record</span>`;

    const html = `
      <div class="pano-modal-header">
        <h2 class="modal-title">${spec.icon} ${spec.label}</h2>
        <span class="pano-modal-period-chip">${periodChip}</span>
        <button class="pano-modal-x" data-close aria-label="Chiudi">×</button>
      </div>

      <div class="modal-bignum-row">
        <div class="modal-bignum-main">
          <span class="modal-bignum-val cup-bignum" data-bignum>0</span>
          <span class="modal-bignum-unit">${spec.unit}</span>
          <span class="modal-bignum-delta modal-delta-${deltaInfo.dir}">${deltaInfo.sign} ${deltaInfo.text}</span>
        </div>
        <div class="modal-bignum-vs">vs ${prevWord}</div>
      </div>

      <div class="modal-chart-legend">
        <span class="legend-dot legend-curr"></span><span>Questo periodo</span>
        <span class="legend-dot legend-prev"></span><span>${prevWord}</span>
      </div>

      <div class="pano-modal-chart-wrap">
        <canvas id="pano-modal-chart"></canvas>
      </div>

      <div class="pano-modal-chart-toggle">
        <button class="vota-pill chart-type-pill" data-chart-type="line">LINEA</button>
        <button class="vota-pill chart-type-pill" data-chart-type="bar">BARRE</button>
        <button class="vota-pill chart-type-pill" data-chart-type="area">AREA</button>
      </div>

      ${breakdownHtml}

      <div class="modal-section-title">STATISTICHE</div>
      <div class="modal-rich-stats">
        <div class="rich-stat">
          <div class="rich-stat-head">${totaleLabel}</div>
          <div class="rich-stat-val"><span class="cup-stat" data-stat="totale">0</span> <span class="rich-stat-unit">${spec.unit}</span></div>
          ${totaleSub}
        </div>
        <div class="rich-stat">
          <div class="rich-stat-head">MEDIA / ${period === '30GG' ? 'giorno' : (period === 'TUTTO' && (panoState.yearInfo || ensureYearStrategy()).strategy === '4y+') ? 'anno' : 'mese'}</div>
          <div class="rich-stat-val"><span class="cup-stat" data-stat="media">0</span> <span class="rich-stat-unit">${spec.unit}</span></div>
          ${mediaSub}
        </div>
        <div class="rich-stat">
          <div class="rich-stat-head">MAX (${maxLabel})</div>
          <div class="rich-stat-val"><span class="cup-stat" data-stat="max">0</span> <span class="rich-stat-unit">${spec.unit}</span></div>
          ${maxSub}
        </div>
        <div class="rich-stat">
          <div class="rich-stat-head">RECORD STORICO</div>
          <div class="rich-stat-val">${recMeta.val > 0 ? spec.fmtBig(recMeta.val) : '—'} <span class="rich-stat-unit">${spec.unit}</span></div>
          ${recSub}
        </div>
      </div>

      <div class="pano-modal-insights">
        <h3 class="pano-insights-title">💡 INSIGHT</h3>
        ${smartIns.length
          ? smartIns.map(it => `<div class="insight-card" data-tone="${it.tone}">${it.icon ? `<span class="insight-ico">${it.icon}</span>` : ''}<span class="insight-text">${it.html}</span></div>`).join('')
          : '<div class="insight-card" data-tone="info"><span class="insight-text">Nessun dato sufficiente per insight.</span></div>'}
      </div>

      ${miniHeatHtml}

      <div class="pano-modal-footer">
        <button class="btn ghost" data-close>CHIUDI</button>
        <button class="btn primary" id="pano-modal-drill">VAI AL DETTAGLIO →</button>
      </div>
    `;

    const md = UI.modal(html);

    // ─── Chart.js setup ───
    const canvas = md.el.querySelector('#pano-modal-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const initialType = panoState.chartType && panoState.chartType[spec.id]
                      ? panoState.chartType[spec.id]
                      : defaultChartType(spec.id);

    // Allinea prevVals alla lunghezza di vals (pad / truncate)
    const prevAligned = (() => {
      if (prevVals.length === vals.length) return prevVals;
      const out = new Array(vals.length).fill(0);
      for (let i = 0; i < Math.min(prevVals.length, vals.length); i++) out[i] = prevVals[i];
      return out;
    })();

    const datasets = [{
      label: 'Questo periodo',
      data: vals,
      borderColor: '#B45CFF',
      backgroundColor: ctx => buildGradient(ctx, 'rgba(180,92,255,0.28)'),
      tension: 0.3,
      fill: initialType !== 'bar',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#B45CFF',
      pointBorderColor: '#B45CFF',
      order: 1,
    }, {
      label: prevWord,
      data: prevAligned,
      type: 'line',
      borderColor: 'rgba(255,255,255,0.30)',
      backgroundColor: 'transparent',
      borderDash: [5, 4],
      tension: 0.3,
      fill: false,
      borderWidth: 1.8,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: 'rgba(255,255,255,0.4)',
      order: 0,
    }];

    // Annotazione MAX (dataset extra con singolo punto)
    if (max > 0 && maxIdx >= 0) {
      const maxArr = vals.map((_, i) => i === maxIdx ? max : null);
      datasets.push({
        label: 'RECORD',
        data: maxArr,
        type: 'line',
        borderColor: 'rgba(180,92,255,0)',
        backgroundColor: 'rgba(180,92,255,0.95)',
        pointRadius: 8,
        pointHoverRadius: 10,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        showLine: false,
      });
    }

    let chart = new Chart(canvas, {
      type: initialType === 'area' ? 'line' : initialType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false, color: 'rgba(255,255,255,0.04)' },
            ticks: { color: 'rgba(245,245,247,0.6)', font: { family: 'JetBrains Mono', size: 10 } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: 'rgba(245,245,247,0.5)',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: v => spec.fmtBig(v),
            },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 6,
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            callbacks: {
              label: ctx => {
                if (ctx.dataset.label === 'RECORD') return `RECORD: ${spec.fmtBig(ctx.parsed.y)} ${spec.unit}`;
                return `${ctx.dataset.label}: ${spec.fmtBig(ctx.parsed.y)} ${spec.unit}`;
              },
            },
          },
        },
        animation: {
          duration: 800,
          easing: 'easeInOutQuart',
          delay: ctx => (ctx.type === 'data' && ctx.mode === 'default') ? ctx.dataIndex * 25 : 0,
        },
      },
    });

    // Big number countUp
    const bigNumEl = md.el.querySelector('[data-bignum]');
    if (bigNumEl) {
      const bigStr = spec.fmtBig(currVal);
      const bigDec = String(bigStr).includes('.') ? 1 : 0;
      FX.countUp(bigNumEl, 0, Number(currVal) || 0, 800, { decimals: bigDec });
    }

    // Stats countUp
    const animateStat = (sel, val, dec) => {
      const el = md.el.querySelector(`[data-stat="${sel}"]`);
      if (el) FX.countUp(el, 0, Number(val) || 0, 700, { decimals: dec });
    };
    setTimeout(() => {
      animateStat('totale', totaleVal, totaleDec);
      animateStat('media', avg, 1);
      animateStat('max', max, String(spec.fmtBig(max)).includes('.') ? 1 : 0);
    }, 50);

    // Highlight pill chart type attivo
    md.el.querySelectorAll('.chart-type-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.chartType === initialType);
    });

    // Toggle type LINEA/BARRE/AREA (mantiene seconda linea sovrapposta)
    md.el.querySelectorAll('.chart-type-pill').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.chartType;
        md.el.querySelectorAll('.chart-type-pill').forEach(x => x.classList.toggle('active', x.dataset.chartType === t));
        FX.glowBurst(b, 'var(--neon)');
        if (!panoState.chartType) panoState.chartType = {};
        panoState.chartType[spec.id] = t;
        // Se la creazione del chart è fallita, il toggle non deve far esplodere
        // il resto degli handler della modale.
        if (!chart || !chart.data || !chart.data.datasets) return;
        const isArea = t === 'area';
        // Primario cambia tipo, seconda linea resta line dashed
        chart.config.type = isArea ? 'line' : t;
        chart.data.datasets[0].type = isArea ? 'line' : t;
        chart.data.datasets[0].fill = (t === 'line') ? false : true;
        chart.data.datasets[0].tension = isArea ? 0.4 : 0.3;
        // Seconda linea forzata a line
        chart.data.datasets[1].type = 'line';
        chart.update('active');
      });
    });

    // Drill-down
    md.el.querySelector('#pano-modal-drill').addEventListener('click', () => {
      chart?.destroy();
      md.close();
      goToSub(spec);
    });

    // Cleanup chart al close (overlay click / data-close)
    md.el.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => { chart?.destroy(); chart = null; }, { capture: true });
    });
    // Anche overlay click chiude
    const overlay = md.el.parentElement; // .modal-overlay
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { chart?.destroy(); chart = null; }
    }, { capture: true });

    // Breathe sugli insight warn/danger + glowBurst su good (post-mount)
    setTimeout(() => {
      md.el.querySelectorAll('.insight-card[data-tone="warn"], .insight-card[data-tone="danger"]').forEach(card => {
        FX.breathe(card, 0.25, { variant: card.dataset.tone });
      });
      const firstGood = md.el.querySelector('.insight-card[data-tone="good"]');
      if (firstGood) FX.glowBurst(firstGood, 'var(--neon)');
    }, 220);
  }

  function periodWord(p, plural) {
    if (p === '30GG') return plural ? 'GIORNI' : 'GIORNO';
    if (p === 'YTD')  return plural ? 'MESI' : 'MESE';
    // TUTTO: dipende da strategy
    const yi = panoState.yearInfo || ensureYearStrategy();
    if (yi.strategy === '4y+') return plural ? 'ANNI' : 'ANNO';
    return plural ? 'MESI' : 'MESE';
  }

  // ─── DRILL-DOWN ──────────────────────────────────────
  function goToSub(spec) {
    if (filterState[spec.targetSub] && spec.targetPill) {
      filterState[spec.targetSub].pill = spec.targetPill;
      // Reset period a 30GG quando si naviga via KPI card (esperienza "fresca" ogni ingresso)
      if ('period' in filterState[spec.targetSub]) filterState[spec.targetSub].period = 'YTD';
      if ('drillKey' in filterState[spec.targetSub]) filterState[spec.targetSub].drillKey = null;
      if ('dateFrom' in filterState[spec.targetSub]) filterState[spec.targetSub].dateFrom = '';
      if ('dateTo' in filterState[spec.targetSub]) filterState[spec.targetSub].dateTo = '';
    }
    ROUTER.go('archivio', spec.targetSub);
  }

  // ─── HANDLERS PANORAMICA ─────────────────────────────
  function attachPanoramicaHandlers() {
    // Archivio v3.2: PANORAMICA è ora 3 super-card per zona (#pano-zones-grid).
    // Fallback: se esiste ancora #pano-grid (vecchio render) → animatePanoCards.
    const zoneGrid = document.getElementById('pano-zones-grid');
    const grid = zoneGrid || document.getElementById('pano-grid');
    if (!grid) return;

    const renderFn = zoneGrid ? animateZoneCards : animatePanoCards;
    renderFn(grid);

    // Period switcher
    document.querySelectorAll('.pano-period-pill').forEach(b => {
      b.addEventListener('click', () => {
        const newP = b.dataset.period;
        if (newP === panoState.period) return;
        panoState.period = newP;
        if (newP === 'TUTTO') panoState.yearInfo = null;
        document.querySelectorAll('.pano-period-pill').forEach(x =>
          x.classList.toggle('active', x.dataset.period === newP));
        const meta = document.getElementById('pano-period-meta');
        if (meta) meta.textContent = getPeriodMeta(newP);
        animateLeave(grid, () => renderFn(grid));
      });
    });

    // Click super-card zona → reset stato + naviga alla zone overview
    if (zoneGrid) {
      zoneGrid.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', () => {
          const z = card.dataset.zone;
          if (!z) return;
          // Reset stato drill in modo che entrando si veda sempre la zone overview
          const fs = filterState[z];
          if (fs) {
            fs.pill = null;
            if ('drillKey' in fs) fs.drillKey = null;
            if ('dateFrom' in fs) fs.dateFrom = '';
            if ('dateTo' in fs) fs.dateTo = '';
            if ('statusFilter' in fs) fs.statusFilter = 'all';
            if ('scadenza' in fs) fs.scadenza = null;
            if ('filterMonth' in fs) fs.filterMonth = '';
            if ('filterWeek' in fs) fs.filterWeek = 'all';
            if ('filterYear' in fs) fs.filterYear = '';
            if ('search' in fs) fs.search = '';
            if ('period' in fs) fs.period = 'YTD';
          }
          if (z === 'fisica' && filterState.infortuni) filterState.infortuni.drillKey = null;
          FX.glowBurst(card, 'var(--neon)');
          setTimeout(() => ROUTER.go('archivio', z), 140);
        });
      });
      return;
    }

    // Fallback: handlers per il vecchio render a 11 card
    grid.querySelectorAll('.pano-card').forEach(card => {
      let pressTimer = null;
      let longPressed = false;

      const startPress = (e) => {
        longPressed = false;
        pressTimer = setTimeout(() => {
          longPressed = true;
          const spec = PANO_CARDS.find(s => s.id === card.dataset.card);
          if (spec) expandCardModal(spec);
        }, 450);
      };
      const cancelPress = () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      };

      card.addEventListener('mousedown', startPress);
      card.addEventListener('mouseup', cancelPress);
      card.addEventListener('mouseleave', cancelPress);
      card.addEventListener('touchstart', startPress, { passive: true });
      card.addEventListener('touchend', cancelPress);
      card.addEventListener('touchcancel', cancelPress);

      card.addEventListener('click', (e) => {
        // Se è stato long-press, la modale è già aperta → non drill-down
        if (longPressed) { longPressed = false; return; }
        // Se click sul bottone espandi
        if (e.target.closest('.pano-card-expand-btn')) {
          const spec = PANO_CARDS.find(s => s.id === card.dataset.card);
          if (spec) expandCardModal(spec);
          return;
        }
        // Drill-down standard
        const spec = PANO_CARDS.find(s => s.id === card.dataset.card);
        if (!spec) return;
        FX.glowBurst(card, 'var(--neon)');
        setTimeout(() => goToSub(spec), 120);
      });
    });
  }

  // ─── Helper inRange (locale per evitare dipendenze) ───
  function inRange(iso, start, end) {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= start && d <= end;
  }

  // ═══════════════════════════════════════════════════════
  // 3. SUB-TAB DRILL-DOWN (focus/fisica/tecnica/revisioni)
  //    Versione semplificata: breadcrumb + pill + search + lista
  // ═══════════════════════════════════════════════════════

  function renderSection(section) {
    const fs = filterState[section];
    const meta = ZONE_META[section];

    // ─── VISTA OVERVIEW (zone: KPI card + period switcher, niente pill-bar) ───
    // Solo per fisica/focus/tecnica con fs.pill=null. La navigazione passa
    // ESCLUSIVAMENTE dal click sulle KPI card.
    if (meta && !fs.pill) {
      const zoneKpis = PANO_CARDS.filter(c => c.zone === section);
      return `
        <div class="page-header">
          <div>
            <div class="archive-breadcrumb"><a href="#/archivio/panoramica">PANORAMICA</a> › <span>${section.toUpperCase()}</span></div>
            <h1 class="page-title">ARCHI<span class="accent">VIO</span> · ${section.toUpperCase()}</h1>
          </div>
        </div>
        <div class="zone-section-header">
          <div class="zone-section-head-left">
            <span class="zone-section-ico">${meta.icon}</span>
            <div>
              <div class="zone-section-title">${meta.label}</div>
              <div class="zone-section-tagline">${meta.tagline}</div>
            </div>
          </div>
          <div class="zone-section-count">${zoneKpis.length} metric${zoneKpis.length === 1 ? 'a' : 'he'}</div>
        </div>
        <div class="pano-period-bar zone-section-period">
          ${renderPeriodSwitcher(panoState.period)}
        </div>
        <div class="pano-grid zone-section-grid" id="zone-section-grid">
          ${zoneKpis.map(spec => renderKpiCardShell(spec)).join('')}
        </div>
      `;
    }

    // ─── VISTA PILL (drill specifico) — per le 3 zone niente pill-bar,
    //    solo breadcrumb back + content. Per REVISIONI mantiene pill-bar. ───

    // Caso speciale: pill infortuni in fisica → renderizza L1/L2 infortuni
    let bodyHtml;
    if (section === 'fisica' && fs.pill === 'infortuni') {
      const fsInj = filterState.infortuni;
      bodyHtml = fsInj.drillKey ? renderInfortuniDetailL2(fsInj) : renderInfortuniListL1();
    } else {
      bodyHtml = renderResults(section, fs);
    }

    if (meta) {
      // Zone (fisica/focus/tecnica) — pill-bar OMESSA, solo breadcrumb back
      return `
        <div class="page-header">
          <div>
            <div class="archive-breadcrumb"><a href="#/archivio/panoramica">PANORAMICA</a> › <span>${section.toUpperCase()}</span></div>
            <h1 class="page-title">ARCHI<span class="accent">VIO</span> · ${section.toUpperCase()}</h1>
          </div>
        </div>
        <a class="archive-back" data-back href="javascript:void(0)">← ${meta.label} · OVERVIEW</a>
        ${(fs.pill !== 'oro' && !isDrillPill(fs.pill) && !(section === 'fisica' && fs.pill === 'infortuni')) ? renderFilters(section, fs) : ''}
        <div class="panel archive-results" id="archive-results">
          ${bodyHtml}
        </div>
      `;
    }

    // Sezioni non-zona (revisioni) — comportamento classico con pill-bar
    const pillsHtml = PILLS[section].map(p =>
      `<button class="archive-pill ${p.id === fs.pill ? 'active' : ''}" data-pill="${p.id}">${p.label}</button>`
    ).join('');
    return `
      <div class="page-header">
        <div>
          <div class="archive-breadcrumb"><a href="#/archivio/panoramica">PANORAMICA</a> › <span>${section.toUpperCase()}</span></div>
          <h1 class="page-title">ARCHI<span class="accent">VIO</span> · ${section.toUpperCase()}</h1>
        </div>
      </div>
      <div class="archive-pill-nav">${pillsHtml}</div>
      ${section === 'revisioni' && fs.pill === 'giornaliere' ? renderYearHeatmap() : ''}
      ${(fs.pill !== 'oro' && !isDrillPill(fs.pill)) ? renderFilters(section, fs) : ''}
      <div class="panel archive-results" id="archive-results">
        ${bodyHtml}
      </div>
    `;
  }

  // ─── YEAR HEATMAP (v8.1) — contribution graph 12 mesi ──
  // 53 colonne (settimane) × 7 righe (lun→dom). Intensità = ore di
  // allenamento del giorno, da CS.state.revisioni (dati reali).
  function renderYearHeatmap() {
    const revs = CS.state.revisioni || [];
    if (!revs.length) return '';
    const oreByDate = {};
    revs.forEach(r => {
      const h = Number(r.oreAllenamento) || Number(r.oreH) || 0;
      if (r.data) oreByDate[r.data] = (oreByDate[r.data] || 0) + h;
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Lunedì della settimana corrente, poi indietro di 52 settimane
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const start = new Date(monday);
    start.setDate(monday.getDate() - 52 * 7);

    const MESI = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
    const cells = [];
    const monthLabels = [];
    let lastMonth = -1;
    let totDays = 0, totOre = 0;

    for (let w = 0; w < 53; w++) {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + w * 7);
      if (weekStart.getMonth() !== lastMonth) {
        lastMonth = weekStart.getMonth();
        monthLabels.push({ week: w, label: MESI[lastMonth] });
      }
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        const iso = CS.isoDateOnly(day);
        if (day > today) {
          cells.push(`<span class="rev-yheat-cell is-future"></span>`);
          continue;
        }
        const ore = oreByDate[iso] || 0;
        if (ore > 0) { totDays++; totOre += ore; }
        const lvl = ore <= 0 ? 0 : ore < 1 ? 1 : ore < 2 ? 2 : ore < 3 ? 3 : 4;
        const tip = `${CS.fmtDate(iso, { short: true })} · ${ore > 0 ? ore.toFixed(1) + 'h' : 'riposo'}`;
        cells.push(`<span class="rev-yheat-cell" data-lvl="${lvl}" title="${tip}"></span>`);
      }
    }

    const labelsHtml = monthLabels
      .filter((m, i) => i === 0 || m.week - monthLabels[i - 1].week >= 3)
      .map(m => `<span class="rev-yheat-month" style="--w:${m.week}">${m.label}</span>`).join('');

    return `
      <div class="panel rev-yheat-panel">
        <div class="rev-yheat-head">
          <div class="panel-title">ULTIMI 12 MESI</div>
          <div class="rev-yheat-meta">${totDays} giorni allenati · ${totOre.toFixed(0)}h totali</div>
        </div>
        <div class="rev-yheat-scroll">
          <div class="rev-yheat-months">${labelsHtml}</div>
          <div class="rev-yheat-grid">${cells.join('')}</div>
        </div>
        <div class="rev-yheat-legend">
          <span>meno</span>
          <span class="rev-yheat-cell" data-lvl="0"></span>
          <span class="rev-yheat-cell" data-lvl="1"></span>
          <span class="rev-yheat-cell" data-lvl="2"></span>
          <span class="rev-yheat-cell" data-lvl="3"></span>
          <span class="rev-yheat-cell" data-lvl="4"></span>
          <span>più</span>
        </div>
      </div>
    `;
  }

  function renderFilters(section, fs) {
    return `
      <div class="panel archive-filters">
        <div class="filters-row">
          <input class="input archive-search" placeholder="🔍 Cerca nelle note, descrizioni, alimenti..." value="${escapeAttr(fs.search)}">
          <button class="btn-sm filter-reset">RESET</button>
        </div>
      </div>
    `;
  }

  function getRawItems(section, pill) {
    if (section === 'focus') {
      if (pill === 'obiettivi_giorn') return (CS.state.obiettivi || []).filter(o => o.scadenza === 'giornaliero');
      if (pill === 'obiettivi_sett')  return (CS.state.obiettivi || []).filter(o => o.scadenza === 'settimanale');
      if (pill === 'obiettivi_mens')  return (CS.state.obiettivi || []).filter(o => o.scadenza === 'mensile');
      if (pill === 'obiettivi_ann')   return (CS.state.obiettivi || []).filter(o => o.scadenza === 'annuale');
      if (pill === 'eventi')          return (CS.state.eventi || []).filter(e => e.data < CS.todayISO());
      if (pill === 'sessioni')        return CS.state.sessioni || [];
      if (pill === 'ore') {
        return (CS.state.revisioni || []).filter(r => (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0);
      }
      if (pill === 'streak')          return CS.state.revisioni || [];
    } else if (section === 'fisica') {
      if (pill === 'pesate') return CS.state.pesate || [];
      if (pill === 'pasti')  return CS.state.pasti || [];
      if (pill === 'corse')  return CS.state.corsa || [];
      if (pill === 'sonno')  return CS.state.sonno || [];
    } else if (section === 'tecnica') {
      if (pill === 'voti_aree') return CS.state.areeVoti || [];
      if (pill === 'voti_fond') return CS.state.fondVoti || [];
    } else if (section === 'revisioni') {
      if (pill === 'giornaliere') return CS.state.revisioni || [];
      if (pill === 'settimanali') return generateSettimanaliAggregati();
      if (pill === 'mensili')     return generateMensiliAggregati();
    }
    return [];
  }

  function generateSettimanaliAggregati() {
    const res = [];
    const oggi = new Date();
    for (let i = 0; i < 26; i++) {
      const d = new Date(oggi); d.setDate(oggi.getDate() - (i * 7));
      const { start, end } = CS.weekRange(d);
      const revs = (CS.state.revisioni || []).filter(r => {
        const rd = new Date(r.data);
        return rd >= start && rd <= end;
      });
      if (!revs.length) continue;
      const agg = CALC.aggregateRevs(revs);
      const sett = CALC.settimanaTopCheck(start);
      res.push({
        data: CS.isoDateOnly(start),
        startISO: CS.isoDateOnly(start),
        endISO: CS.isoDateOnly(end),
        agg, sett,
      });
    }
    return res;
  }

  function generateMensiliAggregati() {
    const res = [];
    const oggi = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
      const revs = CALC.revsInMonth(d);
      if (!revs.length) continue;
      const agg = CALC.aggregateRevs(revs);
      const mese = CALC.meseTopCheck(d);
      res.push({
        data: CS.isoDateOnly(d),
        year: d.getFullYear(),
        month: d.getMonth(),
        agg, mese,
      });
    }
    return res;
  }

  function renderGiornaliereAccordion(items) {
    if (!items.length) return '<div class="empty-state"><div class="empty-text">Nessun risultato</div></div>';
    const groups = {};
    items.forEach(it => {
      if (!it.data) return;
      const d = new Date(it.data);
      const { start, end } = CS.weekRange(d);
      const key = CS.isoDateOnly(start);
      if (!groups[key]) groups[key] = { start, end, items: [] };
      groups[key].items.push(it);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const today = new Date(); today.setHours(0,0,0,0);
    return sortedKeys.map((key, gi) => {
      const g = groups[key];
      const ore = g.items.reduce((a, r) => a + (Number(r.oreAllenamento) || Number(r.oreH) || 0), 0);
      let goldBadge = '', metBadge = '';
      try {
        const sett = CALC.settimanaTopCheck ? CALC.settimanaTopCheck(g.start) : null;
        if (sett) {
          goldBadge = sett.gold ? '<span class="accent"> ◆ ORO</span>' : '';
          const tot = sett.criteri ? sett.criteri.length : 4;
          metBadge = `<span class="muted"> · ${sett.met}/${tot}</span>`;
        }
      } catch (e) {}
      const isCurrentWeek = g.start <= today && today <= g.end;
      const startLbl = CS.fmtDate(key, { short: true });
      const endLbl = CS.fmtDate(CS.isoDateOnly(g.end), { short: true });
      const rowsHtml = g.items.map(it => renderResultItem('revisioni', 'giornaliere', it)).join('');
      return `
        <details class="week-accordion" ${isCurrentWeek ? 'open' : ''}>
          <summary class="week-accordion-hd">
            <span class="week-acc-range">${startLbl} → ${endLbl}${goldBadge}</span>
            <span class="week-acc-meta">${g.items.length}gg · ${ore.toFixed(1)}h${metBadge}</span>
          </summary>
          <div class="week-accordion-body">${rowsHtml}</div>
        </details>`;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════
  //   SISTEMA A 2 LIVELLI (drill-in per categorie)
  //   Usato da: voti_aree, voti_fond, obiettivi_*, eventi
  // ═══════════════════════════════════════════════════════

  const MONTHS_FULL = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];

  // Colore voto: <5 rosso, 5-7 giallo neon, >7 verde
  function votoColor(v) {
    if (v == null || v <= 0) return 'rgba(245,245,247,0.4)';
    if (v < 5) return '#ff4444';
    if (v < 7) return '#B45CFF';
    return '#00ff88';
  }
  function progressColor(pct) {
    if (pct < 40) return '#ff4444';
    if (pct < 80) return '#B45CFF';
    return '#00ff88';
  }

  // Card categoria L1 generica
  // c = { name, score (0-10) | progress (0-100), count, delta?, sub? }
  function renderCategoryCard(c) {
    const isScore = c.kind === 'score';
    const isProgress = c.kind === 'progress';
    const color = isScore ? votoColor(c.score) : progressColor(c.progress);
    const fillPct = isScore ? Math.min(100, (c.score || 0) * 10) : Math.min(100, c.progress || 0);
    const bigVal = isScore
      ? (c.count > 0 ? c.score.toFixed(1) : '—')
      : `${Math.round(c.progress)}%`;
    const subLine = isScore
      ? `${c.count} sessioni`
      : `${c.done} / ${c.total} completati`;
    let deltaHtml = '';
    if (isScore && c.count > 0 && c.delta != null && Math.abs(c.delta) >= 0.05) {
      const up = c.delta > 0;
      deltaHtml = `<span class="arch-cat-delta ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(c.delta).toFixed(1)}</span>`;
    }
    return `
      <div class="arch-cat-card" data-drill-key="${escapeAttr(c.name)}">
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-name">${escapeHtml(c.name)}</div>
          <div class="arch-cat-card-score" style="color:${color}">${bigVal}</div>
        </div>
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-sub">${subLine}</div>
          ${deltaHtml}
        </div>
        <div class="arch-cat-card-bar">
          <div class="arch-cat-card-bar-fill" style="width:${fillPct}%"></div>
        </div>
      </div>
    `;
  }

  // Card riassuntiva totale (per L1 obiettivi)
  function renderTotalSummaryCard(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const color = progressColor(pct);
    return `
      <div class="arch-cat-card arch-cat-card--total">
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-name">TOTALE PERIODO</div>
          <div class="arch-cat-card-score" style="color:${color}">${pct}%</div>
        </div>
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-sub">${done} / ${total} obiettivi completati</div>
        </div>
        <div class="arch-cat-card-bar">
          <div class="arch-cat-card-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    `;
  }

  // Header L2: breadcrumb + titolo + score riepilogo
  function renderL2Header(parentLabel, childName, big, bigUnit, bigColor, extraInfo) {
    return `
      <div class="arch-l2-header">
        <div class="arch-l2-breadcrumb">
          <a class="arch-l2-back" data-back href="#">← ${parentLabel}</a>
          <span class="arch-l2-crumb-sep">›</span>
          <span class="arch-l2-crumb-current">${escapeHtml(childName)}</span>
        </div>
        <h2 class="arch-l2-title">${escapeHtml(childName)}</h2>
        <div class="arch-l2-score-row">
          <span class="arch-l2-score" style="color:${bigColor}">${big}<span class="arch-l2-score-unit">${bigUnit}</span></span>
          ${extraInfo ? `<span class="arch-l2-score-extra">${extraInfo}</span>` : ''}
        </div>
      </div>
    `;
  }

  // Filtri data DA/A + RESET
  function renderDateFilters(fs) {
    return `
      <div class="arch-l2-filters">
        <div class="arch-l2-filter-group">
          <label class="arch-l2-filter-lbl">DA</label>
          <input type="date" class="input arch-filter-from" value="${fs.dateFrom || ''}">
        </div>
        <div class="arch-l2-filter-group">
          <label class="arch-l2-filter-lbl">A</label>
          <input type="date" class="input arch-filter-to" value="${fs.dateTo || ''}">
        </div>
        <button class="btn-sm arch-l2-filter-reset">RESET</button>
      </div>
    `;
  }

  // Filtro stato (per obiettivi): TUTTI / COMPLETATI / NON COMPLETATI
  function renderStatusFilter(currentValue) {
    const opts = [
      { id: 'all',  label: 'TUTTI' },
      { id: 'done', label: 'COMPLETATI' },
      { id: 'todo', label: 'NON COMPLETATI' },
    ];
    return `
      <div class="arch-l2-status-pills">
        ${opts.map(o => `<button class="vota-pill arch-status-pill ${o.id === currentValue ? 'active' : ''}" data-status="${o.id}">${o.label}</button>`).join('')}
      </div>
    `;
  }

  // Estrae YYYY-MM da formati eterogenei (YYYY-MM-DD, YYYY-MM, YYYY-Www, YYYY)
  function deriveMonthKey(rawDate) {
    if (!rawDate || typeof rawDate !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) return rawDate.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(rawDate)) return rawDate;
    if (/^\d{4}-W\d+$/.test(rawDate)) {
      const [y, w] = rawDate.split('-W');
      const j1 = new Date(Number(y), 0, 1);
      const target = new Date(j1);
      target.setDate(j1.getDate() + (Number(w) - 1) * 7);
      return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
    }
    if (/^\d{4}$/.test(rawDate)) return `${rawDate}-01`; // annuale → gennaio
    return null;
  }

  // Raggruppa items per mese (key YYYY-MM), ordina mese discendente e item per data discendente
  function groupByMonth(items, dateField) {
    const groups = {};
    items.forEach(it => {
      const key = deriveMonthKey(it[dateField]);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(k => ({
      key: k,
      items: groups[k].sort((a, b) => (b[dateField] || '').localeCompare(a[dateField] || '')),
    }));
  }

  // Accordion per mese con header summary
  function renderMonthAccordion(groups, renderItem, summaryFn) {
    if (!groups.length) return '<div class="empty-state"><div class="empty-text">Nessun risultato nel periodo</div></div>';
    return groups.map((g, i) => {
      const [yr, m] = g.key.split('-');
      const mName = MONTHS_FULL[Number(m) - 1];
      const summary = summaryFn ? summaryFn(g.items) : `${g.items.length} elementi`;
      return `
        <details class="arch-month-group" ${i === 0 ? 'open' : ''}>
          <summary class="arch-month-head">
            <span class="arch-month-name">${mName} ${yr}</span>
            <span class="arch-month-meta">${summary}</span>
            <span class="arch-month-chevron">▾</span>
          </summary>
          <div class="arch-month-body">${g.items.map(renderItem).join('')}</div>
        </details>
      `;
    }).join('');
  }

  // Applica filtri data (DA/A) a un array
  function applyDateFilter(items, fs, dateField) {
    let out = items;
    if (fs.dateFrom) out = out.filter(it => (it[dateField] || '') >= fs.dateFrom);
    if (fs.dateTo)   out = out.filter(it => (it[dateField] || '') <= fs.dateTo);
    return out;
  }

  // Calcolo delta voto: ultimi 30gg vs 30gg precedenti
  function computeDelta30(items) {
    if (!items.length) return 0;
    const now = Date.now();
    const recent = items.filter(it => (now - new Date(it.data).getTime()) <= 30 * 86400000);
    const prev   = items.filter(it => {
      const ago = now - new Date(it.data).getTime();
      return ago > 30 * 86400000 && ago <= 60 * 86400000;
    });
    if (!recent.length || !prev.length) return 0;
    const ra = recent.reduce((a, v) => a + (Number(v.voto) || 0), 0) / recent.length;
    const pa = prev.reduce((a, v) => a + (Number(v.voto) || 0), 0) / prev.length;
    return ra - pa;
  }

  // Categorizzazione obiettivo → FISICO | TECNICA | MENTALE | ALTRO (legacy v1)
  function categorizeObiettivo(o) {
    const txt = ((o.descrizione || '') + ' ' + (o.titolo || '') + ' ' + (o.unita || '')).toLowerCase();
    if (/flessio|squat|addomi|\bkm\b|corsa|allena|sala\s*pesi|cardio|forza|peso\b|fisic|sprint|km\/h|\bripetut|esplo/.test(txt)) return 'FISICO';
    if (CS.AREE_TECNICHE && CS.AREE_TECNICHE.some(a => txt.includes(a.toLowerCase()))) return 'TECNICA';
    if (CS.FONDAMENTALI && CS.FONDAMENTALI.some(f => txt.includes(f.toLowerCase()))) return 'TECNICA';
    if (/difesa|jab|rientro|colp|attacc|tecnic|combinaz|sparring|sacco|corda|pad|footwork|figure|vuoto/.test(txt)) return 'TECNICA';
    if (/lettur|quiz|libro|patente|medit|studi|legg(i|ere)|cors[oi]|lingua|inglese/.test(txt)) return 'MENTALE';
    return 'ALTRO';
  }


  // ─── LIVELLO 1: VOTI AREE ────────────────────────────
  function renderAreeListL1() {
    const aree = CS.AREE_TECNICHE || [];
    const voti = CS.state.areeVoti || [];
    const cards = aree.map(name => {
      const own = voti.filter(v => v.area === name);
      const avg = own.length ? own.reduce((a, v) => a + (Number(v.voto) || 0), 0) / own.length : 0;
      const delta = computeDelta30(own);
      return { kind: 'score', name, score: avg, count: own.length, delta };
    });
    cards.sort((a, b) => {
      if (a.count === 0 && b.count === 0) return 0;
      if (a.count === 0) return 1;
      if (b.count === 0) return -1;
      return a.score - b.score;
    });
    return `
      <div class="archive-results-head">VOTI AREE — ${aree.length} aree · ${voti.length} voti totali</div>
      <div class="arch-cat-grid">${cards.map(renderCategoryCard).join('')}</div>
    `;
  }

  // ─── LIVELLO 2: VOTI AREE > [nome area] ──────────────
  function renderAreaDetailL2(fs) {
    const area = fs.drillKey;
    const all = (CS.state.areeVoti || []).filter(v => v.area === area);
    const filtered = applyDateFilter(all, fs, 'data');
    const avg = filtered.length ? filtered.reduce((a, v) => a + (Number(v.voto) || 0), 0) / filtered.length : 0;
    const color = votoColor(avg);

    const groups = groupByMonth(filtered, 'data');
    const headerExtra = filtered.length
      ? `<span class="muted">${filtered.length} voti${fs.dateFrom || fs.dateTo ? ' nel periodo' : ' · tutto'}</span>`
      : '<span class="muted">nessun voto nel periodo</span>';

    return `
      ${renderL2Header('VOTI AREE', area, filtered.length ? avg.toFixed(2) : '—', '/10', color, headerExtra)}
      ${renderDateFilters(fs)}
      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart"></canvas></div>
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, v => renderVotoRow(v, 'area'), items => {
          const a = items.reduce((s, x) => s + (Number(x.voto) || 0), 0) / items.length;
          return `${items.length} sessioni · media ${a.toFixed(1)}`;
        })}
      </div>
    `;
  }

  function renderVotoRow(v, kind) {
    const what = kind === 'area' ? v.area : (v.esercizio || v.fondamentale);
    const c = votoColor(Number(v.voto) || 0);
    const note = v.note ? `<div class="arch-row-note">${escapeHtml(v.note)}</div>` : '';
    return `
      <div class="arch-l2-row">
        <span class="arch-l2-row-date">${CS.fmtDate(v.data, { long: true })}</span>
        <span class="arch-l2-row-mid">${escapeHtml(what || '—')}</span>
        <span class="arch-l2-row-voto" style="color:${c}">${v.voto}/10</span>
        ${note}
      </div>
    `;
  }

  // ─── LIVELLO 1: VOTI FONDAMENTALI ────────────────────
  function renderFondListL1() {
    const fond = CS.FONDAMENTALI || [];
    const voti = CS.state.fondVoti || [];
    const cards = fond.map(name => {
      const own = voti.filter(v => (v.esercizio || v.fondamentale) === name);
      const avg = own.length ? own.reduce((a, v) => a + (Number(v.voto) || 0), 0) / own.length : 0;
      const delta = computeDelta30(own);
      return { kind: 'score', name, score: avg, count: own.length, delta };
    });
    cards.sort((a, b) => {
      if (a.count === 0 && b.count === 0) return 0;
      if (a.count === 0) return 1;
      if (b.count === 0) return -1;
      return a.score - b.score;
    });
    return `
      <div class="archive-results-head">VOTI FONDAMENTALI — ${fond.length} fondamentali · ${voti.length} voti totali</div>
      <div class="arch-cat-grid">${cards.map(renderCategoryCard).join('')}</div>
    `;
  }

  // ─── LIVELLO 2: VOTI FONDAMENTALI > [nome] ──────────
  function renderFondDetailL2(fs) {
    const fname = fs.drillKey;
    const all = (CS.state.fondVoti || []).filter(v => (v.esercizio || v.fondamentale) === fname);
    const filtered = applyDateFilter(all, fs, 'data');
    const avg = filtered.length ? filtered.reduce((a, v) => a + (Number(v.voto) || 0), 0) / filtered.length : 0;
    const color = votoColor(avg);

    // Record storico = voto max su all (non solo filtered)
    const bestAll = all.reduce((m, v) => (Number(v.voto) || 0) > m ? Number(v.voto) : m, 0);

    const groups = groupByMonth(filtered, 'data');
    const headerExtra = `
      ${filtered.length ? `<span class="muted">${filtered.length} voti${fs.dateFrom || fs.dateTo ? ' nel periodo' : ' · tutto'}</span>` : '<span class="muted">nessun voto nel periodo</span>'}
      ${bestAll > 0 ? `<span class="arch-l2-record">RECORD: <b style="color:#00ff88">${bestAll}/10</b></span>` : ''}
    `;

    return `
      ${renderL2Header('VOTI FONDAMENTALI', fname, filtered.length ? avg.toFixed(2) : '—', '/10', color, headerExtra)}
      ${renderDateFilters(fs)}
      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart"></canvas></div>
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, v => renderVotoRow(v, 'fond'), items => {
          const a = items.reduce((s, x) => s + (Number(x.voto) || 0), 0) / items.length;
          return `${items.length} sessioni · media ${a.toFixed(1)}`;
        })}
      </div>
    `;
  }

  // ─── LIVELLO 1/2: OBIETTIVI per categoria (FISICO/TECNICA/MENTALE/ALTRO) ──
  // Filtra l'array obiettivi per pill (scadenza)
  function getObiettiviForPill(pill) {
    if (pill === 'eventi') {
      return (CS.state.eventi || []).filter(e => e.data && e.data < CS.todayISO());
    }
    const scadMap = {
      obiettivi_giorn: 'giornaliero',
      obiettivi_sett:  'settimanale',
      obiettivi_mens:  'mensile',
      obiettivi_ann:   'annuale',
    };
    const scad = scadMap[pill];
    return (CS.state.obiettivi || []).filter(o => o.scadenza === scad);
  }

  function obiettiviPillLabel(pill) {
    if (pill === 'obiettivi_giorn') return 'OBIETTIVI GIORNALIERI';
    if (pill === 'obiettivi_sett')  return 'OBIETTIVI SETTIMANALI';
    if (pill === 'obiettivi_mens')  return 'OBIETTIVI MENSILI';
    if (pill === 'obiettivi_ann')   return 'OBIETTIVI ANNUALI';
    if (pill === 'eventi')          return 'EVENTI PASSATI';
    return pill.toUpperCase();
  }

  function renderObiettiviListL1(fs) {
    const pill = fs.pill;
    const items = getObiettiviForPill(pill);
    const pillLbl = obiettiviPillLabel(pill);

    // Eventi: raggruppa per tipo invece che FISICO/TECNICA/...
    if (pill === 'eventi') {
      const byTipo = {};
      items.forEach(e => {
        const t = (e.tipo || 'ALTRO').toUpperCase();
        if (!byTipo[t]) byTipo[t] = [];
        byTipo[t].push(e);
      });
      const cards = Object.keys(byTipo).sort().map(t => {
        const arr = byTipo[t];
        return { kind: 'progress', name: t, progress: 100, done: arr.length, total: arr.length };
      });
      const total = items.length;
      return `
        <div class="archive-results-head">${pillLbl} — ${total} eventi · ${Object.keys(byTipo).length} tipi</div>
        <div class="arch-cat-grid">
          ${cards.length ? cards.map(renderCategoryCard).join('') : '<div class="empty-state"><div class="empty-text">Nessun evento passato</div></div>'}
        </div>
      `;
    }

    // Obiettivi: 4 categorie
    const CATS = ['FISICO', 'TECNICA', 'MENTALE', 'ALTRO'];
    const grouped = { FISICO: [], TECNICA: [], MENTALE: [], ALTRO: [] };
    items.forEach(o => { grouped[categorizeObiettivo(o)].push(o); });

    const totalDone = items.filter(isObiettivoDone).length;

    const cards = CATS.map(cat => {
      const arr = grouped[cat];
      const done = arr.filter(isObiettivoDone).length;
      const pct = arr.length ? Math.round((done / arr.length) * 100) : 0;
      const splits = buildCatSplits(arr);
      const delta = computeCatDelta30(arr);
      return {
        kind: 'progress',
        name: cat,
        progress: pct,
        done,
        total: arr.length,
        splits,
        delta,
      };
    }).filter(c => c.total > 0);

    return `
      <div class="archive-results-head">${pillLbl} — ${items.length} obiettivi totali</div>
      ${items.length ? renderTotalSummaryCard(totalDone, items.length) : ''}
      <div class="arch-cat-grid">
        ${cards.length ? cards.map(renderCategoryCardRich).join('') : '<div class="empty-state"><div class="empty-text">Nessun obiettivo</div></div>'}
      </div>
    `;
  }

  // L2 obiettivi/eventi
  function renderObiettiviDetailL2(fs) {
    const pill = fs.pill;
    const drillKey = fs.drillKey;
    const pillLbl = obiettiviPillLabel(pill);
    const allItems = getObiettiviForPill(pill);

    let catItems;
    if (pill === 'eventi') {
      catItems = allItems.filter(e => (e.tipo || 'ALTRO').toUpperCase() === drillKey);
    } else {
      catItems = allItems.filter(o => categorizeObiettivo(o) === drillKey);
    }

    // Filtri data (campo = periodo per obiettivi, data per eventi)
    const dateField = pill === 'eventi' ? 'data' : 'periodo';
    let filtered = catItems.filter(it => deriveMonthKey(it[dateField]) != null);
    if (fs.dateFrom) {
      const cmpFrom = fs.dateFrom.slice(0, 7);
      filtered = filtered.filter(it => deriveMonthKey(it[dateField]) >= cmpFrom);
    }
    if (fs.dateTo) {
      const cmpTo = fs.dateTo.slice(0, 7);
      filtered = filtered.filter(it => deriveMonthKey(it[dateField]) <= cmpTo);
    }

    // Filtro stato (solo obiettivi, non eventi)
    const showStatus = pill !== 'eventi';
    if (showStatus) {
      if (fs.statusFilter === 'done') filtered = filtered.filter(isObiettivoDone);
      else if (fs.statusFilter === 'todo') filtered = filtered.filter(o => !isObiettivoDone(o));
    }

    const done = catItems.filter(o => pill === 'eventi' ? true : isObiettivoDone(o)).length;
    const total = catItems.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const color = progressColor(pct);

    // ─── Eventi: layout semplice esistente ──────────────
    if (pill === 'eventi') {
      const headerExtra = `<span class="muted">${filtered.length} eventi${fs.dateFrom || fs.dateTo ? ' nel periodo' : ''}</span>`;
      const groups = groupByMonth(filtered, dateField);
      return `
        ${renderL2Header(pillLbl, drillKey, `${pct}`, '%', color, headerExtra)}
        ${renderDateFilters(fs)}
        <div class="arch-l2-progress-bar-wrap">
          <div class="arch-l2-progress-bar"><div class="arch-l2-progress-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
        <div class="arch-l2-list">
          ${renderMonthAccordion(groups, renderEventoRow, items => `${items.length} eventi`)}
        </div>
      `;
    }

    // ─── Obiettivi: layout PREMIUM ─────────────────────
    const splits = buildCatSplits(catItems);
    const delta = computeCatDelta30(catItems);
    const nextObj = findNextObiettivoInCat(catItems);
    return renderFocusL2Premium(fs, {
      category: drillKey,
      catItems,
      filteredItems: filtered,
      done, total, pct, color,
      delta, splits, nextObj,
    });
  }

  // ═══════════════════════════════════════════════════════
  // ARCHIVIO OBIETTIVI v10 — drill per scadenza + delta vs prec
  // ═══════════════════════════════════════════════════════

  const SCADENZA_META = {
    giornaliero: { id: 'giornaliero', label: 'OBIETTIVI GIORNALIERI', short: 'GIORNALIERI', ico: '📅', sparkN: 7,  unitLbl: 'giorni' },
    settimanale: { id: 'settimanale', label: 'OBIETTIVI SETTIMANALI', short: 'SETTIMANALI', ico: '📆', sparkN: 8,  unitLbl: 'settimane' },
    mensile:     { id: 'mensile',     label: 'OBIETTIVI MENSILI',     short: 'MENSILI',     ico: '🗓️', sparkN: 6,  unitLbl: 'mesi' },
    annuale:     { id: 'annuale',     label: 'OBIETTIVI ANNUALI',     short: 'ANNUALI',     ico: '🏆', sparkN: 3,  unitLbl: 'anni' },
  };
  const SCADENZE_ORDER = ['giornaliero', 'settimanale', 'mensile', 'annuale'];

  function getCurrentPeriodValue(scadenza) {
    const now = new Date();
    if (scadenza === 'giornaliero') return CS.todayISO ? CS.todayISO() : new Date().toISOString().slice(0, 10);
    if (scadenza === 'settimanale') return CALC.isoWeekString(now);
    if (scadenza === 'mensile')     return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (scadenza === 'annuale')     return String(now.getFullYear());
    return '';
  }

  function formatPeriodLabel(periodValue, scadenza) {
    if (!periodValue) return '—';
    if (scadenza === 'giornaliero') {
      return CS.fmtDate ? CS.fmtDate(periodValue, { long: true }) : periodValue;
    }
    if (scadenza === 'settimanale') {
      const m = String(periodValue).match(/^(\d{4})-W(\d{1,2})$/);
      if (!m) return periodValue;
      const year = Number(m[1]); const week = Number(m[2]);
      const jan4 = new Date(year, 0, 4);
      const jan4Day = (jan4.getDay() + 6) % 7;
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - jan4Day + (week - 1) * 7);
      const ord = CALC.weekOrdinalOfMonth(`${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`);
      const ordLabel = ['1ª', '2ª', '3ª', '4ª', '5ª'][ord - 1] || `${ord}ª`;
      const monthName = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][monday.getMonth()];
      return `Settimana ${ordLabel} · ${monthName} ${monday.getFullYear()}`;
    }
    if (scadenza === 'mensile') {
      const m = /^(\d{4})-(\d{1,2})$/.exec(periodValue);
      if (!m) return periodValue;
      const monthName = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][Number(m[2]) - 1];
      return `${monthName} ${m[1]}`;
    }
    if (scadenza === 'annuale') return `Anno ${periodValue}`;
    return periodValue;
  }

  function objKey(o) {
    return ((o.descrizione || '') + '').toLowerCase().trim() + '|' + o.scadenza;
  }

  function findPreviousObiettivo(obj, all) {
    if (!obj || !obj.periodo || !obj.scadenza) return null;
    const prevPeriod = CALC.previousPeriodValue(obj.periodo, obj.scadenza);
    if (!prevPeriod) return null;
    const k = objKey(obj);
    return (all || CS.state.obiettivi || []).find(o => objKey(o) === k && o.periodo === prevPeriod) || null;
  }

  function groupObiettiviByScadenzaAndPeriod(scadenza) {
    const items = (CS.state.obiettivi || []).filter(o => o.scadenza === scadenza);
    const groups = new Map();
    items.forEach(o => {
      if (!o.periodo) return;
      if (!groups.has(o.periodo)) groups.set(o.periodo, []);
      groups.get(o.periodo).push(o);
    });
    // Ordina periodi decrescenti (più recente prima)
    const sortedKeys = Array.from(groups.keys()).sort().reverse();
    return sortedKeys.map(k => ({ periodValue: k, obiettivi: groups.get(k) }));
  }

  function buildScadenzaSparkline(scadenza, n) {
    // Genera N period values decrescenti partendo dal corrente, calcola media % completamento per ognuno
    const out = [];
    let cur = getCurrentPeriodValue(scadenza);
    for (let i = 0; i < n; i++) {
      const obs = (CS.state.obiettivi || []).filter(o => o.scadenza === scadenza && o.periodo === cur);
      if (obs.length) {
        const avgPct = obs.reduce((s, o) => s + Math.min(100, CALC.progressObiettivo(o).pct || 0), 0) / obs.length;
        out.unshift(avgPct);
      } else {
        out.unshift(0);
      }
      cur = CALC.previousPeriodValue(cur, scadenza);
      if (!cur) break;
    }
    return out;
  }

  function renderSparklineSvg(values, width, height, color) {
    width = width || 100; height = height || 24;
    color = color || 'var(--neon, #B45CFF)';
    if (!values || !values.length) return `<svg viewBox="0 0 ${width} ${height}" class="obj-spark-svg"></svg>`;
    const max = 100;
    const min = 0;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / (max - min)) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastY = height - ((values[values.length - 1] - min) / (max - min)) * (height - 2) - 1;
    const lastX = (values.length - 1) * step;
    return `
      <svg viewBox="0 0 ${width} ${height}" class="obj-spark-svg" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${color}"/>
      </svg>
    `;
  }

  function computeObjL1CardData(scadenza) {
    const meta = SCADENZA_META[scadenza];
    const all = (CS.state.obiettivi || []).filter(o => o.scadenza === scadenza);
    const curPeriod = getCurrentPeriodValue(scadenza);
    const curItems = all.filter(o => o.periodo === curPeriod);
    const avgPct = curItems.length
      ? Math.round(curItems.reduce((s, o) => s + Math.min(100, CALC.progressObiettivo(o).pct || 0), 0) / curItems.length)
      : 0;
    const prevPeriod = CALC.previousPeriodValue(curPeriod, scadenza);
    const prevItems = prevPeriod ? all.filter(o => o.periodo === prevPeriod) : [];
    const prevAvgPct = prevItems.length
      ? Math.round(prevItems.reduce((s, o) => s + Math.min(100, CALC.progressObiettivo(o).pct || 0), 0) / prevItems.length)
      : null;
    const actCount = curItems.length;
    const totCount = all.length;
    const doneCount = curItems.filter(isObiettivoDone).length;
    const spark = buildScadenzaSparkline(scadenza, meta.sparkN);
    return { meta, avgPct, prevAvgPct, actCount, totCount, doneCount, spark, curPeriod };
  }

  function renderObjL1Card(scadenza) {
    const d = computeObjL1CardData(scadenza);
    const meta = d.meta;
    const hasData = d.spark.some(v => v > 0);
    const sparkLabel = scadenza === 'giornaliero' ? `trend ${meta.sparkN}gg`
                     : scadenza === 'settimanale' ? `trend ${meta.sparkN} sett`
                     : scadenza === 'mensile'     ? `trend ${meta.sparkN} mesi`
                     : `trend ${meta.sparkN} anni`;
    const curLabel = `media ${formatPeriodLabel(d.curPeriod, scadenza).split(' ')[0].toLowerCase()}`;
    // Tono colore in base allo score
    const scoreTone = d.avgPct >= 80 ? 'hot' : d.avgPct <= 20 ? 'cold' : d.avgPct >= 50 ? 'warm' : 'cool';
    const badge = d.avgPct >= 80
      ? '<span class="obj-l1-badge obj-l1-badge-hot">🔥 HOT</span>'
      : d.avgPct <= 10 && d.actCount > 0
      ? '<span class="obj-l1-badge obj-l1-badge-cold">❄️ COLD</span>'
      : '';
    // Delta vs periodo precedente
    let deltaHtml = '';
    if (d.prevAvgPct !== null) {
      const delta = d.avgPct - d.prevAvgPct;
      const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
      const sign = delta > 0 ? '+' : '';
      deltaHtml = `<div class="obj-l1-delta ${dir}"><span class="obj-l1-delta-arrow">${arrow}</span><span class="obj-l1-delta-val">${sign}${delta}pp</span><span class="obj-l1-delta-vs muted">vs prec.</span></div>`;
    } else {
      deltaHtml = `<div class="obj-l1-delta flat"><span class="obj-l1-delta-vs muted">primo periodo</span></div>`;
    }
    // Mini progress sotto: done/active
    const donePct = d.actCount > 0 ? Math.round((d.doneCount / d.actCount) * 100) : 0;
    return `
      <div class="obj-l1-card obj-l1-tone-${scoreTone}" data-scadenza="${scadenza}" data-fx-card>
        <div class="obj-l1-card-glow"></div>
        <div class="obj-l1-card-head">
          <span class="obj-l1-card-ico">${meta.ico}</span>
          <span class="obj-l1-card-title">${meta.short}</span>
          ${badge}
        </div>
        <div class="obj-l1-card-ring-wrap">
          <div class="obj-l1-card-ring" data-fx-ring data-fx-ring-pct="${d.avgPct}" data-fx-ring-color="${scoreTone === 'hot' ? '#00ff88' : scoreTone === 'cold' ? '#ff5050' : '#B45CFF'}"></div>
        </div>
        <div class="obj-l1-card-sub muted">${curLabel}</div>
        ${deltaHtml}
        <div class="obj-l1-card-spark" data-fx-spark='${escapeAttr(JSON.stringify(d.spark))}'>
          ${hasData ? '' : '<div class="obj-l1-spark-empty muted">— nessun dato —</div>'}
        </div>
        <div class="obj-l1-card-spark-lbl muted">${sparkLabel}</div>
        <div class="obj-l1-card-stats">
          <div class="obj-l1-stat">
            <span class="obj-l1-stat-num" data-fx-count="${d.actCount}">0</span>
            <span class="obj-l1-stat-lbl">attivi</span>
          </div>
          <div class="obj-l1-stat-sep">·</div>
          <div class="obj-l1-stat">
            <span class="obj-l1-stat-num obj-l1-stat-num-done" data-fx-count="${d.doneCount}">0</span>
            <span class="obj-l1-stat-lbl">fatti</span>
          </div>
          <div class="obj-l1-stat-sep">·</div>
          <div class="obj-l1-stat">
            <span class="obj-l1-stat-num obj-l1-stat-num-total" data-fx-count="${d.totCount}">0</span>
            <span class="obj-l1-stat-lbl">totali</span>
          </div>
        </div>
        <div class="obj-l1-card-mini-bar"><div class="obj-l1-card-mini-bar-fill" data-fx-bar="${donePct}" style="width:0%"></div></div>
        <div class="obj-l1-card-cta">APRI <span class="obj-l1-card-cta-arrow">→</span></div>
      </div>
    `;
  }

  function renderArchObListL1(_fs) {
    return `
      <div class="archive-results-head">📌 ARCHIVIO OBIETTIVI</div>
      <div class="obj-l1-tagline muted">Ogni obiettivo salvato è un impegno preso. Ogni spunta è una vittoria.</div>
      <div class="obj-l1-grid" data-fx-grid>
        ${SCADENZE_ORDER.map(s => renderObjL1Card(s)).join('')}
      </div>
    `;
  }

  // Post-render: anima ring/sparkline/countUp/stagger sulle 4 card L1
  function postRenderArchObL1(root) {
    if (!root || typeof FX === 'undefined') return;
    // Stagger entry
    const grid = root.querySelector('[data-fx-grid]');
    if (grid && FX.staggerIn) FX.staggerIn(grid, '.obj-l1-card', 90);

    // Ring progress + sparkline + countUp per ogni card
    root.querySelectorAll('.obj-l1-card').forEach((card, idx) => {
      const delay = idx * 90;

      // Ring
      const ringHost = card.querySelector('[data-fx-ring]');
      if (ringHost && FX.ringProgress) {
        const pct = Number(ringHost.dataset.fxRingPct) || 0;
        const color = ringHost.dataset.fxRingColor || 'var(--neon)';
        setTimeout(() => {
          FX.ringProgress(ringHost, pct, {
            size: 110,
            stroke: 8,
            color,
            center: `<span class="obj-l1-ring-num">${pct}</span><span class="obj-l1-ring-unit">%</span>`,
            variant: pct >= 80 ? 'neon' : pct <= 20 ? 'danger' : 'neon',
          });
        }, delay);
      }

      // Sparkline area gradient
      const sparkHost = card.querySelector('[data-fx-spark]');
      if (sparkHost && FX.drawSparkline) {
        try {
          const values = JSON.parse(sparkHost.dataset.fxSpark || '[]');
          if (values && values.some(v => v > 0)) {
            const scoreTone = card.classList.contains('obj-l1-tone-hot') ? 'hot'
                            : card.classList.contains('obj-l1-tone-cold') ? 'cold' : 'neon';
            const sparkColor = scoreTone === 'hot' ? '#00ff88' : scoreTone === 'cold' ? '#ff5050' : '#B45CFF';
            const sparkFill  = scoreTone === 'hot' ? 'rgba(0,255,136,0.18)' : scoreTone === 'cold' ? 'rgba(255,80,80,0.18)' : 'rgba(180,92,255,0.18)';
            setTimeout(() => {
              FX.drawSparkline(sparkHost, values, {
                width: 200, height: 36, color: sparkColor, fill: sparkFill,
              });
            }, delay + 120);
          }
        } catch (e) { /* ignore */ }
      }

      // CountUp sui numeri
      card.querySelectorAll('[data-fx-count]').forEach(el => {
        const to = Number(el.dataset.fxCount) || 0;
        if (FX.countUp) setTimeout(() => FX.countUp(el, 0, to, 600), delay + 200);
      });

      // Mini bar animata
      const bar = card.querySelector('[data-fx-bar]');
      if (bar) {
        const pct = Number(bar.dataset.fxBar) || 0;
        setTimeout(() => {
          bar.style.transition = 'width 800ms cubic-bezier(0.16,1,0.3,1)';
          bar.style.width = pct + '%';
        }, delay + 400);
      }

      // Hover glow
      card.addEventListener('mouseenter', () => {
        if (FX.glowBurst) FX.glowBurst(card, 'var(--neon)');
      });
    });
  }

  // ─── L2: drill per scadenza ──────────────────────────────
  function renderObjDeltaBlock(curObj, prevObj) {
    if (!prevObj) return `<div class="obj-delta-block obj-delta-empty muted">· primo periodo tracciato</div>`;
    const curProg = CALC.progressObiettivo(curObj);
    const prevProg = CALC.progressObiettivo(prevObj);
    const curVal = Number(curProg.current) || 0;
    const prevVal = Number(prevProg.current) || 0;
    const deltaAbs = curVal - prevVal;
    const curPct = Math.min(100, curProg.pct || 0);
    const prevPct = Math.min(100, prevProg.pct || 0);
    const deltaPp = curPct - prevPct;
    const dir = Math.abs(deltaAbs) < 0.01 ? 'flat' : (deltaAbs > 0 ? 'up' : 'down');
    const arrow = dir === 'up' ? '↑' : (dir === 'down' ? '↓' : '→');
    const fmt = (v) => {
      if (Math.abs(v) >= 100) return Math.round(v).toString();
      if (Math.abs(v) >= 10) return v.toFixed(1);
      return v.toFixed(2);
    };
    const absStr = `${deltaAbs > 0 ? '+' : (deltaAbs < 0 ? '' : '±')}${fmt(deltaAbs)}`;
    const ppStr = `${deltaPp > 0 ? '+' : (deltaPp < 0 ? '' : '±')}${Math.round(deltaPp)}pp`;
    const prevLbl = formatPeriodLabel(prevObj.periodo, prevObj.scadenza);
    const unit = prevObj.unita || curObj.unita || '';
    return `
      <div class="obj-delta-block ${dir}">
        <span class="obj-delta-arrow">${arrow}</span>
        <span class="obj-delta-abs">${absStr} ${escapeHtml(unit)}</span>
        <span class="obj-delta-sep">·</span>
        <span class="obj-delta-pp">${ppStr}</span>
        <span class="obj-delta-vs muted">vs ${escapeHtml(prevLbl)}</span>
      </div>
    `;
  }

  function renderObiettivoRowV10(obj) {
    const prevObj = findPreviousObiettivo(obj, CS.state.obiettivi || []);
    const prog = CALC.progressObiettivo(obj);
    const pct = Math.min(100, Math.round(prog.pct || 0));
    const color = progressColor(pct);
    const done = isObiettivoDone(obj);
    const unit = obj.unita || '';
    const currentStr = (typeof prog.current === 'number' && !isNaN(prog.current))
      ? (prog.current % 1 === 0 ? prog.current : prog.current.toFixed(1))
      : '0';
    return `
      <div class="obj-l2-row ${done ? 'is-done' : ''}">
        <div class="obj-l2-row-main">
          <div class="obj-l2-row-name">${escapeHtml(obj.descrizione || '—')}</div>
          <div class="obj-l2-row-progress">
            <div class="obj-progress-bar">
              <div class="obj-progress-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="obj-l2-row-vals">
              <span class="obj-l2-val-current">${currentStr}</span>
              <span class="obj-l2-val-target muted">/ ${obj.target != null ? obj.target : '—'} ${escapeHtml(unit)}</span>
              <span class="obj-l2-val-pct" style="color:${color}">${pct}%</span>
            </div>
          </div>
          ${renderObjDeltaBlock(obj, prevObj)}
        </div>
      </div>
    `;
  }

  function renderObjL2Filters(fs) {
    const scadenza = fs.scadenza;
    if (scadenza === 'giornaliero' || scadenza === 'settimanale' || scadenza === 'mensile') {
      const months = CALC.getMonthsAvailable();
      const monthOpts = '<option value="">Tutti i mesi</option>' + months.map(m => {
        const [y, mo] = m.split('-');
        const monthName = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mo)-1];
        return `<option value="${m}" ${m === fs.filterMonth ? 'selected':''}>${monthName} ${y}</option>`;
      }).join('');
      let weekPillsHtml = '';
      if (scadenza === 'giornaliero' || scadenza === 'settimanale') {
        const wOpts = ['all','1','2','3','4','5'];
        weekPillsHtml = `
          <div class="obj-l2-filter-group">
            <label class="muted">Settimana</label>
            <div class="obj-l2-week-pills">
              ${wOpts.map(w => `<button class="obj-l2-week-pill ${fs.filterWeek === w ? 'active' : ''}" data-filter-week="${w}">${w === 'all' ? 'Tutte' : 'W' + w}</button>`).join('')}
            </div>
          </div>
        `;
      }
      return `
        <div class="obj-l2-filters">
          <div class="obj-l2-filter-group">
            <label class="muted">Mese</label>
            <select data-filter-month>${monthOpts}</select>
          </div>
          ${weekPillsHtml}
          <div class="obj-l2-filter-group">
            <label class="muted">Stato</label>
            <div class="obj-l2-status-pills">
              <button class="obj-l2-status-pill ${fs.statusFilter === 'all' ? 'active' : ''}" data-status="all">Tutti</button>
              <button class="obj-l2-status-pill ${fs.statusFilter === 'done' ? 'active' : ''}" data-status="done">Completati</button>
              <button class="obj-l2-status-pill ${fs.statusFilter === 'todo' ? 'active' : ''}" data-status="todo">Non compl.</button>
            </div>
          </div>
        </div>
      `;
    }
    if (scadenza === 'annuale') {
      const years = CALC.getYearsAvailable();
      const yearOpts = '<option value="">Tutti gli anni</option>' + years.map(y => `<option value="${y}" ${String(y) === fs.filterYear ? 'selected':''}>${y}</option>`).join('');
      return `
        <div class="obj-l2-filters">
          <div class="obj-l2-filter-group">
            <label class="muted">Anno</label>
            <select data-filter-year>${yearOpts}</select>
          </div>
          <div class="obj-l2-filter-group">
            <label class="muted">Stato</label>
            <div class="obj-l2-status-pills">
              <button class="obj-l2-status-pill ${fs.statusFilter === 'all' ? 'active' : ''}" data-status="all">Tutti</button>
              <button class="obj-l2-status-pill ${fs.statusFilter === 'done' ? 'active' : ''}" data-status="done">Completati</button>
              <button class="obj-l2-status-pill ${fs.statusFilter === 'todo' ? 'active' : ''}" data-status="todo">Non compl.</button>
            </div>
          </div>
        </div>
      `;
    }
    return '';
  }

  function periodMatchesFilter(periodValue, fs) {
    const scadenza = fs.scadenza;
    if (scadenza === 'mensile') {
      if (fs.filterMonth && periodValue !== fs.filterMonth) return false;
      return true;
    }
    if (scadenza === 'giornaliero') {
      if (fs.filterMonth) {
        if (!periodValue || periodValue.slice(0, 7) !== fs.filterMonth) return false;
      }
      if (fs.filterWeek && fs.filterWeek !== 'all') {
        const ord = CALC.weekOrdinalOfMonth(periodValue);
        if (String(ord) !== fs.filterWeek) return false;
      }
      return true;
    }
    if (scadenza === 'settimanale') {
      const m = String(periodValue).match(/^(\d{4})-W(\d{1,2})$/);
      if (!m) return false;
      const year = Number(m[1]); const week = Number(m[2]);
      const jan4 = new Date(year, 0, 4);
      const jan4Day = (jan4.getDay() + 6) % 7;
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - jan4Day + (week - 1) * 7);
      const mKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}`;
      if (fs.filterMonth && mKey !== fs.filterMonth) return false;
      if (fs.filterWeek && fs.filterWeek !== 'all') {
        const ord = CALC.weekOrdinalOfMonth(`${mKey}-${String(monday.getDate()).padStart(2, '0')}`);
        if (String(ord) !== fs.filterWeek) return false;
      }
      return true;
    }
    if (scadenza === 'annuale') {
      if (fs.filterYear && String(periodValue) !== fs.filterYear) return false;
      return true;
    }
    return true;
  }

  function renderArchObDetailL2(fs) {
    const meta = SCADENZA_META[fs.scadenza];
    if (!meta) return '<div class="empty-state"><div class="empty-text">Scadenza sconosciuta</div></div>';

    const groups = groupObiettiviByScadenzaAndPeriod(fs.scadenza);
    const filteredGroups = groups.filter(g => periodMatchesFilter(g.periodValue, fs));

    const headerHtml = `
      <div class="obj-l2-header">
        <a class="archive-back" data-arch-back href="javascript:void(0)">← ARCHIVIO OBIETTIVI</a>
        <h2 class="obj-l2-title"><span class="obj-l2-title-ico">${meta.ico}</span> ${meta.label}</h2>
      </div>
    `;

    if (!filteredGroups.length) {
      return `
        ${headerHtml}
        ${renderObjL2Filters(fs)}
        <div class="empty-state"><div class="empty-text">Nessun ${meta.unitLbl.slice(0, -1)} archiviat${meta.unitLbl === 'anni' ? 'o' : 'o'} per questi filtri</div></div>
      `;
    }

    const collapsible = fs.scadenza === 'mensile' || fs.scadenza === 'settimanale' || fs.scadenza === 'annuale';
    _objL2Collapsed = _objL2Collapsed || {};
    const groupsHtml = filteredGroups.map(g => {
      let items = g.obiettivi;
      if (fs.statusFilter === 'done') items = items.filter(isObiettivoDone);
      else if (fs.statusFilter === 'todo') items = items.filter(o => !isObiettivoDone(o));
      const done = g.obiettivi.filter(isObiettivoDone).length;
      const total = g.obiettivi.length;
      const isCurrent = g.periodValue === getCurrentPeriodValue(fs.scadenza);
      const periodLbl = formatPeriodLabel(g.periodValue, fs.scadenza);
      const collapseKey = `${fs.scadenza}|${g.periodValue}`;
      const isCollapsed = collapsible && _objL2Collapsed[collapseKey] === true;
      const toggleBtn = collapsible
        ? `<button type="button" class="obj-l2-period-toggle" data-obj-toggle="${escapeHtml(collapseKey)}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Espandi mese' : 'Comprimi mese'}">
             <span class="obj-l2-toggle-chevron">▾</span>
           </button>`
        : '';
      return `
        <div class="obj-l2-period-group ${isCurrent ? 'is-current' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-obj-group="${escapeHtml(collapseKey)}">
          <div class="obj-l2-period-head">
            <span class="obj-l2-period-name">${escapeHtml(periodLbl)}</span>
            ${isCurrent ? '<span class="obj-l2-period-current-badge">corrente</span>' : ''}
            <span class="obj-l2-period-summary muted">${done}/${total} completati</span>
            ${toggleBtn}
          </div>
          <div class="obj-l2-period-content">
            ${items.length ? `<div class="obj-l2-rows">${items.map(renderObiettivoRowV10).join('')}</div>` : '<div class="obj-l2-rows-empty muted">Nessun obiettivo per questo filtro stato</div>'}
          </div>
        </div>
      `;
    }).join('');

    return `
      ${headerHtml}
      ${renderObjL2Filters(fs)}
      <div class="obj-l2-groups">${groupsHtml}</div>
    `;
  }

  function renderObiettivoRow(o) {
    const ok = isObiettivoDone(o);
    const ico = ok ? '<span class="arch-obj-check ok">✓</span>' : '<span class="arch-obj-check ko">○</span>';
    const target = (o.target != null && o.target !== '') ? `obiettivo ${o.target} ${o.unita || ''}`.trim() : '';
    const valStr = (o.valoreRaggiunto != null && o.valoreRaggiunto !== '') ? `raggiunto: ${o.valoreRaggiunto}` : '';
    const dataCompl = o.dataCompletamento ? CS.fmtDate(o.dataCompletamento, { short: true }) : '';
    return `
      <div class="arch-l2-row arch-obj-row ${ok ? 'is-done' : ''}">
        ${ico}
        <span class="arch-l2-row-date">${o.periodo ? CS.fmtDate(o.periodo, { short: true }) : '—'}</span>
        <span class="arch-l2-row-mid">
          <div class="arch-obj-name">${escapeHtml(o.descrizione || '—')}</div>
          <div class="arch-obj-meta">
            ${target ? `<span>${escapeHtml(target)}</span>` : ''}
            ${valStr ? `<span class="arch-obj-val">${escapeHtml(valStr)}</span>` : ''}
            ${dataCompl ? `<span class="muted">· compl. ${dataCompl}</span>` : ''}
          </div>
        </span>
      </div>
    `;
  }

  function renderEventoRow(e) {
    return `
      <div class="arch-l2-row arch-event-row">
        <span class="arch-l2-row-date">${e.data ? CS.fmtDate(e.data, { long: true }) : '—'}</span>
        <span class="arch-l2-row-mid">
          <div class="arch-obj-name">${escapeHtml(e.titolo || '—')}</div>
          ${e.note ? `<div class="arch-row-note">${escapeHtml(e.note)}</div>` : ''}
        </span>
        <span class="arch-l2-row-tag">${escapeHtml(e.tipo || '')}</span>
      </div>
    `;
  }

  // Inizializza Chart.js per la vista L2 voti (canvas: #arch-trend-chart)
  function initArchiveTrendChart(points, opts) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !points || !points.length) return;

    const labels = points.map(p => CS.fmtDate(p.date, { short: true }));
    const data = points.map(p => p.value);

    const datasets = [{
      label: 'Voto',
      data,
      borderColor: '#B45CFF',
      backgroundColor: (ctx) => {
        const c = ctx.chart.ctx;
        const area = ctx.chart.chartArea;
        if (!area) return 'rgba(180,92,255,0.15)';
        const g = c.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, 'rgba(180,92,255,0.30)');
        g.addColorStop(1, 'rgba(180,92,255,0)');
        return g;
      },
      tension: 0.3,
      fill: true,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#B45CFF',
      pointBorderColor: '#0a0a0a',
      pointBorderWidth: 1,
    }];

    // BEST marker per voti_fond
    if (opts && opts.bestIdx >= 0 && opts.bestVal > 0) {
      const bestData = data.map((_, i) => i === opts.bestIdx ? opts.bestVal : null);
      datasets.push({
        label: 'BEST',
        data: bestData,
        type: 'line',
        borderColor: 'rgba(255,255,255,0)',
        backgroundColor: '#ffffff',
        pointRadius: 9,
        pointHoverRadius: 11,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#B45CFF',
        pointBorderWidth: 2,
        showLine: false,
      });
    }

    archiveChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(245,245,247,0.5)',
              font: { family: 'JetBrains Mono', size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
          },
          y: {
            min: 0, max: 10,
            ticks: {
              stepSize: 2,
              color: 'rgba(245,245,247,0.5)',
              font: { family: 'JetBrains Mono', size: 10 },
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 6,
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            callbacks: {
              label: ctx => ctx.dataset.label === 'BEST'
                ? `BEST: ${ctx.parsed.y}/10`
                : `Voto: ${ctx.parsed.y}/10`,
            },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  // Hook post-render: se siamo in L2 voti, inizializza il chart
  function postRenderArchiveResults(section, fs) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }

    const root = document.getElementById('archive-results');
    if (!root) return;

    // ─── VOLUME (fisica) L1/L2 ──────────────────────────
    if (section === 'fisica' && fs.pill === 'volume') {
      postRenderVolume(fs);
      return;
    }

    // ─── FISICA v5 sotto-pagine ─────────────────────────
    if (section === 'fisica' && fs.pill === 'pesate') {
      postRenderPesate(fs);
      return;
    }
    if (section === 'fisica' && fs.pill === 'sonno') {
      postRenderSonno(fs);
      return;
    }
    if (section === 'fisica' && fs.pill === 'corse') {
      postRenderCorse(fs);
      return;
    }
    if (section === 'fisica' && fs.pill === 'pasti') {
      postRenderPasti(fs);
      return;
    }

    // ─── ARCHIVIO OBIETTIVI v10 — post-render L1 con FX (ring/spark/countUp/stagger) ───
    if (section === 'focus' && fs.pill === 'obiettivi') {
      if (!fs.scadenza) postRenderArchObL1(root);
      return;
    }

    // ─── FOCUS v2 — ore + sessioni ──────────────────────
    if (section === 'focus' && fs.pill === 'ore') {
      postRenderOre(fs);
      return;
    }
    if (section === 'focus' && fs.pill === 'sessioni') {
      postRenderSessioni(fs);
      return;
    }

    // ─── FOCUS L1 ricco + L2 premium (legacy: obiettivi_*) ──────────────────
    if (section === 'focus' && DRILL_PILLS_FOCUS.has(fs.pill) && fs.pill !== 'eventi' && fs.pill !== 'obiettivi' && fs.pill !== 'ore' && fs.pill !== 'sessioni') {
      if (!fs.drillKey) {
        // L1: ring/spark/countUp/breathe/stagger
        postRenderFocusL1(root);
        return;
      } else {
        // L2 premium: hero ring + countUp + chart trend + breathe + glowBurst
        const allItems = getObiettiviForPill(fs.pill);
        const catItems = allItems.filter(o => categorizeObiettivo(o) === fs.drillKey);
        postRenderFocusL2(root, fs, { catItems });
        return;
      }
    }

    if (!fs.drillKey) return;
    if (fs.pill === 'voti_aree') {
      const all = (CS.state.areeVoti || []).filter(v => v.area === fs.drillKey);
      const filtered = applyDateFilter(all, fs, 'data');
      const points = filtered
        .filter(v => v.data && Number(v.voto) > 0)
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''))
        .map(v => ({ date: v.data, value: Number(v.voto) }));
      requestAnimationFrame(() => initArchiveTrendChart(points));
    } else if (fs.pill === 'voti_fond') {
      const all = (CS.state.fondVoti || []).filter(v => (v.esercizio || v.fondamentale) === fs.drillKey);
      const filtered = applyDateFilter(all, fs, 'data');
      const points = filtered
        .filter(v => v.data && Number(v.voto) > 0)
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''))
        .map(v => ({ date: v.data, value: Number(v.voto) }));
      let bestIdx = -1, bestVal = 0;
      points.forEach((p, i) => { if (p.value > bestVal) { bestVal = p.value; bestIdx = i; } });
      requestAnimationFrame(() => initArchiveTrendChart(points, { bestIdx, bestVal }));
    }
  }

  function renderResults(section, fs) {
    if (fs.pill === 'oro') return renderOro();

    // Drill-down a 2 livelli
    if (fs.pill === 'voti_aree') {
      return fs.drillKey ? renderAreaDetailL2(fs) : renderAreeListL1();
    }
    if (fs.pill === 'voti_fond') {
      return fs.drillKey ? renderFondDetailL2(fs) : renderFondListL1();
    }
    if (DRILL_PILLS_FOCUS.has(fs.pill) && fs.pill !== 'ore' && fs.pill !== 'sessioni') {
      // Eventi: vecchia logica intatta
      if (fs.pill === 'eventi') {
        return fs.drillKey ? renderObiettiviDetailL2(fs) : renderObiettiviListL1(fs);
      }
      // Nuovo flusso obiettivi v10: scadenza-based (giorn/sett/mens/ann)
      if (/^obiettivi_/.test(fs.pill)) {
        const scadMap = { obiettivi_giorn:'giornaliero', obiettivi_sett:'settimanale', obiettivi_mens:'mensile', obiettivi_ann:'annuale' };
        fs.scadenza = scadMap[fs.pill] || fs.scadenza;
        fs.pill = 'obiettivi';
      }
      return fs.scadenza ? renderArchObDetailL2(fs) : renderArchObListL1(fs);
    }
    // FOCUS v2 — ore allenamento + sessioni (pattern Fisica v5)
    if (section === 'focus' && fs.pill === 'ore') {
      return renderOreOverview(fs);
    }
    if (section === 'focus' && fs.pill === 'sessioni') {
      return fs.drillKey ? renderSessioniDetailL2(fs) : renderSessioniOverview(fs);
    }
    if (fs.pill === 'volume') {
      return fs.drillKey ? renderVolumeDetailL2(fs) : renderVolumeListL1();
    }
    // FISICA v5 — sotto-pagine premium
    if (section === 'fisica' && fs.pill === 'pesate') {
      return renderPesateOverview(fs);
    }
    if (section === 'fisica' && fs.pill === 'sonno') {
      return renderSonnoOverview(fs);
    }
    if (section === 'fisica' && fs.pill === 'corse') {
      return fs.drillKey ? renderCorseDetailL2(fs) : renderCorseListL1(fs);
    }
    if (section === 'fisica' && fs.pill === 'pasti') {
      return fs.drillKey ? renderPastiDetailL2(fs) : renderPastiListL1(fs);
    }
    // Streak: vista dedicata (heatmap 30/365 + stats) — focus
    if (section === 'focus' && fs.pill === 'streak') {
      return renderStreakOverview();
    }

    let items = getRawItems(section, fs.pill);
    const q = (fs.search || '').toLowerCase().trim();
    if (q) {
      items = items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
    }

    items.sort((a, b) => {
      const da = a.data || a.dataInizio || a.dataFine || a.periodo || a.startISO || '';
      const db = b.data || b.dataInizio || b.dataFine || b.periodo || b.startISO || '';
      return db.localeCompare(da);
    });

    const count = items.length;
    const items100 = items.slice(0, 100);

    if (section === 'revisioni' && fs.pill === 'giornaliere') {
      return `
        <div class="archive-results-head">GIORNALIERE (${count})</div>
        ${renderGiornaliereAccordion(items100)}
      `;
    }

    return `
      <div class="archive-results-head">RISULTATI (${count}${count > 100 ? ' — primi 100' : ''})</div>
      <div class="archive-results-list">${items100.length
        ? items100.map(it => renderResultItem(section, fs.pill, it)).join('')
        : '<div class="empty-state"><div class="empty-text">Nessun risultato</div></div>'}</div>
    `;
  }

  function renderResultItem(section, pill, item) {
    if (pill.startsWith('obiettivi')) {
      const ok = item.completed;
      return `<div class="result-row"><span>${ok ? '✓' : '○'}</span> <span>${CS.fmtDate(item.periodo, { short: true })}</span> <span>${escapeHtml(item.descrizione || '—')}</span> <span class="muted">${item.target || ''} ${item.unita || ''}</span></div>`;
    }
    if (pill === 'eventi') return `<div class="result-row"><span>📅</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${escapeHtml(item.titolo || '—')}</span> <span class="muted">${item.tipo || ''}</span></div>`;
    if (pill === 'pesate') return `<div class="result-row"><span>⚖</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${Number(item.kg).toFixed(1)} kg</span> <span class="muted">${escapeHtml(item.note || '')}</span></div>`;
    if (pill === 'pasti') {
      const kcal = (item.alimenti || []).reduce((a, b) => a + (b.kcal || 0), 0);
      return `<div class="result-row"><span>🍝</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${item.tipo || '—'}</span> <span class="muted">${Math.round(kcal)} kcal · ${(item.alimenti || []).length} alimenti</span></div>`;
    }
    if (pill === 'corse') {
      const pace = CALC.corsaPace(item.km, item.durataMin);
      return `<div class="result-row"><span>🏃</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${(Number(item.km) || 0).toFixed(1)} km · ${item.durataMin}min</span> <span class="muted">${item.tipo || ''} ${pace ? '· ' + pace.formatted : ''}</span></div>`;
    }
    if (pill === 'sonno') return `<div class="result-row"><span>🌙</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${Number(item.ore || 0).toFixed(1)} h</span> <span class="muted">qualità ${item.qualita || '—'}/5 ${item.note ? '· ' + escapeHtml(item.note) : ''}</span></div>`;
    if (pill === 'voti_aree') return `<div class="result-row"><span>◆</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${escapeHtml(item.area)}</span> <span class="muted">voto ${item.voto}/10</span></div>`;
    if (pill === 'voti_fond') return `<div class="result-row"><span>◆</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${escapeHtml(item.esercizio)}</span> <span class="muted">voto ${item.voto}/10</span></div>`;
    if (pill === 'sessioni') return `<div class="result-row"><span>🥊</span> <span>${CS.fmtDate(item.data, { long: true })}</span> <span>${(item.esercizi || []).length} esercizi</span> <span class="muted">${item.luogo || ''} ${item.oraInizio || ''}</span></div>`;
    if (pill === 'giornaliere' || pill === 'ore') {
      const r = item;
      const ore = Number(r.oreAllenamento) || Number(r.oreH) || 0;
      const ico = r.riposo ? '○' : (ore > 0 ? '✓' : '✕');
      return `<div class="result-row"><span>${ico}</span> <span>${CS.fmtDate(r.data, { long: true })}</span> <span>${ore.toFixed(1)}h · tec ${r.tecnica || '—'}/10</span> <span class="muted">${escapeHtml((r.bene || r.allena || '').slice(0, 60))}</span></div>`;
    }
    if (pill === 'settimanali') {
      const s = item;
      const ico = s.sett.gold ? '◆ ORO' : `${s.sett.met}/${s.sett.criteri.length}`;
      return `<div class="result-row"><span class="${s.sett.gold ? 'accent' : ''}">${ico}</span> <span>${CS.fmtDate(s.startISO, { short: true })} → ${CS.fmtDate(s.endISO, { short: true })}</span> <span>${s.agg.ore.toFixed(1)}h · ${s.agg.sessioni} sess</span> <span class="muted">tec ${(s.agg.tecnica || 0).toFixed(1)} · sonno ${(s.agg.sonnoMedio || 0).toFixed(1)}h</span></div>`;
    }
    if (pill === 'mensili') {
      const m = item;
      const monthNames = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
      const ico = m.mese.gold ? '◆ MESE ORO' : `${m.mese.settTop}/${m.mese.settTotal} sett`;
      return `<div class="result-row"><span class="${m.mese.gold ? 'accent' : ''}">${ico}</span> <span>${monthNames[m.month]} ${m.year}</span> <span>${m.agg.ore.toFixed(1)}h · ${m.agg.sessioni} sess</span> <span class="muted">${Math.round(m.agg.flessioni)} fless · ${m.agg.kmCorsa.toFixed(1)} km</span></div>`;
    }
    return `<div class="result-row"><span>—</span></div>`;
  }

  // ═══════════════════════════════════════════════════════
  // 4. ORO — solo criteri + storico settimane oro
  //    (rimossi blocchi STATS TOP + RECORD PERSONALI:
  //     gamification contraria alla filosofia v8)
  // ═══════════════════════════════════════════════════════

  function renderOroAnnualHeatmap() {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const yr = today.getFullYear();
    const jan1 = new Date(yr, 0, 1);
    const { start: w1 } = CS.weekRange(jan1);
    const cells = [];
    let cursor = new Date(w1);
    let wNum = 0;
    while (wNum < 54) {
      const wEnd = new Date(cursor); wEnd.setDate(cursor.getDate() + 6); wEnd.setHours(23, 59, 59, 999);
      if (cursor.getFullYear() > yr && wEnd.getFullYear() > yr) break;
      const inYear = cursor.getFullYear() === yr || wEnd.getFullYear() === yr;
      if (inYear) {
        const isFuture = cursor > today;
        const isCurrent = cursor <= today && wEnd >= today;
        let gold = false, met = 0, total = 4;
        if (!isFuture) {
          try {
            const s = CALC.settimanaTopCheck ? CALC.settimanaTopCheck(cursor) : {};
            gold = s.gold || false;
            met = s.met || 0;
            total = (s.criteri && s.criteri.length) || 4;
          } catch (e) {}
        }
        const iso = CS.isoDateOnly(cursor);
        const d = cursor.getDate(), m = cursor.getMonth();
        const mN = ['G','F','M','A','M','G','L','A','S','O','N','D'];
        const monthMark = d <= 7 ? mN[m] : '';
        cells.push({ iso, gold, isFuture, isCurrent, met, total, wNum: wNum + 1, monthMark });
      }
      cursor.setDate(cursor.getDate() + 7);
      wNum++;
    }
    const goldCount = cells.filter(c => c.gold).length;
    const cellsHtml = cells.map(c => {
      const cls = c.gold ? 'is-gold'
        : c.isFuture ? 'is-future'
        : c.isCurrent ? 'is-current'
        : c.met > 0 ? 'is-partial'
        : 'is-empty';
      const intensity = c.gold ? 4 : Math.min(c.met, 3);
      const tip = c.gold ? 'ORO ◆' : c.isFuture ? 'futura' : `${c.met}/${c.total} criteri`;
      return `<div class="oro-heat-cell ${cls}" data-intensity="${intensity}" title="W${c.wNum} · ${tip}" data-iso="${c.iso}"></div>`;
    }).join('');
    const monthsHtml = cells.map((c, i) =>
      c.monthMark ? `<div class="oro-heat-month" style="grid-column:${i + 1}">${c.monthMark}</div>` : ''
    ).join('');

    return `
      <div class="archive-results-head" style="margin-top:var(--sp-4)">${goldCount} SETTIMANE ORO — ${yr}</div>
      <div class="oro-heat-wrap">
        <div class="oro-heat-months" style="grid-template-columns:repeat(${cells.length},1fr)">${monthsHtml}</div>
        <div class="oro-heat-grid" style="grid-template-columns:repeat(${cells.length},1fr)">${cellsHtml}</div>
        <div class="oro-heat-legend">
          <span class="muted">0</span>
          <div class="oro-heat-cell is-partial" data-intensity="1"></div>
          <div class="oro-heat-cell is-partial" data-intensity="3"></div>
          <div class="oro-heat-cell is-gold" data-intensity="4"></div>
          <span class="accent">ORO</span>
        </div>
      </div>
    `;
  }

  function renderOro() {
    const allWeeks = generateSettimanaliAggregati();
    const settOro = allWeeks.filter(w => w.sett.gold).length;
    const c = CS.state.criteriOro || {};
    const cs = c.sett || {};
    const cm = c.mese || {};

    return `
      <div class="archive-results-head" style="display:flex;justify-content:space-between;align-items:center">
        <span>CRITERI ATTUALI</span>
        <button class="btn-sm" id="edit-criteri">modifica</button>
      </div>
      <div class="criteria-checklist">
        <div class="criteri-section">
          <div class="criteri-section-title">SETTIMANA D'ORO (tutti devono essere rispettati)</div>
          <ul>
            <li>✓ Allenamento ${cs.giorniAllenamento || 6} giorni su 7</li>
            <li>✓ Almeno ${cs.oreMinime || 2}h/giorno nei giorni di allenamento</li>
            <li>✓ ${cs.flessioniGiorno || 50} flessioni + ${cs.squatGiorno || 50} squat ogni giorno</li>
            <li>✓ Corsa almeno ${cs.corseSett || 3} volte a settimana</li>
          </ul>
        </div>
        <div class="criteri-section">
          <div class="criteri-section-title">MESE D'ORO</div>
          <ul><li>✓ Almeno ${cm.settimaneTop || 3} settimane d'oro nel mese</li></ul>
        </div>
      </div>

      ${renderOroAnnualHeatmap()}

      <div class="archive-results-head" style="margin-top:var(--sp-4)">STORICO SETTIMANE D'ORO (${settOro})</div>
      ${allWeeks.filter(w => w.sett.gold).length
        ? allWeeks.filter(w => w.sett.gold).map(w =>
          `<div class="result-row"><span class="accent">◆ ORO</span> <span>${CS.fmtDate(w.startISO, { short: true })} → ${CS.fmtDate(w.endISO, { short: true })}</span> <span>${w.agg.ore.toFixed(1)}h · ${w.agg.sessioni} sess</span></div>`
        ).join('')
        : '<div class="empty-state"><div class="empty-text">Nessuna settimana d\'oro ancora — continua!</div></div>'}
    `;
  }

  // ═══════════════════════════════════════════════════════
  // 5. HANDLERS DRILL-DOWN
  // ═══════════════════════════════════════════════════════

  // Re-render solo il blocco #archive-results (senza ridisegnare topbar/pills)
  function rerenderResults(section, fs) {
    const el = document.getElementById('archive-results');
    if (!el) return;
    el.innerHTML = renderResults(section, fs);
    attachResultsHandlers(section, fs);
    postRenderArchiveResults(section, fs);
  }

  // Handler dei click/cambi DENTRO #archive-results (drill, back, filtri data, status)
  function attachResultsHandlers(section, fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;

    // L1 → click card categoria (anche varianti rich)
    root.querySelectorAll('[data-drill-key]').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.drillKey;
        if (!key) return;
        fs.drillKey = key;
        fs.dateFrom = '';
        fs.dateTo = '';
        fs.statusFilter = 'all';
        rerenderResults(section, fs);
      });
    });

    // L2 → back breadcrumb
    root.querySelectorAll('.arch-l2-back').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        fs.drillKey = null;
        fs.dateFrom = '';
        fs.dateTo = '';
        fs.statusFilter = 'all';
        if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
        rerenderResults(section, fs);
      });
    });

    // L2 → filtri data
    const dFrom = root.querySelector('.arch-filter-from');
    const dTo   = root.querySelector('.arch-filter-to');
    if (dFrom) dFrom.addEventListener('change', () => {
      fs.dateFrom = dFrom.value || '';
      rerenderResults(section, fs);
    });
    if (dTo) dTo.addEventListener('change', () => {
      fs.dateTo = dTo.value || '';
      rerenderResults(section, fs);
    });

    // L2 → reset filtri
    const resetBtn = root.querySelector('.arch-l2-filter-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      fs.dateFrom = '';
      fs.dateTo = '';
      fs.statusFilter = 'all';
      rerenderResults(section, fs);
    });

    // L2 → filtro stato (solo obiettivi)
    root.querySelectorAll('.arch-status-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        fs.statusFilter = pill.dataset.status || 'all';
        rerenderResults(section, fs);
      });
    });

    // ORO: edit criteri
    root.querySelector('#edit-criteri')?.addEventListener('click', () => openCriteriForm());

    // ── ARCHIVIO OBIETTIVI v10 — handlers L1/L2 ──
    root.querySelectorAll('[data-scadenza]').forEach(card => {
      card.addEventListener('click', () => {
        const s = card.dataset.scadenza;
        if (!s) return;
        fs.scadenza = s;
        fs.filterMonth = '';
        fs.filterWeek = 'all';
        fs.filterYear = '';
        fs.statusFilter = 'all';
        rerenderResults(section, fs);
      });
    });
    const objBack = root.querySelector('[data-arch-back]');
    if (objBack) {
      objBack.addEventListener('click', (ev) => {
        ev.preventDefault();
        fs.scadenza = null;
        fs.filterMonth = '';
        fs.filterWeek = 'all';
        fs.filterYear = '';
        fs.statusFilter = 'all';
        rerenderResults(section, fs);
      });
    }
    const monthSel = root.querySelector('[data-filter-month]');
    if (monthSel) {
      monthSel.addEventListener('change', () => {
        fs.filterMonth = monthSel.value || '';
        rerenderResults(section, fs);
      });
    }
    const yearSel = root.querySelector('[data-filter-year]');
    if (yearSel) {
      yearSel.addEventListener('change', () => {
        fs.filterYear = yearSel.value || '';
        rerenderResults(section, fs);
      });
    }
    root.querySelectorAll('[data-filter-week]').forEach(btn => {
      btn.addEventListener('click', () => {
        fs.filterWeek = btn.dataset.filterWeek || 'all';
        rerenderResults(section, fs);
      });
    });
    // Toggle collapse/espansione dei gruppi mese (obiettivi mensili)
    root.querySelectorAll('[data-obj-toggle]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = btn.dataset.objToggle;
        _objL2Collapsed[key] = !_objL2Collapsed[key];
        const group = root.querySelector(`[data-obj-group="${key.replace(/"/g, '\\"')}"]`);
        if (group) group.classList.toggle('is-collapsed', _objL2Collapsed[key]);
        btn.setAttribute('aria-expanded', String(!_objL2Collapsed[key]));
        btn.title = _objL2Collapsed[key] ? 'Espandi mese' : 'Comprimi mese';
      });
    });
    root.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        fs.statusFilter = btn.dataset.status || 'all';
        rerenderResults(section, fs);
      });
    });

    // FISICA v5 — period switcher (30GG/YTD/TUTTO)
    root.querySelectorAll('[data-fperiod]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.fperiod;
        if (!p || fs.period === p) return;
        fs.period = p;
        rerenderResults(section, fs);
      });
    });
  }

  function attachHandlers(section) {
    const fs = filterState[section];
    const meta = ZONE_META[section];

    // Cleanup chart precedente quando si entra in una sezione
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }

    // Pill click → entra in vista pill (resetta stato drill)
    document.querySelectorAll('.archive-pill').forEach(b => {
      b.addEventListener('click', () => {
        const newPill = b.dataset.pill;
        if (newPill === fs.pill) return;
        fs.pill = newPill;
        if ('drillKey' in fs) {
          fs.drillKey = null;
          fs.dateFrom = '';
          fs.dateTo = '';
          fs.statusFilter = 'all';
        }
        if ('period' in fs) fs.period = 'YTD';
        if (section === 'fisica' && newPill !== 'infortuni') {
          filterState.infortuni.drillKey = null;
        }
        fs.search = '';
        ROUTER.go('archivio', section);
      });
    });

    // Breadcrumb back: vista pill → vista overview zona
    const backLink = document.querySelector('[data-back]');
    if (backLink) {
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        fs.pill = null;
        if ('drillKey' in fs) {
          fs.drillKey = null;
          fs.dateFrom = '';
          fs.dateTo = '';
          fs.statusFilter = 'all';
        }
        fs.search = '';
        if (section === 'fisica') filterState.infortuni.drillKey = null;
        ROUTER.go('archivio', section);
      });
    }

    // ── Vista OVERVIEW: anima KPI grid + period switcher (no archive-results) ──
    const zoneGrid = document.getElementById('zone-section-grid');
    if (meta && !fs.pill && zoneGrid) {
      animatePanoCards(zoneGrid);
      document.querySelectorAll('.zone-section-period .pano-period-pill').forEach(b => {
        b.addEventListener('click', () => {
          const newP = b.dataset.period;
          if (newP === panoState.period) return;
          panoState.period = newP;
          if (newP === 'TUTTO') panoState.yearInfo = null;
          document.querySelectorAll('.zone-section-period .pano-period-pill').forEach(x =>
            x.classList.toggle('active', x.dataset.period === newP));
          const meta2 = document.querySelector('.zone-section-period #pano-period-meta');
          if (meta2) meta2.textContent = getPeriodMeta(newP);
          animateLeave(zoneGrid, () => animatePanoCards(zoneGrid));
        });
      });
      zoneGrid.querySelectorAll('.pano-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.pano-card-expand-btn')) {
            const spec = PANO_CARDS.find(s => s.id === card.dataset.card);
            if (spec) expandCardModal(spec);
            return;
          }
          const spec = PANO_CARDS.find(s => s.id === card.dataset.card);
          if (!spec) return;
          FX.glowBurst(card, 'var(--neon)');
          setTimeout(() => goToSub(spec), 120);
        });
      });
      // In overview non c'è #archive-results → niente altri handler
      return;
    }

    // ── Vista PILL: search + filtri + handlers content drill ──
    const search = document.querySelector('.archive-search');
    if (search) search.addEventListener('input', debounce(() => {
      fs.search = search.value;
      rerenderResults(section, fs);
    }, 200));

    const reset = document.querySelector('.filter-reset');
    if (reset) reset.addEventListener('click', () => {
      fs.search = '';
      ROUTER.go('archivio', section);
    });

    // Caso speciale: pill infortuni in fisica → wire-up handler infortuni
    if (section === 'fisica' && fs.pill === 'infortuni') {
      attachInfortuniInlineHandlers();
      // Lo stato drill degli infortuni vive in filterState.infortuni, non in fs:
      // senza questo argomento postRenderInfortuni esplodeva su fs.drillKey.
      postRenderInfortuni(filterState.infortuni);
      return;
    }

    // Attacca handler interni #archive-results + init chart se serve (solo se esiste)
    if (document.getElementById('archive-results')) {
      attachResultsHandlers(section, fs);
      postRenderArchiveResults(section, fs);
    }
  }

  // Handlers infortuni "inline" (quando renderizzati come pill di fisica).
  // Riusa la stessa logica di attachInfortuniHandlers ma senza dipendere
  // dalla route stand-alone — opera sul mount corrente di #archive-results.
  function attachInfortuniInlineHandlers() {
    const fs = filterState.infortuni;
    const root = document.getElementById('archive-results');
    if (!root) return;

    // Click L1 card → drill in
    root.querySelectorAll('.arch-injury-card[data-drill-key]').forEach(card => {
      card.addEventListener('click', () => {
        fs.drillKey = card.dataset.drillKey;
        rerenderInfortuniInline();
      });
    });
    // Back L2 → L1
    root.querySelectorAll('.arch-l2-back')?.forEach(b => {
      b.addEventListener('click', () => {
        fs.drillKey = null;
        rerenderInfortuniInline();
      });
    });
    // Filtri data — renderDateFilters emette .arch-filter-from/.arch-filter-to
    // e .arch-l2-filter-reset (singolare). Prima qui si cercavano
    // [data-date-from]/[data-date-to]/.arch-l2-filters-reset, che non esistono:
    // in ARCHIVIO → FISICA → INFORTUNI i filtri e il RESET erano tasti morti.
    const dFrom = root.querySelector('.arch-filter-from');
    const dTo   = root.querySelector('.arch-filter-to');
    if (dFrom) dFrom.addEventListener('change', () => { fs.dateFrom = dFrom.value || ''; rerenderInfortuniInline(); });
    if (dTo)   dTo.addEventListener('change',   () => { fs.dateTo   = dTo.value   || ''; rerenderInfortuniInline(); });
    root.querySelector('.arch-l2-filter-reset')?.addEventListener('click', () => {
      fs.dateFrom = ''; fs.dateTo = ''; fs.gravitaFilter = 'all'; rerenderInfortuniInline();
    });
    // Gravita filter
    root.querySelectorAll('.arch-injury-gravita-filter [data-gravita]').forEach(p => {
      p.addEventListener('click', () => {
        fs.gravitaFilter = p.dataset.gravita || 'all';
        rerenderInfortuniInline();
      });
    });
  }

  function rerenderInfortuniInline() {
    const fs = filterState.infortuni;
    const el = document.getElementById('archive-results');
    if (!el) return;
    el.innerHTML = fs.drillKey ? renderInfortuniDetailL2(fs) : renderInfortuniListL1();
    attachInfortuniInlineHandlers();
    postRenderInfortuni(fs);
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }

  function openCriteriForm() {
    const c = CS.state.criteriOro || { sett: {}, mese: {} };
    const s = c.sett || {};
    const m = c.mese || {};
    const sonnoTH = c.sonnoTargetH != null ? c.sonnoTargetH : 8;
    const html = `
      <h2 class="modal-title">MODIFICA CRITERI ORO &amp; TARGET</h2>
      <div class="criteri-section">
        <div class="criteri-section-title">SETTIMANA D'ORO</div>
        <div class="row" style="gap:var(--sp-3);flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:140px"><label class="field-label">Giorni allen. (su 7)</label>
            <input class="input" type="number" min="1" max="7" id="c-gg" value="${s.giorniAllenamento || 6}"></div>
          <div class="field" style="flex:1;min-width:140px"><label class="field-label">Ore minime/giorno</label>
            <input class="input" type="number" step="0.5" id="c-ore" value="${s.oreMinime || 2}"></div>
        </div>
        <div class="row" style="gap:var(--sp-3);flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:110px"><label class="field-label">Flessioni/giorno</label>
            <input class="input" type="number" id="c-fl" value="${s.flessioniGiorno || 50}"></div>
          <div class="field" style="flex:1;min-width:110px"><label class="field-label">Squat/giorno</label>
            <input class="input" type="number" id="c-sq" value="${s.squatGiorno || 50}"></div>
          <div class="field" style="flex:1;min-width:110px"><label class="field-label">Addominali/giorno</label>
            <input class="input" type="number" id="c-ad" value="${s.addoGiorno != null ? s.addoGiorno : 50}"></div>
          <div class="field" style="flex:1;min-width:110px"><label class="field-label">Corse/settimana</label>
            <input class="input" type="number" id="c-co" value="${s.corseSett || 3}"></div>
        </div>
      </div>
      <div class="criteri-section">
        <div class="criteri-section-title">MESE D'ORO</div>
        <div class="field"><label class="field-label">Settimane d'oro nel mese (su 4)</label>
          <input class="input" type="number" min="1" max="4" id="c-mt" value="${m.settimaneTop || 3}"></div>
      </div>
      <div class="criteri-section">
        <div class="criteri-section-title">TARGET INDICE ZONA</div>
        <div class="field" style="max-width:240px"><label class="field-label">Sonno target (ore/giorno)</label>
          <input class="input" type="number" step="0.5" min="4" max="12" id="c-sn" value="${sonnoTH}"></div>
      </div>
      <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn ghost" data-close>ANNULLA</button>
        <button class="btn primary" id="c-sv">SALVA CRITERI</button>
      </div>
    `;
    const md = UI.modal(html);
    md.el.querySelector('#c-sv').addEventListener('click', () => {
      CS.updateCriteriOro({
        sett: {
          giorniAllenamento: Number(md.el.querySelector('#c-gg').value) || 6,
          oreMinime: Number(md.el.querySelector('#c-ore').value) || 2,
          flessioniGiorno: Number(md.el.querySelector('#c-fl').value) || 50,
          squatGiorno: Number(md.el.querySelector('#c-sq').value) || 50,
          addoGiorno: Number(md.el.querySelector('#c-ad').value) || 50,
          corseSett: Number(md.el.querySelector('#c-co').value) || 3,
        },
        mese: { settimaneTop: Number(md.el.querySelector('#c-mt').value) || 3 },
        sonnoTargetH: Number(md.el.querySelector('#c-sn').value) || 8,
      });
      md.close();
      UI.toast('Criteri aggiornati', 'ok');
      ROUTER.go('archivio', 'revisioni');
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  // ═══════════════════════════════════════════════════════
  //   STREAK — vista dedicata (heatmap + stats) [v3.2]
  // ═══════════════════════════════════════════════════════
  function renderStreakOverview() {
    const cur = (CALC.streakDays && CALC.streakDays()) || 0;
    // Calcolo max streak storica dai revisioni
    const revs = (CS.state.revisioni || [])
      .filter(r => (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0)
      .map(r => r.data)
      .filter(Boolean)
      .sort();
    let maxStreak = 0, curRun = 0, prev = null;
    revs.forEach(iso => {
      if (!prev) { curRun = 1; }
      else {
        const a = new Date(prev), b = new Date(iso);
        const diff = Math.round((b - a) / 86400000);
        curRun = diff === 1 ? curRun + 1 : 1;
      }
      if (curRun > maxStreak) maxStreak = curRun;
      prev = iso;
    });
    const days365 = build365Heatmap();
    const allenati = days365.filter(d => d.intensity > 0).length;
    return `
      <div class="archive-results-head">STREAK · ${cur} GIORN${cur === 1 ? 'O' : 'I'}</div>
      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini"><div class="lbl">ATTUALE</div><div class="big">${cur}<span class="unit">gg</span></div></div>
        <div class="arch-injury-stat-mini"><div class="lbl">MASSIMO</div><div class="big">${maxStreak}<span class="unit">gg</span></div></div>
        <div class="arch-injury-stat-mini"><div class="lbl">ALLENATI 365GG</div><div class="big">${allenati}<span class="unit">gg</span></div></div>
        <div class="arch-injury-stat-mini"><div class="lbl">% ANNO</div><div class="big">${Math.round(allenati / 365 * 100)}<span class="unit">%</span></div></div>
      </div>
      <div class="archive-results-head" style="margin-top:var(--sp-4)">ULTIMI 365 GIORNI</div>
      <div class="streak-heat-wrap">
        <div class="streak-heat-grid">
          ${days365.map(d => `<div class="streak-heat-cell" data-intensity="${d.intensity}" title="${d.iso} · ${d.ore.toFixed(1)}h"></div>`).join('')}
        </div>
        <div class="streak-heat-legend">
          <span class="muted">0h</span>
          <div class="streak-heat-cell" data-intensity="1"></div>
          <div class="streak-heat-cell" data-intensity="2"></div>
          <div class="streak-heat-cell" data-intensity="3"></div>
          <div class="streak-heat-cell" data-intensity="4"></div>
          <span class="muted">4h+</span>
        </div>
      </div>
    `;
  }

  function build365Heatmap() {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const revMap = new Map();
    (CS.state.revisioni || []).forEach(r => { if (r.data) revMap.set(r.data, r); });
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = CS.isoDateOnly(d);
      const r = revMap.get(iso);
      const ore = r ? (Number(r.oreAllenamento) || Number(r.oreH) || 0) : 0;
      const intensity = ore <= 0 ? 0 : ore < 1 ? 1 : ore < 2 ? 2 : ore < 3 ? 3 : 4;
      out.push({ iso, ore, intensity });
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════
  //   ARCHIVIO/INFORTUNI — sub-tab dedicato, drill L1/L2 per parte
  // ═══════════════════════════════════════════════════════

  function normalizeParte(s) {
    return String(s || '').trim().toLowerCase();
  }

  function injuryGravityColor(g) {
    const x = String(g || '').toLowerCase();
    if (x === 'lieve') return '#00ff88';
    if (x === 'media' || x === 'moderata' || x === 'moderato') return '#B45CFF';
    if (x === 'grave') return '#ff4444';
    return 'rgba(245,245,247,0.5)';
  }

  function findInjuryPartIcon(parte) {
    const p = String(parte || '').toLowerCase();
    if (/spall|braccio|gomito|polso|mano|dito|bicip|tricip/.test(p)) return '💪';
    if (/ginocchi|caviglia|piede|tibi|polpac|quadricip|polpaccio/.test(p)) return '🦵';
    if (/test|cervic|collo/.test(p)) return '🧠';
    if (/schien|dorso|lombare|lombar/.test(p)) return '🩻';
    if (/anc|bacin|inguine/.test(p)) return '🦴';
    if (/costol|toraci|petto/.test(p)) return '🫁';
    return '🩹';
  }

  function durataInGg(inj) {
    if (!inj.dataInizio) return 0;
    const from = new Date(inj.dataInizio).getTime();
    const to = inj.dataFine ? new Date(inj.dataFine).getTime() : Date.now();
    return Math.max(0, Math.round((to - from) / 86400000));
  }

  function aggregateInjuriesByPart(items) {
    const groups = {};
    const labels = {};
    items.forEach(inj => {
      const key = normalizeParte(inj.parte);
      if (!key) return;
      if (!labels[key]) labels[key] = inj.parte;
      if (!groups[key]) groups[key] = [];
      groups[key].push(inj);
    });
    return Object.keys(groups).map(key => {
      const arr = groups[key];
      const sorted = [...arr].sort((a, b) => (a.dataInizio || '').localeCompare(b.dataInizio || ''));
      const episodi = arr.length;
      const attivi = arr.filter(i => !i.dataFine).length;
      const risolti = arr.filter(i => !!i.dataFine);
      const ggTot = arr.reduce((s, i) => s + durataInGg(i), 0);
      const ggMediaRisolti = risolti.length
        ? Math.round(risolti.reduce((s, i) => s + durataInGg(i), 0) / risolti.length)
        : 0;
      const gravOrder = ['lieve', 'media', 'moderata', 'moderato', 'grave'];
      const gravPeggiore = arr.reduce((worst, i) => {
        const gx = String(i.gravita || '').toLowerCase();
        const wo = gravOrder.indexOf(gx);
        const wp = gravOrder.indexOf(worst);
        return wo > wp ? gx : worst;
      }, '');
      const recoveryMedio = (() => {
        const active = arr.filter(i => !i.dataFine);
        if (!active.length) return 100;
        const sum = active.reduce((s, i) => s + (Number(i.recoveryPercent) || 0), 0);
        return Math.round(sum / active.length);
      })();
      return {
        key,
        name: labels[key],
        episodi, attivi,
        risoltiCount: risolti.length,
        ggTot, ggMediaRisolti,
        gravPeggiore,
        recoveryMedio,
        hasActive: attivi > 0,
        isRecidiva: episodi >= 2,
        items: sorted,
      };
    });
  }

  function renderInfortuniRoot() {
    const fs = filterState.infortuni;
    return `
      <div class="page-header">
        <div>
          <div class="archive-breadcrumb"><a href="#/archivio/panoramica">PANORAMICA</a> › <span>INFORTUNI</span></div>
          <h1 class="page-title">ARCHI<span class="accent">VIO</span> · INFORTUNI</h1>
        </div>
      </div>
      <div class="panel archive-results" id="archive-results">
        ${fs.drillKey ? renderInfortuniDetailL2(fs) : renderInfortuniListL1()}
      </div>
    `;
  }

  function renderInfortuniListL1() {
    const all = CS.state.infortuni || [];
    if (!all.length) {
      return `
        <div class="archive-results-head">NESSUN INFORTUNIO REGISTRATO</div>
        <div class="empty-state"><div class="empty-text">Nessun infortunio nello storico — continua così 🥊</div></div>
      `;
    }
    const groups = aggregateInjuriesByPart(all);
    // Stats globali
    const episodiTot = all.length;
    const attiviTot = all.filter(i => !i.dataFine).length;
    const partiDistinte = groups.length;
    const ggTotFuori = all.reduce((s, i) => s + durataInGg(i), 0);

    // Ordine: attivi prima, poi recidive, poi durata media desc
    groups.sort((a, b) => {
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      if (a.isRecidiva !== b.isRecidiva) return a.isRecidiva ? -1 : 1;
      return b.ggMediaRisolti - a.ggMediaRisolti;
    });

    return `
      <div class="archive-results-head">INFORTUNI — ${episodiTot} episodi · ${partiDistinte} parti</div>
      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">EPISODI</div>
          <div class="stat-val" data-cup="${episodiTot}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">ATTIVI OGGI</div>
          <div class="stat-val ${attiviTot > 0 ? 'is-danger' : ''}" data-cup="${attiviTot}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">PARTI</div>
          <div class="stat-val" data-cup="${partiDistinte}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">GG FUORI TOT</div>
          <div class="stat-val" data-cup="${ggTotFuori}">0</div>
        </div>
      </div>
      <div class="arch-cat-grid arch-injury-grid">
        ${groups.map(renderInjuryCard).join('')}
      </div>
    `;
  }

  function renderInjuryCard(g) {
    const ico = findInjuryPartIcon(g.name);
    const cls = g.hasActive ? 'is-active' : g.isRecidiva ? 'is-recidiva' : 'is-resolved';
    let badge = '';
    if (g.hasActive) badge = `<span class="arch-injury-badge is-active">ATTIVO</span>`;
    else if (g.isRecidiva) badge = `<span class="arch-injury-badge is-recidiva">RECIDIVA</span>`;
    else badge = `<span class="arch-injury-badge is-resolved">RISOLTO</span>`;
    const ringPct = g.hasActive ? g.recoveryMedio : (g.risoltiCount / g.episodi) * 100;
    const ringColor = g.hasActive ? 'var(--warn, #B45CFF)' : '#00ff88';
    const gravColor = injuryGravityColor(g.gravPeggiore);

    return `
      <div class="arch-injury-card ${cls}" data-drill-key="${escapeAttr(g.name)}">
        <div class="arch-injury-card-top">
          <div class="arch-injury-card-id">
            <span class="arch-injury-card-ico">${ico}</span>
            <div class="arch-injury-card-name">${escapeHtml(g.name)}</div>
          </div>
          ${badge}
        </div>
        <div class="arch-injury-card-mid">
          <div class="arch-injury-card-ring" data-ring-pct="${Math.round(ringPct)}" data-ring-color="${ringColor}"></div>
          <div class="arch-injury-card-figures">
            <div class="arch-injury-card-big" data-cup="${g.episodi}">0</div>
            <div class="arch-injury-card-sub">episodi · ${g.ggMediaRisolti}gg medi</div>
            ${g.gravPeggiore ? `<span class="arch-injury-gravita" style="color:${gravColor};border-color:${gravColor}44;background:${gravColor}14">${g.gravPeggiore.toUpperCase()}</span>` : ''}
          </div>
        </div>
        <div class="arch-injury-card-bar">
          <div class="arch-injury-card-bar-fill" style="width:${Math.min(100, (g.ggTot / 30) * 100)}%"></div>
        </div>
      </div>
    `;
  }

  // ─── INFORTUNI L2 ────────────────────────────────────
  function renderInfortuniDetailL2(fs) {
    const all = (CS.state.infortuni || []).filter(i => normalizeParte(i.parte) === normalizeParte(fs.drillKey));
    let filtered = applyDateFilter(all, fs, 'dataInizio');
    if (fs.gravitaFilter && fs.gravitaFilter !== 'all') {
      filtered = filtered.filter(i => String(i.gravita || '').toLowerCase() === fs.gravitaFilter);
    }

    const partLabel = all[0] ? all[0].parte : fs.drillKey;
    const episodi = filtered.length;
    const attivi = filtered.filter(i => !i.dataFine).length;
    const risolti = filtered.filter(i => !!i.dataFine);
    const durMedia = risolti.length
      ? Math.round(risolti.reduce((s, i) => s + durataInGg(i), 0) / risolti.length)
      : 0;
    const color = attivi > 0 ? '#B45CFF' : '#00ff88';
    const ico = findInjuryPartIcon(partLabel);
    const headerExtra = `<span class="arch-l2-record">${ico} ${attivi > 0 ? 'in cura' : 'risolti'}</span>`;

    const yearGroups = groupByYear(filtered, 'dataInizio');

    return `
      ${renderL2Header('INFORTUNI', partLabel, episodi, ' episodi', color, headerExtra)}
      <div class="arch-injury-stats-row arch-injury-stats-l2">
        <div class="arch-injury-stat-mini"><div class="stat-lbl">TOTALE</div><div class="stat-val" data-cup="${episodi}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">ATTIVI</div><div class="stat-val ${attivi > 0 ? 'is-danger' : ''}" data-cup="${attivi}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">RISOLTI</div><div class="stat-val" data-cup="${risolti.length}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">DURATA MEDIA</div><div class="stat-val" data-cup="${durMedia}">0<span class="stat-unit">gg</span></div></div>
      </div>
      ${renderDateFilters(fs)}
      ${renderGravitaFilter(fs.gravitaFilter || 'all')}
      <div class="arch-l2-chart-wrap arch-injury-timeline-wrap"><canvas id="arch-injury-timeline-chart"></canvas></div>
      <div class="arch-l2-list">
        ${renderInjuryYearAccordion(yearGroups)}
      </div>
    `;
  }

  function renderGravitaFilter(current) {
    const opts = [
      { id: 'all',   label: 'TUTTE' },
      { id: 'lieve', label: 'LIEVE' },
      { id: 'media', label: 'MEDIA' },
      { id: 'grave', label: 'GRAVE' },
    ];
    return `
      <div class="arch-l2-status-pills arch-injury-gravita-filter">
        ${opts.map(o => `<button class="vota-pill arch-gravita-pill ${o.id === current ? 'active' : ''}" data-gravita="${o.id}">${o.label}</button>`).join('')}
      </div>
    `;
  }

  function groupByYear(items, dateField) {
    const groups = {};
    items.forEach(it => {
      const d = it[dateField];
      if (!d || typeof d !== 'string') return;
      const m = d.match(/^(\d{4})/);
      if (!m) return;
      const key = m[1];
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(k => ({
      key: k,
      items: groups[k].sort((a, b) => (b[dateField] || '').localeCompare(a[dateField] || '')),
    }));
  }

  function renderInjuryYearAccordion(groups) {
    if (!groups.length) return '<div class="empty-state"><div class="empty-text">Nessun episodio nel periodo</div></div>';
    return groups.map((g, i) => {
      const episodi = g.items.length;
      const attivi = g.items.filter(it => !it.dataFine).length;
      const ggTot = g.items.reduce((s, it) => s + durataInGg(it), 0);
      return `
        <details class="arch-month-group arch-injury-year-accordion" ${i === 0 ? 'open' : ''}>
          <summary class="arch-month-head">
            <span class="arch-month-name">ANNO ${g.key}</span>
            <span class="arch-month-meta">${episodi} episodi · ${attivi} attivi · ${ggTot}gg</span>
            <span class="arch-month-chevron">▾</span>
          </summary>
          <div class="arch-month-body">${g.items.map(renderInjuryRow).join('')}</div>
        </details>
      `;
    }).join('');
  }

  function renderInjuryRow(inj) {
    const dur = durataInGg(inj);
    const isActive = !inj.dataFine;
    const gravColor = injuryGravityColor(inj.gravita);
    const recovery = Math.max(0, Math.min(100, Number(inj.recoveryPercent) || 0));
    const dateLbl = isActive
      ? `${CS.fmtDate(inj.dataInizio, { short: true })} → in corso`
      : `${CS.fmtDate(inj.dataInizio, { short: true })} → ${CS.fmtDate(inj.dataFine, { short: true })}`;
    return `
      <div class="arch-l2-row arch-injury-row ${isActive ? 'is-active' : ''}">
        <span class="arch-l2-row-date">${dateLbl}</span>
        <span class="arch-injury-gravita" style="color:${gravColor};border-color:${gravColor}44;background:${gravColor}14">${(inj.gravita || '—').toUpperCase()}</span>
        <span class="arch-l2-row-mid">
          <div class="arch-injury-detail">
            ${inj.sintomi ? `<div><span class="arch-injury-lbl">SINT.</span> ${escapeHtml(inj.sintomi)}</div>` : ''}
            ${inj.terapia ? `<div><span class="arch-injury-lbl">TER.</span> ${escapeHtml(inj.terapia)}</div>` : ''}
            ${inj.note ? `<div class="arch-row-note">${escapeHtml(inj.note)}</div>` : ''}
          </div>
        </span>
        <span class="arch-l2-row-right">
          <div class="arch-injury-duration">${dur}gg</div>
          ${isActive ? `
            <div class="arch-injury-recovery-bar"><div class="arch-injury-recovery-fill" style="width:${recovery}%"></div></div>
            <div class="arch-injury-recovery-lbl">recovery ${recovery}%</div>
          ` : '<span class="arch-injury-badge is-resolved">CHIUSO</span>'}
        </span>
      </div>
    `;
  }

  function initInjuryTimelineChart(items) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-injury-timeline-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;

    const sorted = [...items].sort((a, b) => (a.dataInizio || '').localeCompare(b.dataInizio || ''));
    const labels = sorted.map((i, idx) => `Ep ${idx + 1}`);
    const data = sorted.map(i => ({ x: [i.dataInizio, i.dataFine || new Date().toISOString().slice(0, 10)], y: `Ep ${sorted.indexOf(i) + 1}` }));
    const colors = sorted.map(i => injuryGravityColor(i.gravita));

    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Durata',
          data: sorted.map(i => durataInGg(i)),
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, callback: v => v + 'gg' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            ticks: { color: 'rgba(245,245,247,0.65)', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => {
                const inj = sorted[ctx.dataIndex];
                const dateLbl = inj.dataFine
                  ? `${CS.fmtDate(inj.dataInizio, { short: true })} → ${CS.fmtDate(inj.dataFine, { short: true })}`
                  : `${CS.fmtDate(inj.dataInizio, { short: true })} → oggi`;
                return [`${dateLbl}`, `${durataInGg(inj)}gg · ${inj.gravita || '—'}`];
              },
            },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function attachInfortuniHandlers() {
    const fs = filterState.infortuni;
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }

    const root = document.getElementById('archive-results');
    if (!root) return;

    // L1 drill click
    root.querySelectorAll('.arch-injury-card[data-drill-key]').forEach(card => {
      card.addEventListener('click', () => {
        fs.drillKey = card.dataset.drillKey;
        fs.dateFrom = '';
        fs.dateTo = '';
        fs.gravitaFilter = 'all';
        rerenderInfortuni();
      });
    });
    // L2 back
    root.querySelectorAll('.arch-l2-back').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        fs.drillKey = null;
        fs.dateFrom = '';
        fs.dateTo = '';
        fs.gravitaFilter = 'all';
        if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
        rerenderInfortuni();
      });
    });
    // Date filters
    const dFrom = root.querySelector('.arch-filter-from');
    const dTo   = root.querySelector('.arch-filter-to');
    if (dFrom) dFrom.addEventListener('change', () => { fs.dateFrom = dFrom.value || ''; rerenderInfortuni(); });
    if (dTo)   dTo.addEventListener('change',   () => { fs.dateTo   = dTo.value   || ''; rerenderInfortuni(); });
    const resetBtn = root.querySelector('.arch-l2-filter-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      fs.dateFrom = ''; fs.dateTo = ''; fs.gravitaFilter = 'all'; rerenderInfortuni();
    });
    // Gravità filter pill
    root.querySelectorAll('.arch-gravita-pill').forEach(p => {
      p.addEventListener('click', () => {
        fs.gravitaFilter = p.dataset.gravita || 'all';
        rerenderInfortuni();
      });
    });

    postRenderInfortuni(fs);
  }

  function rerenderInfortuni() {
    const el = document.getElementById('archive-results');
    const fs = filterState.infortuni;
    if (!el) return;
    el.innerHTML = fs.drillKey ? renderInfortuniDetailL2(fs) : renderInfortuniListL1();
    attachInfortuniHandlers();
  }

  function postRenderInfortuni(fs) {
    fs = fs || filterState.infortuni;   // rete di sicurezza: mai undefined
    const root = document.getElementById('archive-results');
    if (!root) return;
    // countUp su tutti i numeri data-cup
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      FX.countUp(el, 0, target, 700, { decimals: 0 });
    });
    if (!fs.drillKey) {
      // L1: ring progress + stagger + breathe per attivi
      root.querySelectorAll('.arch-injury-card-ring[data-ring-pct]').forEach(host => {
        const pct = Number(host.dataset.ringPct) || 0;
        const color = host.dataset.ringColor || 'var(--neon)';
        FX.ringProgress(host, pct, { size: 56, stroke: 5, color, center: `${pct}%` });
      });
      const grid = root.querySelector('.arch-injury-grid');
      if (grid) FX.staggerIn(grid, '.arch-injury-card', 60);
      root.querySelectorAll('.arch-injury-card.is-active').forEach(card => {
        FX.breathe(card, 0.4, { variant: 'danger' });
      });
    } else {
      // L2: timeline chart + ring per recovery di righe attive
      const all = (CS.state.infortuni || []).filter(i => normalizeParte(i.parte) === normalizeParte(fs.drillKey));
      let filtered = applyDateFilter(all, fs, 'dataInizio');
      if (fs.gravitaFilter && fs.gravitaFilter !== 'all') {
        filtered = filtered.filter(i => String(i.gravita || '').toLowerCase() === fs.gravitaFilter);
      }
      requestAnimationFrame(() => initInjuryTimelineChart(filtered));
    }
  }

  // ═══════════════════════════════════════════════════════
  //   FOCUS L1 RICCA + L2 PREMIUM
  // ═══════════════════════════════════════════════════════

  const CAT_META = {
    FISICO:  { ico: '🏋️', color: '#B45CFF', label: 'FISICO'  },
    TECNICA: { ico: '🥊', color: '#FF6B35', label: 'TECNICA' },
    MENTALE: { ico: '🧠', color: '#7C5BFF', label: 'MENTALE' },
    ALTRO:   { ico: '✨', color: '#00ff88', label: 'ALTRO'   },
  };

  function buildCatSplits(items) {
    const out = {
      giornaliero: { done: 0, total: 0 },
      settimanale: { done: 0, total: 0 },
      mensile:     { done: 0, total: 0 },
      annuale:     { done: 0, total: 0 },
    };
    items.forEach(o => {
      const s = o.scadenza;
      if (!out[s]) return;
      out[s].total++;
      if (isObiettivoDone(o)) out[s].done++;
    });
    return out;
  }

  function buildCat60dSparkline(items) {
    const vals = new Array(60).fill(0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    items.forEach(o => {
      if (!o.completed) return;
      const dStr = o.dataCompletamento || o.periodo;
      const monthKey = deriveMonthKey(dStr);
      if (!monthKey) return;
      // Estrai data approssimativa: se dStr è YYYY-MM-DD usa quella, altrimenti primo giorno mese
      const iso = /^\d{4}-\d{2}-\d{2}/.test(dStr) ? dStr.slice(0, 10) : `${monthKey}-01`;
      const d = new Date(iso);
      if (isNaN(d)) return;
      const diff = Math.floor((today - d) / 86400000);
      if (diff < 0 || diff >= 60) return;
      vals[59 - diff] += 1;
    });
    return vals;
  }

  function computeCatDelta30(items) {
    const today = Date.now();
    let curr = 0, prev = 0;
    items.forEach(o => {
      if (!o.completed) return;
      const dStr = o.dataCompletamento || o.periodo;
      if (!dStr) return;
      const monthKey = deriveMonthKey(dStr);
      if (!monthKey) return;
      const iso = /^\d{4}-\d{2}-\d{2}/.test(dStr) ? dStr.slice(0, 10) : `${monthKey}-15`;
      const d = new Date(iso);
      if (isNaN(d)) return;
      const ago = today - d.getTime();
      if (ago <= 30 * 86400000) curr++;
      else if (ago <= 60 * 86400000) prev++;
    });
    const deltaCount = curr - prev;
    const deltaPct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0);
    const dir = deltaCount > 0 ? 'up' : deltaCount < 0 ? 'down' : 'flat';
    return { curr, prev, deltaCount, deltaPct, dir };
  }

  function findNextObiettivoInCat(catItems) {
    const today = CS.todayISO();
    const future = catItems
      .filter(o => !isObiettivoDone(o) && o.periodo && o.periodo >= today.slice(0, o.periodo.length))
      .sort((a, b) => (a.periodo || '').localeCompare(b.periodo || ''));
    if (!future.length) return null;
    const obj = future[0];
    const prog = CALC.progressObiettivo ? CALC.progressObiettivo(obj) : { current: 0, pct: 0 };
    // calcola daysLeft approssimato
    const monthKey = deriveMonthKey(obj.periodo);
    const iso = /^\d{4}-\d{2}-\d{2}/.test(obj.periodo) ? obj.periodo : (monthKey ? `${monthKey}-15` : null);
    let daysLeft = null;
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d)) daysLeft = Math.max(0, Math.ceil((d - new Date(today)) / 86400000));
    }
    return { obj, daysLeft, progressCurrent: prog.current || 0, progressPct: Math.round(prog.pct || 0) };
  }

  function buildCatTrend12Months(items) {
    // Ritorna {labels, data} con ultimi 12 mesi
    const today = new Date(); today.setDate(1); today.setHours(0,0,0,0);
    const monthsBack = 12;
    const labels = [];
    const data = new Array(monthsBack).fill(0);
    const monthKeys = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'][d.getMonth()];
      labels.push(lbl);
      monthKeys.push(key);
    }
    items.forEach(o => {
      if (!o.completed) return;
      const k = deriveMonthKey(o.dataCompletamento || o.periodo);
      if (!k) return;
      const idx = monthKeys.indexOf(k);
      if (idx >= 0) data[idx]++;
    });
    // Cumulativa
    const cumul = [];
    let acc = 0;
    data.forEach(v => { acc += v; cumul.push(acc); });
    return { labels, data, cumul };
  }

  function renderCategoryCardRich(c) {
    const meta = CAT_META[c.name] || { ico: '🎯', color: '#B45CFF', label: c.name };
    const pct = Math.round(c.progress || 0);
    const splits = c.splits || {};
    const splitsHtml = ['giornaliero', 'settimanale', 'mensile', 'annuale'].map(s => {
      const o = splits[s] || { done: 0, total: 0 };
      const sPct = o.total > 0 ? Math.round((o.done / o.total) * 100) : 0;
      const lbl = s.charAt(0).toUpperCase();
      const col = progressColor(sPct);
      const visible = o.total > 0;
      return `
        <div class="arch-cat-rich-split" ${visible ? '' : 'style="opacity:0.3"'}>
          <div class="arch-cat-rich-split-bar">
            <div class="arch-cat-rich-split-fill" style="height:${visible ? sPct : 4}%;background:${col}"></div>
          </div>
          <div class="arch-cat-rich-split-label">${lbl}</div>
        </div>
      `;
    }).join('');
    const delta = c.delta || { deltaCount: 0, dir: 'flat' };
    const deltaHtml = delta.deltaCount !== 0
      ? `<span class="arch-cat-rich-delta ${delta.dir}">${delta.dir === 'up' ? '↑' : '↓'} ${Math.abs(delta.deltaCount)} vs 30gg prec</span>`
      : '<span class="arch-cat-rich-delta flat">→ stabile</span>';

    return `
      <div class="arch-cat-card-rich" data-drill-key="${escapeAttr(c.name)}" data-cat-pct="${pct}" data-cat-color="${meta.color}">
        <div class="arch-cat-rich-head">
          <div class="arch-cat-rich-headleft">
            <span class="arch-cat-rich-ico">${meta.ico}</span>
            <span class="arch-cat-rich-name" style="color:${meta.color}">${meta.label}</span>
          </div>
          <div class="arch-cat-rich-ring" data-ring-host></div>
        </div>
        <div class="arch-cat-rich-body">
          <div class="arch-cat-rich-bigwrap">
            <span class="arch-cat-rich-big" data-cup-pct>0</span><span class="arch-cat-rich-big-unit">%</span>
          </div>
          <div class="arch-cat-rich-sub">${c.done} / ${c.total} obiettivi</div>
          <div class="arch-cat-rich-splits">${splitsHtml}</div>
          <div class="arch-cat-rich-spark" data-spark-host></div>
          ${deltaHtml}
        </div>
      </div>
    `;
  }

  // ─── L2 PREMIUM ──────────────────────────────────────
  function renderFocusL2Premium(fs, catData) {
    const { category, catItems, filteredItems, done, total, pct, delta, splits, nextObj } = catData;
    const meta = CAT_META[category] || { ico: '🎯', color: '#B45CFF', label: category };
    const color = progressColor(pct);
    const pillLbl = obiettiviPillLabel(fs.pill);

    // Hero: titolo + icona + ring 80px
    const heroHtml = `
      <div class="arch-focus-l2-hero">
        <div class="arch-focus-l2-hero-left">
          <div class="arch-l2-breadcrumb">
            <a class="arch-l2-back" data-back href="#">← ${pillLbl}</a>
            <span class="arch-l2-crumb-sep">›</span>
            <span class="arch-l2-crumb-current">${meta.label}</span>
          </div>
          <h2 class="arch-l2-title"><span class="arch-focus-l2-hero-ico">${meta.ico}</span> ${meta.label}</h2>
          <div class="arch-l2-score-row">
            <span class="muted">${done} su ${total} completati</span>
          </div>
        </div>
        <div class="arch-focus-l2-hero-ring" data-ring-host data-ring-pct="${pct}" data-ring-color="${meta.color}"></div>
      </div>
    `;

    // 4 stat box
    const statsHtml = `
      <div class="arch-focus-l2-stats">
        <div class="arch-focus-l2-statbox"><div class="stat-lbl">TOTALE</div><div class="stat-val" data-cup="${total}">0</div></div>
        <div class="arch-focus-l2-statbox"><div class="stat-lbl">COMPLETATI</div><div class="stat-val" data-cup="${done}">0</div></div>
        <div class="arch-focus-l2-statbox"><div class="stat-lbl">%</div><div class="stat-val" data-cup="${pct}">0<span class="stat-unit">%</span></div></div>
        <div class="arch-focus-l2-statbox delta-${delta.dir}"><div class="stat-lbl">Δ 30GG</div><div class="stat-val">${delta.dir === 'up' ? '↑' : delta.dir === 'down' ? '↓' : '→'} <span data-cup="${Math.abs(delta.deltaCount)}">0</span></div></div>
      </div>
    `;

    // Prossimo obiettivo
    let nextHtml = '';
    if (nextObj) {
      const o = nextObj.obj;
      const dl = nextObj.daysLeft;
      const dlLbl = dl == null ? '' : (dl === 0 ? 'oggi' : dl === 1 ? 'domani' : `tra ${dl}gg`);
      nextHtml = `
        <div class="arch-focus-l2-next">
          <div class="arch-focus-l2-next-head">
            <span class="arch-focus-l2-next-lbl">PROSSIMO OBIETTIVO</span>
            ${dlLbl ? `<span class="arch-focus-l2-next-eta">${dlLbl}</span>` : ''}
          </div>
          <div class="arch-focus-l2-next-desc">${escapeHtml(o.descrizione || '—')}</div>
          <div class="arch-focus-l2-next-meta">
            ${o.target ? `<span>target <b>${o.target}</b> ${o.unita || ''}</span>` : ''}
            ${nextObj.progressCurrent ? `<span class="muted">· raggiunto ${nextObj.progressCurrent}</span>` : ''}
          </div>
          <div class="arch-focus-l2-next-bar"><div class="arch-focus-l2-next-bar-fill" style="width:${nextObj.progressPct}%"></div></div>
          <div class="arch-focus-l2-next-pct">${nextObj.progressPct}%</div>
        </div>
      `;
    } else {
      nextHtml = `
        <div class="arch-focus-l2-next arch-focus-l2-next--empty">
          <div class="arch-focus-l2-next-head">
            <span class="arch-focus-l2-next-lbl">PROSSIMO OBIETTIVO</span>
          </div>
          <div class="arch-focus-l2-next-desc muted">Nessun obiettivo futuro in questa categoria</div>
        </div>
      `;
    }

    // Breakdown G/S/M/A
    const SCAD_LBL = { giornaliero: 'GIORNALIERI', settimanale: 'SETTIMANALI', mensile: 'MENSILI', annuale: 'ANNUALI' };
    const breakdownHtml = `
      <div class="modal-section-title">BREAKDOWN PER SCADENZA</div>
      <div class="arch-focus-l2-breakdown">
        ${['giornaliero', 'settimanale', 'mensile', 'annuale'].map(s => {
          const o = splits[s] || { done: 0, total: 0 };
          const sPct = o.total > 0 ? Math.round((o.done / o.total) * 100) : 0;
          const col = progressColor(sPct);
          return `
            <div class="arch-focus-l2-breakdown-mini">
              <div class="arch-focus-l2-breakdown-head">
                <span class="arch-focus-l2-breakdown-name">${SCAD_LBL[s]}</span>
                <span class="arch-focus-l2-breakdown-count">${o.done}/${o.total}</span>
              </div>
              <div class="arch-focus-l2-breakdown-bar"><div class="arch-focus-l2-breakdown-bar-fill" style="width:${sPct}%;background:${col}"></div></div>
              <div class="arch-focus-l2-breakdown-pct" style="color:${col}">${sPct}%</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Lista per mese
    const groups = groupByMonth(filteredItems, 'periodo');
    const listHtml = `
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, renderObiettivoRow, items => {
          const d = items.filter(isObiettivoDone).length;
          return `${d}/${items.length} completati`;
        })}
      </div>
    `;

    return `
      ${heroHtml}
      ${statsHtml}
      ${nextHtml}
      ${breakdownHtml}
      ${renderDateFilters(fs)}
      ${renderStatusFilter(fs.statusFilter || 'all')}
      <div class="arch-focus-l2-trend-wrap"><canvas id="arch-focus-trend-chart"></canvas></div>
      ${listHtml}
    `;
  }

  // Hook post-render per L1 ricco + L2 premium
  function postRenderFocusL1(root) {
    root.querySelectorAll('.arch-cat-card-rich').forEach(card => {
      const pct = Number(card.dataset.catPct) || 0;
      const color = card.dataset.catColor || '#B45CFF';
      // Ring
      const ringHost = card.querySelector('[data-ring-host]');
      if (ringHost) FX.ringProgress(ringHost, pct, { size: 56, stroke: 5, color, center: `${pct}%` });
      // CountUp %
      const bigEl = card.querySelector('[data-cup-pct]');
      if (bigEl) FX.countUp(bigEl, 0, pct, 700, { decimals: 0 });
      // Sparkline
      const sparkHost = card.querySelector('[data-spark-host]');
      const drillKey = card.dataset.drillKey;
      if (sparkHost && drillKey) {
        // Recalcola lista items per categoria
        const all = getObiettiviForPill(filterState.focus.pill);
        const catItems = all.filter(o => categorizeObiettivo(o) === drillKey);
        const vals = buildCat60dSparkline(catItems);
        FX.drawSparkline(sparkHost, vals, {
          height: 28,
          color,
          fill: 'rgba(180,92,255,0.12)',
        });
      }
      // Breathe per pct basso
      if (pct < 30) {
        const total = (() => {
          const sub = card.querySelector('.arch-cat-rich-sub');
          if (!sub) return 0;
          const m = sub.textContent.match(/\/\s*(\d+)/);
          return m ? Number(m[1]) : 0;
        })();
        if (total >= 3) FX.breathe(card, 0.4, { variant: 'warn' });
      }
    });
    const grid = root.querySelector('.arch-cat-grid');
    if (grid) FX.staggerIn(grid, '.arch-cat-card-rich, .arch-cat-card--total', 60);
  }

  function postRenderFocusL2(root, fs, catData) {
    // Hero ring 80px
    const ringHost = root.querySelector('.arch-focus-l2-hero-ring');
    if (ringHost) {
      const pct = Number(ringHost.dataset.ringPct) || 0;
      const color = ringHost.dataset.ringColor || '#B45CFF';
      FX.ringProgress(ringHost, pct, { size: 80, stroke: 7, color, center: `${pct}%` });
    }
    // countUp 4 stat box + altri data-cup
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      FX.countUp(el, 0, target, 700, { decimals: 0 });
    });
    // Breathe sul next obj se presente
    const nextCard = root.querySelector('.arch-focus-l2-next:not(.arch-focus-l2-next--empty)');
    if (nextCard) FX.breathe(nextCard, 0.3, { variant: 'neon' });
    // GlowBurst sul breadcrumb back
    const back = root.querySelector('.arch-l2-back');
    if (back) setTimeout(() => FX.glowBurst(back, 'var(--neon)'), 150);
    // Chart trend
    if (catData) {
      const tr = buildCatTrend12Months(catData.catItems);
      requestAnimationFrame(() => initObiettiviTrendChart(tr));
    }
  }

  function initObiettiviTrendChart(tr) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-focus-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !tr || !tr.labels.length) return;

    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: tr.labels,
        datasets: [
          {
            type: 'bar',
            label: 'Completati nel mese',
            data: tr.data,
            backgroundColor: 'rgba(180,92,255,0.35)',
            borderColor: '#B45CFF',
            borderWidth: 1,
            borderRadius: 4,
            order: 2,
          },
          {
            type: 'line',
            label: 'Cumulativa',
            data: tr.cumul,
            borderColor: '#00ff88',
            backgroundColor: 'rgba(0,255,136,0.12)',
            tension: 0.3,
            fill: false,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#00ff88',
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 } },
          },
          y: {
            beginAtZero: true,
            ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            ticks: { color: 'rgba(0,255,136,0.55)', font: { family: 'JetBrains Mono', size: 10 }, precision: 0 },
            grid: { display: false },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: 'rgba(245,245,247,0.65)', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 12, padding: 12 },
          },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
          },
        },
        animation: { duration: 700, easing: 'easeInOutQuart' },
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //   ARCHIVIO/FISICA/VOLUME — drill L1/L2 per tipo (flessioni/squat/addominali)
  // ═══════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════
  //  FISICA v5 — pesate / pasti / corse / sonno (shared helpers)
  // ═══════════════════════════════════════════════════════

  // Period filter per le 4 sub-pagine fisica: 30GG | YTD | TUTTO
  function getFisicaPeriodRange(period) {
    const today = new Date(); today.setHours(0,0,0,0);
    const end = CS.isoDateOnly(today);
    if (period === 'YTD') {
      return { start: `${today.getFullYear()}-01-01`, end };
    }
    if (period === 'TUTTO') {
      return { start: '', end: '' };
    }
    // 30GG default
    const start = new Date(today); start.setDate(today.getDate() - 30);
    return { start: CS.isoDateOnly(start), end };
  }

  function filterByPeriod(items, period, dateField) {
    const { start, end } = getFisicaPeriodRange(period);
    if (!start && !end) return [...items];
    return items.filter(it => {
      const d = it[dateField] || '';
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  // Period switcher pill bar: 30GG | YTD | TUTTO
  function renderFisicaPeriodSwitcher(period) {
    const opts = [
      { id: '30GG',  label: '30 GIORNI' },
      { id: 'YTD',   label: 'ANNO IN CORSO' },
      { id: 'TUTTO', label: 'TUTTO' },
    ];
    return `
      <div class="arch-fis-period-bar">
        ${opts.map(o => `<button class="vota-pill arch-fis-period-pill ${o.id === period ? 'active' : ''}" data-fperiod="${o.id}">${o.label}</button>`).join('')}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════
  //  PESATE — L1 ricca, no drill (hero ring + chart line + accordion mese)
  // ═══════════════════════════════════════════════════════

  function buildPesateAggregate(items) {
    if (!items || !items.length) return { count: 0, min: 0, max: 0, avg: 0, first: 0, last: 0, deltaTotale: 0 };
    const kgs = items.map(p => Number(p.kg)).filter(n => !isNaN(n));
    const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const first = Number(sorted[0].kg) || 0;
    const last  = Number(sorted[sorted.length - 1].kg) || 0;
    return {
      count: items.length,
      min: Math.min(...kgs),
      max: Math.max(...kgs),
      avg: kgs.reduce((s, n) => s + n, 0) / kgs.length,
      first, last,
      deltaTotale: last - first,
    };
  }

  function buildPesateSparkline60d() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vals = new Array(60).fill(null);
    (CS.state.pesate || []).forEach(p => {
      if (!p.data) return;
      const d = new Date(p.data);
      if (isNaN(d)) return;
      const diff = Math.floor((today - d) / 86400000);
      if (diff < 0 || diff >= 60) return;
      vals[59 - diff] = Number(p.kg) || null;
    });
    // forward-fill per riempire i gap nello sparkline
    let lastV = null;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) vals[i] = lastV != null ? lastV : 0;
      else lastV = vals[i];
    }
    return vals;
  }

  function renderPesateOverview(fs) {
    const all = (CS.state.pesate || []).filter(p => p.data && !isNaN(Number(p.kg)));
    const target = Number(CS.state.profile && CS.state.profile.pesoTarget) || 0;
    const lastP = [...all].sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
    const lastKg = lastP ? Number(lastP.kg) : 0;
    const trend7 = (CALC.pesoTrend7gg && CALC.pesoTrend7gg()) || 0;

    // % verso target: 100 se sul target, scende man mano che ci si allontana
    const distance = target > 0 ? Math.abs(lastKg - target) : 0;
    const ringPct = target > 0 ? Math.max(0, 100 - Math.min(100, distance * 10)) : 0;
    const ringColor = ringPct >= 80 ? '#00FF88' : ringPct >= 50 ? '#B45CFF' : '#FF9A3D';

    // delta direction vs target: rosso se ci si allontana dal target, verde se ci si avvicina
    const towardTarget = target > 0 ? (
      (lastKg > target && trend7 < 0) || (lastKg < target && trend7 > 0)
    ) : false;
    const trendDir = Math.abs(trend7) < 0.05 ? 'flat' : towardTarget ? 'up' : 'down';
    const trendArrow = trend7 > 0.05 ? '↑' : trend7 < -0.05 ? '↓' : '→';

    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(all, period, 'data');
    const aggP = buildPesateAggregate(periodItems);
    const groups = groupByMonth(periodItems, 'data');

    const distLabel = target > 0
      ? (lastKg > target
          ? `Target: <b>${target} kg</b> · <span style="color:#FF9A3D">−${distance.toFixed(1)} kg</span> da scendere`
          : lastKg < target
            ? `Target: <b>${target} kg</b> · <span style="color:#B45CFF">+${distance.toFixed(1)} kg</span> da salire`
            : `Target: <b>${target} kg</b> · <span style="color:#00FF88">raggiunto</span>`)
      : `Imposta peso target nel profilo`;

    return `
      <div class="archive-results-head">PESATE · ${all.length} totali</div>

      <div class="arch-pes-hero">
        <div class="arch-pes-hero-ring" data-pes-ring data-pct="${ringPct}" data-color="${ringColor}"></div>
        <div class="arch-pes-hero-body">
          <div class="arch-pes-hero-num" data-cup="${lastKg}" data-decimals="1">0<span class="arch-pes-hero-unit">kg</span></div>
          <div class="arch-pes-hero-sub">peso attuale${lastP ? ` · ${CS.fmtDate(lastP.data, { long: true })}` : ''}</div>
          <div class="arch-pes-hero-delta ${trendDir}">${trendArrow} ${Math.abs(trend7).toFixed(1)} kg <span class="muted">vs 7gg fa</span></div>
          <div class="arch-pes-hero-target">${distLabel}</div>
        </div>
      </div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">MIN PERIODO</div>
          <div class="stat-val" data-cup="${aggP.min || 0}" data-decimals="1">0<span class="stat-unit">kg</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">MAX PERIODO</div>
          <div class="stat-val" data-cup="${aggP.max || 0}" data-decimals="1">0<span class="stat-unit">kg</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">MEDIA PERIODO</div>
          <div class="stat-val" data-cup="${aggP.avg || 0}" data-decimals="1">0<span class="stat-unit">kg</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">VARIAZIONE</div>
          <div class="stat-val ${aggP.deltaTotale > 0 ? 'is-up' : aggP.deltaTotale < 0 ? 'is-down' : ''}" data-cup="${aggP.deltaTotale}" data-decimals="1" data-sign="1">0<span class="stat-unit">kg</span></div>
        </div>
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-pes-target="${target}"></canvas></div>

      ${renderDateFilters(fs)}

      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, p => renderPesataRow(p, aggP.avg, target), items => {
          const kgs = items.map(x => Number(x.kg)).filter(n => !isNaN(n));
          const mAvg = kgs.length ? kgs.reduce((s, n) => s + n, 0) / kgs.length : 0;
          return `${items.length} pesate · media ${mAvg.toFixed(1)} kg`;
        })}
      </div>
    `;
  }

  function renderPesataRow(p, monthAvg, target) {
    const kg = Number(p.kg) || 0;
    let kgClass = 'is-stable';
    if (target > 0) {
      kgClass = kg > target + 0.2 ? 'is-over' : kg < target - 0.2 ? 'is-under' : 'is-target';
    }
    const deltaMonth = monthAvg ? kg - monthAvg : 0;
    const deltaTxt = monthAvg
      ? `<span class="muted">${deltaMonth > 0 ? '+' : ''}${deltaMonth.toFixed(1)} vs media mese</span>`
      : '';
    const note = (p.note || '').trim();
    return `
      <div class="arch-l2-row arch-pes-row">
        <span class="arch-l2-row-date">${CS.fmtDate(p.data, { long: true })}</span>
        <span class="arch-l2-row-mid">
          <span class="arch-pes-row-kg ${kgClass}">${kg.toFixed(1)}</span>
          <span class="arch-pes-row-unit">kg</span>
          ${deltaTxt}
        </span>
        ${note ? `<div class="arch-row-note">${escapeHtml(note.slice(0, 120))}</div>` : ''}
      </div>
    `;
  }

  function initPesateLineChart(items, target) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const labels = sorted.map(r => CS.fmtDate(r.data, { short: true }));
    const data = sorted.map(r => Number(r.kg) || 0);
    const targetData = target > 0 ? sorted.map(() => target) : [];
    const datasets = [{
      label: 'Peso',
      data,
      borderColor: '#B45CFF',
      backgroundColor: 'rgba(180,92,255,0.12)',
      borderWidth: 2,
      tension: 0.25,
      pointRadius: 3,
      pointBackgroundColor: '#B45CFF',
      fill: true,
    }];
    if (targetData.length) {
      datasets.push({
        label: 'Target',
        data: targetData,
        borderColor: 'rgba(0,255,136,0.6)',
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      });
    }
    archiveChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 } },
          },
        },
        plugins: {
          legend: { display: targetData.length > 0, labels: { color: 'rgba(245,245,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kg` },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function postRenderPesate(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    // countUp per tutti i numeri
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      const sign = el.dataset.sign === '1';
      FX.countUp(el, 0, target, 700, { decimals, prefix: sign && target > 0 ? '+' : '' });
    });
    // Ring percentuale verso target
    const ringHost = root.querySelector('[data-pes-ring]');
    if (ringHost) {
      const pct = Number(ringHost.dataset.pct) || 0;
      const color = ringHost.dataset.color || '#B45CFF';
      FX.ringProgress(ringHost, pct, { size: 120, stroke: 8, color, trackColor: 'rgba(255,255,255,0.08)' });
    }
    // Chart line peso vs target
    const all = (CS.state.pesate || []).filter(p => p.data && !isNaN(Number(p.kg)));
    const period = fs.period || 'YTD';
    let items = filterByPeriod(all, period, 'data');
    if (fs.dateFrom) items = items.filter(r => (r.data || '') >= fs.dateFrom);
    if (fs.dateTo)   items = items.filter(r => (r.data || '') <= fs.dateTo);
    const target = Number(CS.state.profile && CS.state.profile.pesoTarget) || 0;
    requestAnimationFrame(() => initPesateLineChart(items, target));
  }

  // ═══════════════════════════════════════════════════════
  //  SONNO — L1 ricca, no drill (hero ring + heatmap + chart bar + accordion)
  // ═══════════════════════════════════════════════════════

  function buildSonnoAggregate(items, targetH) {
    if (!items || !items.length) return { count: 0, avgOre: 0, avgQual: 0, sottoTarget: 0, debito: 0, min: 0, max: 0 };
    const ore = items.map(s => Number(s.ore)).filter(n => !isNaN(n) && n > 0);
    const qual = items.map(s => Number(s.qualita)).filter(n => !isNaN(n) && n > 0);
    const sottoTarget = items.filter(s => (Number(s.ore) || 0) < targetH).length;
    const debito = items.reduce((sum, s) => {
      const o = Number(s.ore) || 0;
      return sum + Math.max(0, targetH - o);
    }, 0);
    return {
      count: items.length,
      avgOre: ore.length ? ore.reduce((s, n) => s + n, 0) / ore.length : 0,
      avgQual: qual.length ? qual.reduce((s, n) => s + n, 0) / qual.length : 0,
      sottoTarget,
      debito,
      min: ore.length ? Math.min(...ore) : 0,
      max: ore.length ? Math.max(...ore) : 0,
    };
  }

  function build365SonnoHeatmap(targetH) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sMap = new Map();
    (CS.state.sonno || []).forEach(s => { if (s.data) sMap.set(s.data, s); });
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = CS.isoDateOnly(d);
      const s = sMap.get(iso);
      const ore = s ? (Number(s.ore) || 0) : 0;
      const qual = s ? (Number(s.qualita) || 0) : 0;
      // intensity sonno: 0=no data, 1=<6h, 2=6-7h, 3=7-8h, 4=≥target
      let intensity = 0;
      if (ore > 0) {
        if (ore < 6) intensity = 1;
        else if (ore < 7) intensity = 2;
        else if (ore < targetH) intensity = 3;
        else intensity = 4;
      }
      out.push({ iso, ore, qual, intensity });
    }
    return out;
  }

  function sonnoOreClass(h, targetH) {
    if (!h || h <= 0) return 'is-stable';
    if (h >= targetH) return 'is-over';
    if (h >= targetH - 1) return 'is-target';
    return 'is-under';
  }

  function renderSonnoStars(q) {
    const n = Math.max(0, Math.min(5, Math.round(Number(q) || 0)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function renderSonnoOverview(fs) {
    const targetH = Number(CS.state.criteriOro && CS.state.criteriOro.sonnoTargetH) || 8;
    const all = (CS.state.sonno || []).filter(s => s.data && Number(s.ore) >= 0);
    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(all, period, 'data');
    const aggP = buildSonnoAggregate(periodItems, targetH);

    const ringPct = targetH > 0 ? Math.min(100, (aggP.avgOre / targetH) * 100) : 0;
    const ringColor = ringPct >= 95 ? '#00FF88' : ringPct >= 75 ? '#B45CFF' : '#FF9A3D';

    const days365 = build365SonnoHeatmap(targetH);
    const groups = groupByMonth(periodItems, 'data');

    return `
      <div class="archive-results-head">SONNO · ${all.length} notti tracciate</div>

      <div class="arch-son-hero">
        <div class="arch-son-hero-ring" data-son-ring data-pct="${ringPct.toFixed(0)}" data-color="${ringColor}"></div>
        <div class="arch-son-hero-body">
          <div class="arch-son-hero-num" data-cup="${aggP.avgOre}" data-decimals="1">0<span class="arch-son-hero-unit">h</span></div>
          <div class="arch-son-hero-sub">media periodo · target ${targetH}h</div>
          <div class="arch-son-hero-qual">Qualità media: <b>${aggP.avgQual.toFixed(1)}</b><span class="muted">/5</span> <span class="arch-son-quality-stars">${renderSonnoStars(aggP.avgQual)}</span></div>
        </div>
      </div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">ORE MEDIE</div>
          <div class="stat-val" data-cup="${aggP.avgOre}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">QUALITÀ</div>
          <div class="stat-val" data-cup="${aggP.avgQual}" data-decimals="1">0<span class="stat-unit">/5</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">NOTTI SOTTO TARGET</div>
          <div class="stat-val ${aggP.sottoTarget > 0 ? 'is-up' : ''}" data-cup="${aggP.sottoTarget}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">DEBITO SONNO</div>
          <div class="stat-val ${aggP.debito > 0 ? 'is-up' : ''}" data-cup="${aggP.debito}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="archive-results-head" style="margin-top:var(--sp-4)">ULTIMI 365 GIORNI</div>
      <div class="streak-heat-wrap arch-son-heat-wrap">
        <div class="streak-heat-grid">
          ${days365.map(d => `<div class="streak-heat-cell arch-son-heat-cell" data-intensity="${d.intensity}" title="${d.iso}${d.ore > 0 ? ` · ${d.ore.toFixed(1)}h${d.qual ? ` · qualità ${d.qual}/5` : ''}` : ' · nessun dato'}"></div>`).join('')}
        </div>
        <div class="streak-heat-legend">
          <span class="muted">&lt;6h</span>
          <div class="streak-heat-cell arch-son-heat-cell" data-intensity="1"></div>
          <div class="streak-heat-cell arch-son-heat-cell" data-intensity="2"></div>
          <div class="streak-heat-cell arch-son-heat-cell" data-intensity="3"></div>
          <div class="streak-heat-cell arch-son-heat-cell" data-intensity="4"></div>
          <span class="muted">${targetH}h+</span>
        </div>
      </div>

      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-son-target="${targetH}"></canvas></div>

      ${renderDateFilters(fs)}

      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, s => renderSonnoRow(s, targetH), items => {
          const ore = items.map(x => Number(x.ore)).filter(n => !isNaN(n) && n > 0);
          const mAvg = ore.length ? ore.reduce((s, n) => s + n, 0) / ore.length : 0;
          return `${items.length} notti · media ${mAvg.toFixed(1)}h`;
        })}
      </div>
    `;
  }

  function renderSonnoRow(s, targetH) {
    const ore = Number(s.ore) || 0;
    const kls = sonnoOreClass(ore, targetH);
    const stars = renderSonnoStars(s.qualita);
    const note = (s.note || '').trim();
    return `
      <div class="arch-l2-row arch-son-row">
        <span class="arch-l2-row-date">${CS.fmtDate(s.data, { long: true })}</span>
        <span class="arch-l2-row-mid">
          <span class="arch-son-row-ore ${kls}">${ore.toFixed(1)}</span>
          <span class="arch-son-row-unit">h</span>
          <span class="arch-son-row-stars">${stars}</span>
        </span>
        ${note ? `<div class="arch-row-note">${escapeHtml(note.slice(0, 120))}</div>` : ''}
      </div>
    `;
  }

  function initSonnoBarChart(items, targetH) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const labels = sorted.map(r => CS.fmtDate(r.data, { short: true }));
    const data = sorted.map(r => Number(r.ore) || 0);
    const qualData = sorted.map(r => Number(r.qualita) || 0);
    const colors = data.map(h => h >= targetH ? '#00FF88' : h >= targetH - 1 ? '#B45CFF' : '#FF9A3D');
    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ore sonno',
          data,
          backgroundColor: colors.map(c => c + '55'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        }, {
          type: 'line',
          label: 'Target',
          data: sorted.map(() => targetH),
          borderColor: 'rgba(0,255,136,0.55)',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 } } },
        },
        plugins: {
          legend: { display: true, labels: { color: 'rgba(245,245,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => ctx.dataset.label === 'Target'
                ? `Target: ${ctx.parsed.y}h`
                : `Sonno: ${ctx.parsed.y.toFixed(1)}h${qualData[ctx.dataIndex] ? ` · qualità ${qualData[ctx.dataIndex]}/5` : ''}`,
            },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function postRenderSonno(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      FX.countUp(el, 0, target, 700, { decimals });
    });
    const ringHost = root.querySelector('[data-son-ring]');
    if (ringHost) {
      const pct = Number(ringHost.dataset.pct) || 0;
      const color = ringHost.dataset.color || '#B45CFF';
      FX.ringProgress(ringHost, pct, { size: 120, stroke: 8, color, trackColor: 'rgba(255,255,255,0.08)' });
    }
    const targetH = Number(CS.state.criteriOro && CS.state.criteriOro.sonnoTargetH) || 8;
    const all = (CS.state.sonno || []).filter(s => s.data);
    const period = fs.period || 'YTD';
    let items = filterByPeriod(all, period, 'data');
    if (fs.dateFrom) items = items.filter(r => (r.data || '') >= fs.dateFrom);
    if (fs.dateTo)   items = items.filter(r => (r.data || '') <= fs.dateTo);
    requestAnimationFrame(() => initSonnoBarChart(items, targetH));
  }

  // ═══════════════════════════════════════════════════════
  //  CORSE — L1 grid card per tipo + L2 storico per tipo
  // ═══════════════════════════════════════════════════════

  const CORSA_TIPI = [
    { key: 'lenta',    label: 'LENTA',     icon: '🚶', color: '#00FF88' },
    { key: 'medio',    label: 'MEDIO',     icon: '🏃', color: '#B45CFF' },
    { key: 'veloce',   label: 'VELOCE',    icon: '⚡', color: '#FF9A3D' },
    { key: 'interval', label: 'INTERVAL',  icon: '🔁', color: '#FF4757' },
    { key: 'lunga',    label: 'LUNGA',     icon: '🛣',  color: '#9aa3b8' },
    { key: 'altro',    label: 'ALTRO',     icon: '👟', color: '#888' },
  ];

  function normalizeCorsaTipo(t) {
    const s = String(t || '').toLowerCase().trim();
    if (!s) return 'altro';
    if (/lent/.test(s)) return 'lenta';
    if (/medi/.test(s)) return 'medio';
    if (/veloc|sprint/.test(s)) return 'veloce';
    if (/fartlek|interv/.test(s)) return 'interval';
    if (/lung/.test(s)) return 'lunga';
    // exact match con key
    const found = CORSA_TIPI.find(x => x.key === s);
    if (found) return found.key;
    return 'altro';
  }

  function getCorseOfType(tipo) {
    return (CS.state.corsa || []).filter(c => normalizeCorsaTipo(c.tipo) === tipo);
  }

  function buildCorseAggregate(items) {
    if (!items || !items.length) return { count: 0, kmTot: 0, durataTot: 0, paceAvg: null, kmMax: 0, kmAvg: 0, fcAvg: 0 };
    const kmTot = items.reduce((s, c) => s + (Number(c.km) || 0), 0);
    const durataTot = items.reduce((s, c) => s + (Number(c.durataMin) || 0), 0);
    const fcVals = items.map(c => Number(c.fcMedia)).filter(n => !isNaN(n) && n > 0);
    const paceDec = kmTot > 0 ? durataTot / kmTot : 0;
    const paceMin = Math.floor(paceDec);
    const paceSec = Math.round((paceDec - paceMin) * 60);
    return {
      count: items.length,
      kmTot,
      durataTot,
      paceAvg: paceDec > 0 ? { min: paceMin, sec: paceSec, decMin: paceDec, formatted: `${paceMin}:${String(paceSec).padStart(2, '0')}` } : null,
      kmMax: Math.max(...items.map(c => Number(c.km) || 0)),
      kmAvg: kmTot / items.length,
      fcAvg: fcVals.length ? fcVals.reduce((s, n) => s + n, 0) / fcVals.length : 0,
    };
  }

  function buildCorseSparkline60d(tipo) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vals = new Array(60).fill(0);
    getCorseOfType(tipo).forEach(c => {
      if (!c.data) return;
      const d = new Date(c.data);
      if (isNaN(d)) return;
      const diff = Math.floor((today - d) / 86400000);
      if (diff < 0 || diff >= 60) return;
      vals[59 - diff] += Number(c.km) || 0;
    });
    return vals;
  }

  function computeCorseDelta30(tipo) {
    const now = Date.now();
    let curr = 0, prev = 0;
    getCorseOfType(tipo).forEach(c => {
      const km = Number(c.km) || 0;
      if (km <= 0 || !c.data) return;
      const ago = now - new Date(c.data).getTime();
      if (ago <= 30 * 86400000) curr += km;
      else if (ago <= 60 * 86400000) prev += km;
    });
    const deltaKm = curr - prev;
    const dir = deltaKm > 0.1 ? 'up' : deltaKm < -0.1 ? 'down' : 'flat';
    return { curr, prev, deltaKm, dir };
  }

  function renderCorseListL1(fs) {
    const all = (CS.state.corsa || []).filter(c => c.data);
    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(all, period, 'data');

    // Aggregati globali
    const aggG = buildCorseAggregate(periodItems);
    const targetKmSett = Number(CS.state.targetSett && CS.state.targetSett.kmCorsa) || 20;
    // km/sett media: km tot / num settimane nel periodo
    const periodDays = period === 'YTD'
      ? Math.max(1, Math.ceil((Date.now() - new Date(`${new Date().getFullYear()}-01-01`).getTime()) / 86400000))
      : period === 'TUTTO'
        ? (periodItems.length ? Math.max(1, Math.ceil((Date.now() - new Date(periodItems[periodItems.length - 1].data).getTime()) / 86400000)) : 1)
        : 30;
    const kmSettAvg = (aggG.kmTot / periodDays) * 7;
    const kmSettPct = Math.min(150, (kmSettAvg / targetKmSett) * 100);

    // Card per tipo (filter count>0)
    const tipi = CORSA_TIPI.map(t => {
      const items = getCorseOfType(t.key).filter(c => {
        if (!c.data) return false;
        const { start, end } = getFisicaPeriodRange(period);
        if (start && c.data < start) return false;
        if (end && c.data > end) return false;
        return true;
      });
      return { ...t, items, agg: buildCorseAggregate(items), delta: computeCorseDelta30(t.key) };
    }).filter(t => t.items.length > 0);

    return `
      <div class="archive-results-head">CORSE · ${all.length} totali</div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">KM TOTALI</div>
          <div class="stat-val" data-cup="${aggG.kmTot}" data-decimals="1">0<span class="stat-unit">km</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">N. CORSE</div>
          <div class="stat-val" data-cup="${aggG.count}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">PACE MEDIO</div>
          <div class="stat-val">${aggG.paceAvg ? aggG.paceAvg.formatted : '—'}<span class="stat-unit">/km</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">KM/SETT</div>
          <div class="stat-val" data-cup="${kmSettAvg}" data-decimals="1">0<span class="stat-unit">km</span></div>
        </div>
      </div>

      <div class="arch-cat-card arch-cor-progress-target">
        <div class="arch-cat-card-row">
          <span class="arch-cat-card-name">PROGRESSO SETTIMANALE</span>
          <span class="arch-cat-card-score" style="color:${kmSettPct >= 100 ? '#00FF88' : '#B45CFF'}">${Math.round(kmSettPct)}%</span>
        </div>
        <div class="arch-cat-card-sub">${kmSettAvg.toFixed(1)} km/sett · target ${targetKmSett} km</div>
        <div class="arch-cat-card-bar">
          <div class="arch-cat-card-bar-fill" style="width:${Math.min(100, kmSettPct)}%;background:${kmSettPct >= 100 ? '#00FF88' : '#B45CFF'}"></div>
        </div>
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="arch-cat-grid arch-cor-grid">
        ${tipi.length
          ? tipi.map(renderCorsaCard).join('')
          : '<div class="empty-state"><div class="empty-text">Nessuna corsa nel periodo</div></div>'}
      </div>
    `;
  }

  function renderCorsaCard(t) {
    const dir = t.delta.dir;
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const deltaLbl = Math.abs(t.delta.deltaKm) > 0.1
      ? `${arrow} ${Math.abs(t.delta.deltaKm).toFixed(1)} km vs 30gg prec`
      : '→ stabile';
    const paceTxt = t.agg.paceAvg ? `pace ${t.agg.paceAvg.formatted}/km` : '—';
    return `
      <div class="arch-cat-card arch-cor-card" data-drill-key="${t.key}" data-cor-key="${t.key}" data-cor-color="${t.color}">
        <div class="arch-cat-card-row">
          <div class="arch-cor-card-head">
            <span class="arch-cor-card-ico">${t.icon}</span>
            <span class="arch-cat-card-name" style="color:${t.color}">${t.label}</span>
          </div>
          <div class="arch-cat-card-score" style="color:${t.color}" data-cup="${t.agg.kmTot}" data-decimals="1">0<span class="arch-cor-card-unit">km</span></div>
        </div>
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-sub">${t.agg.count} corse · ${paceTxt}</div>
          <span class="arch-cat-delta ${dir}">${deltaLbl}</span>
        </div>
        <div class="arch-cor-card-spark" data-cor-spark></div>
      </div>
    `;
  }

  function renderCorseDetailL2(fs) {
    const tipo = fs.drillKey;
    const t = CORSA_TIPI.find(x => x.key === tipo);
    if (!t) return '<div class="empty-state"><div class="empty-text">Tipo non valido</div></div>';

    const allItems = getCorseOfType(tipo);
    let filtered = allItems;
    if (fs.dateFrom) filtered = filtered.filter(c => (c.data || '') >= fs.dateFrom);
    if (fs.dateTo)   filtered = filtered.filter(c => (c.data || '') <= fs.dateTo);

    const agg = buildCorseAggregate(filtered);
    const longest = filtered.reduce((m, c) => (Number(c.km) || 0) > m ? Number(c.km) : m, 0);
    const groups = groupByMonth(filtered, 'data');

    const headerExtra = filtered.length
      ? `<span class="muted">${filtered.length} corse${fs.dateFrom || fs.dateTo ? ' nel periodo' : ' · tutto'}</span>`
      : '<span class="muted">nessuna corsa nel periodo</span>';

    return `
      ${renderL2Header('CORSE', `${t.icon} ${t.label}`, agg.kmTot.toFixed(1), ' km', t.color, headerExtra)}
      <div class="arch-injury-stats-row arch-injury-stats-l2">
        <div class="arch-injury-stat-mini"><div class="stat-lbl">KM TOTALI</div><div class="stat-val" data-cup="${agg.kmTot}" data-decimals="1">0<span class="stat-unit">km</span></div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">N. CORSE</div><div class="stat-val" data-cup="${agg.count}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">PACE MEDIO</div><div class="stat-val">${agg.paceAvg ? agg.paceAvg.formatted : '—'}<span class="stat-unit">/km</span></div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">PIÙ LUNGA</div><div class="stat-val" data-cup="${longest}" data-decimals="1">0<span class="stat-unit">km</span></div></div>
      </div>
      ${renderDateFilters(fs)}
      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-cor-key="${tipo}" data-cor-color="${t.color}"></canvas></div>
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, c => renderCorsaRow(c, t), items => {
          const km = items.reduce((s, c) => s + (Number(c.km) || 0), 0);
          return `${items.length} corse · ${km.toFixed(1)} km`;
        })}
      </div>
    `;
  }

  function renderCorsaRow(c, t) {
    const km = Number(c.km) || 0;
    const dur = Number(c.durataMin) || 0;
    const pace = CALC.corsaPace ? CALC.corsaPace(km, dur) : null;
    const fc = Number(c.fcMedia) || 0;
    const note = (c.note || '').trim();
    return `
      <div class="arch-l2-row arch-cor-row">
        <span class="arch-l2-row-date">${CS.fmtDate(c.data, { long: true })}</span>
        <span class="arch-l2-row-mid">
          <span class="arch-cor-row-km" style="color:${t.color}">${km.toFixed(1)}</span>
          <span class="arch-cor-row-unit">km</span>
          <span class="muted"> · ${dur} min</span>
          ${pace ? `<span class="arch-cor-row-pace">pace ${pace.formatted}/km</span>` : ''}
          ${fc > 0 ? `<span class="arch-cor-row-fc muted">FC ${fc}</span>` : ''}
        </span>
        ${note ? `<div class="arch-row-note">${escapeHtml(note.slice(0, 120))}</div>` : ''}
      </div>
    `;
  }

  function initCorseDualChart(items, color) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const labels = sorted.map(r => CS.fmtDate(r.data, { short: true }));
    const kmData = sorted.map(r => Number(r.km) || 0);
    const paceData = sorted.map(r => {
      const km = Number(r.km) || 0;
      const dur = Number(r.durataMin) || 0;
      return km > 0 ? dur / km : null;
    });
    archiveChart = new Chart(canvas, {
      data: {
        labels,
        datasets: [{
          type: 'bar',
          label: 'Km',
          data: kmData,
          backgroundColor: color + '55',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        }, {
          type: 'line',
          label: 'Pace (min/km)',
          data: paceData,
          borderColor: 'rgba(0,255,136,0.8)',
          backgroundColor: 'rgba(0,255,136,0.15)',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 3,
          pointBackgroundColor: '#00FF88',
          yAxisID: 'y1',
          fill: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: color, font: { family: 'JetBrains Mono', size: 10 } }, title: { display: true, text: 'Km', color: color, font: { family: 'JetBrains Mono', size: 10 } } },
          y1: { beginAtZero: false, position: 'right', grid: { display: false }, ticks: { color: 'rgba(0,255,136,0.9)', font: { family: 'JetBrains Mono', size: 10 } }, title: { display: true, text: 'min/km', color: 'rgba(0,255,136,0.9)', font: { family: 'JetBrains Mono', size: 10 } }, reverse: true },
        },
        plugins: {
          legend: { display: true, labels: { color: 'rgba(245,245,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: color,
            bodyColor: '#F5F5F7',
            borderColor: color + '66',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => {
                if (ctx.dataset.label === 'Km') return `${ctx.parsed.y.toFixed(1)} km`;
                if (ctx.parsed.y == null) return 'pace: —';
                const m = Math.floor(ctx.parsed.y);
                const s = Math.round((ctx.parsed.y - m) * 60);
                return `pace ${m}:${String(s).padStart(2, '0')}/km`;
              },
            },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function postRenderCorse(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      FX.countUp(el, 0, target, 700, { decimals });
    });
    if (!fs.drillKey) {
      // L1: sparkline per ogni card + stagger
      root.querySelectorAll('.arch-cor-card').forEach(card => {
        const key = card.dataset.corKey;
        const color = card.dataset.corColor || '#B45CFF';
        const host = card.querySelector('[data-cor-spark]');
        if (host && key) {
          const vals = buildCorseSparkline60d(key);
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          FX.drawSparkline(host, vals, { height: 36, color, fill: `rgba(${r},${g},${b},0.18)` });
        }
      });
      const grid = root.querySelector('.arch-cor-grid');
      if (grid) FX.staggerIn(grid, '.arch-cor-card', 80);
    } else {
      const t = CORSA_TIPI.find(x => x.key === fs.drillKey);
      if (!t) return;
      let items = getCorseOfType(fs.drillKey);
      if (fs.dateFrom) items = items.filter(c => (c.data || '') >= fs.dateFrom);
      if (fs.dateTo)   items = items.filter(c => (c.data || '') <= fs.dateTo);
      requestAnimationFrame(() => initCorseDualChart(items, t.color));
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PASTI — L1 macro + card per tipo, L2 storico+top alimenti
  // ═══════════════════════════════════════════════════════

  const PASTO_TIPI = [
    { key: 'colazione', label: 'COLAZIONE', icon: '☕', color: '#B45CFF' },
    { key: 'pranzo',    label: 'PRANZO',    icon: '🍝', color: '#FF9A3D' },
    { key: 'cena',      label: 'CENA',      icon: '🍽',  color: '#00FF88' },
    { key: 'spuntino',  label: 'SPUNTINO',  icon: '🥨', color: '#9aa3b8' },
    { key: 'altro',     label: 'ALTRO',     icon: '🍴', color: '#666' },
  ];

  function normalizePastoTipo(t) {
    const s = String(t || '').toLowerCase().trim();
    if (!s) return 'altro';
    if (/colaz|breakfast/.test(s)) return 'colazione';
    if (/pranz|lunch/.test(s)) return 'pranzo';
    if (/cen|dinner/.test(s)) return 'cena';
    if (/spunt|snack|merend/.test(s)) return 'spuntino';
    const found = PASTO_TIPI.find(x => x.key === s);
    if (found) return found.key;
    return 'altro';
  }

  function getPastiOfType(tipo) {
    return (CS.state.pasti || []).filter(p => normalizePastoTipo(p.tipo) === tipo);
  }

  function sumPastoKcal(p) {
    return (p.alimenti || []).reduce((s, a) => s + (Number(a.kcal) || 0), 0);
  }
  function sumPastoMacros(p) {
    const out = { pro: 0, carb: 0, fat: 0 };
    (p.alimenti || []).forEach(a => {
      out.pro  += Number(a.pro)  || 0;
      out.carb += Number(a.carb) || 0;
      out.fat  += Number(a.fat)  || 0;
    });
    return out;
  }

  function buildPastiAggregate(items) {
    if (!items || !items.length) return { count: 0, kcalTot: 0, kcalAvg: 0, alimentiTot: 0, alimentiUnici: 0, giorniTracciati: 0, kcalMax: { val: 0, data: null } };
    const kcalArr = items.map(p => sumPastoKcal(p));
    const kcalTot = kcalArr.reduce((s, n) => s + n, 0);
    const alimentiSet = new Set();
    let alimentiTot = 0;
    items.forEach(p => (p.alimenti || []).forEach(a => {
      alimentiTot += 1;
      if (a.nome) alimentiSet.add(String(a.nome).toLowerCase().trim());
    }));
    const giorni = new Set(items.map(p => p.data).filter(Boolean));
    const kcalMax = items.reduce((m, p, i) => kcalArr[i] > m.val ? { val: kcalArr[i], data: p.data } : m, { val: 0, data: null });
    return {
      count: items.length,
      kcalTot,
      kcalAvg: items.length ? kcalTot / items.length : 0,
      alimentiTot,
      alimentiUnici: alimentiSet.size,
      giorniTracciati: giorni.size,
      kcalMax,
    };
  }

  function buildPastiSparkline60d(tipo) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vals = new Array(60).fill(0);
    getPastiOfType(tipo).forEach(p => {
      if (!p.data) return;
      const d = new Date(p.data);
      if (isNaN(d)) return;
      const diff = Math.floor((today - d) / 86400000);
      if (diff < 0 || diff >= 60) return;
      vals[59 - diff] += sumPastoKcal(p);
    });
    return vals;
  }

  function computePastiDelta30(tipo) {
    const now = Date.now();
    let curr = 0, prev = 0;
    getPastiOfType(tipo).forEach(p => {
      const kcal = sumPastoKcal(p);
      if (kcal <= 0 || !p.data) return;
      const ago = now - new Date(p.data).getTime();
      if (ago <= 30 * 86400000) curr += kcal;
      else if (ago <= 60 * 86400000) prev += kcal;
    });
    const deltaKcal = curr - prev;
    const dir = deltaKcal > 50 ? 'up' : deltaKcal < -50 ? 'down' : 'flat';
    return { curr, prev, deltaKcal, dir };
  }

  // Macro breakdown medio/giorno periodo vs target nutrizione
  function buildMacroBreakdown(items) {
    if (!items || !items.length) return { kcal: 0, pro: 0, carb: 0, fat: 0, giorni: 0 };
    const giorniSet = new Set();
    let kcal = 0, pro = 0, carb = 0, fat = 0;
    items.forEach(p => {
      if (p.data) giorniSet.add(p.data);
      kcal += sumPastoKcal(p);
      const m = sumPastoMacros(p);
      pro += m.pro; carb += m.carb; fat += m.fat;
    });
    const giorni = Math.max(1, giorniSet.size);
    return { kcal: kcal / giorni, pro: pro / giorni, carb: carb / giorni, fat: fat / giorni, giorni: giorniSet.size };
  }

  function buildTopAlimenti(items, n) {
    const map = new Map();
    items.forEach(p => (p.alimenti || []).forEach(a => {
      const nome = String(a.nome || '').trim();
      if (!nome) return;
      const k = nome.toLowerCase();
      const e = map.get(k) || { nome, count: 0, kcal: 0 };
      e.count += 1;
      e.kcal += Number(a.kcal) || 0;
      map.set(k, e);
    }));
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, n);
  }

  function renderMacroMini(label, val, target, color) {
    const pct = target > 0 ? Math.min(150, (val / target) * 100) : 0;
    const overshoot = pct > 100;
    const fillColor = overshoot ? '#FF9A3D' : color;
    return `
      <div class="arch-pas-macro-item">
        <div class="arch-pas-macro-head">
          <span class="arch-pas-macro-lbl">${label}</span>
          <span class="arch-pas-macro-val">${val.toFixed(0)}<span class="muted">/${target}</span></span>
        </div>
        <div class="arch-cat-card-bar">
          <div class="arch-cat-card-bar-fill" style="width:${Math.min(100, pct)}%;background:${fillColor}"></div>
        </div>
        <div class="arch-pas-macro-pct ${overshoot ? 'is-over' : ''}">${Math.round(pct)}%</div>
      </div>
    `;
  }

  function renderPastiListL1(fs) {
    const all = (CS.state.pasti || []).filter(p => p.data);
    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(all, period, 'data');

    const aggG = buildPastiAggregate(periodItems);
    const kcalGiornoAvg = aggG.giorniTracciati > 0 ? aggG.kcalTot / aggG.giorniTracciati : 0;

    const macro = buildMacroBreakdown(periodItems);
    const target = CS.state.targetNutrizione || { kcal: 3000, pro: 165, carb: 360, fat: 85 };

    const tipi = PASTO_TIPI.map(t => {
      const items = getPastiOfType(t.key).filter(p => {
        if (!p.data) return false;
        const { start, end } = getFisicaPeriodRange(period);
        if (start && p.data < start) return false;
        if (end && p.data > end) return false;
        return true;
      });
      return { ...t, items, agg: buildPastiAggregate(items), delta: computePastiDelta30(t.key) };
    }).filter(t => t.items.length > 0);

    return `
      <div class="archive-results-head">PASTI · ${all.length} totali</div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">KCAL/GIORNO</div>
          <div class="stat-val" data-cup="${kcalGiornoAvg}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">PASTI TOT</div>
          <div class="stat-val" data-cup="${aggG.count}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">ALIMENTI UNICI</div>
          <div class="stat-val" data-cup="${aggG.alimentiUnici}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">GIORNI TRACCIATI</div>
          <div class="stat-val" data-cup="${aggG.giorniTracciati}">0</div>
        </div>
      </div>

      <div class="arch-pas-macro-row">
        ${renderMacroMini('KCAL', macro.kcal, target.kcal || 3000, '#B45CFF')}
        ${renderMacroMini('PROTEINE', macro.pro, target.pro || 165, '#00FF88')}
        ${renderMacroMini('CARBO',    macro.carb, target.carb || 360, '#FF9A3D')}
        ${renderMacroMini('GRASSI',   macro.fat, target.fat || 85, '#9aa3b8')}
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="arch-cat-grid arch-pas-grid">
        ${tipi.length
          ? tipi.map(renderPastoCard).join('')
          : '<div class="empty-state"><div class="empty-text">Nessun pasto nel periodo</div></div>'}
      </div>
    `;
  }

  function renderPastoCard(t) {
    const dir = t.delta.dir;
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const deltaLbl = Math.abs(t.delta.deltaKcal) > 50
      ? `${arrow} ${Math.round(Math.abs(t.delta.deltaKcal))} kcal vs 30gg prec`
      : '→ stabile';
    return `
      <div class="arch-cat-card arch-pas-card" data-drill-key="${t.key}" data-pas-key="${t.key}" data-pas-color="${t.color}">
        <div class="arch-cat-card-row">
          <div class="arch-pas-card-head">
            <span class="arch-pas-card-ico">${t.icon}</span>
            <span class="arch-cat-card-name" style="color:${t.color}">${t.label}</span>
          </div>
          <div class="arch-cat-card-score" style="color:${t.color}" data-cup="${Math.round(t.agg.kcalAvg)}">0<span class="arch-pas-card-unit">kcal</span></div>
        </div>
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-sub">${t.agg.count} pasti · ${t.agg.alimentiUnici} alimenti unici</div>
          <span class="arch-cat-delta ${dir}">${deltaLbl}</span>
        </div>
        <div class="arch-pas-card-spark" data-pas-spark></div>
      </div>
    `;
  }

  function renderPastiDetailL2(fs) {
    const tipo = fs.drillKey;
    const t = PASTO_TIPI.find(x => x.key === tipo);
    if (!t) return '<div class="empty-state"><div class="empty-text">Tipo non valido</div></div>';

    const allItems = getPastiOfType(tipo);
    let filtered = allItems;
    if (fs.dateFrom) filtered = filtered.filter(p => (p.data || '') >= fs.dateFrom);
    if (fs.dateTo)   filtered = filtered.filter(p => (p.data || '') <= fs.dateTo);

    const agg = buildPastiAggregate(filtered);
    const top = buildTopAlimenti(filtered, 5);
    const groups = groupByMonth(filtered, 'data');

    const headerExtra = filtered.length
      ? `<span class="muted">${filtered.length} pasti${fs.dateFrom || fs.dateTo ? ' nel periodo' : ' · tutto'}</span>`
      : '<span class="muted">nessun pasto nel periodo</span>';

    return `
      ${renderL2Header('PASTI', `${t.icon} ${t.label}`, Math.round(agg.kcalAvg), ' kcal/pasto', t.color, headerExtra)}
      <div class="arch-injury-stats-row arch-injury-stats-l2">
        <div class="arch-injury-stat-mini"><div class="stat-lbl">KCAL MEDIA</div><div class="stat-val" data-cup="${Math.round(agg.kcalAvg)}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">PASTI</div><div class="stat-val" data-cup="${agg.count}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">ALIMENTI UNICI</div><div class="stat-val" data-cup="${agg.alimentiUnici}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">MAX KCAL</div><div class="stat-val" data-cup="${Math.round(agg.kcalMax.val)}">0</div></div>
      </div>
      ${top.length ? `
        <div class="arch-pas-top-ali">
          <div class="arch-pas-top-head">TOP ALIMENTI</div>
          <div class="arch-pas-top-list">
            ${top.map((a, i) => `
              <div class="arch-pas-top-item">
                <span class="arch-pas-top-rank">#${i + 1}</span>
                <span class="arch-pas-top-name">${escapeHtml(a.nome)}</span>
                <span class="arch-pas-top-count">${a.count}×</span>
                <span class="arch-pas-top-kcal muted">${Math.round(a.kcal)} kcal tot</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${renderDateFilters(fs)}
      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-pas-key="${tipo}" data-pas-color="${t.color}"></canvas></div>
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, p => renderPastoRow(p, t), items => {
          const kcal = items.reduce((s, p) => s + sumPastoKcal(p), 0);
          return `${items.length} pasti · ${Math.round(kcal)} kcal totali`;
        })}
      </div>
    `;
  }

  function renderPastoRow(p, t) {
    const kcal = sumPastoKcal(p);
    const macros = sumPastoMacros(p);
    const ali = (p.alimenti || []);
    const topAli = ali.slice(0, 3).map(a => escapeHtml(a.nome || '—')).join(' · ');
    const more = ali.length > 3 ? ` <span class="muted">+${ali.length - 3} altri</span>` : '';
    return `
      <div class="arch-l2-row arch-pas-row">
        <span class="arch-l2-row-date">${CS.fmtDate(p.data, { long: true })}</span>
        <span class="arch-l2-row-mid">
          <span class="arch-pas-row-kcal" style="color:${t.color}">${Math.round(kcal)}</span>
          <span class="arch-pas-row-unit">kcal</span>
          <span class="arch-pas-row-macros">
            <span class="arch-pas-macro-pill p">P ${Math.round(macros.pro)}</span>
            <span class="arch-pas-macro-pill c">C ${Math.round(macros.carb)}</span>
            <span class="arch-pas-macro-pill g">G ${Math.round(macros.fat)}</span>
          </span>
        </span>
        ${ali.length ? `<div class="arch-pas-row-ali muted">${topAli}${more}</div>` : ''}
      </div>
    `;
  }

  function initPastiBarChart(items, color) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    // Aggrega per giorno
    const byDay = new Map();
    items.forEach(p => {
      if (!p.data) return;
      byDay.set(p.data, (byDay.get(p.data) || 0) + sumPastoKcal(p));
    });
    const sortedDays = [...byDay.keys()].sort();
    const labels = sortedDays.map(d => CS.fmtDate(d, { short: true }));
    const data = sortedDays.map(d => byDay.get(d));
    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Kcal/giorno',
          data,
          backgroundColor: color + '55',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 } } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: color,
            bodyColor: '#F5F5F7',
            borderColor: color + '66',
            borderWidth: 1,
            padding: 10,
            callbacks: { label: ctx => `${Math.round(ctx.parsed.y)} kcal` },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function postRenderPasti(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      FX.countUp(el, 0, target, 700, { decimals });
    });
    if (!fs.drillKey) {
      root.querySelectorAll('.arch-pas-card').forEach(card => {
        const key = card.dataset.pasKey;
        const color = card.dataset.pasColor || '#B45CFF';
        const host = card.querySelector('[data-pas-spark]');
        if (host && key) {
          const vals = buildPastiSparkline60d(key);
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          FX.drawSparkline(host, vals, { height: 36, color, fill: `rgba(${r},${g},${b},0.18)` });
        }
      });
      const grid = root.querySelector('.arch-pas-grid');
      if (grid) FX.staggerIn(grid, '.arch-pas-card', 80);
    } else {
      const t = PASTO_TIPI.find(x => x.key === fs.drillKey);
      if (!t) return;
      let items = getPastiOfType(fs.drillKey);
      if (fs.dateFrom) items = items.filter(p => (p.data || '') >= fs.dateFrom);
      if (fs.dateTo)   items = items.filter(p => (p.data || '') <= fs.dateTo);
      requestAnimationFrame(() => initPastiBarChart(items, t.color));
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ORE ALLENAMENTO (focus) — L1 ricca, no drill
  //  Hero ring vs target sett 12h + chart bar + heatmap 365gg + accordion
  // ═══════════════════════════════════════════════════════

  function buildOreAggregate(items, periodDays) {
    if (!items || !items.length) {
      return { count: 0, oreTot: 0, oreMedia: 0, oreMax: { val: 0, data: null }, giorniAttivi: 0, oreSettAvg: 0 };
    }
    const oreTot = items.reduce((s, r) => s + (Number(r.oreAllenamento) || Number(r.oreH) || 0), 0);
    const giorni = new Set(items.map(r => r.data).filter(Boolean));
    const oreMax = items.reduce((m, r) => {
      const v = Number(r.oreAllenamento) || Number(r.oreH) || 0;
      return v > m.val ? { val: v, data: r.data } : m;
    }, { val: 0, data: null });
    const giorniN = Math.max(1, periodDays || 30);
    return {
      count: items.length,
      oreTot,
      oreMedia: items.length ? oreTot / items.length : 0,
      oreMax,
      giorniAttivi: giorni.size,
      oreSettAvg: (oreTot / giorniN) * 7,
    };
  }

  function build365OreHeatmap() {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const revMap = new Map();
    (CS.state.revisioni || []).forEach(r => { if (r.data) revMap.set(r.data, r); });
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = CS.isoDateOnly(d);
      const r = revMap.get(iso);
      const ore = r ? (Number(r.oreAllenamento) || Number(r.oreH) || 0) : 0;
      const intensity = ore <= 0 ? 0 : ore < 1 ? 1 : ore < 2 ? 2 : ore < 3 ? 3 : 4;
      out.push({ iso, ore, intensity });
    }
    return out;
  }

  function periodDaysFromRange(period, items) {
    if (period === 'YTD') {
      const j1 = new Date(`${new Date().getFullYear()}-01-01`).getTime();
      return Math.max(1, Math.ceil((Date.now() - j1) / 86400000));
    }
    if (period === 'TUTTO') {
      if (!items || !items.length) return 1;
      const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
      const first = new Date(sorted[0].data).getTime();
      return Math.max(1, Math.ceil((Date.now() - first) / 86400000));
    }
    return 30;
  }

  function renderOreOverview(fs) {
    const allRevs = (CS.state.revisioni || []).filter(r =>
      r.data && (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0
    );
    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(allRevs, period, 'data');
    const periodDays = periodDaysFromRange(period, periodItems);
    const agg = buildOreAggregate(periodItems, periodDays);

    const targetSett = Number(CS.state.targetSett && CS.state.targetSett.oreAllenamento) || 14;
    const ringPct = targetSett > 0 ? Math.min(100, (agg.oreSettAvg / targetSett) * 100) : 0;
    const ringColor = ringPct >= 100 ? '#00FF88' : ringPct >= 60 ? '#B45CFF' : '#FF9A3D';

    const groups = groupByMonth(periodItems, 'data');

    return `
      <div class="archive-results-head">ORE ALLENAMENTO · ${allRevs.length} giorni tracciati</div>

      <div class="arch-ore-hero">
        <div class="arch-ore-hero-ring" data-ore-ring data-pct="${ringPct.toFixed(0)}" data-color="${ringColor}"></div>
        <div class="arch-ore-hero-body">
          <div class="arch-ore-hero-num" data-cup="${agg.oreSettAvg}" data-decimals="1">0<span class="arch-ore-hero-unit">h/sett</span></div>
          <div class="arch-ore-hero-sub">media settimanale · target ${targetSett}h</div>
          <div class="arch-ore-hero-tot">Totale periodo: <b>${agg.oreTot.toFixed(1)}h</b> in ${agg.giorniAttivi} giorni</div>
        </div>
      </div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">ORE TOTALI</div>
          <div class="stat-val" data-cup="${agg.oreTot}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">MEDIA/GIORNO</div>
          <div class="stat-val" data-cup="${agg.oreMedia}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">MAX GIORNATA</div>
          <div class="stat-val" data-cup="${agg.oreMax.val}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">GIORNI ATTIVI</div>
          <div class="stat-val" data-cup="${agg.giorniAttivi}">0</div>
        </div>
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-ore-target="${targetSett}"></canvas></div>

      ${renderOreFiltersCompact(fs)}

      <div class="arch-ore-timeline">
        ${renderOreMonthsTimeline(groups)}
      </div>
    `;
  }

  // Recupera target ore mensile dagli obiettivi utente: solo obiettivi con scadenza mensile,
  // categoria 'ore' (auto-inferito da migrazione v2) E che riguardano il mese richiesto.
  // Se nessun obiettivo è impostato per quel mese, ritorna null → la UI mostra "—".
  function getOreObiettivoForMonth(monthKey) {
    const obiettivi = (CS.state.obiettivi || []).filter(o => {
      if (o.scadenza !== 'mensile') return false;
      if (o.periodo !== monthKey) return false;
      const isOre = o.categoria === 'ore'
        || /ore\b.*allena|allena.*\bore\b|^\s*ore\s*$/i.test(o.descrizione || '');
      return isOre;
    });
    if (!obiettivi.length) return null;
    const target = obiettivi.reduce((s, o) => s + (Number(o.target) || 0), 0);
    return target > 0 ? target : null;
  }

  // Filtri date compatti in stile "chip" — stessa funzionalità di renderDateFilters
  // ma layout più sobrio e moderno (riusa classi .arch-filter-from / .arch-filter-to / .arch-l2-filter-reset)
  function renderOreFiltersCompact(fs) {
    const hasFilter = fs.dateFrom || fs.dateTo;
    return `
      <div class="arch-ore-filter-bar">
        <span class="arch-ore-filter-ico">📅</span>
        <span class="arch-ore-filter-lbl">FILTRA</span>
        <input type="date" class="input arch-filter-from arch-ore-date-input" value="${fs.dateFrom || ''}" placeholder="da">
        <span class="arch-ore-filter-sep">→</span>
        <input type="date" class="input arch-filter-to arch-ore-date-input" value="${fs.dateTo || ''}" placeholder="a">
        ${hasFilter ? '<button class="arch-l2-filter-reset arch-ore-filter-reset" title="Reset filtri">×</button>' : ''}
      </div>
    `;
  }

  // Colore tricolore in base alla percentuale: rosso<40, arancio<70, verde>=70
  function oreProgressColor(pct) {
    if (pct < 40) return '#FF4757';
    if (pct < 70) return '#FF9A3D';
    return '#00FF88';
  }

  // Timeline mensile premium: ogni mese ha header con barra progress tricolore vs target,
  // sparkline vital-signal ore/giorno, numero ore grande. Espandibile per lista revisioni.
  // Il target di OGNI mese viene letto dagli obiettivi mensili dell'utente (getOreObiettivoForMonth):
  // se manca → mostriamo "—" e barra/badge neutri (no pct fake).
  function renderOreMonthsTimeline(groups) {
    if (!groups.length) return '<div class="empty-state"><div class="empty-text">Nessun giorno tracciato nel periodo</div></div>';
    return groups.map((g, i) => {
      const [yr, m] = g.key.split('-');
      const mName = MONTHS_FULL[Number(m) - 1] || '';
      const ore = g.items.reduce((s, r) => s + (Number(r.oreAllenamento) || Number(r.oreH) || 0), 0);
      const giorni = g.items.length;
      const targetMese = getOreObiettivoForMonth(g.key);            // null se obiettivo non impostato
      const hasTarget = targetMese != null && targetMese > 0;
      const pct = hasTarget ? Math.min(150, (ore / targetMese) * 100) : 0;
      const color = hasTarget ? oreProgressColor(pct) : 'rgba(245,245,247,0.5)';

      // Sparkline ore/giorno del mese (1..31) — stile vital-signal con baseline.
      // Soglie giorno usano daily target = ORE_DAILY_TARGET_H (2h) — costante globale,
      // indipendente dal target mensile (che è un goal cumulativo, non giornaliero).
      const giorniInMese = new Date(Number(yr), Number(m), 0).getDate();
      const sparkVals = new Array(giorniInMese).fill(0);
      g.items.forEach(r => {
        const dd = Number((r.data || '').slice(8, 10));
        if (dd >= 1 && dd <= giorniInMese) {
          sparkVals[dd - 1] += (Number(r.oreAllenamento) || Number(r.oreH) || 0);
        }
      });
      const dailyTarget = ORE_DAILY_TARGET_H;
      const sparkMax = Math.max(dailyTarget * 1.6, ...sparkVals, 1);
      const sparkBars = sparkVals.map((v, idx) => {
        const h = v > 0 ? Math.max(8, Math.round((v / sparkMax) * 100)) : 0;
        // Soglie tricolore allineate alla progress bar mensile: <40% rosso, 40-70% arancio,
        // 70-100% verde, ≥100% verde brillante (stesso colore, +glow & +width)
        let intensity = 0;
        if (v > 0) {
          const ratio = dailyTarget > 0 ? v / dailyTarget : 0;
          if (ratio >= 1.0)      intensity = 4;             // target raggiunto: verde brillante
          else if (ratio >= 0.7) intensity = 3;             // verde
          else if (ratio >= 0.4) intensity = 2;             // arancio
          else                   intensity = 1;             // rosso
        }
        const dayIso = `${yr}-${m}-${String(idx + 1).padStart(2, '0')}`;
        const dataAttrs = v > 0
          ? `data-stem-iso="${dayIso}" data-stem-ore="${v.toFixed(2)}"`
          : `data-stem-iso="${dayIso}" data-stem-rest="1"`;
        return `<span class="arch-ore-stem ${v > 0 ? 'is-active' : 'is-rest'}" data-intensity="${intensity}" ${dataAttrs}>
          ${v > 0 ? `<span class="arch-ore-stem-bar" style="height:${h}%"></span>` : '<span class="arch-ore-stem-dot"></span>'}
        </span>`;
      }).join('');

      // Badge target/% e barra: se manca obiettivo mensile → stato "neutro" + CTA
      const pctBadge = hasTarget
        ? `<span class="arch-ore-month-pct" style="color:${color};background:${color}1a;border-color:${color}40">${Math.round(pct)}%</span>`
        : `<span class="arch-ore-month-pct is-empty" title="Imposta un obiettivo mensile 'Ore allenamento' per ${mName} ${yr}">— %</span>`;
      const targetMeta = hasTarget
        ? `<span class="arch-ore-month-target muted">target ${targetMese.toFixed(0)}h</span>`
        : `<span class="arch-ore-month-target is-empty" title="Imposta un obiettivo mensile 'Ore allenamento'">⚙ no target</span>`;
      const barHtml = hasTarget
        ? `<div class="arch-ore-month-bar" data-pct="${Math.round(pct)}">
             <div class="arch-ore-month-bar-track">
               <div class="arch-ore-month-bar-grad" style="--pct:${Math.min(100, pct)}%"></div>
             </div>
             ${pct > 100 ? `<div class="arch-ore-month-bar-over" style="width:${Math.min(50, pct - 100)}%"></div>` : ''}
           </div>`
        : `<div class="arch-ore-month-bar is-empty">
             <div class="arch-ore-month-bar-track"></div>
           </div>`;

      return `
        <details class="arch-ore-month ${hasTarget ? '' : 'no-target'}" data-month="${g.key}" ${i === 0 ? 'open' : ''}>
          <summary class="arch-ore-month-head">
            <div class="arch-ore-month-name-col">
              <div class="arch-ore-month-name">${mName}</div>
              <div class="arch-ore-month-year">${yr}</div>
            </div>
            <div class="arch-ore-month-body-col">
              <div class="arch-ore-month-top">
                <div class="arch-ore-month-figures">
                  <span class="arch-ore-month-big" style="color:${color}">${ore.toFixed(1)}<span class="arch-ore-month-unit">h</span></span>
                  ${pctBadge}
                </div>
                <div class="arch-ore-month-meta">
                  <span class="arch-ore-month-days">${giorni} giorni</span>
                  ${targetMeta}
                </div>
              </div>
              ${barHtml}
              <div class="arch-ore-month-spark">
                <div class="arch-ore-month-spark-baseline"></div>
                ${sparkBars}
              </div>
            </div>
            <span class="arch-ore-month-chevron">▾</span>
          </summary>
          <div class="arch-ore-month-list">
            ${g.items.map(renderOreRow).join('')}
          </div>
        </details>
      `;
    }).join('');
  }

  // Colore voto 0-10. invert=true per metriche dove "basso è meglio" (es. affaticamento).
  function oreVoteColor(val, invert) {
    if (!(val > 0)) return 'rgba(245,245,247,0.3)';
    const v = invert ? 10 - val : val;
    if (v >= 7) return '#00FF88';      // verde
    if (v >= 4) return '#FF9A3D';      // arancio
    return '#FF4757';                  // rosso
  }

  // Riga revisione giornaliera nella timeline mese: data · ore + barra % monocolore · 3 voti
  function renderOreRow(r) {
    const ore = Number(r.oreAllenamento) || Number(r.oreH) || 0;
    const pct = Math.min(150, (ore / ORE_DAILY_TARGET_H) * 100);
    const color = oreProgressColor(Math.min(100, pct));

    const tec = Number(r.tecnica)       || 0;
    const int = Number(r.intensita)     || 0;
    const aff = Number(r.affaticamento) || 0;

    // Breakdown sessioni se presente (es. "🥊 2h · 💪 1h")
    const dettagli = Array.isArray(r.dettagliSessioni) ? r.dettagliSessioni : [];
    let breakdown = '';
    if (dettagli.length > 1) {
      const parts = dettagli.map(d => {
        const oreD = Number(d.ore) || 0;
        if (oreD <= 0) return null;
        const tipoMeta = d.tipo
          ? (SESSIONE_TIPI.find(t => t.key === categorizeSessione({ tipo: d.tipo })) || SESSIONE_TIPI[SESSIONE_TIPI.length - 1])
          : { icon: '🥊', label: 'ALLENAMENTO', color: '#B45CFF' };
        return `<span class="arch-ore-row-breakdown-chip" style="color:${tipoMeta.color}">${tipoMeta.icon} ${oreD.toFixed(1)}h</span>`;
      }).filter(Boolean);
      if (parts.length) {
        breakdown = `<div class="arch-ore-row-breakdown">${parts.join(' · ')}</div>`;
      }
    }

    return `
      <div class="arch-ore-row-v2">
        <span class="arch-ore-row-date">${CS.fmtDate(r.data, { long: true })}</span>
        <div class="arch-ore-row-bar-col">
          <div class="arch-ore-row-bar-head">
            <span class="arch-ore-row-h" style="color:${color}">${ore.toFixed(1)}<span class="arch-ore-row-unit">h</span></span>
            <span class="arch-ore-row-pct" style="color:${color}">${Math.round(pct)}%</span>
          </div>
          <div class="arch-ore-row-bar">
            <div class="arch-ore-row-bar-track">
              <div class="arch-ore-row-bar-fill" style="width:${Math.min(100, pct)}%;background:${color};box-shadow:0 0 6px ${color}"></div>
            </div>
            ${pct > 100 ? `<div class="arch-ore-row-bar-over" style="width:${Math.min(50, pct - 100)}%"></div>` : ''}
          </div>
          ${breakdown}
        </div>
        <div class="arch-ore-row-votes">
          ${renderOreVoteCard('TECNICA',       'TEC', '◆', tec, false)}
          ${renderOreVoteCard('INTENSITÀ',     'INT', '🔥', int, false)}
          ${renderOreVoteCard('AFFATICAMENTO', 'AFF', '⚡', aff, true)}
        </div>
      </div>
    `;
  }

  // Mini-card voto: label + valore grande + barra orizzontale proporzionale al voto/10
  function renderOreVoteCard(fullLabel, shortLabel, icon, val, invertColor) {
    const has = val > 0;
    const color = oreVoteColor(val, invertColor);
    const fillPct = has ? (val / 10) * 100 : 0;
    return `
      <div class="arch-ore-vote ${has ? '' : 'is-empty'}" style="--accent:${color}" title="${fullLabel}: ${has ? val + '/10' : 'non compilato'}">
        <div class="arch-ore-vote-head">
          <span class="arch-ore-vote-ico">${icon}</span>
          <span class="arch-ore-vote-lbl">${shortLabel}</span>
        </div>
        <div class="arch-ore-vote-num">${has ? (val % 1 === 0 ? val : val.toFixed(1)) : '—'}<span class="arch-ore-vote-max">/10</span></div>
        <div class="arch-ore-vote-bar">
          <div class="arch-ore-vote-bar-fill" style="width:${fillPct}%"></div>
        </div>
      </div>
    `;
  }

  function initOreBarChart(items, targetSett) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const labels = sorted.map(r => CS.fmtDate(r.data, { short: true }));
    const data = sorted.map(r => Number(r.oreAllenamento) || Number(r.oreH) || 0);
    const dailyTarget = targetSett / 7;
    const colors = data.map(h => h >= dailyTarget ? '#00FF88' : h >= dailyTarget * 0.6 ? '#B45CFF' : '#FF9A3D');
    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ore allenamento',
          data,
          backgroundColor: colors.map(c => c + '55'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
        }, {
          type: 'line',
          label: `Target ${dailyTarget.toFixed(1)}h/gg`,
          data: sorted.map(() => dailyTarget),
          borderColor: 'rgba(0,255,136,0.55)',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 } } },
        },
        plugins: {
          legend: { display: true, labels: { color: 'rgba(245,245,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            callbacks: { label: ctx => `${ctx.dataset.label === 'Ore allenamento' ? 'Ore' : 'Target'}: ${ctx.parsed.y.toFixed(1)}h` },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  // ─── ORE · tooltip hover stem giornaliero ─────────────
  const ORE_DAILY_TARGET_H = 2;                      // target minimo giornaliero (h) per riempire ring 100%
  const DAY_NAMES_IT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  let _oreStemTipEl = null;

  function getOreStemTip() {
    if (_oreStemTipEl && document.body.contains(_oreStemTipEl)) return _oreStemTipEl;
    const el = document.createElement('div');
    el.className = 'arch-ore-stem-tip';
    el.setAttribute('role', 'tooltip');
    el.innerHTML = `
      <div class="tip-ring">
        <svg viewBox="0 0 56 56" width="56" height="56">
          <circle class="tip-ring-track" cx="28" cy="28" r="24" fill="none" stroke-width="5"/>
          <circle class="tip-ring-arc"   cx="28" cy="28" r="24" fill="none" stroke-width="5"
                  stroke-linecap="round" transform="rotate(-90 28 28)"
                  stroke-dasharray="150.8" stroke-dashoffset="150.8"/>
        </svg>
        <span class="tip-ring-pct">0%</span>
      </div>
      <div class="tip-body">
        <div class="tip-day"></div>
        <div class="tip-ore-row">
          <span class="tip-ore-big">0</span><span class="tip-ore-unit">h</span>
          <span class="tip-ore-target">/ ${ORE_DAILY_TARGET_H}h target</span>
        </div>
        <div class="tip-msg"></div>
      </div>
    `;
    document.body.appendChild(el);
    _oreStemTipEl = el;
    return el;
  }

  function showOreStemTip(stem) {
    const iso = stem.dataset.stemIso;
    if (!iso) return;
    const isRest = stem.dataset.stemRest === '1';
    const ore = isRest ? 0 : Number(stem.dataset.stemOre) || 0;
    const pct = Math.min(100, (ore / ORE_DAILY_TARGET_H) * 100);
    const color = isRest ? 'rgba(245,245,247,0.4)' : oreProgressColor(pct);
    const tip = getOreStemTip();

    // popola valori
    const d = new Date(iso);
    const dayName = DAY_NAMES_IT[d.getDay()] || '';
    tip.querySelector('.tip-day').textContent = `${dayName} ${CS.fmtDate(iso, { long: true })}`;
    tip.querySelector('.tip-ore-big').textContent = ore.toFixed(1);
    const msgEl = tip.querySelector('.tip-msg');
    if (isRest) {
      msgEl.textContent = 'Giorno di riposo';
      msgEl.style.color = 'rgba(245,245,247,0.5)';
    } else if (pct >= 100) {
      msgEl.textContent = '✓ Target raggiunto';
      msgEl.style.color = color;
    } else if (pct >= 70) {
      msgEl.textContent = `Quasi al target (-${(ORE_DAILY_TARGET_H - ore).toFixed(1)}h)`;
      msgEl.style.color = color;
    } else if (pct >= 40) {
      msgEl.textContent = `Sotto target (-${(ORE_DAILY_TARGET_H - ore).toFixed(1)}h)`;
      msgEl.style.color = color;
    } else {
      msgEl.textContent = `Lontano dal target (-${(ORE_DAILY_TARGET_H - ore).toFixed(1)}h)`;
      msgEl.style.color = color;
    }

    // pct + ring
    const pctEl = tip.querySelector('.tip-ring-pct');
    pctEl.textContent = `${Math.round(pct)}%`;
    pctEl.style.color = color;
    const arc = tip.querySelector('.tip-ring-arc');
    const c = 150.8;                                  // 2π × r=24
    arc.style.stroke = color;
    arc.style.strokeDashoffset = String(c * (1 - pct / 100));
    tip.querySelector('.tip-ring-track').style.stroke = 'rgba(255,255,255,0.08)';

    // posiziona (centrata sopra lo stem)
    const rect = stem.getBoundingClientRect();
    tip.classList.add('is-visible');
    // misuro DOPO che è visibile per ottenere dimensioni reali
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top  = rect.top - tipRect.height - 10;
    // clamp viewport
    const pad = 8;
    if (left < pad) left = pad;
    if (left + tipRect.width > window.innerWidth - pad) left = window.innerWidth - tipRect.width - pad;
    if (top < pad) top = rect.bottom + 10;            // se non c'è spazio sopra, mostra sotto
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
  }

  function hideOreStemTip() {
    if (_oreStemTipEl) _oreStemTipEl.classList.remove('is-visible');
  }

  function attachOreStemTooltips(root) {
    root.querySelectorAll('.arch-ore-stem[data-stem-iso]').forEach(stem => {
      stem.addEventListener('mouseenter', () => showOreStemTip(stem));
      stem.addEventListener('mouseleave', hideOreStemTip);
      stem.addEventListener('focus',      () => showOreStemTip(stem));
      stem.addEventListener('blur',       hideOreStemTip);
    });
  }

  function postRenderOre(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      FX.countUp(el, 0, target, 700, { decimals });
    });
    const ringHost = root.querySelector('[data-ore-ring]');
    if (ringHost) {
      const pct = Number(ringHost.dataset.pct) || 0;
      const color = ringHost.dataset.color || '#B45CFF';
      FX.ringProgress(ringHost, pct, { size: 120, stroke: 8, color, trackColor: 'rgba(255,255,255,0.08)' });
    }
    const targetSett = Number(CS.state.targetSett && CS.state.targetSett.oreAllenamento) || 14;
    const allRevs = (CS.state.revisioni || []).filter(r =>
      r.data && (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0
    );
    const period = fs.period || 'YTD';
    let items = filterByPeriod(allRevs, period, 'data');
    if (fs.dateFrom) items = items.filter(r => (r.data || '') >= fs.dateFrom);
    if (fs.dateTo)   items = items.filter(r => (r.data || '') <= fs.dateTo);
    requestAnimationFrame(() => initOreBarChart(items, targetSett));

    // tooltip hover su ogni barra dello sparkline mensile
    attachOreStemTooltips(root);
  }

  // ═══════════════════════════════════════════════════════
  //  SESSIONI (focus) — L1 grid card per tipo + L2 storico per tipo
  // ═══════════════════════════════════════════════════════

  const SESSIONE_TIPI = [
    { key: 'sacco',     label: 'SACCO',      icon: '🥊', color: '#B45CFF', rx: /sacco|heavy\s*bag/i },
    { key: 'sparring',  label: 'SPARRING',   icon: '🤼', color: '#FF4757', rx: /sparring|guantoni/i },
    { key: 'pad',       label: 'PAD WORK',   icon: '🎯', color: '#FF9A3D', rx: /pad|focus\s*mitt|colpitori/i },
    { key: 'tecnica',   label: 'TECNICA',    icon: '🎓', color: '#00FF88', rx: /tecnica|combinaz|footwork|ombr/i },
    { key: 'corda',     label: 'CORDA',      icon: '🪢', color: '#9aa3b8', rx: /corda|jump\s*rope/i },
    { key: 'pesi',      label: 'SALA PESI',  icon: '🏋', color: '#FF6BFF',  rx: /pesi|forza|sala/i },
    { key: 'cardio',    label: 'CARDIO',     icon: '🏃', color: '#5EE0FF', rx: /cardio|corsa|cyclette|tapis/i },
    { key: 'altro',     label: 'ALTRO',      icon: '👊', color: '#888', rx: null },
  ];

  function categorizeSessione(s) {
    // tipo può essere array di stringhe oppure stringa libera
    const raw = Array.isArray(s.tipo) ? s.tipo.join(' ') : String(s.tipo || '');
    const blob = (raw + ' ' + (s.luogo || '') + ' ' + ((s.esercizi || []).map(e => e.nome || '').join(' '))).trim();
    if (!blob) return 'altro';
    for (const t of SESSIONE_TIPI) {
      if (t.rx && t.rx.test(blob)) return t.key;
    }
    return 'altro';
  }

  function getSessioniOfType(tipo) {
    return (CS.state.sessioni || []).filter(s => categorizeSessione(s) === tipo);
  }

  function sessioneDurataOre(s) {
    if (s && s.oreVirtual != null) return Number(s.oreVirtual) || 0;
    if (!s.oraInizio || !s.oraFine) return 0;
    const [h1, m1] = s.oraInizio.split(':').map(Number);
    const [h2, m2] = s.oraFine.split(':').map(Number);
    let dur = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (dur < 0) dur += 24 * 60;
    return dur / 60;
  }

  function sessioneIntensita(s) {
    if (s && s.intensitaRev != null && Number(s.intensitaRev) > 0) return Number(s.intensitaRev);
    const ints = (s.esercizi || []).map(e => Number(e.intensita)).filter(n => !isNaN(n) && n > 0);
    return ints.length ? ints.reduce((a, b) => a + b, 0) / ints.length : 0;
  }

  // Unisce sessioni esplicite + sessioni "virtuali" derivate dalle revisioni giornaliere
  // (ogni revisione con oreAllenamento>0 conta come 1 sessione del giorno).
  // Dedup: se per quel giorno esiste già una sessione esplicita, la revisione NON viene aggiunta
  // (evita doppio conteggio quando l'utente ha tracciato sia il wizard sia la rev).
  function getAllSessioniMerged() {
    const explicit = (CS.state.sessioni || []).filter(s => s.data);
    const explicitDates = new Set(explicit.map(s => s.data));
    const virtuals = [];
    (CS.state.revisioni || [])
      .filter(r => r.data && !explicitDates.has(r.data))
      .filter(r => (Number(r.oreAllenamento) || Number(r.oreH) || 0) > 0
                || (Array.isArray(r.dettagliSessioni) && r.dettagliSessioni.length > 0))
      .forEach(r => {
        const dettagli = Array.isArray(r.dettagliSessioni) ? r.dettagliSessioni : null;
        if (dettagli && dettagli.length > 0) {
          // Nuovo schema: una sessione virtuale per ogni elemento dettagli
          dettagli.forEach((d, i) => {
            virtuals.push({
              data: r.data,
              __fromRev: true,
              __sessIndex: i,
              oreVirtual: Number(d.ore) || 0,
              tipo: d.tipo || '',                           // tipo specifico della sessione
              intensitaRev: Number(r.intensita) || 0,
              tecnicaRev: Number(r.tecnica) || 0,
              esercizi: [],
              luogo: '',
              oraInizio: null,
              oraFine: null,
              nota: (r.bene || r.allena || '').slice(0, 120),
            });
          });
        } else {
          // Fallback retro-compat: ore totali divise uniformemente per sessioniGiorno
          const oreTotali = Number(r.oreAllenamento) || Number(r.oreH) || 0;
          const n = Math.max(1, Math.min(6, Number(r.sessioniGiorno) || 1));
          const orePerSess = oreTotali / n;
          const tipoLegacy = Array.isArray(r.tipo) && r.tipo.length ? r.tipo[0] : '';
          for (let i = 0; i < n; i++) {
            virtuals.push({
              data: r.data,
              __fromRev: true,
              __sessIndex: i,
              oreVirtual: orePerSess,
              tipo: tipoLegacy,
              intensitaRev: Number(r.intensita) || 0,
              tecnicaRev: Number(r.tecnica) || 0,
              esercizi: [],
              luogo: '',
              oraInizio: null,
              oraFine: null,
              nota: (r.bene || r.allena || '').slice(0, 120),
            });
          }
        }
      });
    return explicit.concat(virtuals);
  }

  function buildSessioniAggregate(items) {
    if (!items || !items.length) return { count: 0, oreTot: 0, oreAvg: 0, intAvg: 0, eserciziTot: 0, luoghi: new Set() };
    let oreTot = 0, intArr = [], eserciziTot = 0;
    const luoghi = new Set();
    items.forEach(s => {
      oreTot += sessioneDurataOre(s);
      const inten = sessioneIntensita(s);
      if (inten > 0) intArr.push(inten);
      eserciziTot += (s.esercizi || []).length;
      if (s.luogo) luoghi.add(String(s.luogo).trim());
    });
    return {
      count: items.length,
      oreTot,
      oreAvg: items.length ? oreTot / items.length : 0,
      intAvg: intArr.length ? intArr.reduce((a, b) => a + b, 0) / intArr.length : 0,
      eserciziTot,
      luoghi,
    };
  }

  function buildSessioniSparkline60d(tipo) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vals = new Array(60).fill(0);
    getSessioniOfType(tipo).forEach(s => {
      if (!s.data) return;
      const d = new Date(s.data);
      if (isNaN(d)) return;
      const diff = Math.floor((today - d) / 86400000);
      if (diff < 0 || diff >= 60) return;
      vals[59 - diff] += 1; // count sessions per day
    });
    return vals;
  }

  function computeSessioniDelta30(tipo) {
    const now = Date.now();
    let curr = 0, prev = 0;
    getSessioniOfType(tipo).forEach(s => {
      if (!s.data) return;
      const ago = now - new Date(s.data).getTime();
      if (ago <= 30 * 86400000) curr += 1;
      else if (ago <= 60 * 86400000) prev += 1;
    });
    const deltaN = curr - prev;
    const dir = deltaN > 0 ? 'up' : deltaN < 0 ? 'down' : 'flat';
    return { curr, prev, deltaN, dir };
  }

  function renderSessioniListL1(fs) {
    const all = (CS.state.sessioni || []).filter(s => s.data);
    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(all, period, 'data');
    const aggG = buildSessioniAggregate(periodItems);
    const targetSessSett = Number(CS.state.targetSett && CS.state.targetSett.sessioni) || 5;
    const periodDays = periodDaysFromRange(period, periodItems);
    const sessSettAvg = (aggG.count / periodDays) * 7;
    const settPct = Math.min(150, (sessSettAvg / targetSessSett) * 100);

    const tipi = SESSIONE_TIPI.map(t => {
      const items = getSessioniOfType(t.key).filter(s => {
        if (!s.data) return false;
        const { start, end } = getFisicaPeriodRange(period);
        if (start && s.data < start) return false;
        if (end && s.data > end) return false;
        return true;
      });
      return { ...t, items, agg: buildSessioniAggregate(items), delta: computeSessioniDelta30(t.key) };
    }).filter(t => t.items.length > 0);

    return `
      <div class="archive-results-head">SESSIONI · ${all.length} totali</div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">SESSIONI</div>
          <div class="stat-val" data-cup="${aggG.count}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">ORE TOTALI</div>
          <div class="stat-val" data-cup="${aggG.oreTot}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">DURATA MEDIA</div>
          <div class="stat-val" data-cup="${aggG.oreAvg}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">INTENSITÀ AVG</div>
          <div class="stat-val" data-cup="${aggG.intAvg}" data-decimals="1">0<span class="stat-unit">/10</span></div>
        </div>
      </div>

      <div class="arch-cat-card arch-ses-progress-target">
        <div class="arch-cat-card-row">
          <span class="arch-cat-card-name">PROGRESSO SETTIMANALE</span>
          <span class="arch-cat-card-score" style="color:${settPct >= 100 ? '#00FF88' : '#B45CFF'}">${Math.round(settPct)}%</span>
        </div>
        <div class="arch-cat-card-sub">${sessSettAvg.toFixed(1)} sess/sett · target ${targetSessSett}</div>
        <div class="arch-cat-card-bar">
          <div class="arch-cat-card-bar-fill" style="width:${Math.min(100, settPct)}%;background:${settPct >= 100 ? '#00FF88' : '#B45CFF'}"></div>
        </div>
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="arch-cat-grid arch-ses-grid">
        ${tipi.length
          ? tipi.map(renderSessioneCard).join('')
          : '<div class="empty-state"><div class="empty-text">Nessuna sessione nel periodo</div></div>'}
      </div>
    `;
  }

  function renderSessioneCard(t) {
    const dir = t.delta.dir;
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const deltaLbl = t.delta.deltaN !== 0
      ? `${arrow} ${Math.abs(t.delta.deltaN)} sess vs 30gg prec`
      : '→ stabile';
    return `
      <div class="arch-cat-card arch-ses-card" data-drill-key="${t.key}" data-ses-key="${t.key}" data-ses-color="${t.color}">
        <div class="arch-cat-card-row">
          <div class="arch-ses-card-head">
            <span class="arch-ses-card-ico">${t.icon}</span>
            <span class="arch-cat-card-name" style="color:${t.color}">${t.label}</span>
          </div>
          <div class="arch-cat-card-score" style="color:${t.color}" data-cup="${t.agg.count}">0</div>
        </div>
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-sub">${t.agg.oreTot.toFixed(1)}h tot · ${t.agg.oreAvg.toFixed(1)}h media · int ${t.agg.intAvg.toFixed(1)}/10</div>
          <span class="arch-cat-delta ${dir}">${deltaLbl}</span>
        </div>
        <div class="arch-ses-card-spark" data-ses-spark></div>
      </div>
    `;
  }

  function renderSessioniDetailL2(fs) {
    const tipo = fs.drillKey;
    const t = SESSIONE_TIPI.find(x => x.key === tipo);
    if (!t) return '<div class="empty-state"><div class="empty-text">Tipo non valido</div></div>';

    const allItems = getSessioniOfType(tipo);
    let filtered = allItems;
    if (fs.dateFrom) filtered = filtered.filter(s => (s.data || '') >= fs.dateFrom);
    if (fs.dateTo)   filtered = filtered.filter(s => (s.data || '') <= fs.dateTo);

    const agg = buildSessioniAggregate(filtered);
    const groups = groupByMonth(filtered, 'data');
    const luoghiTop = [...agg.luoghi].slice(0, 5).join(' · ') || '—';

    const headerExtra = filtered.length
      ? `<span class="muted">${filtered.length} sessioni${fs.dateFrom || fs.dateTo ? ' nel periodo' : ' · tutto'}</span>`
      : '<span class="muted">nessuna sessione nel periodo</span>';

    return `
      ${renderL2Header('SESSIONI', `${t.icon} ${t.label}`, agg.count, ' sess', t.color, headerExtra)}
      <div class="arch-injury-stats-row arch-injury-stats-l2">
        <div class="arch-injury-stat-mini"><div class="stat-lbl">SESSIONI</div><div class="stat-val" data-cup="${agg.count}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">ORE TOT</div><div class="stat-val" data-cup="${agg.oreTot}" data-decimals="1">0<span class="stat-unit">h</span></div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">ESERCIZI TOT</div><div class="stat-val" data-cup="${agg.eserciziTot}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">INTENSITÀ AVG</div><div class="stat-val" data-cup="${agg.intAvg}" data-decimals="1">0<span class="stat-unit">/10</span></div></div>
      </div>
      ${agg.luoghi.size > 0 ? `<div class="arch-ses-luoghi muted">📍 ${escapeHtml(luoghiTop)}</div>` : ''}
      ${renderDateFilters(fs)}
      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-ses-key="${tipo}" data-ses-color="${t.color}"></canvas></div>
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, s => renderSessioneRow(s, t), items => {
          const ore = items.reduce((sum, s) => sum + sessioneDurataOre(s), 0);
          return `${items.length} sessioni · ${ore.toFixed(1)}h`;
        })}
      </div>
    `;
  }

  function renderSessioneRow(s, t) {
    const dur = sessioneDurataOre(s);
    const inten = sessioneIntensita(s);
    const ese = (s.esercizi || []);
    const topEse = ese.slice(0, 3).map(e => escapeHtml(e.nome || '—')).join(' · ');
    const more = ese.length > 3 ? ` <span class="muted">+${ese.length - 3} altri</span>` : '';
    const timeStr = s.oraInizio ? `${s.oraInizio}${s.oraFine ? '–' + s.oraFine : ''}` : '';
    return `
      <div class="arch-l2-row arch-ses-row">
        <span class="arch-l2-row-date">${CS.fmtDate(s.data, { long: true })}${timeStr ? ` · ${timeStr}` : ''}</span>
        <span class="arch-l2-row-mid">
          <span class="arch-ses-row-big" style="color:${t.color}">${ese.length}</span>
          <span class="arch-ses-row-unit">esercizi</span>
          ${dur > 0 ? `<span class="arch-ses-row-pill arch-ses-dur">${dur.toFixed(1)}h</span>` : ''}
          ${inten > 0 ? `<span class="arch-ses-row-pill arch-ses-int">int ${inten.toFixed(1)}/10</span>` : ''}
          ${s.luogo ? `<span class="arch-ses-row-pill arch-ses-luogo">📍 ${escapeHtml(s.luogo)}</span>` : ''}
        </span>
        ${ese.length ? `<div class="arch-ses-row-ese muted">${topEse}${more}</div>` : ''}
      </div>
    `;
  }

  function initSessioniChart(items, color) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    // Aggrega per giorno: ore totali + intensità media
    const byDay = new Map();
    items.forEach(s => {
      if (!s.data) return;
      const cur = byDay.get(s.data) || { ore: 0, intCount: 0, intSum: 0 };
      cur.ore += sessioneDurataOre(s);
      const inten = sessioneIntensita(s);
      if (inten > 0) { cur.intSum += inten; cur.intCount += 1; }
      byDay.set(s.data, cur);
    });
    const sortedDays = [...byDay.keys()].sort();
    const labels = sortedDays.map(d => CS.fmtDate(d, { short: true }));
    const oreData = sortedDays.map(d => byDay.get(d).ore);
    const intData = sortedDays.map(d => {
      const v = byDay.get(d);
      return v.intCount > 0 ? v.intSum / v.intCount : null;
    });
    archiveChart = new Chart(canvas, {
      data: {
        labels,
        datasets: [{
          type: 'bar',
          label: 'Ore',
          data: oreData,
          backgroundColor: color + '55',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        }, {
          type: 'line',
          label: 'Intensità',
          data: intData,
          borderColor: 'rgba(255,71,87,0.8)',
          backgroundColor: 'rgba(255,71,87,0.15)',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 3,
          pointBackgroundColor: '#FF4757',
          yAxisID: 'y1',
          fill: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: color, font: { family: 'JetBrains Mono', size: 10 } }, title: { display: true, text: 'Ore', color: color, font: { family: 'JetBrains Mono', size: 10 } } },
          y1: { beginAtZero: true, max: 10, position: 'right', grid: { display: false }, ticks: { color: 'rgba(255,71,87,0.9)', font: { family: 'JetBrains Mono', size: 10 } }, title: { display: true, text: 'Int /10', color: 'rgba(255,71,87,0.9)', font: { family: 'JetBrains Mono', size: 10 } } },
        },
        plugins: {
          legend: { display: true, labels: { color: 'rgba(245,245,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: color,
            bodyColor: '#F5F5F7',
            borderColor: color + '66',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => ctx.dataset.label === 'Ore'
                ? `${ctx.parsed.y.toFixed(1)}h`
                : ctx.parsed.y == null ? 'int: —' : `intensità ${ctx.parsed.y.toFixed(1)}/10`,
            },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function postRenderSessioni(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    if (!fs.drillKey) {
      postRenderSessioniOverview(fs);
      return;
    }
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      FX.countUp(el, 0, target, 700, { decimals });
    });
    const t = SESSIONE_TIPI.find(x => x.key === fs.drillKey);
    if (!t) return;
    let items = getSessioniOfType(fs.drillKey);
    if (fs.dateFrom) items = items.filter(s => (s.data || '') >= fs.dateFrom);
    if (fs.dateTo)   items = items.filter(s => (s.data || '') <= fs.dateTo);
    requestAnimationFrame(() => initSessioniChart(items, t.color));
  }

  // ═══════════════════════════════════════════════════════
  //  SESSIONI · OVERVIEW (specchio di ORE ALLENAMENTO)
  //  Hero ring + 4 stat + period switcher + chart + filtri + timeline mesi
  // ═══════════════════════════════════════════════════════

  // Conteggio sessioni in un range
  function buildSessioniOverviewAggregate(items, periodDays) {
    if (!items || !items.length) {
      return { count: 0, oreTot: 0, oreMedia: 0, intMedia: 0, eserciziTot: 0, sessMax: { val: 0, data: null }, giorniAttivi: 0, sessSettAvg: 0 };
    }
    let oreTot = 0, intArr = [], eserciziTot = 0;
    const giorni = new Set();
    const perDay = new Map();
    items.forEach(s => {
      if (s.data) giorni.add(s.data);
      oreTot += sessioneDurataOre(s);
      const inten = sessioneIntensita(s);
      if (inten > 0) intArr.push(inten);
      eserciziTot += (s.esercizi || []).length;
      if (s.data) perDay.set(s.data, (perDay.get(s.data) || 0) + 1);
    });
    let sessMax = { val: 0, data: null };
    perDay.forEach((v, d) => { if (v > sessMax.val) sessMax = { val: v, data: d }; });
    const giorniN = Math.max(1, periodDays || 30);
    return {
      count: items.length,
      oreTot,
      oreMedia: items.length ? oreTot / items.length : 0,
      intMedia: intArr.length ? intArr.reduce((a, b) => a + b, 0) / intArr.length : 0,
      eserciziTot,
      sessMax,
      giorniAttivi: giorni.size,
      sessSettAvg: (items.length / giorniN) * 7,
    };
  }

  // Recupera target sessioni mensile dagli obiettivi utente: solo obiettivi mensili
  // con categoria 'sessioni' (auto-inferito da migrazione v2) per il mese richiesto.
  // Null se nessun obiettivo impostato → UI mostra "—".
  function getSessioniObiettivoForMonth(monthKey) {
    const obiettivi = (CS.state.obiettivi || []).filter(o => {
      if (o.scadenza !== 'mensile') return false;
      if (o.periodo !== monthKey) return false;
      const isSess = o.categoria === 'sessioni'
        || /sessio/i.test(o.descrizione || '');
      return isSess;
    });
    if (!obiettivi.length) return null;
    const target = obiettivi.reduce((s, o) => s + (Number(o.target) || 0), 0);
    return target > 0 ? target : null;
  }

  // Filtri date compatti (riusa classi .arch-ore-* per uniformità visiva)
  function renderSessioniFiltersCompact(fs) {
    const hasFilter = fs.dateFrom || fs.dateTo;
    return `
      <div class="arch-ore-filter-bar">
        <span class="arch-ore-filter-ico">📅</span>
        <span class="arch-ore-filter-lbl">FILTRA</span>
        <input type="date" class="input arch-filter-from arch-ore-date-input" value="${fs.dateFrom || ''}" placeholder="da">
        <span class="arch-ore-filter-sep">→</span>
        <input type="date" class="input arch-filter-to arch-ore-date-input" value="${fs.dateTo || ''}" placeholder="a">
        ${hasFilter ? '<button class="arch-l2-filter-reset arch-ore-filter-reset" title="Reset filtri">×</button>' : ''}
      </div>
    `;
  }

  // Tricolore in base alla percentuale (stessa scala ore)
  function sessProgressColor(pct) {
    if (pct < 40) return '#FF4757';
    if (pct < 70) return '#FF9A3D';
    return '#00FF88';
  }

  // Target sessioni/giorno benchmark per sparkline & ring (5 sess/sett ÷ 7gg ≈ 0.71/gg)
  // Costante esposta come getter così l'utente può cambiare targetSett.sessioni e si propaga.
  function sessDailyTarget() {
    const t = Number(CS.state.targetSett && CS.state.targetSett.sessioni) || 5;
    return t / 7;
  }

  function renderSessioniOverview(fs) {
    const allSess = getAllSessioniMerged();
    const period = fs.period || 'YTD';
    const periodItems = filterByPeriod(allSess, period, 'data');
    const periodDays = periodDaysFromRange(period, periodItems);
    const agg = buildSessioniOverviewAggregate(periodItems, periodDays);

    const targetSett = Number(CS.state.targetSett && CS.state.targetSett.sessioni) || 5;
    const ringPct = targetSett > 0 ? Math.min(100, (agg.sessSettAvg / targetSett) * 100) : 0;
    const ringColor = ringPct >= 100 ? '#00FF88' : ringPct >= 60 ? '#B45CFF' : '#FF9A3D';

    const groups = groupByMonth(periodItems, 'data');

    return `
      <div class="archive-results-head">SESSIONI · ${allSess.length} totali tracciate</div>

      <div class="arch-ore-hero">
        <div class="arch-ore-hero-ring" data-ses-ring data-pct="${ringPct.toFixed(0)}" data-color="${ringColor}"></div>
        <div class="arch-ore-hero-body">
          <div class="arch-ore-hero-num" data-cup="${agg.sessSettAvg}" data-decimals="1">0<span class="arch-ore-hero-unit">sess/sett</span></div>
          <div class="arch-ore-hero-sub">media settimanale · target ${(targetSett / 7).toFixed(targetSett % 7 === 0 ? 0 : 1)} sess/giorno</div>
          <div class="arch-ore-hero-tot">Totale periodo: <b>${agg.count}</b> sessioni in ${agg.giorniAttivi} giorni · <b>${agg.oreTot.toFixed(1)}h</b></div>
        </div>
      </div>

      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">SESSIONI</div>
          <div class="stat-val" data-cup="${agg.count}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">ORE TOTALI</div>
          <div class="stat-val" data-cup="${agg.oreTot}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">DURATA MEDIA</div>
          <div class="stat-val" data-cup="${agg.oreMedia}" data-decimals="1">0<span class="stat-unit">h</span></div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">INTENSITÀ AVG</div>
          <div class="stat-val" data-cup="${agg.intMedia}" data-decimals="1">0<span class="stat-unit">/10</span></div>
        </div>
      </div>

      ${renderFisicaPeriodSwitcher(period)}

      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-ses-target="${targetSett}"></canvas></div>

      ${renderSessioniFiltersCompact(fs)}

      <div class="arch-ore-timeline">
        ${renderSessioniMonthsTimeline(groups)}
      </div>
    `;
  }

  // Timeline mensile: header con progress vs obiettivo mensile + sparkline sessioni/giorno
  // + espandibile con lista sessioni del mese
  function renderSessioniMonthsTimeline(groups) {
    if (!groups.length) return '<div class="empty-state"><div class="empty-text">Nessuna sessione nel periodo</div></div>';
    return groups.map((g, i) => {
      const [yr, m] = g.key.split('-');
      const mName = MONTHS_FULL[Number(m) - 1] || '';
      const sessN = g.items.length;
      const oreM = g.items.reduce((s, x) => s + sessioneDurataOre(x), 0);
      const targetMese = getSessioniObiettivoForMonth(g.key);
      const hasTarget = targetMese != null && targetMese > 0;
      const pct = hasTarget ? Math.min(150, (sessN / targetMese) * 100) : 0;
      const color = hasTarget ? sessProgressColor(pct) : 'rgba(245,245,247,0.5)';

      // Sparkline sessioni/giorno del mese
      const giorniInMese = new Date(Number(yr), Number(m), 0).getDate();
      const sparkVals = new Array(giorniInMese).fill(0);
      g.items.forEach(s => {
        const dd = Number((s.data || '').slice(8, 10));
        if (dd >= 1 && dd <= giorniInMese) sparkVals[dd - 1] += 1;
      });
      const dailyTarget = sessDailyTarget();
      const sparkMax = Math.max(2, ...sparkVals, 1);
      const sparkBars = sparkVals.map((v, idx) => {
        const h = v > 0 ? Math.max(8, Math.round((v / sparkMax) * 100)) : 0;
        // Soglie tricolore rispetto al daily benchmark (~0.7/gg = 1 sess è già target)
        let intensity = 0;
        if (v > 0) {
          const ratio = dailyTarget > 0 ? v / dailyTarget : 0;
          if (ratio >= 1.5)      intensity = 4;   // doppio target
          else if (ratio >= 1.0) intensity = 3;   // target raggiunto
          else if (ratio >= 0.5) intensity = 2;   // mezza dose
          else                   intensity = 1;
        }
        const dayIso = `${yr}-${m}-${String(idx + 1).padStart(2, '0')}`;
        const dataAttrs = v > 0
          ? `data-stem-iso="${dayIso}" data-stem-sess="${v}"`
          : `data-stem-iso="${dayIso}" data-stem-rest="1"`;
        return `<span class="arch-ore-stem ${v > 0 ? 'is-active' : 'is-rest'}" data-intensity="${intensity}" ${dataAttrs}>
          ${v > 0 ? `<span class="arch-ore-stem-bar" style="height:${h}%"></span>` : '<span class="arch-ore-stem-dot"></span>'}
        </span>`;
      }).join('');

      const pctBadge = hasTarget
        ? `<span class="arch-ore-month-pct" style="color:${color};background:${color}1a;border-color:${color}40">${Math.round(pct)}%</span>`
        : `<span class="arch-ore-month-pct is-empty" title="Imposta un obiettivo mensile 'Sessioni' per ${mName} ${yr}">— %</span>`;
      const targetMeta = hasTarget
        ? `<span class="arch-ore-month-target muted">target ${Math.round(targetMese)} sess</span>`
        : `<span class="arch-ore-month-target is-empty" title="Imposta un obiettivo mensile 'Sessioni'">⚙ no target</span>`;
      const barHtml = hasTarget
        ? `<div class="arch-ore-month-bar" data-pct="${Math.round(pct)}">
             <div class="arch-ore-month-bar-track">
               <div class="arch-ore-month-bar-grad" style="--pct:${Math.min(100, pct)}%"></div>
             </div>
             ${pct > 100 ? `<div class="arch-ore-month-bar-over" style="width:${Math.min(50, pct - 100)}%"></div>` : ''}
           </div>`
        : `<div class="arch-ore-month-bar is-empty">
             <div class="arch-ore-month-bar-track"></div>
           </div>`;

      return `
        <details class="arch-ore-month ${hasTarget ? '' : 'no-target'}" data-month="${g.key}" ${i === 0 ? 'open' : ''}>
          <summary class="arch-ore-month-head">
            <div class="arch-ore-month-name-col">
              <div class="arch-ore-month-name">${mName}</div>
              <div class="arch-ore-month-year">${yr}</div>
            </div>
            <div class="arch-ore-month-body-col">
              <div class="arch-ore-month-top">
                <div class="arch-ore-month-figures">
                  <span class="arch-ore-month-big" style="color:${color}">${sessN}<span class="arch-ore-month-unit">sess</span></span>
                  ${pctBadge}
                </div>
                <div class="arch-ore-month-meta">
                  <span class="arch-ore-month-days">${oreM.toFixed(1)}h totali</span>
                  ${targetMeta}
                </div>
              </div>
              ${barHtml}
              <div class="arch-ore-month-spark">
                <div class="arch-ore-month-spark-baseline"></div>
                ${sparkBars}
              </div>
            </div>
            <span class="arch-ore-month-chevron">▾</span>
          </summary>
          <div class="arch-ore-month-list">
            ${renderSessioniDayRows(g.items)}
          </div>
        </details>
      `;
    }).join('');
  }

  // Raggruppa le sessioni del mese per giorno e ne renderizza una riga per ognuno,
  // con conteggio sessioni vs target giornaliero (2/gg → 1 = 50% giallo, 2 = 100% verde).
  function renderSessioniDayRows(items) {
    const byDay = new Map();
    items.forEach(s => {
      if (!s.data) return;
      if (!byDay.has(s.data)) byDay.set(s.data, []);
      byDay.get(s.data).push(s);
    });
    const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
    return days.map(d => renderSessioneDayRow(d, byDay.get(d))).join('');
  }

  function renderSessioneDayRow(dateIso, sessionsOfDay) {
    const dailyT = Math.max(1, Math.round(sessDailyTarget()) || 2);   // target giornaliero (es. 2)
    const n = sessionsOfDay.length;
    const pct = Math.min(150, (n / dailyT) * 100);
    const color = sessProgressColor(Math.min(100, pct));

    // Tipi presenti nel giorno: chips compatti (deduplicati)
    // Per sessioni virtuali: se hanno tipo specifico → categorize; altrimenti fallback "ALLENAMENTO"
    const tipiUnici = [];
    const seen = new Set();
    sessionsOfDay.forEach(s => {
      const isV = !!s.__fromRev;
      const hasTipo = s.tipo && String(s.tipo).trim();
      let meta;
      if (isV && !hasTipo) {
        meta = { key: 'rev', label: 'ALLENAMENTO', icon: '🥊', color: '#B45CFF' };
      } else {
        meta = SESSIONE_TIPI.find(t => t.key === categorizeSessione(s)) || SESSIONE_TIPI[SESSIONE_TIPI.length - 1];
      }
      if (!seen.has(meta.key)) { seen.add(meta.key); tipiUnici.push(meta); }
    });
    const chips = tipiUnici.map(t => `<span class="arch-ses-chip" style="color:${t.color};border-color:${t.color}40;background:${t.color}10">${t.icon} ${t.label}</span>`).join('');

    return `
      <div class="arch-ore-row-v2">
        <span class="arch-ore-row-date">${CS.fmtDate(dateIso, { long: true })}</span>
        <div class="arch-ore-row-bar-col">
          <div class="arch-ore-row-bar-head">
            <span class="arch-ore-row-h" style="color:${color}">${n}<span class="arch-ore-row-unit"> / ${dailyT} sess</span></span>
            <span class="arch-ore-row-pct" style="color:${color}">${Math.round(pct)}%</span>
          </div>
          <div class="arch-ore-row-bar">
            <div class="arch-ore-row-bar-track">
              <div class="arch-ore-row-bar-fill" style="width:${Math.min(100, pct)}%;background:${color};box-shadow:0 0 6px ${color}"></div>
            </div>
            ${pct > 100 ? `<div class="arch-ore-row-bar-over" style="width:${Math.min(50, pct - 100)}%"></div>` : ''}
          </div>
        </div>
        ${chips ? `<div class="arch-ses-day-chips">${chips}</div>` : ''}
      </div>
    `;
  }

  // Chart: bar sessioni/giorno + linea target giornaliero
  function initSessioniBarChartOverview(items, targetSett) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    // Aggrega per giorno
    const byDay = new Map();
    items.forEach(s => {
      if (!s.data) return;
      byDay.set(s.data, (byDay.get(s.data) || 0) + 1);
    });
    const sortedDays = [...byDay.keys()].sort();
    const labels = sortedDays.map(d => CS.fmtDate(d, { short: true }));
    const data = sortedDays.map(d => byDay.get(d));
    const dailyTarget = targetSett / 7;
    const colors = data.map(n => n >= Math.ceil(dailyTarget) ? '#00FF88' : n >= 1 ? '#B45CFF' : '#FF9A3D');
    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Sessioni/giorno',
          data,
          backgroundColor: colors.map(c => c + '55'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
        }, {
          type: 'line',
          label: `Target ${dailyTarget.toFixed(2)} sess/gg`,
          data: sortedDays.map(() => dailyTarget),
          borderColor: 'rgba(0,255,136,0.55)',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(245,245,247,0.5)', font: { family: 'JetBrains Mono', size: 10 }, precision: 0 } },
        },
        plugins: {
          legend: { display: true, labels: { color: 'rgba(245,245,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: '#B45CFF',
            bodyColor: '#F5F5F7',
            borderColor: 'rgba(180,92,255,0.4)',
            borderWidth: 1,
            padding: 10,
            callbacks: { label: ctx => ctx.dataset.label === 'Sessioni/giorno' ? `${ctx.parsed.y} sess` : `target ${ctx.parsed.y.toFixed(2)}/gg` },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  // Tooltip stem giornaliero (riusa stesso pattern di getOreStemTip)
  let _sesStemTipEl = null;
  function getSesStemTip() {
    if (_sesStemTipEl && document.body.contains(_sesStemTipEl)) return _sesStemTipEl;
    const el = document.createElement('div');
    el.className = 'arch-ore-stem-tip';
    el.setAttribute('role', 'tooltip');
    el.innerHTML = `
      <div class="tip-ring">
        <svg viewBox="0 0 56 56" width="56" height="56">
          <circle class="tip-ring-track" cx="28" cy="28" r="24" fill="none" stroke-width="5"/>
          <circle class="tip-ring-arc"   cx="28" cy="28" r="24" fill="none" stroke-width="5"
                  stroke-linecap="round" transform="rotate(-90 28 28)"
                  stroke-dasharray="150.8" stroke-dashoffset="150.8"/>
        </svg>
        <span class="tip-ring-pct">0%</span>
      </div>
      <div class="tip-body">
        <div class="tip-day"></div>
        <div class="tip-ore-row">
          <span class="tip-ore-big">0</span><span class="tip-ore-unit">sess</span>
          <span class="tip-ore-target">/ 1 target</span>
        </div>
        <div class="tip-msg"></div>
      </div>
    `;
    document.body.appendChild(el);
    _sesStemTipEl = el;
    return el;
  }
  function showSesStemTip(stem) {
    const iso = stem.dataset.stemIso;
    if (!iso) return;
    const isRest = stem.dataset.stemRest === '1';
    const sess = isRest ? 0 : Number(stem.dataset.stemSess) || 0;
    const dailyT = sessDailyTarget() || 1;
    const pct = Math.min(100, (sess / Math.max(dailyT, 0.5)) * 100);
    const color = isRest ? 'rgba(245,245,247,0.4)' : sessProgressColor(pct);
    const tip = getSesStemTip();
    const d = new Date(iso);
    const dayName = DAY_NAMES_IT[d.getDay()] || '';
    tip.querySelector('.tip-day').textContent = `${dayName} ${CS.fmtDate(iso, { long: true })}`;
    tip.querySelector('.tip-ore-big').textContent = String(sess);
    tip.querySelector('.tip-ore-unit').textContent = sess === 1 ? 'sess' : 'sess';
    tip.querySelector('.tip-ore-target').textContent = `/ ${Math.max(1, Math.round(dailyT))} target`;
    const msgEl = tip.querySelector('.tip-msg');
    if (isRest) {
      msgEl.textContent = 'Giorno di riposo';
      msgEl.style.color = 'rgba(245,245,247,0.5)';
    } else if (sess >= Math.max(1, Math.round(dailyT))) {
      msgEl.textContent = '✓ Target raggiunto';
      msgEl.style.color = color;
    } else {
      msgEl.textContent = `Sotto target (-${Math.max(1, Math.round(dailyT)) - sess} sess)`;
      msgEl.style.color = color;
    }
    const pctEl = tip.querySelector('.tip-ring-pct');
    pctEl.textContent = `${Math.round(pct)}%`;
    pctEl.style.color = color;
    const arc = tip.querySelector('.tip-ring-arc');
    const c = 150.8;
    arc.style.stroke = color;
    arc.style.strokeDashoffset = String(c * (1 - pct / 100));
    tip.querySelector('.tip-ring-track').style.stroke = 'rgba(255,255,255,0.08)';

    const rect = stem.getBoundingClientRect();
    tip.classList.add('is-visible');
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top  = rect.top - tipRect.height - 10;
    const pad = 8;
    if (left < pad) left = pad;
    if (left + tipRect.width > window.innerWidth - pad) left = window.innerWidth - tipRect.width - pad;
    if (top < pad) top = rect.bottom + 10;
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
  }
  function hideSesStemTip() {
    if (_sesStemTipEl) _sesStemTipEl.classList.remove('is-visible');
  }
  function attachSesStemTooltips(root) {
    root.querySelectorAll('.arch-ore-stem[data-stem-iso]').forEach(stem => {
      stem.addEventListener('mouseenter', () => showSesStemTip(stem));
      stem.addEventListener('mouseleave', hideSesStemTip);
      stem.addEventListener('focus',      () => showSesStemTip(stem));
      stem.addEventListener('blur',       hideSesStemTip);
    });
  }

  function postRenderSessioniOverview(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      FX.countUp(el, 0, target, 700, { decimals });
    });
    const ringHost = root.querySelector('[data-ses-ring]');
    if (ringHost) {
      const pct = Number(ringHost.dataset.pct) || 0;
      const color = ringHost.dataset.color || '#B45CFF';
      FX.ringProgress(ringHost, pct, { size: 120, stroke: 8, color, trackColor: 'rgba(255,255,255,0.08)' });
    }
    const targetSett = Number(CS.state.targetSett && CS.state.targetSett.sessioni) || 5;
    const allSess = getAllSessioniMerged();
    const period = fs.period || 'YTD';
    let items = filterByPeriod(allSess, period, 'data');
    if (fs.dateFrom) items = items.filter(s => (s.data || '') >= fs.dateFrom);
    if (fs.dateTo)   items = items.filter(s => (s.data || '') <= fs.dateTo);
    requestAnimationFrame(() => initSessioniBarChartOverview(items, targetSett));

    attachSesStemTooltips(root);
  }

  // ═══════════════════════════════════════════════════════
  //  VOLUME CONDIZIONAMENTO (esistente)
  // ═══════════════════════════════════════════════════════

  const VOLUME_TYPES = [
    { key: 'flessioni',  label: 'FLESSIONI',  icon: '💪', color: '#B45CFF', field: 'flessioni' },
    { key: 'squat',      label: 'SQUAT',      icon: '🦵', color: '#FF9A3D', field: 'squat' },
    { key: 'addominali', label: 'ADDOMINALI', icon: '🔥', color: '#00FF88', field: 'addominali' },
  ];

  function getVolumeFieldFromKey(key) {
    const t = VOLUME_TYPES.find(x => x.key === key);
    return t ? t.field : key;
  }

  function buildVolumeAggregate(typeKey) {
    const field = getVolumeFieldFromKey(typeKey);
    const revs = (CS.state.revisioni || []).filter(r => Number(r[field]) > 0);
    const totale = revs.reduce((s, r) => s + Number(r[field]), 0);
    const sessioni = revs.length;
    const media = sessioni > 0 ? totale / sessioni : 0;
    const record = revs.reduce((m, r) => Number(r[field]) > m.val ? { val: Number(r[field]), data: r.data } : m, { val: 0, data: null });
    return { totale, sessioni, media, record, items: revs };
  }

  function buildVolumeSparkline60d(typeKey) {
    const field = getVolumeFieldFromKey(typeKey);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vals = new Array(60).fill(0);
    (CS.state.revisioni || []).forEach(r => {
      const v = Number(r[field]) || 0;
      if (v <= 0 || !r.data) return;
      const d = new Date(r.data);
      if (isNaN(d)) return;
      const diff = Math.floor((today - d) / 86400000);
      if (diff < 0 || diff >= 60) return;
      vals[59 - diff] += v;
    });
    return vals;
  }

  function computeVolumeDelta30(typeKey) {
    const field = getVolumeFieldFromKey(typeKey);
    const now = Date.now();
    let curr = 0, prev = 0;
    (CS.state.revisioni || []).forEach(r => {
      const v = Number(r[field]) || 0;
      if (v <= 0 || !r.data) return;
      const ago = now - new Date(r.data).getTime();
      if (ago <= 30 * 86400000) curr += v;
      else if (ago <= 60 * 86400000) prev += v;
    });
    const deltaCount = curr - prev;
    const deltaPct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0);
    const dir = deltaCount > 0 ? 'up' : deltaCount < 0 ? 'down' : 'flat';
    return { curr, prev, deltaCount, deltaPct, dir };
  }

  function renderVolumeListL1() {
    const totals = VOLUME_TYPES.map(t => {
      const agg = buildVolumeAggregate(t.key);
      const delta = computeVolumeDelta30(t.key);
      return { ...t, agg, delta };
    });
    const grandTot = totals.reduce((s, t) => s + t.agg.totale, 0);
    const grandSess = (CS.state.revisioni || []).filter(r =>
      Number(r.flessioni) > 0 || Number(r.squat) > 0 || Number(r.addominali) > 0
    ).length;

    return `
      <div class="archive-results-head">VOLUME CONDIZIONAMENTO — ${Math.round(grandTot)} rip totali · ${grandSess} sessioni</div>
      <div class="arch-injury-stats-row">
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">RIP TOTALI</div>
          <div class="stat-val" data-cup="${Math.round(grandTot)}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">SESSIONI</div>
          <div class="stat-val" data-cup="${grandSess}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">MEDIA/SESS</div>
          <div class="stat-val" data-cup="${grandSess > 0 ? Math.round(grandTot / grandSess) : 0}">0</div>
        </div>
        <div class="arch-injury-stat-mini">
          <div class="stat-lbl">TIPI ATTIVI</div>
          <div class="stat-val" data-cup="${totals.filter(t => t.agg.sessioni > 0).length}">0</div>
        </div>
      </div>
      <div class="arch-cat-grid">
        ${totals.map(renderVolumeCard).join('')}
      </div>
    `;
  }

  function renderVolumeCard(t) {
    const dir = t.delta.dir;
    const deltaArrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const deltaLbl = t.delta.deltaCount !== 0
      ? `${deltaArrow} ${Math.abs(t.delta.deltaCount)} vs 30gg prec`
      : '→ stabile';
    return `
      <div class="arch-cat-card arch-vol-card" data-drill-key="${t.key}" data-vol-key="${t.key}" data-vol-color="${t.color}">
        <div class="arch-cat-card-row">
          <div class="arch-vol-card-head">
            <span class="arch-vol-card-ico">${t.icon}</span>
            <span class="arch-cat-card-name" style="color:${t.color}">${t.label}</span>
          </div>
          <div class="arch-cat-card-score" style="color:${t.color}" data-cup="${Math.round(t.agg.totale)}">0</div>
        </div>
        <div class="arch-cat-card-row">
          <div class="arch-cat-card-sub">${t.agg.sessioni} sessioni · max <b>${t.agg.record.val}</b></div>
          <span class="arch-cat-delta ${dir}">${deltaLbl}</span>
        </div>
        <div class="arch-vol-card-spark" data-vol-spark></div>
      </div>
    `;
  }

  function renderVolumeDetailL2(fs) {
    const typeKey = fs.drillKey;
    const t = VOLUME_TYPES.find(x => x.key === typeKey);
    if (!t) return '<div class="empty-state"><div class="empty-text">Tipo non valido</div></div>';

    const field = t.field;
    const allRevs = (CS.state.revisioni || []).filter(r => Number(r[field]) > 0);
    let filtered = allRevs;
    if (fs.dateFrom) filtered = filtered.filter(r => (r.data || '') >= fs.dateFrom);
    if (fs.dateTo)   filtered = filtered.filter(r => (r.data || '') <= fs.dateTo);

    const totale = filtered.reduce((s, r) => s + Number(r[field]), 0);
    const sessioni = filtered.length;
    const media = sessioni > 0 ? totale / sessioni : 0;
    const record = allRevs.reduce((m, r) => Number(r[field]) > m.val ? { val: Number(r[field]), data: r.data } : m, { val: 0, data: null });

    const recExtra = record.val > 0
      ? `<span class="arch-l2-record">RECORD: <b style="color:${t.color}">${record.val}</b> il ${CS.fmtDate(record.data, { short: true })}</span>`
      : '';
    const headerExtra = `
      ${filtered.length ? `<span class="muted">${filtered.length} sessioni${fs.dateFrom || fs.dateTo ? ' nel periodo' : ' · tutto'}</span>` : '<span class="muted">nessuna sessione nel periodo</span>'}
      ${recExtra}
    `;

    // Lista per mese: ogni "item" è una revisione, mostrata con valore field
    const groups = groupByMonth(filtered, 'data');

    return `
      ${renderL2Header('VOLUME CONDIZ.', `${t.icon} ${t.label}`, Math.round(totale), ' rip', t.color, headerExtra)}
      <div class="arch-injury-stats-row arch-injury-stats-l2">
        <div class="arch-injury-stat-mini"><div class="stat-lbl">TOTALE</div><div class="stat-val" data-cup="${Math.round(totale)}">0<span class="stat-unit">rip</span></div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">SESSIONI</div><div class="stat-val" data-cup="${sessioni}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">MEDIA/SESS</div><div class="stat-val" data-cup="${Math.round(media)}">0</div></div>
        <div class="arch-injury-stat-mini"><div class="stat-lbl">RECORD</div><div class="stat-val" data-cup="${record.val}">0</div></div>
      </div>
      ${renderDateFilters(fs)}
      <div class="arch-l2-chart-wrap"><canvas id="arch-trend-chart" data-vol-key="${typeKey}" data-vol-color="${t.color}"></canvas></div>
      <div class="arch-l2-list">
        ${renderMonthAccordion(groups, r => renderVolumeRow(r, t), items => {
          const tot = items.reduce((s, r) => s + Number(r[field]), 0);
          return `${items.length} sessioni · ${tot} rip totali`;
        })}
      </div>
    `;
  }

  function renderVolumeRow(r, t) {
    const val = Number(r[t.field]) || 0;
    const ore = Number(r.oreAllenamento) || Number(r.oreH) || 0;
    const note = (r.bene || r.allena || '').trim();
    return `
      <div class="arch-l2-row arch-vol-row">
        <span class="arch-l2-row-date">${CS.fmtDate(r.data, { long: true })}</span>
        <span class="arch-l2-row-mid">
          <span class="arch-vol-row-big" style="color:${t.color}">${val}</span>
          <span class="arch-vol-row-unit">rip</span>
          ${ore > 0 ? `<span class="muted"> · ${ore.toFixed(1)}h allenamento</span>` : ''}
        </span>
        ${note ? `<div class="arch-row-note">${escapeHtml(note.slice(0, 120))}</div>` : ''}
      </div>
    `;
  }

  function initVolumeBarChart(items, typeKey, color) {
    if (archiveChart) { try { archiveChart.destroy(); } catch (e) {} archiveChart = null; }
    const canvas = document.getElementById('arch-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !items || !items.length) return;
    const field = getVolumeFieldFromKey(typeKey);
    const sorted = [...items].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const labels = sorted.map(r => CS.fmtDate(r.data, { short: true }));
    const data = sorted.map(r => Number(r[field]) || 0);

    archiveChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ripetizioni',
          data,
          backgroundColor: color + '55',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(245,245,247,0.5)',
              font: { family: 'JetBrains Mono', size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: 'rgba(245,245,247,0.5)',
              font: { family: 'JetBrains Mono', size: 10 },
              precision: 0,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(20,20,24,0.96)',
            titleColor: color,
            bodyColor: '#F5F5F7',
            borderColor: color + '66',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => `${ctx.parsed.y} rip`,
            },
          },
        },
        animation: { duration: 600, easing: 'easeInOutQuart' },
      },
    });
  }

  function postRenderVolume(fs) {
    const root = document.getElementById('archive-results');
    if (!root) return;
    // countUp tutti i numeri data-cup
    root.querySelectorAll('[data-cup]').forEach(el => {
      const target = Number(el.dataset.cup) || 0;
      FX.countUp(el, 0, target, 700, { decimals: 0 });
    });
    if (!fs.drillKey) {
      // L1: sparkline per ogni card + stagger
      root.querySelectorAll('.arch-vol-card').forEach(card => {
        const key = card.dataset.volKey;
        const color = card.dataset.volColor || '#B45CFF';
        const host = card.querySelector('[data-vol-spark]');
        if (host && key) {
          const vals = buildVolumeSparkline60d(key);
          // hex → rgba con alpha 0.18 per il fill
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          FX.drawSparkline(host, vals, {
            height: 36, color,
            fill: `rgba(${r},${g},${b},0.18)`,
          });
        }
      });
      const grid = root.querySelector('.arch-cat-grid');
      if (grid) FX.staggerIn(grid, '.arch-vol-card', 80);
    } else {
      // L2: chart bar per giorno
      const t = VOLUME_TYPES.find(x => x.key === fs.drillKey);
      if (!t) return;
      const field = t.field;
      const allRevs = (CS.state.revisioni || []).filter(r => Number(r[field]) > 0);
      let filtered = allRevs;
      if (fs.dateFrom) filtered = filtered.filter(r => (r.data || '') >= fs.dateFrom);
      if (fs.dateTo)   filtered = filtered.filter(r => (r.data || '') <= fs.dateTo);
      requestAnimationFrame(() => initVolumeBarChart(filtered, fs.drillKey, t.color));
    }
  }

  // ═══════════════════════════════════════════════════════
  // 6. ROUTE REGISTRATION
  // ═══════════════════════════════════════════════════════

  ROUTER.register('archivio/panoramica', renderPanoramica, attachPanoramicaHandlers);
  ROUTER.register('archivio/focus',      () => renderSection('focus'),     () => attachHandlers('focus'));
  ROUTER.register('archivio/fisica',     () => renderSection('fisica'),    () => attachHandlers('fisica'));
  ROUTER.register('archivio/tecnica',    () => renderSection('tecnica'),   () => attachHandlers('tecnica'));
  ROUTER.register('archivio/revisioni',  () => renderSection('revisioni'), () => attachHandlers('revisioni'));
  // archivio v3.2: 'infortuni' è ora pill di 'fisica'; route stand-alone rimossa.
  // Backward-compat: vecchi link #/archivio/infortuni reindirizzano a fisica/infortuni
  ROUTER.register('archivio/infortuni',  () => {
    filterState.fisica.pill = 'infortuni';
    return renderSection('fisica');
  }, () => attachHandlers('fisica'));

})();
