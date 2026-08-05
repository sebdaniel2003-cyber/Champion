/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — BASE DI CONOSCENZA (TEORIA)
   ═══════════════════════════════════════════════════════
   Perché esiste: votare "Jab 6/10" senza un riferimento è un
   numero arbitrario. Qui ogni area e ogni fondamentale ha una
   RUBRICA (cosa significa 3, 5, 7, 9) così i voti nel tempo
   restano confrontabili — è ciò che rende leggibili i trend
   di TECNICA e dell'ARCHIVIO.

   Struttura di ogni voce:
     cosa    → definizione operativa in una riga
     chiave  → i punti che distinguono l'esecuzione corretta
     errori  → gli sbagli più frequenti (da cercare nei video)
     allena  → drill concreti per migliorarla
     rubrica → ancore di autovalutazione per il voto 1-10
   ═══════════════════════════════════════════════════════ */

const TEORIA = (function () {

  const aree = {
    'Jab': {
      cosa: 'Il colpo di misura: apre la distanza, disturba, prepara tutto il resto.',
      chiave: [
        'Parte dalla guardia senza caricare: se telefoni il jab, hai perso il jab.',
        'La spalla sale a coprire il mento nel momento dell’estensione.',
        'Il ritorno è veloce quanto l’andata — la mano torna a casa, non cade.',
        'Il piede avanti accompagna: il jab è un colpo di gambe, non di braccio.',
      ],
      errori: [
        'Abbassare la mano prima di partire (segnale visibile a un metro).',
        'Restare con il braccio esteso dopo l’impatto.',
        'Jab "a braccio" senza rotazione: tanta fatica, poco effetto.',
      ],
      allena: [
        'Sacco: 3 round di soli jab, alternando singolo / doppio / jab al corpo.',
        'Specchio: 2 minuti controllando solo il ritorno della mano.',
        'Corda + jab a vuoto: 30" corda, 30" jab, per 6 giri.',
      ],
      rubrica: {
        3: 'Arriva, ma è lento e prevedibile; la mano torna in ritardo.',
        5: 'Buona meccanica da fermo, si sfalda in movimento.',
        7: 'Veloce e coperto, lo usi per entrare e uscire.',
        9: 'Lo usi per comandare la distanza e costruire: l’avversario reagisce a te.',
      },
    },
    'Diretto': {
      cosa: 'Il colpo di potenza sulla linea centrale: nasce dal piede posteriore.',
      chiave: [
        'La catena è piede → anca → spalla → mano, in quest’ordine.',
        'Il tallone posteriore ruota verso l’esterno: se resta piantato, la potenza resta a terra.',
        'La mano opposta protegge il mento per tutta la durata del colpo.',
      ],
      errori: [
        'Sbilanciarsi in avanti: perdi equilibrio e ti esponi al contro.',
        'Partire con la spalla invece che con l’anca.',
        'Tirarlo isolato invece che dopo un jab che apre la strada.',
      ],
      allena: [
        'Sacco: jab-diretto, curando che il secondo colpo parta dalla rotazione.',
        'Vuoto con elastici o pesi leggeri (max 1-2 kg) per la traiettoria.',
        'Figure: diretto solo su chiamata, per allenare il tempo.',
      ],
      rubrica: {
        3: 'Colpo di braccio, poca rotazione, resti scoperto.',
        5: 'Rotazione presente ma perdi equilibrio nel ritorno.',
        7: 'Potente e bilanciato, riparti subito dopo.',
        9: 'Lo piazzi nel tempo giusto, non quando lo decidi tu ma quando si apre.',
      },
    },
    'Gancio': {
      cosa: 'Colpo circolare corto per la media-corta distanza: chiude le linee laterali.',
      chiave: [
        'Gomito all’altezza del pugno: se il gomito scende, diventa uno schiaffo.',
        'La rotazione è del busto e del piede, non della spalla da sola.',
        'La distanza giusta è più corta di quella del diretto: devi entrare prima.',
      ],
      errori: [
        'Braccio troppo esteso: perdi potenza e telegrafi.',
        'Guardare il bersaglio girando la testa e scoprire il mento.',
        'Non riportare la mano: dopo un gancio si rientra sempre in guardia.',
      ],
      allena: [
        'Sacco a distanza ravvicinata: solo ganci, controllando l’angolo del gomito.',
        'Combinazioni jab-diretto-gancio per allenare la transizione di distanza.',
      ],
      rubrica: {
        3: 'Angolo del gomito incostante, poca rotazione.',
        5: 'Buono da fermo, fatichi a piazzarlo dopo altri colpi.',
        7: 'Compatto e potente, esce naturale in combinazione.',
        9: 'Lo usi come colpo di chiusura o di contro, con la guardia sempre intatta.',
      },
    },
    'Montante': {
      cosa: 'Colpo verticale dal basso: lavora sotto la guardia, alla corta distanza.',
      chiave: [
        'Piegare le gambe, non il busto: la spinta viene dal basso.',
        'Traiettoria corta e verticale — se diventa larga, è telefonato.',
        'La mano libera resta alta: è il colpo che espone di più.',
      ],
      errori: [
        'Caricare abbassando la mano: si vede da lontano.',
        'Usarlo alla lunga distanza, dove non arriva e ti sbilancia.',
        'Sbilanciare la testa in avanti nell’esecuzione.',
      ],
      allena: [
        'Sacco: gancio-montante alla corta, curando la spinta delle gambe.',
        'Figure alla corta distanza per trovare il varco sotto la guardia.',
      ],
      rubrica: {
        3: 'Colpo largo, parte dal braccio, ti sbilanci.',
        5: 'Meccanica corretta ma lo usi alla distanza sbagliata.',
        7: 'Corto e potente, lo inserisci alla corta senza scoprirti.',
        9: 'Lo usi per rompere una guardia chiusa e concatenarci sopra.',
      },
    },
    'Difesa': {
      cosa: 'Tutto ciò che ti fa non prendere: guardia, parate, schivate, blocchi.',
      chiave: [
        'La difesa migliore è la posizione: distanza e angolo prima delle mani.',
        'Occhi sempre sull’avversario — non chiudere gli occhi né girare la testa.',
        'Dopo ogni difesa deve esserci una risposta, altrimenti subisci e basta.',
      ],
      errori: [
        'Arretrare in linea retta: resti nel raggio del colpo successivo.',
        'Guardia alta ma gomiti larghi: il corpo resta scoperto.',
        'Difendere con le braccia invece che con le gambe.',
      ],
      allena: [
        'Figure: solo difesa per un round, poi difesa + un colpo di risposta.',
        'Sparring leggero a tema: l’avversario attacca, tu solo schivi e esci d’angolo.',
      ],
      rubrica: {
        3: 'Subisci i colpi puliti, difendi solo con le braccia.',
        5: 'Pari e blocchi, ma resti fermo e non rispondi.',
        7: 'Ti muovi bene, esci d’angolo e rispondi.',
        9: 'La difesa è già l’inizio del tuo attacco.',
      },
    },
    'Cambio Ritmo': {
      cosa: 'Rompere la prevedibilità: alternare velocità, pause e intensità.',
      chiave: [
        'Un ritmo costante, per quanto alto, è leggibile dall’avversario.',
        'La pausa è un’arma: un mezzo tempo fermo crea la reazione che cerchi.',
        'Alterna raffiche brevi e movimento, non un’unica intensità.',
      ],
      errori: [
        'Andare sempre allo stesso passo per tutto il round.',
        'Confondere cambio ritmo con "andare più forte".',
        'Fermarsi senza muovere i piedi: la pausa va fatta in movimento.',
      ],
      allena: [
        'Sacco a intervalli: 10" esplosivi / 20" di gestione, per 3 round.',
        'Sparring a tema: obbligo di cambiare passo ogni 30 secondi.',
      ],
      rubrica: {
        3: 'Un solo ritmo per tutto il round.',
        5: 'Cambi ritmo ma solo quando sei stanco, non per scelta.',
        7: 'Alterni consapevolmente e vedi l’effetto sull’avversario.',
        9: 'Detti tu il ritmo dell’incontro e lo usi per creare aperture.',
      },
    },
    'Distanza': {
      cosa: 'La gestione dello spazio: stare dove i tuoi colpi arrivano e i suoi no.',
      chiave: [
        'Esistono tre distanze — lunga, media, corta: ognuna ha i suoi colpi.',
        'La misura si tiene con i piedi, non allungando il busto.',
        'Entrare e uscire vale più che restare: la distanza è dinamica.',
      ],
      errori: [
        'Restare nella terra di nessuno: troppo vicino per il jab, troppo lontano per il gancio.',
        'Sporgersi in avanti con la testa per arrivare.',
        'Entrare senza un piano per uscire.',
      ],
      allena: [
        'Figure con focus sulla misura: entra, due colpi, esci.',
        'Sacco in movimento, mai fermo davanti.',
      ],
      rubrica: {
        3: 'Ti trovi spesso alla distanza sbagliata.',
        5: 'Tieni la misura da fermo, la perdi in movimento.',
        7: 'Entri ed esci con criterio, scegli la distanza.',
        9: 'Controlli tu la misura e costringi l’altro a combattere dove vuoi.',
      },
    },
    'Footwork': {
      cosa: 'Il movimento dei piedi: la base di potenza, difesa e distanza.',
      chiave: [
        'I piedi non si incrociano mai e restano alla larghezza delle spalle.',
        'Passi corti: il piede vicino alla direzione si muove per primo.',
        'Resta sull’avampiede, ma senza rimbalzare a vuoto sprecando energia.',
      ],
      errori: [
        'Incrociare i piedi: un colpo in quel momento ti mette a terra.',
        'Passi troppo lunghi che ti tolgono equilibrio.',
        'Muoversi solo avanti e indietro, mai lateralmente.',
      ],
      allena: [
        'Corda: 3 round, è il miglior investimento sui piedi.',
        'Vuoto Normale concentrandosi solo sugli spostamenti laterali.',
        'Scaletta o linee a terra per i cambi di direzione.',
      ],
      rubrica: {
        3: 'Piedi pesanti, a volte incroci, ti muovi solo in linea.',
        5: 'Buono in avanti/indietro, rigido nei laterali.',
        7: 'Ti muovi in tutte le direzioni restando equilibrato.',
        9: 'I piedi creano gli angoli: colpisci da posizioni dove lui non ti trova.',
      },
    },
    'Combinazioni': {
      cosa: 'Concatenare i colpi in sequenze che si costruiscono a vicenda.',
      chiave: [
        'Ogni colpo prepara il successivo: il jab apre, il diretto passa, il gancio chiude.',
        'Alterna i bersagli — testa e corpo — per spostare la guardia avversaria.',
        'Termina sempre la combinazione con un’uscita o una difesa.',
      ],
      errori: [
        'Sequenze troppo lunghe: dal quarto colpo in poi sei tu a scoprirti.',
        'Ripetere sempre la stessa combinazione.',
        'Fermarsi ammirando il colpo invece di uscire.',
      ],
      allena: [
        'Sacco: 3 combinazioni fisse per round, poi libere.',
        'Figure: combinazioni su chiamata per allenare la reattività.',
      ],
      rubrica: {
        3: 'Colpi singoli, fatichi a concatenare.',
        5: 'Combinazioni di 2-3 colpi, sempre le stesse.',
        7: 'Varie, con cambio di bersaglio e uscita finale.',
        9: 'Le costruisci in base a ciò che l’avversario ti concede.',
      },
    },
    'Potenza': {
      cosa: 'La capacità di trasferire forza nel bersaglio, non di essere forte in palestra.',
      chiave: [
        'La potenza nasce da terra: piedi, anche, rotazione. Le braccia trasmettono.',
        'Il pugno accelera fino al bersaglio, non si "spinge" dopo l’impatto.',
        'Rilassato fino all’ultimo istante: la tensione costante uccide la velocità.',
      ],
      errori: [
        'Cercare potenza irrigidendo le braccia.',
        'Colpire "attraverso" perdendo l’equilibrio.',
        'Confondere potenza e forza massimale: sono qualità diverse.',
      ],
      allena: [
        'Palestra: lavoro esplosivo (spinte, trazioni, catena posteriore).',
        'Sacco pesante: serie brevi di colpi pieni, curando la rotazione.',
        'Vuoto Pesi con carichi leggeri per la velocità, mai per la stanchezza.',
      ],
      rubrica: {
        3: 'Colpisci di braccio, il sacco si muove poco.',
        5: 'Potenza presente nei colpi singoli preparati.',
        7: 'Potenza costante anche in combinazione e in movimento.',
        9: 'Potenza senza perdita di equilibrio né di velocità, fino all’ultimo round.',
      },
    },
    'Resistenza': {
      cosa: 'Mantenere tecnica e lucidità quando la fatica sale.',
      chiave: [
        'La resistenza specifica si costruisce a intervalli, non solo con la corsa lenta.',
        'La respirazione va ritmata sui colpi: espirare sull’impatto.',
        'Il primo indicatore di cedimento è la guardia che scende, non le gambe.',
      ],
      errori: [
        'Costruire fondo solo con corsa continua, senza lavori intervallati.',
        'Trattenere il respiro durante le raffiche.',
        'Allenare sempre a intensità media: né fondo vero, né qualità.',
      ],
      allena: [
        'Corsa: alterna fondo lento e ripetute (es. 8×400m).',
        'Sacco a round pieni con recuperi brevi (2\' lavoro / 30" recupero).',
      ],
      rubrica: {
        3: 'Cali vistosamente dal secondo round.',
        5: 'Reggi il fiato ma la tecnica si sporca a fine round.',
        7: 'Tecnica stabile su tutti i round previsti.',
        9: 'Ultimo round alla stessa qualità del primo.',
      },
    },
    'Velocità': {
      cosa: 'Rapidità di esecuzione e soprattutto di reazione e ritorno.',
      chiave: [
        'La velocità che conta è quella di RITORNO, non solo di andata.',
        'Nasce dal rilassamento: un muscolo contratto è un muscolo lento.',
        'Velocità di reazione ≠ velocità di braccio: si allena con stimoli imprevisti.',
      ],
      errori: [
        'Irrigidirsi per andare più veloce, ottenendo l’effetto opposto.',
        'Allenare la velocità da stanchi: si allena da freschi, a inizio sessione.',
        'Curare solo l’estensione e trascurare il ritorno.',
      ],
      allena: [
        'Sacco leggero o vuoto: serie brevissime (10") alla massima velocità, riposo pieno.',
        'Figure con chiamate imprevedibili per la reattività.',
      ],
      rubrica: {
        3: 'Colpi lenti, ritorno in ritardo.',
        5: 'Veloce da fermo, lento in reazione.',
        7: 'Rapido in andata e ritorno, buona reattività.',
        9: 'Arrivi prima: colpisci nel tempo in cui l’altro decide.',
      },
    },
    'Testa': {
      cosa: 'La parte mentale: lucidità, lettura, gestione della paura e del piano gara.',
      chiave: [
        'Sotto pressione non sali di livello: scendi al livello dei tuoi automatismi.',
        'Leggere l’avversario vale più che essere più veloce di lui.',
        'La gestione dell’errore è una skill: sbagliare e resettare in un secondo.',
      ],
      errori: [
        'Andare "in bianco" e abbandonare il piano al primo colpo preso.',
        'Combattere arrabbiati: l’emotività toglie precisione.',
        'Non avere un piano gara affatto.',
      ],
      allena: [
        'Sparring con un obiettivo tattico dichiarato prima, e verifica dopo.',
        'Revisione onesta: cosa è andato bene, cosa no, una sola cosa da correggere.',
        'Visualizzazione: 5 minuti a immaginare le situazioni, prima della sessione.',
      ],
      rubrica: {
        3: 'Perdi lucidità appena la pressione sale.',
        5: 'Reggi finché tutto va secondo i piani.',
        7: 'Resti lucido e sai correggerti dentro la sessione.',
        9: 'Leggi, adatti il piano in corsa e resti freddo nei momenti decisivi.',
      },
    },
  };

  const fondamentali = {
    'Sacco': {
      cosa: 'Il laboratorio della potenza e delle combinazioni a pieno contatto.',
      scopo: 'Trasferire la tecnica su un bersaglio che oppone resistenza reale.',
      metodo: [
        'Lavora a round cronometrati (3\'), non a tempo indefinito.',
        'Muoviti attorno al sacco: mai piantato davanti.',
        'Alterna round tecnici (controllo) e round di potenza.',
      ],
      errori: ['Colpire forte con tecnica sporca.', 'Restare fermi.', 'Non curare il ritorno della guardia.'],
      rubrica: { 3: 'Colpisci senza struttura.', 5: 'Buone combinazioni ma resti fermo.', 7: 'Movimento e combinazioni pulite.', 9: 'Il round sul sacco somiglia a un round vero.' },
    },
    'Corda': {
      cosa: 'Coordinazione, appoggi, resistenza specifica e leggerezza sui piedi.',
      scopo: 'Costruire piedi rapidi e capacità aerobica senza impatto eccessivo.',
      metodo: [
        'Salti bassi e rapidi, contatto breve a terra.',
        'Progredisci: base → alternato → incrociato → doppio giro.',
        'A round, come il resto: 3\' di lavoro, 1\' di recupero.',
      ],
      errori: ['Salti troppo alti che sprecano energia.', 'Spalle contratte.', 'Fermarsi a ogni errore invece di riprendere subito.'],
      rubrica: { 3: 'Interrompi spesso.', 5: 'Round completi in base.', 7: 'Varianti fluide e ritmo alto.', 9: 'Controllo totale, la corda è riscaldamento non fatica.' },
    },
    'Vuoto Normale': {
      cosa: 'Shadow boxing: la tecnica pura, senza bersaglio, davanti allo specchio o all’avversario immaginario.',
      scopo: 'Costruire e correggere gli automatismi con la massima attenzione al dettaglio.',
      metodo: [
        'Immagina un avversario reale: distanza, reazioni, contro.',
        'Alterna round di attenzione tecnica e round di fluidità.',
        'Filmati ogni tanto: quello che senti e quello che fai spesso non coincidono.',
      ],
      errori: ['Farlo distratti come riscaldamento vuoto.', 'Nessun movimento di piedi.', 'Non difendersi mai da nulla.'],
      rubrica: { 3: 'Movimenti approssimativi.', 5: 'Tecnica corretta ma statica.', 7: 'Fluido, con difese e uscite.', 9: 'Sembra un combattimento vero contro un avversario che non c’è.' },
    },
    'Vuoto Pesi': {
      cosa: 'Shadow boxing con carichi leggeri in mano (0,5-2 kg).',
      scopo: 'Resistenza specifica delle spalle e controllo della traiettoria.',
      metodo: [
        'Carichi LEGGERI: oltre i 2 kg la tecnica si deforma e diventa dannoso.',
        'Round brevi, movimenti controllati, mai esplosivi.',
        'Subito dopo, un round a vuoto senza pesi per ripulire la sensazione.',
      ],
      errori: ['Usare carichi troppo alti.', 'Cercare la velocità con i pesi in mano.', 'Farlo a fine sessione da esausti, rovinando la tecnica.'],
      rubrica: { 3: 'Il carico ti deforma la tecnica.', 5: 'Reggi ma perdi la guardia.', 7: 'Tecnica intatta col carico.', 9: 'Nessuna differenza di forma fra con e senza pesi.' },
    },
    'Sparring': {
      cosa: 'Il confronto reale controllato: l’unico posto dove la tecnica si verifica.',
      scopo: 'Testare sotto pressione ciò che hai costruito negli altri fondamentali.',
      metodo: [
        'Sempre con un obiettivo tecnico dichiarato prima del round.',
        'L’intensità la decidono entrambi PRIMA, non durante.',
        'Protezioni complete, sempre. Non è il posto dove dimostrare qualcosa.',
      ],
      errori: ['Trasformarlo in una gara.', 'Non avere un tema e limitarsi a picchiare.', 'Non fare la revisione dopo.'],
      rubrica: { 3: 'Subisci e reagisci d’istinto.', 5: 'Applichi qualcosa ma perdi il piano.', 7: 'Rispetti il tema e resti lucido.', 9: 'Leggi e adatti in tempo reale.' },
    },
    'Figure': {
      cosa: 'Lavoro con i colpitori/guantoni del maestro.',
      scopo: 'Allenare tempo, precisione e reattività su stimoli imprevedibili.',
      metodo: [
        'Colpisci sempre a piena velocità: le figure non sono un riscaldamento.',
        'Segui il movimento del maestro con i piedi, non solo con le braccia.',
        'Chiedi correzioni durante, non solo alla fine.',
      ],
      errori: ['Anticipare le chiamate a memoria invece di reagire.', 'Perdere la guardia fra una serie e l’altra.', 'Rimanere piantati.'],
      rubrica: { 3: 'Sbagli le chiamate.', 5: 'Esegui bene le sequenze note.', 7: 'Reagisci veloce anche sull’imprevisto.', 9: 'Tempo di reazione e precisione da agonista.' },
    },
    'Palestra': {
      cosa: 'Preparazione atletica a supporto: forza, esplosività, core, prevenzione.',
      scopo: 'Sostenere la performance e ridurre il rischio di infortunio.',
      metodo: [
        'Priorità: catena posteriore, core anti-rotazione, spalle in salute.',
        'Esplosività più che carichi massimali: la boxe è velocità applicata.',
        'Non a ridosso della sessione tecnica: la tecnica va allenata da freschi.',
      ],
      errori: ['Cercare l’ipertrofia fine a sé stessa.', 'Trascurare la mobilità di spalle e anche.', 'Fare pesi pesanti il giorno prima dello sparring.'],
      rubrica: { 3: 'Lavoro discontinuo e senza criterio.', 5: 'Costante ma generico.', 7: 'Programmato e integrato con la boxe.', 9: 'Periodizzato sugli obiettivi e sui picchi di forma.' },
    },
  };

  // Concetti trasversali — spiegano i numeri che il sistema calcola da solo
  const concetti = [
    {
      id: 'zone-fc',
      ico: '❤️',
      titolo: 'Zone di frequenza cardiaca',
      sommario: 'Il sistema stima la FCmax come 220 − età e da lì ricava le zone della corsa.',
      corpo: [
        'Z1 50-60% — recupero attivo: serve a smaltire, non ad allenare.',
        'Z2 60-70% — fondo aerobico: è la base che regge tutto il resto. La maggior parte dei km va qui.',
        'Z3 70-80% — soglia bassa: utile ma è la zona dove è facile "allenarsi a metà".',
        'Z4 80-90% — soglia/ripetute: costruisce la capacità di reggere l’intensità di un round.',
        'Z5 90-100% — massimale: dosi piccolissime, molto recupero.',
        'La 220 − età è una stima statistica con ±10-12 bpm di errore individuale: usala come riferimento, non come verità. Se hai un test reale, quello vince.',
      ],
    },
    {
      id: 'carico',
      ico: '⚖️',
      titolo: 'Carico acuto e cronico (ACWR)',
      sommario: 'Il rapporto fra il carico degli ultimi 7 giorni e la media delle ultime 4 settimane.',
      corpo: [
        'Sotto 0,8 — stai scaricando: va bene in taper, male se dura.',
        'Fra 0,8 e 1,3 — la fascia dove il corpo assorbe il lavoro.',
        'Sopra 1,5 — salto di carico troppo rapido: è la zona in cui la letteratura osserva più infortuni.',
        'La regola pratica: aumenta il volume settimanale con gradualità, non a scatti.',
        'L’assistente usa questo indice per sopprimere i consigli che spingerebbero altro volume quando sei già in zona rossa.',
      ],
    },
    {
      id: 'recupero',
      ico: '🌙',
      titolo: 'Sonno e recupero',
      sommario: 'L’adattamento non avviene durante l’allenamento, ma nel recupero.',
      corpo: [
        'Il sonno è la variabile con più impatto e la più facile da trascurare.',
        'Sotto le 7 ore croniche calano reattività, precisione e tolleranza al carico.',
        'La qualità conta quanto la quantità: orari regolari valgono più di una notte lunga isolata.',
        'Un giorno di riposo pieno a settimana non è tempo perso: è quando il lavoro diventa progresso.',
        'Primo segnale di recupero insufficiente: la tecnica si sporca prima che le gambe cedano.',
      ],
    },
    {
      id: 'peso',
      ico: '⚡',
      titolo: 'Gestione del peso',
      sommario: 'Scendere di peso mantenendo la potenza è un problema di ritmo, non di sacrificio.',
      corpo: [
        'Un calo sostenibile sta intorno allo 0,5-1% del peso corporeo a settimana.',
        'Oltre l’1% a settimana aumenta la quota di massa magra persa: perdi anche potenza.',
        'Le proteine vanno tenute alte in fase di taglio, per proteggere il muscolo.',
        'Pesati sempre nelle stesse condizioni (mattina, a digiuno): confronti la tendenza, non il singolo numero.',
        'Il GOAL PACE della pagina PESO calcola i kg/settimana richiesti dalla tua data target: se il ritmo richiesto supera l’1%, la data è troppo aggressiva.',
      ],
    },
    {
      id: 'oro',
      ico: '★',
      titolo: 'Settimana e mese d’oro',
      sommario: 'I criteri che il sistema usa per dire se una settimana è stata piena davvero.',
      corpo: [
        'Non è un premio né un punteggio: è una soglia binaria di costanza.',
        'I criteri sono tuoi e li modifichi da ARCHIVIO → REVISIONI → ORO.',
        'Il senso è avere un riferimento stabile nel tempo: se cambi i criteri ogni mese, i confronti storici perdono valore.',
        'Alzali quando una settimana d’oro smette di costarti fatica.',
      ],
    },
    {
      id: 'valutazione',
      ico: '🎯',
      titolo: 'Come dare voti utili',
      sommario: 'Un voto ha valore solo se è confrontabile con quello di tre mesi fa.',
      corpo: [
        'Vota sempre con la rubrica davanti: è il motivo per cui esiste.',
        'Vota la SESSIONE, non la giornata: l’umore non deve entrare nel numero.',
        'Non aggiustare i voti vecchi: un trend onesto vale più di uno bello.',
        'Se oscilli di 3 punti da una sessione all’altra, probabilmente stai votando come ti senti e non cosa hai fatto.',
        'Meglio pochi voti onesti che tanti voti automatici.',
      ],
    },
  ];

  function forArea(nome)  { return aree[nome] || null; }
  function forFond(nome)  { return fondamentali[nome] || null; }
  function forVoce(kind, nome) { return kind === 'fond' ? forFond(nome) : forArea(nome); }

  return { aree, fondamentali, concetti, forArea, forFond, forVoce };

})();
