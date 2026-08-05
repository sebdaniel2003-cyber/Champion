/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — FISICA
   Riscritta 2026-06-22 (rivoluzione)
   Sub-routes: peso · nutrizione · corsa · sonno
   ═══════════════════════════════════════════════════════ */

(function () {

  // Cache food-db.
  // OTTIMIZZAZIONE: prima veniva caricato SOLO via fetch('data/food-db.json'),
  // che da file:// è bloccato dal browser (CORS) → autocomplete con 0 alimenti.
  // Ora il DB arriva da data/food-db.js (script tag in index.html, sempre funzionante);
  // il fetch resta come fallback nel caso lo script non sia incluso.
  let FOOD_DB = Array.isArray(window.FOOD_DB_DATA) ? window.FOOD_DB_DATA : [];
  if (!FOOD_DB.length) {
    fetch('data/food-db.json')
      .then(r => r.json())
      .then(data => { FOOD_DB = data || []; })
      .catch(err => console.warn('[FISICA] food-db.json non caricato:', err));
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 1 — PESO (hero + goal pace + chart + tabella)
  // ════════════════════════════════════════════════════

  function renderPeso() {
    const cur = CALC.pesoCurrent();
    const tgt = CS.state.profile.pesoTarget;
    const med7 = CALC.pesoMedio7gg();
    const last90 = sparkPeso(90);
    const list = [...(CS.state.pesate || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 20);
    const delta = (cur && tgt) ? (cur - tgt) : null;
    const pace = CALC.pesoPaceStato();

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">PE<span class="accent">SO</span></h1>
          <div class="page-sub">Attuale · ${cur ? cur.toFixed(1) : '—'} kg · Target ${tgt} kg</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="add-peso">+ PESATA</button>
      </div>

      <div class="panel peso-hero">
        <div class="peso-big">${cur ? cur.toFixed(1) : '—'}<span class="peso-unit">kg</span></div>
        <div class="peso-meta">
          <div class="peso-meta-item"><span class="lbl">→ TARGET</span><span class="val">${tgt} kg</span></div>
          <div class="peso-meta-item"><span class="lbl">DELTA</span><span class="val ${delta > 0 ? 'warn' : delta < 0 ? 'info' : 'good'}">${delta !== null ? (delta > 0 ? '↓ -' : delta < 0 ? '↑ +' : '🎯 ') + Math.abs(delta).toFixed(1) + ' kg' : '—'}</span></div>
          <div class="peso-meta-item"><span class="lbl">MEDIA 7GG</span><span class="val">${med7 ? med7.toFixed(1) + ' kg' : '—'}</span></div>
        </div>
      </div>

      ${renderGoalPaceBox(pace, tgt)}

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">CHART · ULTIMI 90 GIORNI</div>
        ${buildPesoChart(last90, tgt)}
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">STORICO ULTIME 20 PESATE</div>
        ${renderPesoTable(list)}
      </div>
    `;
  }

  function renderGoalPaceBox(pace, tgt) {
    const dataTarget = (CS.state.goalPace && CS.state.goalPace.dataTarget) || '';
    const cls = {
      raggiunto: 'good', in_linea: 'good', ritardo: 'warn',
      molto_ritardo: 'danger', no_data: 'muted',
    }[pace.stato] || 'muted';
    return `
      <div class="panel goal-pace-box ${cls}" style="margin-top:var(--sp-4)">
        <div class="panel-title">GOAL PACE</div>
        <div class="row" style="gap:var(--sp-3);align-items:flex-end;flex-wrap:wrap">
          <div class="field" style="margin:0;flex:1;min-width:200px">
            <label class="field-label">Target ${tgt} kg entro</label>
            <input class="input" type="date" id="goal-pace-date" value="${dataTarget}">
          </div>
          <button class="btn primary" id="goal-pace-save">SALVA DATA</button>
          ${dataTarget ? '<button class="btn ghost" id="goal-pace-clear">RIMUOVI</button>' : ''}
        </div>
        <div class="goal-pace-stato">
          <div class="goal-pace-label">${pace.label}</div>
          ${pace.kgSettRichiesti !== undefined ? `
            <div class="goal-pace-details">
              <span>Richiesto: <strong>${pace.kgSettRichiesti.toFixed(2)} kg/sett</strong></span>
              <span>Ritmo attuale: <strong>${(pace.kgSettAttuale || 0).toFixed(2)} kg/sett</strong></span>
              <span>Settimane rimaste: <strong>${Math.round(pace.settRimaste)}</strong></span>
            </div>` : ''}
        </div>
      </div>
    `;
  }

  function renderPesoTable(list) {
    if (!list.length) return UI.empty('⚖️', 'NESSUNA PESATA', 'Aggiungi la prima pesata');
    const rows = list.map((p, i) => {
      const prev = list[i + 1];
      const d = prev ? (p.kg - prev.kg) : null;
      return `
        <div class="peso-row">
          <span class="peso-date">${CS.fmtDate(p.data, { long: true })}</span>
          <span class="peso-kg">${Number(p.kg).toFixed(1)} <span style="color:var(--text-mute);font-size:11px">kg</span></span>
          <span class="peso-delta ${d === null ? '' : d > 0 ? 'warn' : d < 0 ? 'good' : ''}">${d === null ? '—' : (d > 0 ? '+' : '') + d.toFixed(1)}</span>
          <span class="peso-note">${escapeHtml(p.note || '')}</span>
          <button class="btn-sm danger" data-del-peso="${p.id}">×</button>
        </div>
      `;
    }).join('');
    return `<div class="peso-table">${rows}</div>`;
  }

  function sparkPeso(days) {
    const today = new Date();
    let last = CALC.pesoCurrent() || 0;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i));
      const p = (CS.state.pesate || []).find(x => x.data === CS.isoDateOnly(d));
      if (p) last = p.kg;
      return last;
    });
  }

  function buildPesoChart(values, target) {
    if (!values.length || values.every(v => !v)) {
      return UI.empty('📈', 'NESSUN DATO', 'Aggiungi pesate per vedere il trend');
    }
    const w = 900, h = 220;
    const padTop = 20, padBot = 30;
    const vals = values.filter(v => v > 0);
    const min = Math.min(target - 1, ...vals);
    const max = Math.max(target + 1, ...vals);
    const range = (max - min) || 1;
    const step = w / Math.max(1, values.length - 1);
    const yOf = v => padTop + (1 - (v - min) / range) * (h - padTop - padBot);
    const pts = values.map((v, i) => [i * step, yOf(v)]);
    const linePath = `M ${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')}`;
    const areaPath = `${linePath} L ${w},${h - padBot} L 0,${h - padBot} Z`;
    const tgtY = yOf(target);
    // Etichette asse y
    const labels = [min, (min + max) / 2, max].map(v =>
      `<text x="4" y="${yOf(v) + 3}" font-size="10" fill="var(--text-mute)" font-family="JetBrains Mono">${v.toFixed(1)}</text>`
    ).join('');
    return `
      <svg viewBox="0 0 ${w} ${h}" class="peso-chart" preserveAspectRatio="none" style="width:100%;height:280px">
        <defs>
          <linearGradient id="peso-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#B45CFF" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#B45CFF" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="${tgtY}" x2="${w}" y2="${tgtY}" stroke="#B45CFF" stroke-dasharray="6 4" stroke-width="1.5" opacity="0.7"/>
        <text x="${w - 60}" y="${tgtY - 6}" fill="#B45CFF" font-size="11" font-family="JetBrains Mono">TARGET ${target}</text>
        <path d="${areaPath}" fill="url(#peso-grad)"/>
        <path d="${linePath}" stroke="#B45CFF" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${labels}
      </svg>
    `;
  }

  function afterPeso() {
    document.getElementById('add-peso')?.addEventListener('click', () => openPesoForm());
    document.getElementById('goal-pace-save')?.addEventListener('click', () => {
      const v = document.getElementById('goal-pace-date')?.value;
      if (!v) return UI.toast('Inserisci una data', 'warn');
      CS.setGoalPace({ dataTarget: v });
      UI.toast('Data target salvata', 'ok');
      ROUTER.go('fisica', 'peso');
    });
    document.getElementById('goal-pace-clear')?.addEventListener('click', () => {
      CS.setGoalPace({ dataTarget: null });
      UI.toast('Data target rimossa', 'ok');
      ROUTER.go('fisica', 'peso');
    });
    document.querySelectorAll('[data-del-peso]').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Eliminare questa pesata?')) return;
        CS.deletePesata(b.dataset.delPeso);
        ROUTER.go('fisica', 'peso');
      });
    });
  }

  function openPesoForm() {
    const html = `
      <h2 class="modal-title">NUOVA PESATA</h2>
      <div class="field"><label class="field-label">Data</label>
        <input class="input" type="date" id="p-d" value="${CS.todayISO()}"></div>
      <div class="field"><label class="field-label">Peso (kg)</label>
        <input class="input" type="number" step="0.1" id="p-k" autofocus></div>
      <div class="field"><label class="field-label">Note (opzionale)</label>
        <input class="input" id="p-n" placeholder="Es. dopo allenamento"></div>
      <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn ghost" data-close>ANNULLA</button>
        <button class="btn primary" id="p-sv">SALVA</button>
      </div>
    `;
    const m = UI.modal(html);
    m.el.querySelector('#p-sv').addEventListener('click', () => {
      const kg = parseFloat(m.el.querySelector('#p-k').value);
      if (!kg) return UI.toast('Inserisci un peso valido', 'warn');
      CS.addPesata({ data: m.el.querySelector('#p-d').value, kg, note: m.el.querySelector('#p-n').value });
      UI.toast('Pesata salvata', 'ok');
      m.close();
      ROUTER.go('fisica', 'peso');
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 2 — NUTRIZIONE (con autocomplete food-db)
  // ════════════════════════════════════════════════════

  function renderNutrizione() {
    const today = CS.todayISO();
    const todayPasti = (CS.state.pasti || []).filter(p => p.data === today);
    const t = totalsFromPasti(todayPasti);
    const tgt = CS.state.targetNutrizione;
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">NUTRI<span class="accent">ZIONE</span></h1>
          <div class="page-sub">${CS.fmtDate(today, { long: true })} · target ${tgt.kcal} kcal</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="add-pasto">+ PASTO</button>
      </div>

      <div class="macro-card-grid">
        ${macroCard('KCAL', t.kcal, tgt.kcal, 'kcal')}
        ${macroCard('PROTEINE', t.pro, tgt.pro, 'g')}
        ${macroCard('CARBO', t.carb, tgt.carb, 'g')}
        ${macroCard('GRASSI', t.fat, tgt.fat, 'g')}
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">PASTI DI OGGI</div>
        ${todayPasti.length ? renderPastiList(todayPasti) : UI.empty('🍝', 'NESSUN PASTO OGGI', 'Aggiungi il primo pasto')}
      </div>
    `;
  }

  function totalsFromPasti(pasti) {
    return pasti.reduce((acc, p) => {
      (p.alimenti || []).forEach(a => {
        acc.kcal += Number(a.kcal) || 0;
        acc.pro  += Number(a.pro) || 0;
        acc.carb += Number(a.carb) || 0;
        acc.fat  += Number(a.fat) || 0;
      });
      return acc;
    }, { kcal: 0, pro: 0, carb: 0, fat: 0 });
  }

  function macroCard(label, current, target, unit) {
    const pct = target > 0 ? Math.min(120, (current / target) * 100) : 0;
    let cls = 'macro-low';
    if (pct >= 80 && pct <= 110) cls = 'macro-ok';
    else if (pct > 110) cls = 'macro-over';
    return `
      <div class="macro-card ${cls}">
        <div class="macro-label">${label}</div>
        <div class="macro-big">${Math.round(current)} <span class="macro-target">/ ${target} ${unit}</span></div>
        <div class="macro-bar"><div class="macro-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
        <div class="macro-pct">${Math.round(pct)}%</div>
      </div>
    `;
  }

  function renderPastiList(pasti) {
    const tipiIco = { 'Colazione': '🍳', 'Pranzo': '🍝', 'Cena': '🥗', 'Spuntino': '🍎' };
    const rows = pasti.map(p => {
      const subtot = (p.alimenti || []).reduce((acc, a) => {
        acc.kcal += Number(a.kcal) || 0; acc.pro += Number(a.pro) || 0;
        acc.carb += Number(a.carb) || 0; acc.fat += Number(a.fat) || 0;
        return acc;
      }, { kcal: 0, pro: 0, carb: 0, fat: 0 });
      const items = (p.alimenti || []).map(a =>
        `<div class="meal-item">
          <span class="meal-item-name">${escapeHtml(a.nome)}</span>
          <span class="meal-item-g">${Math.round(Number(a.g) || 0)}g</span>
          <span class="meal-item-mac">${Math.round(a.kcal)}kcal · ${Math.round(a.pro)}P / ${Math.round(a.carb)}C / ${Math.round(a.fat)}G</span>
        </div>`
      ).join('');
      return `
        <div class="meal-card" data-pasto="${p.id}">
          <div class="meal-card-head">
            <div class="meal-tipo">${tipiIco[p.tipo] || '◆'} ${p.tipo}${p.ora ? ' · ' + p.ora : ''}</div>
            <div class="meal-totals">${Math.round(subtot.kcal)} kcal</div>
            <button class="btn-sm danger" data-del-pasto="${p.id}">×</button>
          </div>
          <div class="meal-items">${items || '<span class="muted">Nessun alimento</span>'}</div>
        </div>
      `;
    }).join('');
    return rows;
  }

  function afterNutrizione() {
    document.getElementById('add-pasto')?.addEventListener('click', () => openPastoForm());
    document.querySelectorAll('[data-del-pasto]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Eliminare questo pasto?')) return;
        CS.deletePasto(b.dataset.delPasto);
        ROUTER.go('fisica', 'nutrizione');
      });
    });
  }

  function openPastoForm() {
    const tipi = ['Colazione', 'Pranzo', 'Cena', 'Spuntino'];
    const ora = new Date().toTimeString().slice(0, 5);
    const html = `
      <h2 class="modal-title">NUOVO PASTO</h2>
      <div class="field"><label class="field-label">Tipo</label>
        <div class="row" style="gap:6px">
          ${tipi.map((t, i) => `<label class="pasto-tipo-pill"><input type="radio" name="tipo" value="${t}" ${i === 1 ? 'checked' : ''}> ${t}</label>`).join('')}
        </div>
      </div>
      <div class="field"><label class="field-label">Ora</label>
        <input class="input" type="time" id="pasto-ora" value="${ora}"></div>

      <div class="field">
        <label class="field-label">Aggiungi alimento (autocomplete dal DB)</label>
        <div style="position:relative">
          <input class="input" id="food-search" placeholder="Cerca alimento... (es. pasta, pollo, tonno)" autocomplete="off">
          <div id="food-suggest" class="food-suggest" hidden></div>
        </div>
        <div class="row" style="gap:var(--sp-2);margin-top:var(--sp-2)">
          <input class="input" id="food-g" type="number" placeholder="grammi" style="flex:1" min="1">
          <button class="btn primary" id="food-add" type="button">+ AGGIUNGI AL PASTO</button>
        </div>
        <div class="muted" style="font-size:11px;margin-top:4px">DB: ${FOOD_DB.length} alimenti</div>
      </div>

      <div class="field">
        <label class="field-label">Alimenti del pasto</label>
        <div id="pasto-items" class="pasto-items"></div>
        <div id="pasto-totals" class="pasto-totals muted">0 kcal · 0P / 0C / 0G</div>
      </div>

      <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn ghost" data-close>ANNULLA</button>
        <button class="btn primary" id="pasto-save" type="button">SALVA PASTO</button>
      </div>
    `;
    const m = UI.modal(html);
    const items = []; // {nome, g, kcal, pro, carb, fat}
    let selectedFood = null;

    const search = m.el.querySelector('#food-search');
    const suggest = m.el.querySelector('#food-suggest');
    const gInput = m.el.querySelector('#food-g');
    const itemsBox = m.el.querySelector('#pasto-items');
    const totalsBox = m.el.querySelector('#pasto-totals');

    function renderItems() {
      if (!items.length) {
        itemsBox.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0">Nessun alimento aggiunto.</div>';
        totalsBox.textContent = '0 kcal · 0P / 0C / 0G';
        return;
      }
      itemsBox.innerHTML = items.map((a, i) =>
        `<div class="pasto-item-row">
          <span>${escapeHtml(a.nome)}</span>
          <span>${a.g}g</span>
          <span>${Math.round(a.kcal)} kcal</span>
          <button class="btn-sm danger" data-rm="${i}" type="button">×</button>
        </div>`
      ).join('');
      itemsBox.querySelectorAll('[data-rm]').forEach(b => {
        b.addEventListener('click', () => { items.splice(Number(b.dataset.rm), 1); renderItems(); });
      });
      const t = items.reduce((acc, a) => ({
        kcal: acc.kcal + a.kcal, pro: acc.pro + a.pro,
        carb: acc.carb + a.carb, fat: acc.fat + a.fat,
      }), { kcal: 0, pro: 0, carb: 0, fat: 0 });
      totalsBox.textContent = `${Math.round(t.kcal)} kcal · ${Math.round(t.pro)}P / ${Math.round(t.carb)}C / ${Math.round(t.fat)}G`;
    }
    renderItems();

    search.addEventListener('input', () => {
      const q = search.value.toLowerCase().trim();
      selectedFood = null;
      if (q.length < 2) { suggest.hidden = true; return; }
      const matches = FOOD_DB.filter(f => f.nome.toLowerCase().includes(q)).slice(0, 8);
      if (!matches.length) { suggest.hidden = false; suggest.innerHTML = '<div class="food-suggest-empty">Nessun risultato. Compila manualmente.</div>'; return; }
      suggest.hidden = false;
      suggest.innerHTML = matches.map(f =>
        `<button class="food-suggest-item" type="button" data-food='${JSON.stringify(f).replace(/'/g, '&#39;')}'>
          <strong>${escapeHtml(f.nome)}</strong>
          <span class="food-suggest-mac">${f.kcal} kcal · ${f.pro}P / ${f.carb}C / ${f.fat}G · per 100g</span>
        </button>`
      ).join('');
      suggest.querySelectorAll('.food-suggest-item').forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            selectedFood = JSON.parse(btn.dataset.food.replace(/&#39;/g, "'"));
            search.value = selectedFood.nome;
            suggest.hidden = true;
            gInput.focus();
          } catch (e) {}
        });
      });
    });

    m.el.querySelector('#food-add').addEventListener('click', () => {
      const g = parseFloat(gInput.value);
      if (!g || g <= 0) return UI.toast('Inserisci i grammi', 'warn');
      if (!selectedFood) {
        // Permetto inserimento manuale se non c'è match
        const nome = search.value.trim();
        if (!nome) return UI.toast('Cerca o digita un alimento', 'warn');
        // Manuale: kcal/macro 0 (poi l'utente può modificare se necessario)
        items.push({ nome, g, kcal: 0, pro: 0, carb: 0, fat: 0 });
      } else {
        const factor = g / 100;
        items.push({
          nome: selectedFood.nome,
          g,
          kcal: Math.round((selectedFood.kcal || 0) * factor),
          pro: +((selectedFood.pro || 0) * factor).toFixed(1),
          carb: +((selectedFood.carb || 0) * factor).toFixed(1),
          fat: +((selectedFood.fat || 0) * factor).toFixed(1),
        });
      }
      search.value = '';
      gInput.value = '';
      selectedFood = null;
      search.focus();
      renderItems();
    });

    m.el.querySelector('#pasto-save').addEventListener('click', () => {
      if (!items.length) return UI.toast('Aggiungi almeno un alimento', 'warn');
      const tipo = m.el.querySelector('input[name="tipo"]:checked').value;
      const ora = m.el.querySelector('#pasto-ora').value;
      CS.addPasto({ data: CS.todayISO(), ora, tipo, alimenti: items });
      m.close();
      UI.toast('Pasto salvato', 'ok');
      ROUTER.go('fisica', 'nutrizione');
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 3 — CORSA (pace + zone FC)
  // ════════════════════════════════════════════════════

  function renderCorsa() {
    const kmSett = CALC.corsaKmSett(new Date());
    const paceMed = CALC.corsaPaceMedio(30);
    const uscite30 = (CS.state.corsa || []).filter(c => new Date(c.data) >= addDays(new Date(), -30)).length;
    const eta = CS.state.profile.eta || 26;
    const fcMax = CALC.corsaFCMax(eta);
    const zone = CALC.corsaZone(eta);

    // Storico recente (ultime 20)
    const list = [...(CS.state.corsa || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 20);
    const tgt = (CS.state.targetSett && CS.state.targetSett.kmCorsa) || 20;

    // Zona prevalente (ultime 20 uscite)
    const zonePrev = zonaPrevalente(list, eta);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">COR<span class="accent">SA</span></h1>
          <div class="page-sub">Cardio · pace · zone FC · FCmax ${fcMax} bpm (220-${eta})</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="add-corsa">+ USCITA</button>
      </div>

      <div class="run-stat-grid">
        ${runStat('KM SETTIMANA', `${kmSett.toFixed(1)} / ${tgt}`, kmSett >= tgt ? 'good' : '')}
        ${runStat('PACE MEDIO (30gg)', paceMed ? paceMed.formatted + ' min/km' : '—', '')}
        ${runStat('ZONA PREV.', zonePrev ? `${zonePrev.id} · ${zonePrev.label}` : '—', '')}
        ${runStat('USCITE 30gg', uscite30, '')}
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">ZONE CARDIACHE</div>
        ${renderZoneTable(zone, fcMax)}
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">STORICO ULTIME 20 USCITE</div>
        ${list.length ? renderCorsaTable(list, eta) : UI.empty('🏃', 'NESSUNA USCITA', 'Logga la prima uscita')}
      </div>
    `;
  }

  function zonaPrevalente(uscite, eta) {
    if (!uscite.length) return null;
    const count = new Map();
    uscite.forEach(c => {
      if (!c.fcMedia) return;
      const z = CALC.corsaZonaByFC(c.fcMedia, eta);
      if (!z) return;
      count.set(z.id, (count.get(z.id) || 0) + 1);
    });
    if (!count.size) return null;
    let best = null, bestV = 0;
    count.forEach((v, k) => { if (v > bestV) { bestV = v; best = k; } });
    return CALC.corsaZone(eta).find(z => z.id === best);
  }

  function runStat(lbl, val, cls) {
    return `
      <div class="widget-card">
        <div class="widget-label">${lbl}</div>
        <div class="widget-big ${cls}">${val}</div>
      </div>
    `;
  }

  function renderZoneTable(zone, fcMax) {
    return `
      <div class="zone-table">
        ${zone.map(z => `
          <div class="zone-row">
            <span class="zone-id">${z.id}</span>
            <span class="zone-label">${z.label}</span>
            <span class="zone-range">${z.min} – ${z.max} bpm</span>
            <span class="zone-pct">${Math.round((z.min / fcMax) * 100)}–${Math.round((z.max / fcMax) * 100)}%</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderCorsaTable(list, eta) {
    const head = `
      <div class="corsa-row corsa-head">
        <span>DATA</span><span>TIPO</span><span>KM</span><span>MIN</span><span>PACE</span><span>FC</span><span>ZONA</span><span>KCAL</span><span></span>
      </div>
    `;
    const rows = list.map(c => {
      const pace = CALC.corsaPace(c.km, c.durataMin);
      const zona = CALC.corsaZonaByFC(c.fcMedia, eta);
      return `
        <div class="corsa-row">
          <span>${CS.fmtDate(c.data, { short: true })}</span>
          <span>${c.tipo || '—'}</span>
          <span>${(Number(c.km) || 0).toFixed(1)}</span>
          <span>${Math.round(c.durataMin || 0)}</span>
          <span>${pace ? pace.formatted : '—'}</span>
          <span>${c.fcMedia || '—'}</span>
          <span>${zona ? zona.id : '—'}</span>
          <span>${c.kcal || '—'}</span>
          <span><button class="btn-sm danger" data-del-corsa="${c.id}">×</button></span>
        </div>
      `;
    }).join('');
    return `<div class="corsa-table">${head}${rows}</div>`;
  }

  function afterCorsa() {
    document.getElementById('add-corsa')?.addEventListener('click', () => openCorsaForm());
    document.querySelectorAll('[data-del-corsa]').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Eliminare questa uscita?')) return;
        CS.deleteCorsa(b.dataset.delCorsa);
        ROUTER.go('fisica', 'corsa');
      });
    });
  }

  function openCorsaForm() {
    const tipi = ['Fondo lento', 'Sprint', 'Intervallato', 'Salite', 'Recupero'];
    const html = `
      <h2 class="modal-title">NUOVA USCITA CORSA</h2>
      <div class="field"><label class="field-label">Data</label>
        <input class="input" type="date" id="cor-d" value="${CS.todayISO()}"></div>
      <div class="field"><label class="field-label">Tipo</label>
        <select class="input" id="cor-t">${tipi.map(t => `<option>${t}</option>`).join('')}</select></div>
      <div class="row" style="gap:var(--sp-3)">
        <div class="field" style="flex:1"><label class="field-label">Km</label>
          <input class="input" type="number" step="0.1" id="cor-km" autofocus></div>
        <div class="field" style="flex:1"><label class="field-label">Durata (min)</label>
          <input class="input" type="number" id="cor-min"></div>
      </div>
      <div class="row" style="gap:var(--sp-3)">
        <div class="field" style="flex:1"><label class="field-label">FC media (bpm)</label>
          <input class="input" type="number" id="cor-fc" placeholder="opzionale"></div>
        <div class="field" style="flex:1"><label class="field-label">Kcal (stimato)</label>
          <input class="input" type="number" id="cor-kcal" placeholder="auto"></div>
      </div>
      <div class="muted" style="font-size:11px">Pace verrà calcolato automaticamente. Kcal stimati: 0.63 × peso × km.</div>
      <div class="row" style="justify-content:flex-end;gap:var(--sp-2);margin-top:var(--sp-3)">
        <button class="btn ghost" data-close>ANNULLA</button>
        <button class="btn primary" id="cor-sv">SALVA</button>
      </div>
    `;
    const m = UI.modal(html);
    m.el.querySelector('#cor-sv').addEventListener('click', () => {
      const km = parseFloat(m.el.querySelector('#cor-km').value);
      const min = parseFloat(m.el.querySelector('#cor-min').value);
      if (!km || !min) return UI.toast('Inserisci km e durata', 'warn');
      const peso = CALC.pesoCurrent() || CS.state.profile.pesoTarget;
      const kcalAuto = m.el.querySelector('#cor-kcal').value ? Number(m.el.querySelector('#cor-kcal').value) : Math.round(0.63 * peso * km);
      CS.addCorsa({
        data: m.el.querySelector('#cor-d').value,
        tipo: m.el.querySelector('#cor-t').value,
        km, durataMin: min,
        fcMedia: m.el.querySelector('#cor-fc').value ? Number(m.el.querySelector('#cor-fc').value) : null,
        kcal: kcalAuto,
      });
      m.close();
      UI.toast('Uscita salvata', 'ok');
      ROUTER.go('fisica', 'corsa');
    });
  }

  // ════════════════════════════════════════════════════
  // SUB-TAB 4 — SONNO (separato, con correlazioni)
  // ════════════════════════════════════════════════════

  function renderSonno() {
    const med7 = CALC.sonnoMedio(7);
    const med30 = CALC.sonnoMedio(30);
    const tgt = 7.5;
    const debito = CALC.sonnoDebito(tgt, 7);
    const list = [...(CS.state.sonno || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 14);
    const last30 = CALC.sparkSonnoMese();
    const corr = CALC.sonnoCorrelazioneTecnica(tgt);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">SON<span class="accent">NO</span></h1>
          <div class="page-sub">Recupero · Qualità · Target ${CS.fmtDurata(tgt)} a notte</div>
        </div>
        <button class="btn-cta btn-cta-sm" id="add-sonno">+ LOG SONNO</button>
      </div>

      <div class="sleep-stat-grid">
        ${runStat('MEDIA 7GG', med7 ? CS.fmtDurataCompatta(med7) : '—', med7 >= tgt ? 'good' : 'warn')}
        ${runStat('MEDIA 30GG', med30 ? CS.fmtDurataCompatta(med30) : '—', '')}
        ${runStat('DEBITO 7GG', CS.fmtDurataCompatta(debito), debito > 0 ? 'warn' : 'good')}
        ${runStat('TARGET', CS.fmtDurataCompatta(tgt), '')}
      </div>

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">CHART · ULTIMI 30 GIORNI</div>
        ${buildSonnoChart(last30, tgt)}
      </div>

      ${corr.campioneAlto > 3 && corr.campioneBasso > 3 ? `
        <div class="panel correlation-box" style="margin-top:var(--sp-4)">
          <div class="panel-title">🔍 CORRELAZIONI</div>
          <div class="correlation-row">
            <span class="corr-cond">Quando dormo meno di ${CS.fmtDurata(tgt)}</span>
            <span class="corr-arrow">→</span>
            <span class="corr-val">tecnica media <strong>${corr.tecnicaConPocoSonno?.toFixed(1) || '—'}/10</strong></span>
            <span class="muted">(${corr.campioneBasso} giorni)</span>
          </div>
          <div class="correlation-row">
            <span class="corr-cond">Quando dormo almeno ${CS.fmtDurata(tgt)}</span>
            <span class="corr-arrow">→</span>
            <span class="corr-val">tecnica media <strong>${corr.tecnicaConBuonSonno?.toFixed(1) || '—'}/10</strong></span>
            <span class="muted">(${corr.campioneAlto} giorni)</span>
          </div>
          ${corr.tecnicaConBuonSonno > corr.tecnicaConPocoSonno ? `
            <div class="correlation-insight">📈 Differenza: <strong>+${(corr.tecnicaConBuonSonno - corr.tecnicaConPocoSonno).toFixed(1)} punti tecnica</strong> con sonno completo</div>` : ''}
        </div>
      ` : ''}

      <div class="panel" style="margin-top:var(--sp-4)">
        <div class="panel-title">STORICO ULTIME 14 NOTTI</div>
        ${list.length ? renderSonnoTable(list) : UI.empty('🌙', 'NESSUN LOG', 'Aggiungi il primo log di sonno')}
      </div>
    `;
  }

  function buildSonnoChart(values, target) {
    if (!values.length || values.every(v => !v)) return UI.empty('📈', 'NESSUN DATO', 'Aggiungi log di sonno');
    const w = 900, h = 200, padTop = 16, padBot = 24;
    const min = Math.min(target - 1, ...values.filter(v => v > 0));
    const max = Math.max(target + 1, ...values);
    const range = (max - min) || 1;
    const step = w / Math.max(1, values.length - 1);
    const yOf = v => padTop + (1 - (v - min) / range) * (h - padTop - padBot);
    const pts = values.map((v, i) => [i * step, yOf(v || min)]);
    const linePath = `M ${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')}`;
    const tgtY = yOf(target);
    return `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:220px">
        <line x1="0" y1="${tgtY}" x2="${w}" y2="${tgtY}" stroke="#B45CFF" stroke-dasharray="6 4" stroke-width="1.5" opacity="0.7"/>
        <text x="${w - 60}" y="${tgtY - 6}" fill="#B45CFF" font-size="11" font-family="JetBrains Mono">${CS.fmtDurataCompatta(target)}</text>
        <path d="${linePath}" stroke="#B45CFF" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function renderSonnoTable(list) {
    const head = `<div class="sonno-row sonno-head"><span>DATA</span><span>ORE</span><span>QUALITÀ</span><span>NOTE</span><span></span></div>`;
    const rows = list.map(s => `
      <div class="sonno-row">
        <span>${CS.fmtDate(s.data, { long: true })}</span>
        <span>${CS.fmtDurata(Number(s.ore) || 0)}</span>
        <span>${s.qualita || '—'}/5</span>
        <span>${escapeHtml(s.note || '')}</span>
        <span></span>
      </div>
    `).join('');
    return `<div class="sonno-table">${head}${rows}</div>`;
  }

  function afterSonno() {
    document.getElementById('add-sonno')?.addEventListener('click', () => openSonnoForm());
  }

  function openSonnoForm() {
    const html = `
      <h2 class="modal-title">LOG SONNO</h2>
      <div class="field"><label class="field-label">Data (notte di...)</label>
        <input class="input" type="date" id="s-d" value="${CS.todayISO()}"></div>
      <div class="field"><label class="field-label">Quanto hai dormito</label>
        <div class="row" style="gap:var(--sp-2);align-items:center">
          <input class="input" type="number" min="0" max="24" step="1" id="s-h" placeholder="7" autofocus style="flex:1">
          <span class="field-label" style="margin:0">ore</span>
          <input class="input" type="number" min="0" max="59" step="5" id="s-m" placeholder="30" style="flex:1">
          <span class="field-label" style="margin:0">min</span>
        </div>
        <div class="field-hint" id="s-leggi"></div></div>
      <div class="field"><label class="field-label">Qualità (1-5)</label>
        <input class="input" type="number" min="1" max="5" id="s-q" placeholder="es. 4"></div>
      <div class="field"><label class="field-label">Note (opzionale)</label>
        <input class="input" id="s-n" placeholder="es. sveglia presto"></div>
      <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn ghost" data-close>ANNULLA</button>
        <button class="btn primary" id="s-sv">SALVA</button>
      </div>
    `;
    const m = UI.modal(html);

    // Ore e minuti separati: nessuno pensa il proprio sonno come "7,5"
    const leggiDurata = () => DURATA.daMinuti(
      (Number(m.el.querySelector('#s-h').value) || 0) * 60 +
      (Number(m.el.querySelector('#s-m').value) || 0));
    const eco = () => {
      m.el.querySelector('#s-leggi').textContent = CS.fmtDurata(leggiDurata(), { zero: '' });
    };
    m.el.querySelector('#s-h').addEventListener('input', eco);
    m.el.querySelector('#s-m').addEventListener('input', eco);

    m.el.querySelector('#s-sv').addEventListener('click', () => {
      const ore = leggiDurata();
      if (!ore) return UI.toast('Inserisci quanto hai dormito', 'warn');
      if (ore < 0 || ore > 24) return UI.toast('Durata fuori range (0-24 ore)', 'warn');
      // min/max sull'input non impediscono di digitare: la qualità va clampata
      // qui, altrimenti un 9 su scala 1-5 sballa medie e grafici.
      const qRaw = Number(m.el.querySelector('#s-q').value);
      const qualita = qRaw ? Math.min(5, Math.max(1, Math.round(qRaw))) : 3;
      CS.addSonno({
        data: m.el.querySelector('#s-d').value,
        ore,
        qualita,
        note: m.el.querySelector('#s-n').value,
      });
      m.close();
      UI.toast('Sonno salvato', 'ok');
      ROUTER.go('fisica', 'sonno');
    });
  }

  // ─── helpers ─────────────────────────────────────────
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ─── REGISTER ROUTES ────────────────────────────────
  ROUTER.register('fisica/peso',       renderPeso,       afterPeso);
  ROUTER.register('fisica/nutrizione', renderNutrizione, afterNutrizione);
  ROUTER.register('fisica/corsa',      renderCorsa,      afterCorsa);
  ROUTER.register('fisica/sonno',      renderSonno,      afterSonno);

})();
