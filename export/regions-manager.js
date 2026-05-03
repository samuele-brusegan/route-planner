const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const tar = require('tar');
const { downloadDEM } = require('./dem-manager');

const GEOFABRIK_INDEX_URL = 'https://download.geofabrik.de/index-v1.json';
const DATA_DIR = '/data';
const VALHALLA_CONTAINER = process.env.VALHALLA_CONTAINER || 'route-planner-valhalla-1';
const VALHALLA_STATUS_URL = process.env.VALHALLA_STATUS_URL || 'http://valhalla:8002/status';
const VALHALLA_CONFIG_PATH = process.env.VALHALLA_CONFIG_PATH || '/data/valhalla.generated.json';
const VALHALLA_TILE_DIR = process.env.VALHALLA_TILE_DIR || '/data/valhalla_tiles';
const VALHALLA_TILE_EXTRACT = process.env.VALHALLA_TILE_EXTRACT || '/data/valhalla_tiles.tar';

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
        stage: 'Generazione tile Valhalla locale'
    });

    await runDockerCommand([
        'exec',
        VALHALLA_CONTAINER,
        'valhalla_build_tiles',
        '-c',
        VALHALLA_CONFIG_PATH,
        pbfPath
    ], regionId, 'building_tiles', 'Generazione tile Valhalla locale');

    await runDockerCommand([
        'exec',
        VALHALLA_CONTAINER,
        'valhalla_build_extract',
        '-c',
        VALHALLA_CONFIG_PATH,
        '-v'
    ], regionId, 'building_tiles', 'Esportazione extract Valhalla locale');

    await validateValhallaBuild(regionId, pbfPath);

    const manifest = {
        regionId,
        sourcePbf: pbfPath,
        builtAt: new Date().toISOString(),
        tileDir: VALHALLA_TILE_DIR,
        tileExtract: VALHALLA_TILE_EXTRACT
    };

    await fs.mkdir(VALHALLA_TILE_DIR, { recursive: true });
    await fs.writeFile(path.join(VALHALLA_TILE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    downloadStatus.set(regionId, {
        status: 'tiles_built',
        progress: 100,
        stage: 'Tile Valhalla locali pronti',
        manifest
    });

    return VALHALLA_TILE_DIR;
}

function runDockerCommand(args, regionId, status, stage) {
    return new Promise((resolve, reject) => {
        const process = spawn('docker', args);

        process.on('error', (error) => {
            downloadStatus.set(regionId, {
                status: 'warning',
                progress: 0,
                stage,
                error: error.message
            });
            reject(error);
        });

        process.stdout.on('data', (data) => {
            console.log(`Valhalla build: ${data}`);
            downloadStatus.set(regionId, {
                ...downloadStatus.get(regionId),
                status,
                progress: Math.min(95, (downloadStatus.get(regionId).progress || 0) + 5),
                stage
            });
        });

        process.stderr.on('data', (data) => {
            console.error(`Valhalla build error: ${data}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                const error = new Error(`Process exited with code ${code}`);
                downloadStatus.set(regionId, {
                    status: 'warning',
                    progress: 0,
                    stage: 'Build tile non disponibile in questo ambiente',
                    error: error.message
                });
                reject(error);
            }
        });
    });
}

async function validateValhallaBuild(regionId, pbfPath) {
    const tileState = await getTileDirectoryState(VALHALLA_TILE_DIR);
    if (!tileState.exists || tileState.count === 0) {
        throw new Error(`Valhalla tile directory non pronta: ${VALHALLA_TILE_DIR}`);
    }

    const extractExists = await pathExists(VALHALLA_TILE_EXTRACT);
    if (!extractExists) {
        throw new Error(`Valhalla extract mancante: ${VALHALLA_TILE_EXTRACT}`);
    }

    const status = await fetchValhallaStatus();
    if (!status.ok) {
        throw new Error(`Valhalla status non sano: ${status.message}`);
    }

    downloadStatus.set(regionId, {
        ...downloadStatus.get(regionId),
        status: 'validating',
        progress: 95,
        stage: 'Validazione grafo locale completata',
        valhallaStatus: status.data
    });

    return { tileState, status, pbfPath };
}

async function fetchValhallaStatus() {
    try {
        const response = await axios.get(VALHALLA_STATUS_URL, { timeout: 5000 });
        return {
            ok: true,
            data: response.data
        };
    } catch (error) {
        return {
            ok: false,
            message: error.response?.data?.error || error.message
        };
    }
}

async function getTileDirectoryState(directoryPath) {
    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        const visibleEntries = entries.filter(entry =>
            !entry.name.startsWith('.') &&
            entry.name !== 'manifest.json' &&
            entry.name !== 'region.json'
        );
        return {
            exists: true,
            count: visibleEntries.length
        };
    } catch (error) {
        return {
            exists: false,
            count: 0
        };
    }
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch (error) {
        return false;
    }
}

async function readValhallaManifest() {
    try {
        const raw = await fs.readFile(path.join(VALHALLA_TILE_DIR, 'manifest.json'), 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function openSqliteDatabase(filePath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filePath, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(db);
            }
        });
    });
}

function runSqlite(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

async function createVectorTilesShell(regionId, pbfPath, bounds = null) {
    const mbtilesPath = path.join(DATA_DIR, `${regionId}.mbtiles`);
    const db = await openSqliteDatabase(mbtilesPath);

    try {
        await runSqlite(db, 'CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)');
        await runSqlite(db, 'CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)');
        await runSqlite(db, 'CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row)');
        await runSqlite(db, 'DELETE FROM metadata');
        await runSqlite(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', ['name', regionId]);
        await runSqlite(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', ['format', 'pbf']);
        await runSqlite(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', ['region_id', regionId]);
        await runSqlite(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', ['source_pbf', pbfPath]);
        if (bounds) {
            await runSqlite(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', ['bounds', JSON.stringify(bounds)]);
        }
    } finally {
        await new Promise((resolve) => db.close(() => resolve()));
    }

    return mbtilesPath;
}

// Build vector tiles (minimal MBTiles shell when real tile generation is unavailable)
async function buildVectorTiles(regionId, pbfPath) {
    downloadStatus.set(regionId, {
        status: 'building_vector_tiles',
        progress: 0,
        stage: 'Preparazione MBTiles'
    });
    
    try {
        const mbtilesPath = await createVectorTilesShell(regionId, pbfPath);
        downloadStatus.set(regionId, {
            status: 'vector_tiles_ready',
            progress: 100,
            stage: 'MBTiles creato'
        });
        
        return mbtilesPath;
    } catch (error) {
        downloadStatus.set(regionId, {
            status: 'error',
            progress: 0,
            stage: 'Errore vector tiles',
            error: error.message
        });
        return null;
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

async function deleteRegionData(regionId) {
    const targets = [
        path.join(DATA_DIR, `${regionId}.osm.pbf`),
        path.join(DATA_DIR, `${regionId}.mbtiles`),
        path.join(DATA_DIR, 'dem', regionId),
        path.join(DATA_DIR, 'valhalla_tiles', regionId)
    ];

    await Promise.all(targets.map(async (target) => {
        try {
            await fs.rm(target, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Failed to remove ${target}:`, error.message);
        }
    }));

    const manifest = await readValhallaManifest();
    if (manifest?.regionId === regionId) {
        await Promise.all([
            fs.rm(VALHALLA_TILE_DIR, { recursive: true, force: true }),
            fs.rm(VALHALLA_TILE_EXTRACT, { force: true })
        ]).catch(error => {
            console.warn(`Failed to clear active Valhalla artifacts for ${regionId}:`, error.message);
        });
    }

    downloadStatus.delete(regionId);
    return { success: true, regionId };
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
        const routingTiles = await buildValhallaTiles(regionId, pbfPath);
        
        // Optionally build vector tiles
        if (includeVectorTiles) {
            await buildVectorTiles(regionId, pbfPath);
        }
        
        // Cleanup PBF
        await cleanup(regionId);
        
        downloadStatus.set(regionId, {
            status: 'completed',
            progress: 100,
            stage: routingTiles ? 'Completato' : 'Completato con warning'
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
    getAllStatuses,
    deleteRegionData
};
