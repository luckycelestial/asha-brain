const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
// The server adds the API KEY here securely
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
        if (err) {
            res.writeHead(500); return res.end('Error');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected to pipe');
    const geminiWs = new WebSocket(GEMINI_URL);

    // PIPE: Gemini -> Client
    geminiWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data.toString());
        }
    });

    // PIPE: Client -> Gemini
    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(data.toString());
        }
    });

    geminiWs.on('error', (e) => console.error('Gemini Error:', e.message));
    ws.on('close', () => geminiWs.close());
    geminiWs.on('close', () => ws.close());
});

server.listen(PORT, () => console.log('Asha Transparent Pipe Active'));
