/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — SETTINGS UI
   Modale 4 sezioni: METRICHE · CUSTOM · TIPI · MOOD
   Personalizza i campi delle revisioni e i cataloghi.
   ═══════════════════════════════════════════════════════ */

const SETTINGS_UI = (function () {

  const SECTIONS = [
    { id: 'profilo',  label: 'PROFILO',            icon: '👤' },
    { id: 'metriche', label: 'METRICHE REVISIONE', icon: '📊' },
    { id: 'custom',   label: 'METRICA CUSTOM',     icon: '➕' },
    { id: 'tipi',     label: 'TIPI ALLENAMENTO',   icon: '🥊' },
    { id: 'mood',     label: 'MOOD',               icon: '🎭' },
    { id: 'sincronia',label: 'SINCRONIA',          icon: '📱' },
  ];

  // Progetto Supabase già configurato: si precompila così non c'è nulla da
  // incollare a mano. Restano modificabili, se un giorno cambi progetto.
  const SUPABASE_DEFAULT = {
    url: 'https://ptgzoafusukmopcsbsqu.supabase.co',
    key: 'sb_publishable_iH9WcjUwp98TEUOA8D1zZw_UbSzOX7s',
  };

  // Toggle dei campi "core" — etichette user-friendly per la UI
  const CORE_FIELDS = [
    { key: 'intensita',    label: 'Intensità (slider)',    scope: 'daily' },
    { key: 'affaticamento',label: 'Affaticamento (slider)',scope: 'daily' },
    { key: 'sonnoQualita', label: 'Qualità sonno',          scope: 'daily' },
    { key: 'moodChips',    label: 'Mood (chip)',            scope: 'daily' },
    { key: 'flessioni',    label: 'Flessioni',              scope: 'daily/weekly/monthly' },
    { key: 'squat',        label: 'Squat',                  scope: 'daily/weekly/monthly' },
    { key: 'addominali',   label: 'Addominali',             scope: 'daily/weekly/monthly' },
    { key: 'kmCorsa',      label: 'Km corsa',               scope: 'daily/weekly/monthly' },
  ];

  // Set fisso di emoji per il picker icona custom
  const ICON_PICKER = [
    '🏋','🥊','🤜','🏃','🚴','🏊','⛹','🤸','🧘','🧠','🌬','💪','🦵','🔥','⚡','💤',
    '🌙','⭐','🎯','📌','📊','📈','📉','✓','◆','🏆','💯','🧊','🥗','🥩','🍎','💧',
    '⏱','📅','🎵','🎮','📚','✍','🩹','🌡',
  ];

  const SCOPES_ALL = ['daily', 'weekly', 'monthly'];

  // ─── STATE locale del modale ───────────────────────
  let modal = null;
  let activeSection = 'metriche';

  // ─── OPEN ──────────────────────────────────────────
  function open(initial) {
    activeSection = initial || 'profilo';

    const sidebarHtml = SECTIONS.map(s => `
      <button class="settings-sidebar-item ${s.id === activeSection ? 'active' : ''}" data-section="${s.id}">
        <span class="settings-sidebar-ico">${s.icon}</span>
        <span class="settings-sidebar-lbl">${s.label}</span>
      </button>
    `).join('');

    modal = UI.modal(`
      <div class="settings-wrap">
        <div class="settings-head">
          <div>
            <div class="rev-step-eyebrow">IMPOSTAZIONI</div>
            <h2 class="fx-display settings-title">PERSONALIZZA</h2>
          </div>
          <button class="action-btn" data-close aria-label="chiudi">✕</button>
        </div>
        <div class="settings-body">
          <nav class="settings-sidebar">${sidebarHtml}</nav>
          <section class="settings-pane" id="settings-pane"></section>
        </div>
      </div>
    `, { exclusive: true });
    modal.el.classList.add('lg');

    modal.el.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchSection(btn.dataset.section);
      });
    });

    renderActive();
  }

  function switchSection(id) {
    if (id === activeSection) return;
    activeSection = id;
    modal.el.querySelectorAll('.settings-sidebar-item').forEach(b => {
      b.classList.toggle('active', b.dataset.section === id);
    });
    renderActive();
  }

  function renderActive() {
    const pane = modal.el.querySelector('#settings-pane');
    if (!pane) return;
    if (activeSection === 'profilo') sectionProfilo(pane);
    else if (activeSection === 'metriche') sectionMetriche(pane);
    else if (activeSection === 'custom') sectionCustom(pane);
    else if (activeSection === 'tipi')   sectionCatalogo(pane, 'tipiAllenamento', 'TIPI ALLENAMENTO');
    else if (activeSection === 'mood')   sectionCatalogo(pane, 'mood',            'MOOD');
    else if (activeSection === 'sincronia') sectionSincronia(pane);
  }

  // ═══════════════════════════════════════════════════
  // SEZIONE 0 · PROFILO
  //   Questi valori guidano i calcoli di tutto il sistema:
  //   età → FCmax (zone corsa), pesoTarget → pagina PESO + goal pace,
  //   prossimoMatch → countdown e regole taper dell'assistente.
  // ═══════════════════════════════════════════════════
  function sectionProfilo(pane) {
    const p = CS.state.profile || {};
    const fcMax = 220 - (Number(p.eta) || 26);

    pane.innerHTML = `
      <div class="settings-section-title">I TUOI DATI</div>
      <div class="settings-section-desc">Guidano i calcoli di tutto il sistema: l'età definisce le zone cardio, il peso target la pagina PESO e il goal pace.</div>
      <div class="settings-card">
        <div class="settings-form-row">
          <label class="field" style="flex:2;min-width:180px">
            <span class="field-label">Nome</span>
            <input class="input" type="text" id="pf-nome" maxlength="30" value="${escapeAttr(p.nome || '')}" placeholder="DANIEL">
          </label>
          <label class="field" style="max-width:110px">
            <span class="field-label">Età</span>
            <input class="input" type="number" id="pf-eta" min="10" max="90" step="1" value="${p.eta != null ? p.eta : ''}" placeholder="26">
          </label>
          <label class="field" style="max-width:130px">
            <span class="field-label">Altezza (cm)</span>
            <input class="input" type="number" id="pf-alt" min="120" max="230" step="1" value="${p.altezza != null ? p.altezza : ''}" placeholder="188">
          </label>
        </div>
        <div class="settings-form-row">
          <label class="field" style="max-width:150px">
            <span class="field-label">Peso target (kg)</span>
            <input class="input" type="number" id="pf-peso" min="40" max="200" step="0.1" value="${p.pesoTarget != null ? p.pesoTarget : ''}" placeholder="91">
          </label>
          <label class="field" style="flex:1;min-width:180px">
            <span class="field-label">Prossimo match</span>
            <input class="input" type="date" id="pf-match" value="${escapeAttr(p.prossimoMatch || '')}">
          </label>
        </div>
        <div class="settings-profile-hint" id="pf-hint">FCmax attuale: <b>${fcMax} bpm</b> (220 − ${Number(p.eta) || 26})</div>
        <div class="settings-form-actions">
          <button class="btn primary" id="pf-save">SALVA PROFILO</button>
        </div>
      </div>
    `;

    // Anteprima live della FCmax mentre si modifica l'età
    const etaInput = pane.querySelector('#pf-eta');
    const hint = pane.querySelector('#pf-hint');
    etaInput?.addEventListener('input', () => {
      const e = Number(etaInput.value);
      if (e >= 10 && e <= 90) hint.innerHTML = `FCmax attuale: <b>${220 - e} bpm</b> (220 − ${e})`;
    });

    pane.querySelector('#pf-save')?.addEventListener('click', () => {
      const nome  = (pane.querySelector('#pf-nome')?.value || '').trim();
      const eta   = Number(pane.querySelector('#pf-eta')?.value);
      const alt   = Number(pane.querySelector('#pf-alt')?.value);
      const peso  = Number(pane.querySelector('#pf-peso')?.value);
      const match = pane.querySelector('#pf-match')?.value || null;

      if (eta && (eta < 10 || eta > 90))     return UI.toast('Età fuori range (10-90)', 'warn');
      if (alt && (alt < 120 || alt > 230))   return UI.toast('Altezza fuori range (120-230 cm)', 'warn');
      if (peso && (peso < 40 || peso > 200)) return UI.toast('Peso target fuori range (40-200 kg)', 'warn');

      const patch = {};
      if (nome) patch.nome = nome.toUpperCase();
      if (eta)  patch.eta = eta;
      if (alt)  patch.altezza = alt;
      if (peso) patch.pesoTarget = peso;
      patch.prossimoMatch = match || null;

      CS.setProfile(patch);
      UI.toast('Profilo salvato', 'ok');
      // Le pagine mostrano i valori del profilo: forza il re-render di quella corrente
      BUS.emit('cs:profile-saved', patch);
      const cur = ROUTER.current();
      if (cur.section) ROUTER.go(cur.section, cur.sub);
    });
  }

  // ═══════════════════════════════════════════════════
  // SEZIONE 1 · METRICHE REVISIONE
  //   Gruppo A: toggle campi core (con badge "N revisioni con dati")
  //   Gruppo B: toggle metriche extra predefinite + chips scope
  // ═══════════════════════════════════════════════════
  function sectionMetriche(pane) {
    const cfg = CS.state.revFieldsConfig;
    const core = cfg.coreVisibility || {};
    const extras = cfg.predefinedExtras || {};

    const coreRows = CORE_FIELDS.map(f => {
      const enabled = core[f.key] !== false;
      const usage = CS.countRevsWithField(f.key);
      const badge = (!enabled && usage > 0)
        ? `<span class="settings-warn-badge">⚠ ${usage} rev con dati</span>`
        : '';
      return `
        <div class="settings-toggle-row">
          <div class="settings-toggle-meta">
            <div class="settings-toggle-name">${f.label}</div>
            <div class="settings-toggle-sub">${f.scope}</div>
          </div>
          ${badge}
          <label class="settings-switch">
            <input type="checkbox" data-core-toggle="${f.key}" ${enabled ? 'checked' : ''}>
            <span class="settings-switch-slider"></span>
          </label>
        </div>
      `;
    }).join('');

    const extraRows = Object.entries(extras).map(([key, m]) => {
      const chips = SCOPES_ALL.map(s => `
        <button class="settings-scope-chip ${m.scope.includes(s) ? 'on' : ''}" data-extra-scope="${key}" data-scope="${s}">${s}</button>
      `).join('');
      return `
        <div class="settings-extra-row">
          <div class="settings-extra-head">
            <div class="settings-extra-left">
              <span class="settings-extra-ico">${m.icon}</span>
              <div>
                <div class="settings-extra-name">${m.label}</div>
                <div class="settings-extra-unit">${m.unit ? 'unità: ' + m.unit : 'senza unità'}</div>
              </div>
            </div>
            <label class="settings-switch">
              <input type="checkbox" data-extra-toggle="${key}" ${m.enabled ? 'checked' : ''}>
              <span class="settings-switch-slider"></span>
            </label>
          </div>
          <div class="settings-scope-chips" data-extra-scope-row="${key}">${chips}</div>
        </div>
      `;
    }).join('');

    pane.innerHTML = `
      <div class="settings-section-title">CAMPI CORE</div>
      <div class="settings-section-desc">Disattiva i campi che non vuoi più vedere nelle revisioni. I dati storici restano salvati.</div>
      <div class="settings-card">${coreRows}</div>

      <div class="settings-section-title" style="margin-top:var(--sp-5)">METRICHE EXTRA PREDEFINITE</div>
      <div class="settings-section-desc">Attiva una metrica per farla apparire nelle revisioni (daily, weekly, monthly).</div>
      <div class="settings-card">${extraRows}</div>
    `;

    // Wire core toggles
    pane.querySelectorAll('[data-core-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        CS.toggleCoreField(cb.dataset.coreToggle, cb.checked);
        UI.toast(`Campo ${cb.checked ? 'attivato' : 'nascosto'}`, 'ok', 1500);
        // Re-render per aggiornare i badge
        sectionMetriche(pane);
      });
    });

    // Wire extra toggles
    pane.querySelectorAll('[data-extra-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        CS.togglePredefinedExtra(cb.dataset.extraToggle, cb.checked);
        UI.toast(`Metrica ${cb.checked ? 'attivata' : 'disattivata'}`, 'ok', 1500);
      });
    });

    // Wire scope chips
    pane.querySelectorAll('[data-extra-scope]').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.extraScope;
        const s = chip.dataset.scope;
        const m = CS.state.revFieldsConfig.predefinedExtras[key];
        if (!m) return;
        const cur = new Set(m.scope || []);
        if (cur.has(s)) cur.delete(s); else cur.add(s);
        if (cur.size === 0) {
          UI.toast('Almeno uno scope deve restare attivo', 'warn');
          return;
        }
        CS.updatePredefinedExtraScope(key, [...cur]);
        chip.classList.toggle('on');
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // SEZIONE 2 · METRICA CUSTOM
  //   Form aggiunta + lista esistenti con rename/delete
  // ═══════════════════════════════════════════════════
  function sectionCustom(pane) {
    const list = CS.state.revFieldsConfig.customMetrics || [];

    const iconPickerHtml = ICON_PICKER.map(ic => `
      <button class="settings-icon-cell" data-pick-icon="${ic}" type="button">${ic}</button>
    `).join('');

    const formHtml = `
      <div class="settings-card">
        <div class="settings-section-title settings-card-title">AGGIUNGI METRICA</div>
        <div class="settings-form-row">
          <label class="field">
            <span class="field-label">Nome</span>
            <input class="input" type="text" id="cm-label" placeholder="es. Ore nuoto" maxlength="40">
          </label>
          <label class="field" style="max-width:120px">
            <span class="field-label">Unità</span>
            <input class="input" type="text" id="cm-unit" placeholder="h" maxlength="8">
          </label>
        </div>
        <div class="settings-form-row">
          <div class="field" style="flex:1">
            <span class="field-label">Icona</span>
            <div class="settings-icon-picker" id="cm-icon-picker">${iconPickerHtml}</div>
            <input type="hidden" id="cm-icon" value="📌">
          </div>
        </div>
        <div class="settings-form-row">
          <div class="field" style="flex:1">
            <span class="field-label">Dove appare</span>
            <div class="settings-scope-chips">
              ${SCOPES_ALL.map(s => `<button class="settings-scope-chip on" data-new-scope="${s}">${s}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="settings-form-row" style="justify-content:flex-end">
          <button class="btn primary btn-cta" id="cm-add">+ AGGIUNGI METRICA</button>
        </div>
      </div>
    `;

    const listHtml = list.length === 0
      ? '<div class="settings-empty">Nessuna metrica custom. Aggiungi la prima sopra.</div>'
      : `<div class="settings-card">
           <div class="settings-section-title settings-card-title">METRICHE ESISTENTI (${list.length}/20)</div>
           ${list.map(m => renderCustomItem(m)).join('')}
         </div>`;

    pane.innerHTML = `
      <div class="settings-section-title">METRICA CUSTOM</div>
      <div class="settings-section-desc">Crea metriche personalizzate (max 20). Appaiono nelle revisioni e possono diventare obiettivi auto-trackati.</div>
      ${formHtml}
      ${listHtml}
    `;

    // Wire icon picker
    let selectedIcon = '📌';
    const picker = pane.querySelector('#cm-icon-picker');
    const hidden = pane.querySelector('#cm-icon');
    picker.querySelectorAll('[data-pick-icon]').forEach(cell => {
      if (cell.dataset.pickIcon === selectedIcon) cell.classList.add('on');
      cell.addEventListener('click', () => {
        selectedIcon = cell.dataset.pickIcon;
        hidden.value = selectedIcon;
        picker.querySelectorAll('.settings-icon-cell').forEach(c => c.classList.toggle('on', c.dataset.pickIcon === selectedIcon));
      });
    });

    // Wire scope chips nuovi
    pane.querySelectorAll('[data-new-scope]').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('on'));
    });

    // Wire add
    pane.querySelector('#cm-add').addEventListener('click', (e) => {
      const label = pane.querySelector('#cm-label').value.trim();
      const unit  = pane.querySelector('#cm-unit').value.trim();
      const icon  = pane.querySelector('#cm-icon').value;
      const scope = [...pane.querySelectorAll('[data-new-scope].on')].map(c => c.dataset.newScope);
      const res = CS.addCustomMetric({ label, unit, icon, scope });
      if (!res.ok) {
        UI.toast(res.error, 'warn', 3000);
        return;
      }
      if (typeof FX !== 'undefined') FX.glowBurst(e.currentTarget);
      UI.toast('Metrica creata', 'ok');
      sectionCustom(pane);
    });

    // Wire edit/delete sulle esistenti
    pane.querySelectorAll('[data-edit-label]').forEach(inp => {
      inp.addEventListener('change', () => {
        CS.updateCustomMetric(inp.dataset.editLabel, { label: inp.value });
        UI.toast('Nome aggiornato', 'ok', 1500);
      });
    });
    pane.querySelectorAll('[data-edit-unit]').forEach(inp => {
      inp.addEventListener('change', () => {
        CS.updateCustomMetric(inp.dataset.editUnit, { unit: inp.value });
        UI.toast('Unità aggiornata', 'ok', 1500);
      });
    });
    pane.querySelectorAll('[data-edit-scope]').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.editScope;
        const s = chip.dataset.scope;
        const m = list.find(x => x.id === id);
        if (!m) return;
        const cur = new Set(m.scope || []);
        if (cur.has(s)) cur.delete(s); else cur.add(s);
        if (cur.size === 0) {
          UI.toast('Almeno uno scope deve restare attivo', 'warn');
          return;
        }
        CS.updateCustomMetric(id, { scope: [...cur] });
        chip.classList.toggle('on');
      });
    });
    pane.querySelectorAll('[data-delete-custom]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deleteCustom;
        const m = list.find(x => x.id === id);
        if (!m) return;
        const customKey = `x_${m.key}`;
        const refs = (CS.state.obiettivi || []).filter(o => o.categoria === 'custom' && o.customKey === customKey).length;
        const msg = refs > 0
          ? `Eliminare "${m.label}"?\n\nÈ usata in ${refs} obiettivi che diventeranno manuali.`
          : `Eliminare "${m.label}"?\n\nI dati storici nelle revisioni restano salvati.`;
        if (!confirm(msg)) return;
        const res = CS.deleteCustomMetric(id);
        if (res.ok) {
          UI.toast(`Metrica eliminata${res.demotedObjectives ? ` (${res.demotedObjectives} obiettivi demoti)` : ''}`, 'ok');
          sectionCustom(pane);
        }
      });
    });
  }

  function renderCustomItem(m) {
    const chips = SCOPES_ALL.map(s => `
      <button class="settings-scope-chip ${m.scope.includes(s) ? 'on' : ''}" data-edit-scope="${m.id}" data-scope="${s}">${s}</button>
    `).join('');
    return `
      <div class="settings-custom-item">
        <div class="settings-custom-head">
          <span class="settings-extra-ico">${m.icon}</span>
          <input class="input settings-custom-label" type="text" value="${escapeAttr(m.label)}" data-edit-label="${m.id}" maxlength="40">
          <input class="input settings-custom-unit" type="text" value="${escapeAttr(m.unit || '')}" data-edit-unit="${m.id}" placeholder="unità" maxlength="8">
          <button class="btn-sm settings-custom-del" data-delete-custom="${m.id}" title="elimina">🗑</button>
        </div>
        <div class="settings-custom-meta">
          <span class="settings-custom-key">key: <code>x_${m.key}</code></span>
          <div class="settings-scope-chips">${chips}</div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════
  // SEZIONE 3+4 · CATALOGHI (Tipi allenamento, Mood)
  //   Editor chip: add/rename/delete + reset al default
  // ═══════════════════════════════════════════════════
  function sectionCatalogo(pane, which, title) {
    const cat = (CS.state.cataloghi && CS.state.cataloghi[which]) || [];

    const itemsHtml = cat.length === 0
      ? '<div class="settings-empty">Nessun elemento. Aggiungine uno sotto o ripristina i default.</div>'
      : cat.map((it, idx) => `
          <div class="settings-chip-row" data-chip-idx="${idx}">
            <input class="input settings-chip-icon" type="text" value="${escapeAttr(it.icon || '')}" maxlength="4" data-field="icon">
            <input class="input settings-chip-label" type="text" value="${escapeAttr(it.label || '')}" maxlength="30" data-field="label">
            <span class="settings-chip-id">id: <code>${escapeAttr(it.id)}</code></span>
            <button class="btn-sm settings-chip-del" data-del-idx="${idx}" title="elimina">🗑</button>
          </div>
        `).join('');

    pane.innerHTML = `
      <div class="settings-section-title">${title}</div>
      <div class="settings-section-desc">Modifica nome e icona. L'id è immutabile per non rompere i dati storici. Click su 🗑 per rimuovere (le revisioni passate mantengono il riferimento).</div>
      <div class="settings-card">
        ${itemsHtml}
      </div>
      <div class="settings-card" style="margin-top:var(--sp-3)">
        <div class="settings-section-title settings-card-title">AGGIUNGI</div>
        <div class="settings-form-row">
          <label class="field" style="max-width:80px">
            <span class="field-label">Icona</span>
            <input class="input" type="text" id="cat-new-icon" placeholder="🎯" maxlength="4">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">Nome</span>
            <input class="input" type="text" id="cat-new-label" placeholder="es. Yoga" maxlength="30">
          </label>
          <button class="btn primary" id="cat-add">+ AGGIUNGI</button>
        </div>
      </div>
      <div class="settings-form-row" style="justify-content:flex-end;margin-top:var(--sp-3)">
        <button class="btn ghost" id="cat-reset">↻ RIPRISTINA DEFAULT</button>
      </div>
    `;

    // Wire edit
    pane.querySelectorAll('[data-chip-idx]').forEach(row => {
      const idx = Number(row.dataset.chipIdx);
      row.querySelectorAll('[data-field]').forEach(inp => {
        inp.addEventListener('change', () => {
          const items = [...(CS.state.cataloghi[which] || [])];
          if (!items[idx]) return;
          items[idx] = { ...items[idx], [inp.dataset.field]: inp.value };
          CS.updateCatalogo(which, items);
          UI.toast('Aggiornato', 'ok', 1200);
        });
      });
    });

    pane.querySelectorAll('[data-del-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delIdx);
        const items = [...(CS.state.cataloghi[which] || [])];
        const item = items[idx];
        if (!item) return;
        if (!confirm(`Eliminare "${item.label}"?\n\nLe revisioni passate mantengono il riferimento all'id.`)) return;
        items.splice(idx, 1);
        CS.updateCatalogo(which, items);
        UI.toast('Eliminato', 'ok');
        sectionCatalogo(pane, which, title);
      });
    });

    // Wire add
    pane.querySelector('#cat-add').addEventListener('click', () => {
      const label = pane.querySelector('#cat-new-label').value.trim();
      const icon  = pane.querySelector('#cat-new-icon').value.trim() || '⭐';
      if (!label) { UI.toast('Nome richiesto', 'warn'); return; }
      const id = CS.slugifyKey(label);
      if (!id) { UI.toast('Nome non valido', 'warn'); return; }
      const items = [...(CS.state.cataloghi[which] || [])];
      if (items.some(x => x.id === id)) { UI.toast('Esiste già un elemento con questo id', 'warn'); return; }
      items.push({ id, label, icon, positive: false });
      CS.updateCatalogo(which, items);
      UI.toast('Aggiunto', 'ok');
      sectionCatalogo(pane, which, title);
    });

    // Wire reset
    pane.querySelector('#cat-reset').addEventListener('click', () => {
      if (!confirm('Ripristinare i valori di default? Le tue modifiche andranno perse, ma le revisioni passate manterranno i loro riferimenti.')) return;
      CS.resetCatalogo(which);
      UI.toast('Default ripristinati', 'ok');
      sectionCatalogo(pane, which, title);
    });
  }

  // ═══════════════════════════════════════════════════
  // SEZIONE 5 · SINCRONIA COL TELEFONO
  // ═══════════════════════════════════════════════════
  function sectionSincronia(pane) {
    if (typeof SYNC === 'undefined') {
      pane.innerHTML = `<div class="settings-section-title">SINCRONIA</div>
        <div class="settings-section-desc">Modulo non caricato.</div>`;
      return;
    }
    const s = SYNC.getStato();
    const cfg = SYNC.loadCfg() || {};
    const url = cfg.url || SUPABASE_DEFAULT.url;
    const key = cfg.key || SUPABASE_DEFAULT.key;

    const badge = s.connesso ? `<span class="sync-badge is-ok">● COLLEGATO</span>`
                : s.configurato ? `<span class="sync-badge is-off">● NON COLLEGATO</span>`
                : `<span class="sync-badge is-off">● DA CONFIGURARE</span>`;

    const quando = s.ultimoPush
      ? new Date(s.ultimoPush).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'mai';

    pane.innerHTML = `
      <div class="settings-section-title">SINCRONIA COL TELEFONO ${badge}</div>
      <div class="settings-section-desc">
        Quello che detti dal telefono arriva qui in una casella di posta: lo confermi tu,
        niente viene scritto da solo. Il telefono non modifica mai i tuoi dati.
      </div>

      ${s.connesso ? `
        <div class="settings-card">
          <div class="sync-row"><span>Account</span><b>${escapeAttr(s.email || '—')}</b></div>
          <div class="sync-row"><span>Ultimo aggiornamento inviato</span><b>${quando}</b></div>
          <div class="sync-row"><span>In attesa dal telefono</span><b>${typeof INBOX !== 'undefined' ? INBOX.count() : 0}</b></div>
          <div class="settings-form-actions" style="gap:var(--sp-2)">
            <button class="btn ghost" id="sy-esci">DISCONNETTI</button>
            <button class="btn primary" id="sy-ora">SINCRONIZZA ORA</button>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-toggle-row">
            <div class="settings-toggle-meta">
              <div class="settings-toggle-name">Applica da solo quello che hai già confermato sul telefono</div>
              <div class="settings-toggle-sub">
                Registra senza chiedertelo una seconda volta, ma <b>solo</b> le frasi in cui
                ha capito tutto con certezza. Quelle con anche una voce incerta restano
                comunque qui in attesa.
              </div>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="sy-auto" ${cfg.autoApplica ? 'checked' : ''}>
              <span class="settings-switch-slider"></span>
            </label>
          </div>
        </div>
      ` : `
        <div class="settings-card">
          <div class="settings-section-title settings-card-title">ENTRA</div>
          <div class="settings-section-desc" style="margin-bottom:var(--sp-3)">
            La prima volta usa <b>REGISTRATI</b>. Riceverai una mail di conferma:
            clicca il link (se la pagina che si apre dà errore non importa, serve solo
            a confermare), poi torna qui ed entra.
          </div>
          <div class="settings-form-row">
            <label class="field" style="flex:2;min-width:200px">
              <span class="field-label">Email</span>
              <input class="input" type="email" id="sy-email" autocomplete="username"
                     value="${escapeAttr(cfg.lastEmail || '')}" placeholder="la-tua@email.it">
            </label>
            <label class="field" style="flex:1;min-width:160px">
              <span class="field-label">Password</span>
              <input class="input" type="password" id="sy-pw" autocomplete="current-password" placeholder="••••••••">
            </label>
          </div>
          <div class="settings-form-actions" style="gap:var(--sp-2)">
            <button class="btn ghost" id="sy-reg">REGISTRATI</button>
            <button class="btn primary" id="sy-login">ENTRA</button>
          </div>
          <div class="sync-msg" id="sy-msg"></div>
        </div>
      `}

      <details class="sync-adv">
        <summary>Impostazioni avanzate del progetto</summary>
        <div class="settings-card" style="margin-top:var(--sp-3)">
          <label class="field">
            <span class="field-label">Project URL</span>
            <input class="input" type="text" id="sy-url" value="${escapeAttr(url)}">
          </label>
          <label class="field">
            <span class="field-label">Publishable key</span>
            <input class="input" type="text" id="sy-key" value="${escapeAttr(key)}">
          </label>
          <div class="settings-toggle-row" style="margin-top:var(--sp-3)">
            <div class="settings-toggle-meta">
              <div class="settings-toggle-name">Sincronia attiva</div>
              <div class="settings-toggle-sub">Spegnendola, Champion torna a funzionare solo in locale</div>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="sy-on" ${cfg.enabled !== false ? 'checked' : ''}>
              <span class="settings-switch-slider"></span>
            </label>
          </div>
          <div class="settings-form-actions">
            <button class="btn-sm" id="sy-test">VERIFICA CONNESSIONE</button>
            <button class="btn primary" id="sy-salva">SALVA</button>
          </div>
        </div>
      </details>
    `;

    const msg = (t, tipo) => {
      const el = pane.querySelector('#sy-msg');
      if (el) el.innerHTML = `<span class="sync-msg-${tipo || 'info'}">${escapeAttr(t)}</span>`;
      else UI.toast(t, tipo === 'err' ? 'danger' : 'ok');
    };

    function leggiCfg() {
      return {
        url: (pane.querySelector('#sy-url')?.value || url).trim(),
        key: (pane.querySelector('#sy-key')?.value || key).trim(),
        enabled: pane.querySelector('#sy-on') ? pane.querySelector('#sy-on').checked : true,
        autoApplica: pane.querySelector('#sy-auto')
          ? pane.querySelector('#sy-auto').checked : !!cfg.autoApplica,
        lastEmail: cfg.lastEmail,
        ultimoPush: cfg.ultimoPush,
      };
    }

    // L'interruttore dell'applicazione automatica salva da sé: è una scelta
    // sola e chiedere anche un SALVA sarebbe un passaggio di troppo.
    pane.querySelector('#sy-auto')?.addEventListener('change', (e) => {
      SYNC.saveCfg(leggiCfg());
      UI.toast(e.target.checked
        ? 'Le frasi capite con certezza verranno registrate da sole'
        : 'Tornerai a confermare tu ogni frase', 'ok');
    });

    // La configurazione dev'essere salvata prima di qualunque chiamata
    function assicuraCfg() {
      const c = leggiCfg();
      if (!c.url || !c.key) { msg('Servono URL e chiave', 'err'); return false; }
      SYNC.saveCfg(c);
      return true;
    }

    pane.querySelector('#sy-salva')?.addEventListener('click', () => {
      if (!assicuraCfg()) return;
      UI.toast('Impostazioni salvate', 'ok');
      sectionSincronia(pane);
    });

    pane.querySelector('#sy-test')?.addEventListener('click', async () => {
      if (!assicuraCfg()) return;
      try { await SYNC.testaConnessione(); UI.toast('Connessione riuscita', 'ok'); }
      catch (e) { UI.toast('Connessione fallita: ' + e.message, 'danger', 5000); }
    });

    pane.querySelector('#sy-reg')?.addEventListener('click', async () => {
      if (!assicuraCfg()) return;
      const email = pane.querySelector('#sy-email').value.trim();
      const pw = pane.querySelector('#sy-pw').value;
      if (!email || pw.length < 6) return msg('Email valida e password di almeno 6 caratteri', 'err');
      const btn = pane.querySelector('#sy-reg');
      btn.disabled = true; btn.textContent = 'ATTENDI…';
      try {
        const r = await SYNC.registrati(email, pw);
        const c = leggiCfg(); c.lastEmail = email; SYNC.saveCfg(c);
        if (r.confermaRichiesta) {
          msg('Registrato. Controlla la mail, clicca il link di conferma, poi premi ENTRA.', 'ok');
        } else {
          msg('Registrato e collegato.', 'ok');
          sectionSincronia(pane);
        }
      } catch (e) {
        msg(/already|registered/i.test(e.message)
          ? 'Questa email è già registrata: usa ENTRA.' : 'Errore: ' + e.message, 'err');
      } finally { btn.disabled = false; btn.textContent = 'REGISTRATI'; }
    });

    pane.querySelector('#sy-login')?.addEventListener('click', async () => {
      if (!assicuraCfg()) return;
      const email = pane.querySelector('#sy-email').value.trim();
      const pw = pane.querySelector('#sy-pw').value;
      if (!email || !pw) return msg('Inserisci email e password', 'err');
      const btn = pane.querySelector('#sy-login');
      btn.disabled = true; btn.textContent = 'ATTENDI…';
      try {
        await SYNC.accedi(email, pw);
        const c = leggiCfg(); c.lastEmail = email; SYNC.saveCfg(c);
        UI.toast('Collegato', 'ok');
        SYNC.avvia();
        sectionSincronia(pane);
      } catch (e) {
        msg(/confirm/i.test(e.message)
          ? 'Devi prima confermare la mail: clicca il link che hai ricevuto.'
          : 'Accesso fallito: ' + e.message, 'err');
      } finally { btn.disabled = false; btn.textContent = 'ENTRA'; }
    });

    pane.querySelector('#sy-esci')?.addEventListener('click', () => {
      SYNC.esci(); SYNC.fermaCiclo();
      UI.toast('Disconnesso', 'ok');
      sectionSincronia(pane);
    });

    pane.querySelector('#sy-ora')?.addEventListener('click', async () => {
      await SYNC.pullInbox();
      await SYNC.pushSnapshot(true);
      UI.toast('Sincronizzato', 'ok');
      sectionSincronia(pane);
    });
  }

  // ─── Helpers ────────────────────────────────────────
  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { open };

})();
