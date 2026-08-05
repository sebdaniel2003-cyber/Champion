/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — UI COMPONENTS
   ═══════════════════════════════════════════════════════ */

const UI = (function () {

  // ─── TOAST ───────────────────────────────────────────
  function toast(msg, type = 'ok', duration = 2400) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icons = { ok: '✓', warn: '⚠', danger: '✕', gold: '🏆' };
    el.innerHTML = `<span>${icons[type] || '·'}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ─── MODAL (semplice) ───────────────────────────────
  function modal(html, opts = {}) {
    // exclusive: chiude ogni altra modale prima di aprire questa.
    // Serve alle modali "grandi" (revisioni, impostazioni) che usano id fissi
    // interni (#rev-body, #rev-prev...): con due modali aperte insieme gli id
    // sarebbero duplicati e document.getElementById leggerebbe quella sbagliata.
    if (opts.exclusive) {
      document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    // anchorTop: la modale si aggancia in alto invece di centrarsi →
    // la posizione NON dipende più dall'altezza del contenuto
    // (fix: il popup revisioni cambiava posizione tra giorn/sett/mens)
    if (opts.anchorTop) overlay.classList.add('anchor-top');
    const box = document.createElement('div');
    box.className = 'modal' + (opts.className ? ' ' + opts.className : '');
    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay && !opts.persistent) close(); });
    box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    return { el: box, close };
  }

  // ─── SPARKLINE SVG ──────────────────────────────────
  function sparkline(values, opts = {}) {
    const w = opts.width || 100;
    const h = opts.height || 36;
    const color = opts.color || 'var(--accent)';
    if (!values || !values.length) return `<svg class="sparkline" viewBox="0 0 ${w} ${h}"></svg>`;
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const range = max - min || 1;
    const step = w / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h * 0.85 - h * 0.075;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const linePath = `M ${pts.join(' L ')}`;
    const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
    const lastX = (values.length - 1) * step;
    const lastY = h - ((values[values.length - 1] - min) / range) * h * 0.85 - h * 0.075;
    return `
      <svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
        <path class="area" d="${areaPath}" fill="${color}"/>
        <path class="line" d="${linePath}" stroke="${color}"/>
        <circle class="last" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}" stroke="var(--bg)" stroke-width="1"/>
      </svg>
    `;
  }

  // ─── NUMBER COUNTER (animato) ───────────────────────
  function tween(el, fromVal, toVal, opts = {}) {
    const dur = opts.duration || 600;
    const decimals = opts.decimals || 0;
    const suffix = opts.suffix || '';
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = fromVal + (toVal - fromVal) * eased;
      el.textContent = (decimals ? val.toFixed(decimals) : Math.round(val)) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = (decimals ? toVal.toFixed(decimals) : Math.round(toVal)) + suffix;
    }
    requestAnimationFrame(step);
  }

  // ─── PROGRESS BAR factory ───────────────────────────
  function progressBar(pct, opts = {}) {
    const cls = opts.gold ? 'gold' : (opts.ok ? 'ok' : '');
    const nearComplete = pct >= 85 ? 'near-complete' : '';
    return `<div class="progress">
      <div class="progress-fill ${cls} ${nearComplete}" style="width:${Math.min(100, pct)}%"></div>
    </div>`;
  }

  // ─── TREND BADGE ────────────────────────────────────
  function trendBadge(deltaPct) {
    if (deltaPct === null || deltaPct === undefined || isNaN(deltaPct)) {
      return `<span class="trend eq">—</span>`;
    }
    if (Math.abs(deltaPct) < 2) return `<span class="trend eq">→ ${deltaPct.toFixed(0)}%</span>`;
    if (deltaPct > 0) return `<span class="trend up">↑ ${deltaPct.toFixed(0)}%</span>`;
    return `<span class="trend down">↓ ${Math.abs(deltaPct).toFixed(0)}%</span>`;
  }

  // ─── GOLD BURST (particle effect) ───────────────────
  function goldBurst(originEl) {
    const rect = originEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;top:0;left:0;pointer-events:none;z-index:9500;width:100vw;height:100vh;overflow:hidden;`;
    document.body.appendChild(container);
    const N = 24;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const dist = 100 + Math.random() * 80;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute; left:${cx}px; top:${cy}px;
        width:8px; height:8px; border-radius:50%;
        background: radial-gradient(circle, #FBBF24, #F59E0B);
        box-shadow: 0 0 12px #F59E0B, 0 0 20px #F59E0B;
        transition: transform 1s cubic-bezier(0.16, 1, 0.3, 1), opacity 1s ease-out;
      `;
      container.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${dx}px, ${dy}px) scale(0)`;
        p.style.opacity = '0';
      });
    }
    setTimeout(() => container.remove(), 1100);
  }

  // ─── ALERT ──────────────────────────────────────────
  function alert(title, text, type = 'info', icon) {
    const icons = { info: 'ℹ', warn: '⚠', danger: '🚨', ok: '✓' };
    return `<div class="alert ${type}">
      <div class="alert-icon">${icon || icons[type] || '·'}</div>
      <div class="alert-content">
        <div class="alert-title">${title}</div>
        <div class="alert-text">${text}</div>
      </div>
    </div>`;
  }

  // ─── EMPTY STATE ────────────────────────────────────
  function empty(icon, title, text) {
    return `<div class="empty">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      <div class="empty-text">${text}</div>
    </div>`;
  }

  // ─── CHART.JS defaults ──────────────────────────────
  function chartDefaults() {
    if (window.Chart) {
      Chart.defaults.color = 'rgba(245,245,247,0.6)';
      // 'Inter' non è fra i font caricati: i grafici cadevano su un sans-serif
      // di sistema, fuori dal linguaggio tipografico del resto dell'app.
      // JetBrains Mono è il font dei dati ed è già caricato.
      Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
      Chart.defaults.font.size = 11;
      Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
      // Animazione d'ingresso "a costruzione": ogni punto/barra entra con un
      // micro-ritardo scalare. Vale per tutti i chart del sistema (drill-down
      // archivio inclusi) senza toccare le singole istanze.
      Chart.defaults.animation = {
        duration: 650,
        easing: 'easeOutQuart',
        delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default')
          ? Math.min(ctx.dataIndex * 22, 420)
          : 0,
      };
      Chart.defaults.transitions.active.animation.duration = 120;
    }
  }

  return {
    toast, modal, sparkline, tween, progressBar, trendBadge, goldBurst, alert, empty, chartDefaults
  };

})();
