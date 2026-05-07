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
    console.log('--- Client Connected to Asha Brain ---');
    
    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        console.log('--- Connected to Google Gemini Live API ---');
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { 
                    parts: [{ text: "You are Asha, a medical receptionist. Speak Tanglish (Tamil + English). Be warm and helpful." }] 
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
            
            // Handle Audio Data
            const audio = resp.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                          resp.serverContent?.modelTurn?.parts?.[0]?.audio;
            if (audio && ws.readyState === WebSocket.OPEN) {
                ws.send(Buffer.from(audio, 'base64'));
            }

            // Handle Text/Transcript Data
            const text = resp.serverContent?.modelTurn?.parts?.[0]?.text;
            if (text && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "transcript", text }));
            }

            // Log any errors from Google
            if (resp.error) console.error('Gemini API Error:', resp.error);
            
        } catch (e) {
            console.error('Error processing Gemini message:', e.message);
        }
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            // Forward raw PCM audio from client to Gemini
            const base64Audio = data.toString('base64');
            geminiWs.send(JSON.stringify({
                realtime_input: {
                    media_chunks: [{
                        mime_type: "audio/pcm;rate=16000",
                        data: base64Audio
                    }]
                }
            }));
        }
    });

    geminiWs.on('error', (e) => console.error('Gemini WebSocket Error:', e.message));
    ws.on('close', () => {
        console.log('Client Disconnected');
        geminiWs.close();
    });
});

server.listen(PORT, () => console.log('Asha Switchboard v2.0 (Gemini 2.0 Flash) Active'));
