# Route Planner

Applicazione web per la pianificazione di percorsi escursionistici con mappe OSM Topo, routing pedonale locale e funzionalità di export complete.

## Caratteristiche

- **Mappa OSM Topo**: Visualizzazione di mappe topografiche OpenStreetMap
- **Segnaposto personalizzabili**: Creazione e gestione di tipi di punti (default: punto notte, rifornimento, punto strada)
- **Routing pedonale**: Calcolo percorsi seguendo sentieri e strade (non in linea d'aria)
- **Statistiche complete**: Lunghezza, dislivello positivo/negativo, tempo stimato
- **Statistiche per giorno**: Divisione automatica per "punti notte"
- **Grafico altimetrico**: Profilo elevazione con separatori per giorni
- **Indicazioni turn-by-turn**: Istruzioni dettagliate con note personalizzabili
- **Export multiplo**: JSON, GPX (completo e split per giorni), PNG, PDF
- **Mappe Offline (Tile)**: Download di tile raster per uso offline con IndexedDB
- **Gestione Mappe Regionali**: Download automatico di dati Geofabrik e build tile Valhalla
- **Modalità Offline**: Switch tra mappe online e offline
- **PWA**: Installabile come Progressive Web App per uso offline
- **Dati Elevazione (DEM)**: Supporto per dati altimetrici SRTM per routing preciso

## Architettura

L'applicazione utilizza 3 container Docker:

1. **Frontend**: Vanilla JS + OpenLayers + nginx
2. **Routing Engine**: Valhalla (motore di routing locale)
3. **Export Service**: Node.js + Puppeteer (generazione PDF/PNG)

## Prerequisiti

- Docker
- Docker Compose
- File OSM PBF per la regione desiderata (opzionale per routing)

## Setup Rapido

1. **Clona o naviga nella directory del progetto**
   ```bash
   cd /home/samuele/webserver/sites/route-planner
   ```

2. **Avvia i container Docker**
   ```bash
   docker-compose up -d
   ```

3. **Accedi all'applicazione**
   Apri il browser su `http://localhost:8083`

## Configurazione Routing (Opzionale)

Per abilitare il routing pedonale locale con Valhalla:

### Opzione 1: Download Automatico (Consigliato)

1. **Accedi al Map Manager**
   - Apri l'applicazione su `http://localhost:8083`
   - Vai nel menu **Mappe** > **Gestione Mappe Regionali**

2. **Seleziona e scarica una regione**
   - Filtra le regioni per area (es. Italia, Europa)
   - Clicca su "Scarica Offline" per la regione desiderata
   - Il sistema scaricherà automaticamente:
     - File PBF da Geofabrik
     - Tile Valhalla per il routing
     - (Opzionale) Dati elevazione DEM
     - (Opzionale) Vector tiles per mappe offline

3. **Attiva la modalità offline**
   - Usa lo switch "Modalità Offline" nel Map Manager
   - L'app utilizzerà solo le mappe scaricate localmente

### Opzione 2: Download Manuale

1. **Scarica i dati OSM per la regione desiderata**
   ```bash
   # Esempio per l'Italia
   wget https://download.geofabrik.de/europe/italy-latest.osm.pbf -O data/italy-latest.osm.pbf
   ```

2. **Costruisci i tile di routing**
   ```bash
   docker-compose exec routing bash
   cd /data
   valhalla_build_config -mj italy-latest.osm.pbf --co --mjolnir.tile-dir=/data/valhalla_tiles --co --mjolnir.timezone=/data/timezones.sqlite --co --mjolnir.tile-extract=/data/valhalla_tiles.tar
   exit
   ```

3. **Riavvia il container routing**
   ```bash
   docker-compose restart routing
   ```

Nota: Senza questa configurazione, il routing userà linee d'aria come fallback.

## API Endpoints

### Export Service (Port 3001)

#### GET /regions
Recupera la lista delle regioni disponibili da Geofabrik.

**Query Parameters:**
- `area` (opzionale): Filtra per area (es. "italy", "europe")

**Response:**
```json
{
  "regions": [
    {
      "id": "italy",
      "name": "Italia",
      "path": "europe/italy",
      "url": "https://download.geofabrik.de/europe/italy-latest.osm.pbf",
      "bbox": [...]
    }
  ]
}
```

#### POST /download-region
Avvia il download e la build dei tile per una regione.

**Request Body:**
```json
{
  "regionId": "italy",
  "url": "https://download.geofabrik.de/europe/italy-latest.osm.pbf",
  "includeVectorTiles": false,
  "includeDEM": false,
  "bounds": { "minLon": 6.0, "maxLon": 19.0, "minLat": 36.0, "maxLat": 47.0 }
}
```

**Response:**
```json
{
  "message": "Download started",
  "regionId": "italy",
  "status": { "status": "downloading", "progress": 0, "stage": "Scaricamento PBF" }
}
```

#### GET /status/:regionId
Recupera lo stato del download per una regione specifica.

#### GET /status
Recupera lo stato di tutti i download in corso.

#### GET /tiles/:regionId/:z/:x/:y.pbf
Serve vector tiles da file MBTiles.

#### GET /tiles/:regionId/metadata
Recupera metadati MBTiles per una regione.

## Utilizzo

### Aggiungere Punti

1. Clicca sulla mappa per aggiungere un punto
2. Seleziona il tipo di segnaposto dal menu
3. Inserisci un nome opzionale
4. Il punto viene aggiunto alla route

### Gestire i Segnaposti

1. Apri il pannello "Route" dal menu Visualizza
2. Trascina i punti per riordinarli
3. Usa i pulsanti per modificare o eliminare punti

### Creare Nuovi Tipi di Segnaposto

1. Apri il pannello "Tipi Segnaposti" dal menu Visualizza
2. Clicca "Nuovo Tipo"
3. Inserisci nome, icona (emoji) e colore

### Visualizzare Statistiche

1. Apri il pannello "Statistiche" dal menu Visualizza
2. Visualizza statistiche totali e per giorno

### Visualizzare il Grafico Altimetrico

1. Il grafico appare automaticamente quando hai una route
2. Clicca sul pannello per espanderlo
3. Scarica il grafico come PNG

### Utilizzare Mappe Offline

#### Mappe Offline (Tile Raster)

1. Vai nel menu **Visualizza** > **Mappe Offline (Tile)**
2. Seleziona una regione gerarchicamente (Mondo > Continente > Stato > Regione)
3. Scegli il tipo di mappa:
   - **Mappa Completa**: Topografica con tutti i dettagli
   - **Solo Strade**: Rete stradale (40% dimensione)
   - **Isoipse e Isobate**: Linee di livello (50% dimensione)
4. Clicca "Scarica" e attendi il completamento
5. I tile vengono salvati in IndexedDB nel browser

#### Gestione Mappe Regionali

1. Vai nel menu **Mappe** > **Gestione Mappe Regionali**
2. Filtra le regioni per area o nome
3. Clicca "Scarica Offline" per la regione desiderata
4. Monitora lo stato del download in tempo reale
5. Attiva "Modalità Offline" per usare solo mappe locali

#### PWA (Progressive Web App)

1. Apri l'applicazione in un browser compatibile (Chrome, Edge, Safari)
2. Clicca sull'icona di installazione nella barra degli indirizzi
3. Segui le istruzioni per installare l'app
4. L'app funzionerà offline con le mappe scaricate

### Aggiungere Note alle Indicazioni

1. Apri il pannello "Indicazioni"
2. Clicca sull'icona nota per aggiungere annotazioni
3. Le note vengono incluse nell'export PDF

### Export

Dal menu File > Pagina Esportazione:

- **GPX Completo**: Esporta l'intera route in formato GPX
- **GPX per Giorni**: Esporta un file GPX per ogni giorno (diviso per punti notte)
- **Mappa PNG**: Esporta la mappa come immagine PNG
- **Mappa PDF**: Esporta la mappa come PDF
- **Indicazioni PDF**: Esporta le indicazioni dettagliate come PDF

### Import/Export JSON

- **Export JSON**: Salva l'intero progetto (punti, configurazione, note)
- **Import JSON**: Ripristina un progetto precedentemente salvato

## Struttura dei File

```
route-planner/
├── docker-compose.yml          # Configurazione Docker Compose
├── frontend/                   # Applicazione frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js             # Logica principale
│       ├── map.js             # Gestione mappa OpenLayers
│       ├── routing.js         # Integrazione Valhalla
│       ├── markers.js         # Gestione segnaposti
│       ├── stats.js           # Calcolo statistiche
│       ├── chart.js           # Grafico altimetrico
│       ├── directions.js      # Indicazioni turn-by-turn
│       ├── export.js          # Funzionalità export
│       └── ui.js              # Gestione UI
├── routing/                    # Motore di routing Valhalla
│   ├── Dockerfile
│   ├── valhalla.json          # Configurazione Valhalla
│   └── build_tiles.sh         # Script per costruire tile
├── export/                     # Servizio export
│   ├── Dockerfile
│   ├── package.json
│   └── server.js              # Server Express + Puppeteer
└── data/                       # Dati OSM e tile
    └── osm.pbf                # File OSM (da scaricare)
```

## Sviluppo

### Modificare il Frontend

I file frontend sono montati come volume, quindi le modifiche sono immediate:

```bash
# Modifica i file in frontend/
# Ricarica il browser per vedere le modifiche
```

### Modificare il Routing

```bash
# Ricostruisci il container routing
docker-compose build routing
docker-compose up -d routing
```

### Modificare il Servizio Export

```bash
# Ricostruisci il container export
docker-compose build export
docker-compose up -d export
```

## Troubleshooting

### Il routing non funziona

- Verifica di aver scaricato e costruito i tile OSM
- Controlla che il container routing sia in esecuzione: `docker-compose ps`
- Controlla i log del routing: `docker-compose logs routing`

### L'export PDF non funziona

- Verifica che il container export sia in esecuzione
- Controlla i log: `docker-compose logs export`
- Il servizio richiede più memoria per Puppeteer

### La mappa non carica

- Verifica la connessione internet (OSM Topo richiede connessione)
- Controlla i log del frontend: `docker-compose logs frontend`

## Licenza

Questo progetto è open source e disponibile per uso personale e commerciale.

## Supporto

Per problemi o domande, controlla la documentazione di:
- OpenLayers: https://openlayers.org/
- Valhalla: https://valhalla.readthedocs.io/
- Chart.js: https://www.chartjs.org/
