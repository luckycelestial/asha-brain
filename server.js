const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
        if (err) { res.writeHead(500); return res.end('Error'); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

// TRACKING CONNECTIONS
let mobileConnected = false;

wss.on('connection', (ws, req) => {
    // If connection comes from Android (User-Agent or subprotocol)
    const isMobile = req.headers['user-agent']?.includes('Dalvik') || req.headers['user-agent']?.includes('Android');
    
    if (isMobile) {
        mobileConnected = true;
        broadcastStatus();
        console.log('--- MOBILE DEVICE LINKED ---');
    }

    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
    });

    ws.on('message', (data) => {
        // Send initial status to new web clients
        if (data.toString() === "check_mobile") {
            ws.send(JSON.stringify({ type: "mobile_status", online: mobileConnected }));
            return;
        }

        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(data.toString());
        }
    });

    ws.on('close', () => {
        if (isMobile) {
            mobileConnected = false;
            broadcastStatus();
            console.log('--- MOBILE DEVICE DISCONNECTED ---');
        }
        geminiWs.close();
    });

    function broadcastStatus() {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "mobile_status", online: mobileConnected }));
            }
        });
    }
});

server.listen(PORT, () => console.log('Asha Multi-Link Server Active'));
