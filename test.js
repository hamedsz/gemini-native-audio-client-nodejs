// To run this code you need to install the following dependencies:
// npm install @google/genai mime node-mic wavefile speaker
import {
  GoogleGenAI,
  Modality,
  MediaResolution
} from '@google/genai';
import mic from 'node-mic';
import { Readable } from 'stream';
import Speaker from 'speaker';

let responseQueue = [];
let session = undefined;
let audioStream;
let systemSpeaker;

// helper to (re)create a fresh audio pipeline
function createAudioPipeline() {
  systemSpeaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 24000,
    signed: true
  });
  audioStream = new Readable({
    read() {}
  });
  audioStream.pipe(systemSpeaker);
}


async function handleTurn() {
  const turn = [];
  let done = false;
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    console.log(message.serverContent?.modelTurn?.parts?.[0])
    /* if (message.serverContent && message.serverContent.turnComplete) {
      done = true;
    }*/
  }
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
      await new Promise((resolve) => setTimeout(resolve, 100));
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
          
      audioStream.push(buffer);
    }

    if(part?.text) {
      console.log(part?.text);
    }
  }
}

async function main() {
  console.log('Setting up audio playback system...');
  createAudioPipeline();
  
  const ai = new GoogleGenAI({
    apiKey: 'AIzaSyB6LMTe4Ynn8ivchJpXBvLiCe3_5pE_eAE',
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
        console.debug('Opened');
      },
      onmessage: function (message) {
       responseQueue.push(message);
      },
      onerror: function (e) {
        console.debug('Error:', e.message);
      },
      onclose: function (e) {
        console.debug('Close:', e.reason);
      },
    },
    config
  });
  
  // Set up microphone recording with appropriate parameters
  setupMicrophone(session);

  await handleTurn();
  /*while(true) {
  }*/
}

/**
 * Sets up the microphone for recording and streaming to the API
 * @param {Object} session - The active Gemini session
 */
function setupMicrophone(session) {
  // Create a microphone instance
  const microphone = new mic({
    rate: '16000',
    channels: '1',
    debug: false,
    exitOnSilence: -1, // Don't exit on silence
    fileType: 'raw' // Get raw PCM data
  });

  // Get the microphone input stream
  const micStream = microphone.getAudioStream();
  let audioChunks = [];
  let processingInterval = null;

  // Process microphone data
  micStream.on('data', (data) => {
    // Add the new data to our chunks
    audioChunks.push(data);
  });

  // Handle errors
  micStream.on('error', (err) => {
    console.error('Microphone Error:', err);
  });

  // Start the microphone
  microphone.start();
  console.log('Microphone recording started...');

  // Set up a function to process and send audio chunks every 100ms
  processingInterval = setInterval(() => {
    if (audioChunks.length > 0) {
      // Combine all chunks
      const buffer = Buffer.concat(audioChunks);
      
      // Convert to base64
      const base64Audio = buffer.toString('base64');
      
      // Send to API
      session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
      
      // Clear chunks for next interval
      audioChunks = [];
    }
  }, 100); // Process every 100ms

  // Setup cleanup function
  process.on('SIGINT', () => {
    if (processingInterval) {
      clearInterval(processingInterval);
    }
    microphone.stop();
    console.log('Microphone recording stopped');
    process.exit();
  });

  return microphone;
}

main();
