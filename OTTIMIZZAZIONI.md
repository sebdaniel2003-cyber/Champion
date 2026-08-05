# CHAMPION SYSTEM v8 — Ottimizzazioni (2026-07-01)

## Modifiche applicate (tutte verificate con smoke test automatico)

### 1. index.html — caricamento parallelo
Tutti gli script ora usano `defer`: download in parallelo, esecuzione in ordine.
Prima: 16 script sequenziali + Chart.js bloccante nell'head.
Aggiunti: favicon inline (niente 404), meta color-scheme/theme-color (niente flash
chiaro sui controlli nativi), aria-label/aria-live per accessibilità, noscript.

### 2. Chart.js locale — js/vendor/chart.umd.min.js
Prima veniva scaricato dal CDN jsdelivr a ogni apertura: senza internet l'Archivio
perdeva tutti i grafici. Ora è nel progetto (stessa v4.4.0, build ufficiale npm).
Il sistema è autonomo. NB: i font Google restano online — se vuoi il 100% offline
scaricali e mettili in una cartella fonts/ con @font-face in base.css.

### 3. Food DB via script tag — data/food-db.js (BUG FIX)
`fetch('data/food-db.json')` da file:// è bloccato dal browser (CORS): su Chrome/Edge
l'autocomplete nutrizione partiva con 0 alimenti. Ora il DB (141 alimenti) è caricato
come script tag: funziona ovunque. Il fetch resta come fallback.
⚠ Se aggiorni food-db.json, rigenera food-db.js (o modifica direttamente il .js).

### 4. js/data.js — save coalescente
Ogni CRUD chiama save() = JSON.stringify dell'intero stato. Le operazioni composite
(compilazione revisione, import, pasti multipli) facevano N stringify di fila.
Ora N mutazioni nello stesso tick = 1 sola scrittura, con flush garantito su
pagehide/visibilitychange (zero rischio di perdita dati). Testato: 5 mutazioni → 1 write.

### 5. js/ui/archivio.js — fix memory leak Chart.js
Uscendo dall'Archivio il router svuotava il DOM ma l'istanza Chart.js restava viva
(listener di resize + riferimenti al canvas rimosso): ogni visita accumulava
un'istanza morta. Ora il chart viene distrutto al cambio di sezione.

## Segnalazioni (non toccate di proposito)

- **css/pages.css (11.232 righe)**: 14 selettori definiti due volte con corpi diversi
  (.area-card, .fond-grid, .macro-card, ...). Sono override intenzionali che funzionano
  per ordine di cascata, ma sono fragili: se riordini il file cambia l'aspetto.
  Prima o poi vale la pena consolidarli a mano.
- **Google Fonts: 16 pesi caricati**. Se non li usi tutti nei CSS, ogni peso tolto
  dalla URL è un download in meno all'avvio.
- **.grain con mix-blend-mode: overlay** a schermo intero: costa un po' di GPU in
  scroll. È una scelta estetica legittima — se mai notassi scatti, è il primo
  indiziato.

# v8.1 — Salto visivo (2026-07-01, secondo passaggio)

## Transizione giallo → violetto
- base.css: token --neon* → violetto (#B45CFF / #CE85FF / #9D4EDD / #6C2BD9), glow e border-glow aggiornati a rgba(180,92,255,·) con le stesse opacità.
- Nuovo set --gold (#FFE600 + soft/softer/border/bright/deep/glow-gold) RISERVATO al concetto Oro.
- --info: #A78BFA → #22D3EE (ciano) per non collidere col nuovo brand violetto.
- 505 occorrenze hardcoded convertite in tutti i CSS/JS/HTML con parser block-aware:
  296 blocchi gold/oro protetti (restano dorati, i loro var(--neon*) → var(--gold*)).
- Preservati: scala semantica voti (votoColor in tecnica.js), goldBurst (già ambra),
  oro-shared.js integrale.

## Rifinitura
- .panel:hover: lift 1px + ombra profonda + anello neon-softer.
- Tap feedback: .btn:active e .card.clickable:active (scale).
- :focus-visible globale (navigazione tastiera).
- body: font-variant-numeric tabular-nums (numeri stabili nei countUp).
- .panel-title: tracking 0.26em + uppercase; .panel-sub: text-dim (gerarchia più netta).

## Chicche
- Chart.js: animazione d'ingresso "a costruzione" per TUTTI i chart via
  Chart.defaults.animation in UI.chartDefaults() (unico punto, lifecycle intoccato).
- Fade-rise dei contenitori chart (.arch-l2-chart-wrap, .pano-modal-chart-wrap,
  .arch-focus-l2-trend-wrap) in fx.css, con prefers-reduced-motion.
- NUOVO: heatmap annuale contribution-graph in ARCHIVIO → REVISIONI (53 settimane ×
  7 giorni, intensità = ore da CS.state.revisioni, tooltip nativi, legenda, meta
  giorni/ore). Funzione renderYearHeatmap() + classi .rev-yheat-* in fondo a pages.css.
- Sparkline: fade progressivo dell'area + pop del dot finale sincronizzati col draw-in.
- Pop-in animato dei trend esistenti (.zone-card-delta, .widget-sub, .trend).

Nota: sparkline animate, ring, heatmap Oro e indicatori di trend testuali esistevano
già — le voci sopra sono ciò che mancava davvero.

# v8.2 — Secondo cervello (2026-07-01, terzo passaggio)

## Nuovo: js/assistant-context.js (context engine)
Contesto unico calcolato una volta per ciclo e condiviso da tutte le regole:
tempo (fascia, giorno, fine mese, PROSSIMO EVENTO dal calendario Focus),
carico (ore 3/7/28gg + ACWR acuto:cronico), trend con regressione lineare
(peso 14gg, sonno 7gg, voti tecnica 30gg, corsa 4vs4), stato (streak, oro,
infortuni, mood, target), gap (giorni dall'ultima pesata/corsa/revisione),
pattern (giorno della settimana sistematicamente saltato), MEMORIA
(assistantHistory finalmente riletta: ack/snooze/goto per regola).

## assistant.js → evaluate v2
- Cooldown post-ack (default 2gg, raddoppia se snoozi spesso: apprendimento).
- Score composito: severity + pertinenza pagina + pertinenza oraria (campo
  opzionale time:'sera'|'mattina') + engagement appreso dalle risposte.
- Matrice conflitti: critica del Recupero → soppresse le regole che spingono
  volume (il cervello non si contraddice).
- buildBriefing(): "IL PUNTO" = STATO · FOCUS · RISCHIO, generato dai dati.
- Retrocompatibile: le 30 regole esistenti funzionano invariate.

## assistant-rules.js: +12 regole di intelligenza incrociata
acwr_alto (critica) · evento_14gg · evento_3gg (taper) · oro_chiudibile
(criteri mancanti ESATTI) · rientro_post_infortunio · dimagrimento_rapido
(>1%/sett) · serbatoio_vuoto (mood×carico) · deriva_tecnica (pendenza 30gg) ·
pattern_giorno_debole · chiusura_settimana (dom sera) · corsa_stallo
(km su, pace giù) · streak_rischio (sera, 0 ore).

## UI
- "IL PUNTO" in testa alla pagina Assistente e strip cliccabile in Dashboard
  (porta all'assistente). Classi .brief-* in fondo a pages.css.
- index.html: +assistant-context.js (defer, prima delle regole).

## Testato (14 check automatici)
ACWR 2.67 su scenario di picco reale · conflitto soppresso con streak 28 ·
evento citato con countdown · trend peso −1.3%/sett rilevato · ack → cooldown
→ regola non riappare · briefing renderizzato in entrambe le pagine.

# v8.3 — Design pass (2026-07-02)

## IL PUNTO redesign
Ring SVG animato col % settimana (verde a target raggiunto), stato in chips
pill che entrano in cascata (ORO dorata, peso con freccia colorata), filo
luminoso superiore colorato dalla severity del focus, icona persona sul focus,
pallino rosso pulsante sul rischio. Layout responsive. Stessi dati, dieci
volte più leggibile.

## COMPILA — fix + redesign
- BUG FIX: la modale era centrata verticalmente → cambiando GIORNALIERA→
  SETTIMANALE la posizione saltava. Ora UI.modal supporta anchorTop e le tre
  modali revisione sono ancorate in alto con altezza fissa: geometria
  IDENTICA nei tre modi.
- Scrolla solo il corpo dello step: testata, switch e pulsanti AVANTI/INDIETRO
  sempre visibili.
- Blocchi campo con accento laterale che si accende al focus, ingresso a
  cascata a ogni step, input ore che si illumina, card sessione con lift e
  cestino a comparsa, linea gradiente sotto la testata.

## ORO polish
Quickstat con ingresso a cascata, lampo dorato periodico sul ring box in
stato oro, righe settimana con accento su hover.

## Sistema
Transizione di pagina morbida a ogni cambio route (router + CSS, 320ms).
Tutte le animazioni rispettano prefers-reduced-motion.

# v8.3.4 — Caccia ai bug + Teoria + Palette (2026-08-04)

## Metodo
I bug sono stati cercati eseguendo davvero l'app in un DOM simulato (jsdom),
visitando tutte e 22 le route, cliccando ogni elemento interattivo e aprendo
ogni modale, con tre rilevatori:
- errori JS runtime (window.error + console.error con stack)
- bottoni **senza alcun listener** (patch di addEventListener prima del boot)
- selettori interrogati ma **mai renderizzati** (confronto statico)

## Bug corretti

### 1. Crash in ARCHIVIO → FISICA → INFORTUNI
`postRenderInfortuni()` veniva chiamata senza l'argomento `fs` in due punti
(`archivio.js` 4286 e 4342) → `TypeError: cannot read 'drillKey' of undefined`.
Effetto: saltavano ring di recupero, entrata a cascata, breathe sugli infortuni
attivi e il grafico timeline. Ora riceve `filterState.infortuni` + fallback interno.

### 2. Filtri data e RESET morti nella stessa vista
`attachInfortuniInlineHandlers` cercava `[data-date-from]`, `[data-date-to]` e
`.arch-l2-filters-reset`, ma `renderDateFilters` emette `.arch-filter-from`,
`.arch-filter-to` e `.arch-l2-filter-reset` (singolare). Tre selettori sbagliati
= tre controlli che non facevano nulla. Allineati.

### 3. Wizard "nuova sessione tecnica" irraggiungibile
`openSessioneWizard` (3 step, completo e funzionante) era agganciato a
`#add-sessione`, un id **mai renderizzato** dopo il redesign ORO. L'optional
chaining `?.` nascondeva il problema. Rimesso il pulsante `+ SESSIONE TECNICA`
nell'intestazione della pagina ORO.

### 4. Profilo non modificabile
`CS.setProfile` esisteva ma non era chiamato da nessuna parte: nome, età,
altezza, peso target e prossimo match erano fissi nel codice. L'età guida la
FCmax delle zone corsa, il peso target guida tutta la pagina PESO e il goal pace.
Aggiunta la sezione PROFILO nelle impostazioni, con validazione dei range e
anteprima live della FCmax.

### 5. Modali sovrapposte con id duplicati
Due modali aperte insieme condividono gli stessi id (`#rev-body`, `#rev-prev`…):
`querySelector` scoped restituiva null e `document.getElementById` leggeva i campi
della modale sbagliata. Aggiunta l'opzione `exclusive` a `UI.modal`, usata dalle
tre modali revisione e dalle impostazioni.

### 6. Guardie mancanti
- `goal-pace-save` leggeva `.value` senza guardia null.
- `.rev-period-prev` senza `?.` in `openWeekly`/`openMonthly`.
- toggle tipo grafico: guardia se il chart non è stato creato.
- qualità sonno: `min`/`max` sull'input non impediscono di digitare 9 su scala
  1-5 → clamp esplicito, altrimenti medie e grafici si sballavano.

### 7. Card AREE/FONDAMENTALI che sembravano cliccabili
Avevano hover con sollevamento e glow ma nessun handler. Ora aprono il voto
di quell'area (con `role="button"`, tabindex e accesso da tastiera).

### 8. Grafici fuori dal sistema tipografico
`Chart.defaults.font.family` era `'Inter'`, font **mai caricato**: tutti i
grafici cadevano su un sans-serif di sistema. Passati a JetBrains Mono, già
caricato e coerente col linguaggio dei dati.

## Novità

### TEORIA — `data/teoria.js` + `tecnica/teoria`
Base di conoscenza: 13 aree tecniche, 7 fondamentali, 6 principi trasversali
(zone FC, ACWR, sonno, peso, oro, come dare voti utili). Ogni voce tecnica ha
definizione, esecuzione corretta, errori frequenti, drill e una **rubrica 3/5/7/9**.

Integrazione:
- Nella modale di voto la rubrica **segue lo slider**: vedi cosa significa il
  numero che stai dando, così i voti restano confrontabili nel tempo.
- Blocco teoria a scomparsa nella stessa modale.
- Sub-tab dedicata con accordion, il tuo voto medio (ultime 3) accanto a ogni
  voce e i livelli già raggiunti evidenziati.

### Palette comandi ⌘K — `js/ui/palette.js`
Ctrl+K (o `/`) apre una ricerca fuzzy su tutte le route, le azioni (compila
revisioni, backup, impostazioni, profilo), il voto diretto di ogni area e
fondamentale e le voci di teoria. Navigazione con frecce, invio, ESC.
Pulsante `CERCA ⌘K` in topbar per la scopribilità.

## Pulizia
- Gli hack `!important` inline in `index.html` (tooltip Oro, pannello dettaglio)
  promossi in fondo a `pages.css`, dove vincono comunque per cascata.
- Cache-buster a `?v=8.3.4` su tutti gli asset modificati.

## Stato finale
22 route visitate, ogni bottone cliccato: **0 errori JS applicativi**,
**0 bottoni senza handler**. Restano solo errori interni a Chart.js dovuti
all'assenza di canvas in jsdom (non si verificano in un browser reale).


# v8.4.0 — Fase 1: l'assistente che registra quello che gli dici (2026-08-04)

Primo pezzo del progetto "assistente sul telefono". Gira **tutto sul PC**, senza
cloud e senza telefono: si scrive in italiano normale e il sistema capisce e
registra. Le fasi 2 (sincronia) e 3 (app Android con la voce) si innestano qui.

## `js/nlp.js` — il parser

Non è un modello di linguaggio. Costruisce il proprio vocabolario **a runtime**
dai cataloghi reali del sistema:

| Fonte | Riconosce |
|---|---|
| `CS.state.cataloghi.tipiAllenamento` (o `CS.TIPI_ALLENAMENTO`) | pugilato, sala pesi, casa, corsa, sparring, tecnica |
| `CS.AREE_TECNICHE` (13) | jab, diretto, gancio, velocità, testa… |
| `CS.FONDAMENTALI` (7) | sacco, corda, sparring, figure… |
| `CS.state.cataloghi.mood` (10) | feroce, stanco, concentrato… |
| `window.FOOD_DB_DATA` (141) | alimenti, con macro calcolate sui grammi |
| `revFieldsConfig.coreVisibility` | flessioni, squat, addominali, km corsa |
| `CS.getEnabledFields('daily').extras` | le metriche custom attivate dall'utente |

Conseguenza voluta: **il vocabolario è il sistema**. Ciò che non esiste non viene
riconosciuto e finisce in `nonRiconosciuto`, senza scrivere nulla. Se si attiva
una metrica custom nelle impostazioni, il parser la capisce dal momento dopo.

Ogni voce ha sinonimi reali (`boxe`→pugilato, `piegamenti`→flessioni,
`distrutto`→stanco). Gestisce numeri in cifre e a parole, "due ore **e mezza**"
come 2.5, unità (h/min/kg/g/km/rip), date relative (ieri, l'altro ieri, lunedì,
"3 agosto", 03/08/2026) e più fatti nella stessa frase.

### Le tre regole che hanno richiesto più cura

1. **Prossimità, non ordine.** In `footwork 9 e difesa 5` il 9 è di footwork
   (prima, distanza 0) non di difesa (dopo, distanza 1). Vince la parola più
   vicina al numero; a parità vince quella dopo, perché "N cosa" è l'ordine
   dominante in italiano.
2. **Finestre strette per le parole chiave.** In `80 squat, ho dormito 8 ore`
   la parola "dormito" è nella finestra dell'80 ma non lo riguarda: sonno e peso
   accettano la parola chiave solo se è a ridosso del numero.
3. **Le unità vincolano il significato.** In `1 ora di sacco e voto 8 al jab`
   l'ora non può essere un voto, anche se "voto" compare nella frase: un numero
   con unità di tempo/peso/distanza è escluso dal ramo dei voti.

Confini di parola tolleranti alla punteggiatura (`di pugilato,` va riconosciuto)
e validazione dei range nelle date (senza, un peso come `93.4` veniva scambiato
per la data 93/4 e spariva dal testo).

`NLP.apply(data, intents)` scrive riusando **solo** le CRUD esistenti
(`addRevisione` che fa upsert per data, `addPasto`, `addAreaVoto`, `addFondVoto`,
`addPesata`, `addSonno`, `addCorsa`). Le modifiche alla revisione si accumulano e
si scrivono in un colpo solo, altrimenti l'upsert sovrascriverebbe.

## `js/ui/inbox.js` — conferma e casella di posta

Nulla viene mai scritto senza che l'utente l'abbia visto. L'anteprima mostra ogni
voce con **valore modificabile a mano** (il vocale sbaglia i numeri), la
possibilità di togliere singole righe, e per i cibi ambigui un menu con le
alternative (`pollo` → Petto/Coscia/Insalata di pollo). Dopo la conferma su un
pasto compare il riepilogo dei macro di oggi sui target.

Due percorsi, una sola schermata:
- **PC**: barra nella pagina ASSISTENTE, `Ctrl+I`, o palette ⌘K → anteprima → conferma
- **Telefono** (fase 3): arriva in coda, badge rosso sull'orb, si rivede con calma

Coda su `localStorage['cs_inbox']`, separata da `cs_v8`: non tocca lo schema
versionato né i backup.

## Integrazione
`assistant.js` (barra + apertura coda), `app.js` (init, Ctrl+I, orb),
`palette.js` (due voci nuove), `index.html`, `css/pages.css`.

## Verifica
- **28 frasi → intent attesi**, incluse le tre dell'utente, numeri a parole, date
  relative, frasi miste e frasi fuori dominio che devono restare senza effetti.
- **Round-trip completo**: parse → apply → rilettura da `localStorage`, con
  verifica che ore e sessioni preesistenti non vengano sovrascritte.
- **Flusso interfaccia**: anteprima, correzione di un valore, rimozione di una
  riga, conferma, riepilogo macro, coda dal telefono, badge, scorciatoie.
- Regressione: 22 route, ogni bottone cliccato → 0 errori applicativi,
  0 tasti senza handler.


# v8.5.0 — Fase 2: il ponte telefono ↔ PC (2026-08-04)

Progetto Supabase `Daniel-System` (`ptgzoafusukmopcsbsqu`, Londra, piano free).

## `js/sync.js`

**Niente libreria supabase-js.** Servono cinque chiamate REST: `fetch` diretto
evita ~100 KB di dipendenza, i problemi di compatibilità col nuovo formato di
chiave (`sb_publishable_…`) e ogni dipendenza da CDN — il sistema gira da `file://`.

- `registrati` / `accedi` / `esci` + refresh automatico del token (1 min di margine
  prima della scadenza; se il refresh fallisce, disconnette invece di ritentare a vuoto)
- `pushSnapshot` — upsert su `champion_snapshot`, saltato se il contenuto non è
  cambiato (confronto per hash)
- `pullInbox` — messaggi `pending`, consegnati a `INBOX.ingest`
- `chiudi(ids)` — li marca `applied` sul server
- Ciclo ogni 60s + pull al ritorno sulla scheda + push su `pagehide`

**Scelta rivista rispetto al piano:** non si pubblica l'intero `cs_v8` ma un
**contesto compatto (1,7 KB misurati)** — totali di oggi, ultimo peso, target
nutrizionali e il vocabolario per il parser. Mandare tutto l'archivio a ogni
salvataggio avrebbe consumato la banda del piano gratuito e messo online molto
più del necessario. Al telefono serve solo questo.

Aggancio: `data.js` ora emette `cs:saved` (simmetrico a `cs:save-error`), su cui
il push si mette in ascolto con debounce di 20 secondi.

## `INBOX.ingest`
Assorbe i messaggi remoti in modo idempotente (traccia `remoteId`, il polling non
duplica). Se il telefono ha già interpretato la frase usa i suoi intent, altrimenti
la rilegge con lo stesso parser. Alla conferma o allo scarto chiude anche sul server.

## Sezione SINCRONIA nelle impostazioni
Stato, registrazione/accesso, ultimo scambio, "sincronizza ora", disconnetti.
URL e chiave **precompilati**: non c'è nulla da incollare. In "avanzate" si possono
cambiare e c'è l'interruttore per spegnere tutto e tornare al solo locale.

## Configurazione Supabase applicata
- Tabelle `champion_snapshot` e `champion_inbox` + indice sui pending
- **RLS attiva e verificata**: una scrittura anonima viene respinta con
  `new row violates row-level security policy`
- **Conferma email disattivata**: il servizio mail del piano gratuito ha un tetto
  bassissimo (una prova ha restituito `over_email_send_rate_limit`), quindi la
  registrazione via email avrebbe potuto lasciare l'utente chiuso fuori.
  Le protezioni restano quelle RLS, che sono ciò che davvero difende i dati.

## Verifica end-to-end (contro il Supabase reale)
1. registrazione → sessione immediata
2. il "telefono" accoda `2 ore allenamento, 1 ora sala pesi 1 ora pugilato`
3. il PC lo scarica e lo interpreta in 3 voci
4. conferma → revisione scritta: `oreAllenamento 2`, sessioni `pesi 1h` + `pugilato 1h`
5. il messaggio risulta `applied` sul server
6. contesto pubblicato e rileggibile, 1,7 KB
7. righe di test rimosse

Nota: `fetch` non esiste in jsdom — nei test va esposto quello di Node, altrimenti
il modulo fallisce silenziosamente (l'errore finisce in `console.warn`).

Regressione: 22 route, ogni bottone → 0 errori applicativi, 0 tasti senza handler,
28/28 frasi del parser. Con la sincronia spenta (stato di default) non parte
nessuna chiamata di rete.


# v8.6.0 — Fase 3: l'app sul telefono (2026-08-05)

`mobile/` — una PWA installabile in home, **separata e leggera**: solo
l'assistente, non tutto Champion. Il sistema sul PC resta esattamente dov'è,
su `file://`, coi dati intatti. Nessuna migrazione, nessun rischio.

## Il parser è lo stesso file, non una copia

`mobile/index.html` carica `../js/nlp.js` e `../data/food-db.js`. Se fossero
duplicati, prima o poi telefono e PC capirebbero la stessa frase in due modi
diversi — e il giorno che succede non te ne accorgi.

Il parser però costruisce il vocabolario da un oggetto globale `CS`, che sul
telefono non esiste e non deve esistere: il telefono non possiede lo stato.
`mobile/shim.js` mette al suo posto un CS ridotto all'osso, alimentato dal
contesto che il PC pubblica su `champion_snapshot`. Sono getter, non copie:
il contesto arriva dalla rete dopo il primo render e il vocabolario deve
vedere subito quello nuovo.

**Quando il vocabolario non c'è** (primo avvio, PC mai aperto) il telefono non
tira a indovinare: manda la frase grezza con `intents: []` e la rilegge il PC,
che i cataloghi veri li ha. `INBOX.ingest` era già scritto per questo caso.
E non dice «non ho capito» — dice che manca il vocabolario e come farlo
arrivare, perché è quella la causa.

## `mobile/net.js`
Le tre chiamate che servono (accesso, lettura snapshot, scrittura in coda) in
REST puro, come sul PC. Se la rete manca l'invio finisce in una coda locale e
riparte da solo al ritorno online: si detta in palestra col telefono che non
prende e la frase non si perde. In coda finiscono solo i guasti di rete — un
rifiuto del server verrebbe riprovato all'infinito senza motivo.

## `mobile/app.js`
Dettatura con Web Speech API (`it-IT`, integrata in Chrome Android, gratis).
Chiudere la bocca è già la conferma: alla fine del riconoscimento la frase
viene letta senza chiedere altro. Se il browser non detta (Safari) non c'è un
tasto finto: lo dice e si scrive.

L'anteprima ha i valori **modificabili a mano** — il vocale sbaglia i numeri —
le alternative per i cibi ambigui, e **il giorno correggibile**: se la frase
non diceva quando, il parser mette oggi, e a volte si racconta la sera prima.

## `mobile/sw.js` + `manifest.json`
Guscio in cache, quindi apertura istantanea e funzionamento offline; senza
service worker Chrome non proporrebbe nemmeno «Aggiungi a schermata Home».
Le chiamate a Supabase non vengono mai messe in cache: sono dati e
autenticazione, servirli vecchi sarebbe peggio che non servirli.

Dettaglio che costa caro se sfugge: `cache.match` va chiamato con
`ignoreSearch`, perché l'HTML chiede `style.css?v=8.6.0` mentre in cache c'è
`style.css` — senza, offline resterebbe tutto senza stile.

Icone generate a codice (due spade incrociate, 192/512/maskable).

## Verifica
**44 prove sull'interfaccia** in jsdom col fetch finto ma il codice vero:
accesso, credenziali sbagliate, contesto a schermo, dettatura, correzione dei
valori, rimozione di righe, coda offline e ripartenza al ritorno della rete,
alternative dei cibi con ricalcolo delle macro, frase fuori dominio.

**28 prove end-to-end contro il Supabase reale**, giro completo:
1. il PC pubblica lo snapshot (1,9 KB, coi 13 aree e 7 fondamentali)
2. il telefono accede, lo scarica, vede l'ultimo peso scritto sul PC
3. detta «2 ore allenamento, 1 ora sala pesi 1 ora pugilato» → 3 voci
4. la riga arriva sul server con `origine=telefono`, `stato=pending`
5. il PC la scarica, non la duplica al secondo giro, la mostra in casella
6. si preme il vero tasto REGISTRA → revisione scritta (`oreAllenamento 2`,
   due sessioni) e messaggio `applied` sul server
7. righe di prova cancellate

Verificato anche che senza login il database rifiuta la scrittura.

## Riparazione
`OTTIMIZZAZIONI.md` conteneva 77 sequenze di caratteri corrotti, lasciate
dall'append della sessione precedente (`Add-Content -Encoding UTF8` su un file
già UTF-8 ricodifica i byte multi-byte come se fossero Latin-1). Sistemate.


# v8.7.0 — mai più 0,75 (2026-08-05)

Provata sul campo, la Fase 3 ha mostrato che il sistema ragionava come un
database e non come una persona: «45 min di allenamento» diventava `0,75`,
«una sessione di allenamento oggi» non produceva niente, e ogni frase dettata
andava riconfermata sul PC anche quando era già stata riletta sul telefono.

## Le durate

**Sotto l'ora si scrive in minuti, dall'ora in su in ore.** `0,75` → *45 min*,
`1,5` → *1 ora e 30 min*, `2` → *2 ore*. Sotto l'ora la lettera `h` non compare
mai, e il formato decimale non appare più da nessuna parte.

Su disco resta tutto com'era (`oreAllenamento: 1.5`): su quel numero si reggono
medie, criteri oro, confronti fra periodi e ogni grafico già scritto. È formato
interno, come i millisecondi dentro una data — semplicemente non lo vedi più.
Nessuna migrazione, nessun rischio sui dati esistenti.

`js/durata.js` (nuovo) tiene la regola, ed è **caricato sia dal PC sia dal
telefono**: un file solo, come già `js/nlp.js`. `CS.fmtDurata` lo espone accanto
agli altri formattatori. Esiste anche una forma **compatta** (`1h30`, `45min`)
per assi e tooltip dei grafici, dove «1 ora e 30 min» sopra ogni colonna
renderebbe tutto illeggibile.

Convertiti ~45 punti in 9 file — archivio, dashboard, regole dell'assistente,
tecnica, fisica, oro, telefono. Uno per uno e non a tappeto: nella stessa forma
(`x.toFixed(1)}h`) erano scritti anche il rapporto di carico, i voti e i
chilometri, che ore non sono.

`FX.countUp` ha ora un'opzione `format`: senza, un numero che sale non poteva
scriversi «1 ora e 30 min».

**Inserimento**: i campi di durata (sessioni e sonno nella modale COMPILA, log
del sonno in FISICA) sono in **minuti**, passo 5, con sotto la lettura in chiaro
che segue quello che digiti. Il campo del sonno è diventato *ore + minuti*
separati: nessuno pensa il proprio sonno come «7,5».

**Nel parser** gli intent di durata viaggiano in minuti (`{valore: 45, unita:
'min'}`) e tornano ore solo in `NLP.apply`, al momento di scrivere. I messaggi
già in coda nel formato vecchio continuano a funzionare.

## Le date

Aggiunte: **domani**, **dopodomani**, «3 giorni fa», «una settimana fa», «il
primo agosto», «12 marzo 2025» con l'anno, «il 12» da solo. Già funzionavano
oggi/ieri/l'altro ieri, i giorni della settimana, «12 marzo» e `3/8`.

Senza anno vale l'occorrenza **passata** più vicina: un diario racconta ciò che
è già successo. Fanno eccezione domani e dopodomani, che sono esplicitamente in
avanti. La negazione sul «il 12» evita di scambiare per data una quantità
(«il 12 di sacco» non è il dodici del mese).

## La sessione come cosa contabile

«una sessione di allenamento oggi» non produceva niente: il numero veniva letto
ma nessuna regola sapeva cosa fosse una sessione. Ora *una sessione*, *due
sessioni di pugilato*, *tre sessioni da 45 min* e *oggi ho fatto sparring*
diventano sessioni vere. Senza durata la voce nasce **a zero e te la chiede
l'anteprima** — meglio che inventare un'ora che non hai fatto.

Aggiunti anche i modi di dire (`mezz'ora`, `un quarto d'ora`, `tre quarti
d'ora`, `un'ora e 30`, `un'oretta`), il confronto **per radice** sui plurali
(«ganci» trova «Gancio» senza doverli elencare tutti) e una cinquantina di alias
nuovi su tipi, aree, fondamentali e umori.

## La conferma sul PC diventa una scelta

Interruttore in impostazioni → SINCRONIA, **spento di default**. Acceso, il PC
registra da sé le frasi in cui il parser non ha avuto dubbi e te lo dice con un
messaggio. Basta una voce incerta — una sessione senza durata, un cibo ambiguo —
e il messaggio resta in casella ad aspettarti. La comodità dove è sicura, il
doppio controllo dove serve.

## Il telefono risponde, non solo registra

Lo snapshot porta ora anche **obiettivi in corso**, **stato della settimana
d'oro** (cosa manca ancora) e gli **ultimi 7 giorni**. Il telefono li mostra
sotto i numeri di oggi. Resta sotto i 3 KB.

## Il cibo

Fuori da questo giro per scelta: continua a capire i grammi espliciti
(«200 grammi di pollo»). Il piatto composto — «una ciotola con una scatoletta di
tonno, insalata, due mozzarelle…» — richiede una tabella di pezzature e una
lettura a segmenti, e si affronta quando serve.

## Verifica — 112 controlli

- **29 frasi** col vocabolario vero, incluse tutte quelle chieste dall'utente e
  le preesistenti come rete anti-regressione
- **7 prove sulle durate**: tutte le 22 route visitate con dati veri, cercando
  il formato decimale nel testo prodotto. Ne ha trovata una che era sfuggita a
  mano (il target sul grafico del sonno). Più i campi di inserimento in minuti
- **44 prove sull'interfaccia** del telefono
- **32 end-to-end** contro il Supabase reale, col giro completo e l'interruttore
  in entrambe le posizioni: acceso, la frase certa si registra da sola e quella
  incerta resta in casella; sul server risultano chiuse solo le prime

**Un bug del banco di prova, non dell'app:** l'harness inlinava gli script
dentro `<head>` perdendo il `defer`, quindi giravano prima che il `<body>`
esistesse e tutto il codice tipo `getElementById('btn-compila')?.addEventListener`
falliva in silenzio. Sembravano cinque tasti morti in topbar. Ora gli script
inlinati vanno in fondo al body, che è ciò che `defer` garantisce davvero.

