const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenericService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Asha Brain is Active\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Phone Connected to Brain');
    
    // Connect to Gemini Live API
    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
        console.log('Connected to Gemini Live API');
        // Send Setup
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { parts: [{ text: "You are Asha, the smart AI medical receptionist for 'Vox Medical'. Speak in a warm, helpful Tanglish (Tamil + English) style. Vanakkam! Ask for their name, their contact number, and what health issue they have. Then book a slot for them. Always confirm the details clearly at the end. Keep responses concise for telephony." }] },
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: { voice_config: { prebuilt_voice_config: { voice_name: "Lyra" } } }
                }
            }
        }));

        // Initial Greeting
        setTimeout(() => {
            if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify({
                    clientContent: {
                        turns: [{
                            role: "user",
                            parts: [{ text: "Vanakkam! I am Asha from Vox Medical. How can I help you today?" }]
                        }],
                        turnComplete: true
                    }
                }));
            }
        }, 1000);
    });

    // Pipeline: Gemini -> Phone
    geminiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            const audioData = 
                response.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                response.serverContent?.modelTurn?.parts?.[0]?.audio;

            if (audioData) {
                console.log(`>>> Sending Audio to Phone (${audioData.length} bytes)`);
                ws.send(audioData); 
            }
        } catch (e) {
            console.error('Gemini Msg Error:', e);
        }
    });

    // Pipeline: Phone -> Gemini
    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            const chunk = data.toString();
            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: chunk
                    }]
                }
            }));
        }
    });

    ws.on('close', () => {
        console.log('Phone Disconnected');
        geminiWs.close();
    });

    geminiWs.on('error', (err) => console.error('Gemini Error:', err));
    ws.on('error', (err) => console.error('Phone WS Error:', err));
});

server.listen(PORT, () => {
    console.log(`Asha Brain listening on port ${PORT}`);
});
