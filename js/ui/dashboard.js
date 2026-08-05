/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8.1 — DASHBOARD "VIVA" (Fase B)
   Ring settimana + barre verticali animate + countUp widget
   ═══════════════════════════════════════════════════════ */

(function () {

  // ─── MAIN RENDER ────────────────────────────────────
  function renderDashboard() {
    const today = new Date();
    const wk    = CS.weekKey(today).split('-W')[1] || '—';
    const range = CS.weekRange(today);
    const days  = CS.daysOfWeek(today);
    const alerts = getCriticalAlerts();

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">DASH<span class="accent">BOARD</span></h1>
          <div class="page-sub">${formatWeekday(today)} · ${CS.fmtDate(today, { long: true })}</div>
        </div>
      </div>

      ${briefingStrip()}

      ${weekHero(wk, range, days)}

      <div class="widget-row widget-row-3" id="dash-widget-row-1">
        ${widgetPeso()}
        ${widgetOreSett()}
        ${widgetStreak()}
      </div>

      <div class="widget-row widget-row-2">
        ${widgetVolumi()}
        ${widgetProssimoObiettivo()}
      </div>

      ${alerts.length ? alertBar(alerts) : ''}
    `;
  }

  // ─── IL PUNTO (briefing del secondo cervello) ───────
  function briefingStrip() {
    if (typeof ASSISTANT === 'undefined' || !ASSISTANT.getBriefing) return '';
    const b = ASSISTANT.getBriefing();
    if (!b) return '';
    const chips = (b.chips || []).map((c, i) => `
      <span class="brief-chip ${c.gold ? 'is-gold' : ''} ${c.dir ? 'dir-' + c.dir : ''}" style="--i:${i}">
        <span class="brief-chip-k">${c.k}</span><span class="brief-chip-v">${c.v}</span>
      </span>`).join('');
    const rischio = b.rischio
      ? `<div class="brief-line brief-rischio"><span class="brief-dot"></span><span>${b.rischio}</span></div>`
      : '';
    return `
      <div class="panel brief-strip brief-sev-${b.topSeverity}" id="dash-brief" title="Apri l'assistente">
        <div class="brief-ring-col">
          <div class="brief-ring" data-brief-ring></div>
          <div class="brief-ring-lbl">SETTIMANA</div>
        </div>
        <div class="brief-main">
          <div class="brief-head">
            <span class="brief-title">IL PUNTO</span>
            <span class="brief-fascia">${b.fascia.toUpperCase()}</span>
          </div>
          <div class="brief-chips">${chips}</div>
          <div class="brief-line brief-direzione">
            <span class="brief-ico">${b.topIcon}</span><span>${b.direzione}</span>
          </div>
          ${rischio}
        </div>
      </div>`;
  }

  function initBriefRing() {
    const host = document.querySelector('[data-brief-ring]');
    const b = (typeof ASSISTANT !== 'undefined' && ASSISTANT.getBriefing) ? ASSISTANT.getBriefing() : null;
    if (!host || !b || b.weekPct == null || typeof FX === "undefined" || !FX.ringProgress) return;
    const color = b.weekPct >= 100 ? 'var(--ok)' : 'var(--neon)';
    FX.ringProgress(host, Math.min(100, b.weekPct), {
      size: 62, stroke: 5, color, center: `${b.weekPct}%`,
      trackColor: 'rgba(255,255,255,0.06)',
    });
  }

  // ─── HERO SETTIMANA ─────────────────────────────────
  function weekHero(wkNum, range, days) {
    const startStr = CS.fmtDate(range.start, { short: true });
    const endStr   = CS.fmtDate(range.end,   { short: true });

    const giorniTarget = (CS.state.criteriOro?.sett?.giorniAllenamento) || 6;
    const allenati = days.filter(d => CALC.dayStatus(d) === 'allenato').length;
    const wkCheck  = CALC.settimanaTopCheck(new Date());
    const ringPct  = Math.min(100, (allenati / giorniTarget) * 100);
    const variant  = wkCheck.gold ? 'gold' : 'neon';

    return `
      <div class="panel week-hero">
        <div class="week-hero-head">
          <div>
            <div class="week-hero-title">SETTIMANA <span class="accent">${wkNum}</span></div>
            <div class="week-hero-range">${startStr} → ${endStr}</div>
          </div>
          <button class="btn-cta btn-log-today" id="btn-log-today">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>LOG OGGI</span>
          </button>
        </div>
        <div class="week-hero-body">
          <div class="wh-ring-wrap" id="wh-ring"
               data-pct="${ringPct.toFixed(0)}"
               data-center="${allenati}/${giorniTarget}"
               data-label="GIORNI"
               data-variant="${variant}"></div>
          <div class="wh-bars" id="wh-bars">${buildBars(days)}</div>
        </div>
        ${buildOroStrip(wkCheck)}
        <div class="week-day-preview" id="week-day-preview" hidden></div>
      </div>
    `;
  }

  function buildBars(days) {
    const MAX_H = 4; // 4h = barra piena (100%)
    return days.map(d => {
      const iso    = CS.isoDateOnly(d);
      const status = CALC.dayStatus(d);
      const rev    = CS.getRevByDate(iso);
      const ore    = (rev && !rev.riposo) ? Math.max(0, Number(rev.oreAllenamento) || 0) : 0;
      const fillH  = status === 'riposo' ? 6
                   : ore > 0             ? Math.min(100, (ore / MAX_H) * 100)
                   : 0;
      const name     = ['DOM','LUN','MAR','MER','GIO','VEN','SAB'][d.getDay()];
      const num      = d.getDate();
      const disabled = status === 'futuro';
      const title    = ore > 0 ? CS.fmtDurata(ore) : statusLabel(status);
      return `
        <button class="day-bar-col day-bar-${status}" data-iso="${iso}"
                ${disabled ? 'disabled' : ''} title="${title}">
          <div class="day-bar-track">
            <div class="day-bar-fill" data-h="${fillH.toFixed(1)}" style="height:0%"></div>
          </div>
          <div class="day-bar-foot">
            <span class="day-bar-name">${name}</span>
            <span class="day-bar-num">${num}</span>
          </div>
        </button>`;
    }).join('');
  }

  function statusLabel(s) {
    return { allenato: '✓', riposo: '○', oggi: '◎', perso: '✕', futuro: '—' }[s] || '—';
  }

  function buildOroStrip(wkCheck) {
    if (wkCheck.gold) {
      return `<div class="wh-oro-strip is-gold"><span>🏆</span> SETTIMANA D'ORO</div>`;
    }
    const pills = wkCheck.criteri.map(c =>
      `<span class="wh-oro-pill${c.met ? ' met' : ''}" title="${c.label}">${c.val}</span>`
    ).join('');
    return `
      <div class="wh-oro-strip">
        <span class="wh-oro-count">${wkCheck.met}<span class="wh-oro-total">/4</span></span>
        <span class="wh-oro-sep">·</span>
        ${pills}
      </div>`;
  }

  function formatWeekday(d) {
    return ['DOMENICA','LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ','SABATO'][d.getDay()];
  }

  // ─── WIDGET PESO ────────────────────────────────────
  function widgetPeso() {
    const current = CALC.pesoCurrent();
    const target  = CS.state.profile.pesoTarget;
    const delta   = current && target ? (current - target) : null;
    const deltaText = delta === null ? '—'
      : delta > 0  ? `↓ -${delta.toFixed(1)} kg al target`
      : delta < 0  ? `↑ +${Math.abs(delta).toFixed(1)} kg sotto target`
      : '🎯 al target';
    const deltaCls = delta === null ? '' : delta > 0 ? 'warn' : delta < 0 ? 'info' : 'good';

    return `
      <div class="widget-card fx-lift" id="widget-peso">
        <div class="widget-card-head">
          <div class="widget-label">PESO</div>
          <a class="widget-link" href="#/fisica/peso">›</a>
        </div>
        <div class="widget-big">
          <span id="dash-peso-val" data-to="${current ? current.toFixed(2) : ''}"
                data-dec="1">${current ? current.toFixed(1) : '—'}</span>
          <span class="widget-unit">kg</span>
        </div>
        <div class="widget-sub ${deltaCls}">${deltaText}</div>
        <div class="widget-spark" id="dash-peso-spark" style="height:36px"></div>
      </div>`;
  }

  // ─── WIDGET ORE SETTIMANA ───────────────────────────
  function widgetOreSett() {
    const o = CALC.oreSettVsTarget(new Date());
    const deltaText = o.deltaVsPrev > 0 ? `↑ +${CS.fmtDurata(o.deltaVsPrev)} vs scorsa`
                    : o.deltaVsPrev < 0 ? `↓ ${CS.fmtDurata(o.deltaVsPrev)} vs scorsa`
                    : '= come scorsa';
    const deltaCls = o.deltaVsPrev > 0 ? 'good' : o.deltaVsPrev < 0 ? 'warn' : '';

    return `
      <div class="widget-card fx-lift" id="widget-ore">
        <div class="widget-card-head">
          <div class="widget-label">ORE SETTIMANA</div>
          <a class="widget-link" href="#/tecnica/sessioni">›</a>
        </div>
        <div class="widget-big">
          <span id="dash-ore-val" data-to="${o.ore.toFixed(2)}">${CS.fmtDurataCompatta(o.ore)}</span>
          <span class="widget-unit">/ ${CS.fmtDurataCompatta(o.target)}</span>
        </div>
        ${UI.progressBar(o.pct, { color: 'var(--neon)' })}
        <div class="widget-sub ${deltaCls}">${deltaText}</div>
      </div>`;
  }

  // ─── WIDGET STREAK ──────────────────────────────────
  function widgetStreak() {
    const streak = CALC.streakDays();
    const today  = new Date();
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (13 - i));
      const status = CALC.dayStatus(d);
      return `<span class="streak-tick streak-${status}"></span>`;
    }).join('');

    return `
      <div class="widget-card fx-lift" id="widget-streak">
        <div class="widget-card-head">
          <div class="widget-label">STREAK</div>
          <span class="widget-link">🥊</span>
        </div>
        <div class="widget-big">
          <span id="dash-streak-val" data-to="${streak}">${streak}</span>
          <span class="widget-unit">${streak === 1 ? 'giorno' : 'giorni'}</span>
        </div>
        <div class="widget-sub">consecutivi</div>
        <div class="streak-strip">${last14}</div>
      </div>`;
  }

  // ─── WIDGET VOLUMI SETTIMANA ────────────────────────
  function widgetVolumi() {
    const v = CALC.volumiSett(new Date());
    const c = (CS.state.criteriOro && CS.state.criteriOro.sett) || {};
    const g = c.giorniAllenamento || 6;
    const tFless = (c.flessioniGiorno || 50) * g;
    const tSquat = (c.squatGiorno    || 50) * g;
    const tAdd   = 100 * g;
    const tKm    = (CS.state.targetSett && CS.state.targetSett.kmCorsa) || 20;

    const rows = [
      { ico: '💪', name: 'Flessioni',  cur: v.flessioni,  tar: tFless, unit: '' },
      { ico: '🦵', name: 'Squat',      cur: v.squat,      tar: tSquat, unit: '' },
      { ico: '🔥', name: 'Addominali', cur: v.addominali, tar: tAdd,   unit: '' },
      { ico: '🏃', name: 'Km corsa',   cur: v.kmCorsa,    tar: tKm,    unit: 'km' },
    ];
    const rowsHtml = rows.map(r => {
      const pct = r.tar > 0 ? Math.min(100, (r.cur / r.tar) * 100) : 0;
      return `
        <div class="vol-row">
          <span class="vol-ico">${r.ico}</span>
          <span class="vol-name">${r.name}</span>
          <span class="vol-val">${Math.round(r.cur)}${r.unit ? ' ' + r.unit : ''} <span class="vol-target">/ ${r.tar}</span></span>
          <span class="vol-bar"><span class="vol-bar-fill" style="width:${pct}%"></span></span>
        </div>`;
    }).join('');

    return `
      <div class="widget-card widget-card-wide">
        <div class="widget-card-head">
          <div class="widget-label">VOLUMI SETTIMANA</div>
          <a class="widget-link" href="#/archivio/revisioni">›</a>
        </div>
        <div class="vol-grid">${rowsHtml}</div>
      </div>`;
  }

  // ─── WIDGET PROSSIMO OBIETTIVO ──────────────────────
  function widgetProssimoObiettivo() {
    const nx = CALC.prossimoObiettivo();
    if (!nx) {
      return `
        <div class="widget-card widget-card-wide">
          <div class="widget-card-head">
            <div class="widget-label">PROSSIMO OBIETTIVO</div>
            <a class="widget-link" href="#/focus/obiettivi">›</a>
          </div>
          <div class="empty-state">
            <div class="empty-ico">🎯</div>
            <div class="empty-text">Nessun obiettivo attivo</div>
            <a class="btn-link" href="#/focus/obiettivi">+ aggiungi obiettivo</a>
          </div>
        </div>`;
    }
    const p = CALC.progressObiettivo(nx.obj);
    const daysLeft = nx.daysLeft;
    const daysText = daysLeft <= 0 ? '⏱ scaduto'
                   : daysLeft === 1 ? '⏱ 1 giorno'
                   : `⏱ ${daysLeft} giorni`;
    const scadLbl = { giornaliero:'oggi', settimanale:'sett', mensile:'mese', annuale:'anno' }[nx.obj.scadenza] || nx.obj.scadenza;

    return `
      <div class="widget-card widget-card-wide">
        <div class="widget-card-head">
          <div class="widget-label">PROSSIMO OBIETTIVO</div>
          <a class="widget-link" href="#/focus/obiettivi">›</a>
        </div>
        <div class="goal-line">
          <div class="goal-title">${nx.obj.descrizione || 'Senza titolo'}</div>
          <div class="goal-meta">
            <span class="goal-chip">${scadLbl}</span>
            <span class="goal-days">${daysText}</span>
          </div>
        </div>
        <div class="goal-progress">
          <span class="goal-num">${formatNum(p.current)} / ${formatNum(nx.obj.target)} ${nx.obj.unita || ''}</span>
          <span class="goal-pct">${Math.round(p.pct)}%</span>
        </div>
        ${UI.progressBar(p.pct, { color: 'var(--neon)' })}
      </div>`;
  }

  function formatNum(n) {
    if (n === null || n === undefined) return '—';
    return Number.isInteger(n) ? n : Number(n).toFixed(1);
  }

  // ─── ALERT BAR ──────────────────────────────────────
  function getCriticalAlerts() {
    if (typeof ASSISTANT === 'undefined' || !ASSISTANT.getMessages) return [];
    return (ASSISTANT.getMessages() || [])
      .filter(m => m.severity === 'critica' || m.severity === 'attenzione')
      .slice(0, 3);
  }

  function alertBar(alerts) {
    const items = alerts.map(m => `
      <div class="alert-item alert-${m.severity}">
        <span class="alert-ico">${m.severity === 'critica' ? '⚠⚠' : '⚠'}</span>
        <span class="alert-persona">${m.persona || ''}</span>
        <span class="alert-text">${m.text || ''}</span>
      </div>`).join('');
    return `
      <div class="panel alert-bar" id="dash-alert-bar">
        <div class="panel-title">ALERT ASSISTENTE</div>
        <div class="alert-list">${items}</div>
        <a class="alert-link" href="#/assistente/coach">vedi tutti gli alert ›</a>
      </div>`;
  }

  // ─── DAY PREVIEW ────────────────────────────────────
  function renderDayPreview(iso) {
    const rev      = CS.getRevByDate(iso);
    const dateObj  = new Date(iso);
    const status   = CALC.dayStatus(dateObj);
    const fullDate = CS.fmtDate(iso, { long: true });

    if (!rev) {
      const logBtn = status === 'oggi' || status === 'perso'
        ? `<button class="btn-cta btn-cta-sm" id="btn-prev-log-today" data-recover="${iso}">+ COMPILA REVISIONE</button>`
        : '';
      return `
        <div class="preview-inline">
          <div class="preview-head">
            <strong>${status === 'oggi' ? 'OGGI · ' : ''}${fullDate}</strong>
            <button class="btn-close-preview" data-close="1">✕</button>
          </div>
          <div class="preview-body">
            <div class="preview-empty">Nessuna revisione registrata.</div>
            ${logBtn}
          </div>
        </div>`;
    }

    const moods = (rev.mood || []).map(m => {
      const meta = CS.MOOD_LIST.find(x => x.id === m);
      return meta ? `${meta.icon} ${meta.label}` : m;
    }).join(' · ') || '—';
    const tipi = (rev.tipo || []).map(t => {
      const meta = CS.TIPI_ALLENAMENTO.find(x => x.id === t);
      return meta ? `${meta.icon} ${meta.label}` : t;
    }).join(' · ') || '—';

    return `
      <div class="preview-inline">
        <div class="preview-head">
          <strong>${fullDate}${status === 'oggi' ? ' · OGGI' : ''}</strong>
          <button class="btn-close-preview" data-close="1">✕</button>
        </div>
        <div class="preview-body">
          <div class="preview-grid">
            <div class="preview-item">
              <span class="preview-lbl">Allenamento</span>
              <span class="preview-val">${CS.fmtDurata(Number(rev.oreAllenamento) || 0)} · ${tipi}</span>
            </div>
            <div class="preview-item">
              <span class="preview-lbl">Tecnica</span>
              <span class="preview-val">${rev.tecnica || '—'} / 10</span>
            </div>
            <div class="preview-item">
              <span class="preview-lbl">Intensità · Affaticamento</span>
              <span class="preview-val">${rev.intensita || '—'} / ${rev.affaticamento || '—'}</span>
            </div>
            <div class="preview-item">
              <span class="preview-lbl">Sonno</span>
              <span class="preview-val">${rev.sonnoOre ? CS.fmtDurata(rev.sonnoOre) : '—'} · qualità ${rev.sonnoQualita || '—'}/5</span>
            </div>
            <div class="preview-item">
              <span class="preview-lbl">Volumi</span>
              <span class="preview-val">${rev.flessioni || 0} fless · ${rev.squat || 0} squat · ${rev.addominali || 0} add · ${rev.kmCorsa || 0} km</span>
            </div>
            <div class="preview-item">
              <span class="preview-lbl">Mood</span>
              <span class="preview-val">${moods}</span>
            </div>
          </div>
          ${rev.bene    ? `<div class="preview-note"><span class="preview-note-lbl">Bene:</span> ${escapeHtml(rev.bene)}</div>` : ''}
          ${rev.migliora ? `<div class="preview-note"><span class="preview-note-lbl">Migliorare:</span> ${escapeHtml(rev.migliora)}</div>` : ''}
          <div class="preview-actions">
            <button class="btn btn-sm" data-edit="${iso}">edit</button>
          </div>
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g,
      c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  // ─── AFTER RENDER — tutte le animazioni FX ──────────
  function afterRender() {
    document.getElementById('dash-brief')?.addEventListener('click', () => ROUTER.go('assistente'));
    initBriefRing();
    initRing();
    initBars();
    initCountUp();
    initSparklines();
    initStagger();
    initAlertBreathe();
    initLogBtn();
    initDayHandlers();
  }

  function initRing() {
    const wrap = document.getElementById('wh-ring');
    if (!wrap || typeof FX === 'undefined') return;
    FX.ringProgress(wrap,
      parseFloat(wrap.dataset.pct) || 0,
      {
        size: 100, stroke: 7,
        center: wrap.dataset.center || '0/6',
        label:  wrap.dataset.label  || 'GIORNI',
        variant: wrap.dataset.variant || 'neon',
      }
    );
  }

  function initBars() {
    if (typeof FX === 'undefined' || FX.reduceMotion()) {
      document.querySelectorAll('.day-bar-fill').forEach(el => {
        el.style.height = (parseFloat(el.dataset.h) || 0) + '%';
      });
      return;
    }
    document.querySelectorAll('.day-bar-fill').forEach((el, i) => {
      const h = parseFloat(el.dataset.h) || 0;
      setTimeout(() => {
        el.style.transition = 'height 650ms cubic-bezier(0.16,1,0.3,1)';
        el.style.height = h + '%';
      }, i * 50);          // stagger colonne
    });
  }

  function initCountUp() {
    if (typeof FX === 'undefined') return;
    const peso   = CALC.pesoCurrent();
    const ore    = CALC.oreSettVsTarget(new Date()).ore;
    const streak = CALC.streakDays();

    const pesoEl   = document.getElementById('dash-peso-val');
    const oreEl    = document.getElementById('dash-ore-val');
    const streakEl = document.getElementById('dash-streak-val');

    if (pesoEl   && peso)   FX.countUp(pesoEl,   0, peso,   900, { decimals: 1 });
    if (oreEl)              FX.countUp(oreEl,    0, ore,    800, { format: v => CS.fmtDurataCompatta(v) });
    if (streakEl)           FX.countUp(streakEl, 0, streak, 700);
  }

  function initSparklines() {
    if (typeof FX === 'undefined') return;
    const el = document.getElementById('dash-peso-spark');
    if (el) {
      FX.drawSparkline(el, CALC.sparkPesoMese(), {
        height: 36,
        color:  'var(--neon)',
        fill:   'rgba(180,92,255,0.08)',
        hoverTip: true,
        valueFormatter: v => v.toFixed(1) + ' kg',
      });
    }
  }

  function initStagger() {
    if (typeof FX === 'undefined') return;
    const row = document.getElementById('dash-widget-row-1');
    if (row) FX.staggerIn(row, '.widget-card', 80);
  }

  function initAlertBreathe() {
    if (typeof FX === 'undefined') return;
    const bar = document.getElementById('dash-alert-bar');
    if (bar) FX.breathe(bar, 0.6, { variant: 'danger' });
  }

  function initLogBtn() {
    const btn = document.getElementById('btn-log-today');
    if (btn) btn.addEventListener('click', () => {
      if (typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily)
        REV_FORMS.openDaily(CS.todayISO());
    });
  }

  function initDayHandlers() {
    document.querySelectorAll('.day-bar-col').forEach(btn => {
      btn.addEventListener('click', () => {
        const iso     = btn.dataset.iso;
        if (!iso) return;
        const isToday = iso === CS.todayISO();
        const rev     = CS.getRevByDate(iso);

        // oggi senza revisione → apri direttamente modale
        if (isToday && !rev && typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily) {
          REV_FORMS.openDaily(iso);
          return;
        }

        const preview = document.getElementById('week-day-preview');
        if (!preview) return;
        preview.hidden = false;
        preview.innerHTML = renderDayPreview(iso);
        attachPreviewHandlers(preview, iso);

        document.querySelectorAll('.day-bar-col').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  function attachPreviewHandlers(preview, iso) {
    preview.querySelector('[data-close]')?.addEventListener('click', () => {
      preview.hidden = true;
      preview.innerHTML = '';
      document.querySelectorAll('.day-bar-col').forEach(b => b.classList.remove('selected'));
    });
    preview.querySelector('[data-edit]')?.addEventListener('click', () => {
      if (typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily) REV_FORMS.openDaily(iso);
    });
    const logBtn = preview.querySelector('#btn-prev-log-today, [data-recover]');
    if (logBtn) logBtn.addEventListener('click', () => {
      const date = logBtn.dataset.recover || iso;
      if (typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily) REV_FORMS.openDaily(date);
    });
  }

  // ─── REGISTRAZIONE ─────────────────────────────────
  ROUTER.register('dashboard', renderDashboard, afterRender);

  window.addEventListener('cs:rev-saved', () => {
    if (ROUTER.current().section === 'dashboard') ROUTER.go('dashboard');
  });
  window.addEventListener('cs:weight-saved', () => {
    if (ROUTER.current().section === 'dashboard') ROUTER.go('dashboard');
  });

})();
