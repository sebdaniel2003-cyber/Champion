# Configurare Supabase — guida passo passo

Serve a far arrivare sul PC quello che detti dal telefono.
Tempo: ~10 minuti. Non serve la carta di credito.

---

## Prima: cosa stiamo costruendo

Due tabelle, con due ruoli opposti:

| Tabella | Chi scrive | Chi legge | A cosa serve |
|---|---|---|---|
| `champion_snapshot` | il PC | il telefono | copia dei tuoi dati, così il telefono può risponderti «oggi sei a 1.850 kcal» |
| `champion_inbox` | il telefono | il PC | la coda di quello che detti, che il PC applica dopo la tua conferma |

Il telefono **non modifica mai** i tuoi dati: aggiunge soltanto messaggi in coda.
Il PC resta l'unica fonte di verità. Così non esistono conflitti e, se spegni la
sincronia, tutto continua a funzionare come adesso.

---

## Passo 1 — Crea l'account

1. Vai su **supabase.com**
2. `Start your project` (in alto a destra)
3. Registrati con Google o con email + password

---

## Passo 2 — Crea il progetto

1. `New project`
2. **Name**: `champion`
3. **Database Password**: generane una e **salvala** (serve solo per accessi
   avanzati al database, non per l'app — ma non è recuperabile)
4. **Region**: `Central EU (Frankfurt)` o `West EU (Ireland)` — più vicino = più veloce
5. **Plan**: `Free`
6. `Create new project` e aspetta 1-2 minuti che finisca di prepararsi

---

## Passo 3 — Crea le tabelle

1. Nel menu di sinistra apri **SQL Editor**
2. `New query`
3. Incolla **tutto** lo script qui sotto
4. `Run` (o `Ctrl+Invio`)

Deve rispondere `Success. No rows returned`.

```sql
-- ═══════════════════════════════════════════════════════
-- CHAMPION SYSTEM — struttura per la sincronia telefono ↔ PC
-- Si può rieseguire senza problemi: è tutto idempotente.
-- ═══════════════════════════════════════════════════════

-- ── 1. SNAPSHOT: il PC pubblica, il telefono consulta ──
create table if not exists public.champion_snapshot (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb       not null,
  updated_at timestamptz not null default now()
);

-- ── 2. INBOX: il telefono accoda, il PC applica e chiude ──
create table if not exists public.champion_inbox (
  id        uuid        primary key default gen_random_uuid(),
  user_id   uuid        not null references auth.users(id) on delete cascade,
  creato_il timestamptz not null default now(),
  origine   text        not null default 'telefono',
  testo     text        not null,
  data      date,
  intents   jsonb       not null default '[]'::jsonb,
  stato     text        not null default 'pending',
  chiuso_il timestamptz
);

-- Indice per la domanda che faremo di continuo:
-- "cosa c'è ancora da applicare, dal più recente?"
create index if not exists champion_inbox_pending_idx
  on public.champion_inbox (user_id, stato, creato_il desc);

-- ── 3. PROTEZIONE ──────────────────────────────────────
-- Row Level Security: senza login il database rifiuta TUTTO,
-- e ogni riga è visibile solo a chi l'ha creata.
alter table public.champion_snapshot enable row level security;
alter table public.champion_inbox    enable row level security;

drop policy if exists "snapshot_proprio" on public.champion_snapshot;
create policy "snapshot_proprio" on public.champion_snapshot
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "inbox_propria" on public.champion_inbox;
create policy "inbox_propria" on public.champion_inbox
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## Passo 4 — Crea il tuo utente

È l'account con cui entrerai **sia dal PC sia dal telefono**.

1. Menu **Authentication** → **Users**
2. `Add user` → `Create new user`
3. Email e password (una che ricordi: la digiterai sul telefono)
4. **Importante**: attiva `Auto Confirm User` — altrimenti resta in attesa di
   una conferma via email e il login non funziona

---

## Passo 5 — Copia le due chiavi

1. Menu **Project Settings** (l'ingranaggio in basso) → **API Keys**
   *(in alcune versioni del pannello: Settings → API)*
2. Copia questi due valori:

   - **Project URL** — qualcosa come `https://abcdefgh.supabase.co`
   - **anon / public** — una stringa lunga che inizia con `eyJ...`

### ⚠️ Una distinzione che conta

| Chiave | Si può condividere? |
|---|---|
| `anon` / `public` | **Sì.** È fatta per stare dentro il codice dell'app. Da sola non apre niente: senza login la Row Level Security blocca tutto. |
| `service_role` / `secret` | **NO, mai.** Scavalca ogni protezione. Non incollarla da nessuna parte, né in chat né nel codice. |

Serve solo la prima.

---

## Passo 6 — Dimmi che è pronto

Mandami:
- il **Project URL**
- la chiave **anon public**

e collego il sistema (Fase 2 del piano).

---

## Cose da sapere

**I progetti gratuiti vanno in pausa** dopo circa 7 giorni di completa
inattività. Si riattivano con un click dal pannello. Usandolo ogni giorno non
succede, ma se torni dopo una vacanza potresti doverlo risvegliare.

**Cosa finisce online**: solo i tuoi dati di allenamento — lo stesso contenuto
del backup JSON che già scarichi dal tasto in topbar.

**Se cambi idea**: si spegne dall'interruttore nelle impostazioni di Champion.
Il PC torna a funzionare come oggi, perché i dati sono già tutti in locale.
Per cancellare tutto: dal pannello Supabase, `Settings → General → Delete project`.

**Il tuo sistema attuale non si tocca**: continua a girare da `file://` con i
dati nel browser. La sincronia si aggiunge, non sostituisce.
