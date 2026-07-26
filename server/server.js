const express = require('express');
const fsSync = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json({ limit: '25mb' }));

// --- Static files (frontend) ---
// In Docker: frontend mounted at /app/public; in dev: ../frontend
const frontendDir = fsSync.existsSync('/app/public') ? '/app/public' : path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir, {
    index: 'index.html',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));

// --- SPA fallback ---
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
});

// --- API Routes ---
const routingRouter = require('./routes/routing');
const exportRouter = require('./routes/export');
const searchRouter = require('./routes/search');
const poiRouter = require('./routes/poi');
const terrainRouter = require('./routes/terrain');
const shareRouter = require('./routes/share');
const elevationRouter = require('./routes/elevation');

app.use('/api/routing', routingRouter);
app.use('/api/export', exportRouter);
app.use('/api/search', searchRouter);
app.use('/api/poi', poiRouter);
app.use('/api/terrain', terrainRouter);
app.use('/api/share', shareRouter);
app.use('/api/elevation', elevationRouter);

// --- Valhalla proxy (transparent) ---
const valhallaUrl = process.env.VALHALLA_URL || 'http://valhalla:8002';
app.use('/api/valhalla', createProxyMiddleware({
    target: valhallaUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/valhalla': '' }
}));

// --- Health check ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'route-planner' });
});

// --- Error handler ---
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// --- Cleanup on exit ---
const { closeAllConnections } = require('./utils/tiles-server');
process.on('SIGTERM', () => {
    closeAllConnections();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Route Planner server running on port ${PORT}`);
});
