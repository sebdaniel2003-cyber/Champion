/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8.1 — FX ENGINE ("RESPIRO")
   Primitive d'animazione condivise da tutte le pagine.
   La "vita" è nei componenti, non nello sfondo.
   ═══════════════════════════════════════════════════════ */

const FX = (function () {

  const reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── EASE: smoothstep cubica ────────────────────────
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  // ─── BREATHE ────────────────────────────────────────
  // strength 0..1 → durata 8s..3s, intensità low..high
  function breathe(el, strength = 0.5, opts = {}) {
    if (!el) return;
    if (reduceMotion()) return;
    const s = Math.max(0, Math.min(1, strength));
    const dur = (8 - s * 5).toFixed(2);          // 3..8s
    const inten = (0.05 + s * 0.18).toFixed(3);  // 0.05..0.23
    el.style.setProperty('--breathe-dur', dur + 's');
    el.style.setProperty('--breathe-inten', inten);
    const variant = opts.variant || 'neon';      // neon | gold | danger | info
    el.dataset.breathe = variant;
    el.classList.add('fx-breathe');
  }
  function stopBreathe(el) {
    if (!el) return;
    el.classList.remove('fx-breathe');
    delete el.dataset.breathe;
  }

  // ─── COUNT UP ───────────────────────────────────────
  function countUp(el, from, to, ms = 800, opts = {}) {
    if (!el) return;
    const dec = opts.decimals || 0;
    const suf = opts.suffix || '';
    const pre = opts.prefix || '';
    if (reduceMotion()) {
      el.textContent = pre + (dec ? Number(to).toFixed(dec) : Math.round(to)) + suf;
      return;
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const v = from + (to - from) * ease(t);
      el.textContent = pre + (dec ? v.toFixed(dec) : Math.round(v)) + suf;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── SPARKLINE (svg path con stroke-dashoffset) ─────
  function drawSparkline(host, values, opts = {}) {
    if (!host) return;
    const w = opts.width  || host.clientWidth  || 120;
    const h = opts.height || host.clientHeight || 36;
    const color = opts.color || 'var(--neon)';
    const fill  = opts.fill  || 'rgba(180,92,255,0.10)';
    if (!values || !values.length) {
      host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px"></svg>`;
      return;
    }
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const rng = (max - min) || 1;
    const step = w / Math.max(1, values.length - 1);
    const ptsXY = values.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / rng) * h * 0.82 - h * 0.09;
      return { x, y, v };
    });
    const linePath = `M ${ptsXY.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
    const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
    const last = ptsXY[ptsXY.length - 1];

    // Hotspots per hoverTip
    const hoverTip = !!opts.hoverTip;
    const labels = Array.isArray(opts.labels) ? opts.labels : null;
    const valFmt = typeof opts.valueFormatter === 'function' ? opts.valueFormatter : (v => Number(v).toFixed(1));
    const hotspots = hoverTip
      ? ptsXY.map((p, i) =>
          `<circle class="fx-spark-hit" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="transparent" pointer-events="all" data-i="${i}"/>`
        ).join('')
      : '';

    host.style.position = host.style.position || 'relative';
    host.innerHTML = `
      <svg class="fx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;overflow:visible">
        <path class="fx-spark-area" d="${areaPath}" fill="${fill}"/>
        <path class="fx-spark-line" d="${linePath}" stroke="${color}" fill="none" stroke-width="1.5" stroke-linejoin="round"/>
        <circle class="fx-spark-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" fill="${color}"/>
        ${hotspots}
      </svg>`;

    // Hover tooltip
    if (hoverTip) {
      let tip = null;
      const onEnter = (e) => {
        const i = Number(e.target.dataset.i);
        const p = ptsXY[i];
        if (!p) return;
        if (!tip) {
          tip = document.createElement('div');
          tip.className = 'spark-tip';
          host.appendChild(tip);
        }
        const lbl = labels && labels[i] != null ? labels[i] : `#${i + 1}`;
        tip.innerHTML = `<b>${valFmt(p.v)}</b> · ${lbl}`;
        // Posiziona in coordinate pixel del host
        const hostRect = host.getBoundingClientRect();
        const sx = (p.x / w) * hostRect.width;
        const sy = (p.y / h) * hostRect.height;
        tip.style.left = sx + 'px';
        tip.style.top  = (sy - 24) + 'px';
        tip.classList.add('show');
      };
      const onLeave = () => { if (tip) tip.classList.remove('show'); };
      host.querySelectorAll('.fx-spark-hit').forEach(c => {
        c.addEventListener('mouseenter', onEnter);
        c.addEventListener('mouseleave', onLeave);
      });
    }

    if (reduceMotion()) return;
    const linePathEl = host.querySelector('.fx-spark-line');
    if (linePathEl && linePathEl.getTotalLength) {
      const L = linePathEl.getTotalLength();
      linePathEl.style.strokeDasharray = L;
      linePathEl.style.strokeDashoffset = L;
      requestAnimationFrame(() => {
        linePathEl.style.transition = 'stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)';
        linePathEl.style.strokeDashoffset = '0';
      });
    }
    // Area: fade progressivo sincronizzato col draw-in della linea
    const areaEl = host.querySelector('.fx-spark-area');
    if (areaEl) {
      areaEl.style.opacity = '0';
      requestAnimationFrame(() => {
        areaEl.style.transition = 'opacity 900ms cubic-bezier(0.16,1,0.3,1) 150ms';
        areaEl.style.opacity = '1';
      });
    }
    // Dot finale: pop quando la linea lo raggiunge
    const dotEl = host.querySelector('.fx-spark-dot');
    if (dotEl) {
      dotEl.style.transformOrigin = `${last.x.toFixed(1)}px ${last.y.toFixed(1)}px`;
      dotEl.style.transform = 'scale(0)';
      requestAnimationFrame(() => {
        dotEl.style.transition = 'transform 260ms cubic-bezier(0.34,1.56,0.64,1) 620ms';
        dotEl.style.transform = 'scale(1)';
      });
    }
  }

  // ─── RING PROGRESS (svg cerchio animato + respiro modulato) ───
  function ringProgress(host, pct, opts = {}) {
    if (!host) return;
    pct = Math.max(0, Math.min(100, pct));
    const size = opts.size || 120;
    const stroke = opts.stroke || 8;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    const color = opts.color || 'var(--neon)';
    const trackColor = opts.trackColor || 'rgba(255,255,255,0.06)';
    const center = opts.center || '';
    const label = opts.label || '';
    const variant = opts.variant || 'neon';

    host.innerHTML = `
      <div class="fx-ring" data-breathe="${variant}" style="--ring-size:${size}px">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
          <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="${trackColor}" stroke-width="${stroke}" fill="none"/>
          <circle class="fx-ring-arc" cx="${size/2}" cy="${size/2}" r="${r}"
                  stroke="${color}" stroke-width="${stroke}" fill="none"
                  stroke-linecap="round"
                  stroke-dasharray="${c.toFixed(2)}"
                  stroke-dashoffset="${c.toFixed(2)}"
                  transform="rotate(-90 ${size/2} ${size/2})"/>
        </svg>
        <div class="fx-ring-text">
          <div class="fx-ring-center">${center}</div>
          ${label ? `<div class="fx-ring-label">${label}</div>` : ''}
        </div>
      </div>
    `;
    const arc = host.querySelector('.fx-ring-arc');
    if (reduceMotion()) {
      arc.style.strokeDashoffset = off.toFixed(2);
    } else {
      requestAnimationFrame(() => {
        arc.style.transition = 'stroke-dashoffset 1000ms cubic-bezier(0.16,1,0.3,1)';
        arc.style.strokeDashoffset = off.toFixed(2);
      });
    }
    // respiro modulato sulla pct
    const strength = pct / 100;
    breathe(host.querySelector('.fx-ring'), strength, { variant });
  }

  // ─── SCRAMBLE (effetto matrix sui titoli) ──────────
  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789▓▒░█';
  function scramble(el, finalText, ms = 700) {
    if (!el) return;
    if (reduceMotion()) { el.textContent = finalText; return; }
    const len = finalText.length;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      const rev = Math.floor(t * len);
      let s = '';
      for (let i = 0; i < len; i++) {
        s += i < rev ? finalText[i] : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      el.textContent = s;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = finalText;
    }
    requestAnimationFrame(frame);
  }

  // ─── STAGGER IN (entrata in cascata) ───────────────
  function staggerIn(container, selector = ':scope > *', baseDelay = 70) {
    if (!container) return;
    if (reduceMotion()) return;
    // Auto-fix: `> *` è syntax jQuery, non valida per querySelectorAll
    // nativo. Convertiamo in `:scope > *` così i chiamanti esistenti che
    // passano `> *` non lanciano SyntaxError (bug scoperto 2026-07-02:
    // l'errore silenzioso bloccava afterVota e i tooltip del calendario
    // Oro non venivano posizionati correttamente).
    if (selector && selector.trim().startsWith('>')) {
      selector = ':scope ' + selector.trim();
    }
    let items;
    try {
      items = container.querySelectorAll(selector);
    } catch (e) {
      console.warn('[FX.staggerIn] selettore invalido:', selector, e);
      return;
    }
    // Reset: rimuovi classe + force reflow per restart pulito su re-render
    items.forEach(el => {
      el.classList.remove('fx-stagger');
      el.style.removeProperty('--stagger-delay');
    });
    // Force reflow una volta sola
    if (items.length) void items[0].offsetWidth;
    items.forEach((el, i) => {
      el.style.setProperty('--stagger-delay', (i * baseDelay) + 'ms');
      el.classList.add('fx-stagger');
    });
  }

  // ─── GLOW BURST (flash radiale per save importanti) ─
  function glowBurst(originEl, color = 'var(--neon)') {
    if (!originEl) return;
    if (reduceMotion()) return;
    const rect = originEl.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'fx-burst';
    burst.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width / 2}px;
      top:  ${rect.top + rect.height / 2}px;
      background: radial-gradient(circle, ${color === 'var(--neon)' ? '#B45CFF' : color} 0%, transparent 70%);
    `;
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 500);
  }

  // ─── VITAL SIGNAL (fattore globale 0..1) ───────────
  function vitalSignal() {
    if (typeof CALC === 'undefined' || typeof CS === 'undefined') return 0.5;
    let score = 0.5;
    try {
      const streak = CALC.streakDays();
      score += Math.min(streak / 14, 0.4);   // boost fino a +0.4
      const wk = CALC.settimanaTopCheck(new Date());
      if (wk.gold) score = 1;
      const last7 = CALC.revsLastN(7).map(r => r.affaticamento).filter(Boolean);
      if (last7.length) {
        const aff = last7.reduce((a, b) => a + b, 0) / last7.length;
        if (aff >= 8) score *= 0.6;          // affaticato → calma
      }
    } catch (e) {}
    return Math.max(0, Math.min(1, score));
  }

  // ─── HOOK route: applica respiro globale a body ────
  function applyVitalToBody() {
    const v = vitalSignal();
    document.body.style.setProperty('--vital', v.toFixed(2));
  }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    applyVitalToBody();
    if (typeof BUS !== 'undefined') {
      BUS.on('route:change', applyVitalToBody);
      BUS.on('cs:rev-saved', applyVitalToBody);
      BUS.on('cs:weight-saved', applyVitalToBody);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    breathe, stopBreathe,
    countUp,
    drawSparkline, ringProgress,
    scramble, staggerIn, glowBurst,
    vitalSignal, applyVitalToBody,
    reduceMotion,
  };

})();
