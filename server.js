const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

// Move HTML to a separate variable for better memory handling
const dashboardUI = `
<!DOCTYPE html>
<html>
<head>
    <title>Asha Console</title>
    <style>
        body { margin: 0; background: #050505; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .orb { width: 100px; height: 100px; border-radius: 50%; background: radial-gradient(circle, #8A2BE2, #4B0082); margin-bottom: 20px; box-shadow: 0 0 30px #8A2BE2; animation: p 2s infinite; }
        @keyframes p { 50% { transform: scale(1.1); filter: brightness(1.2); } }
        .box { background: rgba(255,255,255,0.05); padding: 30px; border-radius: 20px; text-align: center; border: 1px solid rgba(255,255,255,0.1); width: 300px; }
        #log { font-size: 0.7rem; color: #666; margin-top: 20px; height: 60px; overflow-y: auto; text-align: left; }
        button { background: white; border: none; padding: 10px 20px; border-radius: 20px; font-weight: bold; cursor: pointer; }
    </style>
</head>
<body>
    <div class="box">
        <div class="orb"></div>
        <h2>ASHA BRAIN</h2>
        <button id="test">START MIC TEST</button>
        <div id="log">Ready.</div>
    </div>
    <script>
        const log = (m) => document.getElementById('log').innerHTML += '<div>' + m + '</div>';
        document.getElementById('test').onclick = async () => {
            const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
            ws.onopen = () => log("Connected.");
            ws.onmessage = async (e) => { 
                if (!(typeof e.data === 'string')) {
                    const ctx = new AudioContext({sampleRate:24000});
                    const buf = await ctx.decodeAudioData(await e.data.arrayBuffer());
                    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start();
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia({audio:true});
            const ctx = new AudioContext({sampleRate:16000});
            const src = ctx.createMediaStreamSource(stream);
            const proc = ctx.createScriptProcessor(4096, 1, 1);
            proc.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const pcm = new Int16Array(input.length);
                for (let i=0; i<input.length; i++) pcm[i] = input[i]*0x7FFF;
                if (ws.readyState === 1) ws.send(pcm.buffer);
            };
            src.connect(proc); proc.connect(ctx.destination);
            document.getElementById('test').innerText = "LISTENING...";
        }
    </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(dashboardUI);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ status: "Breathing" }));
    }, 15000);

    const geminiWs = new WebSocket(GEMINI_URL);
    geminiWs.on('error', (e) => console.error(e.message));

    geminiWs.on('open', () => {
        geminiWs.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.0-flash-exp",
                system_instruction: { parts: [{ text: "You are Asha. Speak Tanglish. Ask name." }] },
                generation_config: { response_modalities: ["AUDIO"] }
            }
        }));
    });

    geminiWs.on('message', (data) => {
        const resp = JSON.parse(data);
        const audio = resp.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                      resp.serverContent?.modelTurn?.parts?.[0]?.audio;
        if (audio && ws.readyState === WebSocket.OPEN) ws.send(Buffer.from(audio, 'base64'));
    });

    ws.on('message', (data) => {
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
                realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: data.toString('base64') }] }
            }));
        }
    });

    ws.on('close', () => { clearInterval(heartbeat); geminiWs.close(); });
});

server.listen(PORT, () => console.log('Asha Live'));
