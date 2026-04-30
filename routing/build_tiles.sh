#!/bin/bash

# Script to build Valhalla routing tiles
# Usage: ./build_tiles.sh <osm.pbf file>

if [ -z "$1" ]; then
    echo "Usage: $0 <osm.pbf file>"
    exit 1
fi

OSM_FILE=$1
TILE_DIR=/data/valhalla_tiles

echo "Building Valhalla tiles from $OSM_FILE..."

# Create tile directory
mkdir -p $TILE_DIR

# Build tiles
valhalla_build_config --mjolnir-tile-dir $TILE_DIR --mjolnir-tile-extract /data/tiles.tar > /etc/valhalla.json
valhalla_build_tiles -c /etc/valhalla.json $OSM_FILE

echo "Tiles built successfully!"
