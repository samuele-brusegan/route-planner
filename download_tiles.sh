#!/bin/bash

# Script per scaricare e preparare le tile Valhalla locali
# Uso: ./download_tiles.sh [regione]

set -e

REGIONE=${1:-italy}
OSM_FILE="/data/${REGIONE}-latest.osm.pbf"
TILE_DIR="/data/valhalla_tiles"
CONFIG_FILE="/data/valhalla.generated.json"
MIN_FILE_SIZE=10000000  # 10MB minimo

echo "=== Download tile Valhalla per ${REGIONE} ==="

# Crea la directory data se non esiste
mkdir -p /data

# Download file OSM
if [[ ! -f "$OSM_FILE" ]]; then
    echo "Download dati OSM per ${REGIONE}..."
    
    case "$REGIONE" in
        "italy")
            URL="https://download.geofabrik.de/europe/italy-latest.osm.pbf"
            ;;
        "europe")
            URL="https://download.geofabrik.de/europe-latest.osm.pbf"
            ;;
        "germany")
            URL="https://download.geofabrik.de/europe/germany-latest.osm.pbf"
            ;;
        *)
            echo "ERRORE: Regione non supportata: $REGIONE"
            echo "Regioni supportate: italy, europe, germany"
            exit 1
            ;;
    esac
    
    curl -L --retry 3 --retry-delay 5 --fail --show-error \
        --progress-bar \
        -o "$OSM_FILE" \
        "$URL"
    
    echo "Download completato: $OSM_FILE"
else
    echo "File OSM già esistente: $OSM_FILE"
fi

# Verifica dimensione file
file_size=$(stat -c%s "$OSM_FILE" 2>/dev/null || echo 0)
if [[ $file_size -lt $MIN_FILE_SIZE ]]; then
    echo "ERRORE: File OSM troppo piccolo: $file_size bytes (minimo: $MIN_FILE_SIZE bytes)"
    echo "Il download potrebbe essere fallito. Rimuovere il file e riprovare."
    exit 1
fi

echo "File OSM valido: $file_size bytes"

# Patch configurazione Valhalla se necessario
if [[ -f "/data/patch_config.py" ]]; then
    echo "Applicando patch configurazione Valhalla..."
    python3 /data/patch_config.py
fi

# Build delle tile (solo se valhalla_build_tiles è disponibile)
if command -v valhalla_build_tiles &> /dev/null; then
    echo "Inizio build delle tile Valhalla..."
    
    # Rimuovi tile esistenti se presenti
    if [[ -d "$TILE_DIR" ]]; then
        echo "Rimuovendo tile esistenti..."
        rm -rf "$TILE_DIR"
    fi
    
    # Build delle tile
    if ! valhalla_build_tiles -c "$CONFIG_FILE" "$OSM_FILE"; then
        echo "ERRORE: Build tile fallita"
        exit 1
    fi
    
    # Build extract
    if ! valhalla_build_extract -c "$CONFIG_FILE" -v; then
        echo "ERRORE: Build extract fallita"
        exit 1
    fi
    
    echo "=== Build tile completata con successo ==="
    echo "Tile create in: $TILE_DIR"
    echo "Per abilitare le tile locali, imposta USE_LOCAL_VALHALLA=true"
else
    echo "ATTENZIONE: valhalla_build_tiles non disponibile"
    echo "Il download è stato completato, ma la build delle tile richiede il container Valhalla"
    echo "Avviare il container Valhalla per completare il processo"
fi

echo "=== Operazione completata ==="
