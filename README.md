# 🎙️ Gemini Real-Time Audio Dialog

This Node.js project provides a real-time conversational experience using **Google Gemini 2.5 Flash** with native audio input and output. It captures microphone input, streams it to Gemini, and plays back AI-generated speech responses.

---

## 🚀 Features

* 🎤 **Live Microphone Input** (16kHz PCM)
* 🧠 **Streaming Responses** using Gemini 2.5 Flash audio dialog model
* 🔊 **Realtime AI Voice Output** via system speaker
* 🔁 **Full-Duplex Interaction Loop** (input ➜ response ➜ output ➜ repeat)

---

## 🛠️ Setup

### 1. Clone the Repository

```bash
git clone https://github.com/hamedsz/gemini-native-audio-client-nodejs.git
cd gemini-native-audio-client-nodejs
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure API Key

Copy `.env.example` to `.env` and replace the placeholder with your [Google AI Studio API Key](https://aistudio.google.com/apikey):

```js
GOOGLE_API_KEY=YOUR_API_KEY_HERE
```

---

## ▶️ Running the App

```bash
npm start
```
or 
```bash
node main.js
```

You’ll hear the AI speak and can respond via your microphone in a continuous loop.

---

## 🧩 How It Works

* `node-mic` captures live audio (16kHz mono PCM).
* Audio is chunked every 100ms and streamed to Gemini’s **native audio dialog model**.
* Gemini returns audio chunks (base64 PCM) in near real-time.
* `Speaker` plays the response through your system’s default audio output.
* The pipeline waits for the AI to finish speaking before accepting the next input.

---

## 📁 File Structure

```
.
├── index.js          # Main logic
├── README.md         # This file
```

---

## 🎛️ Configuration Notes

* **Model used**: `models/gemini-2.5-flash-preview-native-audio-dialog`
* **Voice**: Zephyr (changeable via `voiceConfig`)
* **Audio Format**: `audio/pcm;rate=16000` for input, 24kHz for output

---

## 🧠 Requirements

* Node.js 18+
* macOS, Linux, or WSL with microphone access
* Internet connection for Gemini API

---

## ⚠️ Troubleshooting

* **No sound**: Check speaker defaults and ensure PCM format is supported.
* **Mic not working**: Ensure permissions and check the `node-mic` config.
* **Incomplete audio playback**: This is addressed by waiting for speaker flush before continuing (see `audioStream.push(null)` and `waitForPlaybackToFinish()`).

---

## 📜 License

MIT — Free to use, modify, and distribute.

---

## 🙏 Acknowledgments

Built on top of [@google/genai](https://www.npmjs.com/package/@google/genai), inspired by real-time AI dialog use cases.