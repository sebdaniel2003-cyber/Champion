# Mettere l'assistente sul telefono — guida passo passo

Tempo: ~15 minuti. Gratis, nessuna carta di credito.

---

## Perché serve pubblicarlo

L'app del telefono ha bisogno di due cose che il browser concede **solo su
HTTPS**:

- il **microfono** (senza, niente dettatura)
- il **service worker** (senza, non si installa in home e non funziona offline)

Da `file://` nessuna delle due parte. Per questo il telefono va servito da un
indirizzo web. GitHub Pages lo fa gratis.

**Il PC non si tocca**: continua a girare da `file://` con i dati nel browser,
esattamente come adesso.

---

## Cosa finisce online, e cosa no

| | Va online? |
|---|---|
| Il **codice** di Champion (HTML, CSS, JS) | **Sì**, e chiunque abbia il link può leggerlo |
| I tuoi **dati** (allenamenti, peso, pasti) | **No.** Stanno nel browser del PC e su Supabase, protetti dal tuo account |
| La **chiave** Supabase dentro `settings.js` | Sì, ed è previsto: è la chiave *publishable*, fatta per stare nel client. Da sola non apre niente, perché la Row Level Security richiede il login |

Su GitHub Pages il piano gratuito pubblica solo da repository **pubblici**.
Quindi: codice pubblico, dati privati. Se il codice pubblico non ti va bene,
l'alternativa è un hosting a pagamento — ma non cambierebbe niente sui dati.

---

## Strada A — dal sito, senza installare niente

### 1. Crea il repository
1. Vai su **github.com** e accedi (o registrati, è gratis)
2. In alto a destra `+` → **New repository**
3. **Repository name**: `champion`
4. Scegli **Public**
5. `Create repository`

### 2. Carica i file
1. Nella pagina del repository appena creato, clicca **uploading an existing file**
2. Apri `C:\Users\OEM\Desktop\Cartella\champion-v8`
3. Seleziona **tutto quello che c'è dentro** (`Ctrl+A`) e trascinalo nella pagina
   — cartelle comprese: `css`, `js`, `data`, `mobile`
4. In basso, `Commit changes`

Aspetta che finisca di caricare (è qualche MB, un minuto scarso).

### 3. Accendi le Pages
1. Nel repository, **Settings** (in alto) → **Pages** (menu di sinistra)
2. **Source**: `Deploy from a branch`
3. **Branch**: `main`, cartella `/ (root)` → `Save`
4. Aspetta 1-2 minuti e ricarica: in cima comparirà l'indirizzo

Sarà qualcosa come:

```
https://TUONOME.github.io/champion/
```

L'assistente del telefono sta in:

```
https://TUONOME.github.io/champion/mobile/
```

---

## Strada B — con git, se poi vuoi aggiornare con un comando

Git è già installato sul PC. Dopo aver creato il repository vuoto su GitHub
(passo 1 della strada A), da PowerShell nella cartella del progetto:

```powershell
cd C:\Users\OEM\Desktop\Cartella\champion-v8
git init
git add .
git commit -m "Champion System v8.6.0"
git branch -M main
git remote add origin https://github.com/TUONOME/champion.git
git push -u origin main
```

Poi accendi le Pages come al passo 3.

Dalla volta dopo, per pubblicare una modifica bastano tre righe:

```powershell
git add .
git commit -m "cosa ho cambiato"
git push
```

---

## Installare l'app sul telefono

1. Apri **Chrome su Android** e vai su `https://TUONOME.github.io/champion/mobile/`
2. Entra con **lo stesso account Supabase che usi sul PC**
3. Menu di Chrome (⋮) → **Aggiungi a schermata Home**
4. Conferma: comparirà l'icona con le spade incrociate

Da quel momento si apre a schermo intero, senza barra del browser, come
un'app vera.

### Il microfono
La prima volta che tocchi il tasto della dettatura Chrome chiede il permesso:
**Consenti**. Se per sbaglio neghi, si riattiva dal lucchetto accanto
all'indirizzo → Autorizzazioni → Microfono.

---

## Prima di dettare: apri Champion sul PC una volta

Il telefono riconosce **solo ciò che esiste nel sistema** — le tue aree, i tuoi
fondamentali, i tuoi tipi di allenamento. Quell'elenco arriva dal PC, che lo
pubblica ogni volta che apri Champion.

Finché non è arrivato, il telefono te lo dice e manda comunque la frase grezza:
la rilegge il PC, che il vocabolario ce l'ha. Non si perde niente, ma
l'anteprima sul telefono è più povera.

---

## Come si usa

1. Tocchi il microfono e parli: *«due ore allenamento, un'ora sala pesi
   un'ora pugilato»*
2. Vedi cosa ha capito, **correggi i numeri sbagliati** (il vocale li sbaglia),
   togli le righe che non c'entrano, cambi il giorno se serve
3. `MANDA AL PC →`
4. Sul PC, nella casella di posta dell'assistente, dai la conferma finale

Due conferme, non una: un dato sbagliato sporca medie e grafici per sempre.

### Senza campo
Se detti dove non prende, la frase resta in coda sul telefono e parte da sola
appena torna la rete. Lo vedi dal pallino in alto e dal riquadro giallo.

**La dettatura però ha bisogno di connessione**: il riconoscimento vocale di
Chrome lavora sui server di Google, non sul telefono. Senza rete puoi comunque
**scrivere** la frase, e verrà messa in coda come le altre.

---

## Quando cambi qualcosa nell'app

Il telefono tiene il guscio in cache, quindi dopo un aggiornamento potrebbe
continuare a mostrare la versione vecchia. Per forzare il ricambio, in
`mobile/sw.js` cambia la riga:

```js
const VERSIONE = 'champion-mob-v8.6.0';
```

Basta incrementare il numero: al primo avvio successivo il telefono butta la
cache vecchia e riscarica tutto.

---

## Cose da sapere

**I progetti Supabase gratuiti vanno in pausa** dopo circa 7 giorni di completa
inattività. Usandolo ogni giorno non succede; al ritorno da una vacanza
potresti doverlo risvegliare con un click dal pannello.

**iPhone**: il riconoscimento vocale non esiste in Safari. L'app funziona lo
stesso (si scrive invece di dettare) e si installa da Condividi → Aggiungi alla
schermata Home.

**Se cambi idea**: cancella il repository da GitHub (Settings → in fondo →
Delete this repository). Il PC continua a funzionare come sempre, perché i dati
sono già tutti in locale.
