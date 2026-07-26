# Route Planner

Applicazione web per la pianificazione di percorsi escursionistici con mappe OSM Topo, routing locale con Valhalla, analisi terreno avanzata e funzionalità competitive con OsmAnd+.

## Caratteristiche

- **Mappa OSM Topo**: Visualizzazione di mappe topografiche OpenStreetMap
- **Segnaposto personalizzabili**: Creazione e gestione di tipi di punti (default: punto notte, rifornimento, punto strada)
- **Routing pedonale e bici**: Calcolo percorsi seguendo sentieri e strade, con motore locale Valhalla come primo motore e fallback espliciti solo quando selezionati
- **Statistiche complete**: Lunghezza, dislivello positivo/negativo, tempo stimato (Naismith + Munter)
- **Smoothing elevazione**: Filtraggio rumore DEM con media mobile e soglia minima (5m)
- **Tempo Munter**: Stima realistica con formula Munter (DIN 33466) con correzioni per discesa ripida e pendenza media
- **Statistiche per giorno**: Divisione automatica per "punti notte"
- **Grafico altimetrico interattivo**: Profilo elevazione colorato per difficoltà SAC scale, pendenza, con hover sincronizzato sulla mappa
- **Indicazioni turn-by-turn**: Istruzioni dettagliate con note personalizzabili
- **Import/Export GPX**: Import con semplificazione Douglas-Peucker per tracce grandi, export con metadati completi
- **Ricerca luoghi**: Ricerca Nominatim con proxy server-side e caching
- **Condivisione route via URL**: Compressione gzip + short link fallback per URL lunghi
- **Meteo e sole**: Previsioni Open-Meteo + calcolo alba/tramonto con formule astronomiche
- **POI escursionistici**: Rifugi, bivacchi, acqua, vette, pericoli, parcheggi, emergenze da Overpass
- **Wikipedia GeoSearch**: Articoli Wikipedia nearby con caching server-side
- **Analisi terreno avanzata**: Fiumi, strade di evacuazione, difficoltà sentieri (SAC scale), superficie
- **Export multiplo**: JSON, GPX (completo e split per giorni), PNG, PDF
- **Mappe Offline (Tile)**: Download di tile raster per uso offline con IndexedDB
- **Gestione Mappe Regionali**: Download automatico di dati Geofabrik e build tile Valhalla via HTTP admin server
- **Modalità Offline**: Switch tra mappe online e offline
- **PWA**: Installabile come Progressive Web App per uso offline
- **Dati Elevazione (DEM)**: Supporto per dati altimetrici SRTM per routing preciso

## Architettura

L'applicazione utilizza **2 container Docker**:

1. **app**: Node.js unificato — serve il frontend statico, proxy Valhalla, routing API, export, search, POI, terrain, share
2. **valhalla**: Motore di routing locale con admin server HTTP per tile building

Nessun uso di `docker.sock` — la build dei tile avviene via HTTP al admin server di Valhalla (porta 8003).

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
   docker compose up -d
   ```

3. **Accedi all'applicazione**
   Apri il browser su `http://localhost:8083`

## Configurazione Routing (Opzionale)

Per abilitare il routing locale con Valhalla:

### Opzione 1: Download Automatico (Consigliato)

1. **Accedi al Map Manager**
   - Apri l'applicazione su `http://localhost:8083`
   - Vai nel menu **Mappe** > **Gestione Mappe Regionali**

2. **Seleziona e scarica una regione**
   - Filtra le regioni per area (es. Italia, Europa)
   - Clicca su "Scarica Offline" per la regione desiderata
   - Il sistema scaricherà automaticamente:
     - File PBF da Geofabrik
     - Tile Valhalla per il routing (via HTTP admin server)
     - (Opzionale) Dati elevazione DEM
     - (Opzionale) Vector tiles per mappe offline

3. **Attiva la modalità offline**
   - Usa lo switch "Modalità Offline" nel Map Manager
   - L'app utilizzerà solo le mappe scaricate localmente

### Opzione 2: Download Manuale

1. **Scarica i dati OSM per la regione desiderata**
   ```bash
   wget https://download.geofabrik.de/europe/italy-latest.osm.pbf -O data/italy-latest.osm.pbf
   ```

2. **Costruisci i tile di routing via admin server**
   ```bash
   curl -X POST http://localhost:8003/tiles/build \
     -H "Content-Type: application/json" \
     -d '{"region": "italy", "pbfPath": "/data/italy-latest.osm.pbf"}'
   ```

3. **Attiva la modalità locale**
   - Usa l'impostazione "Motore Routing" nell'app per passare a "locale"

Nota: senza tile OSM locali, il routing usa Valhalla online di default.

## API Endpoints

Tutti gli endpoint sono serviti dal container `app` sulla stessa origine (`/api/*`):

### Routing (`/api/routing`)
- `POST /api/routing/route` — Calcola percorso
- `GET /api/routing/status` — Stato motore routing
- `GET /api/routing/mode` — Modalità corrente (local/remote)
- `POST /api/routing/mode` — Cambia modalità
- `GET /api/routing/tiles/status` — Stato tile locali
- `GET /api/routing/tiles/regions` — Regioni disponibili
- `POST /api/routing/tiles/build` — Avvia build tile
- `GET /api/routing/tiles/jobs/:id` — Stato job build
- `POST /api/routing/graph` — Dati grafo OSM da Overpass

### Export (`/api/export`)
- `POST /api/export/map/png` — Esporta mappa come PNG
- `POST /api/export/map/pdf` — Esporta mappa come PDF
- `POST /api/export/directions/pdf` — Esporta indicazioni come PDF
- `GET /api/export/regions` — Lista regioni Geofabrik
- `POST /api/export/download-region` — Avvia download regione
- `GET /api/export/status/:regionId` — Stato download
- `GET /api/export/tiles/:regionId/:z/:x/:y.pbf` — Vector tiles

### Search (`/api/search`)
- `GET /api/search?q=...` — Ricerca luoghi (Nominatim proxy con cache)

### POI (`/api/poi`)
- `POST /api/poi` — Ricerca POI via Overpass (con cache)
- `GET /api/poi/wikipedia?lat=...&lon=...` — Wikipedia GeoSearch (con cache)

### Terrain (`/api/terrain`)
- `POST /api/terrain/analyze` — Analisi terreno unificata (fiumi, evacuazione, sentieri, POI)

### Share (`/api/share`)
- `POST /api/share` — Crea short link
- `GET /api/share/:id` — Recupera route condivisa

### Valhalla Proxy
- `* /api/valhalla/*` — Proxy trasparente a Valhalla

## Utilizzo

### Aggiungere Punti
1. Clicca sulla mappa per aggiungere un punto
2. Seleziona il tipo di segnaposto dal menu
3. Inserisci un nome opzionale

### Ricerca Luoghi
1. Usa la barra di ricerca in alto a destra
2. Digita almeno 2 caratteri
3. Clicca su un risultato per volare sulla posizione

### Import GPX
1. Menu File > Pagina Esportazione > Importa GPX
2. Seleziona un file .gpx
3. Tracce grandi vengono semplificate automaticamente con Douglas-Peucker

### Condividere Route
1. Menu File > Pagina Esportazione > Copia link condivisione
2. Il link viene copiato negli appunti
3. Per route lunghe, viene generato automaticamente uno short link

### Export
Dal menu File > Pagina Esportazione:
- **GPX Completo**: Esporta l'intera route in formato GPX con metadati
- **GPX per Giorni**: Esporta un file GPX per ogni giorno
- **Mappa PNG/PDF**: Esporta la mappa come immagine o PDF
- **Indicazioni PDF**: Esporta le indicazioni dettagliate

## Struttura dei File

```
route-planner/
├── docker-compose.yml          # 2 servizi: app + valhalla
├── server/                     # Backend Node.js unificato
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js               # Entry point + static + proxy
│   ├── routes/
│   │   ├── routing.js          # Routing API (Valhalla/OSRM/GraphHopper)
│   │   ├── export.js           # Export PNG/PDF + region management
│   │   ├── search.js           # Nominatim proxy con cache
│   │   ├── poi.js              # POI Overpass + Wikipedia
│   │   ├── terrain.js          # Analisi terreno unificata
│   │   └── share.js            # Short link per condivisione
│   ├── utils/
│   │   ├── overpass-cache.js   # Cache on-disk + memory con TTL
│   │   ├── worker-pool.js      # Worker threads per task CPU-bound
│   │   ├── regions-manager.js  # Download PBF + build tile via HTTP
│   │   ├── tiles-server.js     # Serve vector tiles da MBTiles
│   │   └── dem-manager.js      # Download DEM + build elevation
│   └── workers/
│       └── pdf-worker.js       # Worker thread per generazione PDF
├── frontend/                   # Applicazione frontend (vanilla JS)
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js              # Logica principale + Munter formula
│       ├── map.js              # Gestione mappa OpenLayers
│       ├── routing.js          # Integrazione Valhalla + elevation
│       ├── markers.js          # Gestione segnaposti
│       ├── stats.js            # Statistiche con smoothing
│       ├── chart.js            # Grafico altimetrico SAC-colored + interattivo
│       ├── elevation-utils.js  # Smoothing DEM (moving average + threshold)
│       ├── directions.js       # Indicazioni turn-by-turn
│       ├── export.js           # Export GPX/PNG/PDF
│       ├── gpx.js              # Import GPX con Douglas-Peucker
│       ├── search.js           # Ricerca luoghi con UI
│       ├── share.js            # Condivisione route via URL compresso
│       ├── weather.js          # Meteo Open-Meteo + calcolo alba/tramonto
│       ├── trail-analysis.js   # Analisi difficoltà SAC scale + superficie
│       ├── poi.js              # POI layer su mappa + Wikipedia
│       ├── tile-mode.js        # Gestione modalita routing + tile
│       ├── map-manager.js      # Region download + offline mode
│       └── ui.js               # Gestione UI
└── data/                       # Dati condivisi (volume Docker)
    ├── valhalla_tiles/         # Tile Valhalla
    ├── cache/                  # Cache Overpass/Nominatim/Wikipedia
    └── shared/                 # Short link route condivise
```

## Sviluppo

### Modificare il Frontend
I file frontend sono montati come volume, quindi le modifiche sono immediate — ricarica il browser.

### Modificare il Backend
```bash
docker compose build app
docker compose up -d app
```

## Troubleshooting

### Il routing non funziona
- Verifica di aver scaricato e costruito i tile OSM
- Controlla che i container siano in esecuzione: `docker compose ps`
- Controlla i log: `docker compose logs app`

### L'export PDF non funziona
- Controlla i log: `docker compose logs app`

### La mappa non carica
- Verifica la connessione internet (OSM Topo richiede connessione)
- Controlla i log: `docker compose logs app`

## Licenza

Questo progetto è open source e disponibile per uso personale e commerciale.

## Supporto

Per problemi o domande, controlla la documentazione di:
- OpenLayers: https://openlayers.org/
- Valhalla: https://valhalla.readthedocs.io/
- Chart.js: https://www.chartjs.org/
- Open-Meteo: https://open-meteo.com/
- Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
