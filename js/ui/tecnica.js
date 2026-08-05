/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8.1 — TECNICA ("RESPIRO")
   Sub-routes: vota · aree · fondamentali · sessioni · infortuni
   Riscritta 2026-06-23 (Fase C — concept "respiro" v8.1)
   ═══════════════════════════════════════════════════════ */

(function () {

  const FOND_ICONS = {
    'Sacco': '🥊', 'Corda': '🪢', 'Vuoto Normale': '👤', 'Vuoto Pesi': '💪',
    'Sparring': '🤜', 'Figure': '🎯', 'Palestra': '🏋',
  };

  const AREE_ICONS = {
    'Jab': '👊', 'Diretto': '💥', 'Gancio': '🪝', 'Montante': '🚀',
    'Difesa': '🛡', 'Cambio Ritmo': '🎵', 'Distanza': '📏', 'Footwork': '👟',
    'Combinazioni': '🔗', 'Potenza': '⚡', 'Resistenza': '🔋', 'Velocità': '💨',
    'Testa': '🧠',
  };

  // Stato locale (preserva selezione tra render)
  const VS = {
    votaPeriodo: 30,
    areePeriodo: 30,
    fondPeriodo: 30,
    areeSort: 'voto',         // 'nome' | 'voto' | 'trend' | 'n'
    fondSort: 'voto',
    sessMonthCursor: null,    // Date primo giorno del mese visualizzato
    sessSelectedDate: null,   // iso date selezionata nella heatmap
  };

  // ════════════════════════════════════════════════════
  // SUB-TAB 1 — VOTA (grid 14 aree + 8 fondamentali tap-to-rate)
  // ════════════════════════════════════════════════════

  function renderVota() {
    const aree = CS.AREE_TECNICHE || [];
    const fond = CS.FONDAMENTALI || [];

    const votatiAree = countVotatiAree(VS.votaPeriodo);
    const votatiFond = countVotatiFond(VS.votaPeriodo);
    const totAree = aree.length;
    const totFond = fond.length;
    const pctAree = totAree ? Math.round((votatiAree / totAree) * 100) : 0;
    const pctFond = totFond ? Math.round((votatiFond / totFond) * 100) : 0;

    const periodoLabel = VS.votaPeriodo === 1 ? 'OGGI'
      : VS.votaPeriodo === 7 ? '7 GG'
      : VS.votaPeriodo === 30 ? '30 GG' : '90 GG';

    const periodi = [
      { v: 1,  lbl: 'OGGI' },
      { v: 7,  lbl: '7G'   },
      { v: 30, lbl: '30G'  },
      { v: 90, lbl: '90G'  },
    ];

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title fx-scramble" data-text="VOTA"><span class="accent">VOTA</span></h1>
          <div class="page-sub">Tap su un'area o un fondamentale per valutare · periodo ${periodoLabel}</div>
        </div>
        <div class="vota-period-pills">
          ${periodi.map(p => `
            <button class="vota-pill ${p.v === VS.votaPeriodo ? 'active' : ''}" data-period="${p.v}">${p.lbl}</button>
          `).join('')}
        </div>
      </div>

      <div class="vota-layout">
        <aside class="vota-counter">
          <div class="vota-counter-card">
            <div class="vota-counter-label">AREE</div>
            <div class="vota-counter-ring" id="vota-ring-aree"></div>
            <div class="vota-counter-text"><span class="fx-count" data-from="0" data-to="${votatiAree}">${votatiAree}</span>/${totAree}</div>
          </div>
          <div class="vota-counter-card">
            <div class="vota-counter-label">FONDAMENTALI</div>
            <div class="vota-counter-ring" id="vota-ring-fond"></div>
            <div class="vota-counter-text"><span class="fx-count" data-from="0" data-to="${votatiFond}">${votatiFond}</span>/${totFond}</div>
          </div>
          <div class="vota-tip">
            <div class="vota-tip-title">▌COME FUNZIONA</div>
            <div class="vota-tip-text">Slider 0-10, poi 3 note rapide: <strong>BENE / MALE / MIGLIORA</strong>. Salva e passa al prossimo.</div>
          </div>
        </aside>

        <div class="vota-main">
          <div class="vota-section-title">
            <span>AREE TECNICHE</span>
            <span class="vota-section-meta">${pctAree}% coperte nel periodo</span>
          </div>
          <div class="vota-grid vota-grid-aree" data-stagger>
            ${aree.map(a => votaCard('area', a, VS.votaPeriodo)).join('')}
          </div>

          <div class="vota-section-title" style="margin-top:var(--sp-5)">
            <span>FONDAMENTALI</span>
            <span class="vota-section-meta">${pctFond}% coperti nel periodo</span>
          </div>
          <div class="vota-grid vota-grid-fond" data-stagger>
            ${fond.map(f => votaCard('fond', f, VS.votaPeriodo)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function countVotatiAree(days) {
    const start = new Date(); start.setDate(start.getDate() - days);
    const set = new Set();
    (CS.state.areeVoti || []).forEach(v => {
      if (new Date(v.data) >= start) set.add(v.area);
    });
    return set.size;
  }

  function countVotatiFond(days) {
    const start = new Date(); start.setDate(start.getDate() - days);
    const set = new Set();
    (CS.state.fondVoti || []).forEach(v => {
      if (new Date(v.data) >= start) set.add(v.esercizio);
    });
    return set.size;
  }

  function votaCard(kind, name, days) {
    const isArea = kind === 'area';
    const voto = isArea ? CALC.votoMedioArea(name, days) : CALC.votoMedioFond(name, days);
    const voto60 = isArea ? CALC.votoMedioArea(name, days * 2) : CALC.votoMedioFond(name, days * 2);
    const trend = (voto && voto60) ? voto - voto60 : 0;
    const trendIco = trend > 0.3 ? '↗' : trend < -0.3 ? '↘' : '→';
    const trendCls = trend > 0.3 ? 'good' : trend < -0.3 ? 'warn' : '';
    const icon = isArea ? '◆' : (FOND_ICONS[name] || '◆');
    const pct = voto ? Math.round((voto / 10) * 100) : 0;
    const strength = (voto || 0) / 10;
    const variant = strength >= 0.7 ? 'gold' : strength >= 0.4 ? 'neon' : 'info';

    // Storico completo (per back)
    const allArr = isArea
      ? (CS.state.areeVoti || []).filter(v => v.area === name)
      : (CS.state.fondVoti || []).filter(v => v.esercizio === name);
    const allVoti = allArr.slice(-12).map(v => v.voto);
    const ultimoVoto = allArr.length ? Number(allArr[allArr.length - 1].voto) : null;
    const ultimaNota = allArr.length ? (allArr[allArr.length - 1].note || '') : '';
    const nVoti = allArr.length;

    // Descrizione trend (verbale)
    let trendDesc = '—', trendDescCls = '';
    if (voto && voto60) {
      if (trend > 0.7) { trendDesc = `In netta crescita · +${trend.toFixed(1)} vs ${days * 2}gg fa`; trendDescCls = 'good'; }
      else if (trend > 0.3) { trendDesc = `In crescita · +${trend.toFixed(1)} vs ${days * 2}gg fa`; trendDescCls = 'good'; }
      else if (trend < -0.7) { trendDesc = `In netto calo · ${trend.toFixed(1)} vs ${days * 2}gg fa`; trendDescCls = 'warn'; }
      else if (trend < -0.3) { trendDesc = `In calo · ${trend.toFixed(1)} vs ${days * 2}gg fa`; trendDescCls = 'warn'; }
      else { trendDesc = `Stabile · ${(trend >= 0 ? '+' : '') + trend.toFixed(1)}`; trendDescCls = ''; }
    } else if (voto) {
      trendDesc = `Primo periodo · serve più storico per trend`;
    }

    return `
      <div class="vota-card vota-flip ${voto ? 'has-data' : 'empty'} ${trendCls}"
           data-kind="${kind}" data-name="${escapeHtml(name)}"
           data-strength="${strength.toFixed(2)}" data-variant="${variant}"
           tabindex="0" role="button"
           title="Click per valutare ${escapeHtml(name)}">
        <div class="vota-flip-inner">

          <div class="vota-flip-front">
            <span class="vota-card-glow"></span>
            <span class="vota-card-icon">${icon}</span>
            <span class="vota-card-name">${escapeHtml(name).toUpperCase()}</span>
            <span class="vota-card-voto">
              <span class="vota-card-voto-num fx-count" data-from="0" data-to="${voto || 0}" data-decimals="1">
                ${voto ? voto.toFixed(1) : '—'}
              </span>
              <span class="vota-card-voto-suf">/10</span>
            </span>
            <span class="vota-card-bar"><span class="vota-card-bar-fill" style="--w:${pct}%"></span></span>
            <span class="vota-flip-hint">hover · dettagli · click per valutare</span>
          </div>

          <div class="vota-flip-back">
            <div class="vota-back-head">
              <span class="vota-card-name">${escapeHtml(name).toUpperCase()}</span>
              <span class="vota-back-meta">${nVoti} ${nVoti === 1 ? 'voto' : 'voti'}</span>
            </div>
            <div class="vota-spark-large" data-spark-large="${allVoti.join(',')}"></div>
            <div class="vota-back-info">
              <div class="vota-trend-line ${trendDescCls}">${trendDesc}</div>
              ${ultimaNota
                ? `<div class="vota-last-note"><span class="lbl">ULTIMA NOTA</span><div class="txt">${escapeHtml(ultimaNota)}</div></div>`
                : nVoti === 0
                  ? `<div class="vota-last-note muted">Nessun voto ancora — click per iniziare</div>`
                  : `<div class="vota-last-note muted">Nessuna nota sull'ultimo voto</div>`}
            </div>
            <div class="vota-flip-hint vota-flip-hint-back">click per valutare →</div>
          </div>

        </div>
      </div>
    `;
  }

  function recentVoti(kind, name, n) {
    const arr = kind === 'area'
      ? (CS.state.areeVoti || []).filter(v => v.area === name)
      : (CS.state.fondVoti || []).filter(v => v.esercizio === name);
    return arr.slice(-n).map(v => v.voto);
  }

  function afterVota() {
    // Period pills
    document.querySelectorAll('.vota-pill').forEach(b => {
      b.addEventListener('click', () => {
        VS.votaPeriodo = Number(b.dataset.period);
        ROUTER.go('tecnica', 'vota');
      });
    });
    // Click card → modal (anche da tastiera)
    document.querySelectorAll('.vota-card').forEach(card => {
      const openModal = () => {
        const kind = card.dataset.kind;
        const name = card.dataset.name;
        openVotaModal(kind, name);
      };
      card.addEventListener('click', openModal);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
      });
      // Breathe modulato dal voto (solo lato front per non distorcere la flip)
      const s = Number(card.dataset.strength) || 0;
      const variant = card.dataset.variant || 'neon';
      const front = card.querySelector('.vota-flip-front');
      if (s > 0.05 && front) FX.breathe(front, s, { variant });
    });
    // Sparkline grande (lato back delle vota-card)
    document.querySelectorAll('.vota-flip-back [data-spark-large]').forEach(el => {
      const vals = el.dataset.sparkLarge ? el.dataset.sparkLarge.split(',').filter(Boolean).map(Number) : [];
      if (vals.length >= 2) FX.drawSparkline(el, vals, { height: 56, color: 'var(--neon)', fill: 'rgba(180,92,255,0.12)' });
      else el.innerHTML = '<div class="muted" style="text-align:center;padding:14px 6px;font-size:11px">Servono almeno 2 voti<br>per il mini-grafico</div>';
    });
    // Ring progress dei counter
    const totA = (CS.AREE_TECNICHE || []).length;
    const totF = (CS.FONDAMENTALI || []).length;
    const vA = countVotatiAree(VS.votaPeriodo);
    const vF = countVotatiFond(VS.votaPeriodo);
    const ringA = document.getElementById('vota-ring-aree');
    const ringF = document.getElementById('vota-ring-fond');
    if (ringA) FX.ringProgress(ringA, totA ? (vA / totA) * 100 : 0, { size: 96, stroke: 7, center: `${vA}/${totA}` });
    if (ringF) FX.ringProgress(ringF, totF ? (vF / totF) * 100 : 0, { size: 96, stroke: 7, center: `${vF}/${totF}` });
    // Count-up
    document.querySelectorAll('.fx-count').forEach(el => {
      const from = Number(el.dataset.from) || 0;
      const to = Number(el.dataset.to) || 0;
      if (to === 0 && from === 0) return; // skip "—" cards
      const dec = Number(el.dataset.decimals) || 0;
      FX.countUp(el, from, to, 700, { decimals: dec });
    });
    // Scramble titolo
    document.querySelectorAll('.fx-scramble').forEach(el => {
      const t = el.dataset.text;
      if (t) {
        const accent = el.querySelector('.accent');
        if (accent) FX.scramble(accent, t, 600);
      }
    });
    // Stagger entrate
    document.querySelectorAll('[data-stagger]').forEach(c => FX.staggerIn(c, '> *', 35));
  }

  // ─── TEORIA nella modale di voto ─────────────────────
  // Il voto 1-10 è arbitrario se non c'è un riferimento: la rubrica dice
  // cosa significa il numero che stai muovendo, così i trend nel tempo
  // restano confrontabili.
  function rubricaFor(kind, name, voto) {
    const t = (typeof TEORIA !== 'undefined') && TEORIA.forVoce(kind, name);
    if (!t || !t.rubrica) return null;
    const soglie = Object.keys(t.rubrica).map(Number).sort((a, b) => a - b);
    // prende l'ancora più alta <= voto, altrimenti la più bassa
    let scelta = soglie[0];
    for (const s of soglie) if (voto >= s) scelta = s;
    return { livello: scelta, testo: t.rubrica[scelta] };
  }

  function renderRubricaLive(kind, name, voto) {
    const r = rubricaFor(kind, name, voto);
    if (!r) return '';
    return `<div class="vota-rubrica" id="v-rubrica">
      <span class="vota-rubrica-lbl">LIVELLO ${r.livello}</span>
      <span class="vota-rubrica-txt">${escapeHtml(r.testo)}</span>
    </div>`;
  }

  function updateRubricaLive(el, kind, name, voto) {
    const r = rubricaFor(kind, name, voto);
    if (!r) return;
    el.querySelector('.vota-rubrica-lbl').textContent = 'LIVELLO ' + r.livello;
    el.querySelector('.vota-rubrica-txt').textContent = r.testo;
    el.classList.remove('fx-pop'); void el.offsetWidth; el.classList.add('fx-pop');
  }

  function renderTeoriaBlock(kind, name) {
    const t = (typeof TEORIA !== 'undefined') && TEORIA.forVoce(kind, name);
    if (!t) return '';
    const list = (arr, cls) => (arr && arr.length)
      ? `<ul class="teoria-list ${cls}">${arr.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '';
    const punti = t.chiave || t.metodo || [];
    const drill = t.allena || [];
    return `
      <div class="vota-teoria">
        <button type="button" class="vota-teoria-toggle" id="v-teoria-toggle" aria-expanded="false">
          <span class="vota-teoria-ico">📖</span>
          <span class="vota-teoria-lbl">TEORIA · ${escapeHtml(name).toUpperCase()}</span>
          <span class="vota-teoria-hint">${escapeHtml(t.cosa)}</span>
          <span class="vota-teoria-chev">▾</span>
        </button>
        <div class="vota-teoria-body" id="v-teoria-body">
          ${punti.length ? `<div class="teoria-sect"><div class="teoria-sect-title good">ESECUZIONE CORRETTA</div>${list(punti, 'is-good')}</div>` : ''}
          ${t.errori ? `<div class="teoria-sect"><div class="teoria-sect-title warn">ERRORI FREQUENTI</div>${list(t.errori, 'is-warn')}</div>` : ''}
          ${drill.length ? `<div class="teoria-sect"><div class="teoria-sect-title info">COME ALLENARLA</div>${list(drill, 'is-info')}</div>` : ''}
        </div>
      </div>
    `;
  }

  function openVotaModal(kind, name) {
    const isArea = kind === 'area';
    const lastVoti = recentVoti(kind, name, 5);
    const ultimoVoto = lastVoti.length ? lastVoti[lastVoti.length - 1] : 7;
    const icon = isArea ? '◆' : (FOND_ICONS[name] || '◆');
    const aree = CS.AREE_TECNICHE || [];
    const fond = CS.FONDAMENTALI || [];
    const list = isArea ? aree : fond;
    const idx = list.indexOf(name);
    const nextName = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

    const html = `
      <div class="vota-modal-head">
        <div class="vota-modal-icon">${icon}</div>
        <div>
          <div class="vota-modal-kind">${isArea ? 'AREA' : 'FONDAMENTALE'}</div>
          <h2 class="vota-modal-title">${escapeHtml(name).toUpperCase()}</h2>
        </div>
        <button class="vota-modal-close" data-close>×</button>
      </div>

      <div class="vota-slider-wrap">
        <div class="vota-slider-poles"><span>0 · scarso</span><span>10 · top</span></div>
        <input type="range" min="0" max="10" step="1" value="${ultimoVoto}" id="v-slider" class="vota-slider">
        <div class="vota-slider-display"><span id="v-display">${ultimoVoto}</span><span class="vota-slider-suf">/10</span></div>
        <div class="vota-slider-ticks">
          ${[0,1,2,3,4,5,6,7,8,9,10].map(t => `<span class="vota-tick">${t}</span>`).join('')}
        </div>
        ${renderRubricaLive(kind, name, ultimoVoto)}
      </div>

      ${renderTeoriaBlock(kind, name)}

      <div class="vota-notes">
        <div class="field vota-note">
          <label class="field-label vota-note-label good">✓ COSA È ANDATO BENE</label>
          <textarea class="input" id="v-bene" rows="2" placeholder="Es. timing del jab più pulito"></textarea>
        </div>
        <div class="field vota-note">
          <label class="field-label vota-note-label warn">✗ COSA È ANDATO MALE</label>
          <textarea class="input" id="v-male" rows="2" placeholder="Es. spalla destra cala dopo il 3° round"></textarea>
        </div>
        <div class="field vota-note">
          <label class="field-label vota-note-label info">→ DA MIGLIORARE</label>
          <textarea class="input" id="v-migl" rows="2" placeholder="Es. lavorare slip + contrattacco"></textarea>
        </div>
      </div>

      <div class="vota-modal-actions">
        <button class="btn ghost" data-close>ANNULLA</button>
        ${nextName ? `<button class="btn" id="v-save-next">SALVA + ${escapeHtml(nextName.toUpperCase())} →</button>` : ''}
        <button class="btn primary" id="v-save-close">SALVA E CHIUDI</button>
      </div>
    `;

    const m = UI.modal(html);
    m.el.classList.add('modal-wide', 'vota-modal');

    const slider = m.el.querySelector('#v-slider');
    const display = m.el.querySelector('#v-display');
    const rubricaEl = m.el.querySelector('#v-rubrica');
    slider.addEventListener('input', () => {
      display.textContent = slider.value;
      m.el.querySelector('.vota-slider-display').dataset.value = slider.value;
      // La rubrica segue lo slider: vedi cosa significa il voto che stai dando
      if (rubricaEl) updateRubricaLive(rubricaEl, kind, name, Number(slider.value));
    });

    // Teoria a scomparsa: chiusa di default per non appesantire la modale
    const teoriaToggle = m.el.querySelector('#v-teoria-toggle');
    teoriaToggle?.addEventListener('click', () => {
      const body = m.el.querySelector('#v-teoria-body');
      const open = body.classList.toggle('is-open');
      teoriaToggle.classList.toggle('is-open', open);
      teoriaToggle.setAttribute('aria-expanded', String(open));
    });

    function buildPayload() {
      const voto = Number(slider.value);
      const bene = m.el.querySelector('#v-bene').value.trim();
      const male = m.el.querySelector('#v-male').value.trim();
      const migl = m.el.querySelector('#v-migl').value.trim();
      const data = CS.todayISO();
      const note = [bene && `BENE: ${bene}`, male && `MALE: ${male}`, migl && `MIGLIORA: ${migl}`]
        .filter(Boolean).join(' · ');
      return { data, voto, note };
    }

    function save() {
      const p = buildPayload();
      if (isArea) CS.addAreaVoto({ data: p.data, area: name, voto: p.voto, note: p.note });
      else        CS.addFondVoto({ data: p.data, esercizio: name, voto: p.voto, note: p.note });
      FX.glowBurst(document.body, 'var(--neon)');
      UI.toast(`${name} valutato ${p.voto}/10`, 'ok');
    }

    m.el.querySelector('#v-save-close').addEventListener('click', () => {
      save(); m.close();
      ROUTER.go('tecnica', 'vota');
    });
    const nextBtn = m.el.querySelector('#v-save-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        save(); m.close();
        // Riapre il prossimo
        setTimeout(() => openVotaModal(kind, nextName), 120);
      });
    }
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 2 — AREE (radar animato + lista)
  // ════════════════════════════════════════════════════

  function renderAree() {
    const cmp = VS.areePeriodo;
    const data = CALC.radarAreaData(30, cmp);
    const periodi = [
      { v: 30, lbl: '30G FA' },
      { v: 60, lbl: '60G FA' },
      { v: 90, lbl: '90G FA' },
    ];
    // Stat aggregate
    const avgCur = data.length ? data.reduce((a, b) => a + (b.current || 0), 0) / data.length : 0;
    const avgPast = data.length ? data.reduce((a, b) => a + (b.comparison || 0), 0) / data.length : 0;
    const deltaAvg = avgCur - avgPast;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title fx-scramble" data-text="AREE">A<span class="accent">REE</span></h1>
          <div class="page-sub">14 aree tecniche · radar confronto temporale</div>
        </div>
        <div class="vota-period-pills">
          ${periodi.map(p => `
            <button class="vota-pill ${p.v === cmp ? 'active' : ''}" data-aree-period="${p.v}">${p.lbl}</button>
          `).join('')}
        </div>
      </div>

      <div class="aree-stats">
        <div class="aree-stat">
          <div class="aree-stat-lbl">MEDIA ATTUALE</div>
          <div class="aree-stat-val fx-count" data-from="0" data-to="${avgCur}" data-decimals="1">${avgCur.toFixed(1)}</div>
        </div>
        <div class="aree-stat">
          <div class="aree-stat-lbl">MEDIA ${cmp}GG FA</div>
          <div class="aree-stat-val muted">${avgPast.toFixed(1)}</div>
        </div>
        <div class="aree-stat ${deltaAvg > 0.2 ? 'good' : deltaAvg < -0.2 ? 'warn' : ''}">
          <div class="aree-stat-lbl">DELTA</div>
          <div class="aree-stat-val">${deltaAvg > 0 ? '+' : ''}${deltaAvg.toFixed(2)}</div>
        </div>
      </div>

      ${renderAreaInsights(buildAreaInsights(data), 'aree', cmp)}

      <div class="panel aree-radar-panel">
        <div class="panel-title">RADAR · attuale vs ${cmp}gg fa</div>
        <div class="aree-radar-host" id="aree-radar"></div>
        <div class="radar-legend">
          <span class="legend-current">━━ Ultimi 30gg</span>
          <span class="legend-past">┄┄ ${cmp}gg fa</span>
        </div>
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title-row">
          <div class="panel-title">LISTA AREE</div>
          ${renderAreaSortBar(VS.areeSort, 'aree')}
        </div>
        ${renderAreaListRich(data, 'aree', VS.areeSort)}
      </div>
    `;
  }

  function afterAree() {
    document.querySelectorAll('[data-aree-period]').forEach(b => {
      b.addEventListener('click', () => {
        VS.areePeriodo = Number(b.dataset.areePeriod);
        ROUTER.go('tecnica', 'aree');
      });
    });
    document.querySelectorAll('.fx-count').forEach(el => {
      const from = Number(el.dataset.from) || 0;
      const to = Number(el.dataset.to) || 0;
      const dec = Number(el.dataset.decimals) || 0;
      FX.countUp(el, from, to, 800, { decimals: dec });
    });
    document.querySelectorAll('.fx-scramble').forEach(el => {
      const t = el.dataset.text;
      if (t) {
        const accent = el.querySelector('.accent');
        if (accent) FX.scramble(accent, t.slice(1), 600);
      }
    });
    // Disegna radar dopo il mount (per avere dimensioni)
    const host = document.getElementById('aree-radar');
    if (host) {
      const data = CALC.radarAreaData(30, VS.areePeriodo);
      const trendAvg = data.length ? data.reduce((a, b) => a + ((b.current || 0) - (b.comparison || 0)), 0) / data.length : 0;
      mountRadar(host, data, trendAvg);
    }
    // Stagger lista + insights
    const list = document.querySelector('.area-list-rich');
    if (list) FX.staggerIn(list, '> *', 40);
    const insightsGrid = document.querySelector('.area-insights');
    if (insightsGrid) FX.staggerIn(insightsGrid, '> *', 60);
    // Sparkline per ogni row
    paintAreaSparks(document);
    bindAreaCardClicks(document);
    // Sort handlers
    document.querySelectorAll('[data-aree-sort]').forEach(b => {
      b.addEventListener('click', () => {
        VS.areeSort = b.dataset.areeSort;
        ROUTER.go('tecnica', 'aree');
      });
    });
    // Breathe panel modulato dalla media corrente
    const panel = document.querySelector('.aree-radar-panel');
    const dataNow = CALC.radarAreaData(30, VS.areePeriodo);
    if (panel && dataNow.length) {
      const avgCur = dataNow.reduce((a, b) => a + (b.current || 0), 0) / dataNow.length;
      FX.breathe(panel, Math.min(1, avgCur / 10), { variant: avgCur >= 7 ? 'gold' : 'neon' });
    }
  }

  function mountRadar(host, data, trendAvg) {
    const cx = 250, cy = 250, r = 180;
    const n = data.length;
    if (!n) {
      host.innerHTML = '<div class="empty-state"><div class="empty-text">Nessun voto registrato</div></div>';
      return;
    }
    const guides = [2, 4, 6, 8, 10].map(v => {
      const rv = r * (v / 10);
      return `<circle cx="${cx}" cy="${cy}" r="${rv}" stroke="var(--border)" fill="none" stroke-width="1" opacity="0.35"/>`;
    }).join('');
    const axes = data.map((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)" opacity="0.3"/>`;
    }).join('');
    const labels = data.map((d, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + (r + 26) * Math.cos(angle);
      const y = cy + (r + 26) * Math.sin(angle);
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="13"
                fill="var(--text)" font-family="Rajdhani,sans-serif"
                font-weight="600" letter-spacing="0.04em"
                dominant-baseline="middle">${escapeHtml(d.area)}</text>`;
    }).join('');
    const ptsCur = data.map((d, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const v = (d.current || 0) / 10;
      return `${cx + r * v * Math.cos(angle)},${cy + r * v * Math.sin(angle)}`;
    }).join(' ');
    const ptsPast = data.map((d, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const v = (d.comparison || 0) / 10;
      return `${cx + r * v * Math.cos(angle)},${cy + r * v * Math.sin(angle)}`;
    }).join(' ');
    const dots = data.map((d, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const v = (d.current || 0) / 10;
      const x = cx + r * v * Math.cos(angle);
      const y = cy + r * v * Math.sin(angle);
      return `<circle class="radar-dot" cx="${x}" cy="${y}" r="3.5" fill="var(--neon)"
                style="--dot-delay:${i * 60}ms" data-area="${escapeHtml(d.area)}"
                data-voto="${(d.current || 0).toFixed(1)}"/>`;
    }).join('');

    const glowVariant = trendAvg > 0.3 ? 'good' : trendAvg < -0.3 ? 'warn' : 'neutral';

    host.innerHTML = `
      <div class="radar-wrap radar-${glowVariant}">
        <svg viewBox="0 0 500 500" class="radar-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="radar-fill-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(180,92,255,0.45)"/>
              <stop offset="100%" stop-color="rgba(180,92,255,0.06)"/>
            </radialGradient>
          </defs>
          ${guides}
          ${axes}
          <polygon class="radar-past" points="${ptsPast}" fill="none"
                   stroke="var(--text-mute)" stroke-width="1.5"
                   stroke-dasharray="4 3" opacity="0.6"/>
          <polygon class="radar-current" points="${ptsCur}"
                   fill="url(#radar-fill-grad)" stroke="var(--neon)" stroke-width="2.2"/>
          ${dots}
          ${labels}
        </svg>
      </div>
    `;

    // Animazione disegno polygon
    if (!FX.reduceMotion()) {
      const cur = host.querySelector('.radar-current');
      if (cur && cur.getTotalLength) {
        try {
          const L = cur.getTotalLength();
          cur.style.strokeDasharray = L;
          cur.style.strokeDashoffset = L;
          requestAnimationFrame(() => {
            cur.style.transition = 'stroke-dashoffset 1100ms cubic-bezier(0.16,1,0.3,1)';
            cur.style.strokeDashoffset = '0';
          });
        } catch (e) {}
      }
    }
    // Tooltip hover sui dot
    host.querySelectorAll('.radar-dot').forEach(d => {
      d.addEventListener('mouseenter', (e) => {
        const tt = ensureTooltip();
        tt.textContent = `${d.dataset.area} · ${d.dataset.voto}/10`;
        const rect = d.getBoundingClientRect();
        tt.style.left = (rect.left + rect.width / 2) + 'px';
        tt.style.top  = (rect.top  - 8) + 'px';
        tt.classList.add('on');
      });
      d.addEventListener('mouseleave', () => {
        const tt = document.getElementById('fx-tooltip');
        if (tt) tt.classList.remove('on');
      });
    });
  }

  function ensureTooltip() {
    let tt = document.getElementById('fx-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'fx-tooltip';
      tt.className = 'fx-tooltip';
      document.body.appendChild(tt);
    }
    return tt;
  }

  function renderAreaList(data) {
    return `<div class="area-list">${data.map(d => {
      const delta = (d.current || 0) - (d.comparison || 0);
      const trendIco = delta > 0.3 ? '↗' : delta < -0.3 ? '↘' : '→';
      const trendCls = delta > 0.3 ? 'good' : delta < -0.3 ? 'warn' : '';
      const pct = ((d.current || 0) / 10) * 100;
      return `
        <div class="area-row">
          <span class="area-name">${escapeHtml(d.area)}</span>
          <span class="area-bar"><span class="area-bar-fill" style="width:${pct}%"></span></span>
          <span class="area-voto">${(d.current || 0).toFixed(1)}/10</span>
          <span class="area-trend ${trendCls}">${trendIco} ${(delta > 0 ? '+' : '') + delta.toFixed(1)}</span>
        </div>
      `;
    }).join('')}</div>`;
  }

  // ─── INSIGHTS: 4 highlight cards ───────────────────────
  // Riconosce best/worst/rising/falling dai dati radar
  function buildAreaInsights(data) {
    const withData = data.filter(d => (d.current || 0) > 0);
    if (!withData.length) return null;
    const bySort = (arr, fn) => arr.slice().sort((a, b) => fn(b) - fn(a));
    const best = bySort(withData, d => d.current)[0];
    const worst = bySort(withData, d => -d.current)[0];
    const withBoth = withData.filter(d => (d.comparison || 0) > 0);
    let rising = null, falling = null;
    if (withBoth.length) {
      const rise = bySort(withBoth, d => (d.current - d.comparison));
      rising = rise[0];
      falling = rise[rise.length - 1];
      // Se rising e falling sono uguali (uno solo con dati) mostra solo rising
      if (rising === falling) falling = null;
      // Se il delta è troppo piccolo, ignora
      if (rising && (rising.current - rising.comparison) < 0.15) rising = null;
      if (falling && (falling.current - falling.comparison) > -0.15) falling = null;
    }
    return { best, worst, rising, falling };
  }

  function renderAreaInsights(insights, type, cmpDays) {
    if (!insights) return '';
    const icons = type === 'fond' ? FOND_ICONS : AREE_ICONS;
    const card = (kind, label, item, extra = '') => item ? `
      <div class="area-insight is-${kind}">
        <div class="area-insight-ico-wrap"><span class="area-insight-ico">${icons[item.area] || '◆'}</span></div>
        <div class="area-insight-body">
          <div class="area-insight-lbl">${label}</div>
          <div class="area-insight-name">${escapeHtml(item.area)}</div>
          <div class="area-insight-val">${(item.current || 0).toFixed(1)}<em>/10</em>${extra}</div>
        </div>
      </div>
    ` : '';
    const delta = (item) => item ? ((item.current - item.comparison) > 0 ? '+' : '') + (item.current - item.comparison).toFixed(1) : '';
    return `
      <div class="area-insights">
        ${card('best',    '★ PUNTO DI FORZA', insights.best)}
        ${card('worst',   '⚡ DA MIGLIORARE', insights.worst)}
        ${card('rising',  `↗ IN CRESCITA`, insights.rising, insights.rising ? ` <span class="area-insight-delta good">${delta(insights.rising)}</span>` : '')}
        ${card('falling', `↘ IN CALO`, insights.falling, insights.falling ? ` <span class="area-insight-delta warn">${delta(insights.falling)}</span>` : '')}
      </div>
    `;
  }

  // ─── LISTA RICCA con sparkline + gradient bar + delta ─
  function getVotiForKey(type, key) {
    if (type === 'fond') return (CS.state.fondVoti || []).filter(v => v.esercizio === key);
    return (CS.state.areeVoti || []).filter(v => v.area === key);
  }
  function sortAreaData(data, type, sortMode) {
    const arr = data.slice();
    if (sortMode === 'nome') arr.sort((a, b) => a.area.localeCompare(b.area));
    else if (sortMode === 'voto') arr.sort((a, b) => (b.current || 0) - (a.current || 0));
    else if (sortMode === 'trend') arr.sort((a, b) => ((b.current || 0) - (b.comparison || 0)) - ((a.current || 0) - (a.comparison || 0)));
    else if (sortMode === 'n') arr.sort((a, b) => getVotiForKey(type, b.area).length - getVotiForKey(type, a.area).length);
    return arr;
  }
  function votoColor(v) {
    if (v >= 8) return '#00FF88';
    if (v >= 6) return '#FFE600';
    if (v >= 4) return '#FF9A3D';
    if (v > 0)  return '#FF3B30';
    return 'rgba(255,255,255,.15)';
  }
  function renderAreaListRich(data, type, sortMode) {
    const icons = type === 'fond' ? FOND_ICONS : AREE_ICONS;
    const sorted = sortAreaData(data, type, sortMode);
    return `<div class="area-list-rich">${sorted.map(d => {
      const voti = getVotiForKey(type, d.area);
      const nVoti = voti.length;
      const lastN = voti.slice(-10).map(v => Number(v.voto)).filter(x => x > 0);
      const lastVote = voti.length ? voti[voti.length - 1] : null;
      const lastDate = lastVote ? CS.fmtDate(lastVote.data, { short: true }) : '';
      const cur = d.current || 0;
      const delta = cur - (d.comparison || 0);
      const trendIco = delta > 0.3 ? '↗' : delta < -0.3 ? '↘' : '→';
      const trendCls = delta > 0.3 ? 'good' : delta < -0.3 ? 'warn' : '';
      const pct = (cur / 10) * 100;
      const color = votoColor(cur);
      const isEmpty = !nVoti;
      // La card reagisce all'hover: dev'essere davvero cliccabile → apre il
      // voto di quell'area/fondamentale (prima era solo decorativa).
      return `
        <div class="area-card ${isEmpty ? 'is-empty' : ''}" style="--voto-c:${color}"
             role="button" tabindex="0"
             data-vota-kind="${type === 'fond' ? 'fond' : 'area'}"
             data-vota-name="${escapeHtml(d.area)}"
             title="Vota ${escapeHtml(d.area)}">
          <div class="area-card-head">
            <span class="area-card-ico">${icons[d.area] || '◆'}</span>
            <div class="area-card-name-wrap">
              <span class="area-card-name">${escapeHtml(d.area)}</span>
              <span class="area-card-meta">${nVoti ? `${nVoti} voti · ultimo ${lastDate}` : 'Mai votato'}</span>
            </div>
            <div class="area-card-voto-wrap">
              <span class="area-card-voto">${cur > 0 ? cur.toFixed(1) : '—'}</span>
              <span class="area-card-voto-unit">/10</span>
            </div>
          </div>
          <div class="area-card-bar-row">
            <div class="area-card-bar">
              <span class="area-card-bar-fill" style="--w:${pct}%"></span>
            </div>
            <span class="area-card-trend ${trendCls}">${trendIco} ${delta === 0 ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1)}</span>
          </div>
          <div class="area-card-spark" data-area-spark="${lastN.join(',')}"></div>
        </div>
      `;
    }).join('')}</div>`;
  }

  function renderAreaSortBar(current, prefix) {
    const opts = [
      { id: 'voto',  lbl: 'Voto' },
      { id: 'trend', lbl: 'Trend' },
      { id: 'nome',  lbl: 'Nome' },
      { id: 'n',     lbl: 'N voti' },
    ];
    return `
      <div class="area-sort-bar">
        <span class="area-sort-lbl">Ordina per</span>
        ${opts.map(o => `
          <button class="area-sort-pill ${o.id === current ? 'active' : ''}" data-${prefix}-sort="${o.id}">${o.lbl}</button>
        `).join('')}
      </div>
    `;
  }

  // Rende cliccabili le card di AREE e FONDAMENTALI → apre la modale di voto.
  // Condivisa fra afterAree e afterFondamentali.
  function bindAreaCardClicks(root) {
    (root || document).querySelectorAll('.area-card[data-vota-name]').forEach(card => {
      const open = () => openVotaModal(card.dataset.votaKind, card.dataset.votaName);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  function paintAreaSparks(root) {
    (root || document).querySelectorAll('[data-area-spark]').forEach(el => {
      const raw = el.dataset.areaSpark || '';
      const vals = raw ? raw.split(',').filter(Boolean).map(Number) : [];
      if (vals.length >= 2) {
        FX.drawSparkline(el, vals, { height: 28, color: 'var(--neon, #B45CFF)', fill: 'rgba(180,92,255,0.10)' });
      } else {
        el.innerHTML = `<div class="area-card-spark-empty">${vals.length === 1 ? 'Un solo voto — vota di nuovo per vedere il trend' : 'Servono almeno 2 voti per il trend'}</div>`;
      }
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 3 — FONDAMENTALI (flip card 4x2)
  // ════════════════════════════════════════════════════

  function renderFondamentali() {
    const cmp = VS.fondPeriodo;
    const data = CALC.radarFondData(30, cmp);
    const periodi = [
      { v: 30, lbl: '30G FA' },
      { v: 60, lbl: '60G FA' },
      { v: 90, lbl: '90G FA' },
    ];
    // Stat aggregate
    const avgCur = data.length ? data.reduce((a, b) => a + (b.current || 0), 0) / data.length : 0;
    const avgPast = data.length ? data.reduce((a, b) => a + (b.comparison || 0), 0) / data.length : 0;
    const deltaAvg = avgCur - avgPast;
    const nFond = (CS.FONDAMENTALI || []).length;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title fx-scramble" data-text="FONDAMENTALI">FONDAMEN<span class="accent">TALI</span></h1>
          <div class="page-sub">${nFond} esercizi fondamentali · radar confronto temporale</div>
        </div>
        <div class="vota-period-pills">
          ${periodi.map(p => `
            <button class="vota-pill ${p.v === cmp ? 'active' : ''}" data-fond-period="${p.v}">${p.lbl}</button>
          `).join('')}
        </div>
      </div>

      <div class="aree-stats">
        <div class="aree-stat">
          <div class="aree-stat-lbl">MEDIA ATTUALE</div>
          <div class="aree-stat-val fx-count" data-from="0" data-to="${avgCur}" data-decimals="1">${avgCur.toFixed(1)}</div>
        </div>
        <div class="aree-stat">
          <div class="aree-stat-lbl">MEDIA ${cmp}GG FA</div>
          <div class="aree-stat-val muted">${avgPast.toFixed(1)}</div>
        </div>
        <div class="aree-stat ${deltaAvg > 0.2 ? 'good' : deltaAvg < -0.2 ? 'warn' : ''}">
          <div class="aree-stat-lbl">DELTA</div>
          <div class="aree-stat-val">${deltaAvg > 0 ? '+' : ''}${deltaAvg.toFixed(2)}</div>
        </div>
      </div>

      ${renderAreaInsights(buildAreaInsights(data), 'fond', cmp)}

      <div class="panel aree-radar-panel">
        <div class="panel-title">RADAR · attuale vs ${cmp}gg fa</div>
        <div class="aree-radar-host" id="fond-radar"></div>
        <div class="radar-legend">
          <span class="legend-current">━━ Ultimi 30gg</span>
          <span class="legend-past">┄┄ ${cmp}gg fa</span>
        </div>
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title-row">
          <div class="panel-title">LISTA FONDAMENTALI</div>
          ${renderAreaSortBar(VS.fondSort, 'fond')}
        </div>
        ${renderAreaListRich(data, 'fond', VS.fondSort)}
      </div>
    `;
  }

  function afterFondamentali() {
    document.querySelectorAll('[data-fond-period]').forEach(b => {
      b.addEventListener('click', () => {
        VS.fondPeriodo = Number(b.dataset.fondPeriod);
        ROUTER.go('tecnica', 'fondamentali');
      });
    });
    document.querySelectorAll('.fx-count').forEach(el => {
      const from = Number(el.dataset.from) || 0;
      const to = Number(el.dataset.to) || 0;
      const dec = Number(el.dataset.decimals) || 0;
      FX.countUp(el, from, to, 800, { decimals: dec });
    });
    document.querySelectorAll('.fx-scramble').forEach(el => {
      const t = el.dataset.text;
      if (t) {
        const accent = el.querySelector('.accent');
        if (accent) FX.scramble(accent, 'TALI', 600);
      }
    });
    // Disegna radar dopo il mount (per avere dimensioni)
    const host = document.getElementById('fond-radar');
    if (host) {
      const data = CALC.radarFondData(30, VS.fondPeriodo);
      const trendAvg = data.length ? data.reduce((a, b) => a + ((b.current || 0) - (b.comparison || 0)), 0) / data.length : 0;
      mountRadar(host, data, trendAvg);
    }
    // Stagger lista + insights
    const list = document.querySelector('.area-list-rich');
    if (list) FX.staggerIn(list, '> *', 40);
    const insightsGrid = document.querySelector('.area-insights');
    if (insightsGrid) FX.staggerIn(insightsGrid, '> *', 60);
    // Sparkline per ogni row
    paintAreaSparks(document);
    bindAreaCardClicks(document);
    // Sort handlers
    document.querySelectorAll('[data-fond-sort]').forEach(b => {
      b.addEventListener('click', () => {
        VS.fondSort = b.dataset.fondSort;
        ROUTER.go('tecnica', 'fondamentali');
      });
    });
    // Breathe panel modulato dalla media corrente
    const panel = document.querySelector('.aree-radar-panel');
    const dataNow = CALC.radarFondData(30, VS.fondPeriodo);
    if (panel && dataNow.length) {
      const avgCur = dataNow.reduce((a, b) => a + (b.current || 0), 0) / dataNow.length;
      FX.breathe(panel, Math.min(1, avgCur / 10), { variant: avgCur >= 7 ? 'gold' : 'neon' });
    }
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 4 — SESSIONI (heatmap + slide-in + wizard 3 step)
  // ════════════════════════════════════════════════════

  const TIPI_SESSIONE = ['Tecnica', 'Cardio', 'Forza', 'Sparring', 'Recupero'];
  const MOOD_OPTIONS = ['fuoco', 'pronto', 'neutro', 'stanco', 'spento'];

  function sessDurataOre(s) {
    if (!s.oraInizio || !s.oraFine) return 0;
    const [h1, m1] = s.oraInizio.split(':').map(Number);
    const [h2, m2] = s.oraFine.split(':').map(Number);
    let d = (h2 + m2 / 60) - (h1 + m1 / 60);
    if (d < 0) d += 24;
    return d;
  }

  function sessionsForDay(iso) {
    return (CS.state.sessioni || []).filter(s => s.data === iso);
  }

  function monthDays(cursor) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
  }

  function dayOfWeekMon0(d) {
    // 0 = lunedì, 6 = domenica
    const dow = d.getDay();
    return (dow + 6) % 7;
  }

  function bucketHeatmap(ore, max) {
    if (!ore || ore <= 0) return 'empty';
    const ratio = max ? ore / max : 0;
    if (ratio < 0.25) return 'low';
    if (ratio < 0.55) return 'mid';
    if (ratio < 0.85) return 'high';
    return 'top';
  }

  function topExercises(limit = 6) {
    const counts = {};
    (CS.state.sessioni || []).forEach(s => {
      (s.esercizi || []).forEach(e => {
        if (e.nome) counts[e.nome] = (counts[e.nome] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([n]) => n);
  }

  function renderSessioni() {
    if (!VS.sessMonthCursor) {
      const t = new Date();
      VS.sessMonthCursor = new Date(t.getFullYear(), t.getMonth(), 1);
    }
    const cursor = VS.sessMonthCursor;

    // Stats sintetiche del mese corrente sul calendario
    const monthKey = CS.monthKey(cursor);
    const revsMese = (CS.state.revisioni || []).filter(r => r.data && r.data.startsWith(monthKey));
    let giorniOro = 0, giorniOrange = 0, giorniRed = 0, giorniRest = 0;
    // Costruisci una mappa iso→stato per la mini-heatstrip del mese
    const stateByIso = {};
    revsMese.forEach(r => {
      const st = CALC.giornataOroCheck(r.data).state;
      stateByIso[r.data] = st;
      if (st === 'gold') giorniOro++;
      else if (st === 'orange') giorniOrange++;
      else if (st === 'red') giorniRed++;
      else if (st === 'rest') giorniRest++;
    });
    // Genera strip HTML per uno stato specifico: 1 cella per giorno del mese, evidenzia solo lo stato target
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    function buildStripHtml(targetState) {
      const pad = n => String(n).padStart(2, '0');
      return Array.from({ length: daysInMonth }, (_, i) => {
        const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(i + 1)}`;
        const st = stateByIso[iso];
        return `<span class="oro-strip-cell ${st === targetState ? 'is-hit' : ''}"></span>`;
      }).join('');
    }
    const stripGold   = buildStripHtml('gold');
    const stripOrange = buildStripHtml('orange');
    const stripRed    = buildStripHtml('red');
    const stripRest   = buildStripHtml('rest');
    const mCheck = CALC.meseTopCheck(cursor);
    const wCheck = CALC.settimanaTopCheck(new Date());
    const monthLabel = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
      'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'][cursor.getMonth()];

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title fx-scramble" data-text="ORO">
            SETTIMANA/MESE D'<span class="accent">ORO</span>
          </h1>
          <div class="page-sub">${monthLabel} ${cursor.getFullYear()} · ${mCheck.settTop}/${mCheck.settTotal || 4} settimane d'oro · ${wCheck.met}/${wCheck.criteri.length} criteri sett. corrente</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="add-sessione">+ SESSIONE TECNICA</button>
      </div>

      <div class="oro-quickstats">
        <div class="oro-quickstat is-gold">
          <div class="oro-quickstat-accent"></div>
          <div class="oro-quickstat-ico-wrap"><span class="oro-quickstat-ico">★</span></div>
          <div class="oro-quickstat-body">
            <div class="oro-quickstat-num fx-count" data-from="0" data-to="${giorniOro}">${giorniOro}</div>
            <div class="oro-quickstat-lbl">Giornate d'oro</div>
          </div>
          <div class="oro-quickstat-spark" data-oro-spark data-state="gold">${stripGold}</div>
        </div>
        <div class="oro-quickstat is-orange">
          <div class="oro-quickstat-accent"></div>
          <div class="oro-quickstat-ico-wrap"><span class="oro-quickstat-ico">◐</span></div>
          <div class="oro-quickstat-body">
            <div class="oro-quickstat-num fx-count" data-from="0" data-to="${giorniOrange}">${giorniOrange}</div>
            <div class="oro-quickstat-lbl">Parziali</div>
          </div>
          <div class="oro-quickstat-spark" data-oro-spark data-state="orange">${stripOrange}</div>
        </div>
        <div class="oro-quickstat is-red">
          <div class="oro-quickstat-accent"></div>
          <div class="oro-quickstat-ico-wrap"><span class="oro-quickstat-ico">▽</span></div>
          <div class="oro-quickstat-body">
            <div class="oro-quickstat-num fx-count" data-from="0" data-to="${giorniRed}">${giorniRed}</div>
            <div class="oro-quickstat-lbl">Sotto target</div>
          </div>
          <div class="oro-quickstat-spark" data-oro-spark data-state="red">${stripRed}</div>
        </div>
        <div class="oro-quickstat is-rest">
          <div class="oro-quickstat-accent"></div>
          <div class="oro-quickstat-ico-wrap"><span class="oro-quickstat-ico">☾</span></div>
          <div class="oro-quickstat-body">
            <div class="oro-quickstat-num fx-count" data-from="0" data-to="${giorniRest}">${giorniRest}</div>
            <div class="oro-quickstat-lbl">Riposo</div>
          </div>
          <div class="oro-quickstat-spark" data-oro-spark data-state="rest">${stripRest}</div>
        </div>
      </div>

      ${OroShared.renderRings(cursor)}

      ${OroShared.renderCalendar(cursor, { selectedIso: VS.sessSelectedDate })}

      <div class="oro-detail-backdrop" id="oro-detail-backdrop"></div>
      <aside class="sess-detail-panel oro-detail-panel" id="sess-detail" data-open="false">
        <div class="sess-detail-inner oro-detail-inner" id="sess-detail-inner"></div>
      </aside>
    `;
  }

  function renderRecentSessions() {
    const sess = (CS.state.sessioni || []).slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
    if (!sess.length) return UI.empty('🥊', 'NESSUNA SESSIONE', 'Logga la prima sessione di allenamento');
    return `<div data-stagger>${sess.map(renderSessioneCard).join('')}</div>`;
  }

  function renderSessioneCard(s) {
    const durata = sessDurataOre(s);
    const intensita = (s.esercizi || []).map(e => Number(e.intensita)).filter(x => x > 0);
    const intMed = intensita.length ? intensita.reduce((a, b) => a + b, 0) / intensita.length : 0;
    const intStrength = Math.min(1, intMed / 10);
    const intVariant = intMed >= 8 ? 'danger' : intMed >= 6 ? 'gold' : 'neon';
    const tipo = Array.isArray(s.tipo) ? s.tipo.join(' · ') : (s.tipo || '');

    return `
      <div class="session-card session-card-fx"
           data-sess="${s.id}"
           data-int-strength="${intStrength.toFixed(2)}"
           data-int-variant="${intVariant}">
        <div class="session-card-bar"><span class="session-card-bar-fill" style="--w:${(intStrength * 100).toFixed(0)}%"></span></div>
        <div class="session-head">
          <div class="session-head-left">
            <div class="session-date">${CS.fmtDate(s.data, { long: true })} ${s.oraInizio ? '· ' + s.oraInizio : ''} ${s.oraFine ? '–' + s.oraFine : ''} ${durata ? '· ' + durata.toFixed(1) + 'h' : ''}</div>
            <div class="session-meta-row">
              ${tipo ? `<span class="session-tipo">${escapeHtml(tipo)}</span>` : ''}
              ${s.luogo ? `<span class="session-luogo">📍 ${escapeHtml(s.luogo)}</span>` : ''}
              ${intMed ? `<span class="session-int">int. ${intMed.toFixed(1)}/10</span>` : ''}
            </div>
          </div>
          <div class="session-actions">
            <button class="btn-sm danger" data-del-sess="${s.id}" title="Elimina sessione">×</button>
          </div>
        </div>
        ${(s.esercizi || []).length ? `<ul class="sess-eserc-list">${(s.esercizi || []).map(e =>
          `<li class="sess-eserc">${escapeHtml(e.nome)}${e.sets ? ' · ' + e.sets + ' set' : ''}${e.durata ? ' · ' + e.durata : ''}${e.intensita ? ' · int. ' + e.intensita + '/10' : ''}</li>`
        ).join('')}</ul>` : ''}
        ${(s.areeVoti || []).length ? `<div class="sess-aree">${(s.areeVoti || []).map(av =>
          `<span class="sess-area">${escapeHtml(av.area)} ${av.voto}/10</span>`
        ).join('')}</div>` : ''}
        ${(s.fcMedia || s.moodPre || s.moodPost) ? `
          <div class="sess-meta">
            ${s.fcMedia ? `FC ${s.fcMedia} bpm` : ''}
            ${s.moodPre ? ` · pre ${escapeHtml(s.moodPre)}` : ''}
            ${s.moodPost ? ` · post ${escapeHtml(s.moodPost)}` : ''}
          </div>` : ''}
        ${s.note ? `<div class="sess-note">${escapeHtml(s.note)}</div>` : ''}
      </div>
    `;
  }

  // Listener globale gestito con handle per cleanup
  let _oroRevSavedHandler = null;

  function afterSessioni() {
    // Stats count-up
    document.querySelectorAll('.fx-count').forEach(el => {
      const from = Number(el.dataset.from) || 0;
      const to = Number(el.dataset.to) || 0;
      if (to === 0 && from === 0) return;
      const dec = Number(el.dataset.decimals) || 0;
      FX.countUp(el, from, to, 700, { decimals: dec });
    });
    // Scramble titoli
    document.querySelectorAll('.fx-scramble').forEach(el => {
      const accent = el.querySelector('.accent');
      if (accent) FX.scramble(accent, 'ORO', 600);
    });

    // Ring animati (settimana/mese)
    OroShared.animateRings(document);

    // Stagger celle calendario
    const grid = document.querySelector('[data-oro-grid]');
    if (grid) FX.staggerIn(grid, '.oro-cell:not(.is-pad)', 12);
    // Stagger recent sessions
    document.querySelectorAll('[data-stagger]').forEach(c => FX.staggerIn(c, '> *', 50));
    // Breathe sui session-card recenti modulato dall'intensità
    document.querySelectorAll('[data-int-strength]').forEach(el => {
      const s = Number(el.dataset.intStrength) || 0;
      const v = el.dataset.intVariant || 'neon';
      if (s > 0.05) FX.breathe(el, s, { variant: v });
    });

    // + LOG SESSIONE TECNICA → wizard
    document.getElementById('add-sessione')?.addEventListener('click', () => openSessioneWizard());

    // Mese navigation
    document.querySelectorAll('[data-oro-nav]').forEach(b => {
      b.addEventListener('click', () => {
        const dir = b.dataset.oroNav;
        if (dir === 'today') {
          const t = new Date();
          VS.sessMonthCursor = new Date(t.getFullYear(), t.getMonth(), 1);
        } else {
          const c = VS.sessMonthCursor;
          VS.sessMonthCursor = new Date(c.getFullYear(), c.getMonth() + Number(dir), 1);
        }
        VS.sessSelectedDate = null;
        ROUTER.go('tecnica', 'sessioni');
      });
    });

    // Click cella → apri pannello laterale
    document.querySelectorAll('.oro-cell[data-oro-date]').forEach(c => {
      c.addEventListener('click', () => {
        const iso = c.dataset.oroDate;
        VS.sessSelectedDate = iso;
        openDetailPanel(iso);
        document.querySelectorAll('.oro-cell.is-selected').forEach(x => x.classList.remove('is-selected'));
        c.classList.add('is-selected');
      });
    });

    // Delete sessione (log in fondo)
    document.querySelectorAll('[data-del-sess]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Eliminare questa sessione?')) return;
        CS.deleteSessione(b.dataset.delSess);
        UI.toast('Sessione eliminata', 'ok');
        ROUTER.go('tecnica', 'sessioni');
      });
    });

    // Riapri detail panel se c'era selezione
    if (VS.sessSelectedDate) {
      openDetailPanel(VS.sessSelectedDate);
    }

    // ─── Listener revisione salvata: aggiorna cella + ring + toast ───
    if (_oroRevSavedHandler) {
      window.removeEventListener('cs:rev-saved', _oroRevSavedHandler);
    }
    _oroRevSavedHandler = (e) => {
      const rev = e && e.detail;
      if (!rev || !rev.data) return;
      // Se siamo su un'altra sub-tab il DOM oro non c'è: skippa (verrà ricalcolato al prossimo mount)
      if (!document.getElementById('oro-rings')) return;
      const cellEl = document.querySelector(`.oro-cell[data-oro-date="${rev.data}"]`);
      if (cellEl) {
        const d = new Date(rev.data);
        const wrap = document.createElement('div');
        wrap.innerHTML = OroShared.renderCell(d, { selectedIso: VS.sessSelectedDate });
        const fresh = wrap.firstElementChild;
        if (fresh) {
          cellEl.replaceWith(fresh);
          fresh.addEventListener('click', () => {
            VS.sessSelectedDate = rev.data;
            openDetailPanel(rev.data);
            document.querySelectorAll('.oro-cell.is-selected').forEach(x => x.classList.remove('is-selected'));
            fresh.classList.add('is-selected');
          });
          try { FX.glowBurst(fresh); } catch (_) {}
        }
      }
      // Re-render ring settimana/mese
      const ringsMount = document.getElementById('oro-rings');
      if (ringsMount) {
        const wrap = document.createElement('div');
        wrap.innerHTML = OroShared.renderRings(VS.sessMonthCursor || new Date());
        const fresh = wrap.firstElementChild;
        if (fresh) {
          ringsMount.replaceWith(fresh);
          OroShared.animateRings(fresh);
        }
      }
      // Aggiorna detail panel se aperto sul giorno toccato
      if (VS.sessSelectedDate === rev.data) {
        openDetailPanel(rev.data);
      }
      // Toast
      const st = CALC.giornataOroCheck(rev.data).state;
      const lbl = OroShared.labelForState(st);
      UI.toast(`Revisione salvata · Giornata ${lbl}`, st === 'gold' ? 'ok' : 'info');
    };
    window.addEventListener('cs:rev-saved', _oroRevSavedHandler);
  }

  // ─── PANNELLO DETTAGLIO GIORNO (slide-in) ──────────
  let _oroEscHandler = null;

  function openDetailPanel(iso) {
    const panel = document.getElementById('sess-detail');
    const inner = document.getElementById('sess-detail-inner');
    const backdrop = document.getElementById('oro-detail-backdrop');
    if (!panel || !inner) return;
    inner.innerHTML = OroShared.renderDetail(iso);
    panel.dataset.open = 'true';
    // Reset scroll del body interno: se il pannello era stato scrollato in
    // una apertura precedente, o se il browser tenta di scrollare per
    // portare in vista un elemento (es. CTA con focus), forziamo ogni volta
    // il ritorno all'inizio dopo il mount.
    requestAnimationFrame(() => {
      const body = inner.querySelector('.oro-detail-body');
      if (body) body.scrollTop = 0;
      inner.scrollTop = 0;
      panel.scrollTop = 0;
    });
    if (backdrop) {
      backdrop.classList.add('is-open');
      backdrop.onclick = () => closeDetailPanel();
    }

    inner.querySelector('[data-oro-detail-close]')?.addEventListener('click', closeDetailPanel);
    inner.querySelector('[data-oro-open-rev]')?.addEventListener('click', (e) => {
      const iso2 = e.currentTarget.dataset.oroOpenRev;
      if (typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily) {
        REV_FORMS.openDaily(iso2);
      }
    });

    // ESC per chiudere
    if (_oroEscHandler) document.removeEventListener('keydown', _oroEscHandler);
    _oroEscHandler = (e) => {
      if (e.key === 'Escape') closeDetailPanel();
    };
    document.addEventListener('keydown', _oroEscHandler);
  }

  function closeDetailPanel() {
    const panel = document.getElementById('sess-detail');
    const backdrop = document.getElementById('oro-detail-backdrop');
    if (panel) panel.dataset.open = 'false';
    if (backdrop) {
      backdrop.classList.remove('is-open');
      backdrop.onclick = null;
    }
    VS.sessSelectedDate = null;
    document.querySelectorAll('.oro-cell.is-selected').forEach(x => x.classList.remove('is-selected'));
    if (_oroEscHandler) {
      document.removeEventListener('keydown', _oroEscHandler);
      _oroEscHandler = null;
    }
  }

  // ─── WIZARD 3 STEP per nuova sessione ──────────────
  function openSessioneWizard(prefill = {}) {
    const state = {
      step: 1,
      data: prefill.data || CS.todayISO(),
      oraInizio: new Date().toTimeString().slice(0, 5),
      oraFine: '',
      luogo: '',
      tipo: [],
      esercizi: [],   // {nome, sets, durata, intensita}
      intensitaGlob: 7,
      moodPre: '',
      moodPost: '',
      fcMedia: '',
      note: '',
    };
    const top = topExercises(8);

    const m = UI.modal('<div id="sw-host"></div>');
    m.el.classList.add('modal-wide', 'sess-wizard-modal');
    const host = m.el.querySelector('#sw-host');

    function paint() {
      host.innerHTML = `
        <div class="sw-head">
          <div class="sw-title">NUOVA SESSIONE</div>
          <button class="sw-close" data-close>×</button>
        </div>
        <div class="sw-progress">
          ${[1, 2, 3].map(n => `
            <div class="sw-step ${state.step === n ? 'is-current' : ''} ${state.step > n ? 'is-done' : ''}">
              <span class="sw-step-num">${n}</span>
              <span class="sw-step-lbl">${n === 1 ? 'QUANDO' : n === 2 ? 'COSA' : 'COME'}</span>
            </div>
            ${n < 3 ? '<div class="sw-step-sep"></div>' : ''}
          `).join('')}
        </div>
        <div class="sw-body">
          ${state.step === 1 ? stepWhen() : state.step === 2 ? stepWhat() : stepHow()}
        </div>
        <div class="sw-foot">
          ${state.step > 1
            ? '<button class="btn ghost" id="sw-back">← INDIETRO</button>'
            : '<span></span>'}
          ${state.step < 3
            ? '<button class="btn primary" id="sw-next">AVANTI →</button>'
            : '<button class="btn primary" id="sw-save">SALVA SESSIONE</button>'}
        </div>
      `;
      bind();
    }

    function stepWhen() {
      return `
        <div class="sw-section-title">QUANDO E DOVE</div>
        <div class="row" style="gap:var(--sp-3)">
          <div class="field" style="flex:1">
            <label class="field-label">Data</label>
            <input class="input" type="date" id="sw-data" value="${state.data}">
          </div>
          <div class="field" style="flex:1">
            <label class="field-label">Ora inizio</label>
            <input class="input" type="time" id="sw-ini" value="${state.oraInizio}">
          </div>
          <div class="field" style="flex:1">
            <label class="field-label">Ora fine</label>
            <input class="input" type="time" id="sw-fin" value="${state.oraFine}">
          </div>
        </div>
        <div class="field">
          <label class="field-label">Luogo</label>
          <input class="input" id="sw-luogo" value="${escapeHtml(state.luogo)}" placeholder="Es. Palestra Tigre / Casa / Outdoor">
        </div>
      `;
    }

    function stepWhat() {
      const tipoChips = TIPI_SESSIONE.map(t => `
        <button class="chip-multi ${state.tipo.includes(t) ? 'active' : ''}" data-tipo="${t}">${t}</button>
      `).join('');
      const eserChips = state.esercizi.map((e, i) => `
        <div class="ex-chip">
          <button class="ex-chip-x" data-rem-ex="${i}" title="Rimuovi">×</button>
          <input class="ex-chip-nome" data-ex-i="${i}" data-ex-k="nome" value="${escapeHtml(e.nome)}" placeholder="Nome esercizio">
          <input class="ex-chip-sets" data-ex-i="${i}" data-ex-k="sets" value="${escapeHtml(e.sets)}" placeholder="sets">
          <input class="ex-chip-durata" data-ex-i="${i}" data-ex-k="durata" value="${escapeHtml(e.durata)}" placeholder="durata">
          <input class="ex-chip-int" type="number" min="0" max="10" data-ex-i="${i}" data-ex-k="intensita" value="${e.intensita ?? ''}" placeholder="int/10">
        </div>
      `).join('');
      const quickAdds = top.length
        ? `<div class="sw-quickadd">
             <div class="sw-quickadd-lbl">RAPIDO DA STORICO</div>
             <div class="sw-quickadd-row">${top.map(n => `<button class="sw-quickadd-pill" data-quick="${escapeHtml(n)}">+ ${escapeHtml(n)}</button>`).join('')}</div>
           </div>`
        : '';
      return `
        <div class="sw-section-title">COSA HAI FATTO</div>
        <div class="field">
          <label class="field-label">Tipo (multi-select)</label>
          <div class="chip-multi-row">${tipoChips}</div>
        </div>
        <div class="field">
          <label class="field-label">Esercizi (${state.esercizi.length})</label>
          ${quickAdds}
          <div class="sw-ex-list">${eserChips || '<div class="muted" style="font-size:11px;padding:8px 0">Nessun esercizio. Usa le pill rapide o aggiungi manualmente.</div>'}</div>
          <button class="btn ghost sw-add-ex" id="sw-add-ex">+ Esercizio manuale</button>
        </div>
      `;
    }

    function stepHow() {
      const moodChips = (kind) => MOOD_OPTIONS.map(m => {
        const sel = kind === 'pre' ? state.moodPre : state.moodPost;
        return `<button class="chip-multi ${sel === m ? 'active' : ''}" data-mood="${kind}" data-val="${m}">${m}</button>`;
      }).join('');
      return `
        <div class="sw-section-title">COME È ANDATA</div>
        <div class="field sw-int-field">
          <label class="field-label">Intensità globale</label>
          <div class="sw-int-display">
            <span class="sw-int-num" id="sw-int-num">${state.intensitaGlob}</span>
            <span class="sw-int-suf">/10</span>
          </div>
          <input type="range" min="0" max="10" step="1" value="${state.intensitaGlob}" class="vota-slider" id="sw-int">
        </div>
        <div class="row" style="gap:var(--sp-3)">
          <div class="field" style="flex:1">
            <label class="field-label">Mood pre</label>
            <div class="chip-multi-row">${moodChips('pre')}</div>
          </div>
          <div class="field" style="flex:1">
            <label class="field-label">Mood post</label>
            <div class="chip-multi-row">${moodChips('post')}</div>
          </div>
        </div>
        <div class="field">
          <label class="field-label">FC media (bpm)</label>
          <input class="input" type="number" id="sw-fc" value="${state.fcMedia}" placeholder="Opzionale">
        </div>
        <div class="field">
          <label class="field-label">Note tecniche</label>
          <textarea class="input" id="sw-note" rows="3" placeholder="Cosa ti porti via da questa sessione...">${escapeHtml(state.note)}</textarea>
        </div>
      `;
    }

    function readStep1() {
      state.data      = host.querySelector('#sw-data').value || state.data;
      state.oraInizio = host.querySelector('#sw-ini').value;
      state.oraFine   = host.querySelector('#sw-fin').value;
      state.luogo     = host.querySelector('#sw-luogo').value;
    }
    function readStep3() {
      state.intensitaGlob = Number(host.querySelector('#sw-int').value) || 0;
      state.fcMedia       = host.querySelector('#sw-fc').value;
      state.note          = host.querySelector('#sw-note').value;
    }

    function bind() {
      host.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => m.close()));

      if (state.step === 2) {
        host.querySelectorAll('[data-tipo]').forEach(b => {
          b.addEventListener('click', () => {
            const t = b.dataset.tipo;
            const idx = state.tipo.indexOf(t);
            if (idx >= 0) state.tipo.splice(idx, 1);
            else state.tipo.push(t);
            b.classList.toggle('active');
          });
        });
        host.querySelectorAll('[data-quick]').forEach(b => {
          b.addEventListener('click', () => {
            state.esercizi.push({ nome: b.dataset.quick, sets: '', durata: '', intensita: null });
            paint();
          });
        });
        host.querySelector('#sw-add-ex')?.addEventListener('click', () => {
          state.esercizi.push({ nome: '', sets: '', durata: '', intensita: null });
          paint();
        });
        host.querySelectorAll('[data-rem-ex]').forEach(b => {
          b.addEventListener('click', () => {
            state.esercizi.splice(Number(b.dataset.remEx), 1);
            paint();
          });
        });
        host.querySelectorAll('[data-ex-i]').forEach(inp => {
          inp.addEventListener('input', () => {
            const i = Number(inp.dataset.exI);
            const k = inp.dataset.exK;
            const v = k === 'intensita' ? (inp.value ? Number(inp.value) : null) : inp.value;
            if (state.esercizi[i]) state.esercizi[i][k] = v;
          });
        });
      }
      if (state.step === 3) {
        const slider = host.querySelector('#sw-int');
        const numEl = host.querySelector('#sw-int-num');
        slider.addEventListener('input', () => {
          state.intensitaGlob = Number(slider.value);
          numEl.textContent = slider.value;
        });
        host.querySelectorAll('[data-mood]').forEach(b => {
          b.addEventListener('click', () => {
            const kind = b.dataset.mood;
            const val = b.dataset.val;
            host.querySelectorAll(`[data-mood="${kind}"]`).forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            if (kind === 'pre') state.moodPre = val;
            else state.moodPost = val;
          });
        });
      }

      host.querySelector('#sw-back')?.addEventListener('click', () => {
        if (state.step === 1) readStep1();
        if (state.step === 3) readStep3();
        state.step--;
        paint();
      });
      host.querySelector('#sw-next')?.addEventListener('click', () => {
        if (state.step === 1) {
          readStep1();
          if (!state.data) return UI.toast('Inserisci la data', 'warn');
        }
        state.step++;
        paint();
      });
      host.querySelector('#sw-save')?.addEventListener('click', () => {
        readStep3();
        save();
      });
    }

    function save() {
      // Se l'intensità globale è impostata e nessun esercizio ha intensità, applicala a tutti
      const esercizi = state.esercizi.filter(e => e.nome).map(e => ({
        nome: e.nome,
        sets: e.sets || '',
        durata: e.durata || '',
        intensita: e.intensita != null ? e.intensita : state.intensitaGlob,
      }));
      CS.addSessione({
        data: state.data,
        oraInizio: state.oraInizio || null,
        oraFine: state.oraFine || null,
        luogo: state.luogo,
        tipo: state.tipo.length ? state.tipo : ['Tecnica'],
        esercizi,
        areeVoti: [],
        fcMedia: Number(state.fcMedia) || null,
        moodPre: state.moodPre,
        moodPost: state.moodPost,
        note: state.note,
      });
      FX.glowBurst(document.body, 'var(--neon)');
      UI.toast('Sessione salvata', 'ok');
      m.close();
      // Posiziona il cursore al mese della sessione salvata, mostra dettaglio
      const dd = new Date(state.data);
      VS.sessMonthCursor = new Date(dd.getFullYear(), dd.getMonth(), 1);
      VS.sessSelectedDate = state.data;
      ROUTER.go('tecnica', 'sessioni');
    }

    paint();
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 5 — INFORTUNI (con FX.breathe sui card attivi)
  // ════════════════════════════════════════════════════

  function renderInfortuni() {
    const all = CS.state.infortuni || [];
    const attivi = all.filter(i => !i.dataFine);
    const risolti = all.filter(i => i.dataFine).sort((a, b) => b.dataFine.localeCompare(a.dataFine));
    const pattern = CALC.infortuniPattern(6);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title fx-scramble" data-text="INFORTUNI">INFOR<span class="accent">TUNI</span></h1>
          <div class="page-sub">${attivi.length} attivi · ${risolti.length} risolti · ${pattern.length} pattern</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="add-inf">+ NUOVO INFORTUNIO</button>
      </div>

      <div class="panel">
        <div class="panel-title">ATTIVI (${attivi.length})</div>
        ${attivi.length
          ? `<div data-stagger>${attivi.map(renderInjuryAttivo).join('')}</div>`
          : '<div class="empty-state"><div class="empty-ico">✓</div><div class="empty-text">Nessun infortunio attivo</div></div>'}
      </div>

      ${pattern.length ? `
        <div class="panel pattern-box" style="margin-top:var(--sp-4)">
          <div class="panel-title">🔍 PATTERN RILEVATI</div>
          ${pattern.map(p => `
            <div class="pattern-row pattern-${p.warning}">
              <strong>${escapeHtml(p.parte)}</strong>: ${p.count} episodi negli ultimi 6 mesi
              <div class="pattern-suggest">→ Controlla biomeccanica del movimento, considera mobilità e visita specialistica.</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">STORICO RISOLTI (${risolti.length})</div>
        ${risolti.length ? risolti.slice(0, 10).map(renderInjuryRisolto).join('') : '<div class="empty-state"><div class="empty-text">Nessun infortunio risolto</div></div>'}
      </div>
    `;
  }

  function renderInjuryAttivo(i) {
    const giorni = Math.round((new Date() - new Date(i.dataInizio)) / 86400000);
    const recovery = Number(i.recoveryPercent) || 0;
    const gravita = i.gravita || 'Lieve';
    const sevScore = gravita === 'Grave' ? 1 : gravita === 'Media' ? 0.6 : 0.3;
    return `
      <div class="injury-card injury-attivo" data-injury-strength="${sevScore}">
        <div class="injury-head">
          <div class="injury-title">🚑 ${escapeHtml(i.parte)} · ${escapeHtml(gravita)}</div>
          <div class="injury-days">${giorni} giorni</div>
        </div>
        ${i.sintomi ? `<div class="injury-row"><strong>Sintomi:</strong> ${escapeHtml(i.sintomi)}</div>` : ''}
        ${i.terapia ? `<div class="injury-row"><strong>Terapia:</strong> ${escapeHtml(i.terapia)}</div>` : ''}
        <div class="injury-recovery">
          <span class="lbl">Recovery</span>
          <span class="bar"><span class="fill" style="width:${recovery}%"></span></span>
          <span class="val">${recovery}%</span>
        </div>
        <div class="injury-actions">
          <button class="btn-sm" data-update-inf="${i.id}">aggiorna</button>
          <button class="btn-sm" data-resolve-inf="${i.id}">segna risolto</button>
          <button class="btn-sm danger" data-del-inf="${i.id}">elimina</button>
        </div>
      </div>
    `;
  }

  function renderInjuryRisolto(i) {
    const durata = Math.round((new Date(i.dataFine) - new Date(i.dataInizio)) / 86400000);
    return `
      <div class="injury-card injury-risolto">
        <div class="injury-head">
          <div class="injury-title">✓ ${escapeHtml(i.parte)} · ${escapeHtml(i.gravita || 'Lieve')}</div>
          <div class="injury-days">${CS.fmtDate(i.dataInizio, { short: true })} → ${CS.fmtDate(i.dataFine, { short: true })} (${durata}gg)</div>
        </div>
      </div>
    `;
  }

  function afterInfortuni() {
    document.querySelectorAll('.fx-scramble').forEach(el => {
      const t = el.dataset.text;
      if (t) {
        const accent = el.querySelector('.accent');
        if (accent) FX.scramble(accent, 'TUNI', 600);
      }
    });
    // Breathe modulato sulla gravità (rosso = danger)
    document.querySelectorAll('[data-injury-strength]').forEach(el => {
      const s = Number(el.dataset.injuryStrength) || 0;
      FX.breathe(el, s, { variant: 'danger' });
    });
    document.querySelectorAll('[data-stagger]').forEach(c => FX.staggerIn(c, '> *', 70));

    document.getElementById('add-inf')?.addEventListener('click', () => openInfortunioForm(null));
    document.querySelectorAll('[data-update-inf]').forEach(b => {
      b.addEventListener('click', () => openInfortunioForm(b.dataset.updateInf));
    });
    document.querySelectorAll('[data-resolve-inf]').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Segnare questo infortunio come risolto?')) return;
        CS.updateInfortunio(b.dataset.resolveInf, { dataFine: CS.todayISO(), recoveryPercent: 100 });
        ROUTER.go('tecnica', 'infortuni');
      });
    });
    document.querySelectorAll('[data-del-inf]').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Eliminare definitivamente?')) return;
        CS.deleteInfortunio(b.dataset.delInf);
        ROUTER.go('tecnica', 'infortuni');
      });
    });
  }

  function openInfortunioForm(id) {
    const existing = id ? (CS.state.infortuni || []).find(i => i.id === id) : null;
    const grav = ['Lieve', 'Media', 'Grave'];
    const html = `
      <h2 class="modal-title">${existing ? 'AGGIORNA INFORTUNIO' : 'NUOVO INFORTUNIO'}</h2>
      <div class="field"><label class="field-label">Parte del corpo</label>
        <input class="input" id="i-parte" value="${escapeHtml(existing?.parte || '')}" placeholder="Es. spalla destra"></div>
      <div class="field"><label class="field-label">Gravità</label>
        <select class="input" id="i-grav">${grav.map(g => `<option ${existing?.gravita === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="row" style="gap:var(--sp-3)">
        <div class="field" style="flex:1"><label class="field-label">Data inizio</label>
          <input class="input" type="date" id="i-di" value="${existing?.dataInizio || CS.todayISO()}"></div>
        <div class="field" style="flex:1"><label class="field-label">Data fine (vuoto = attivo)</label>
          <input class="input" type="date" id="i-df" value="${existing?.dataFine || ''}"></div>
      </div>
      <div class="field"><label class="field-label">Sintomi</label>
        <textarea class="input" id="i-sin" rows="2">${escapeHtml(existing?.sintomi || '')}</textarea></div>
      <div class="field"><label class="field-label">Terapia</label>
        <textarea class="input" id="i-ter" rows="2">${escapeHtml(existing?.terapia || '')}</textarea></div>
      <div class="field"><label class="field-label">Recovery % (0-100)</label>
        <input class="input" type="number" min="0" max="100" id="i-rec" value="${existing?.recoveryPercent || 0}"></div>
      <div class="field"><label class="field-label">Note</label>
        <textarea class="input" id="i-note" rows="2">${escapeHtml(existing?.note || '')}</textarea></div>
      <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn ghost" data-close>ANNULLA</button>
        <button class="btn primary" id="i-sv">SALVA</button>
      </div>
    `;
    const m = UI.modal(html);
    m.el.querySelector('#i-sv').addEventListener('click', () => {
      const parte = m.el.querySelector('#i-parte').value.trim();
      if (!parte) return UI.toast('Inserisci la parte del corpo', 'warn');
      const payload = {
        parte,
        gravita: m.el.querySelector('#i-grav').value,
        dataInizio: m.el.querySelector('#i-di').value,
        dataFine: m.el.querySelector('#i-df').value || null,
        sintomi: m.el.querySelector('#i-sin').value,
        terapia: m.el.querySelector('#i-ter').value,
        recoveryPercent: Number(m.el.querySelector('#i-rec').value) || 0,
        note: m.el.querySelector('#i-note').value,
      };
      if (existing) CS.updateInfortunio(existing.id, payload);
      else CS.addInfortunio(payload);
      m.close();
      UI.toast('Infortunio salvato', 'ok');
      ROUTER.go('tecnica', 'infortuni');
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 6 — TEORIA
  //   Consultazione della base di conoscenza. Ogni voce mostra
  //   il TUO voto attuale accanto alla rubrica, così la teoria
  //   non è un manuale staccato ma è agganciata ai tuoi dati.
  // ════════════════════════════════════════════════════
  const TS = { tab: 'aree', open: null };   // stato locale della vista

  function votoAttualeFor(kind, name) {
    const voti = kind === 'fond'
      ? (CS.state.fondVoti || []).filter(v => v.esercizio === name)
      : (CS.state.areeVoti || []).filter(v => v.area === name);
    if (!voti.length) return null;
    const last = voti.slice(-3).map(v => Number(v.voto)).filter(x => x > 0);
    if (!last.length) return null;
    return { media: last.reduce((a, b) => a + b, 0) / last.length, n: voti.length };
  }

  function renderTeoria() {
    if (typeof TEORIA === 'undefined') {
      return `<div class="page-header"><h1 class="page-title">TEORIA</h1></div>
        ${UI.empty('📖', 'BASE DI CONOSCENZA NON CARICATA', 'Manca data/teoria.js')}`;
    }
    const tabs = [
      { id: 'aree',     lbl: 'AREE TECNICHE', n: Object.keys(TEORIA.aree).length },
      { id: 'fond',     lbl: 'FONDAMENTALI',  n: Object.keys(TEORIA.fondamentali).length },
      { id: 'concetti', lbl: 'PRINCIPI',      n: TEORIA.concetti.length },
    ];
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title fx-scramble" data-text="TEORIA">BASE DI <span class="accent">CONOSCENZA</span></h1>
          <div class="page-sub">Il riferimento con cui dare voti confrontabili nel tempo · ${Object.keys(TEORIA.aree).length + Object.keys(TEORIA.fondamentali).length} voci tecniche · ${TEORIA.concetti.length} principi</div>
        </div>
      </div>

      <div class="teoria-tabs">
        ${tabs.map(t => `<button class="teoria-tab ${t.id === TS.tab ? 'active' : ''}" data-teoria-tab="${t.id}">${t.lbl}<span class="teoria-tab-n">${t.n}</span></button>`).join('')}
      </div>

      <div class="teoria-grid" data-stagger>
        ${TS.tab === 'concetti' ? renderConcetti() : renderVociTeoria(TS.tab)}
      </div>
    `;
  }

  function renderVociTeoria(tab) {
    const kind = tab === 'fond' ? 'fond' : 'area';
    const src  = tab === 'fond' ? TEORIA.fondamentali : TEORIA.aree;
    const icons = tab === 'fond' ? FOND_ICONS : AREE_ICONS;
    return Object.entries(src).map(([nome, t]) => {
      const v = votoAttualeFor(kind, nome);
      const col = v ? votoColor(v.media) : 'rgba(255,255,255,.15)';
      const isOpen = TS.open === kind + '|' + nome;
      const punti = t.chiave || t.metodo || [];
      const drill = t.allena || [];
      const rub = t.rubrica || {};
      const cur = v ? Math.round(v.media) : null;
      return `
        <article class="teoria-card ${isOpen ? 'is-open' : ''}" style="--voto-c:${col}" data-teoria-key="${kind}|${escapeHtml(nome)}">
          <button type="button" class="teoria-card-head" aria-expanded="${isOpen}">
            <span class="teoria-card-ico">${icons[nome] || '◆'}</span>
            <span class="teoria-card-name-wrap">
              <span class="teoria-card-name">${escapeHtml(nome)}</span>
              <span class="teoria-card-cosa">${escapeHtml(t.cosa)}</span>
            </span>
            <span class="teoria-card-voto">
              ${v ? `<b>${v.media.toFixed(1)}</b><em>/10</em>` : '<span class="teoria-card-novote">—</span>'}
              <span class="teoria-card-voto-lbl">${v ? 'ultime 3' : 'mai votato'}</span>
            </span>
            <span class="teoria-card-chev">▾</span>
          </button>
          <div class="teoria-card-body">
            ${punti.length ? `<div class="teoria-sect"><div class="teoria-sect-title good">ESECUZIONE CORRETTA</div><ul class="teoria-list is-good">${punti.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
            ${t.errori ? `<div class="teoria-sect"><div class="teoria-sect-title warn">ERRORI FREQUENTI</div><ul class="teoria-list is-warn">${t.errori.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
            ${drill.length ? `<div class="teoria-sect"><div class="teoria-sect-title info">COME ALLENARLA</div><ul class="teoria-list is-info">${drill.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
            ${Object.keys(rub).length ? `
              <div class="teoria-sect">
                <div class="teoria-sect-title">RUBRICA DI AUTOVALUTAZIONE</div>
                <div class="teoria-rubrica">
                  ${Object.keys(rub).map(Number).sort((a, b) => a - b).map(lv => `
                    <div class="teoria-rub-row ${cur !== null && cur >= lv ? 'is-reached' : ''} ${cur !== null && cur === lv ? 'is-current' : ''}">
                      <span class="teoria-rub-lv" style="--lv-c:${votoColor(lv)}">${lv}</span>
                      <span class="teoria-rub-txt">${escapeHtml(rub[lv])}</span>
                    </div>`).join('')}
                </div>
              </div>` : ''}
            <div class="teoria-card-actions">
              <button class="btn-sm teoria-vota-btn" data-teoria-vota="${kind}|${escapeHtml(nome)}">VOTA ORA →</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function renderConcetti() {
    return TEORIA.concetti.map(c => {
      const isOpen = TS.open === 'c|' + c.id;
      return `
        <article class="teoria-card teoria-card-concetto ${isOpen ? 'is-open' : ''}" data-teoria-key="c|${c.id}">
          <button type="button" class="teoria-card-head" aria-expanded="${isOpen}">
            <span class="teoria-card-ico">${c.ico}</span>
            <span class="teoria-card-name-wrap">
              <span class="teoria-card-name">${escapeHtml(c.titolo)}</span>
              <span class="teoria-card-cosa">${escapeHtml(c.sommario)}</span>
            </span>
            <span class="teoria-card-chev">▾</span>
          </button>
          <div class="teoria-card-body">
            <ul class="teoria-list is-plain">${c.corpo.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
          </div>
        </article>`;
    }).join('');
  }

  function afterTeoria() {
    if (typeof TEORIA === 'undefined') return;
    document.querySelectorAll('[data-teoria-tab]').forEach(b => {
      b.addEventListener('click', () => {
        TS.tab = b.dataset.teoriaTab;
        TS.open = null;
        ROUTER.go('tecnica', 'teoria');
      });
    });
    document.querySelectorAll('.teoria-card').forEach(card => {
      card.querySelector('.teoria-card-head')?.addEventListener('click', () => {
        const key = card.dataset.teoriaKey;
        const willOpen = TS.open !== key;
        // accordion: una sola card aperta per volta
        document.querySelectorAll('.teoria-card.is-open').forEach(c => {
          c.classList.remove('is-open');
          c.querySelector('.teoria-card-head')?.setAttribute('aria-expanded', 'false');
        });
        TS.open = willOpen ? key : null;
        card.classList.toggle('is-open', willOpen);
        card.querySelector('.teoria-card-head')?.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) FX.glowBurst(card, 'var(--neon)');
      });
    });
    document.querySelectorAll('[data-teoria-vota]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const [kind, nome] = b.dataset.teoriaVota.split('|');
        openVotaModal(kind, nome);
      });
    });
    const grid = document.querySelector('.teoria-grid');
    if (grid) FX.staggerIn(grid, '> *', 40);
  }

  // ─── helpers ─────────────────────────────────────────
  function avg(arr) {
    const valid = arr.filter(x => x && !isNaN(x));
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ─── REGISTER ROUTES ────────────────────────────────
  ROUTER.register('tecnica/vota',         renderVota,         afterVota);
  ROUTER.register('tecnica/aree',         renderAree,         afterAree);
  ROUTER.register('tecnica/fondamentali', renderFondamentali, afterFondamentali);
  ROUTER.register('tecnica/sessioni',     renderSessioni,     afterSessioni);
  ROUTER.register('tecnica/infortuni',    renderInfortuni,    afterInfortuni);
  ROUTER.register('tecnica/teoria',       renderTeoria,       afterTeoria);

})();
