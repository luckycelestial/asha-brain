const express = require('express');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIG ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const server = app.listen(port, () => {
    console.log(`Asha Brain listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (phoneWs) => {
    console.log('Phone connected to Asha Brain');

    // Connect to Google Gemini
    const geminiWs = new WebSocket(GEMINI_WS_URL);

    geminiWs.on('open', () => {
        // Send Setup
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { parts: [{ text: "You are Asha, a medical receptionist. Speak in Tanglish." }] },
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: { voice_config: { prebuilt_voice_config: { voice_name: "Lyra" } } }
                }
            }
        }));
    });

    // Pipeline: Phone -> Gemini
    phoneWs.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            // Assume phone sends raw PCM base64
            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    audio: { mimeType: "audio/pcm;rate=16000", data: data.toString() }
                }
            }));
        }
    });

    // Pipeline: Gemini -> Phone
    geminiWs.on('message', (data) => {
        const response = JSON.parse(data);
        const audioData = response.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData) {
            phoneWs.send(audioData); // Send raw audio back to phone
        }
    });

    phoneWs.on('close', () => geminiWs.close());
});
