// ═══════════════════════════════════════════════════════
// ORO SHARED — helper condivisi tra tecnica/sessioni (cruscotto Oro)
// e archivio (calendario read-only). Espone OroShared globale.
// ═══════════════════════════════════════════════════════

const OroShared = (function () {
  'use strict';

  const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MONTH_LABEL = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
                       'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function dayOfWeekMon0(d) {
    return (d.getDay() + 6) % 7;
  }
  function monthDays(cursor) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
  }
  function mondayOf(d) {
    const dow = dayOfWeekMon0(d);
    const m = new Date(d);
    m.setDate(d.getDate() - dow);
    m.setHours(0, 0, 0, 0);
    return m;
  }

  // Stato cella per un giorno: 'empty'|'red'|'orange'|'gold'|'rest' + meta
  function computeCellState(dateIso) {
    return CALC.giornataOroCheck(dateIso);
  }

  // Icona per lo stato
  function iconForState(state) {
    switch (state) {
      case 'gold':   return '★';
      case 'orange': return '●';
      case 'red':    return '▲';
      case 'rest':   return '🌙';
      default:       return '';
    }
  }

  // Label per lo stato (usato in toast/detail)
  function labelForState(state) {
    switch (state) {
      case 'gold':   return 'D\'ORO';
      case 'orange': return 'PARZIALE';
      case 'red':    return 'SOTTO';
      case 'rest':   return 'RIPOSO';
      default:       return 'VUOTA';
    }
  }

  // Colore hex per lo stato (per barre/ring)
  function colorForState(state) {
    switch (state) {
      case 'gold':   return '#FFE600';
      case 'orange': return '#FF9A3D';
      case 'red':    return '#FF3B30';
      case 'rest':   return '#4A9DFF';
      default:       return '#2a2a2a';
    }
  }

  // Render tooltip content per una cella (usato dal renderCell)
  function renderCellTooltip(iso, st) {
    const rev = CS.state.revisioni.find(r => r.data === iso);
    const d = new Date(iso);
    const dNum = d.getDate();
    const mLbl = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'][d.getMonth()];
    const yLbl = d.getFullYear();
    const weekday = ['DOMENICA','LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ','SABATO'][d.getDay()];
    const badge = `<span class="oro-tip-badge is-${st.state}">${labelForState(st.state)}</span>`;

    // Header comune elegante
    const headHtml = `
      <div class="oro-tip-head is-${st.state}">
        <div class="oro-tip-datebox">
          <span class="oro-tip-daynum">${dNum}</span>
          <div class="oro-tip-daymeta">
            <span class="oro-tip-wd">${weekday}</span>
            <span class="oro-tip-mon">${mLbl} ${yLbl}</span>
          </div>
        </div>
        ${badge}
      </div>
    `;

    if (!rev) {
      return `
        <div class="oro-tip is-${st.state}">
          ${headHtml}
          <div class="oro-tip-empty">
            <span class="oro-tip-empty-ico">◇</span>
            <span>Nessuna revisione salvata</span>
          </div>
        </div>
      `;
    }
    if (st.riposo) {
      return `
        <div class="oro-tip is-${st.state}">
          ${headHtml}
          <div class="oro-tip-empty">
            <span class="oro-tip-empty-ico">🌙</span>
            <span>Giorno di riposo</span>
          </div>
        </div>
      `;
    }
    const ore = Number(rev.oreAllenamento) || 0;
    const sess = Number(rev.sessioniGiorno) || (Array.isArray(rev.dettagliSessioni) ? rev.dettagliSessioni.length : 0);
    const tec = Number(rev.tecnica) || 0;
    const int = Number(rev.intensita) || 0;
    const aff = Number(rev.affaticamento) || 0;
    const fless = Number(rev.flessioni) || 0;
    const squat = Number(rev.squat) || 0;
    const addo = Number(rev.addominali) || 0;
    const km = Number(rev.kmCorsa) || 0;
    const tgtF = CS.getTargetVolumeForDay(iso, 'flessioni');
    const tgtS = CS.getTargetVolumeForDay(iso, 'squat');
    const tgtA = CS.getTargetVolumeForDay(iso, 'addominali');
    const pctF = tgtF > 0 ? Math.min(100, (fless / tgtF) * 100) : 0;
    const pctS = tgtS > 0 ? Math.min(100, (squat / tgtS) * 100) : 0;
    const pctA = tgtA > 0 ? Math.min(100, (addo / tgtA) * 100) : 0;

    const metPct = (st.met / 4) * 100;
    const criteriDots = (st.criteri || []).map(c =>
      `<span class="oro-tip-dot ${c.met ? 'is-met' : ''}" title="${c.label}"></span>`
    ).join('');

    return `
      <div class="oro-tip is-${st.state}">
        ${headHtml}
        <div class="oro-tip-progress-wrap">
          <div class="oro-tip-progress">
            <div class="oro-tip-progress-bar" style="--w:${metPct}%"></div>
          </div>
          <div class="oro-tip-progress-meta">
            <span class="oro-tip-progress-lbl">${st.met}<em>/4</em> criteri</span>
            <span class="oro-tip-dots">${criteriDots}</span>
          </div>
        </div>
        <div class="oro-tip-grid">
          <div class="oro-tip-stat">
            <span class="oro-tip-stat-ico">⏱</span>
            <span class="oro-tip-stat-num">${CS.fmtDurataCompatta(ore)}</span>
            <span class="oro-tip-stat-lbl">Ore</span>
          </div>
          <div class="oro-tip-stat">
            <span class="oro-tip-stat-ico">🥊</span>
            <span class="oro-tip-stat-num">${sess}</span>
            <span class="oro-tip-stat-lbl">Sessioni</span>
          </div>
          <div class="oro-tip-stat">
            <span class="oro-tip-stat-ico">🎯</span>
            <span class="oro-tip-stat-num">${tec}<em>/10</em></span>
            <span class="oro-tip-stat-lbl">Tecnica</span>
          </div>
          ${int ? `<div class="oro-tip-stat">
            <span class="oro-tip-stat-ico">🔥</span>
            <span class="oro-tip-stat-num">${int}<em>/10</em></span>
            <span class="oro-tip-stat-lbl">Intensità</span>
          </div>` : ''}
          ${aff ? `<div class="oro-tip-stat">
            <span class="oro-tip-stat-ico">⚡</span>
            <span class="oro-tip-stat-num">${aff}<em>/10</em></span>
            <span class="oro-tip-stat-lbl">Affatic.</span>
          </div>` : ''}
          ${km > 0 ? `<div class="oro-tip-stat">
            <span class="oro-tip-stat-ico">🏃</span>
            <span class="oro-tip-stat-num">${km.toFixed(1)}<em>km</em></span>
            <span class="oro-tip-stat-lbl">Corsa</span>
          </div>` : ''}
        </div>
        <div class="oro-tip-vol">
          <div class="oro-tip-vol-cell ${pctF >= 100 ? 'is-full' : ''}">
            <div class="oro-tip-vol-head"><span>💪</span><b>${fless}</b><em>/${tgtF}</em></div>
            <div class="oro-tip-vol-bar"><span style="--w:${pctF}%"></span></div>
            <div class="oro-tip-vol-lbl">Flessioni</div>
          </div>
          <div class="oro-tip-vol-cell ${pctS >= 100 ? 'is-full' : ''}">
            <div class="oro-tip-vol-head"><span>🦵</span><b>${squat}</b><em>/${tgtS}</em></div>
            <div class="oro-tip-vol-bar"><span style="--w:${pctS}%"></span></div>
            <div class="oro-tip-vol-lbl">Squat</div>
          </div>
          <div class="oro-tip-vol-cell ${pctA >= 100 ? 'is-full' : ''}">
            <div class="oro-tip-vol-head"><span>🔥</span><b>${addo}</b><em>/${tgtA}</em></div>
            <div class="oro-tip-vol-bar"><span style="--w:${pctA}%"></span></div>
            <div class="oro-tip-vol-lbl">Addo</div>
          </div>
        </div>
      </div>
    `;
  }

  // Render singola cella (button)
  function renderCell(date, opts) {
    const iso = isoOf(date);
    const st = computeCellState(iso);
    const isToday = iso === CS.todayISO();
    const selected = opts && opts.selectedIso === iso;
    const classes = [
      'oro-cell',
      `is-${st.state}`,
      isToday ? 'is-today' : '',
      selected ? 'is-selected' : '',
      st.hasRev ? 'has-rev' : '',
    ].filter(Boolean).join(' ');
    const ico = iconForState(st.state);
    // Icona badge in alto-destra (solo per stati con revisione), non oscura il numero centrale
    const badgeIco = (st.state !== 'empty') ? `<span class="oro-cell-badge">${ico}</span>` : '';
    return `
      <button class="${classes}" data-oro-date="${iso}" type="button">
        <span class="oro-cell-num">${date.getDate()}</span>
        ${badgeIco}
        ${renderCellTooltip(iso, st)}
      </button>
    `;
  }

  // Render calendario mini 7×6 per un mese
  // opts: { cursor: Date, selectedIso, readonly: bool }
  function renderCalendar(cursor, opts) {
    opts = opts || {};
    const days = monthDays(cursor);
    const monthLabel = MONTH_LABEL[cursor.getMonth()];
    const yearLabel = cursor.getFullYear();
    const offset = dayOfWeekMon0(days[0]);

    // Calcola giorni per settimana (righe): raggruppa in blocchi di 7 partendo dal lunedì
    // Prima riga: padding + prime giornate fino a domenica
    // Determina se una settimana intera è oro: prendiamo il lunedì di ogni riga e chiamiamo settimanaTopCheck
    const cellsHtml = [];
    let cellIdx = 0;
    // Padding iniziali
    for (let p = 0; p < offset; p++) {
      cellsHtml.push('<div class="oro-cell is-pad" aria-hidden="true"></div>');
    }
    days.forEach((d) => {
      cellsHtml.push(renderCell(d, opts));
      cellIdx++;
    });
    // Riempi ultima riga con pad per completare griglia 7-col (multipli di 7)
    const total = offset + days.length;
    const trailing = (7 - (total % 7)) % 7;
    for (let p = 0; p < trailing; p++) {
      cellsHtml.push('<div class="oro-cell is-pad" aria-hidden="true"></div>');
    }

    // Ring intorno a settimane d'oro: aggiungiamo un layer overlay per row
    // Usiamo dataset row-idx e in CSS/JS applichiamo classe
    // Trick: renderizziamo i giorni raggruppati per settimana come rows
    const rows = [];
    const flat = cellsHtml;
    for (let i = 0; i < flat.length; i += 7) {
      const rowCells = flat.slice(i, i + 7).join('');
      // Trova il primo giorno reale della riga (skippando pad) per stabilire la settimana
      let weekMonday = null;
      for (let j = i; j < i + 7 && j < flat.length; j++) {
        const cellIdxInMonth = j - offset;
        if (cellIdxInMonth >= 0 && cellIdxInMonth < days.length) {
          weekMonday = mondayOf(days[cellIdxInMonth]);
          break;
        }
      }
      let goldWeek = false;
      if (weekMonday) {
        goldWeek = CALC.settimanaTopCheck(weekMonday).gold;
      }
      rows.push(`<div class="oro-week-row ${goldWeek ? 'is-gold' : ''}">${rowCells}</div>`);
    }

    const nav = opts.readonly ? '' : `
      <button class="sess-month-nav" data-oro-nav="-1" aria-label="Mese precedente">←</button>
      <button class="sess-month-nav sess-month-today" data-oro-nav="today" title="Torna a oggi">OGGI</button>
      <button class="sess-month-nav" data-oro-nav="1" aria-label="Mese successivo">→</button>
    `;

    return `
      <div class="oro-cal-panel">
        <div class="oro-cal-header">
          ${opts.readonly ? '' : `<button class="sess-month-nav" data-oro-nav="-1" aria-label="Mese precedente">←</button>`}
          <div class="oro-cal-title">
            <span class="oro-cal-month">${monthLabel}</span>
            <span class="oro-cal-year">${yearLabel}</span>
          </div>
          ${opts.readonly ? '' : `
            <div class="oro-cal-nav-right">
              <button class="sess-month-nav" data-oro-nav="1" aria-label="Mese successivo">→</button>
              <button class="sess-month-nav sess-month-today" data-oro-nav="today" title="Torna a oggi">OGGI</button>
            </div>
          `}
        </div>
        <div class="oro-cal-weekdays">
          ${WD.map(w => `<div class="oro-cal-wd">${w}</div>`).join('')}
        </div>
        <div class="oro-cal-body" data-oro-grid>
          ${rows.join('')}
        </div>
        <div class="oro-legend">
          <span class="oro-legend-swatch is-empty"></span><span class="oro-legend-lbl">Vuoto</span>
          <span class="oro-legend-swatch is-red"></span><span class="oro-legend-lbl">Sotto</span>
          <span class="oro-legend-swatch is-orange"></span><span class="oro-legend-lbl">Parziale</span>
          <span class="oro-legend-swatch is-gold"></span><span class="oro-legend-lbl">Oro</span>
          <span class="oro-legend-swatch is-rest"></span><span class="oro-legend-lbl">Riposo</span>
          <span class="oro-legend-divider">·</span>
          <span class="oro-legend-swatch is-gold-week-mark"></span><span class="oro-legend-lbl">Settimana d'oro</span>
        </div>
      </div>
    `;
  }

  // Rings settimana/mese
  function renderRings(cursor) {
    const today = new Date();
    const wCheck = CALC.settimanaTopCheck(today);
    const mCheck = CALC.meseTopCheck(cursor);
    const wPct = wCheck.criteri.length ? Math.round((wCheck.met / wCheck.criteri.length) * 100) : 0;
    const mPct = mCheck.settTotal ? Math.round((mCheck.settTop / (CS.state.criteriOro?.mese?.settimaneTop || 3)) * 100) : 0;
    // Conta giornate d'oro nel mese cursor
    const mKey = CS.monthKey(cursor);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    let goldDaysInMonth = 0;
    (CS.state.revisioni || []).forEach(r => {
      if (r.data && r.data.startsWith(mKey)) {
        if (CALC.giornataOroCheck(r.data).gold) goldDaysInMonth++;
      }
    });
    return `
      <div class="oro-rings-panel" id="oro-rings">
        <div class="oro-ring-box ${wCheck.gold ? 'is-gold' : ''}">
          <div class="oro-ring-left">
            <div class="oro-ring-host" data-ring-pct="${wPct}" data-ring-gold="${wCheck.gold ? '1' : '0'}"></div>
            <div class="oro-ring-lbl">SETTIMANA</div>
            <div class="oro-ring-sub">${wCheck.met}<em>/${wCheck.criteri.length}</em> criteri</div>
          </div>
          <ul class="oro-ring-criteria">
            ${wCheck.criteri.map(x => `
              <li class="${x.met ? 'is-met' : ''}">
                <span class="oro-crit-ico">${x.met ? '✓' : '○'}</span>
                <span class="oro-crit-lbl">${x.label}</span>
                <span class="oro-crit-val">${x.val}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        <div class="oro-ring-box ${mCheck.gold ? 'is-gold' : ''}">
          <div class="oro-ring-left">
            <div class="oro-ring-host" data-ring-pct="${mPct}" data-ring-gold="${mCheck.gold ? '1' : '0'}"></div>
            <div class="oro-ring-lbl">MESE</div>
            <div class="oro-ring-sub">${mCheck.settTop}<em>/${CS.state.criteriOro?.mese?.settimaneTop || 3}</em> sett. d'oro</div>
          </div>
          <ul class="oro-ring-criteria">
            <li class="${mCheck.gold ? 'is-met' : ''}">
              <span class="oro-crit-ico">${mCheck.gold ? '✓' : '○'}</span>
              <span class="oro-crit-lbl">Settimane d'oro raggiunte</span>
              <span class="oro-crit-val">${mCheck.settTop}/${mCheck.settTotal}</span>
            </li>
            <li class="${goldDaysInMonth > 0 ? 'is-met' : ''}">
              <span class="oro-crit-ico">${goldDaysInMonth > 0 ? '★' : '○'}</span>
              <span class="oro-crit-lbl">Giornate d'oro nel mese</span>
              <span class="oro-crit-val">${goldDaysInMonth}/${daysInMonth}</span>
            </li>
          </ul>
        </div>
      </div>
    `;
  }

  // Anima i ring dopo il mount
  function animateRings(root) {
    (root || document).querySelectorAll('.oro-ring-host').forEach(host => {
      const pct = Number(host.dataset.ringPct) || 0;
      const gold = host.dataset.ringGold === '1';
      const isEmpty = pct === 0;
      const numColor = gold ? '#FFE600' : (isEmpty ? 'var(--muted)' : 'var(--text)');
      FX.ringProgress(host, pct, {
        size: 108,
        stroke: 8,
        color: gold ? '#FFE600' : '#00FFC8',
        trackColor: 'rgba(255,255,255,0.05)',
        center: `
          <div class="oro-ring-center">
            <span class="oro-ring-center-num" style="color:${numColor}">${pct}</span>
            <span class="oro-ring-center-unit">%</span>
          </div>
        `,
      });
    });
  }

  // Detail panel per un giorno
  function renderDetail(dateIso) {
    const st = computeCellState(dateIso);
    const rev = CS.state.revisioni.find(r => r.data === dateIso);
    const d = new Date(dateIso);
    const weekday = ['DOMENICA','LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ','SABATO'][d.getDay()];
    const dNum = d.getDate();
    const mLbl = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'][d.getMonth()];
    const yLbl = d.getFullYear();
    const badgeCls = `oro-detail-badge is-${st.state}`;
    const badgeTxt = labelForState(st.state);
    const criteri = st.criteri || [];
    const metPct = criteri.length ? (st.met / criteri.length) * 100 : 0;

    // Head hero
    const hero = `
      <div class="oro-detail-hero is-${st.state}">
        <button class="oro-detail-close" data-oro-detail-close aria-label="Chiudi">×</button>
        <div class="oro-detail-hero-top">
          <div class="oro-detail-hero-wd">${weekday}</div>
          <div class="${badgeCls}">${badgeTxt}</div>
        </div>
        <div class="oro-detail-hero-date">
          <span class="oro-detail-hero-num">${dNum}</span>
          <div class="oro-detail-hero-my">
            <span class="oro-detail-hero-m">${mLbl}</span>
            <span class="oro-detail-hero-y">${yLbl}</span>
          </div>
        </div>
        ${criteri.length ? `
          <div class="oro-detail-hero-progress-wrap">
            <div class="oro-detail-hero-progress-title">PROGRESSO GIORNATA D'ORO</div>
            <div class="oro-detail-hero-progress">
              <div class="oro-detail-hero-progress-bar"><span style="--w:${metPct}%"></span></div>
              <span class="oro-detail-hero-progress-lbl">${st.met}/${criteri.length} criteri raggiunti</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Criteri con barra visiva per criterio
    const critList = criteri.length ? `
      <div class="oro-detail-section">
        <div class="oro-detail-section-title">CRITERI GIORNATA D'ORO</div>
        <ul class="oro-detail-criteria">
          ${criteri.map(x => {
            let pct = 0;
            if (typeof x.cur === 'number' && typeof x.tgt === 'number' && x.tgt > 0) {
              pct = Math.min(100, (x.cur / x.tgt) * 100);
            } else if (x.met) pct = 100;
            return `
              <li class="${x.met ? 'is-met' : 'is-miss'}">
                <div class="oro-crit-head">
                  <span class="oro-crit-ico">${x.met ? '✓' : '○'}</span>
                  <span class="oro-crit-lbl">${x.label}</span>
                  <span class="oro-crit-val">${x.cur} <em>/ ${x.tgt}</em></span>
                </div>
                <div class="oro-crit-bar"><span style="--w:${pct}%"></span></div>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    ` : '<div class="oro-detail-empty">Nessuna revisione salvata per questo giorno.<br><span>Compila la revisione per vedere il progresso.</span></div>';

    // Metriche complete
    const metrics = rev ? `
      <div class="oro-detail-section">
        <div class="oro-detail-section-title">METRICHE DEL GIORNO</div>
        <div class="oro-detail-metrics">
          <div class="oro-metric"><span class="oro-metric-ico">⏱</span><span class="oro-metric-k">Allenamento</span><span class="oro-metric-v">${CS.fmtDurataCompatta(Number(rev.oreAllenamento) || 0)}</span></div>
          <div class="oro-metric"><span class="oro-metric-ico">🥊</span><span class="oro-metric-k">Sessioni</span><span class="oro-metric-v">${rev.sessioniGiorno || (rev.dettagliSessioni?.length || 0)}</span></div>
          <div class="oro-metric"><span class="oro-metric-ico">🎯</span><span class="oro-metric-k">Tecnica</span><span class="oro-metric-v">${rev.tecnica || '—'}<em>/10</em></span></div>
          ${rev.intensita ? `<div class="oro-metric"><span class="oro-metric-ico">🔥</span><span class="oro-metric-k">Intensità</span><span class="oro-metric-v">${rev.intensita}<em>/10</em></span></div>` : ''}
          ${rev.affaticamento ? `<div class="oro-metric"><span class="oro-metric-ico">⚡</span><span class="oro-metric-k">Affaticamento</span><span class="oro-metric-v">${rev.affaticamento}<em>/10</em></span></div>` : ''}
          ${rev.sonnoOre ? `<div class="oro-metric"><span class="oro-metric-ico">😴</span><span class="oro-metric-k">Sonno</span><span class="oro-metric-v">${CS.fmtDurataCompatta(rev.sonnoOre)}</span></div>` : ''}
        </div>
        <div class="oro-detail-volumes">
          <div class="oro-vol-cell"><b>${rev.flessioni || 0}</b><span>flessioni</span></div>
          <div class="oro-vol-cell"><b>${rev.squat || 0}</b><span>squat</span></div>
          <div class="oro-vol-cell"><b>${rev.addominali || 0}</b><span>addo</span></div>
          ${Number(rev.kmCorsa) > 0 ? `<div class="oro-vol-cell"><b>${Number(rev.kmCorsa).toFixed(1)}</b><span>km corsa</span></div>` : ''}
        </div>
        ${(rev.bene || rev.migliora) ? `
          <div class="oro-detail-notes">
            ${rev.bene ? `<div class="oro-note is-good"><span class="oro-note-lbl">✓ ANDATO BENE</span><p>${escapeHtml(rev.bene)}</p></div>` : ''}
            ${rev.migliora ? `<div class="oro-note is-improve"><span class="oro-note-lbl">↑ DA MIGLIORARE</span><p>${escapeHtml(rev.migliora)}</p></div>` : ''}
          </div>
        ` : ''}
      </div>
    ` : '';

    return `
      ${hero}
      <div class="oro-detail-body">
        ${critList}
        ${metrics}
      </div>
      <div class="oro-detail-foot">
        <button class="btn-cta oro-detail-cta" data-oro-open-rev="${dateIso}">
          ${rev ? '✎  MODIFICA REVISIONE' : '+  COMPILA REVISIONE'}
        </button>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return {
    computeCellState,
    renderCell,
    renderCalendar,
    renderRings,
    animateRings,
    renderDetail,
    iconForState,
    labelForState,
    colorForState,
    isoOf,
    monthDays,
    mondayOf,
    dayOfWeekMon0,
  };
})();
