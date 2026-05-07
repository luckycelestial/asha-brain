const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Asha Brain Console</title>
            <style>
                body { margin: 0; background: #050505; color: white; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
                .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(15px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 40px; text-align: center; width: 400px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                .orb { width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, #8A2BE2, #4B0082); margin: 0 auto 30px; box-shadow: 0 0 50px #8A2BE2; animation: pulse 2s infinite ease-in-out; position: relative; }
                .orb::after { content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; border-radius: 50%; border: 2px solid rgba(138, 43, 226, 0.3); animation: ripple 2s infinite; }
                @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; filter: brightness(1.2); } }
                @keyframes ripple { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
                h1 { margin: 0; font-weight: 300; letter-spacing: 2px; color: #E0E0E0; }
                p { color: #888; margin: 10px 0 30px; font-size: 0.9rem; }
                .status { font-size: 0.8rem; padding: 8px 16px; border-radius: 20px; background: rgba(0,255,0,0.1); color: #00FF00; display: inline-block; margin-bottom: 20px; }
                #log { width: 100%; height: 100px; background: rgba(0,0,0,0.3); border-radius: 12px; margin-top: 20px; padding: 10px; font-family: monospace; font-size: 0.7rem; text-align: left; overflow-y: auto; color: #666; }
                .btn { background: white; color: black; border: none; padding: 12px 30px; border-radius: 30px; font-weight: 600; cursor: pointer; transition: 0.3s; }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(255,255,255,0.2); }
            </style>
        </head>
        <body>
            <div class="glass">
                <div class="orb"></div>
                <h1>ASHA BRAIN</h1>
                <p>AI Receptionist Gateway</p>
                <div class="status" id="status">● API KEY ACTIVE</div>
                <button class="btn" id="micBtn">START MIC TEST</button>
                <div id="log">Waiting for connection...</div>
            </div>

            <script>
                const log = document.getElementById('log');
                const btn = document.getElementById('micBtn');
                const status = document.getElementById('status');
                let ws;
                let audioCtx;
                let processor;

                function addLog(msg) {
                    log.innerHTML += '<div>[' + new Date().toLocaleTimeString() + '] ' + msg + '</div>';
                    log.scrollTop = log.scrollHeight;
                }

                btn.onclick = async () => {
                    if (ws) return;
                    addLog("Initializing Web Bridge...");
                    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
                    ws.onopen = () => addLog("Connected to Cloud Brain");
                    ws.onmessage = async (e) => {
                        if (typeof e.data === 'string' && e.data.includes('Breathing')) {
                            status.innerText = "● ASHA IS BREATHING";
                        } else {
                            // Handle binary audio from server
                            const blob = e.data;
                            const arrayBuffer = await blob.arrayBuffer();
                            playAudio(arrayBuffer);
                        }
                    };

                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioCtx = new AudioContext({ sampleRate: 16000 });
                    const source = audioCtx.createMediaStreamSource(stream);
                    processor = audioCtx.createScriptProcessor(4096, 1, 1);
                    
                    processor.onaudioprocess = (e) => {
                        const input = e.inputBuffer.getChannelData(0);
                        const pcm = new Int16Array(input.length);
                        for (let i = 0; i < input.length; i++) pcm[i] = input[i] * 0x7FFF;
                        if (ws.readyState === WebSocket.OPEN) ws.send(pcm.buffer);
                    };

                    source.connect(processor);
                    processor.connect(audioCtx.destination);
                    btn.innerText = "ASHA IS LISTENING...";
                };

                async function playAudio(buffer) {
                    const audioBuffer = await audioCtx.decodeAudioData(buffer);
                    const source = audioCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(audioCtx.destination);
                    source.start();
                }
            </script>
        </body>
        </html>
    `);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client Connected');
    
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ status: "Asha is Breathing" }));
    }, 15000);

    const geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('error', (err) => console.error('Gemini Error:', err.message));

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
            ws.send(Buffer.from(audioBase64, 'base64'));
        }
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            // Binary support for both Browser and Phone
            const b64 = data.toString('base64');
            geminiWs.send(JSON.stringify({
                realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: b64 }] }
            }));
        }
    });

    ws.on('close', () => {
        clearInterval(heartbeat);
        geminiWs.close();
    });
});

server.listen(PORT, () => console.log(`Asha Brain on ${PORT}`));
