const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const groqApiKey = process.env.GROQ_API_KEY || process.env.GROQ_API || process.env['GROQ-API'] || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
const groqApiKeyName = process.env.GROQ_API_KEY ? 'GROQ_API_KEY' : process.env.GROQ_API ? 'GROQ_API' : process.env['GROQ-API'] ? 'GROQ-API' : process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : process.env.OPENAI_KEY ? 'OPENAI_KEY' : null;

// Set up memory storage for handling file uploads from the frontend
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files (like index.html) from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Secure Proxy Endpoint: Frontend sends audio here; server talks to Groq
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
    try {
        console.log('Received /api/transcribe request', {
            file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : null,
            prompt: req.body.prompt
        });

        if (!req.file) {
            console.error('No file found in request body');
            return res.status(400).json({ error: "No audio file uploaded." });
        }

        if (!groqApiKey) {
            console.error('Missing API key', {
                GROQ_API_KEY: process.env.GROQ_API_KEY,
                GROQ_API: process.env.GROQ_API,
                GROQ_API_DASH: process.env['GROQ-API'],
                OPENAI_API_KEY: process.env.OPENAI_API_KEY,
                OPENAI_KEY: process.env.OPENAI_KEY
            });
            return res.status(500).json({ error: "Missing Groq API key. Set GROQ_API_KEY, GROQ_API, GROQ-API, OPENAI_API_KEY, or OPENAI_KEY in your environment." });
        }

        const prompt = req.body.prompt?.trim();

        // 1. Reconstruct the audio file as a Blob using the uploaded buffer
        const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/wav' });
        
        // 2. Prepare the FormData for Groq
        const formData = new FormData();
        formData.append("file", audioBlob, req.file.originalname || "recording.wav");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("language", "en");

        // 3. Send request to Groq using the secure server-side API Key
        const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${groqApiKey}`
            },
            body: formData
        });

        if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            console.error('Groq API error', { status: groqResponse.status, body: errorText, keySource: groqApiKeyName });
            const isInvalidKey = errorText.includes('invalid_api_key') || errorText.includes('Invalid API Key');
            if (isInvalidKey) {
                return res.status(401).json({ error: "Invalid Groq API key. Check the value in your .env file and restart the server." });
            }
            throw new Error(`Groq API responded with error: ${errorText}`);
        }

        const data = await groqResponse.json();
        
        // 4. Send the transcription text and prompt back to the frontend
        res.json({ text: data.text, prompt: prompt || data.text });

    } catch (error) {
        console.error("Transcription error:", error);
        const userMsg = error instanceof Error ? error.message : String(error);
        const isNetworkFailure = userMsg.includes('fetch failed') || userMsg.includes('ConnectTimeoutError') || userMsg.includes('UND_ERR_CONNECT_TIMEOUT');
        if (isNetworkFailure) {
            return res.status(503).json({ error: "Unable to reach Groq transcription service. Check network access, firewall/proxy, or Groq service availability." });
        }
        res.status(500).json({ error: userMsg });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});