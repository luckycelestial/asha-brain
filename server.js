const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenericService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Asha Brain is Active\n');
});

const wss = new WebSocket.Server({ server, path: '/asha' });

wss.on('connection', (ws) => {
    console.log('Phone Connected to Brain');
    
    // Heartbeat to keep Render alive
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ status: "Asha is Breathing" }));
    }, 15000);

    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        console.log('Connected to Gemini Live');
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { parts: [{ text: "You are Asha, a medical receptionist. Speak in Tanglish. Vanakkam! Ask name and issue." }] },
                generation_config: { response_modalities: ["AUDIO"] }
            }
        }));
    });

    geminiWs.on('message', (data) => {
        const response = JSON.parse(data);
        const audioBase64 = response.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                            response.serverContent?.modelTurn?.parts?.[0]?.audio;
        
        if (audioBase64 && ws.readyState === WebSocket.OPEN) {
            // Send as RAW BINARY to reduce overhead
            const buffer = Buffer.from(audioBase64, 'base64');
            ws.send(buffer);
        }
    });

    ws.on('message', (data) => {
        // Handle incoming binary PCM from phone
        if (geminiWs.readyState === WebSocket.OPEN) {
            if (Buffer.isBuffer(data)) {
                geminiWs.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: data.toString('base64') }]
                    }
                }));
            }
        }
    });

    ws.on('close', () => {
        clearInterval(heartbeat);
        geminiWs.close();
    });
});

server.listen(PORT, () => console.log(`Asha Brain on ${PORT}`));
