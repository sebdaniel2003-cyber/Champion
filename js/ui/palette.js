/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — PALETTE COMANDI (Ctrl+K)
   ═══════════════════════════════════════════════════════
   Il sistema ha 6 sezioni × fino a 6 sub-tab più una dozzina
   di azioni: raggiungerle a click costa 2-3 passaggi. Qui si
   arriva ovunque scrivendo due lettere.

   Match "fuzzy" a sottosequenza (jb → JAB, arfi → ARCHIVIO
   FISICA) con punteggio: match consecutivi e a inizio parola
   pesano di più, così i risultati ovvi restano in cima.
   ═══════════════════════════════════════════════════════ */

const PALETTE = (function () {

  let overlay = null;
  let items = [];
  let filtered = [];
  let cursor = 0;

  // ─── COSTRUZIONE COMANDI ────────────────────────────
  function buildItems() {
    const out = [];

    // Navigazione: ogni sezione e ogni sua sub-tab
    const S = ROUTER.sections || {};
    for (const [id, sec] of Object.entries(S)) {
      if (!sec.subs || !sec.subs.length) {
        out.push({ grp: 'VAI A', label: sec.label, ico: '→', run: () => ROUTER.go(id) });
      } else {
        for (const sub of sec.subs) {
          out.push({
            grp: 'VAI A', label: `${sec.label} · ${sub.label}`, ico: '→',
            run: () => ROUTER.go(id, sub.id),
          });
        }
      }
    }

    // Azioni rapide
    if (typeof INBOX !== 'undefined') {
      out.push({ grp: 'AZIONE', label: 'Dimmi cosa hai fatto', ico: '🎙',
        hint: 'registra parlando in italiano', run: () => INBOX.capture() });
      const n = INBOX.count();
      out.push({ grp: 'AZIONE', label: 'Casella di posta dal telefono', ico: '📱',
        hint: n ? `${n} in attesa` : 'vuota', run: () => INBOX.open() });
    }
    out.push({ grp: 'AZIONE', label: 'Compila revisione di oggi', ico: '✎', hint: 'giornaliera',
      run: () => typeof REV_FORMS !== 'undefined' && REV_FORMS.openDaily() });
    out.push({ grp: 'AZIONE', label: 'Compila revisione settimanale', ico: '✎',
      run: () => typeof REV_FORMS !== 'undefined' && REV_FORMS.openWeekly() });
    out.push({ grp: 'AZIONE', label: 'Compila revisione mensile', ico: '✎',
      run: () => typeof REV_FORMS !== 'undefined' && REV_FORMS.openMonthly() });
    out.push({ grp: 'AZIONE', label: 'Impostazioni', ico: '⚙',
      run: () => typeof SETTINGS_UI !== 'undefined' && SETTINGS_UI.open() });
    out.push({ grp: 'AZIONE', label: 'Modifica profilo', ico: '👤', hint: 'età · peso target',
      run: () => typeof SETTINGS_UI !== 'undefined' && SETTINGS_UI.open('profilo') });
    out.push({ grp: 'AZIONE', label: 'Scarica backup JSON', ico: '⤓',
      run: () => { if (CS.exportJSON()) UI.toast('Backup scaricato', 'ok'); } });

    // Voto diretto di ogni area e fondamentale
    (CS.AREE_TECNICHE || []).forEach(a => {
      out.push({ grp: 'VOTA', label: a, ico: '◆', hint: 'area tecnica',
        run: () => { ROUTER.go('tecnica', 'vota'); setTimeout(() => TECNICA_UI_vota('area', a), 180); } });
    });
    (CS.FONDAMENTALI || []).forEach(f => {
      out.push({ grp: 'VOTA', label: f, ico: '●', hint: 'fondamentale',
        run: () => { ROUTER.go('tecnica', 'vota'); setTimeout(() => TECNICA_UI_vota('fond', f), 180); } });
    });

    // Teoria: salto diretto alla voce
    if (typeof TEORIA !== 'undefined') {
      Object.keys(TEORIA.aree).forEach(a => {
        out.push({ grp: 'TEORIA', label: a, ico: '📖', hint: TEORIA.aree[a].cosa,
          run: () => ROUTER.go('tecnica', 'teoria') });
      });
      TEORIA.concetti.forEach(c => {
        out.push({ grp: 'TEORIA', label: c.titolo, ico: c.ico, hint: c.sommario,
          run: () => ROUTER.go('tecnica', 'teoria') });
      });
    }

    return out;
  }

  // Ponte verso la modale di voto di tecnica.js (che è in closure)
  function TECNICA_UI_vota(kind, name) {
    const sel = kind === 'fond' ? '.vota-card[data-kind="fond"]' : '.vota-card[data-kind="area"]';
    const card = [...document.querySelectorAll(sel)].find(c => c.dataset.name === name);
    if (card) card.click();
    else UI.toast('Apri TECNICA → VOTA per valutare ' + name, 'warn');
  }

  // ─── FUZZY MATCH ────────────────────────────────────
  // Ritorna { score, hits[] } oppure null se non combacia.
  function fuzzy(needle, hay) {
    if (!needle) return { score: 0, hits: [] };
    const n = needle.toLowerCase().replace(/\s+/g, '');
    const h = hay.toLowerCase();
    let hi = 0, score = 0, streak = 0;
    const hits = [];
    for (const ch of n) {
      const idx = h.indexOf(ch, hi);
      if (idx === -1) return null;
      hits.push(idx);
      // bonus: carattere consecutivo al precedente, o a inizio parola
      if (idx === hi && hi > 0) { streak++; score += 6 + streak * 2; }
      else { streak = 0; score += 1; }
      if (idx === 0 || /[\s··\-]/.test(h[idx - 1] || '')) score += 8;
      hi = idx + 1;
    }
    score -= (h.length - n.length) * 0.12;   // preferisci le etichette corte
    return { score, hits };
  }

  function highlight(label, hits) {
    if (!hits || !hits.length) return escapeHtml(label);
    const set = new Set(hits);
    return [...label].map((c, i) =>
      set.has(i) ? `<b>${escapeHtml(c)}</b>` : escapeHtml(c)).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ─── RENDER ─────────────────────────────────────────
  function filter(q) {
    if (!q.trim()) {
      filtered = items.slice(0, 12).map(it => ({ it, hits: [] }));
    } else {
      filtered = items
        .map(it => { const m = fuzzy(q, it.label + ' ' + it.grp); return m ? { it, ...m } : null; })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
    }
    cursor = 0;
    paint();
  }

  function paint() {
    const list = overlay.querySelector('.cmdk-list');
    if (!filtered.length) {
      list.innerHTML = `<div class="cmdk-empty">Nessun comando per questa ricerca</div>`;
      return;
    }
    let lastGrp = null;
    list.innerHTML = filtered.map((f, i) => {
      const head = f.it.grp !== lastGrp ? `<div class="cmdk-grp">${f.it.grp}</div>` : '';
      lastGrp = f.it.grp;
      return head + `
        <button class="cmdk-row ${i === cursor ? 'is-active' : ''}" data-i="${i}">
          <span class="cmdk-row-ico">${f.it.ico}</span>
          <span class="cmdk-row-lbl">${highlight(f.it.label, f.hits)}</span>
          ${f.it.hint ? `<span class="cmdk-row-hint">${escapeHtml(f.it.hint)}</span>` : ''}
          <span class="cmdk-row-enter">↵</span>
        </button>`;
    }).join('');
    const active = list.querySelector('.cmdk-row.is-active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function move(delta) {
    if (!filtered.length) return;
    cursor = (cursor + delta + filtered.length) % filtered.length;
    paint();
  }

  function run(i) {
    const f = filtered[i != null ? i : cursor];
    if (!f) return;
    close();
    try { f.it.run(); }
    catch (e) { console.error('[PALETTE]', e); UI.toast('Comando non disponibile', 'warn'); }
  }

  // ─── OPEN / CLOSE ───────────────────────────────────
  function open() {
    if (overlay) return;
    items = buildItems();
    overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Palette comandi">
        <div class="cmdk-input-row">
          <span class="cmdk-input-ico">⌘</span>
          <input class="cmdk-input" type="text" placeholder="Vai a, vota, compila…" autocomplete="off" spellcheck="false">
          <kbd class="cmdk-esc">ESC</kbd>
        </div>
        <div class="cmdk-list"></div>
        <div class="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviga</span>
          <span><kbd>↵</kbd> apri</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> palette</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.cmdk-input');
    filter('');
    requestAnimationFrame(() => input.focus());

    input.addEventListener('input', () => filter(input.value));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.cmdk-list').addEventListener('click', (e) => {
      const row = e.target.closest('.cmdk-row');
      if (row) run(Number(row.dataset.i));
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown')      { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter')     { e.preventDefault(); run(); }
      else if (e.key === 'Escape')    { e.preventDefault(); close(); }
    });
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('is-closing');
    const el = overlay;
    overlay = null;
    setTimeout(() => el.remove(), 140);
  }

  function toggle() { overlay ? close() : open(); }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    document.addEventListener('keydown', (e) => {
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); toggle(); return; }
      // "/" apre la palette, ma solo se non stai già scrivendo altrove
      if (k === '/' && !overlay) {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing) { e.preventDefault(); open(); }
      }
    });
  }

  return { init, open, close, toggle };

})();
