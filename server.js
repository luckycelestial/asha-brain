const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    // Serve index.html from disk
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
        if (err) {
            res.writeHead(500);
            return res.end('Error loading index.html');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ status: "Breathing" }));
    }, 15000);

    const geminiWs = new WebSocket(GEMINI_URL);
    geminiWs.on('error', (e) => console.error('Gemini Error:', e.message));

    geminiWs.on('open', () => {
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { parts: [{ text: "You are Asha. Speak Tanglish. Ask name." }] },
                generation_config: { response_modalities: ["AUDIO"] }
            }
        }));
    });

    geminiWs.on('message', (data) => {
        try {
            const resp = JSON.parse(data);
            const audio = resp.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                          resp.serverContent?.modelTurn?.parts?.[0]?.audio;
            if (audio && ws.readyState === WebSocket.OPEN) {
                ws.send(Buffer.from(audio, 'base64'));
            }
        } catch (e) { /* Ignore non-JSON or parse errors */ }
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: data.toString('base64') }]
                }
            }));
        }
    });

    ws.on('close', () => {
        clearInterval(heartbeat);
        geminiWs.close();
    });
});

server.listen(PORT, () => console.log('Asha Switchboard Active'));
