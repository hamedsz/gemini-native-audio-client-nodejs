// To run this code you need to install the following dependencies:
// npm install @google/genai mime node-mic wavefile speaker
import {
  GoogleGenAI,
  Modality,
  MediaResolution
} from '@google/genai';
import mic from 'node-mic';
import Speaker from 'speaker';
import { Readable } from 'stream';

let responseQueue = [];
let session = undefined;
let currentSpeaker = null;
let currentAudioStream = null;
let isPlayingAudio = false;

// Create audio pipeline for immediate streaming
function createAudioPipeline() {
  // Clean up existing pipeline
  if (currentAudioStream) {
    currentAudioStream.destroy();
  }
  if (currentSpeaker) {
    currentSpeaker.destroy();
  }
  
  currentSpeaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 24000,
    signed: true
  });
  
  currentAudioStream = new Readable({
    read() {}
  });
  
  currentAudioStream.pipe(currentSpeaker);
  
  currentSpeaker.on('close', () => {
    console.log('Audio playback finished');
    isPlayingAudio = false;
  });
  
  currentSpeaker.on('error', (err) => {
    console.error('Speaker error:', err);
    isPlayingAudio = false;
  });
  
  isPlayingAudio = true;
  turnComplete = false;
  
  console.log('Audio pipeline created and ready');
}

async function handleTurn() {
  const turn = [];
  let done = false;
  turnComplete = false;
  
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    
    // Check if this is the end of the turn
    if (message.serverContent && message.serverContent.turnComplete) {
      turnComplete = true;
      console.log('Turn complete - finalizing audio stream');
      finalizeAudioStream();
      done = true;
    }
  }
  
  // Wait for audio to finish playing
  await waitForAudioToFinish();
  return turn;
}

async function waitMessage() {
  let done = false;
  let message = undefined;
  while (!done) {
    message = responseQueue.shift();
    if (message) {
      handleModelTurn(message);
      done = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  return message;
}

function handleModelTurn(message) {
  if(message.serverContent?.modelTurn?.parts) {
    const part = message.serverContent?.modelTurn?.parts?.[0];

    if(part?.fileData) {
      console.log(`File: ${part?.fileData.fileUri}`);
    }

    if (part?.inlineData) {
      const inlineData = part?.inlineData;
      const buffer = Buffer.from(inlineData.data, 'base64');
      
      // Start audio pipeline if this is the first chunk
      if (!isPlayingAudio) {
        createAudioPipeline();
      }
      
      // Stream audio immediately
      if (currentAudioStream && !currentAudioStream.destroyed) {
        currentAudioStream.push(buffer);
        console.log(`Streamed audio chunk: ${buffer.length} bytes`);
      }
    }

    if(part?.text) {
      console.log('Text:', part?.text);
    }
  }
}

function finalizeAudioStream() {
  if (currentAudioStream && !currentAudioStream.destroyed) {
    // Signal end of stream
    currentAudioStream.push(null);
    console.log('Audio stream finalized');
  }
}

async function waitForAudioToFinish() {
  if (!isPlayingAudio) return;
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (!isPlayingAudio || (currentSpeaker && currentSpeaker.destroyed)) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 50);
    
    // Fallback timeout to prevent hanging
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 30000); // 30 second max wait
  });
}

async function main() {
  console.log('Setting up real-time audio system...');
  
  const ai = new GoogleGenAI({
    apiKey: 'AIzaSyBcwQI7aPDXPTFZu7m8Rp_Em1TtwOURIvE',
  });

  const model = 'models/gemini-2.5-flash-preview-native-audio-dialog';

  const config = {
    responseModalities: [
        Modality.AUDIO,
    ],
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Zephyr',
        }
      }
    },
    contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' },
    },
  };

  session = await ai.live.connect({
    model,
    callbacks: {
      onopen: function () {
        console.log('Session opened - ready for real-time conversation');
      },
      onmessage: function (message) {
       responseQueue.push(message);
      },
      onerror: function (e) {
        console.error('Session error:', e.message);
      },
      onclose: function (e) {
        console.log('Session closed:', e.reason);
      },
    },
    config
  });
  
  // Set up microphone recording
  setupMicrophone(session);

  // Handle conversation turns
  console.log('Starting real-time conversation...');
  while(true) {
    try {
      await handleTurn();
      // Very brief pause between turns for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch(error) {
      console.error('Error in turn handling:', error);
      // Reset audio state on error
      isPlayingAudio = false;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Sets up the microphone for recording and streaming to the API
 * @param {Object} session - The active Gemini session
 */
function setupMicrophone(session) {
  const microphone = new mic({
    rate: '16000',
    channels: '1',
    debug: false,
    exitOnSilence: -1,
    fileType: 'raw'
  });

  const micStream = microphone.getAudioStream();
  let audioChunks = [];
  let processingInterval = null;

  micStream.on('data', (data) => {
    audioChunks.push(data);
  });

  micStream.on('error', (err) => {
    console.error('Microphone Error:', err);
  });

  microphone.start();
  console.log('Microphone started - speak now!');

  // Send audio data every 100ms for real-time interaction
  processingInterval = setInterval(() => {
    if (audioChunks.length > 0) {
      const buffer = Buffer.concat(audioChunks);
      const base64Audio = buffer.toString('base64');
      
      session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
      
      audioChunks = [];
    }
  }, 100);

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('Cleaning up...');
    if (processingInterval) {
      clearInterval(processingInterval);
    }
    microphone.stop();
    if (currentSpeaker) {
      currentSpeaker.destroy();
    }
    process.exit();
  });

  return microphone;
}

main().catch(console.error);