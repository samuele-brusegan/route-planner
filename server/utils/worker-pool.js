const { Worker } = require('worker_threads');
const path = require('path');

const workers = new Map();
const MAX_WORKERS = 2;

async function runWorker(workerScript, data) {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, '..', 'workers', workerScript);
        const worker = new Worker(workerPath, { workerData: data });

        worker.on('message', (result) => {
            if (result.error) {
                reject(new Error(result.error));
            } else {
                resolve(result.data);
            }
            worker.terminate();
        });

        worker.on('error', (error) => {
            reject(error);
            worker.terminate();
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

module.exports = { runWorker, MAX_WORKERS };
