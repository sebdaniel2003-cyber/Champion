/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — ROUTER
   Hash routing: #/<section>/<subroute>
   ═══════════════════════════════════════════════════════ */

const ROUTER = (function () {

  // Mappa sezione → sub-tabs
  const SECTIONS = {
    dashboard: {
      label: 'DASHBOARD',
      subs: [], // niente sub-tab
      default: 'dashboard',
    },
    focus: {
      label: 'FOCUS',
      subs: [
        { id: 'obiettivi',  label: 'OBIETTIVI' },
        { id: 'calendario', label: 'CALENDARIO EVENTI' },
        { id: 'visione',    label: 'VISIONE' },
      ],
      default: 'obiettivi',
    },
    fisica: {
      label: 'FISICA',
      subs: [
        { id: 'peso',        label: 'PESO' },
        { id: 'nutrizione',  label: 'NUTRIZIONE' },
        { id: 'corsa',       label: 'CORSA' },
        { id: 'sonno',       label: 'SONNO' },
      ],
      default: 'peso',
    },
    tecnica: {
      label: 'TECNICA',
      subs: [
        { id: 'vota',          label: 'VOTA' },
        { id: 'aree',          label: 'AREE' },
        { id: 'fondamentali',  label: 'FONDAMENTALI' },
        { id: 'sessioni',      label: 'ORO' },
        { id: 'infortuni',     label: 'INFORTUNI' },
        { id: 'teoria',        label: 'TEORIA' },
      ],
      default: 'vota',
    },
    archivio: {
      label: 'ARCHIVIO',
      subs: [
        { id: 'panoramica', label: 'PANORAMICA' },
        { id: 'fisica',     label: 'FISICA' },
        { id: 'focus',      label: 'FOCUS' },
        { id: 'tecnica',    label: 'TECNICA' },
        { id: 'revisioni',  label: 'REVISIONI' },
      ],
      default: 'panoramica',
    },
    assistente: {
      label: 'ASSISTENTE',
      subs: [
        { id: 'coach',      label: 'COACH' },
        { id: 'nutrizione', label: 'NUTRIZIONE' },
        { id: 'mentale',    label: 'MENTALE' },
        { id: 'recupero',   label: 'RECUPERO' },
      ],
      default: 'coach',
    },
  };

  // Mappa route → render function
  const routes = new Map();
  let currentSection = null;
  let currentSub = null;
  let outlet = null;
  let subbarEl = null;

  // ─── REGISTER ───────────────────────────────────────
  function register(routeKey, renderFn, afterRender) {
    routes.set(routeKey, { render: renderFn, after: afterRender });
  }

  // ─── NAVIGATION ─────────────────────────────────────
  function go(section, sub) {
    const s = SECTIONS[section];
    if (!s) {
      window.location.hash = '#/dashboard';
      return;
    }
    const subPart = sub || s.default;
    const hash = section === 'dashboard'
      ? '#/dashboard'
      : `#/${section}/${subPart}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      render();
    }
  }

  function parseHash() {
    const raw = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [section, sub] = raw.split('/');
    return { section: section || 'dashboard', sub: sub || null };
  }

  // ─── RENDER ────────────────────────────────────────
  function render() {
    if (!outlet) outlet = document.getElementById('route-outlet');
    if (!subbarEl) subbarEl = document.getElementById('subbar');

    const parsed = parseHash();
    let { section, sub } = parsed;
    const sec = SECTIONS[section];
    if (!sec) {
      window.location.hash = '#/dashboard';
      return;
    }
    if (sec.subs.length && !sub) sub = sec.default;

    currentSection = section;
    currentSub = sub;

    // route key: "section" or "section/sub"
    const routeKey = sub && sec.subs.length ? `${section}/${sub}` : section;
    const route = routes.get(routeKey);

    outlet.innerHTML = '';
    // v8.3: retrigger dell'animazione di ingresso pagina (solo visivo)
    outlet.classList.remove('route-enter');
    void outlet.offsetWidth;
    outlet.classList.add('route-enter');
    let html;
    if (route) {
      html = route.render();
    } else {
      html = comingSoonHTML(routeKey, sec, sub);
    }
    if (typeof html === 'string') {
      outlet.innerHTML = `<div class="page">${html}</div>`;
    } else if (html instanceof Node) {
      const wrap = document.createElement('div');
      wrap.className = 'page';
      wrap.appendChild(html);
      outlet.appendChild(wrap);
    }
    if (route && route.after) {
      try { route.after(); } catch (e) { console.error('[ROUTER after]', e); }
    }

    updateNavActive(section);
    renderSubbar(section, sub);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    BUS.emit('route:change', { section, sub });
  }

  function comingSoonHTML(routeKey, sec, sub) {
    const subLabel = (sec.subs.find(x => x.id === sub) || {}).label || sec.label;
    return `<div class="coming-soon">
      <div class="coming-soon-icon">⚡</div>
      <div class="coming-soon-title">${subLabel}</div>
      <div class="coming-soon-text">Sezione in costruzione.<br>Struttura, dati e collegamenti già definiti — solo da implementare.</div>
      <div class="coming-soon-tag">v8 · ${routeKey}</div>
    </div>`;
  }

  function updateNavActive(section) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.section === section);
    });
  }

  function renderSubbar(section, sub) {
    if (!subbarEl) return;
    const sec = SECTIONS[section];
    if (!sec || !sec.subs.length) {
      // solo meta (system online)
      subbarEl.innerHTML = `<div class="sub-meta"><span class="dot"></span><span id="sub-meta-text">${metaText()}</span></div>`;
      return;
    }
    const tabs = sec.subs.map(t =>
      `<button class="sub-tab ${t.id === sub ? 'active' : ''}" data-sub="${t.id}">${t.label}</button>`
    ).join('');
    subbarEl.innerHTML = `
      <div class="sub-meta"><span class="dot"></span><span>${sec.label}</span></div>
      ${tabs}
    `;
    subbarEl.querySelectorAll('.sub-tab').forEach(b => {
      b.addEventListener('click', () => go(section, b.dataset.sub));
    });
  }

  function metaText() {
    const d = new Date();
    const wd = ['DOMENICA','LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ','SABATO'][d.getDay()];
    const m = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'][d.getMonth()];
    const wk = CS.weekKey(d).split('-W')[1] || '—';
    return `SYSTEM ONLINE · ${wd} ${d.getDate()} ${m} ${d.getFullYear()} · W${wk}`;
  }

  // ─── INIT ───────────────────────────────────────────
  function init() {
    outlet = document.getElementById('route-outlet');
    subbarEl = document.getElementById('subbar');

    window.addEventListener('hashchange', render);

    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        go(el.dataset.section);
      });
    });

    render();
  }

  return {
    register, go, init,
    current: () => ({ section: currentSection, sub: currentSub }),
    sections: SECTIONS,
    parseHash,
  };

})();
