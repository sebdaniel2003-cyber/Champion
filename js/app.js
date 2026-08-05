/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — APP BOOTSTRAP
   ═══════════════════════════════════════════════════════ */

(function () {

  // ─── SPLASH ─────────────────────────────────────────
  function dismissSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 600);
  }
  setTimeout(dismissSplash, 2400);
  document.getElementById('splash')?.addEventListener('click', dismissSplash);

  // ─── COMPILA (apre stepper rev-daily) ───────────────
  const btnCompila = document.getElementById('btn-compila');
  btnCompila?.addEventListener('click', () => {
    if (typeof REV_FORMS !== 'undefined') REV_FORMS.openDaily();
  });

  // Stato visuale del COMPILA: pulse "is-due" se rev di oggi manca,
  // "is-done" se già compilata. Refresh ad ogni route/save.
  function refreshCompilaState() {
    if (!btnCompila) return;
    const today = CS.todayISO();
    const rev = CS.state.revisioni.find(r => r.data === today);
    const lbl = btnCompila.querySelector('span');
    btnCompila.classList.remove('is-due', 'is-done');
    if (rev) {
      btnCompila.classList.add('is-done');
      if (lbl) lbl.textContent = 'OGGI ✓';
      btnCompila.title = 'Modifica revisione di oggi';
    } else {
      btnCompila.classList.add('is-due');
      if (lbl) lbl.textContent = 'COMPILA';
      btnCompila.title = 'Compila revisione di oggi';
    }
  }
  BUS.on('cs:rev-saved', refreshCompilaState);
  BUS.on('route:change', refreshCompilaState);

  // ─── SETTINGS (impostazioni) ────────────────────────
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    if (typeof SETTINGS_UI !== 'undefined') SETTINGS_UI.open();
    else UI.toast('Modulo impostazioni non disponibile', 'warn');
  });

  // ─── BACKUP / RESTORE ───────────────────────────────
  document.getElementById('btn-backup')?.addEventListener('click', () => {
    if (CS.exportJSON()) UI.toast('Backup scaricato', 'ok');
  });

  document.getElementById('btn-restore')?.addEventListener('click', () => {
    document.getElementById('restore-file')?.click();
  });

  document.getElementById('restore-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Caricare questo backup? I dati attuali verranno sostituiti.')) {
      e.target.value = '';
      return;
    }
    try {
      await CS.importJSON(file);
      UI.toast('Backup ripristinato', 'ok');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      UI.toast('Errore: ' + err.message, 'danger', 4000);
    }
    e.target.value = '';
  });

  // ─── SAVE ERROR HANDLER ─────────────────────────────
  BUS.on('cs:save-error', () => {
    UI.toast('⚠ Spazio esaurito! Fai un backup.', 'danger', 6000);
  });

  // ─── INIT ───────────────────────────────────────────
  function boot() {
    if (typeof UI !== 'undefined' && UI.chartDefaults) UI.chartDefaults();
    ROUTER.init();
    if (typeof ASSISTANT !== 'undefined') ASSISTANT.init();
    if (typeof PALETTE !== 'undefined') {
      PALETTE.init();
      document.getElementById('btn-palette')?.addEventListener('click', () => PALETTE.open());
    }
    if (typeof SYNC !== 'undefined') SYNC.init();
    if (typeof INBOX !== 'undefined') {
      INBOX.init();
      // Ctrl+I: registra a voce/tastiera da qualunque punto del sistema
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'i') {
          e.preventDefault();
          INBOX.count() ? INBOX.open() : INBOX.capture();
        }
      });
      // L'orb assistente apre la casella se c'è posta, altrimenti l'assistente
      document.getElementById('assistant-widget')?.addEventListener('click', (e) => {
        if (INBOX.count()) { e.stopPropagation(); INBOX.open(); }
      }, true);
    }
    refreshCompilaState();

    console.log('%c⚔ CHAMPION SYSTEM v8', 'font-size:24px;font-weight:900;color:#B45CFF;text-shadow:0 0 12px rgba(180,92,255,0.5)');
    console.log('%cDIVENTA QUELLO CHE DEVI ESSERE', 'font-size:11px;letter-spacing:0.3em;color:#9D4EDD');
  }

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

})();
