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
    console.log('--- Client Connected ---');
    
    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        console.log('--- Connected to Gemini 3.1 ---');
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-3.1-flash-live-preview",
                system_instruction: { parts: [{ text: "You are Asha. Speak Tanglish. Help patients." }] },
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
            
            // Support BOTH snake_case and camelCase for Gemini 3.1 Protocol
            const serverContent = resp.server_content || resp.serverContent;
            if (!serverContent) return;

            const modelTurn = serverContent.model_turn || serverContent.modelTurn;
            if (modelTurn?.parts) {
                modelTurn.parts.forEach(part => {
                    // Extract Audio (Support both formats)
                    const audioBase64 = part.inline_data?.data || part.inlineData?.data || part.audio;
                    if (audioBase64 && ws.readyState === WebSocket.OPEN) {
                        ws.send(Buffer.from(audioBase64, 'base64'));
                    }

                    // Extract Text
                    if (part.text && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "transcript", text: part.text }));
                    }
                });
            }
        } catch (e) {
            console.error('Parse error:', e.message);
        }
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
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
    geminiWs.on('close', () => ws.close());
});

server.listen(PORT, () => console.log('Asha Protocol v3.1 Fixed'));
