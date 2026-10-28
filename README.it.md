# Vers

![Illustrazione di Vers: una mappa tattica con linee dorate, token circolari e un dado a venti facce.](docs/assets/vers-cover.webp)

**Trailer V2 · 45 secondi · Full HD:** [Italiano (MP4)](https://github.com/AleVersace/Vers/releases/download/trailer-v2/vers-trailer-v2-it-1080p.mp4) · [English (MP4)](https://github.com/AleVersace/Vers/releases/download/trailer-v2/vers-trailer-v2-en-1080p.mp4) · [Crediti e dettagli](docs/TRAILER.md)

Vers è un **tavolo virtuale opinionated** per giocare a molti giochi di ruolo
che hanno bisogno di mappe, misure, token e dadi condivisi. Offre strumenti
pratici per gestire il tavolo senza imporre il regolamento di un singolo gioco.

Lo sviluppo secondo il mio modo di giocare: implemento le cose come piacciono a
me, cercando interazioni funzionali che velocizzino la sessione e richiedano poca
preparazione. Scelgo le funzionalità con questo criterio, evitando di rendere
complicate operazioni che al tavolo dovrebbero essere semplici.

### Gli elementi distintivi

- **La mappa al centro:** zoom verso il cursore, misure, token, oggetti, disegni,
  ping e nebbia gestiti direttamente sul tavolo.
- **Controlli a portata di mano:** il dettaglio del token resta selezionato mentre
  usi gli strumenti; pannelli e dock delle macro si possono organizzare e
  trascinare secondo le proprie preferenze.
- **Tiri rapidi e flessibili:** macro riutilizzabili, dado configurabile al volo,
  bonus temporanei, tipi di danno e log condiviso. ADV/DIS confrontano i totali
  di due tiri dei dadi base e applicano i bonus una sola volta.
- **Gioco condiviso, viste separate:** scene live per i giocatori, vista master,
  personaggi e NPC riutilizzabili e strumenti per l’iniziativa.
- **Un’installazione tua:** accesso su invito, interfaccia italiana, inglese, francese e tedesca,
  setup documentato con Firebase, Supabase e Vercel.

Vers è uno strumento flessibile, non un motore completo per ogni regolamento.
Alcune comodità riflettono il mio stile di gioco, come HP, classe armatura,
tiri salvezza e ADV/DIS: puoi usare ciò che serve al tuo gruppo.
La documentazione tecnica principale è in inglese, per facilitare installazione
e contributi anche dall’estero.
Il codice è pubblico e distribuito con licenza **AGPL-3.0-only**: chiunque può
consultarlo, installarlo e contribuire nel rispetto della licenza.

L’installazione personale del manutentore è un servizio separato, accessibile
solo su invito. Non è una demo pubblica né un servizio condiviso per chi visita
il repository. Leggere, clonare o contribuire al codice non dà accesso a quella
installazione, ai suoi account, alle campagne o ai file. La guida permette di
creare una propria istanza con progetti cloud e inviti propri.

L’interfaccia è disponibile in **italiano, inglese, francese e tedesco**. Usa il selettore **ITA / ENG / FRA / DEU**
nella schermata di accesso o nella barra del tavolo: la scelta viene ricordata
nel browser e si applica subito, senza ricaricare o perdere la selezione del token.
Nomi, descrizioni e note scritti dai giocatori restano nella lingua originale.

## Come riprodurre l’installazione

La configurazione di riferimento usa **GitHub** per codice e CI, **Vercel** per
ospitare Next.js e la route server, **Firebase Authentication** per il login
Google e **Supabase** per database, permessi, aggiornamenti in tempo reale e file.

Servono progetti propri per questi servizi: il repository non contiene le
credenziali, gli utenti o le campagne dell’installazione originale.

1. Parti dalla [guida completa al setup](docs/DEPLOYMENT.md).
2. Compila le variabili seguendo il [riferimento di configurazione](docs/CONFIGURATION.md).
3. Applica le migrazioni e inizializza la prima campagna prima del primo accesso.
4. Per aggiungere giocatori, revocare accessi o creare altre campagne, segui
   la [guida amministrativa](docs/OPERATIONS.md).
5. In caso di problemi usa la [guida diagnostica](docs/TROUBLESHOOTING.md).

Le istruzioni distinguono installazione nuova, sviluppo, preview, produzione e
aggiornamento di un database esistente. Non usare il reset del database sulla
produzione. I controlli automatici lavorano su dati sintetici e non sulle campagne
reali.

La nebbia è un effetto visivo: per tenere riservata un’immagine usa una scena
accessibile solo al master. Consulta i [limiti di sicurezza](docs/SECURITY-MODEL.md)
e le [regole per contribuire](CONTRIBUTING.md).

Per aggiornare un’installazione esistente dopo la rinomina, segui anche
[le istruzioni di compatibilità](docs/RENAMING.md): il bucket già popolato va
configurato esplicitamente prima del deploy.

Il [README principale](README.md) contiene l’indice completo.
La [checklist di pubblicazione](docs/PUBLICATION.md) spiega come rendere pubblico
il codice mantenendo i deploy automatici e il controllo CI prima della produzione.
