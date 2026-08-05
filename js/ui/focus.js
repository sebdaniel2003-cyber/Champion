/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — FOCUS
   Riscritta 2026-06-22 (rivoluzione)
   Sub-routes: obiettivi · calendario · visione
   ═══════════════════════════════════════════════════════ */

(function () {

  // ════════════════════════════════════════════════════
  // SUB-TAB 1 — OBIETTIVI (4 colonne)
  // ════════════════════════════════════════════════════

  const SCADENZE = [
    { id: 'giornaliero',  label: 'GIORNALIERI',  short: 'oggi' },
    { id: 'settimanale',  label: 'SETTIMANALI',  short: 'sett' },
    { id: 'mensile',      label: 'MENSILI',      short: 'mese' },
    { id: 'annuale',      label: 'ANNUALI',      short: 'anno' },
  ];

  function renderObiettivi() {
    const colsHtml = SCADENZE.map(s => renderColonnaObiettivi(s)).join('');
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">OBIET<span class="accent">TIVI</span></h1>
          <div class="page-sub">Per scadenza · giornalieri · settimanali · mensili · annuali</div>
        </div>
      </div>
      <div class="goal-board">${colsHtml}</div>
    `;
  }

  function renderColonnaObiettivi(scadenza) {
    const periodo = currentPeriodo(scadenza.id);
    const tutti = CS.state.obiettivi.filter(o => o.scadenza === scadenza.id);
    // Per giornaliero/settimanale/mensile/annuale, filtra solo per periodo corrente
    const items = tutti.filter(o => !o.periodo || o.periodo === periodo);

    const cards = items.length
      ? items.map(o => renderCardObiettivo(o)).join('')
      : `<div class="goal-col-empty">Nessun obiettivo</div>`;

    return `
      <div class="goal-col">
        <div class="goal-col-head">
          <div class="goal-col-title">${scadenza.label}</div>
          <div class="goal-col-meta">${formatPeriodoLabel(scadenza.id, periodo)}</div>
        </div>
        <div class="goal-col-list">${cards}</div>
        <button class="goal-col-add" data-add="${scadenza.id}">+ aggiungi</button>
      </div>
    `;
  }

  function renderCardObiettivo(o) {
    const p = CALC.progressObiettivo(o);
    const done = p.pct >= 100;
    const autoBadge = o.auto ? '<span class="goal-badge-auto" title="auto-calcolato">⚡</span>' : '';
    return `
      <div class="goal-card-compact ${done ? 'done' : ''}" data-id="${o.id}">
        <div class="goal-card-title">
          <span class="goal-bullet">•</span>
          <span class="goal-card-desc">${escapeHtml(o.descrizione || 'Senza titolo')}</span>
          ${autoBadge}
        </div>
        <div class="goal-card-bar">
          <span class="goal-bar-track"><span class="goal-bar-fill" style="width:${Math.min(100, p.pct)}%"></span></span>
          <span class="goal-card-pct">${Math.round(p.pct)}%${done ? ' ◆' : ''}</span>
        </div>
        <div class="goal-card-detail" hidden>
          <div class="goal-card-row">
            <span>Progresso</span><span>${formatGoalNum(p.current)} / ${formatGoalNum(o.target)} ${o.unita || ''}</span>
          </div>
          <div class="goal-card-row">
            <span>Tipo</span><span>${o.auto ? 'AUTO · ' + (CS.CATEGORIE_OBIETTIVO.find(c => c.id === o.categoria)?.label || o.categoria) : 'MANUALE'}</span>
          </div>
          ${!o.auto ? `
            <div class="goal-card-actions">
              <button class="btn-sm" data-toggle="${o.id}">${o.completed ? 'segna non fatto' : 'segna completato'}</button>
              <button class="btn-sm" data-inc="${o.id}">+1</button>
            </div>` : ''}
          <button class="goal-card-del" data-del="${o.id}">elimina</button>
        </div>
      </div>
    `;
  }

  function formatGoalNum(n) {
    if (n === null || n === undefined) return '—';
    return Number.isInteger(Number(n)) ? n : Number(n).toFixed(1);
  }

  function currentPeriodo(scadenza) {
    const d = new Date();
    if (scadenza === 'giornaliero') return CS.todayISO();
    if (scadenza === 'settimanale') return CS.weekKey(d);
    if (scadenza === 'mensile') return CS.monthKey(d);
    if (scadenza === 'annuale') return String(d.getFullYear());
    return '';
  }

  function formatPeriodoLabel(scadenza, periodo) {
    if (scadenza === 'giornaliero') return CS.fmtDate(periodo, { short: true });
    if (scadenza === 'settimanale') return `W${periodo.split('-W')[1] || '—'}`;
    if (scadenza === 'mensile') {
      const m = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
      const [, mm] = periodo.split('-');
      return `${m[Number(mm) - 1] || ''} ${periodo.split('-')[0]}`;
    }
    if (scadenza === 'annuale') return periodo;
    return '';
  }

  function afterObiettivi() {
    // Toggle dettaglio al click sulla card (escluso bottoni interni)
    document.querySelectorAll('.goal-card-compact').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const detail = card.querySelector('.goal-card-detail');
        if (detail) detail.hidden = !detail.hidden;
      });
    });

    // Bottone aggiungi
    document.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => openObiettivoForm(btn.dataset.add));
    });

    // Toggle manual completion
    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggle;
        const obj = CS.state.obiettivi.find(o => o.id === id);
        if (!obj) return;
        CS.updateObiettivo(id, { completed: !obj.completed });
        ROUTER.go('focus', 'obiettivi');
      });
    });

    // Incrementa current manual
    document.querySelectorAll('[data-inc]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.inc;
        const obj = CS.state.obiettivi.find(o => o.id === id);
        if (!obj) return;
        CS.updateObiettivo(id, { currentManual: (obj.currentManual || 0) + 1 });
        ROUTER.go('focus', 'obiettivi');
      });
    });

    // Delete
    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Eliminare questo obiettivo?')) return;
        CS.deleteObiettivo(btn.dataset.del);
        ROUTER.go('focus', 'obiettivi');
      });
    });
  }

  function openObiettivoForm(scadenza) {
    const categorie = CS.CATEGORIE_OBIETTIVO.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

    // Settings v4: lista metriche disponibili per categoria='custom'
    // Include sia predefinite abilitate sia custom user-defined (per scope='daily' come riferimento — sono auto-aggregate)
    const cfg = CS.state.revFieldsConfig || {};
    const customMetrics = [];
    Object.entries(cfg.predefinedExtras || {}).forEach(([k, m]) => {
      if (m.enabled) customMetrics.push({ key: k, label: m.label, icon: m.icon, unit: m.unit });
    });
    (cfg.customMetrics || []).forEach(m => {
      customMetrics.push({ key: `x_${m.key}`, label: m.label, icon: m.icon, unit: m.unit });
    });
    const customOpts = customMetrics.length
      ? customMetrics.map(m => `<option value="${m.key}" data-unit="${m.unit || ''}">${m.icon || '📌'} ${m.label}${m.unit ? ' (' + m.unit + ')' : ''}</option>`).join('')
      : '<option value="">Nessuna metrica disponibile — abilitane una in Impostazioni</option>';

    const html = `
      <h2 class="modal-title">NUOVO OBIETTIVO · ${scadenza.toUpperCase()}</h2>
      <form id="goal-form">
        <div class="field"><label class="field-label">Descrizione</label>
          <input class="input" type="text" name="descrizione" placeholder="Es. 100 flessioni" required></div>
        <div class="field"><label class="field-label">Tipo</label>
          <div class="row" style="gap:var(--sp-3)">
            <label><input type="radio" name="auto" value="true" checked> AUTO (dai dati)</label>
            <label><input type="radio" name="auto" value="false"> MANUALE</label>
          </div></div>
        <div class="field"><label class="field-label">Categoria (per AUTO)</label>
          <select class="input" name="categoria" id="goal-cat">${categorie}</select></div>
        <div class="field" id="goal-custom-wrap" style="display:none"><label class="field-label">Metrica personalizzata</label>
          <select class="input" name="customKey" id="goal-custom-key">${customOpts}</select></div>
        <div class="field"><label class="field-label">Target (numero)</label>
          <input class="input" type="number" name="target" step="0.1" value="1" required></div>
        <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
          <button type="button" class="btn ghost" data-close>ANNULLA</button>
          <button type="submit" class="btn primary">SALVA</button>
        </div>
      </form>
    `;
    const m = UI.modal(html);
    const form = m.el.querySelector('#goal-form');
    const catSel = form.querySelector('#goal-cat');
    const customWrap = form.querySelector('#goal-custom-wrap');
    const syncCustom = () => {
      customWrap.style.display = catSel.value === 'custom' ? '' : 'none';
    };
    catSel.addEventListener('change', syncCustom);
    syncCustom();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const auto = fd.get('auto') === 'true';
      const categoria = auto ? fd.get('categoria') : 'libero';
      const cat = CS.CATEGORIE_OBIETTIVO.find(c => c.id === categoria);
      const out = {
        descrizione: fd.get('descrizione'),
        auto,
        categoria,
        unita: cat ? cat.unita : '',
        target: Number(fd.get('target')) || 1,
        scadenza,
        periodo: currentPeriodo(scadenza),
        completed: false,
        currentManual: 0,
      };
      if (auto && categoria === 'custom') {
        const customKey = fd.get('customKey');
        if (!customKey) {
          UI.toast('Seleziona una metrica personalizzata', 'warn');
          return;
        }
        out.customKey = customKey;
        // Eredita l'unità dalla metrica scelta
        const opt = form.querySelector(`#goal-custom-key option[value="${customKey}"]`);
        const unit = opt?.dataset?.unit || '';
        if (unit) out.unita = unit;
      }
      CS.addObiettivo(out);
      m.close();
      UI.toast('Obiettivo aggiunto', 'ok');
      ROUTER.go('focus', 'obiettivi');
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 2 — CALENDARIO EVENTI (timeline 12 mesi)
  // ════════════════════════════════════════════════════

  const TIPI_EVENTO = [
    { id: 'match',      label: 'Match',      icon: '🏆', color: '#B45CFF' },
    { id: 'medico',     label: 'Medico',     icon: '🩺', color: '#4ADE80' },
    { id: 'seminario',  label: 'Seminario',  icon: '📚', color: '#A78BFA' },
    { id: 'altro',      label: 'Altro',      icon: '◆', color: '#FBBF24' },
  ];

  function renderCalendario() {
    const eventi = (CS.state.eventi || []).slice().sort((a, b) => a.data.localeCompare(b.data));
    const futuri = eventi.filter(e => e.data >= CS.todayISO());

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">CALEN<span class="accent">DARIO</span></h1>
          <div class="page-sub">Eventi · prossimi 12 mesi · match · medico · seminari</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="btn-add-evento">+ EVENTO</button>
      </div>

      <div class="panel timeline-panel">
        <div class="panel-title">TIMELINE · prossimi 12 mesi</div>
        ${renderTimeline12Mesi(eventi)}
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">PROSSIMI EVENTI (${futuri.length})</div>
        ${futuri.length ? renderListaEventi(futuri) : '<div class="empty-state"><div class="empty-ico">📅</div><div class="empty-text">Nessun evento futuro</div></div>'}
      </div>
    `;
  }

  function renderTimeline12Mesi(eventi) {
    const oggi = new Date();
    const startMonth = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    const endMonth = new Date(oggi.getFullYear(), oggi.getMonth() + 12, 0);
    const totalDays = Math.round((endMonth - startMonth) / 86400000);
    const monthLabels = [];
    const monthNames = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
    for (let i = 0; i < 12; i++) {
      const d = new Date(startMonth); d.setMonth(startMonth.getMonth() + i);
      const offset = Math.round((d - startMonth) / 86400000);
      const pct = (offset / totalDays) * 100;
      monthLabels.push(`<div class="tl-month-lbl" style="left:${pct}%">${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(2)}</div>`);
    }
    // Marker oggi
    const todayPct = 0; // oggi è all'inizio
    // Eventi nei prossimi 12 mesi
    const visibili = eventi.filter(e => {
      const d = new Date(e.data);
      return d >= oggi && d <= endMonth;
    });
    const markers = visibili.map(e => {
      const d = new Date(e.data);
      const offset = Math.round((d - startMonth) / 86400000);
      const pct = Math.max(0, Math.min(100, (offset / totalDays) * 100));
      const tipo = TIPI_EVENTO.find(t => t.id === e.tipo) || TIPI_EVENTO[3];
      return `
        <button class="tl-marker" style="left:${pct}%; color:${tipo.color}" title="${tipo.label}: ${escapeHtml(e.titolo)} · ${CS.fmtDate(e.data, { long: true })}" data-evt="${e.id}">
          <span class="tl-marker-dot">${tipo.icon}</span>
          <span class="tl-marker-label">${escapeHtml((e.titolo || '').slice(0, 16))}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="timeline-12m">
        <div class="tl-axis">
          ${monthLabels.join('')}
          <div class="tl-today" style="left:${todayPct}%" title="oggi">OGGI</div>
        </div>
        <div class="tl-track"></div>
        <div class="tl-markers">${markers}</div>
      </div>
    `;
  }

  function renderListaEventi(eventi) {
    const items = eventi.map(e => {
      const tipo = TIPI_EVENTO.find(t => t.id === e.tipo) || TIPI_EVENTO[3];
      const daysLeft = Math.ceil((new Date(e.data) - new Date()) / 86400000);
      const daysText = daysLeft <= 0 ? 'OGGI' : daysLeft === 1 ? 'domani' : `tra ${daysLeft}gg`;
      return `
        <div class="event-row" data-evt="${e.id}">
          <span class="event-ico" style="color:${tipo.color}">${tipo.icon}</span>
          <div class="event-body">
            <div class="event-title">${escapeHtml(e.titolo || 'Senza titolo')}</div>
            <div class="event-meta">${tipo.label.toUpperCase()} · ${CS.fmtDate(e.data, { long: true })} · ${daysText}</div>
            ${e.note ? `<div class="event-note">${escapeHtml(e.note)}</div>` : ''}
          </div>
          <div class="event-actions">
            <button class="btn-sm" data-edit-evt="${e.id}">edit</button>
            <button class="btn-sm danger" data-del-evt="${e.id}">×</button>
          </div>
        </div>
      `;
    }).join('');
    return `<div class="event-list">${items}</div>`;
  }

  function afterCalendario() {
    document.getElementById('btn-add-evento')?.addEventListener('click', () => openEventoForm(null));

    document.querySelectorAll('[data-evt]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openEventoForm(el.dataset.evt);
      });
    });
    document.querySelectorAll('[data-edit-evt]').forEach(b => {
      b.addEventListener('click', () => openEventoForm(b.dataset.editEvt));
    });
    document.querySelectorAll('[data-del-evt]').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Eliminare questo evento?')) return;
        CS.deleteEvento(b.dataset.delEvt);
        ROUTER.go('focus', 'calendario');
      });
    });
  }

  function openEventoForm(id) {
    const existing = id ? (CS.state.eventi || []).find(e => e.id === id) : null;
    const tipiOpts = TIPI_EVENTO.map(t =>
      `<option value="${t.id}" ${existing && existing.tipo === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`
    ).join('');
    const html = `
      <h2 class="modal-title">${existing ? 'MODIFICA EVENTO' : 'NUOVO EVENTO'}</h2>
      <form id="evt-form">
        <div class="field"><label class="field-label">Titolo</label>
          <input class="input" type="text" name="titolo" required value="${escapeHtml(existing?.titolo || '')}"></div>
        <div class="field"><label class="field-label">Tipo</label>
          <select class="input" name="tipo">${tipiOpts}</select></div>
        <div class="field"><label class="field-label">Data</label>
          <input class="input" type="date" name="data" required value="${existing?.data || CS.todayISO()}"></div>
        <div class="field"><label class="field-label">Note</label>
          <textarea class="input" name="note" rows="3">${escapeHtml(existing?.note || '')}</textarea></div>
        <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
          <button type="button" class="btn ghost" data-close>ANNULLA</button>
          <button type="submit" class="btn primary">SALVA</button>
        </div>
      </form>
    `;
    const m = UI.modal(html);
    m.el.querySelector('#evt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        titolo: fd.get('titolo'),
        tipo: fd.get('tipo'),
        data: fd.get('data'),
        note: fd.get('note'),
      };
      if (existing) CS.updateEvento(existing.id, payload);
      else CS.addEvento(payload);
      m.close();
      UI.toast('Evento salvato', 'ok');
      ROUTER.go('focus', 'calendario');
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 3 — VISIONE (3 box 1y / 3y / 5y)
  // ════════════════════════════════════════════════════

  function renderVisione() {
    const v = CS.state.visione || { y1: '', y3: '', y5: '' };
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">VISI<span class="accent">ONE</span></h1>
          <div class="page-sub">Dove vuoi essere · 1 anno · 3 anni · 5 anni</div>
        </div>
      </div>
      <div class="vision-grid">
        ${visionCard('y1', 'FRA 1 ANNO', v.y1)}
        ${visionCard('y3', 'FRA 3 ANNI', v.y3)}
        ${visionCard('y5', 'FRA 5 ANNI', v.y5)}
      </div>
    `;
  }

  function visionCard(key, title, content) {
    return `
      <div class="vision-card">
        <div class="vision-card-title">${title}</div>
        <div class="vision-card-body" data-vision-key="${key}">${content ? escapeHtml(content).replace(/\n/g, '<br>') : '<span class="vision-placeholder">Clicca per scrivere la tua visione...</span>'}</div>
        <button class="btn-sm vision-edit" data-vision-edit="${key}">${content ? 'modifica' : '+ scrivi'}</button>
      </div>
    `;
  }

  function afterVisione() {
    document.querySelectorAll('[data-vision-edit]').forEach(btn => {
      btn.addEventListener('click', () => openVisionForm(btn.dataset.visionEdit));
    });
  }

  function openVisionForm(key) {
    const v = CS.state.visione || {};
    const titles = { y1: 'FRA 1 ANNO', y3: 'FRA 3 ANNI', y5: 'FRA 5 ANNI' };
    const html = `
      <h2 class="modal-title">VISIONE · ${titles[key]}</h2>
      <form id="vis-form">
        <div class="field"><label class="field-label">${titles[key]} — io sono...</label>
          <textarea class="input" name="content" rows="8" placeholder="Scrivi la tua visione in modo concreto e potente...">${escapeHtml(v[key] || '')}</textarea></div>
        <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
          <button type="button" class="btn ghost" data-close>ANNULLA</button>
          <button type="submit" class="btn primary">SALVA</button>
        </div>
      </form>
    `;
    const m = UI.modal(html);
    m.el.querySelector('#vis-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      CS.setVisione({ [key]: fd.get('content') });
      m.close();
      UI.toast('Visione salvata', 'ok');
      ROUTER.go('focus', 'visione');
    });
  }

  // ─── helpers ─────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ─── REGISTER ROUTES ────────────────────────────────
  ROUTER.register('focus/obiettivi',  renderObiettivi,  afterObiettivi);
  ROUTER.register('focus/calendario', renderCalendario, afterCalendario);
  ROUTER.register('focus/visione',    renderVisione,    afterVisione);

})();
