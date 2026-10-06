/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — UI "CHIEDI" (domande sui tuoi numeri) v2
   Scrivi (o detta) una domanda, ricevi la risposta con i numeri veri.
   - le risposte si ricalcolano SEMPRE dal vivo: della conversazione si
     salvano solo le domande (ultime 20) e le preferite;
   - "ho capito" mostra periodo e cosa: si correggono con un tocco;
   - una frase che racconta ("ho fatto 60 flessioni") non viene salvata
     da qui: si passa dall'anteprima con conferma dell'INBOX.
   ═══════════════════════════════════════════════════════ */

const CHIEDI_UI = (function () {

  const KEY = 'cs_ask_hist', KEY_PIN = 'cs_ask_pin', KEY_AN = 'cs_ask_analisi';
  let thread = [];     // [{ q }]
  let storiaIdx = -1;  // frecce su/giù nell'input

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n, dec) => n == null ? '—' : Number(n).toLocaleString('it-IT', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  const leggi = (k, def) => { try { const a = JSON.parse(localStorage.getItem(k) || 'null'); return a == null ? def : a; } catch (e) { return def; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage non disponibile */ } };

  function giornoLbl(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const D = new Date(y, m - 1, d);
    return `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][D.getDay()]} ${d}/${m}`;
  }
  const dataBreve = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };

  // ─── PEZZI RIUSABILI ────────────────────────────────
  function deltaChip(r) {
    if (r.delta == null || !isFinite(r.delta)) return '';
    const su = r.delta > 0.5, giu = r.delta < -0.5;
    return `<span class="ask-delta ${su ? 'up' : giu ? 'down' : 'flat'}" title="Confronto con il periodo precedente di pari lunghezza (${num(r.prec, r.dec)}${r.unit ? ' ' + r.unit : ''})">${su || giu ? `${su ? '▲ +' : '▼ '}${Math.round(r.delta)}% vs prima` : '= come prima'}</span>`;
  }
  const SIGLE = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
  function siglaGiorno(iso) { const [y, m, d] = iso.split('-').map(Number); return SIGLE[new Date(y, m - 1, d).getDay()]; }

  // Barre giorno per giorno: gradiente, sigla del giorno sotto (fino a 14 giorni), valore sul massimo.
  function barre(r) {
    const g = r.perGiorno;
    if (!g || g.length < 2 || g.length > 40) return '';
    const vals = g.map(x => Number(x.val) || 0);
    const max = Math.max(...vals, 0.0001);
    const idxMax = vals.indexOf(Math.max(...vals));
    const lab = g.length <= 14;
    const cols = g.map((x, i) => {
      const v = vals[i];
      const h = Math.max(v > 0 ? 7 : 2, Math.round((v / max) * 84));
      const tip = `${esc(giornoLbl(x.iso))}: ${x.val == null ? 'nessun dato' : num(v, r.dec) + (r.unit ? ' ' + r.unit : '')}${x.rev ? '' : ' (senza revisione)'}`;
      const top = (i === idxMax && v > 0) ? `<span class="ask-col-v" style="bottom:calc(${h}% + 4px)">${num(v, r.dec)}</span>` : '';
      return `<div class="ask-col${v > 0 ? ' on' : ''}${x.rev ? '' : ' vuoto'}${(i === idxMax && v > 0) ? ' max' : ''}" title="${tip}">
        <div class="ask-col-b">${top}<i style="height:${h}%"></i></div>${lab ? `<span class="ask-col-l">${siglaGiorno(x.iso)}</span>` : ''}</div>`;
    }).join('');
    const asse = !lab ? `<div class="ask-axis"><span>${esc(dataBreve(g[0].iso))}</span><span>${esc(dataBreve(g[g.length - 1].iso))}</span></div>` : '';
    return `<div class="ask-chart"><div class="ask-cols" style="--n:${g.length}">${cols}</div>${asse}</div>`;
  }
  // Tendenza: ultime 8 settimane come curva morbida con area, linea della media e punti.
  let _gid = 0;
  function trend(r) {
    const t = r.trend;
    if (!t || t.length < 2) return '';
    const n = t.length, W = 400, H = 100, pad = 10;
    const vals = t.map(x => Number(x.val) || 0);
    const max = Math.max(...vals, 0.0001);
    const xs = vals.map((_, i) => pad + (i * (W - 2 * pad)) / (n - 1));
    const ys = vals.map(v => H - pad - (v / max) * (H - 2 * pad));
    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = i > 0 ? i - 1 : i, p1 = i, p2 = i + 1, p3 = i + 2 < n ? i + 2 : i + 1;
      const c1x = xs[p1] + (xs[p2] - xs[p0]) / 6, c1y = ys[p1] + (ys[p2] - ys[p0]) / 6;
      const c2x = xs[p2] - (xs[p3] - xs[p1]) / 6, c2y = ys[p2] - (ys[p3] - ys[p1]) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[p2].toFixed(1)},${ys[p2].toFixed(1)}`;
    }
    const area = `${d} L${xs[n - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;
    const complete = vals.slice(0, n - 1);
    const media = complete.length ? complete.reduce((a, b) => a + b, 0) / complete.length : 0;
    const ym = H - pad - (media / max) * (H - 2 * pad);
    const gid = 'ag' + (++_gid);
    const dots = t.map((x, i) => {
      const v = vals[i];
      const tip = `Settimana dal ${esc(dataBreve(x.da))}: ${num(x.val, r.dec)}${r.unit ? ' ' + esc(r.unit) : ''}${x.corrente ? ' (in corso)' : ''}`;
      return `<span class="ask-dot${x.corrente ? ' cur' : ''}${v === Math.max(...vals) ? ' top' : ''}" style="left:${(xs[i] / W * 100).toFixed(2)}%;top:${(ys[i] / H * 100).toFixed(2)}%" title="${tip}"><b>${num(x.val, r.dec)}</b></span>`;
    }).join('');
    const lab = t.map(x => `<span${x.corrente ? ' class="cur"' : ''}>${esc(dataBreve(x.da))}</span>`).join('');
    return `<div class="ask-trend">
      <div class="ask-trend-h"><span class="ask-trend-k">ULTIME 8 SETTIMANE</span><span class="ask-trend-m">media ${num(media, r.dec)}${r.unit ? ' ' + esc(r.unit) : ''}</span></div>
      <div class="ask-line-wrap">
        <svg class="ask-line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--neon, #EC4899)" stop-opacity=".38"/><stop offset="1" stop-color="var(--neon, #EC4899)" stop-opacity="0"/></linearGradient></defs>
          <line x1="0" x2="${W}" y1="${ym.toFixed(1)}" y2="${ym.toFixed(1)}" class="ask-line-avg"/>
          <path d="${area}" fill="url(#${gid})"/>
          <path d="${d}" class="ask-line-p"/>
        </svg>${dots}
      </div>
      <div class="ask-line-l">${lab}</div></div>`;
  }

  function dettaglio(r) {
    const g = (r.perGiorno || []).filter(x => x.val != null);
    if (!g.length) return '<div class="ask-det-vuoto">Nessun dato nel periodo.</div>';
    return `<div class="ask-det">${g.map(x =>
      `<div><span>${esc(giornoLbl(x.iso))}</span><b>${num(x.val, r.dec)}${r.unit ? ' ' + esc(r.unit) : ''}</b></div>`).join('')}</div>`;
  }

  function obiettivoBar(o) {
    if (!o) return '';
    const pct = Math.max(0, Math.min(100, o.pct || 0));
    return `<div class="ask-goal ${pct >= 100 ? 'done' : ''}">
      <div class="ask-goal-t"><span>${pct >= 100 ? '✓ ' : ''}Obiettivo ${esc(o.scadenza)}</span><b>${num(o.cur, 0)} / ${num(o.target, 0)} ${esc(o.unita)}</b></div>
      <div class="ask-goal-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>`;
  }

  // ─── TIPI DI RISPOSTA ───────────────────────────────
  function renderRiga(r, singola) {
    const sub = (r.giorniConDato != null && r.key !== 'giorni' && r.key !== 'riposo' && r.tipo === 'somma')
      ? `<em>in ${r.giorniConDato} ${r.giorniConDato === 1 ? 'giorno' : 'giorni'}</em>` : (r.tipo === 'media' ? '<em>media</em>' : '');
    return `
      <div class="ask-stat${singola ? ' single' : ''}">
        <div class="ask-stat-h"><span class="ask-ico">${r.ico}</span><span class="ask-lbl">${esc(r.label)}</span>${deltaChip(r)}</div>
        <div class="ask-n"><b>${num(r.totale, r.dec)}</b><span>${esc(r.unit)}</span>${sub}</div>
        ${barre(r)}
        ${obiettivoBar(r.obiettivo)}
        ${singola ? trend(r) : ''}
        ${(r.perGiorno && r.perGiorno.length > 1) ? `<button type="button" class="ask-more" data-ask-more>DETTAGLIO PER GIORNO</button><div class="ask-det-wrap" hidden>${dettaglio(r)}</div>` : ''}
      </div>`;
  }

  function renderPeso(p) {
    if (!p) return '';
    if (!p.n) {
      return `<div class="ask-stat single"><div class="ask-stat-h"><span class="ask-ico">⚖️</span><span class="ask-lbl">Peso</span></div>
        <div class="ask-det-vuoto">Nessuna pesata nel periodo${p.prima ? `. L'ultima prima era ${num(p.prima.kg, 1)} kg (${esc(giornoLbl(p.prima.data))}).` : '.'}</div></div>`;
    }
    const diff = p.ultimo.kg - (p.prima ? p.prima.kg : p.primo.kg);
    return `<div class="ask-stat single"><div class="ask-stat-h"><span class="ask-ico">⚖️</span><span class="ask-lbl">Peso</span>
        <span class="ask-delta ${diff < -0.05 ? 'down' : diff > 0.05 ? 'up' : 'flat'}">${diff > 0 ? '+' : ''}${num(diff, 1)} kg</span></div>
      <div class="ask-n"><b>${num(p.ultimo.kg, 1)}</b><span>kg</span><em>${esc(giornoLbl(p.ultimo.data))}</em></div>
      <div class="ask-det-vuoto">${p.n} ${p.n === 1 ? 'pesata' : 'pesate'} nel periodo · variazione ${p.prima ? 'rispetto all\'ultima pesata prima del periodo' : 'dalla prima all\'ultima del periodo'}.</div></div>`;
  }

  function renderObiettivi(res) {
    if (!res.obiettivi.length) return '';
    return `<div class="ask-goals">${res.obiettivi.map(o => {
      const pct = Math.max(0, Math.min(100, o.pct || 0));
      const dec = (o.unita === 'km' || o.unita === 'h') ? 1 : 0;
      return `<div class="ask-goal-row ${pct >= 100 ? 'done' : ''}">
        <div class="ask-goal-t"><span>${pct >= 100 ? '✓ ' : ''}${esc(o.nome)}</span><b>${num(o.cur, dec)} / ${num(o.target, dec)} ${esc(o.unita)} · ${Math.round(o.pct || 0)}%</b></div>
        <div class="ask-goal-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
    }).join('')}</div>`;
  }

  function renderPerche(res) {
    const calati = (res.calati || []).length ? `<div class="ask-sec">COSA È CALATO</div><div class="ask-stats multi">${res.calati.map(c => `
      <div class="ask-stat"><div class="ask-stat-h"><span class="ask-ico">${c.ico}</span><span class="ask-lbl">${esc(c.label)}</span><span class="ask-delta down">▼ ${Math.round(c.delta)}%</span></div>
      <div class="ask-n"><b>${num(c.dopo, c.dec)}</b><span>${esc(c.unit)}</span></div>
      <div class="ask-det-vuoto">prima: ${num(c.prima, c.dec)} ${esc(c.unit)}</div></div>`).join('')}</div>` : '';
    const cause = (res.cause || []).length ? `<div class="ask-sec">COSA È CAMBIATO NELLO STESSO PERIODO</div><div class="ask-cause">${res.cause.map(c => `
      <div class="ask-cause-row"><b>${esc(c.k)}</b><span>${esc(c.testo)}</span><em>${c.prima ? esc(c.prima) + ' ➜ ' : ''}${esc(c.dopo)}</em></div>`).join('')}</div>` : '';
    return `${calati}${cause}<div class="ask-concl">${esc(res.conclusione)}</div>`;
  }

  function renderStato(res) {
    const s = res.stato;
    if (!s) return '';
    const c = s.consiglio;
    return `<div class="ask-state" data-lv="${esc(s.lv)}">
      <div class="ask-state-top"><div class="ask-state-n"><b>${num(s.prontezza, 0)}</b><span>PRONTEZZA</span></div>
        <div><div class="ask-state-t">${esc(s.titolo)}</div><div class="ask-state-s">${esc(s.frase)}</div></div></div>
      ${c && c.tipo ? `<div class="ask-state-row"><span class="ask-state-chip">${esc(c.tipo.toUpperCase())}</span><span>${esc(c.perche)}</span></div>` : ''}
      ${s.domani ? `<div class="ask-state-row"><span class="ask-state-chip alt">DOMANI</span><span><b>${esc(s.domani.titolo.replace('DOMANI: ', ''))}</b> · ${esc(s.domani.frase)}</span></div>` : ''}
      ${(s.segnali || []).length ? `<div class="asst-v-sig">${s.segnali.map(f => `<span class="asst-sig w${f.w}"><i></i><b>${esc(f.k)}</b><em>${esc(f.v)}</em></span>`).join('')}</div>` : ''}
      ${window.CHIEDI_SENZA_ANALISI ? '' : '<button type="button" class="ask-more" data-ask-go="oggi">APRI LA PAGINA OGGI ➜</button>'}
    </div>`;
  }

  function renderSerie(res) {
    const s = res.serie;
    const pct = s.migliore > 0 ? Math.min(100, (s.corrente / s.migliore) * 100) : 0;
    return `<div class="ask-stat single"><div class="ask-stat-h"><span class="ask-ico">🔥</span><span class="ask-lbl">Giorni di fila</span></div>
      <div class="ask-n"><b>${num(s.corrente, 0)}</b><span>${s.corrente === 1 ? 'giorno' : 'giorni'}</span></div>
      <div class="ask-goal ${pct >= 100 ? 'done' : ''}"><div class="ask-goal-t"><span>${s.corrente >= s.migliore && s.corrente > 0 ? '🏆 È il tuo record' : 'Il tuo record'}</span><b>${num(s.migliore, 0)} giorni${s.da ? ` (${esc(dataBreve(s.da))} → ${esc(dataBreve(s.a))})` : ''}</b></div>
      <div class="ask-goal-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div></div>`;
  }

  function renderUltima(res) {
    const u = res.ultima, m = res.metrica;
    if (!u) return '';
    return `<div class="ask-stat single"><div class="ask-stat-h"><span class="ask-ico">${m.ico}</span><span class="ask-lbl">${esc(m.label)} · ultima volta</span></div>
      <div class="ask-n"><b>${u.fa === 0 ? 'oggi' : u.fa === 1 ? 'ieri' : num(u.fa, 0)}</b><span>${u.fa > 1 ? 'giorni fa' : ''}</span><em>${esc(u.label)}</em></div>
      <div class="ask-det-vuoto">Quel giorno: ${num(u.val, m.dec)}${m.unit ? ' ' + esc(m.unit) : ''}${res.penultima ? ` · la volta prima: ${esc(res.penultima.label)} (${num(res.penultima.val, m.dec)}${m.unit ? ' ' + esc(m.unit) : ''})` : ''}.</div></div>`;
  }
  function renderRecord(res) {
    const m = res.metrica;
    const nomeG = { giorno: 'giorni', settimana: 'settimane', mese: 'mesi' }[res.gran];
    const [p1, p2, p3] = res.migliori;
    const colonna = (x, rank) => x ? `<div class="ask-pod p${rank}">
        <div class="ask-pod-v">${num(x.val, m.dec)}<small>${m.unit ? ' ' + esc(m.unit) : ''}</small></div>
        <div class="ask-pod-bar"><span>${['🥇', '🥈', '🥉'][rank - 1]}</span></div>
        <div class="ask-pod-l">${esc(x.label)}</div></div>` : '<div class="ask-pod vuoto"></div>';
    return `<div class="ask-sec">${esc(m.ico)} ${esc(m.label.toUpperCase())} · MIGLIORI ${nomeG.toUpperCase()}</div>
      <div class="ask-podium">${colonna(p2, 2)}${colonna(p1, 1)}${colonna(p3, 3)}</div>
      ${res.peggiore ? `<div class="ask-low"><span>▼ Il più basso</span><b>${esc(res.peggiore.label)}</b><em>${num(res.peggiore.val, m.dec)}${m.unit ? ' ' + esc(m.unit) : ''}</em></div>` : ''}`;
  }

  function renderMedia(res) {
    return `<div class="ask-stats multi">${res.righe.map(r => `
      <div class="ask-stat"><div class="ask-stat-h"><span class="ask-ico">${r.ico}</span><span class="ask-lbl">${esc(r.label)}</span></div>
      <div class="ask-n"><b>${num(r.media, r.dec || (r.media != null && r.media < 20 && r.unit ? 1 : 0))}</b><span>${esc(r.unit)}</span><em>${esc(res.nomeG)}</em></div>
      <div class="ask-det-vuoto">su ${r.n} ${res.gran === 'giorno' ? 'giorni' : res.gran === 'settimana' ? 'settimane' : 'mesi'}</div></div>`).join('')}</div>`;
  }
  function renderConfronto(res) {
    return `<div class="ask-vs-leg"><span class="a"><i></i>${esc(res.A.label)}</span><span class="b"><i></i>${esc(res.B.label)}</span></div>
      <div class="ask-vs-list">${res.righe.map(r => {
        const mx = Math.max(Number(r.a) || 0, Number(r.b) || 0, 0.0001);
        const su = r.delta != null && r.delta > 0.5, giu = r.delta != null && r.delta < -0.5;
        const u = r.unit ? ' ' + esc(r.unit) : '';
        return `<div class="ask-vs"><div class="ask-vs-h"><span>${r.ico} ${esc(r.label)}</span>
          <span class="ask-delta ${su ? 'up' : giu ? 'down' : 'flat'}">${r.delta == null ? '—' : su ? '▲ +' + Math.round(r.delta) + '%' : giu ? '▼ ' + Math.round(r.delta) + '%' : '='}</span></div>
          <div class="ask-vs-row a"><span class="bar"><i style="width:${(((Number(r.a) || 0) / mx) * 100).toFixed(1)}%"></i></span><b>${num(r.a, r.dec)}${u}</b></div>
          <div class="ask-vs-row b"><span class="bar"><i style="width:${(((Number(r.b) || 0) / mx) * 100).toFixed(1)}%"></i></span><b>${num(r.b, r.dec)}${u}</b></div></div>`;
      }).join('')}</div>`;
  }

  function renderManca(res) {
    if (!res.righe.length) return '';
    return `<div class="ask-goals">${res.righe.map(o => {
      const pct = Math.max(0, Math.min(100, o.pct || 0));
      const dec = (o.unita === 'km' || o.unita === 'h') ? 1 : 0;
      const fatto = o.resto <= 0;
      return `<div class="ask-goal-row ${fatto ? 'done' : ''}"><div class="ask-goal-t"><span>${fatto ? '✓ ' : ''}${esc(o.nome)} · ${esc(o.periodo)}</span><b>${num(o.cur, dec)} / ${num(o.target, dec)} ${esc(o.unita)}</b></div>
        <div class="ask-goal-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="ask-manca">${fatto ? 'Obiettivo raggiunto.' : o.chiuso ? `Periodo chiuso: mancavano ${num(o.resto, dec)} ${esc(o.unita)}.` : `Mancano <b>${num(o.resto, dec)} ${esc(o.unita)}</b>${o.quota != null ? ` · <b>${num(Math.ceil(o.quota), 0)} al giorno</b> per i ${o.giorni} giorni utili che restano` : ''}.`}</div></div>`;
    }).join('')}</div>`;
  }

  function renderPesoObiettivo(res) {
    const p = res.peso;
    if (!p) return '';
    return `<div class="ask-stat single"><div class="ask-stat-h"><span class="ask-ico">⚖️</span><span class="ask-lbl">Peso e obiettivo</span></div>
      <div class="ask-n"><b>${num(p.ultimo.kg, 1)}</b><span>kg</span><em>${esc(giornoLbl(p.ultimo.data))}${p.giorniFa > 7 ? ` · ${p.giorniFa} giorni fa` : ''}</em></div>
      <div class="ask-det">${p.target != null ? `<div><span>Obiettivo</span><b>${num(p.target, 1)} kg</b></div><div><span>Mancano</span><b>${num(Math.abs(p.mancano), 1)} kg</b></div>` : ''}
        ${p.ritmo != null ? `<div><span>Ritmo (28 gg)</span><b>${p.ritmo > 0 ? '+' : ''}${num(p.ritmo, 2)} kg/sett</b></div>` : ''}
        ${p.settimane != null ? `<div><span>A questo ritmo</span><b>~${num(p.settimane, 0)} settimane</b></div>` : ''}</div></div>`;
  }

  // ─── "HO CAPITO" modificabile ───────────────────────
  const PERIODI = ['oggi', 'ieri', 'questa settimana', 'settimana scorsa', 'questo mese', 'mese scorso', 'ultimi 30 giorni', 'quest\'anno'];
  function capitoHtml(res, idx) {
    const c = res.capito;
    if (!c) return '';
    const mod = !!c.modificabile;
    const per = c.periodo ? (mod
      ? `<button type="button" class="ask-pill" data-ask-edit="per" data-i="${idx}"><span>PERIODO</span><b>${esc(c.periodo)}</b> ✎</button>`
      : `<span class="ask-pill"><span>PERIODO</span><b>${esc(c.periodo)}</b></span>`) : '';
    const cosaTxt = `<span>COSA</span><b>${esc((c.cosa || []).slice(0, 3).join(', '))}${(c.cosa || []).length > 3 ? ' +' + (c.cosa.length - 3) : ''}</b>`;
    const cosa = (c.cosa || []).length ? (mod
      ? `<button type="button" class="ask-pill" data-ask-edit="cosa" data-i="${idx}">${cosaTxt} ✎</button>`
      : `<span class="ask-pill">${cosaTxt}</span>`) : '';
    const seg = res.seguito ? '<span class="ask-pill seg" title="Ho ripreso la domanda di prima">↩ continua la domanda di prima</span>' : '';
    return `<div class="ask-capito"><span class="ask-capito-k">HO CAPITO</span>${seg}${per}${cosa}</div><div class="ask-edit" id="ask-edit-${idx}" hidden></div>`;
  }

  function azioniHtml(res, q) {
    const p = res.periodo;
    const btn = [];
    if (p && (p.kind === 'settimana' || p.kind === 'mese') && typeof REVIEW !== 'undefined' && ['metriche', 'riepilogo', 'obiettivi', 'perche', 'media', 'record'].includes(res.tipo))
      btn.push(`<button type="button" class="ask-act" data-ask-review="${p.kind === 'settimana' ? 'weekly' : 'monthly'}" data-da="${esc(p.da)}">📊 APRI LA REVIEW</button>`);
    if (p && !window.CHIEDI_SENZA_ANALISI && ['metriche', 'riepilogo', 'obiettivi'].includes(res.tipo)) btn.push('<button type="button" class="ask-act" data-ask-go="revisioni">🗂 VEDI LE REVISIONI</button>');
    const pinned = leggi(KEY_PIN, []).includes(q);
    btn.push(`<button type="button" class="ask-act ask-pin${pinned ? ' on' : ''}" data-ask-pin="${esc(q)}" title="Salva questa domanda tra le preferite">${pinned ? '★ SALVATA' : '☆ SALVA'}</button>`);
    if (!window.CHIEDI_SENZA_ANALISI) btn.push(`<button type="button" class="ask-act" data-ask-claude="${esc(q)}" title="Prepara i tuoi dati per un'analisi più profonda con Claude">🧠 APPROFONDISCI</button>`);
    return `<div class="ask-acts">${btn.join('')}</div>`;
  }

  function renderRisposta(res, q, idx) {
    const intest = res.periodo && res.tipo !== 'confronto' && !(res.capito && res.capito.periodo) ? `<div class="ask-per"><span>PERIODO</span><b>${esc(res.periodo.label)}</b></div>` : '';
    let corpo = '';
    switch (res.tipo) {
      case 'obiettivi': corpo = renderObiettivi(res); break;
      case 'perche': corpo = renderPerche(res); break;
      case 'stato': corpo = renderStato(res); break;
      case 'serie': corpo = renderSerie(res); break;
      case 'ultima': corpo = renderUltima(res); break;
      case 'record': corpo = renderRecord(res); break;
      case 'media': corpo = renderMedia(res); break;
      case 'confronto': corpo = renderConfronto(res); break;
      case 'manca': corpo = renderManca(res); break;
      case 'peso': corpo = renderPesoObiettivo(res); break;
      default: {
        const single = (res.righe || []).length + (res.peso ? 1 : 0) === 1;
        corpo = `<div class="ask-stats${(res.righe || []).length > 1 ? ' multi' : ''}">${(res.righe || []).map(r => renderRiga(r, single)).join('')}${renderPeso(res.peso)}</div>`;
      }
    }
    const note = (res.note || []).length ? `<div class="ask-notes">${res.note.map(n => `<div>${esc(n)}</div>`).join('')}</div>` : '';
    const sugg = (!res.ok && res.suggerimenti) ? `<div class="ask-chips inline">${res.suggerimenti.slice(0, 4).map(s => `<button type="button" class="ask-chip" data-ask-chip="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
    return `<div class="ask-ans"><div class="ask-ans-av">🧠</div><div class="ask-card">${capitoHtml(res, idx)}${intest}${corpo}${note}${sugg}${azioniHtml(res, q)}</div></div>`;
  }

  // Domande d'esempio raggruppate: la schermata vuota diventa una "home" da cui partire.
  const GRUPPI = [
    { t: 'NUMERI', ico: '🔢', q: ['Quante flessioni ieri?', 'Ore di allenamento questo mese', 'Come ho dormito questa settimana?'] },
    { t: 'CAPIRE', ico: '🧠', q: ['Come sto oggi?', 'Perché sono calato?', 'Come è andata la settimana scorsa?'] },
    { t: 'OBIETTIVI', ico: '🎯', q: ['Quanto mi manca per gli obiettivi?', 'Obiettivi della settimana scorsa', 'Quanto manca al peso obiettivo?'] },
    { t: 'RECORD E CONFRONTI', ico: '🏆', q: ['Qual è stata la mia settimana migliore?', 'Confronta questo mese con il mese scorso', 'Quanti giorni di fila?'] },
  ];
  function renderStart() {
    return `<div class="ask-start">
      <div class="ask-start-h"><div class="ask-start-ico">💬</div><div><div class="ask-start-t">Chiedimi i tuoi numeri</div>
        <div class="ask-start-s">Scrivi come parleresti a un coach: giorni, settimane, mesi, anni. Capisco anche i refusi.</div></div></div>
      ${renderNotato()}
      <div class="ask-groups">${GRUPPI.map(g => `<div class="ask-group"><div class="ask-group-t"><span>${g.ico}</span>${g.t}</div>
        ${g.q.map(s => `<button type="button" class="ask-sug" data-ask-chip="${esc(s)}">${esc(s)}</button>`).join('')}</div>`).join('')}</div>
    </div>`;
  }

  function renderThread() {
    if (!thread.length) return renderStart();
    let prev = null;
    return thread.map((m, i) => {
      const res = ASK.rispondi(m.q, prev);
      if (res.contesto) prev = res.contesto;
      m._res = res;
      return `<div class="ask-q"><span>${esc(m.q)}</span></div>${renderRisposta(res, m.q, i)}`;
    }).join('');
  }

  function renderNotato() {
    let lista = [];
    try { lista = ASK.notato(); } catch (e) { lista = []; }
    if (!lista.length) return '';
    return `<div class="ask-notato"><div class="ask-sec">💡 COSA HO NOTATO</div><div class="ask-notato-row">${lista.map((n, i) => `
      <button type="button" class="ask-nota k-${esc(n.k.toLowerCase())}" data-ask-nota="${i}"><span class="ask-nota-i">${n.ico}</span><span class="ask-nota-b"><b>${esc(n.k)}</b><span>${esc(n.testo)}</span></span><span class="ask-nota-go">➜</span></button>`).join('')}</div></div>`;
  }
  function renderPagina() {
    ASSISTANT.evaluate();
    thread = thread.length ? thread : leggi(KEY, []).slice(-20);
    const pin = leggi(KEY_PIN, []);
    const preferite = pin.length ? `<div class="ask-pins"><span>★</span>${pin.map(s => `<button type="button" class="ask-chip pin" data-ask-chip="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
    const mic = (window.SpeechRecognition || window.webkitSpeechRecognition) ? '<button type="button" class="ask-mic" id="ask-mic" title="Detta la domanda" aria-label="Detta">🎙</button>' : '';
    const rapide = ASK.SUGGERIMENTI.slice(0, 6).map(s => `<button type="button" class="ask-chip" data-ask-chip="${esc(s)}">${esc(s)}</button>`).join('');
    return ASSISTANT_UI.pageHeader('chiedi', 'Chiedimi i tuoi numeri: ieri, la settimana scorsa, un mese, un anno.') + `
      <div class="panel ask-panel${thread.length ? ' has-thread' : ''}" id="ask-panel">
        <div class="ask-thread" id="ask-thread">${renderThread()}</div>
        <div class="ask-bottom">
          ${preferite}
          <div class="ask-chips ask-quick" id="ask-chips">${rapide}</div>
          <form class="ask-form" id="ask-form" autocomplete="off">
            <input class="ask-input" id="ask-input" type="text" placeholder="Scrivi una domanda… (o «ho fatto 60 flessioni» per registrare)" maxlength="200" aria-label="Domanda">
            ${mic}
            <button class="ask-send" type="submit">CHIEDI ➜</button>
          </form>
          <div class="ask-foot"><span>Legge solo i dati salvati: un giorno senza revisione vale 0 e te lo dico. Registrare chiede sempre conferma.</span>
            <span class="ask-foot-r">${window.CHIEDI_SENZA_ANALISI ? '' : '<button type="button" class="ask-clear" id="ask-analisi">analisi salvate</button>'}${thread.length ? '<button type="button" class="ask-clear" id="ask-clear">svuota</button>' : ''}</span></div>
        </div>
      </div>`;
  }

  // ─── REGISTRARE DALLA CHAT ──────────────────────────
  function sembraRegistrazione(t) {
    const s = t.trim().toLowerCase();
    if (/\?\s*$/.test(s)) return false;
    if (/^(quant|com|perch|qual|quand|cosa|che |dimmi|mostra|confronta|e |in media)/.test(s)) return false;
    if (!(/\bho\b|\bmi sono\b|\bho appena\b/.test(s) || /^\d/.test(s))) return false;
    if (!/\d/.test(s)) return false;
    try { return typeof NLP !== 'undefined' && NLP.parse(t).intents.length > 0; } catch (e) { return false; }
  }

  // ─── EVENTI ─────────────────────────────────────────
  function invia(testo) {
    const q = String(testo || '').trim();
    if (!q) return;
    if (typeof INBOX !== 'undefined' && sembraRegistrazione(q)) { INBOX.capture(q); return; }
    thread.push({ q });
    thread = thread.slice(-20);
    scrivi(KEY, thread.map(m => ({ q: m.q })));
    storiaIdx = -1;
    rinfresca(true);
  }

  function rinfresca(vaiInFondo) {
    const box = document.getElementById('ask-thread');
    if (!box) return;
    box.innerHTML = renderThread();
    document.getElementById('ask-panel')?.classList.toggle('has-thread', thread.length > 0);
    bindThread();
    if (vaiInFondo) {
      box.scrollTop = box.scrollHeight;
      if (window.CHIEDI_SENZA_ANALISI && box.lastElementChild && box.lastElementChild.scrollIntoView) {   // telefono: scorre la pagina, non il riquadro
        const q = box.querySelectorAll('.ask-q'); const ultima = q[q.length - 1];
        if (ultima) setTimeout(() => ultima.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
      }
    }
    const foot = document.querySelector('.ask-foot-r');
    if (foot && thread.length && !document.getElementById('ask-clear')) { foot.insertAdjacentHTML('beforeend', '<button type="button" class="ask-clear" id="ask-clear">svuota conversazione</button>'); bindClear(); }
  }

  function bindThread() {
    const box = document.getElementById('ask-thread');
    if (!box) return;
    box.querySelectorAll('[data-ask-more]').forEach(b => b.addEventListener('click', () => {
      const wrap = b.nextElementSibling;
      if (!wrap) return;
      wrap.hidden = !wrap.hidden;
      b.textContent = wrap.hidden ? 'DETTAGLIO PER GIORNO' : 'NASCONDI DETTAGLIO';
    }));
    box.querySelectorAll('[data-ask-chip]').forEach(c => c.addEventListener('click', () => invia(c.dataset.askChip)));
    box.querySelectorAll('[data-ask-go]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.askGo;
      if (v === 'oggi') ROUTER.go('assistente', 'oggi'); else ROUTER.go('archivio', v);
    }));
    box.querySelectorAll('[data-ask-review]').forEach(b => b.addEventListener('click', () => {
      const kind = b.dataset.askReview, da = b.dataset.da;
      try { REVIEW.open(kind, kind === 'weekly' ? 'w:' + da : 'm:' + da.slice(0, 7)); } catch (e) { UI.toast('La review di questo periodo non è disponibile', 'warn'); }
    }));
    box.querySelectorAll('[data-ask-pin]').forEach(b => b.addEventListener('click', () => {
      const q = b.dataset.askPin;
      let pin = leggi(KEY_PIN, []);
      pin = pin.includes(q) ? pin.filter(x => x !== q) : [...pin, q].slice(-8);
      scrivi(KEY_PIN, pin);
      b.classList.toggle('on', pin.includes(q));
      b.textContent = pin.includes(q) ? '★ SALVATA' : '☆ SALVA';
      aggiornaPreferite();
    }));
    box.querySelectorAll('[data-ask-claude]').forEach(b => b.addEventListener('click', () => apriAnalisi(b.dataset.askClaude)));
    box.querySelectorAll('[data-ask-edit]').forEach(b => b.addEventListener('click', () => apriModifica(b.dataset.askEdit, Number(b.dataset.i))));
    box.querySelectorAll('[data-ask-nota]').forEach(b => b.addEventListener('click', () => {
      let lista = []; try { lista = ASK.notato(); } catch (e) { lista = []; }
      const n = lista[Number(b.dataset.askNota)];
      if (!n) return;
      if (n.azione === 'capture' && typeof INBOX !== 'undefined') INBOX.capture(); else if (n.q) invia(n.q);
    }));
  }

  function aggiornaPreferite() {
    const pin = leggi(KEY_PIN, []);
    let host = document.querySelector('.ask-pins');
    const html = pin.length ? `<span>★ SALVATE</span>${pin.map(s => `<button type="button" class="ask-chip pin" data-ask-chip="${esc(s)}">${esc(s)}</button>`).join('')}` : '';
    if (!host && pin.length) { document.getElementById('ask-chips')?.insertAdjacentHTML('beforebegin', '<div class="ask-pins"></div>'); host = document.querySelector('.ask-pins'); }
    if (host) { host.innerHTML = html; if (!pin.length) host.remove(); else host.querySelectorAll('[data-ask-chip]').forEach(c => c.addEventListener('click', () => invia(c.dataset.askChip))); }
  }

  // Correggere "ho capito": periodo con un tocco, metriche con selezione.
  function apriModifica(tipo, i) {
    const m = thread[i], host = document.getElementById('ask-edit-' + i);
    if (!m || !m._res || !host) return;
    if (!host.hidden && host.dataset.tipo === tipo) { host.hidden = true; return; }
    const res = m._res, c = res.capito || {};
    host.dataset.tipo = tipo;
    const cosaTesto = (c.keys && c.keys.length && c.keys.length < 8) ? c.keys.map(k => ASK.PAROLE[k]).join(' e ') : 'riepilogo';
    if (tipo === 'per') {
      host.innerHTML = `<div class="ask-edit-t">CAMBIA PERIODO</div><div class="ask-chips inline">${PERIODI.map(p => `<button type="button" class="ask-chip" data-ask-ri="${esc(cosaTesto + ' ' + p)}">${esc(p)}</button>`).join('')}</div>`;
    } else {
      const att = new Set(c.keys || []);
      host.innerHTML = `<div class="ask-edit-t">CAMBIA COSA (scegline una o più)</div><div class="ask-chips inline">${ASK.METRICHE_CHIAVI.map(k => `<button type="button" class="ask-chip tog${att.has(k) ? ' on' : ''}" data-k="${k}">${esc(ASK.PAROLE[k])}</button>`).join('')}</div>
        <button type="button" class="ask-act" data-ask-rifai>RIFAI LA DOMANDA ➜</button>`;
    }
    host.hidden = false;
    host.querySelectorAll('[data-ask-ri]').forEach(b => b.addEventListener('click', () => invia(b.dataset.askRi)));
    host.querySelectorAll('.tog').forEach(b => b.addEventListener('click', () => b.classList.toggle('on')));
    host.querySelector('[data-ask-rifai]')?.addEventListener('click', () => {
      const ks = Array.from(host.querySelectorAll('.tog.on')).map(b => ASK.PAROLE[b.dataset.k]);
      if (!ks.length) return UI.toast('Scegli almeno una voce', 'warn');
      const per = c.periodo ? ' ' + c.periodo.replace(/\s*\(.*\)\s*$/, '') : '';
      invia(ks.join(' e ') + per);
    });
  }

  // Analisi approfondita con Claude Code: pacchetto da copiare + risposta da incollare e salvare.
  function copia(testo) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(testo).then(() => true).catch(() => copiaVecchio(testo));
    return Promise.resolve(copiaVecchio(testo));
  }
  function copiaVecchio(testo) {
    try {
      const ta = document.createElement('textarea'); ta.value = testo; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  function apriAnalisi(domandaIniziale) {
    const salvate = leggi(KEY_AN, []);
    const ultimaQ = domandaIniziale || (thread.length ? thread[thread.length - 1].q : '');
    const m = UI.modal(`
      <h2 class="modal-title">🧠 ANALISI APPROFONDITA</h2>
      <div class="ask-an">
        <div class="ask-an-p"><b>1.</b> Scrivi cosa vuoi capire (o lascia la domanda così).</div>
        <input class="ask-input" id="an-q" type="text" value="${esc(ultimaQ)}" placeholder="Es. perché la mia tecnica è calata?" maxlength="300">
        <div class="ask-an-p"><b>2.</b> Copia il pacchetto e incollalo a Claude Code: contiene i tuoi ultimi 30 giorni, gli obiettivi e il verdetto di oggi.</div>
        <button type="button" class="ask-send" id="an-copia">COPIA IL PACCHETTO</button>
        <div class="ask-an-p"><b>3.</b> Quando Claude ti risponde, incolla qui la risposta per tenerla nella cronologia.</div>
        <textarea class="ask-input" id="an-testo" rows="5" placeholder="Incolla qui la risposta di Claude…"></textarea>
        <div class="row" style="justify-content:flex-end;gap:var(--sp-2)"><button type="button" class="btn ghost" data-close>CHIUDI</button><button type="button" class="btn primary" id="an-salva">SALVA ANALISI</button></div>
        ${salvate.length ? `<details class="ask-an-list"><summary>ANALISI SALVATE (${salvate.length})</summary>${salvate.slice().reverse().map(a => `<div class="ask-an-item"><div class="ask-an-d">${esc(new Date(a.ts).toLocaleDateString('it-IT'))} · ${esc(a.domanda || 'analisi generale')}</div><div class="ask-an-t">${esc(a.testo)}</div></div>`).join('')}</details>` : ''}
      </div>`);
    m.el.querySelector('#an-copia').addEventListener('click', () => {
      const pk = ASK.pacchetto(m.el.querySelector('#an-q').value.trim());
      copia(pk).then(ok => UI.toast(ok ? 'Pacchetto copiato: incollalo a Claude Code' : 'Non riesco a copiare: seleziona il testo a mano', ok ? 'ok' : 'warn'));
    });
    m.el.querySelector('#an-salva').addEventListener('click', () => {
      const testo = m.el.querySelector('#an-testo').value.trim();
      if (!testo) return UI.toast('Incolla prima la risposta', 'warn');
      scrivi(KEY_AN, [...leggi(KEY_AN, []), { ts: Date.now(), domanda: m.el.querySelector('#an-q').value.trim(), testo }].slice(-30));
      UI.toast('Analisi salvata', 'ok');
      m.close();
    });
  }

  function bindClear() {
    document.getElementById('ask-clear')?.addEventListener('click', () => {
      thread = []; scrivi(KEY, []);
      const box = document.getElementById('ask-thread');
      if (box) { box.innerHTML = renderThread(); bindThread(); }
      document.getElementById('ask-panel')?.classList.remove('has-thread');
      document.getElementById('ask-clear')?.remove();
    });
  }

  function dettatura(input) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('ask-mic');
    if (!SR || !btn) return;
    let rec = null, attivo = false;
    btn.addEventListener('click', () => {
      if (attivo && rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'it-IT'; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onstart = () => { attivo = true; btn.classList.add('on'); input.placeholder = 'Ti ascolto…'; };
      rec.onresult = (e) => { input.value = Array.from(e.results).map(r => r[0].transcript).join(' '); };
      rec.onerror = () => { UI.toast('Non riesco ad ascoltare: controlla il permesso del microfono', 'warn'); };
      rec.onend = () => { attivo = false; btn.classList.remove('on'); input.placeholder = 'Es. quante flessioni ho fatto la scorsa settimana?'; if (input.value.trim()) { const v = input.value; input.value = ''; invia(v); } };
      try { rec.start(); } catch (e) { /* già in ascolto */ }
    });
  }

  function dopo() {
    if (typeof ASSISTANT_UI !== 'undefined' && ASSISTANT_UI.afterPersona) ASSISTANT_UI.afterPersona();
    const form = document.getElementById('ask-form');
    const input = document.getElementById('ask-input');
    form?.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; invia(v); input.focus(); });
    input?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const dom = thread.map(m => m.q);
      if (!dom.length) return;
      e.preventDefault();
      storiaIdx = e.key === 'ArrowUp' ? Math.min(dom.length - 1, storiaIdx + 1) : Math.max(-1, storiaIdx - 1);
      input.value = storiaIdx >= 0 ? dom[dom.length - 1 - storiaIdx] : '';
    });
    document.querySelectorAll('.ask-bottom [data-ask-chip]').forEach(c => c.addEventListener('click', () => invia(c.dataset.askChip)));
    document.getElementById('ask-analisi')?.addEventListener('click', () => apriAnalisi(''));
    bindThread();
    bindClear();
    dettatura(input);
    const box = document.getElementById('ask-thread');
    if (box) box.scrollTop = box.scrollHeight;
    input?.focus();
  }

  function init() {
    if (typeof ROUTER === 'undefined') return;
    ROUTER.register('assistente/chiedi', () => renderPagina(), dopo);
  }

  return { init, renderPagina };

})();

CHIEDI_UI.init();
document.addEventListener('DOMContentLoaded', () => CHIEDI_UI.init());
