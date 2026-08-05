#!/usr/bin/env node
/**
 * Converti un export JSON v7 (cs_v7) in JSON v8 (cs_v8) importabile.
 * Uso:  node convert-v7-to-v8.js <input.json> <output.json>
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(d) {
  d = d instanceof Date ? d : new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { createdAt: new Date().toISOString(), lastBackupAt: null, importedFromV7: true },
    profile: { nome: 'DANIEL', eta: 26, altezza: 188, pesoTarget: 91, prossimoMatch: null },
    visione: { y1: '', y3: '', y5: '' },
    eventi: [],
    revisioni: [],
    revSettimanali: [],
    revMensili: [],
    pesate: [],
    sonno: [],
    pasti: [],
    corsa: [],
    infortuni: [],
    areeVoti: [],
    fondVoti: [],
    sessioni: [],
    obiettivi: [],
    goalPace: { dataTarget: null },
    criteriOro: {
      sett: { giorniAllenamento: 6, oreMinime: 2, flessioniGiorno: 50, squatGiorno: 50, corseSett: 3 },
      mese: { settimaneTop: 3 },
    },
    targetSett: { oreAllenamento: 12, kmCorsa: 20, sessioni: 5 },
    targetNutrizione: { kcal: 3000, pro: 165, carb: 360, fat: 85 },
    assistantHistory: [],
  };
}

function num(x) {
  if (x === null || x === undefined || x === '') return 0;
  const n = Number(x);
  return isNaN(n) ? 0 : n;
}

function migrateV7(v7) {
  const s = emptyState();

  // ── PROFILE ──
  if (v7.pesoTarget) s.profile.pesoTarget = num(v7.pesoTarget);
  if (v7.matchDate && v7.matchDate !== 'TBD') {
    s.profile.prossimoMatch = v7.matchDate;
  }

  // ── PESO corrente (se presente) ──
  if (v7.peso && num(v7.peso) > 0) {
    s.pesate.push({
      id: uid(),
      data: todayISO(),
      kg: num(v7.peso),
      note: 'Importato da v7'
    });
  }

  // ── REVISIONI GIORNALIERE ──
  if (Array.isArray(v7.archDaily)) {
    s.revisioni = v7.archDaily.map(r => ({
      id: String(r.id || uid()),
      data: r.data,
      sett: r.sett || '',
      allena: r.allena || '',
      bene: r.bene || '',
      male: r.male || '',
      migliora: r.migliora || '',
      tecnica: num(r.tecnica),
      soddi: num(r.soddi),
      affat: num(r.affat),
      mood: r.mood || '',
      ore: r.ore || '',
      oreH: num(r.oreH),
      km: num(r.km),
      mincorsa: r.mincorsa || '',
      lettura: r.lettura || '',
      social: num(r.social),
      sonno: num(r.sonno),
      objPct: num(r.objPct),
      domani: r.domani || '',
      rifless: r.rifless || ''
    }));
  }

  // ── REVISIONI SETTIMANALI ──
  if (Array.isArray(v7.archWeekly)) {
    s.revSettimanali = v7.archWeekly.map(w => ({
      id: String(w.id || uid()),
      periodo: w.periodo || '',
      sett: w.sett || '',
      sessioni: w.sessioni || '',
      mT: num(w.mT),
      mS: num(w.mS),
      mA: num(w.mA),
      ore: w.ore || '',
      oreH: num(w.oreH),
      diff: w.diff || '',
      km: num(w.km),
      social: num(w.social),
      mood: w.mood || '',
      bene: w.bene || '',
      male: w.male || '',
      migliora: w.migliora || '',
      obv: w.obv || '',
      pct: num(w.pct),
      rifless: w.rifless || ''
    }));
  }

  // ── REVISIONI MENSILI ──
  if (Array.isArray(v7.archMonthly)) {
    s.revMensili = v7.archMonthly.map(m => ({
      id: String(m.id || uid()),
      ...m
    }));
  }

  // ── AREE TECNICHE (storico voti) ──
  if (Array.isArray(v7.areeSt)) {
    s.areeVoti = v7.areeSt.map(v => ({
      id: String(v.id || uid()),
      data: v.data,
      area: v.area,
      voto: num(v.voto),
      bene: v.bene || '',
      male: v.male || '',
      migliora: v.migliora || ''
    }));
  }

  // ── FONDAMENTALI (storico voti) ──
  if (Array.isArray(v7.fondSt)) {
    s.fondVoti = v7.fondSt.map(v => ({
      id: String(v.id || uid()),
      data: v.data,
      esercizio: v.eser || v.area || '',
      voto: num(v.voto),
      bene: v.bene || '',
      male: v.male || '',
      migliora: v.migliora || ''
    }));
  }

  // ── OBIETTIVI MENSILI (correnti) ──
  const periodoMese = monthKey(new Date());
  if (Array.isArray(v7.obv)) {
    v7.obv.forEach(o => {
      s.obiettivi.push({
        id: uid(),
        descrizione: o.n || '',
        categoria: 'libero',
        unita: o.u || '',
        target: num(o.tn) || num(o.t) || 0,
        scadenza: 'mensile',
        periodo: periodoMese,
        auto: false,
        completed: false,
        currentManual: num(o.c)
      });
    });
  }

  // ── OBIETTIVI ANNUALI ──
  const annoCorrente = String(new Date().getFullYear());
  if (Array.isArray(v7.annuali)) {
    v7.annuali.forEach(o => {
      const totale = Array.isArray(o.v) ? o.v.reduce((a, b) => a + num(b), 0) : 0;
      s.obiettivi.push({
        id: uid(),
        descrizione: o.n || '',
        categoria: 'libero',
        unita: '',
        target: num(o.t) || 0,
        scadenza: 'annuale',
        periodo: annoCorrente,
        auto: false,
        completed: false,
        currentManual: totale,
        progressiMese: Array.isArray(o.v) ? o.v.slice() : []
      });
    });
  }

  // ── OBIETTIVI MENSILI ARCHIVIATI (mesi passati) ──
  if (Array.isArray(v7.archObj)) {
    v7.archObj.forEach(arc => {
      if (!Array.isArray(arc.obv)) return;
      // Genera periodo YYYY-MM dal campo mese/anno
      const meseMap = {
        'Gennaio': '01', 'Febbraio': '02', 'Marzo': '03', 'Aprile': '04',
        'Maggio': '05', 'Giugno': '06', 'Luglio': '07', 'Agosto': '08',
        'Settembre': '09', 'Ottobre': '10', 'Novembre': '11', 'Dicembre': '12'
      };
      const mm = meseMap[arc.mese] || '01';
      const periodo = `${arc.anno || annoCorrente}-${mm}`;
      arc.obv.forEach(o => {
        s.obiettivi.push({
          id: uid(),
          descrizione: o.n || '',
          categoria: 'libero',
          unita: o.u || '',
          target: num(o.tn) || num(o.t) || 0,
          scadenza: 'mensile',
          periodo,
          auto: false,
          completed: num(o.c) >= (num(o.tn) || num(o.t) || 1),
          currentManual: num(o.c),
          archiviato: true
        });
      });
    });
  }

  // ── SONNO LOG (se presente) ──
  if (Array.isArray(v7.sonnoLog)) {
    s.sonno = v7.sonnoLog.map(x => ({
      id: String(x.id || uid()),
      data: x.data || x.d,
      ore: num(x.ore),
      qualita: num(x.qualita) || 3
    }));
  }

  // Estrai ore sonno dalle revisioni daily (se presente nel campo sonno)
  if (Array.isArray(v7.archDaily)) {
    v7.archDaily.forEach(r => {
      const ore = num(r.sonno);
      if (ore > 0 && r.data) {
        const exists = s.sonno.find(x => x.data === r.data);
        if (!exists) {
          s.sonno.push({
            id: uid(),
            data: r.data,
            ore,
            qualita: 3
          });
        }
      }
    });
  }

  return s;
}

// ── MAIN ──
const inFile = process.argv[2];
const outFile = process.argv[3];
if (!inFile || !outFile) {
  console.error('Uso: node convert-v7-to-v8.js <input.json> <output.json>');
  process.exit(1);
}

const v7 = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
const v8 = migrateV7(v7);
fs.writeFileSync(outFile, JSON.stringify(v8, null, 2), 'utf-8');

console.log('✓ Conversione completata');
console.log(`  Revisioni giornaliere: ${v8.revisioni.length}`);
console.log(`  Revisioni settimanali: ${v8.revSettimanali.length}`);
console.log(`  Aree voti: ${v8.areeVoti.length}`);
console.log(`  Fondamentali voti: ${v8.fondVoti.length}`);
console.log(`  Obiettivi: ${v8.obiettivi.length}`);
console.log(`  Sonno: ${v8.sonno.length}`);
console.log(`  Pesate: ${v8.pesate.length}`);
console.log(`  Output: ${path.resolve(outFile)}`);
