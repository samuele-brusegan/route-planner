const { workerData, parentPort } = require('worker_threads');
const PDFDocument = require('pdfkit');

try {
    const { imageDataUrl, title = 'Route Planner' } = workerData;
    const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
    const pngBuffer = Buffer.from(base64, 'base64');

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        parentPort.postMessage({ data: pdfBuffer });
    });

    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown();
    doc.image(pngBuffer, { fit: [760, 480], align: 'center', valign: 'center' });
    doc.end();
} catch (error) {
    parentPort.postMessage({ error: error.message });
}
