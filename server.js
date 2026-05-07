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
    console.log('--- Client Connected to Bridge ---');
    
    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        console.log('--- Connected to Gemini 3.1 API ---');
        // MATCHING YOUR WORKING VOX_AGENT SETUP
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-3.1-flash-live-preview",
                system_instruction: { parts: [{ text: "You are Asha. Speak Tanglish. Help patients book appointments." }] },
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: { prebuilt_voice_config: { voice_name: "Lyra" } }
                    }
                }
            }
        }));
    });

    geminiWs.on('message', (data) => {
        try {
            const resp = JSON.parse(data);
            
            // Handle both snake_case and camelCase for robustness
            const content = resp.serverContent || resp.server_content;
            if (content?.modelTurn?.parts || content?.model_turn?.parts) {
                const parts = content.modelTurn?.parts || content.model_turn?.parts;
                parts.forEach(part => {
                    const audio = part.inlineData?.data || part.inline_data?.data || part.audio;
                    if (audio && ws.readyState === WebSocket.OPEN) {
                        ws.send(Buffer.from(audio, 'base64'));
                    }
                    if (part.text && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "transcript", text: part.text }));
                    }
                });
            }
            
            if (resp.setupComplete || resp.setup_complete) {
                console.log('--- Gemini 3.1 Setup SUCCESS ---');
            }
            if (resp.error) console.error('Gemini Error:', resp.error);
            
        } catch (e) { }
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            // MATCHING YOUR WORKING VOX_AGENT AUDIO INPUT
            geminiWs.send(JSON.stringify({
                realtimeInput: { 
                    audio: { 
                        mimeType: "audio/pcm;rate=16000", 
                        data: data.toString('base64') 
                    } 
                }
            }));
        }
    });

    ws.on('close', () => geminiWs.close());
    geminiWs.on('close', () => ws.close());
});

server.listen(PORT, () => console.log('Asha Master Bridge Active'));
