const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const DATA_DIR = '/data';
const VALHALLA_ADMIN_URL = process.env.VALHALLA_ADMIN_URL || 'http://valhalla:8003';

// Download DEM (Digital Elevation Model) data for a region
async function downloadDEM(regionId, bounds) {
    const demDir = path.join(DATA_DIR, 'dem', regionId);
    
    // Create DEM directory
    await fs.mkdir(demDir, { recursive: true });
    
    // Calculate which DEM tiles are needed
    const demTiles = calculateDEMTiles(bounds);
    
    // Download each DEM tile
    for (const tile of demTiles) {
        await downloadDEMTile(tile, demDir);
    }
    
    // Build elevation tiles using Valhalla's skadi tools
    await buildElevationTiles(demDir);
    
    return demDir;
}

// Calculate which DEM tiles are needed for a bounding box
function calculateDEMTiles(bounds) {
    const tiles = [];
    
    // DEM tiles are typically 1x1 degree
    const minLat = Math.floor(bounds.minLat);
    const maxLat = Math.ceil(bounds.maxLat);
    const minLon = Math.floor(bounds.minLon);
    const maxLon = Math.ceil(bounds.maxLon);
    
    for (let lat = minLat; lat <= maxLat; lat++) {
        for (let lon = minLon; lon <= maxLon; lon++) {
            const latStr = lat >= 0 ? `N${lat}` : `S${Math.abs(lat)}`;
            const lonStr = lon >= 0 ? `E${lon}` : `W${Math.abs(lon)}`;
            tiles.push(`${latStr}${lonStr}.hgt`);
        }
    }
    
    return tiles;
}

// Download a single DEM tile from NASA or other source
async function downloadDEMTile(tileName, demDir) {
    const tilePath = path.join(demDir, tileName);
    
    // Check if already exists
    try {
        await fs.access(tilePath);
        return;
    } catch (error) {
        // File doesn't exist, download it
    }
    
    // DEM tiles can be downloaded from various sources
    // For this example, we'll use a placeholder URL
    // In production, you would use NASA's SRTM data or other DEM sources
    const url = `https://e4ftl01.cr.usgs.gov/MEASURES/SRTMGL1.003/2000.02.11/${tileName}.zip`;
    
    return new Promise((resolve, reject) => {
        const curlCmd = [
            'curl',
            '-o', tilePath,
            url
        ];
        
        const process = spawn(curlCmd[0], curlCmd.slice(1));

        process.on('error', () => {
            console.warn(`Failed to start DEM download for ${tileName}`);
            resolve();
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                // DEM download is optional, don't fail if it doesn't work
                console.warn(`Failed to download DEM tile ${tileName}`);
                resolve();
            }
        });
    });
}

// Build elevation tiles via Valhalla admin server HTTP API
async function buildElevationTiles(demDir) {
    try {
        const response = await fetch(`${VALHALLA_ADMIN_URL}/elevation/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputDir: demDir, outputDir: path.join(DATA_DIR, 'elevation_tiles') }),
            signal: AbortSignal.timeout(300000)
        });

        if (!response.ok) {
            console.warn(`Elevation build via admin failed: ${response.status}`);
        }
    } catch (error) {
        console.warn('Elevation build via admin failed:', error.message);
    }

    return path.join(DATA_DIR, 'elevation_tiles');
}

module.exports = {
    downloadDEM
};
