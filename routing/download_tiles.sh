#!/bin/bash

# Script automatico per il download delle tile OSM per Valhalla
# Questo script viene eseguito durante la build del container

set -e

# Variabili di configurazione
REGION=${TILE_REGION:-"italy"}
TILE_URL=${TILE_URL:-"https://download.geofabrik.de/europe/italy-latest.osm.pbf"}
OSM_FILE="/data/${REGION}-latest.osm.pbf"
TILE_DIR="/data/valhalla_tiles"
CONFIG_FILE="/data/valhalla.generated.json"
MIN_FILE_SIZE=${MIN_FILE_SIZE:-10000000}  # 10MB minimo

echo "=== Download automatico tile Valhalla ==="
echo "Regione: $REGION"
echo "URL: $TILE_URL"
echo "File destinazione: $OSM_FILE"

# Creazione directory necessarie
mkdir -p "$TILE_DIR"
mkdir -p "$(dirname "$CONFIG_FILE")"

# Funzione per verificare se un file esiste e ha una dimensione minima
check_file() {
    local file="$1"
    local min_size="$2"
    
    if [[ -f "$file" ]]; then
        local size=$(stat -c%s "$file" 2>/dev/null || echo 0)
        if [[ $size -ge $min_size ]]; then
            echo "File $file esistente e valido ($size bytes)"
            return 0
        else
            echo "File $file esistente ma troppo piccolo ($size bytes < $min_size bytes)"
            return 1
        fi
    else
        echo "File $file non trovato"
        return 1
    fi
}

# Verifica se le tile esistono già
if check_file "$OSM_FILE" $MIN_FILE_SIZE && [[ -d "$TILE_DIR" && $(ls -A "$TILE_DIR" 2>/dev/null) ]]; then
    echo "Tile OSM e directory Valhalla già esistenti e validi. Skip download."
    exit 0
fi

# Download del file OSM
echo "Download del file OSM da $TILE_URL..."

# Utilizza curl con retry e resume
curl_options=(
    "--location"
    "--retry" "3"
    "--retry-delay" "5"
    "--retry-max-time" "300"
    "--continue-at" "-"
    "--fail"
    "--silent"
    "--show-error"
    "--output" "$OSM_FILE.tmp"
)

if ! curl "${curl_options[@]}" "$TILE_URL"; then
    echo "ERRORE: Download fallito da $TILE_URL"
    rm -f "$OSM_FILE.tmp"
    exit 1
fi

# Verifica del file scaricato
if ! check_file "$OSM_FILE.tmp" $MIN_FILE_SIZE; then
    echo "ERRORE: File scaricato non valido o troppo piccolo"
    rm -f "$OSM_FILE.tmp"
    exit 1
fi

# Sposta il file temporaneo nella posizione finale
mv "$OSM_FILE.tmp" "$OSM_FILE"
echo "Download completato con successo: $OSM_FILE"

# Verifica che valhalla_build_tiles sia disponibile
if ! command -v valhalla_build_tiles &> /dev/null; then
    echo "ATTENZIONE: valhalla_build_tiles non trovato. Il container Valhalla dovrebbe gestire la build delle tile."
    echo "File OSM scaricato e pronto per l'uso."
    exit 0
fi

# Se siamo in un ambiente con Valhalla installato localmente, build delle tile
echo "Build delle tile Valhalla da $OSM_FILE..."

if ! valhalla_build_tiles -c "$CONFIG_FILE" "$OSM_FILE"; then
    echo "ERRORE: Build tile fallita"
    exit 1
fi

if ! valhalla_build_extract -c "$CONFIG_FILE" -v; then
    echo "ERRORE: Build extract fallita"
    exit 1
fi

echo "=== Download e build tile completati con successo ==="
echo "File OSM: $OSM_FILE"
echo "Directory tile: $TILE_DIR"
echo "Configurazione: $CONFIG_FILE"
