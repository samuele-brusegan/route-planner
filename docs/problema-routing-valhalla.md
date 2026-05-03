# Problema di routing: il punto non viene raggiunto anche se il grafo ci arriva

Questo documento spiega il problema osservato nel routing Valhalla locale, con particolare attenzione al caso in cui la rotta sembra “quasi corretta” sulla mappa ma il punto finale non viene davvero raggiunto.

## Sintomo osservato

Nelle immagini fornite si vede questo comportamento:

- la rotta viene tracciata lungo sentieri e tracce corrette per gran parte del percorso;
- nell’ultimo tratto, però, la rotta non termina esattamente sul marker;
- il grafo OSM mostrato dalla UI arriva vicino al punto, quindi il problema non è l’assenza totale di connettività;
- il tracciato finale sembra fermarsi su un accesso laterale, un ramo parallelo o un nodo “vicino”, ma non sul punto richiesto.

In pratica:

- il percorso esiste;
- il grafo è presente;
- ma il punto selezionato dall’utente non viene raggiunto in modo affidabile.

## Perché il problema è pericoloso

Questo è peggio di un errore esplicito, perché produce una rotta che appare plausibile ma può essere sbagliata di decine di metri o più.

Le conseguenze pratiche sono:

- il punto di arrivo può risultare fuori dal sentiero reale;
- il marker finale può essere “snapppato” su un altro ramo;
- un tratto finale sbagliato può dare l’impressione che il sentiero sia stato perso, quando in realtà è stato scelto il nodo sbagliato;
- il problema è difficile da diagnosticare perché la UI mostra comunque una rotta continua.

## Causa probabile

Dal codice e dal comportamento osservato, la causa più probabile è una combinazione di questi fattori:

1. **Snap troppo permissivo**
   - Valhalla accetta un punto di aggancio abbastanza lontano dal marker reale.
   - Se il punto è vicino a più accessi o più rami, il motore può scegliere un nodo diverso da quello atteso.

2. **Reachability troppo morbida**
   - Se il valore di reachability è troppo basso o la tolleranza è troppo alta, il motore considera “raggiungibile” un punto che in realtà è solo vicino alla rete principale.

3. **Controllo finale insufficiente**
   - La rotta viene accettata appena Valhalla restituisce un trip valido.
   - Non viene verificato in modo rigoroso se l’ultimo snap è davvero coerente con il marker dell’utente.

4. **Assenza di un errore esplicito per endpoint non raggiunto**
   - Se l’ultimo punto è sbagliato ma la route esiste, il sistema tende a restituire comunque qualcosa di visivamente plausibile.

## Differenza tra “grafo vicino” e “punto raggiunto”

Questa distinzione è centrale.

- **Grafo vicino** significa che nei dintorni del marker esistono strade o sentieri routabili.
- **Punto raggiunto** significa che il motore ha agganciato il marker corretto e la geometria finale della route termina sul punto giusto, non solo su un nodo nelle vicinanze.

Nel caso in esame, il grafo esiste ma il punto finale viene agganciato male.

## Dove si manifesta nel flusso applicativo

Il flusso coinvolge tre livelli:

### 1. Frontend

Il frontend invia a routing:

- coordinate dei marker;
- motore scelto;
- profilo scelto.

Se la risposta è valida, mostra la rotta senza sapere se lo snap finale sia davvero corretto.

### 2. Routing API

Il servizio routing inoltra la richiesta a Valhalla locale e normalizza la risposta.

Qui il problema nasce se:

- il trip è formalmente valido;
- ma l’endpoint finale è stato agganciato a un ramo sbagliato;
- oppure il motore non segnala che il punto finale è troppo distante rispetto al marker originario.

### 3. Valhalla locale

Valhalla esegue lo snap e il routing reale.

Se i parametri di snapping sono permissivi, il motore può scegliere un punto vicino ma non corretto.

## Perché una rotta “quasi giusta” non basta

Nel contesto escursionistico un errore finale è molto più grave di un errore lungo il percorso, perché:

- l’ultimo tratto spesso coincide con bivacchi, rifugi, valichi, accessi a sentieri o punti notte;
- pochi metri possono cambiare completamente l’accesso reale;
- un punto finale sbagliato può mandare l’utente su un ramo parallelo o su una traccia secondaria non voluta.

Quindi la priorità non è “ottenere sempre una linea”, ma:

- ottenere una rotta giusta;
- oppure fallire in modo esplicito quando il punto finale non è agganciabile in modo affidabile.

## Comportamento desiderato

Il comportamento corretto è questo:

1. Il sistema prova Valhalla locale.
2. Se il grafo locale è pronto, calcola la rotta.
3. Se l’endpoint finale è troppo distante dal marker:
   - la route deve fallire in modo esplicito;
   - non deve essere sostituita da una rotta “inventata”.
4. Se l’endpoint è solo leggermente fuori per effetto di snapping:
   - la geometria va riconciliata con il punto reale;
   - la UI deve mostrare che c’è stata una riconciliazione.

## Indicazioni tecniche che emergono dal caso

Per evitare questo tipo di errore servono tre livelli di protezione:

### A. Protezione di configurazione

I parametri di snapping devono essere più restrittivi per hiking e bici.

### B. Protezione di validazione

Ogni route deve essere verificata anche dopo la risposta di Valhalla:

- distanza tra marker e snap iniziale/finale;
- coerenza dell’ultimo tratto;
- presenza di grafo locale effettivamente pronto.

### C. Protezione UX

La UI deve distinguere chiaramente:

- rotta valida;
- rotta riconciliata;
- rotta non affidabile;
- motore non pronto.

## Come leggere il problema in pratica

Se vedi una situazione simile a questa:

- il tracciato corre lungo il sentiero giusto;
- il punto finale resta leggermente fuori;
- il grafo OSM visibile conferma che la zona è coperta;

allora il problema non è “manca la rete”.

Il problema è più specifico:

- il motore ha scelto uno snap o un accesso sbagliato;
- la rotta è formalmente valida ma geometricamente non sufficientemente aderente al marker richiesto.

## Conclusione

Il difetto non è l’assenza del grafo, ma la combinazione di:

- snap troppo permissivo;
- verifica finale troppo debole;
- mancanza di un errore esplicito quando il punto non viene raggiunto davvero.

La soluzione corretta è trattare questo come un problema di integrità del routing, non come un semplice problema di rendering o di UI.

