/* ═══════════════════════════════════════════════════════
   CHAMPION — ASSISTENTE (telefono) · ADATTATORE PER "CHIEDI"
   ═══════════════════════════════════════════════════════
   `js/ask.js` e `js/ui/chiedi.js` sono GLI STESSI file del PC (non copie:
   così le risposte non possono divergere). Pensano di girare dentro il
   sistema completo e chiamano CS, CALC, ASSISTANT, ROUTER, UI, INBOX.
   Qui sul telefono non esiste niente di tutto questo, quindi questo file
   mette al loro posto il minimo indispensabile, alimentato dallo STORICO
   di 90 giorni che il PC pubblica su `champion_snapshot` (ctx.storico).

   Il telefono non scrive mai i dati: l'unica "scrittura" è la frase
   dettata che finisce nella coda e che confermi sul PC (INBOX.capture).
   ═══════════════════════════════════════════════════════ */

/* ─── Date, nello stesso modo del PC (ora LOCALE) ─────── */
Object.assign(CS, {
  isoDateOnly(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  monthKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },
  weekKey(date) {
    const d = new Date(date instanceof Date ? date : date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  },
});

/* ─── CALC: solo le tre funzioni che CHIEDI usa ───────── */
const CALC = (function () {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const avg = (a) => a.length ? sum(a) / a.length : 0;

  function lunediDellaSettimanaIso(periodo) {          // 'YYYY-Www' → Date del lunedì ISO
    const [y, w] = periodo.split('-W').map(Number);
    const g4 = new Date(y, 0, 4);
    const lun1 = new Date(g4); lun1.setDate(g4.getDate() - ((g4.getDay() + 6) % 7));
    const lun = new Date(lun1); lun.setDate(lun1.getDate() + (w - 1) * 7);
    return lun;
  }

  function revsDelPeriodo(o) {
    const S = CS.state.revisioni || [];
    const p = String(o.periodo || '');
    if (o.scadenza === 'giornaliero') return S.filter(r => r.data === p);
    if (o.scadenza === 'settimanale') {
      const lun = lunediDellaSettimanaIso(p);
      const da = CS.isoDateOnly(lun);
      const a = CS.isoDateOnly(new Date(lun.getFullYear(), lun.getMonth(), lun.getDate() + 6));
      return S.filter(r => r.data >= da && r.data <= a);
    }
    if (o.scadenza === 'mensile') return S.filter(r => r.data.slice(0, 7) === p);
    if (o.scadenza === 'annuale') return S.filter(r => r.data.slice(0, 4) === p);
    return [];
  }

  // Stesse regole di CALC.progressObiettivo del PC, per le categorie che hanno senso qui.
  function progressObiettivo(o) {
    if (!o.auto) {
      const cur = o.completed ? o.target : (o.currentManual || 0);
      return { current: cur, pct: o.target > 0 ? Math.min(100, (cur / o.target) * 100) : 0 };
    }
    const revs = revsDelPeriodo(o);
    let current = 0;
    switch (o.categoria) {
      case 'ore': current = sum(revs.map(r => Number(r.oreAllenamento) || 0)); break;
      case 'sessioni': current = revs.filter(r => !r.riposo && r.oreAllenamento > 0).length; break;
      case 'flessioni': current = sum(revs.map(r => Number(r.flessioni) || 0)); break;
      case 'squat': current = sum(revs.map(r => Number(r.squat) || 0)); break;
      case 'addominali': current = sum(revs.map(r => Number(r.addominali) || 0)); break;
      case 'km': current = sum(revs.map(r => Number(r.kmCorsa) || 0)); break;
      case 'tecnica': current = avg(revs.map(r => r.tecnica).filter(Boolean)); break;
      case 'sonno': current = avg(revs.map(r => Number(r.sonnoOre) || 0).filter(Boolean)); break;
      default: current = 0;          // peso e metriche personalizzate: non calcolabili da qui
    }
    return { current, pct: o.target > 0 ? Math.min(100, (current / o.target) * 100) : 0 };
  }

  // Giorni di allenamento consecutivi (il riposo dichiarato non interrompe), come sul PC.
  function streakDays() {
    const revs = [...(CS.state.revisioni || [])].sort((a, b) => b.data.localeCompare(a.data));
    if (!revs.length) return 0;
    let streak = 0;
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const iso = CS.isoDateOnly(cursor);
      const rev = revs.find(r => r.data === iso);
      if (rev && !rev.riposo && rev.oreAllenamento > 0) streak++;
      else if (rev && rev.riposo) { /* il riposo non rompe la serie */ }
      else { if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; } break; }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  // La serie più lunga di giorni CONSECUTIVI con revisione (nei dati disponibili).
  function streakMax() {
    const days = (CS.state.revisioni || []).map(r => r.data).sort();
    if (!days.length) return { val: 0, start: null, end: null };
    let best = { val: 1, start: days[0], end: days[0] }, cur = 1, curStart = days[0];
    for (let i = 1; i < days.length; i++) {
      const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
      if (diff === 1) { cur++; } else { cur = 1; curStart = days[i]; }
      if (cur > best.val) best = { val: cur, start: curStart, end: days[i] };
    }
    return best;
  }

  return { progressObiettivo, streakDays, streakMax };
})();

/* ─── ASSISTANT: il verdetto lo calcola il PC e arriva già pronto ── */
const ASSISTANT = {
  evaluate() { /* niente da valutare qui */ },
  getVerdict() {
    const c = CTX.get();
    return (c && c.verdetto) || null;
  },
};
const ASSISTANT_UI = { pageHeader() { return ''; }, afterPersona() { /* nessuna barra di schede */ } };

/* ─── ROUTER: registra la pagina CHIEDI e basta ───────── */
const ROUTER = {
  _pagine: {},
  register(percorso, render, dopo) { this._pagine[percorso] = { render, dopo }; },
  go(sezione) {
    // Dal telefono non si va alle altre pagine del PC: lo dico, invece di non fare niente.
    if (typeof APP !== 'undefined' && APP.toast) APP.toast('Questa pagina è solo sul PC', 'warn');
  },
};

/* ─── UI: toast e finestra, nel linguaggio dell'app del telefono ── */
const UI = {
  toast(testo, tipo) { if (typeof APP !== 'undefined' && APP.toast) APP.toast(testo, tipo === 'warn' ? 'warn' : 'ok'); },
  modal() { return { el: document.createElement('div'), close() {} }; },   // non usata sul telefono
};

/* ─── INBOX: "ho fatto 60 flessioni" passa dalla dettatura già esistente ── */
const INBOX = {
  count() { return 0; },
  capture(testo) { if (typeof APP !== 'undefined' && APP.registraTesto) APP.registraTesto(testo); },
};

window.CHIEDI_SENZA_ANALISI = true;    // l'analisi approfondita con Claude resta sul PC
