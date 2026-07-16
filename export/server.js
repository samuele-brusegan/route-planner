const express = require('express');
const PDFDocument = require('pdfkit');
const {
    getRegions,
    downloadAndBuildRegion,
    getStatus,
    getAllStatuses,
    deleteRegionData
} = require('./regions-manager');
const { getTile, getMetadata, closeAllConnections } = require('./tiles-server');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

app.post('/export/map/png', async (req, res) => {
    try {
        const { imageDataUrl } = req.body;
        if (!imageDataUrl || typeof imageDataUrl !== 'string') {
            return res.status(400).json({ error: 'imageDataUrl is required' });
        }

        const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
        const pngBuffer = Buffer.from(base64, 'base64');

        res.set('Content-Type', 'image/png');
        res.set('Content-Length', String(pngBuffer.length));
        res.send(pngBuffer);
    } catch (error) {
        console.error('PNG export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

app.post('/export/map/pdf', async (req, res) => {
    try {
        const { imageDataUrl, title = 'Route Planner' } = req.body;
        if (!imageDataUrl || typeof imageDataUrl !== 'string') {
            return res.status(400).json({ error: 'imageDataUrl is required' });
        }

        const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
        const pngBuffer = Buffer.from(base64, 'base64');

        const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.set('Content-Type', 'application/pdf');
            res.send(pdfBuffer);
        });

        doc.fontSize(18).text(title, { align: 'center' });
        doc.moveDown();
        doc.image(pngBuffer, {
            fit: [760, 480],
            align: 'center',
            valign: 'center'
        });

        doc.end();
    } catch (error) {
        console.error('PDF export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// Export directions as PDF
app.post('/export/directions/pdf', async (req, res) => {
    try {
        const { directions, stats, dailyStats } = req.body;
        
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.set('Content-Type', 'application/pdf');
            res.send(pdfBuffer);
        });
        
        // Add title
        doc.fontSize(24).text('Indicazioni Route', { align: 'center' });
        doc.moveDown();
        
        // Add statistics
        doc.fontSize(14).text('Statistiche Generali:', { underline: true });
        doc.fontSize(12);
        doc.text(`Lunghezza Totale: ${stats.totalDistance} km`);
        doc.text(`Dislivello Positivo: ${stats.totalAscent} m`);
        doc.text(`Dislivello Negativo: ${stats.totalDescent} m`);
        doc.text(`Tempo Stimato: ${stats.totalTime}`);
        doc.moveDown();
        
        // Add daily statistics
        if (dailyStats && dailyStats.length > 0) {
            doc.fontSize(14).text('Statistiche per Giorno:', { underline: true });
            doc.fontSize(12);
            dailyStats.forEach(day => {
                doc.text(`Giorno ${day.day}:`);
                doc.text(`  Distanza: ${day.distance} km`);
                doc.text(`  Salita: ${day.ascent} m`);
                doc.text(`  Discesa: ${day.descent} m`);
                doc.text(`  Tempo: ${day.time}`);
                doc.moveDown();
            });
        }
        
        // Add directions
        doc.fontSize(14).text('Indicazioni:', { underline: true });
        doc.fontSize(12);
        directions.forEach((dir, index) => {
            doc.text(`${index + 1}. ${dir.instruction}`);
            if (dir.note) {
                doc.text(`   Nota: ${dir.note}`, { italic: true });
            }
            doc.moveDown();
        });
        
        doc.end();
    } catch (error) {
        console.error('Directions PDF export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Get available regions from Geofabrik
app.get('/regions', async (req, res) => {
    try {
        const filterArea = req.query.area || null;
        const regions = await getRegions(filterArea);
        res.json({ regions });
    } catch (error) {
        console.error('Error fetching regions:', error);
        res.status(500).json({ error: 'Failed to fetch regions' });
    }
});

// Download and build region tiles
app.post('/download-region', async (req, res) => {
    try {
        const { regionId, url, includeVectorTiles = false, includeDEM = false, bounds = null } = req.body;
        
        if (!regionId || !url) {
            return res.status(400).json({ error: 'regionId and url are required' });
        }
        
        // Start async download and build
        downloadAndBuildRegion(regionId, url, includeVectorTiles, includeDEM, bounds)
            .then(result => {
                console.log(`Region ${regionId} download completed:`, result);
            })
            .catch(error => {
                console.error(`Region ${regionId} download failed:`, error);
            });
        
        res.json({ 
            message: 'Download started',
            regionId,
            status: getStatus(regionId)
        });
    } catch (error) {
        console.error('Error starting download:', error);
        res.status(500).json({ error: 'Failed to start download' });
    }
});

// Get status of a specific download
app.get('/status/:regionId', (req, res) => {
    const { regionId } = req.params;
    const status = getStatus(regionId);
    res.json({ regionId, status });
});

// Get all download statuses
app.get('/status', (req, res) => {
    const statuses = getAllStatuses();
    res.json({ statuses });
});

app.delete('/regions/:regionId', async (req, res) => {
    try {
        const { regionId } = req.params;
        const result = await deleteRegionData(regionId);
        res.json(result);
    } catch (error) {
        console.error('Error deleting region:', error);
        res.status(500).json({ error: 'Failed to delete region' });
    }
});

// Serve vector tiles from MBTiles
app.get('/tiles/:regionId/:z/:x/:y.pbf', async (req, res) => {
    try {
        const { regionId, z, x, y } = req.params;
        const tileData = await getTile(regionId, parseInt(z), parseInt(x), parseInt(y));
        
        if (tileData) {
            res.set('Content-Type', 'application/x-protobuf');
            res.set('Content-Encoding', 'gzip');
            res.send(tileData);
        } else {
            res.status(404).json({ error: 'Tile not found' });
        }
    } catch (error) {
        console.error('Error serving tile:', error);
        res.status(500).json({ error: 'Failed to serve tile' });
    }
});

// Get MBTiles metadata
app.get('/tiles/:regionId/metadata', async (req, res) => {
    try {
        const { regionId } = req.params;
        const metadata = await getMetadata(regionId);
        
        if (metadata) {
            res.json({ metadata });
        } else {
            res.status(404).json({ error: 'Region not found' });
        }
    } catch (error) {
        console.error('Error getting metadata:', error);
        res.status(500).json({ error: 'Failed to get metadata' });
    }
});

app.listen(PORT, () => {
    console.log(`Export service running on port ${PORT}`);
});

// Cleanup on exit
process.on('SIGTERM', async () => {
    closeAllConnections();
    process.exit(0);
});
