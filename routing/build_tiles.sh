#!/bin/bash

# Script to build Valhalla routing tiles
# Usage: ./build_tiles.sh <osm.pbf file>

if [ -z "$1" ]; then
    echo "Usage: $0 <osm.pbf file>"
    exit 1
fi

OSM_FILE=$1
TILE_DIR=/data/valhalla_tiles
CONFIG_FILE=/data/valhalla.generated.json

echo "Building Valhalla tiles from $OSM_FILE..."

# Create tile directory
mkdir -p "$TILE_DIR"

# Build tiles and extract using the runtime config generated at boot
valhalla_build_tiles -c "$CONFIG_FILE" "$OSM_FILE"
valhalla_build_extract -c "$CONFIG_FILE" -v

echo "Tiles built successfully!"
