/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — UI ASSISTENTE
   Riscritto 2026-06-22 (rivoluzione)
   4 route: assistente/coach · assistente/nutrizione · assistente/mentale · assistente/recupero
   ═══════════════════════════════════════════════════════ */

const ASSISTANT_UI = (function () {

  // I sub-id del router sono in inglese? No, in router.js sono:
  //   assistente: ['coach','nutrizione','mentale','recupero']
  // PERSONA_LABEL usa la stessa chiave. OK.

  // ─── RENDER PAGINA PERSONA ──────────────────────────
  function renderPersona(persona) {
    // Forza evaluate prima
    ASSISTANT.evaluate();
    const msgs = ASSISTANT.byPersona(persona);
    const counts = ASSISTANT.counts();
    const label = PERSONA_LABEL[persona] || persona.toUpperCase();
    const icon  = PERSONA_ICON[persona]  || '·';
    const intro = PERSONA_INTRO[persona] || '';

    const headerHTML = `
      <div class="asst-header">
        <div class="asst-header-id">
          <span class="asst-header-icon">${icon}</span>
          <div>
            <h1 class="page-title">${label.slice(0, -4)}<span class="accent">${label.slice(-4)}</span></h1>
            <div class="page-sub">${intro}</div>
          </div>
        </div>
        ${renderPersonaSwitcher(persona, counts)}
      </div>
    `;

    const messagesHTML = msgs.length
      ? `<div class="asst-messages">${msgs.map(m => renderMessageCard(m)).join('')}</div>`
      : `<div class="panel asst-empty">
           <div class="empty-ico">🧘</div>
           <div class="empty-text">Nessun alert da ${label}. Procedi come stai facendo.</div>
         </div>`;

    const historyHTML = renderRecentHistory(persona);

    return headerHTML + renderQuickBar() + renderBriefing() + messagesHTML + historyHTML;
  }

  // Barra d'ingresso in linguaggio naturale: è il punto in cui l'assistente
  // smette di parlare soltanto e comincia a registrare quello che gli dici.
  function renderQuickBar() {
    if (typeof INBOX === 'undefined') return '';
    const n = INBOX.count();
    return `
      <button class="ib-quickbar" id="asst-quickbar">
        <span class="ib-quickbar-ico">🎙</span>
        <span class="ib-quickbar-lbl">Dimmi cosa hai fatto — lo registro io</span>
        <span class="ib-quickbar-kbd">CTRL+I</span>
      </button>
      ${n ? `<button class="ib-quickbar" id="asst-inbox" style="border-color:var(--danger)">
        <span class="ib-quickbar-ico">📱</span>
        <span class="ib-quickbar-lbl">${n} ${n === 1 ? 'messaggio' : 'messaggi'} dal telefono in attesa</span>
        <span class="ib-quickbar-kbd">APRI</span>
      </button>` : ''}
    `;
  }

  // ─── IL PUNTO — briefing del secondo cervello ───────
  function renderBriefing() {
    const b = ASSISTANT.getBriefing ? ASSISTANT.getBriefing() : null;
    if (!b) return '';
    const chips = (b.chips || []).map((c, i) => `
      <span class="brief-chip ${c.gold ? 'is-gold' : ''} ${c.dir ? 'dir-' + c.dir : ''}" style="--i:${i}">
        <span class="brief-chip-k">${c.k}</span><span class="brief-chip-v">${escapeHtml(c.v)}</span>
      </span>`).join('');
    const rischio = b.rischio
      ? `<div class="brief-line brief-rischio"><span class="brief-dot"></span><span>${escapeHtml(b.rischio)}</span></div>`
      : '';
    return `
      <div class="panel brief-strip brief-strip-full brief-sev-${b.topSeverity}">
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
            <span class="brief-ico">${b.topIcon}</span><span>${escapeHtml(b.direzione)}</span>
          </div>
          ${rischio}
        </div>
      </div>`;
  }

  function initBriefRing() {
    const host = document.querySelector('[data-brief-ring]');
    const b = ASSISTANT.getBriefing ? ASSISTANT.getBriefing() : null;
    if (!host || !b || b.weekPct == null || typeof FX === "undefined" || !FX.ringProgress) return;
    const color = b.weekPct >= 100 ? 'var(--ok)' : 'var(--neon)';
    FX.ringProgress(host, Math.min(100, b.weekPct), {
      size: 62, stroke: 5, color, center: `${b.weekPct}%`,
      trackColor: 'rgba(255,255,255,0.06)',
    });
  }

  function renderPersonaSwitcher(current, counts) {
    const personas = ['coach', 'nutrizione', 'mentale', 'recupero'];
    const chips = personas.map(p => {
      const ic = PERSONA_ICON[p];
      const lbl = PERSONA_LABEL[p];
      const n = counts[p] || 0;
      const cls = p === current ? 'active' : '';
      const badge = n > 0 ? `<span class="asst-chip-badge">${n}</span>` : '';
      return `<button class="asst-chip ${cls}" data-go-persona="${p}">
        <span>${ic}</span><span>${lbl}</span>${badge}
      </button>`;
    }).join('');
    return `<div class="asst-chips">${chips}</div>`;
  }

  function renderMessageCard(m) {
    const sevLbl = { critica: 'CRITICO', attenzione: 'ATTENZIONE', positivo: 'POSITIVO', info: 'INFO' };
    const answers = (m.answers || []).map((a, i) => `
      <button class="asst-answer" data-rule="${m.id}" data-action="${a.action}" data-idx="${i}">
        ${escapeHtml(a.label)}
      </button>
    `).join('');
    const cta = m.cta && !m.answers ? `
      <button class="asst-answer asst-cta" data-rule="${m.id}" data-action="goto:${m.cta.route}">
        ${escapeHtml(m.cta.label)}
      </button>
    ` : '';

    return `
      <div class="asst-msg asst-sev-${m.severity}">
        <div class="asst-msg-bar"></div>
        <div class="asst-msg-body">
          <div class="asst-msg-meta">
            <span class="asst-msg-sev">${sevLbl[m.severity]}</span>
            <button class="asst-snooze-mini" data-rule="${m.id}" data-action="snooze:1d" title="silenzia 1 giorno">⏱</button>
          </div>
          <div class="asst-msg-text">${escapeHtml(m.text)}</div>
          ${m.question ? `<div class="asst-msg-question">${escapeHtml(m.question)}</div>` : ''}
          ${(answers || cta) ? `<div class="asst-msg-answers">${answers}${cta}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderRecentHistory(persona) {
    const hist = (CS.state.assistantHistory || [])
      .filter(h => h.persona === persona)
      .slice(-6).reverse();
    if (!hist.length) return '';
    const items = hist.map(h => {
      const date = new Date(h.data);
      const dateStr = `${date.getDate()}/${date.getMonth() + 1} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      return `<div class="asst-hist-row">
        <span class="asst-hist-date">${dateStr}</span>
        <span class="asst-hist-msg">${escapeHtml((h.messaggio || '').slice(0, 80))}</span>
        <span class="asst-hist-act">${escapeHtml(h.scelta || h.azione || '')}</span>
      </div>`;
    }).join('');
    return `
      <div class="panel" style="margin-top:var(--sp-5)">
        <div class="panel-title">CRONOLOGIA RISPOSTE</div>
        <div class="asst-hist">${items}</div>
      </div>
    `;
  }

  // ─── AFTER RENDER (attach event listeners) ──────────
  function afterPersona() {
    initBriefRing();
    document.getElementById('asst-quickbar')?.addEventListener('click', () => INBOX.capture());
    document.getElementById('asst-inbox')?.addEventListener('click', () => INBOX.open());
    // Switch persona
    document.querySelectorAll('[data-go-persona]').forEach(btn => {
      btn.addEventListener('click', () => {
        ROUTER.go('assistente', btn.dataset.goPersona);
      });
    });

    // Click su risposta preset
    document.querySelectorAll('.asst-answer, .asst-snooze-mini').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ruleId = btn.dataset.rule;
        const action = btn.dataset.action;
        const label = btn.textContent.trim();
        ASSISTANT.handleAction(ruleId, action, label);
      });
    });
  }

  // ─── WIDGET CONTESTUALE (chiamabile dalle pagine) ──
  // Esempio: const html = ASSISTANT_UI.renderContextual('fisica/peso');
  function renderContextual(pageKey, opts = {}) {
    ASSISTANT.evaluate();
    const msgs = ASSISTANT.byPage(pageKey);
    if (!msgs.length) return '';
    const limit = opts.limit || 2;
    const items = msgs.slice(0, limit).map(m => {
      const icon = m.icon;
      return `
        <div class="asst-ctx-item asst-sev-${m.severity}">
          <span class="asst-ctx-icon">${icon}</span>
          <span class="asst-ctx-text">${escapeHtml(m.text)}</span>
          <button class="asst-ctx-go" data-go-asst="${m.persona}">→</button>
        </div>
      `;
    }).join('');
    return `
      <div class="asst-ctx">
        <div class="asst-ctx-head">
          <span class="asst-ctx-label">ASSISTENTE</span>
          <span class="asst-ctx-count">${msgs.length} alert</span>
        </div>
        <div class="asst-ctx-list">${items}</div>
      </div>
    `;
  }

  function attachContextual(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-go-asst]').forEach(btn => {
      btn.addEventListener('click', () => {
        ROUTER.go('assistente', btn.dataset.goAsst);
      });
    });
  }

  // ─── INIT (registra route) ──────────────────────────
  function init() {
    if (typeof ROUTER === 'undefined') return;
    ROUTER.register('assistente/coach',      () => renderPersona('coach'),      afterPersona);
    ROUTER.register('assistente/nutrizione', () => renderPersona('nutrizione'), afterPersona);
    ROUTER.register('assistente/mentale',    () => renderPersona('mentale'),    afterPersona);
    ROUTER.register('assistente/recupero',   () => renderPersona('recupero'),   afterPersona);
  }

  // ─── helpers ────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return { init, renderPersona, renderContextual, attachContextual };

})();

document.addEventListener('DOMContentLoaded', () => ASSISTANT_UI.init());
