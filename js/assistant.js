/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — ASSISTENTE ENGINE
   Riscritto 2026-06-22 (rivoluzione)
   - filtra regole per persona / per pagina contestuale
   - sistema conversazionale: gestisce azioni cliccabili
   - dot globale sulla topbar
   ═══════════════════════════════════════════════════════ */

const ASSISTANT = (function () {

  const SEVERITY_RANK = { critica: 4, attenzione: 3, positivo: 2, info: 1 };
  const SEVERITY_DOT  = { critica: 'danger', attenzione: 'warn', positivo: 'ok', info: 'info' };

  // Regole che SPINGONO carico/volume: vengono soppresse quando il Recupero
  // emette una critica (il secondo cervello non si contraddice).
  const PUSH_RULES = new Set([
    'coach_streak_alto', 'coach_ore_sett_basse', 'coach_sett_oro_vicina',
    'coach_volume_volumi', 'mentale_mood_top_streak',
    'coach_oro_chiudibile', 'coach_streak_rischio',
  ]);

  let activeMessages = [];
  let briefing = null;

  // ─── EVALUATE v2 ────────────────────────────────────
  // 1. Contesto unico  2. condizioni  3. cooldown da memoria
  // 4. score composito 5. conflitti   6. briefing
  function evaluate() {
    const C = ASSISTANT_CTX.build();

    let msgs = ASSISTANT_RULES
      .filter(rule => {
        if (CS.isRuleSnoozed && CS.isRuleSnoozed(rule.id)) return false;
        if (C.memory.isCoolingDown(rule.id, rule.cooldownDays || 2)) return false;
        try { return rule.condition(C); }
        catch (e) { console.warn('[ASSISTANT] rule fail:', rule.id, e); return false; }
      })
      .map(rule => buildMessage(rule, C))
      .filter(m => m.text);

    // ── Conflitti: critica di recupero attiva → giù le regole "push" ──
    const scarico = msgs.some(m => m.persona === 'recupero' && m.severity === 'critica');
    if (scarico) msgs = msgs.filter(m => !PUSH_RULES.has(m.id));

    // ── Score composito ──
    const page = currentPageKey();
    msgs.forEach(m => { m.score = scoreMessage(m, C, page); });
    msgs.sort((a, b) => b.score - a.score);

    activeMessages = msgs;
    briefing = buildBriefing(C, msgs);
    updateGlobalDot();
    return activeMessages;
  }

  function currentPageKey() {
    try {
      const r = ROUTER.current();
      return r.sub ? `${r.section}/${r.sub}` : r.section;
    } catch (e) { return ''; }
  }

  // severity domina, poi: pertinenza pagina, pertinenza oraria (se la regola
  // dichiara `time`), engagement appreso dalle risposte passate.
  function scoreMessage(m, C, page) {
    let s = SEVERITY_RANK[m.severity] * 100;
    if (page && (m.pages || []).some(p => p === page || page.startsWith(p + '/'))) s += 30;
    if (m.time) s += (m.time === C.time.fascia) ? 25 : -35;
    s += C.memory.engagement(m.id);
    return s;
  }

  function buildMessage(rule, C) {
    return {
      id:       rule.id,
      persona:  rule.persona,
      icon:     rule.icon,
      severity: rule.severity,
      pages:    rule.pages || [],
      time:     rule.time || null,
      text:     safeCall(rule.message, C),
      question: rule.question ? safeCall(rule.question, C) : null,
      answers:  rule.answers  ? safeCall(rule.answers, C)  : null,
      cta:      rule.cta || null,
      timestamp: Date.now(),
    };
  }

  function safeCall(fn, C) {
    try { return fn(C); } catch (e) { return ''; }
  }

  // ─── BRIEFING "IL PUNTO" ────────────────────────────
  // Tre righe dai dati: STATO (dove sei) · DIREZIONE (il focus scelto
  // dallo score) · RISCHIO (solo se esiste). Zero motivazione, solo fatti.
  function buildBriefing(C, msgs) {
    // STATO — chips strutturate (renderizzate come pill dal layer UI)
    const chips = [];
    const ot = C.state.oreVsTarget;
    if (ot) chips.push({ k: 'SETT', v: `${CS.fmtDurataCompatta(ot.ore)}/${CS.fmtDurataCompatta(ot.target)}` });
    if (C.state.sett) chips.push({ k: 'ORO', v: `${C.state.sett.met}/${C.state.sett.criteri.length}`, gold: C.state.sett.met >= 4 });
    if (C.state.streak > 0) chips.push({ k: 'STREAK', v: `${C.state.streak}g` });
    if (C.state.pesoCurrent) {
      let v = `${C.state.pesoCurrent.toFixed(1)}kg`;
      let dir = null;
      if (C.trends.pesoKgSett != null && Math.abs(C.trends.pesoKgSett) >= 0.1) {
        dir = C.trends.pesoKgSett < 0 ? 'down' : 'up';
        v += ` ${C.trends.pesoKgSett < 0 ? '↓' : '↑'}${Math.abs(C.trends.pesoKgSett).toFixed(1)}`;
      }
      chips.push({ k: 'PESO', v, dir });
    }
    const stato = chips.map(c => `${c.v}`).join(' · ') || 'Nessun dato recente: compila la revisione.';

    // DIREZIONE — il messaggio col punteggio più alto (non-positivo se possibile)
    const top = msgs.find(m => m.severity !== 'positivo') || msgs[0] || null;
    let direzione;
    if (top) {
      direzione = top.text;
    } else if (C.time.fascia === 'sera' && C.gaps.revisione !== 0) {
      direzione = 'Giornata pulita. Chiudila: compila la revisione di oggi.';
    } else if (C.time.fascia === 'mattina') {
      direzione = C.state.settMancanti.length
        ? `Oggi lavora su: ${C.state.settMancanti[0].label.toLowerCase()} (${C.state.settMancanti[0].val}).`
        : 'Nessun alert. Segui il piano.';
    } else {
      direzione = 'Nessun alert. Segui il piano.';
    }

    // RISCHIO — solo se reale
    let rischio = null;
    const crit = msgs.find(m => m.severity === 'critica');
    if (crit && crit !== top) rischio = crit.text;
    else if (!crit && C.load.acwr != null && C.load.acwr >= 1.3 && C.load.acwr < 1.5) {
      rischio = `Carico in salita rapida (${C.load.acwr.toFixed(1)}× il tuo cronico): monitora il recupero.`;
    }
    if (!rischio && C.time.nextEvent && C.time.nextEvent.giorni <= 21) {
      rischio = `${(C.time.nextEvent.titolo || C.time.nextEvent.tipo || 'Evento').toUpperCase()} tra ${C.time.nextEvent.giorni} giorni.`;
    }

    return {
      stato, chips, direzione, rischio,
      topId: top ? top.id : null,
      topIcon: top ? top.icon : '🧠',
      topSeverity: top ? top.severity : 'info',
      weekPct: ot ? Math.round(ot.pct) : null,
      fascia: C.time.fascia,
    };
  }

  // ─── FILTRI ─────────────────────────────────────────
  function byPersona(persona) {
    return activeMessages.filter(m => m.persona === persona);
  }
  function byPage(pageKey) {
    // pageKey es. 'dashboard' o 'fisica/peso'
    return activeMessages.filter(m =>
      (m.pages || []).some(p => p === pageKey || pageKey.startsWith(p + '/')));
  }
  function counts() {
    const c = { coach: 0, nutrizione: 0, mentale: 0, recupero: 0,
                critica: 0, attenzione: 0, positivo: 0, info: 0 };
    activeMessages.forEach(m => { c[m.persona]++; c[m.severity]++; });
    return c;
  }

  // ─── DOT GLOBALE topbar ─────────────────────────────
  function updateGlobalDot() {
    const widget = document.getElementById('assistant-widget');
    if (!widget) return;
    const dot = widget.querySelector('.assistant-dot');
    if (!dot) return;
    const top = activeMessages[0];
    dot.dataset.state = top ? SEVERITY_DOT[top.severity] : 'ok';
    widget.classList.toggle('alert', activeMessages.some(m => m.severity === 'critica'));
    // Badge count critiche+attenzione
    const urgent = activeMessages.filter(m => m.severity === 'critica' || m.severity === 'attenzione').length;
    let badge = widget.querySelector('.assistant-badge');
    if (urgent > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'assistant-badge';
        widget.appendChild(badge);
      }
      badge.textContent = urgent;
    } else if (badge) {
      badge.remove();
    }
  }

  // ─── HANDLE ACTION (click su risposta preset) ──────
  // action format:
  //   'goto:section/sub' — naviga
  //   'snooze:1d|3d|7d'  — silenzia regola
  //   'ack'              — solo log
  //   'modal:nomeModale' — apre modale handler
  function handleAction(ruleId, action, label) {
    const msg = activeMessages.find(m => m.id === ruleId);
    if (!msg) return;

    if (action.startsWith('goto:')) {
      const target = action.slice(5);
      const [sec, sub] = target.split('/');
      CS.logAssistantInteraction({
        ruleId, persona: msg.persona, messaggio: msg.text,
        scelta: label, azione: 'goto:' + target,
      });
      ROUTER.go(sec, sub);
      return;
    }
    if (action.startsWith('snooze:')) {
      const dur = action.slice(7);
      const days = { '1d': 1, '3d': 3, '7d': 7 }[dur] || 1;
      const until = new Date(); until.setDate(until.getDate() + days);
      CS.snoozeRule(ruleId, until.toISOString());
      CS.logAssistantInteraction({
        ruleId, persona: msg.persona, messaggio: msg.text,
        scelta: label, azione: 'snooze:' + dur,
      });
      UI.toast(`Silenziato per ${dur}`, 'ok');
      evaluate();
      // Re-render pagina assistente se aperta
      if (ROUTER.current().section === 'assistente') {
        ROUTER.go('assistente', ROUTER.current().sub);
      }
      return;
    }
    if (action === 'ack') {
      CS.logAssistantInteraction({
        ruleId, persona: msg.persona, messaggio: msg.text,
        scelta: label, azione: 'ack',
      });
      UI.toast('Annotato', 'ok');
      // ack non snooza ma toglie dalla lista UI corrente
      activeMessages = activeMessages.filter(m => m.id !== ruleId);
      updateGlobalDot();
      if (ROUTER.current().section === 'assistente') {
        ROUTER.go('assistente', ROUTER.current().sub);
      }
      return;
    }
    if (action.startsWith('modal:')) {
      const name = action.slice(6);
      openHandlerModal(name, msg);
      CS.logAssistantInteraction({
        ruleId, persona: msg.persona, messaggio: msg.text,
        scelta: label, azione: 'modal:' + name,
      });
      return;
    }
  }

  // ─── MODAL HANDLERS (richiamati da 'modal:xxx') ────
  function openHandlerModal(name, msg) {
    if (name === 'targetSettUp') {
      const cur = (CS.state.targetSett && CS.state.targetSett.oreAllenamento) || 14;
      const m = UI.modal(`
        <h2 class="modal-title">ALZA TARGET SETTIMANALE</h2>
        <form id="tg-form">
          <div class="field"><label class="field-label">Ore allenamento /sett</label>
            <input class="input" type="number" name="ore" step="0.5" value="${cur + 1}" required></div>
          <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
            <button type="button" class="btn ghost" data-close>ANNULLA</button>
            <button type="submit" class="btn primary">SALVA</button>
          </div>
        </form>`);
      m.el.querySelector('#tg-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const ore = Number(new FormData(e.target).get('ore')) || cur;
        CS.state.targetSett.oreAllenamento = ore;
        CS.save();
        m.close();
        UI.toast(`Target ${CS.fmtDurata(ore)} a settimana`, 'ok');
        evaluate();
      });
      return;
    }
    if (name === 'targetSettDown') {
      const cur = (CS.state.targetSett && CS.state.targetSett.oreAllenamento) || 14;
      const newT = Math.max(4, cur - 1);
      if (confirm(`Abbassare target settimanale da ${cur}h a ${newT}h?`)) {
        CS.state.targetSett.oreAllenamento = newT;
        CS.save();
        UI.toast(`Target ${newT}h/sett`, 'ok');
        evaluate();
      }
      return;
    }
    if (name === 'planRest') {
      // Crea revisione "riposo" per oggi
      const today = CS.todayISO();
      const existing = CS.getRevByDate(today);
      if (existing && existing.riposo) {
        UI.toast('Già impostato riposo', 'ok'); return;
      }
      if (confirm('Segnare OGGI come giorno di riposo?')) {
        CS.addRevisione({
          data: today, riposo: true, oreAllenamento: 0,
          note: 'Pianificato dall\'assistente',
        });
        UI.toast('Riposo pianificato', 'ok');
        evaluate();
      }
      return;
    }
    if (name === 'planLight') {
      const today = CS.todayISO();
      if (confirm('Segnare OGGI come giorno leggero (max 1h)?')) {
        const existing = CS.getRevByDate(today) || {};
        CS.addRevisione(Object.assign(existing, {
          data: today, riposo: false, oreAllenamento: 1,
          note: (existing.note || '') + ' [giorno leggero pianificato]',
        }));
        UI.toast('Giorno leggero', 'ok');
        evaluate();
      }
      return;
    }
    if (name === 'setGoalPace') {
      const cur = (CS.state.goalPace && CS.state.goalPace.dataTarget) || '';
      const m = UI.modal(`
        <h2 class="modal-title">DATA TARGET PESO</h2>
        <form id="gp-form">
          <div class="field"><label class="field-label">Voglio essere a ${CS.state.profile.pesoTarget}kg entro:</label>
            <input class="input" type="date" name="data" value="${cur}" required></div>
          <div class="row" style="justify-content:flex-end;gap:var(--sp-2)">
            <button type="button" class="btn ghost" data-close>ANNULLA</button>
            <button type="submit" class="btn primary">SALVA</button>
          </div>
        </form>`);
      m.el.querySelector('#gp-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = new FormData(e.target).get('data');
        CS.setGoalPace({ dataTarget: d });
        m.close();
        UI.toast('Data target aggiornata', 'ok');
        evaluate();
      });
      return;
    }
    if (name === 'closeInjury') {
      const inf = (CS.state.infortuni || []).find(i => !i.dataFine);
      if (!inf) { UI.toast('Nessun infortunio attivo', 'ok'); return; }
      if (confirm(`Chiudere infortunio a "${inf.parte}" come RISOLTO?`)) {
        CS.updateInfortunio(inf.id, { dataFine: CS.todayISO() });
        UI.toast('Infortunio chiuso', 'ok');
        evaluate();
      }
      return;
    }
    if (name === 'openRevDaily') {
      if (typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily) {
        REV_FORMS.openDaily();
      } else {
        ROUTER.go('archivio', 'revisioni');
      }
      return;
    }
    console.warn('[ASSISTANT] modal handler non implementato:', name);
  }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    // Click sull'orb topbar → vai alla pagina assistente
    const widget = document.getElementById('assistant-widget');
    widget?.addEventListener('click', () => {
      ROUTER.go('assistente');
    });

    BUS.on('cs:rev-saved',    evaluate);
    BUS.on('cs:weight-saved', evaluate);
    BUS.on('route:change',    evaluate);

    evaluate();
  }

  return {
    init, evaluate,
    getMessages: () => activeMessages,
    getBriefing: () => briefing || (evaluate(), briefing),
    byPersona, byPage, counts,
    handleAction, openHandlerModal,
  };

})();
