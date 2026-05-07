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
    console.log('--- Client Connected: Gemini 3.1 Mode ---');
    
    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        console.log('--- Live Bridge: Gemini 3.1 Active ---');
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-3.1-flash-live-preview", // UPDATED TO 3.1
                system_instruction: { 
                    parts: [{ text: "You are Asha, the VoxAI medical receptionist. Speak Tanglish. Help patients book appointments." }] 
                },
                generation_config: { 
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: { prebuilt_voice_config: { voice_name: "Aoede" } }
                    }
                }
            }
        }));
    });

    geminiWs.on('message', (data) => {
        try {
            const resp = JSON.parse(data);
            
            // Forward Audio (A2A Native)
            const audio = resp.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                          resp.serverContent?.modelTurn?.parts?.[0]?.audio;
            if (audio && ws.readyState === WebSocket.OPEN) {
                ws.send(Buffer.from(audio, 'base64'));
            }

            // Forward Transcripts
            const text = resp.serverContent?.modelTurn?.parts?.[0]?.text;
            if (text && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "transcript", text }));
            }
            
        } catch (e) { }
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            // Forwarding native audio to Gemini 3.1
            geminiWs.send(JSON.stringify({
                realtime_input: {
                    media_chunks: [{
                        mime_type: "audio/pcm;rate=16000",
                        data: data.toString('base64')
                    }]
                }
            }));
        }
    });

    ws.on('close', () => geminiWs.close());
});

server.listen(PORT, () => console.log('Asha Switchboard: GEMINI 3.1 LIVE MODE'));
