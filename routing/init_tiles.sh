#!/bin/bash

# Script di inizializzazione per le tile Valhalla
# Viene eseguito all'avvio del container se le tile non sono presenti

set -e

OSM_FILE="/data/italy-latest.osm.pbf"
TILE_DIR="/data/valhalla_tiles"
CONFIG_FILE="/data/valhalla.generated.json"
MIN_FILE_SIZE=10000000  # 10MB minimo

echo "=== Inizializzazione tile Valhalla ==="

# Verifica se le tile esistono già
if [[ -d "$TILE_DIR" && $(ls -A "$TILE_DIR" 2>/dev/null) ]]; then
    echo "Tile Valhalla già presenti in $TILE_DIR"
    exit 0
fi

# Verifica se il file OSM esiste
if [[ ! -f "$OSM_FILE" ]]; then
    echo "ERRORE: File OSM non trovato: $OSM_FILE"
    echo "Eseguire prima lo script di download delle tile"
    exit 1
fi

# Verifica dimensione file OSM
file_size=$(stat -c%s "$OSM_FILE" 2>/dev/null || echo 0)
if [[ $file_size -lt $MIN_FILE_SIZE ]]; then
    echo "ERRORE: File OSM troppo piccolo: $file_size bytes (minimo: $MIN_FILE_SIZE bytes)"
    exit 1
fi

echo "File OSM valido trovato: $OSM_FILE ($file_size bytes)"

# Verifica che valhalla_build_tiles sia disponibile
if ! command -v valhalla_build_tiles &> /dev/null; then
    echo "ATTENZIONE: valhalla_build_tiles non disponibile in questo container"
    echo "Il download è stato completato, ma la build delle tile richiede il container Valhalla"
    exit 0
fi

echo "Inizio build delle tile Valhalla..."

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

echo "=== Inizializzazione tile completata con successo ==="
