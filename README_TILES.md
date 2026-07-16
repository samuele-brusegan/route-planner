# Download Automatico Tile Valhalla

Questo progetto include uno script automatico per il download e la preparazione delle tile OSM per Valhalla durante la build del container.

## Funzionalità

### 1. Script di Download (`routing/download_tiles.sh`)
- Download automatico delle tile OSM dall'Italia da Geofabrik
- Verifica dell'integrità del file scaricato
- Supporto per resume e retry in caso di fallimento
- Build automatica delle tile se Valhalla è disponibile

### 2. Integrazione Docker
- Download durante la build del container routing (opzionale)
- Download e build automatici all'avvio del container Valhalla
- Gestione intelligente: skip se le tile esistono già

## Configurazione

### Variabili d'Ambiente
- `TILE_REGION`: Regione da scaricare (default: "italy")
- `TILE_URL`: URL custom per il download (default: Geofabrik Italy)
- `SKIP_TILE_DOWNLOAD`: Salta il download durante build (default: "false")
- `MIN_FILE_SIZE`: Dimensione minima file in bytes (default: 10000000)

### Build Arguments
- `SKIP_TILE_DOWNLOAD`: Per saltare il download durante `docker build`

## Utilizzo

### Build con Download Automatico
```bash
# Build standard (con download)
docker-compose build routing

# Build senza download (più veloce)
docker-compose build --build-arg SKIP_TILE_DOWNLOAD=true routing
```

### Avvio con Download Automatico
```bash
# Avvia tutti i servizi (Valhalla scaricherà e build le tile se necessario)
docker-compose up -d

# Solo servizio Valhalla
docker-compose up -d valhalla
```

## File Creati

- `/data/italy-latest.osm.pbf`: File OSM scaricato
- `/data/valhalla_tiles/`: Directory con le tile Valhalla
- `/data/valhalla.generated.json`: Configurazione generata

## Log di Esecuzione

Durante l'avvio, controllare i log per verificare il processo:

```bash
# Log del container Valhalla
docker-compose logs -f valhalla

# Log del container routing
docker-compose logs -f routing
```

## Troubleshooting

### Download Fallito
- Verificare la connessione internet
- Controllare se l'URL Geofabrik è raggiungibile
- Provare a rimuovere i file esistenti e riavviare

### Tile Non Funzionanti
- Verificare che il file OSM sia completo (>10MB)
- Controllare i log di build delle tile
- Rimuovere la directory `/data/valhalla_tiles` e riavviare

### Spazio Insufficiente
- Le tile italiane richiedono circa 1-2GB di spazio
- Verificare lo spazio disponibile nel volume Docker

## Personalizzazione

### Cambiare Regione
Modificare le variabili d'ambiente o il file `docker-compose.yml`:

```yaml
environment:
  - TILE_REGION=germany
  - TILE_URL=https://download.geofabrik.de/europe/germany-latest.osm.pbf
```

### Script Custom
È possibile sostituire lo script `download_tiles.sh` con una versione custom per:
- Fonti dati diverse
- Elaborazioni aggiuntive
- Filtri geografici specifici
