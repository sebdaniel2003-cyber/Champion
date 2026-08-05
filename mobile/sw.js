/* ═══════════════════════════════════════════════════════
   CHAMPION — ASSISTENTE (telefono) · SERVICE WORKER
   ═══════════════════════════════════════════════════════
   Serve a due cose:
   1. rendere l'app installabile in home (senza di lui Chrome non
      propone «Aggiungi a schermata Home»)
   2. farla partire anche senza rete — in palestra il segnale non c'è
      mai. Il guscio è in cache; la frase dettata finisce nella coda
      locale e parte da sola quando la rete torna.

   Le chiamate a Supabase NON vengono mai messe in cache: sono dati
   e autenticazione, servirli vecchi sarebbe peggio che non servirli.
   ═══════════════════════════════════════════════════════ */

const VERSIONE = 'champion-mob-v8.7.2';

// Il parser e il database alimenti stanno fuori da mobile/: sono gli
// stessi file del PC, non copie. Il service worker può comunque
// metterli in cache — intercetta ogni richiesta della pagina che controlla,
// anche fuori dal proprio percorso.
const GUSCIO = [
  './',
  './index.html',
  './style.css',
  './shim.js',
  './net.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  '../js/durata.js',
  '../js/nlp.js',
  '../data/food-db.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSIONE);
    // Uno a uno: se un file manca, gli altri entrano lo stesso
    // (addAll fallisce in blocco e lascerebbe l'app senza guscio).
    await Promise.all(GUSCIO.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[SW] non messo in cache:', url, err.message); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter(n => n !== VERSIONE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function eSupabase(url) {
  return /supabase\.(co|in)$/.test(url.hostname) || url.pathname.startsWith('/auth/v1');
}
function eFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Dati e login: sempre dalla rete, mai dalla cache.
  if (eSupabase(url)) return;

  // Navigazione: rete se c'è, altrimenti il guscio salvato.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); }
      catch {
        const cache = await caches.open(VERSIONE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Font: quello che c'è va bene subito, l'aggiornamento arriva dopo.
  if (eFont(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSIONE);
      const salvato = await cache.match(req);
      const rete = fetch(req).then(r => { cache.put(req, r.clone()); return r; }).catch(() => null);
      return salvato || (await rete) || new Response('', { status: 504 });
    })());
    return;
  }

  // Asset dell'app: prima la cache (l'apertura deve essere istantanea),
  // e intanto si aggiorna in silenzio per la volta dopo.
  //
  // `ignoreSearch` è indispensabile: l'HTML chiede `style.css?v=8.6.0`
  // mentre in cache c'è `style.css`, e senza questo la corrispondenza
  // non avverrebbe mai — offline resterebbe tutto senza stile.
  e.respondWith((async () => {
    const cache = await caches.open(VERSIONE);
    const salvato = await cache.match(req, { ignoreSearch: true });
    const rete = fetch(req).then(r => {
      if (r && r.ok && url.origin === self.location.origin) cache.put(req, r.clone());
      return r;
    }).catch(() => null);
    return salvato || (await rete) || new Response('', { status: 504 });
  })());
});
