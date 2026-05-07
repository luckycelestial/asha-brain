const express = require('express');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIG ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

let activeConnections = 0;

const server = app.listen(port, () => {
    console.log(`Asha Brain listening on port ${port}`);
});

// --- PULSE CHECK ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0a0a0a; color: white;">
                <h1 style="color: #4285F4;">Asha Brain is Pulse Check 🧠✨</h1>
                <div style="padding: 20px; border-radius: 15px; background: #1a1a1a; text-align: center; border: 1px solid #333;">
                    <p>Status: <span style="color: #10B981; font-weight: bold;">LIVE</span></p>
                    <p>Bridge Connection: <span style="color: ${activeConnections > 0 ? '#10B981' : '#EF4444'}; font-weight: bold;">${activeConnections > 0 ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}</span></p>
                    <p style="color: #888; font-size: 0.8em;">Active Links: ${activeConnections}</p>
                </div>
            </body>
        </html>
    `);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    activeConnections++;
    console.log('New Bridge connection established. Active:', activeConnections);

    // Proxy to Gemini
    const geminiWs = new WebSocket(GEMINI_WS_URL);

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

        // NUDGE: Force an initial greeting
        setTimeout(() => {
            if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify({
                    clientContent: {
                        turns: [{
                            role: "user",
                            parts: [{ text: "(The call has just been answered. Greet the patient warmly in Tanglish and ask how you can help.)" }]
                        }],
                        turnComplete: true
                    }
                }));
            }
        }, 500);
    });

    // Pipeline: Phone -> Gemini
    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    audio: { mimeType: "audio/pcm;rate=16000", data: data.toString() }
                }
            }));
        }
    });

    // Pipeline: Gemini -> Phone
    geminiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            const audioData = response.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
                ws.send(audioData); // Send raw audio back to phone
            }
        } catch (e) {
            // Handle non-JSON or parsing errors gracefully
        }
    });

    ws.on('close', () => {
        activeConnections--;
        console.log('Bridge connection closed. Active:', activeConnections);
        geminiWs.close();
    });

    geminiWs.on('error', (err) => console.error('Gemini WS Error:', err));
    ws.on('error', (err) => console.error('Phone WS Error:', err));
});
