const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
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
    console.log('Client Connected to Brain');
    
    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { parts: [{ text: "You are Asha, the friendly AI medical receptionist for VoxAI Clinic. Speak Tanglish. Help book appointments." }] },
                generation_config: { response_modalities: ["AUDIO"] }
            }
        }));
    });

    geminiWs.on('message', (data) => {
        try {
            const resp = JSON.parse(data);
            
            // Forward Audio
            const audio = resp.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                          resp.serverContent?.modelTurn?.parts?.[0]?.audio;
            if (audio && ws.readyState === WebSocket.OPEN) {
                ws.send(Buffer.from(audio, 'base64'));
            }

            // Forward Transcripts for the UI
            const text = resp.serverContent?.modelTurn?.parts?.[0]?.text;
            if (text && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "transcript", text }));
            }
        } catch (e) { }
    });

    ws.on('message', (data) => {
        // Handle incoming audio from browser
        if (geminiWs.readyState === WebSocket.OPEN) {
            if (data instanceof Buffer) {
                geminiWs.send(JSON.stringify({
                    realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: data.toString('base64') }] }
                }));
            }
        }
    });

    ws.on('close', () => geminiWs.close());
    geminiWs.on('close', () => ws.close());
});

server.listen(PORT, () => console.log('Asha Switchboard Ready'));
