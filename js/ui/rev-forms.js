/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8.1 — REVISIONE FORMS (STEPPER)
   3 step navigabili: ALLENAMENTO · CORPO · NOTE
   ═══════════════════════════════════════════════════════ */

const REV_FORMS = (function () {

  // ─── STATE locale stepper ────────────────────────────
  let state = null;

  function emptyState(date) {
    const out = {
      data: date,
      oreAllenamento: 0,             // auto = somma dettagliSessioni[].ore (read-only quando dettagli presenti)
      sessioniGiorno: 1,             // auto = dettagliSessioni.length (default 1)
      dettagliSessioni: [],          // [{ore, tipo}] — ogni elem è una sessione del giorno
      tipo: [],                      // legacy: unione di dettagliSessioni[].tipo (deduplicato)
      tecnica: 0,                    // 0 = non valutato (display "—" in archivio). L'utente deve muovere lo slider per dare un voto.
      intensita: 0,
      affaticamento: 0,
      riposo: false,
      sonnoOre: 7.5,
      sonnoQualita: 3,
      mood: [],
      flessioni: 0,
      squat: 0,
      addominali: 0,
      kmCorsa: 0,
      bene: '',
      migliora: '',
    };
    // Settings v4: init dinamico campi extra abilitati per daily
    if (CS.getEnabledFields) {
      CS.getEnabledFields('daily').extras.forEach(f => { out[f.key] = 0; });
    }
    return out;
  }

  // Helpers settings — letti con fallback alle costanti di default
  function getTipiCatalogo() {
    return (CS.state.cataloghi && CS.state.cataloghi.tipiAllenamento) || CS.TIPI_ALLENAMENTO;
  }
  function getMoodCatalogo() {
    return (CS.state.cataloghi && CS.state.cataloghi.mood) || CS.MOOD_LIST;
  }
  function getCoreVisibility() {
    return (CS.state.revFieldsConfig && CS.state.revFieldsConfig.coreVisibility) || {};
  }
  function getExtras(scope) {
    return CS.getEnabledFields ? CS.getEnabledFields(scope).extras : [];
  }

  // Renderizza un blocco "VOLUMI EXTRA" con i campi extra abilitati per lo scope
  function renderExtrasBlock(scope, valuesObj, idPrefix) {
    const extras = getExtras(scope);
    if (extras.length === 0) return '';
    const cells = extras.map(f => `
      <div class="rev-vol">
        <span class="rev-vol-icon">${f.icon || '📌'}</span>
        <input class="rev-vol-input" type="number" step="0.1" id="${idPrefix}${f.key}" value="${valuesObj[f.key] || ''}" placeholder="0">
        <span class="rev-vol-lbl">${f.label}${f.unit ? ` · ${f.unit}` : ''}</span>
      </div>
    `).join('');
    return `
      <div class="rev-step-block">
        <div class="rev-step-eyebrow" style="margin-bottom:var(--sp-3)">VOLUMI EXTRA</div>
        <div class="rev-vol-row">${cells}</div>
      </div>
    `;
  }

  // Collecta i valori dei campi extra dello scope corrente dal DOM nell'oggetto target
  function collectExtras(scope, target, idPrefix) {
    getExtras(scope).forEach(f => {
      const el = document.getElementById(idPrefix + f.key);
      if (el) target[f.key] = parseFloat(el.value) || 0;
    });
  }

  // ─── MODE SWITCH (giorn / sett / mens) ───────────────
  function modeSwitchHtml(currentMode) {
    const modes = [
      { id: 'daily',   label: 'GIORNALIERA' },
      { id: 'weekly',  label: 'SETTIMANALE' },
      { id: 'monthly', label: 'MENSILE' },
    ];
    return `
      <div class="rev-mode-switch" role="tablist">
        ${modes.map(x =>
          `<button class="rev-mode-pill ${x.id === currentMode ? 'active' : ''}" data-mode="${x.id}" role="tab">${x.label}</button>`
        ).join('')}
      </div>
    `;
  }

  function bindModeSwitch(modal, currentMode) {
    modal.el.querySelectorAll('.rev-mode-pill').forEach(b => {
      b.addEventListener('click', () => {
        const newMode = b.dataset.mode;
        if (newMode === currentMode) return;
        modal.close();
        if (newMode === 'daily')   openDaily();
        else if (newMode === 'weekly')  openWeekly();
        else openMonthly();
      });
    });
  }

  // ─── OPEN DAILY (stepper) ────────────────────────────
  function openDaily(dateIso) {
    const date = dateIso || CS.todayISO();
    const existing = CS.getRevByDate(date);
    state = Object.assign(emptyState(date), existing || {});
    let step = 0;

    const m = UI.modal(`
      <div class="fx-stepper rev-step-wrap">
        <div class="rev-step-head">
          <div>
            <div class="rev-step-eyebrow">REVISIONE</div>
            <h2 class="fx-display rev-step-title">${CS.fmtDate(date, { long: true }).toUpperCase()}</h2>
          </div>
          <button class="action-btn" data-close aria-label="chiudi">✕</button>
        </div>
        ${modeSwitchHtml('daily')}
        <div class="fx-stepper-track" id="rev-track">
          <div class="fx-stepper-pill now"   data-step="0"></div>
          <div class="fx-stepper-pill"       data-step="1"></div>
          <div class="fx-stepper-pill"       data-step="2"></div>
        </div>
        <div class="fx-stepper-body" id="rev-body"></div>
        <div class="fx-stepper-nav">
          <button class="btn ghost"  id="rev-prev" disabled>← INDIETRO</button>
          <div class="rev-step-labels">
            <span class="rev-step-num">STEP <span id="rev-num">1</span>/3</span>
            <span class="rev-step-name" id="rev-name">ALLENAMENTO</span>
          </div>
          <button class="btn primary" id="rev-next">AVANTI →</button>
        </div>
      </div>
    `, { anchorTop: true, exclusive: true });
    m.el.classList.add('lg', 'rev-modal');
    bindModeSwitch(m, 'daily');

    const body = m.el.querySelector('#rev-body');
    const track = m.el.querySelector('#rev-track');
    const btnPrev = m.el.querySelector('#rev-prev');
    const btnNext = m.el.querySelector('#rev-next');
    const stepNum = m.el.querySelector('#rev-num');
    const stepName = m.el.querySelector('#rev-name');
    const STEPS = ['ALLENAMENTO', 'CORPO & MENTE', 'VOLUMI & NOTE'];

    function renderStep(i) {
      if (i === 0)      body.innerHTML = renderStepAllenamento();
      else if (i === 1) body.innerHTML = renderStepCorpo();
      else              body.innerHTML = renderStepNote();
      attachStep(i);
      // pill stato
      track.querySelectorAll('.fx-stepper-pill').forEach((p, idx) => {
        p.classList.toggle('now',  idx === i);
        p.classList.toggle('done', idx < i);
      });
      stepNum.textContent = i + 1;
      stepName.textContent = STEPS[i];
      btnPrev.disabled = i === 0;
      btnNext.textContent = i === 2 ? '✓ SALVA' : 'AVANTI →';
      btnNext.classList.toggle('btn-cta', i === 2);
      btnNext.classList.toggle('primary', i !== 2);
    }

    btnPrev.addEventListener('click', () => {
      if (step > 0) { collect(step); step--; renderStep(step); }
    });
    btnNext.addEventListener('click', (e) => {
      collect(step);
      if (step < 2) { step++; renderStep(step); }
      else { save(m, btnNext); }
    });

    renderStep(0);
  }

  // ═════════════════════════════════════════════════════
  // STEP 1 — ALLENAMENTO
  // ═════════════════════════════════════════════════════
  function renderStepAllenamento() {
    const core = getCoreVisibility();
    // Inizializza dettagliSessioni se vuoto: una sessione vuota di default
    if (!Array.isArray(state.dettagliSessioni) || state.dettagliSessioni.length === 0) {
      // Se la revisione è vecchia (ha oreAllenamento ma non dettagliSessioni), genera dettagli da fallback
      const legacyOre = Number(state.oreAllenamento) || 0;
      const legacyN = Math.max(1, Number(state.sessioniGiorno) || 1);
      const legacyTipo = Array.isArray(state.tipo) && state.tipo.length ? state.tipo[0] : '';
      if (legacyOre > 0) {
        const orePer = legacyOre / legacyN;
        state.dettagliSessioni = Array.from({ length: legacyN }, () => ({ ore: orePer, tipo: legacyTipo }));
      } else {
        state.dettagliSessioni = [{ ore: 0, tipo: '' }];
      }
    }
    const totOre = state.dettagliSessioni.reduce((s, x) => s + (Number(x.ore) || 0), 0);
    return `
      <div class="rev-step-block">
        <div class="rev-step-row rev-grid-2">
          <div class="field rev-big-num">
            <label class="field-label">ALLENAMENTO · MINUTI</label>
            <input class="input rev-input-xl" type="number" step="5" min="0" id="r-ore"
                   value="${totOre ? DURATA.inMinuti(totOre) : ''}" placeholder="0">
            <div class="rev-sess-ore-eco" id="r-ore-eco">${CS.fmtDurata(totOre, { zero: '' })}</div>
          </div>
          <label class="rev-rest-toggle">
            <input type="checkbox" id="r-riposo" ${state.riposo ? 'checked' : ''}>
            <span class="rev-rest-pill"><span>🛌</span><span>GIORNO DI RIPOSO</span></span>
          </label>
        </div>
      </div>

      ${renderExtrasBlock('daily', state, 'r-')}

      <div class="rev-step-block" id="r-not-rest">
        <div class="field">
          <div class="rev-sess-list-head">
            <label class="field-label">SESSIONI DEL GIORNO · target 2/gg</label>
            <button type="button" class="rev-sess-add-btn" id="r-sess-add" title="Aggiungi sessione">+ AGGIUNGI</button>
          </div>
          <div class="rev-sess-list" id="r-sess-list">
            ${state.dettagliSessioni.map((s, i) => renderSessCard(s, i, state.dettagliSessioni.length)).join('')}
          </div>
          <div class="rev-sess-total" id="r-sess-total">
            TOTALE: <b id="r-sess-tot-ore">${CS.fmtDurata(totOre, { zero: '0 min' })}</b> · <b id="r-sess-tot-n">${state.dettagliSessioni.length}</b> session${state.dettagliSessioni.length === 1 ? 'e' : 'i'}
          </div>
        </div>

        ${sliderRow('TECNICA', 'r-tec', state.tecnica, 0, 10, 0.5, '🥊')}
        ${core.intensita !== false ? sliderRow('INTENSITÀ', 'r-int', state.intensita, 0, 10, 0.5, '🔥') : ''}
        ${core.affaticamento !== false ? sliderRow('AFFATICAMENTO', 'r-aff', state.affaticamento, 0, 10, 0.5, '⚡') : ''}
      </div>
    `;
  }

  // Card di una sessione: ore + chip-grid tipo (selezione singola) + bottone × se n > 1
  function renderSessCard(sess, idx, total) {
    const tipi = getTipiCatalogo();
    const chips = tipi.map(t =>
      `<button type="button" class="fx-chip ${sess.tipo === t.id ? 'on' : ''}" data-tipo="${t.id}">${t.icon} ${t.label}</button>`
    ).join('');
    const canDelete = total > 1;
    return `
      <div class="rev-sess-card" data-sess-idx="${idx}">
        <div class="rev-sess-card-head">
          <span class="rev-sess-card-title">SESSIONE ${idx + 1}</span>
          ${canDelete ? `<button type="button" class="rev-sess-del-btn" data-act="del" data-idx="${idx}" title="Rimuovi sessione">×</button>` : ''}
        </div>
        <div class="rev-sess-card-body">
          <div class="rev-sess-ore-field">
            <label class="rev-sess-mini-lbl">MINUTI</label>
            <input class="input rev-sess-ore-input" type="number" step="5" min="0"
                   value="${sess.ore ? DURATA.inMinuti(sess.ore) : ''}" placeholder="0" data-sess-ore="${idx}">
            <div class="rev-sess-ore-eco" data-sess-eco="${idx}">${CS.fmtDurata(sess.ore, { zero: '' })}</div>
          </div>
          <div class="rev-sess-tipo-field">
            <label class="rev-sess-mini-lbl">TIPO · uno</label>
            <div class="fx-chip-grid rev-sess-tipo-chips" data-sess-tipo="${idx}">${chips}</div>
          </div>
        </div>
      </div>
    `;
  }

  function attachStepAllenamento() {
    const restCb = document.getElementById('r-riposo');
    const block = document.getElementById('r-not-rest');
    function syncRest() {
      const r = restCb.checked;
      block.style.opacity = r ? '0.35' : '1';
      block.style.pointerEvents = r ? 'none' : 'auto';
    }
    restCb.addEventListener('change', syncRest);
    syncRest();

    // ── Repeater sessioni del giorno ──
    bindSessHandlers();

    const core = getCoreVisibility();
    const sliderIds = ['r-tec'];
    if (core.intensita !== false) sliderIds.push('r-int');
    if (core.affaticamento !== false) sliderIds.push('r-aff');
    bindSliders(sliderIds);
  }

  // Aggancia handlers per add/del/edit ore + chip tipo (chiamato anche dopo re-render lista)
  function bindSessHandlers() {
    const list = document.getElementById('r-sess-list');
    if (!list) return;

    // Click + AGGIUNGI
    const addBtn = document.getElementById('r-sess-add');
    if (addBtn) {
      addBtn.onclick = () => {
        if (state.dettagliSessioni.length >= 6) return;
        state.dettagliSessioni.push({ ore: 0, tipo: '' });
        rerenderSessList();
      };
    }

    // Delegation per × (rimuovi sessione)
    list.querySelectorAll('.rev-sess-del-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        state.dettagliSessioni.splice(idx, 1);
        if (state.dettagliSessioni.length === 0) {
          state.dettagliSessioni = [{ ore: 0, tipo: '' }];
        }
        rerenderSessList();
      };
    });

    // Input ore per ogni sessione
    list.querySelectorAll('[data-sess-ore]').forEach(inp => {
      inp.oninput = () => {
        const idx = Number(inp.dataset.sessOre);
        // Il campo è in minuti — è come si pensa una sessione. Su disco
        // continuano a finire ore decimali, che è il formato del sistema.
        const ore = DURATA.daMinuti(parseFloat(inp.value) || 0);
        if (state.dettagliSessioni[idx]) state.dettagliSessioni[idx].ore = ore;
        const eco = document.querySelector(`[data-sess-eco="${idx}"]`);
        if (eco) eco.textContent = CS.fmtDurata(ore, { zero: '' });
        updateSessTotale();
      };
    });

    // Chip tipo per ogni sessione (selezione SINGOLA per card)
    list.querySelectorAll('[data-sess-tipo]').forEach(grid => {
      const idx = Number(grid.dataset.sessTipo);
      grid.querySelectorAll('.fx-chip').forEach(c => {
        c.onclick = () => {
          const tipo = c.dataset.tipo;
          // Toggle: se già attivo, deseleziona; altrimenti seleziona e deseleziona gli altri
          const isOn = c.classList.contains('on');
          grid.querySelectorAll('.fx-chip').forEach(x => x.classList.remove('on'));
          if (!isOn) c.classList.add('on');
          if (state.dettagliSessioni[idx]) {
            state.dettagliSessioni[idx].tipo = isOn ? '' : tipo;
          }
        };
      });
    });

    updateSessTotale();
  }

  function rerenderSessList() {
    const list = document.getElementById('r-sess-list');
    if (!list) return;
    list.innerHTML = state.dettagliSessioni
      .map((s, i) => renderSessCard(s, i, state.dettagliSessioni.length))
      .join('');
    bindSessHandlers();
  }

  function updateSessTotale() {
    const totOre = state.dettagliSessioni.reduce((s, x) => s + (Number(x.ore) || 0), 0);
    const n = state.dettagliSessioni.length;
    const oreInput = document.getElementById('r-ore');
    if (oreInput) oreInput.value = totOre > 0 ? DURATA.inMinuti(totOre) : '';
    const oreEco = document.getElementById('r-ore-eco');
    if (oreEco) oreEco.textContent = CS.fmtDurata(totOre, { zero: '' });
    const totOreEl = document.getElementById('r-sess-tot-ore');
    if (totOreEl) totOreEl.textContent = CS.fmtDurata(totOre, { zero: '0 min' });
    const totNEl = document.getElementById('r-sess-tot-n');
    if (totNEl) totNEl.textContent = String(n);
    const totalEl = document.getElementById('r-sess-total');
    if (totalEl) {
      totalEl.classList.toggle('is-target', n === 2);
      totalEl.classList.toggle('is-over', n > 2);
    }
  }

  // ═════════════════════════════════════════════════════
  // STEP 2 — CORPO & MENTE
  // ═════════════════════════════════════════════════════
  function renderStepCorpo() {
    const core = getCoreVisibility();
    const moodChips = getMoodCatalogo().map(m =>
      `<button type="button" class="fx-chip ${state.mood.includes(m.id) ? 'on' : ''}" data-mood="${m.id}">${m.icon} ${m.label}</button>`
    ).join('');
    return `
      <div class="rev-step-block ${core.sonnoQualita !== false ? 'rev-grid-2' : ''}">
        <div class="field rev-big-num">
          <label class="field-label">SONNO · MINUTI</label>
          <input class="input rev-input-xl" type="number" step="15" min="0" id="r-sonno"
                 value="${state.sonnoOre ? DURATA.inMinuti(state.sonnoOre) : ''}" placeholder="450">
          <div class="rev-sess-ore-eco" id="r-sonno-eco">${CS.fmtDurata(state.sonnoOre, { zero: '' })}</div>
        </div>
        ${core.sonnoQualita !== false ? sliderRow('QUALITÀ SONNO', 'r-sonnoq', state.sonnoQualita, 1, 5, 1, '⭐') : ''}
      </div>

      ${core.moodChips !== false ? `
      <div class="rev-step-block">
        <div class="field">
          <label class="field-label">MOOD · multi</label>
          <div class="fx-chip-grid" id="r-mood">${moodChips}</div>
        </div>
      </div>
      ` : ''}
    `;
  }

  function attachStepCorpo() {
    const core = getCoreVisibility();
    const sonnoInput = document.getElementById('r-sonno');
    const sonnoEco = document.getElementById('r-sonno-eco');
    if (sonnoInput && sonnoEco) {
      sonnoInput.addEventListener('input', () => {
        sonnoEco.textContent = CS.fmtDurata(DURATA.daMinuti(parseFloat(sonnoInput.value) || 0), { zero: '' });
      });
    }
    if (core.sonnoQualita !== false) bindSliders(['r-sonnoq']);
    if (core.moodChips !== false) {
      document.querySelectorAll('#r-mood .fx-chip').forEach(c =>
        c.addEventListener('click', () => c.classList.toggle('on')));
    }
  }

  // ═════════════════════════════════════════════════════
  // STEP 3 — VOLUMI & NOTE
  // ═════════════════════════════════════════════════════
  function renderStepNote() {
    const core = getCoreVisibility();
    const volCells = [
      core.flessioni  !== false ? `<div class="rev-vol"><span class="rev-vol-icon">💪</span><input class="rev-vol-input" type="number" id="r-fless" value="${state.flessioni || ''}" placeholder="0"><span class="rev-vol-lbl">flessioni</span></div>` : '',
      core.squat      !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🦵</span><input class="rev-vol-input" type="number" id="r-squat" value="${state.squat || ''}" placeholder="0"><span class="rev-vol-lbl">squat</span></div>` : '',
      core.addominali !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🔥</span><input class="rev-vol-input" type="number" id="r-addo" value="${state.addominali || ''}" placeholder="0"><span class="rev-vol-lbl">addominali</span></div>` : '',
      core.kmCorsa    !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🏃</span><input class="rev-vol-input" type="number" step="0.1" id="r-km" value="${state.kmCorsa || ''}" placeholder="0"><span class="rev-vol-lbl">km corsa</span></div>` : '',
    ].filter(Boolean).join('');
    const volBlock = volCells ? `
      <div class="rev-step-block">
        <div class="field"><label class="field-label">VOLUMI DEL GIORNO</label>
          <div class="rev-vol-row">${volCells}</div>
        </div>
      </div>
    ` : '';
    return `
      ${volBlock}

      <div class="rev-step-block">
        <div class="rev-grid-2">
          <div class="field">
            <label class="field-label">✓ COSA È ANDATO BENE</label>
            <textarea class="textarea" id="r-bene" rows="3" placeholder="Una frase basta...">${state.bene || ''}</textarea>
          </div>
          <div class="field">
            <label class="field-label">↑ COSA MIGLIORARE</label>
            <textarea class="textarea" id="r-migl" rows="3" placeholder="Una cosa concreta">${state.migliora || ''}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function attachStepNote() {}

  // ═════════════════════════════════════════════════════
  // HELPERS slider + collect
  // ═════════════════════════════════════════════════════
  function sliderRow(label, id, val, min, max, step, icon) {
    return `
      <div class="field">
        <label class="field-label">${icon || ''} ${label}</label>
        <div class="fx-slider-row">
          <input class="fx-slider" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
          <div class="fx-slider-val" id="${id}-v">${val}</div>
        </div>
        <div class="fx-slider-ticks">
          <span>${min}</span><span>${max}</span>
        </div>
      </div>
    `;
  }

  function bindSliders(ids) {
    ids.forEach(id => {
      const inp = document.getElementById(id);
      const v   = document.getElementById(id + '-v');
      if (!inp || !v) return;
      const sync = () => { v.textContent = inp.value; };
      // input fire durante drag (desktop + mouse), change fire al rilascio (sicurezza touch/safari mobile)
      inp.addEventListener('input',  sync);
      inp.addEventListener('change', sync);
    });
  }

  function attachStep(i) {
    if (i === 0) attachStepAllenamento();
    else if (i === 1) attachStepCorpo();
    else attachStepNote();
  }

  function collect(i) {
    const core = getCoreVisibility();
    if (i === 0) {
      // Pulisci sessioni vuote (ore=0 e tipo='') ma tieni almeno 1
      const dettagli = (state.dettagliSessioni || []).filter(s => (Number(s.ore) || 0) > 0 || s.tipo);
      state.dettagliSessioni = dettagli.length ? dettagli : [];
      // Derivati: se ci sono sessioni con ore, usa la loro somma; altrimenti prendi il valore manuale digitato in r-ore
      const sessOre = state.dettagliSessioni.reduce((s, x) => s + (Number(x.ore) || 0), 0);
      const manualOre = DURATA.daMinuti(parseFloat(document.getElementById('r-ore')?.value) || 0);
      state.oreAllenamento = sessOre > 0 ? sessOre : manualOre;
      state.sessioniGiorno = Math.max(1, state.dettagliSessioni.length || 1);
      // tipo[] legacy = unione dei tipi delle sessioni (deduplicato, esclude vuoti)
      state.tipo = [...new Set(state.dettagliSessioni.map(s => s.tipo).filter(Boolean))];
      state.tecnica       = parseFloat(document.getElementById('r-tec')?.value) || 0;
      if (core.intensita !== false)
        state.intensita   = parseFloat(document.getElementById('r-int')?.value) || 0;
      if (core.affaticamento !== false)
        state.affaticamento = parseFloat(document.getElementById('r-aff')?.value) || 0;
      state.riposo        = !!document.getElementById('r-riposo')?.checked;
      // Settings v4: extras nello step 1
      collectExtras('daily', state, 'r-');
    } else if (i === 1) {
      state.sonnoOre     = DURATA.daMinuti(parseFloat(document.getElementById('r-sonno')?.value) || 0);
      if (core.sonnoQualita !== false)
        state.sonnoQualita = parseInt(document.getElementById('r-sonnoq')?.value) || 3;
      if (core.moodChips !== false)
        state.mood = Array.from(document.querySelectorAll('#r-mood .fx-chip.on')).map(c => c.dataset.mood);
    } else {
      if (core.flessioni  !== false) state.flessioni  = parseInt(document.getElementById('r-fless')?.value) || 0;
      if (core.squat      !== false) state.squat      = parseInt(document.getElementById('r-squat')?.value) || 0;
      if (core.addominali !== false) state.addominali = parseInt(document.getElementById('r-addo')?.value)  || 0;
      if (core.kmCorsa    !== false) state.kmCorsa    = parseFloat(document.getElementById('r-km')?.value)  || 0;
      state.bene     = (document.getElementById('r-bene')?.value || '').trim();
      state.migliora = (document.getElementById('r-migl')?.value || '').trim();
    }
  }

  function save(modal, btn) {
    CS.addRevisione(state);
    if (typeof FX !== 'undefined') FX.glowBurst(btn);
    UI.toast('Revisione salvata', 'ok');
    const wk = CALC.settimanaTopCheck(new Date(state.data));
    if (wk.gold) UI.toast('🏆 SETTIMANA D\'ORO!', 'gold', 3500);
    modal.close();
    if (typeof ROUTER !== 'undefined') {
      const cur = ROUTER.current();
      if (cur.section) ROUTER.go(cur.section, cur.sub);
    }
  }

  // ═════════════════════════════════════════════════════
  // HELPERS condivisi WEEKLY / MONTHLY
  // ═════════════════════════════════════════════════════

  // Raccoglie le daily nel range [startISO..endISO] (inclusive) e ritorna { agg, count }
  function aggregateDailyRange(startISO, endISO) {
    const start = new Date(startISO); start.setHours(0, 0, 0, 0);
    const end   = new Date(endISO);   end.setHours(23, 59, 59, 999);
    const revs = (CS.state.revisioni || []).filter(r => {
      if (!r.data) return false;
      const d = new Date(r.data);
      return d >= start && d <= end;
    });
    return {
      revs,
      count: revs.length,
      agg: revs.length ? CALC.aggregateRevs(revs) : null,
    };
  }

  // Pre-fill struct da agg (settimanale)
  function fillWeeklyFromAgg(s, agg) {
    if (!agg) return s;
    s.oreTot    = Number((agg.ore || 0).toFixed(1));
    s.sessTot   = agg.sessioni || 0;
    s.flessTot  = agg.flessioni || 0;
    s.squatTot  = agg.squat || 0;
    s.addoTot   = agg.addominali || 0;
    s.kmTot     = Number((agg.kmCorsa || 0).toFixed(1));
    s.sonnoMedio = Number((agg.sonnoMedio || 0).toFixed(1));
    return s;
  }

  // Pre-fill struct da agg (mensile)
  function fillMonthlyFromAgg(s, agg) {
    return fillWeeklyFromAgg(s, agg);
  }

  // Nav settimana: previous/next ISO Monday
  function shiftWeekISO(weekStartISO, deltaWeeks) {
    const d = new Date(weekStartISO);
    d.setDate(d.getDate() + deltaWeeks * 7);
    return CS.isoDateOnly(d);
  }

  // Nav mese: previous/next "YYYY-MM"
  function shiftMonthKey(monthKey, deltaMonths) {
    const [yr, mo] = monthKey.split('-').map(Number);
    const d = new Date(yr, mo - 1 + deltaMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // Limite "futuro": settimana non andare oltre quella corrente
  function isWeekInFuture(weekStartISO) {
    const cur = CS.weekRange(new Date());
    return new Date(weekStartISO) > cur.start;
  }
  function isMonthInFuture(monthKey) {
    const today = new Date();
    const curKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return monthKey > curKey;
  }

  // ═════════════════════════════════════════════════════
  // WEEKLY — STEPPER 3 step
  //   Step 1 · VOLUMI            (ore, sessioni, km, sonno medio)
  //   Step 2 · CONDIZIONAMENTO   (flessioni, squat, addominali, peso fine)
  //   Step 3 · NOTE              (bene, migliora, focus prossima)
  // ═════════════════════════════════════════════════════
  let wState = null;

  function openWeekly(weekStartIso) {
    const refDate = weekStartIso ? new Date(weekStartIso) : new Date();
    const range = CS.weekRange(refDate);
    const startISO = CS.isoDateOnly(range.start);
    const endISO   = CS.isoDateOnly(range.end);

    // Conteggio daily nella settimana
    const { agg, count: dailyCount } = aggregateDailyRange(startISO, endISO);

    const existing = CS.getRevSettByStart(startISO);
    const wInit = {
      weekStartISO: startISO,
      weekEndISO:   endISO,
      oreTot: 0, sessTot: 0, flessTot: 0, squatTot: 0, addoTot: 0,
      kmTot: 0, sonnoMedio: 0, pesoFine: 0,
      bene: '', migliora: '', focusProssima: '',
    };
    // Settings v4: init dinamico campi extra abilitati per weekly
    getExtras('weekly').forEach(f => { wInit[f.key] = 0; });
    wState = Object.assign(wInit, existing || {});

    // Se non c'è un existing, prepopola dalle daily
    if (!existing && agg) {
      fillWeeklyFromAgg(wState, agg);
      // Anche le metriche extra somma dai daily
      getExtras('weekly').forEach(f => {
        wState[f.key] = Number(agg[f.key]) || 0;
      });
    }

    let step = 0;
    const STEPS = ['VOLUMI', 'CONDIZIONAMENTO', 'NOTE'];

    const labelRange = `${CS.fmtDate(startISO, { short: true })} → ${CS.fmtDate(endISO, { short: true })}`;
    const m = UI.modal(`
      <div class="fx-stepper rev-step-wrap">
        <div class="rev-step-head">
          <div>
            <div class="rev-step-eyebrow">REVISIONE SETTIMANALE</div>
            <h2 class="fx-display rev-step-title">${labelRange}</h2>
            <div class="rev-period-nav">
              <button class="btn-sm rev-period-prev" type="button" title="settimana precedente">←</button>
              <span class="rev-period-count">${dailyCount}/7 giorni con daily</span>
              <button class="btn-sm rev-period-next" type="button" title="settimana successiva" ${isWeekInFuture(shiftWeekISO(startISO, 1)) ? 'disabled' : ''}>→</button>
            </div>
          </div>
          <button class="action-btn" data-close aria-label="chiudi">✕</button>
        </div>
        ${modeSwitchHtml('weekly')}
        <div class="fx-stepper-track" id="rev-track">
          <div class="fx-stepper-pill now"   data-step="0"></div>
          <div class="fx-stepper-pill"       data-step="1"></div>
          <div class="fx-stepper-pill"       data-step="2"></div>
        </div>
        <div class="fx-stepper-body" id="rev-body"></div>
        <div class="fx-stepper-nav">
          <button class="btn ghost"  id="rev-prev" disabled>← INDIETRO</button>
          <div class="rev-step-labels">
            <span class="rev-step-num">STEP <span id="rev-num">1</span>/3</span>
            <span class="rev-step-name" id="rev-name">${STEPS[0]}</span>
          </div>
          <button class="btn primary" id="rev-next">AVANTI →</button>
        </div>
      </div>
    `, { anchorTop: true, exclusive: true });
    m.el.classList.add('lg', 'rev-modal');
    bindModeSwitch(m, 'weekly');

    const body    = m.el.querySelector('#rev-body');
    const track   = m.el.querySelector('#rev-track');
    const btnPrev = m.el.querySelector('#rev-prev');
    const btnNext = m.el.querySelector('#rev-next');
    const stepNum = m.el.querySelector('#rev-num');
    const stepName = m.el.querySelector('#rev-name');

    // Nav periodo (← →)
    m.el.querySelector('.rev-period-prev')?.addEventListener('click', () => {
      m.close();
      openWeekly(shiftWeekISO(startISO, -1));
    });
    const nextBtn = m.el.querySelector('.rev-period-next');
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.addEventListener('click', () => {
        m.close();
        openWeekly(shiftWeekISO(startISO, 1));
      });
    }

    function renderStep(i) {
      if (i === 0)      body.innerHTML = renderWeeklyVolumi();
      else if (i === 1) body.innerHTML = renderWeeklyCondiz();
      else              body.innerHTML = renderWeeklyNote();
      attachWeeklyStep(i, startISO, endISO);
      track.querySelectorAll('.fx-stepper-pill').forEach((p, idx) => {
        p.classList.toggle('now',  idx === i);
        p.classList.toggle('done', idx < i);
      });
      stepNum.textContent = i + 1;
      stepName.textContent = STEPS[i];
      btnPrev.disabled = i === 0;
      btnNext.textContent = i === 2 ? '✓ SALVA' : 'AVANTI →';
      btnNext.classList.toggle('btn-cta', i === 2);
      btnNext.classList.toggle('primary', i !== 2);
    }

    btnPrev.addEventListener('click', () => {
      if (step > 0) { collectWeekly(step); step--; renderStep(step); }
    });
    btnNext.addEventListener('click', (e) => {
      collectWeekly(step);
      if (step < 2) { step++; renderStep(step); }
      else { saveWeekly(m, btnNext, existing); }
    });

    renderStep(0);
  }

  function renderWeeklyVolumi() {
    return `
      <div class="rev-step-block">
        <div class="rev-autofill-row">
          <span class="rev-autofill-lbl">Riempi automaticamente dalle daily della settimana</span>
          <button class="btn-sm rev-autofill-btn" type="button" data-autofill="weekly-volumi">↻ AUTOCOMPILA</button>
        </div>
        <div class="rev-vol-row">
          <div class="rev-vol"><span class="rev-vol-icon">⏱</span><input class="rev-vol-input" type="number" step="0.5" id="w-ore" value="${wState.oreTot || ''}" placeholder="0"><span class="rev-vol-lbl">ore tot</span></div>
          <div class="rev-vol"><span class="rev-vol-icon">🥊</span><input class="rev-vol-input" type="number" id="w-sess" value="${wState.sessTot || ''}" placeholder="0"><span class="rev-vol-lbl">sessioni</span></div>
          <div class="rev-vol"><span class="rev-vol-icon">🏃</span><input class="rev-vol-input" type="number" step="0.1" id="w-km" value="${wState.kmTot || ''}" placeholder="0"><span class="rev-vol-lbl">km tot</span></div>
          <div class="rev-vol"><span class="rev-vol-icon">🌙</span><input class="rev-vol-input" type="number" step="0.1" id="w-sonno" value="${wState.sonnoMedio || ''}" placeholder="0"><span class="rev-vol-lbl">sonno medio</span></div>
        </div>
      </div>
      ${renderExtrasBlock('weekly', wState, 'w-')}
    `;
  }

  function renderWeeklyCondiz() {
    const core = getCoreVisibility();
    const cells = [
      core.flessioni  !== false ? `<div class="rev-vol"><span class="rev-vol-icon">💪</span><input class="rev-vol-input" type="number" id="w-fless" value="${wState.flessTot || ''}" placeholder="0"><span class="rev-vol-lbl">flessioni</span></div>` : '',
      core.squat      !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🦵</span><input class="rev-vol-input" type="number" id="w-squat" value="${wState.squatTot || ''}" placeholder="0"><span class="rev-vol-lbl">squat</span></div>` : '',
      core.addominali !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🔥</span><input class="rev-vol-input" type="number" id="w-addo" value="${wState.addoTot || ''}" placeholder="0"><span class="rev-vol-lbl">addominali</span></div>` : '',
      `<div class="rev-vol"><span class="rev-vol-icon">⚖</span><input class="rev-vol-input" type="number" step="0.1" id="w-peso" value="${wState.pesoFine || ''}" placeholder="kg"><span class="rev-vol-lbl">peso fine sett.</span></div>`,
    ].filter(Boolean).join('');
    return `
      <div class="rev-step-block">
        <div class="rev-autofill-row">
          <span class="rev-autofill-lbl">Riempi automaticamente dalle daily della settimana</span>
          <button class="btn-sm rev-autofill-btn" type="button" data-autofill="weekly-condiz">↻ AUTOCOMPILA</button>
        </div>
        <div class="rev-vol-row">${cells}</div>
      </div>
    `;
  }

  function renderWeeklyNote() {
    return `
      <div class="rev-step-block">
        <div class="rev-grid-2">
          <div class="field"><label class="field-label">✓ COSA È ANDATO BENE (settimana)</label><textarea class="textarea" id="w-bene" rows="3" placeholder="1-2 punti chiave...">${wState.bene || ''}</textarea></div>
          <div class="field"><label class="field-label">↑ COSA MIGLIORARE</label><textarea class="textarea" id="w-migl" rows="3">${wState.migliora || ''}</textarea></div>
        </div>
        <div class="field" style="margin-top:var(--sp-3)"><label class="field-label">🎯 FOCUS PROSSIMA SETTIMANA</label><input class="input" type="text" id="w-focus" value="${wState.focusProssima || ''}" placeholder="una sola cosa concreta"></div>
      </div>
    `;
  }

  function attachWeeklyStep(i, startISO, endISO) {
    // Autocompila handler (sovrascrive sempre i campi visibili)
    const btn = document.querySelector('[data-autofill]');
    if (btn) {
      btn.addEventListener('click', () => {
        const { agg, count } = aggregateDailyRange(startISO, endISO);
        if (!agg || !count) {
          UI.toast('Nessuna revisione giornaliera nel periodo', 'warn');
          return;
        }
        const core = getCoreVisibility();
        if (btn.dataset.autofill === 'weekly-volumi') {
          document.getElementById('w-ore').value   = (agg.ore || 0).toFixed(1);
          document.getElementById('w-sess').value  = agg.sessioni || 0;
          document.getElementById('w-km').value    = (agg.kmCorsa || 0).toFixed(1);
          document.getElementById('w-sonno').value = (agg.sonnoMedio || 0).toFixed(1);
          // Settings v4: anche le metriche extra (somma daily → field weekly)
          getExtras('weekly').forEach(f => {
            const el = document.getElementById('w-' + f.key);
            if (el) el.value = (Number(agg[f.key]) || 0).toFixed(1).replace(/\.0$/, '');
          });
        } else if (btn.dataset.autofill === 'weekly-condiz') {
          if (core.flessioni  !== false) document.getElementById('w-fless').value = agg.flessioni || 0;
          if (core.squat      !== false) document.getElementById('w-squat').value = agg.squat || 0;
          if (core.addominali !== false) document.getElementById('w-addo').value  = agg.addominali || 0;
          // peso fine NON viene auto-calcolato (è manuale)
        }
        if (typeof FX !== 'undefined') FX.glowBurst(btn);
        UI.toast(`Compilato da ${count} daily`, 'ok');
      });
    }
  }

  function collectWeekly(i) {
    const core = getCoreVisibility();
    if (i === 0) {
      wState.oreTot     = parseFloat(document.getElementById('w-ore')?.value)   || 0;
      wState.sessTot    = parseInt(document.getElementById('w-sess')?.value)    || 0;
      wState.kmTot      = parseFloat(document.getElementById('w-km')?.value)    || 0;
      wState.sonnoMedio = parseFloat(document.getElementById('w-sonno')?.value) || 0;
      // Settings v4: extras nello step 1 (volumi)
      collectExtras('weekly', wState, 'w-');
    } else if (i === 1) {
      if (core.flessioni  !== false) wState.flessTot = parseInt(document.getElementById('w-fless')?.value) || 0;
      if (core.squat      !== false) wState.squatTot = parseInt(document.getElementById('w-squat')?.value) || 0;
      if (core.addominali !== false) wState.addoTot  = parseInt(document.getElementById('w-addo')?.value)  || 0;
      wState.pesoFine = parseFloat(document.getElementById('w-peso')?.value) || 0;
    } else {
      wState.bene          = (document.getElementById('w-bene')?.value  || '').trim();
      wState.migliora      = (document.getElementById('w-migl')?.value  || '').trim();
      wState.focusProssima = (document.getElementById('w-focus')?.value || '').trim();
    }
  }

  function saveWeekly(modal, btn, existing) {
    const rev = Object.assign({ id: existing?.id }, wState);
    CS.addRevSettimanale(rev);
    if (typeof FX !== 'undefined') FX.glowBurst(btn);
    UI.toast('Revisione settimanale salvata', 'ok');
    modal.close();
    if (typeof ROUTER !== 'undefined') {
      const cur = ROUTER.current();
      if (cur.section) ROUTER.go(cur.section, cur.sub);
    }
  }

  // ═════════════════════════════════════════════════════
  // MONTHLY — STEPPER 3 step
  //   Step 1 · VOLUMI MESE     (ore, sessioni, km, sonno medio)
  //   Step 2 · CONDIZ. & ORO   (flessioni, squat, addominali, sett. d'oro, peso fine)
  //   Step 3 · NOTE            (highlight, aree, focus prossimo)
  // ═════════════════════════════════════════════════════
  let mState = null;

  function openMonthly(monthKey) {
    const today = new Date();
    const key = monthKey || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const [yr, mo] = key.split('-').map(Number);

    // Range del mese: 1 → ultimo giorno
    const firstDay = new Date(yr, mo - 1, 1);
    const lastDay  = new Date(yr, mo, 0); // giorno 0 del mese successivo = ultimo del mese
    const startISO = CS.isoDateOnly(firstDay);
    const endISO   = CS.isoDateOnly(lastDay);
    const totalDays = lastDay.getDate();

    const { agg, count: dailyCount } = aggregateDailyRange(startISO, endISO);

    // Settimane d'oro del mese (se CALC li espone)
    let settOro = 0;
    try {
      const mr = CALC.meseTopCheck ? CALC.meseTopCheck(firstDay) : null;
      if (mr) settOro = mr.settTop || 0;
    } catch (e) {}

    const existing = CS.getRevMensByKey(key);
    const mInit = {
      monthKey: key,
      oreTot: 0, sessTot: 0, flessTot: 0, squatTot: 0, addoTot: 0,
      kmTot: 0, sonnoMedio: 0, settOro, pesoFine: 0,
      bene: '', migliora: '', focusProssimo: '',
    };
    getExtras('monthly').forEach(f => { mInit[f.key] = 0; });
    mState = Object.assign(mInit, existing || {});

    if (!existing && agg) {
      fillMonthlyFromAgg(mState, agg);
      getExtras('monthly').forEach(f => {
        mState[f.key] = Number(agg[f.key]) || 0;
      });
    }

    let step = 0;
    const STEPS = ['VOLUMI MESE', 'CONDIZ. & ORO', 'NOTE'];
    const monthNames = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

    const m = UI.modal(`
      <div class="fx-stepper rev-step-wrap">
        <div class="rev-step-head">
          <div>
            <div class="rev-step-eyebrow">REVISIONE MENSILE</div>
            <h2 class="fx-display rev-step-title">${monthNames[mo - 1].toUpperCase()} ${yr}</h2>
            <div class="rev-period-nav">
              <button class="btn-sm rev-period-prev" type="button" title="mese precedente">←</button>
              <span class="rev-period-count">${dailyCount}/${totalDays} giorni con daily</span>
              <button class="btn-sm rev-period-next" type="button" title="mese successivo" ${isMonthInFuture(shiftMonthKey(key, 1)) ? 'disabled' : ''}>→</button>
            </div>
          </div>
          <button class="action-btn" data-close aria-label="chiudi">✕</button>
        </div>
        ${modeSwitchHtml('monthly')}
        <div class="fx-stepper-track" id="rev-track">
          <div class="fx-stepper-pill now"   data-step="0"></div>
          <div class="fx-stepper-pill"       data-step="1"></div>
          <div class="fx-stepper-pill"       data-step="2"></div>
        </div>
        <div class="fx-stepper-body" id="rev-body"></div>
        <div class="fx-stepper-nav">
          <button class="btn ghost"  id="rev-prev" disabled>← INDIETRO</button>
          <div class="rev-step-labels">
            <span class="rev-step-num">STEP <span id="rev-num">1</span>/3</span>
            <span class="rev-step-name" id="rev-name">${STEPS[0]}</span>
          </div>
          <button class="btn primary" id="rev-next">AVANTI →</button>
        </div>
      </div>
    `, { anchorTop: true, exclusive: true });
    m.el.classList.add('lg', 'rev-modal');
    bindModeSwitch(m, 'monthly');

    const body    = m.el.querySelector('#rev-body');
    const track   = m.el.querySelector('#rev-track');
    const btnPrev = m.el.querySelector('#rev-prev');
    const btnNext = m.el.querySelector('#rev-next');
    const stepNum = m.el.querySelector('#rev-num');
    const stepName = m.el.querySelector('#rev-name');

    // Nav periodo
    m.el.querySelector('.rev-period-prev')?.addEventListener('click', () => {
      m.close();
      openMonthly(shiftMonthKey(key, -1));
    });
    const nextBtn = m.el.querySelector('.rev-period-next');
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.addEventListener('click', () => {
        m.close();
        openMonthly(shiftMonthKey(key, 1));
      });
    }

    function renderStep(i) {
      if (i === 0)      body.innerHTML = renderMonthlyVolumi();
      else if (i === 1) body.innerHTML = renderMonthlyCondiz();
      else              body.innerHTML = renderMonthlyNote();
      attachMonthlyStep(i, startISO, endISO);
      track.querySelectorAll('.fx-stepper-pill').forEach((p, idx) => {
        p.classList.toggle('now',  idx === i);
        p.classList.toggle('done', idx < i);
      });
      stepNum.textContent = i + 1;
      stepName.textContent = STEPS[i];
      btnPrev.disabled = i === 0;
      btnNext.textContent = i === 2 ? '✓ SALVA' : 'AVANTI →';
      btnNext.classList.toggle('btn-cta', i === 2);
      btnNext.classList.toggle('primary', i !== 2);
    }

    btnPrev.addEventListener('click', () => {
      if (step > 0) { collectMonthly(step); step--; renderStep(step); }
    });
    btnNext.addEventListener('click', (e) => {
      collectMonthly(step);
      if (step < 2) { step++; renderStep(step); }
      else { saveMonthly(m, btnNext, existing); }
    });

    renderStep(0);
  }

  function renderMonthlyVolumi() {
    return `
      <div class="rev-step-block">
        <div class="rev-autofill-row">
          <span class="rev-autofill-lbl">Riempi automaticamente dalle daily del mese</span>
          <button class="btn-sm rev-autofill-btn" type="button" data-autofill="monthly-volumi">↻ AUTOCOMPILA</button>
        </div>
        <div class="rev-vol-row">
          <div class="rev-vol"><span class="rev-vol-icon">⏱</span><input class="rev-vol-input" type="number" step="0.5" id="mn-ore" value="${mState.oreTot || ''}" placeholder="0"><span class="rev-vol-lbl">ore tot</span></div>
          <div class="rev-vol"><span class="rev-vol-icon">🥊</span><input class="rev-vol-input" type="number" id="mn-sess" value="${mState.sessTot || ''}" placeholder="0"><span class="rev-vol-lbl">sessioni</span></div>
          <div class="rev-vol"><span class="rev-vol-icon">🏃</span><input class="rev-vol-input" type="number" step="0.1" id="mn-km" value="${mState.kmTot || ''}" placeholder="0"><span class="rev-vol-lbl">km tot</span></div>
          <div class="rev-vol"><span class="rev-vol-icon">🌙</span><input class="rev-vol-input" type="number" step="0.1" id="mn-sonno" value="${mState.sonnoMedio || ''}" placeholder="0"><span class="rev-vol-lbl">sonno medio</span></div>
        </div>
      </div>
      ${renderExtrasBlock('monthly', mState, 'mn-')}
    `;
  }

  function renderMonthlyCondiz() {
    const core = getCoreVisibility();
    const cells = [
      core.flessioni  !== false ? `<div class="rev-vol"><span class="rev-vol-icon">💪</span><input class="rev-vol-input" type="number" id="mn-fless" value="${mState.flessTot || ''}" placeholder="0"><span class="rev-vol-lbl">flessioni</span></div>` : '',
      core.squat      !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🦵</span><input class="rev-vol-input" type="number" id="mn-squat" value="${mState.squatTot || ''}" placeholder="0"><span class="rev-vol-lbl">squat</span></div>` : '',
      core.addominali !== false ? `<div class="rev-vol"><span class="rev-vol-icon">🔥</span><input class="rev-vol-input" type="number" id="mn-addo" value="${mState.addoTot || ''}" placeholder="0"><span class="rev-vol-lbl">addominali</span></div>` : '',
      `<div class="rev-vol"><span class="rev-vol-icon">◆</span><input class="rev-vol-input" type="number" id="mn-oro" value="${mState.settOro || ''}" placeholder="0"><span class="rev-vol-lbl">sett. d'oro</span></div>`,
    ].filter(Boolean).join('');
    return `
      <div class="rev-step-block">
        <div class="rev-autofill-row">
          <span class="rev-autofill-lbl">Riempi automaticamente dalle daily del mese</span>
          <button class="btn-sm rev-autofill-btn" type="button" data-autofill="monthly-condiz">↻ AUTOCOMPILA</button>
        </div>
        <div class="rev-vol-row">${cells}</div>
        <div class="rev-vol-row" style="margin-top:var(--sp-3)">
          <div class="rev-vol"><span class="rev-vol-icon">⚖</span><input class="rev-vol-input" type="number" step="0.1" id="mn-peso" value="${mState.pesoFine || ''}" placeholder="kg"><span class="rev-vol-lbl">peso fine mese</span></div>
        </div>
      </div>
    `;
  }

  function renderMonthlyNote() {
    return `
      <div class="rev-step-block">
        <div class="rev-grid-2">
          <div class="field"><label class="field-label">✓ HIGHLIGHT DEL MESE</label><textarea class="textarea" id="mn-bene" rows="3">${mState.bene || ''}</textarea></div>
          <div class="field"><label class="field-label">↑ AREE DI LAVORO</label><textarea class="textarea" id="mn-migl" rows="3">${mState.migliora || ''}</textarea></div>
        </div>
        <div class="field" style="margin-top:var(--sp-3)"><label class="field-label">🎯 FOCUS DEL PROSSIMO MESE</label><input class="input" type="text" id="mn-focus" value="${mState.focusProssimo || ''}" placeholder="una direzione principale"></div>
      </div>
    `;
  }

  function attachMonthlyStep(i, startISO, endISO) {
    const btn = document.querySelector('[data-autofill]');
    if (btn) {
      btn.addEventListener('click', () => {
        const { agg, count } = aggregateDailyRange(startISO, endISO);
        if (!agg || !count) {
          UI.toast('Nessuna revisione giornaliera nel periodo', 'warn');
          return;
        }
        const core = getCoreVisibility();
        if (btn.dataset.autofill === 'monthly-volumi') {
          document.getElementById('mn-ore').value   = (agg.ore || 0).toFixed(1);
          document.getElementById('mn-sess').value  = agg.sessioni || 0;
          document.getElementById('mn-km').value    = (agg.kmCorsa || 0).toFixed(1);
          document.getElementById('mn-sonno').value = (agg.sonnoMedio || 0).toFixed(1);
          // Settings v4: anche le metriche extra
          getExtras('monthly').forEach(f => {
            const el = document.getElementById('mn-' + f.key);
            if (el) el.value = (Number(agg[f.key]) || 0).toFixed(1).replace(/\.0$/, '');
          });
        } else if (btn.dataset.autofill === 'monthly-condiz') {
          if (core.flessioni  !== false) document.getElementById('mn-fless').value = agg.flessioni || 0;
          if (core.squat      !== false) document.getElementById('mn-squat').value = agg.squat || 0;
          if (core.addominali !== false) document.getElementById('mn-addo').value  = agg.addominali || 0;
          // sett. d'oro è auto-calcolato (resta com'è), peso fine resta manuale
        }
        if (typeof FX !== 'undefined') FX.glowBurst(btn);
        UI.toast(`Compilato da ${count} daily`, 'ok');
      });
    }
  }

  function collectMonthly(i) {
    const core = getCoreVisibility();
    if (i === 0) {
      mState.oreTot     = parseFloat(document.getElementById('mn-ore')?.value)   || 0;
      mState.sessTot    = parseInt(document.getElementById('mn-sess')?.value)    || 0;
      mState.kmTot      = parseFloat(document.getElementById('mn-km')?.value)    || 0;
      mState.sonnoMedio = parseFloat(document.getElementById('mn-sonno')?.value) || 0;
      // Settings v4: extras nello step 1
      collectExtras('monthly', mState, 'mn-');
    } else if (i === 1) {
      if (core.flessioni  !== false) mState.flessTot = parseInt(document.getElementById('mn-fless')?.value) || 0;
      if (core.squat      !== false) mState.squatTot = parseInt(document.getElementById('mn-squat')?.value) || 0;
      if (core.addominali !== false) mState.addoTot  = parseInt(document.getElementById('mn-addo')?.value)  || 0;
      mState.settOro  = parseInt(document.getElementById('mn-oro')?.value)   || 0;
      mState.pesoFine = parseFloat(document.getElementById('mn-peso')?.value) || 0;
    } else {
      mState.bene          = (document.getElementById('mn-bene')?.value  || '').trim();
      mState.migliora      = (document.getElementById('mn-migl')?.value  || '').trim();
      mState.focusProssimo = (document.getElementById('mn-focus')?.value || '').trim();
    }
  }

  function saveMonthly(modal, btn, existing) {
    const rev = Object.assign({ id: existing?.id }, mState);
    CS.addRevMensile(rev);
    if (typeof FX !== 'undefined') FX.glowBurst(btn);
    UI.toast('Revisione mensile salvata', 'ok');
    modal.close();
    if (typeof ROUTER !== 'undefined') {
      const cur = ROUTER.current();
      if (cur.section) ROUTER.go(cur.section, cur.sub);
    }
  }

  return { openDaily, openWeekly, openMonthly };

})();
