const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const DATA_DIR = '/data';
const ROUTING_CONTAINER = 'route-planner-routing-1';

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

// Build elevation tiles using Valhalla's skadi tools
async function buildElevationTiles(demDir) {
    return new Promise((resolve, reject) => {
        const elevationDir = path.join(DATA_DIR, 'elevation_tiles');
        
        // Execute valhalla_build_elevation in routing container
        const dockerCmd = [
            'docker', 'exec', ROUTING_CONTAINER,
            'valhalla_build_elevation',
            '--input', demDir,
            '--output', elevationDir
        ];
        
        const process = spawn(dockerCmd[0], dockerCmd.slice(1));
        
        process.stdout.on('data', (data) => {
            console.log(`Elevation build: ${data}`);
        });
        
        process.stderr.on('data', (data) => {
            console.error(`Elevation build error: ${data}`);
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                resolve(elevationDir);
            } else {
                // Elevation data is optional, don't fail
                console.warn(`Elevation build failed with code ${code}`);
                resolve(elevationDir);
            }
        });
    });
}

module.exports = {
    downloadDEM
};
