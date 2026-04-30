const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const tar = require('tar');
const { downloadDEM } = require('./dem-manager');

const GEOFABRIK_INDEX_URL = 'https://download.geofabrik.de/index-v1.json';
const DATA_DIR = '/data';
const ROUTING_CONTAINER = 'route-planner-routing-1';

// In-memory status tracking
const downloadStatus = new Map();

// Get available regions from Geofabrik
async function getRegions(filterArea = null) {
    try {
        const response = await axios.get(GEOFABRIK_INDEX_URL);
        const geofabrikData = response.data;
        
        let regions = [];
        
        function processFeatures(features, parentPath = '') {
            features.forEach(feature => {
                const regionId = feature.properties.id;
                const regionName = feature.properties.name;
                const currentPath = parentPath ? `${parentPath}/${regionName}` : regionName;
                
                // Check if this region matches the filter
                if (!filterArea || currentPath.toLowerCase().includes(filterArea.toLowerCase())) {
                    regions.push({
                        id: regionId,
                        name: regionName,
                        path: currentPath,
                        url: feature.properties.urls.pbf,
                        bbox: feature.geometry?.coordinates || null
                    });
                }
                
                // Process sub-regions recursively
                if (feature.features) {
                    processFeatures(feature.features, currentPath);
                }
            });
        }
        
        processFeatures(geofabrikData.features);
        
        return regions;
    } catch (error) {
        console.error('Error fetching regions:', error);
        throw new Error('Failed to fetch regions from Geofabrik');
    }
}

// Download PBF file
async function downloadPBF(regionId, url) {
    const pbfPath = path.join(DATA_DIR, `${regionId}.osm.pbf`);
    
    downloadStatus.set(regionId, {
        status: 'downloading',
        progress: 0,
        stage: 'Scaricamento PBF'
    });
    
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                downloadStatus.set(regionId, {
                    ...downloadStatus.get(regionId),
                    progress
                });
            }
        });
        
        const writer = require('fs').createWriteStream(pbfPath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        downloadStatus.set(regionId, {
            status: 'downloaded',
            progress: 100,
            stage: 'Download completato'
        });
        
        return pbfPath;
    } catch (error) {
        downloadStatus.set(regionId, {
            status: 'error',
            progress: 0,
            stage: 'Errore download',
            error: error.message
        });
        throw error;
    }
}

// Build Valhalla tiles
async function buildValhallaTiles(regionId, pbfPath) {
    downloadStatus.set(regionId, {
        status: 'building_tiles',
        progress: 0,
        stage: 'Generazione tile Valhalla'
    });
    
    return new Promise((resolve, reject) => {
        const tileDir = path.join(DATA_DIR, 'valhalla_tiles', regionId);
        const configPath = path.join(DATA_DIR, 'valhalla_config.json');
        
        // Execute valhalla_build_config in routing container
        const dockerCmd = [
            'docker', 'exec', ROUTING_CONTAINER,
            'valhalla_build_config',
            '-mj', pbfPath,
            '--co', `--mjolnir.tile-dir=${tileDir}`,
            '--co', '--mjolnir.timezone=/data/timezones.sqlite',
            '--co', '--mjolnir.tile-extract=/data/valhalla_tiles.tar',
            '--co', '--mjolnir.hierarchy=true',
            '--co', '--mjolnir.reach=true',
            '--co', '--mjolnir.shortcut=true'
        ];
        
        const process = spawn(dockerCmd[0], dockerCmd.slice(1));
        
        process.stdout.on('data', (data) => {
            console.log(`Valhalla build: ${data}`);
            // Parse progress from output if available
            downloadStatus.set(regionId, {
                ...downloadStatus.get(regionId),
                progress: Math.min(90, (downloadStatus.get(regionId).progress || 0) + 5)
            });
        });
        
        process.stderr.on('data', (data) => {
            console.error(`Valhalla build error: ${data}`);
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                downloadStatus.set(regionId, {
                    status: 'tiles_built',
                    progress: 100,
                    stage: 'Tile Valhalla completati'
                });
                resolve(tileDir);
            } else {
                downloadStatus.set(regionId, {
                    status: 'error',
                    progress: 0,
                    stage: 'Errore build tile',
                    error: `Process exited with code ${code}`
                });
                reject(new Error(`Valhalla build failed with code ${code}`));
            }
        });
    });
}

// Build vector tiles (optional - using tilemaker)
async function buildVectorTiles(regionId, pbfPath) {
    downloadStatus.set(regionId, {
        status: 'building_vector_tiles',
        progress: 0,
        stage: 'Generazione vector tiles'
    });
    
    try {
        const mbtilesPath = path.join(DATA_DIR, `${regionId}.mbtiles`);
        
        // For now, this is a placeholder
        // In production, you would use tilemaker or planetiler
        // Example: tilemaker --input pbfPath --output mbtilesPath --config config.json
        
        downloadStatus.set(regionId, {
            status: 'vector_tiles_built',
            progress: 100,
            stage: 'Vector tiles completati'
        });
        
        return mbtilesPath;
    } catch (error) {
        downloadStatus.set(regionId, {
            status: 'error',
            progress: 0,
            stage: 'Errore vector tiles',
            error: error.message
        });
        throw error;
    }
}

// Clean up temporary files
async function cleanup(regionId) {
    try {
        const pbfPath = path.join(DATA_DIR, `${regionId}.osm.pbf`);
        await fs.unlink(pbfPath);
        console.log(`Cleaned up PBF for ${regionId}`);
    } catch (error) {
        console.error(`Cleanup error for ${regionId}:`, error);
    }
}

// Main orchestration function
async function downloadAndBuildRegion(regionId, url, includeVectorTiles = false, includeDEM = false, bounds = null) {
    try {
        // Download PBF
        const pbfPath = await downloadPBF(regionId, url);
        
        // Optionally download DEM data
        if (includeDEM && bounds) {
            downloadStatus.set(regionId, {
                ...downloadStatus.get(regionId),
                stage: 'Download dati elevazione (DEM)'
            });
            await downloadDEM(regionId, bounds);
        }
        
        // Build Valhalla tiles
        await buildValhallaTiles(regionId, pbfPath);
        
        // Optionally build vector tiles
        if (includeVectorTiles) {
            await buildVectorTiles(regionId, pbfPath);
        }
        
        // Cleanup PBF
        await cleanup(regionId);
        
        downloadStatus.set(regionId, {
            status: 'completed',
            progress: 100,
            stage: 'Completato'
        });
        
        return { success: true, regionId };
    } catch (error) {
        downloadStatus.set(regionId, {
            status: 'error',
            progress: 0,
            stage: 'Errore',
            error: error.message
        });
        throw error;
    }
}

// Get status of a download
function getStatus(regionId) {
    return downloadStatus.get(regionId) || { status: 'not_started' };
}

// Get all statuses
function getAllStatuses() {
    return Object.fromEntries(downloadStatus);
}

module.exports = {
    getRegions,
    downloadAndBuildRegion,
    getStatus,
    getAllStatuses
};
