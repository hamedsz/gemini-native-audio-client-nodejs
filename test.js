// To run this code you need to install the following dependencies:
// npm install @google/genai mime node-mic wavefile speaker
import {
  GoogleGenAI,
  Modality,
  MediaResolution
} from '@google/genai';
import mic from 'node-mic';
import Speaker from 'speaker';

let responseQueue = [];
let session = undefined;
let systemSpeaker;
let audioChunksForCurrentTurn = [];
let isProcessingTurn = false;

// Create a single, persistent audio pipeline
function createAudioPipeline() {
  systemSpeaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 24000,
    signed: true
  });
  
  console.log('Audio pipeline created');
}

async function handleTurn() {
  isProcessingTurn = true;
  audioChunksForCurrentTurn = [];
  
  const turn = [];
  let done = false;
  
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    
    // Check if this is the end of the turn
    if (message.serverContent && message.serverContent.turnComplete) {
      done = true;
      console.log('Turn complete - playing collected audio');
      await playCollectedAudio();
    }
  }
  
  isProcessingTurn = false;
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
      await new Promise((resolve) => setTimeout(resolve, 50));
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
      
      // Collect audio chunks for this turn
      audioChunksForCurrentTurn.push(buffer);
      console.log(`Collected audio chunk: ${buffer.length} bytes`);
    }

    if(part?.text) {
      console.log('Text:', part?.text);
    }
  }
}

async function playCollectedAudio() {
  if (audioChunksForCurrentTurn.length === 0) {
    console.log('No audio to play');
    return;
  }
  
  console.log(`Playing ${audioChunksForCurrentTurn.length} audio chunks`);
  
  // Combine all audio chunks into one buffer
  const totalAudio = Buffer.concat(audioChunksForCurrentTurn);
  console.log(`Total audio buffer size: ${totalAudio.length} bytes`);
  
  // Create a new speaker for this audio playback
  const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 24000,
    signed: true
  });
  
  return new Promise((resolve) => {
    let written = false;
    
    speaker.on('open', () => {
      console.log('Speaker opened, writing audio...');
      if (!written) {
        written = true;
        speaker.write(totalAudio);
        speaker.end();
      }
    });
    
    speaker.on('close', () => {
      console.log('Audio playback finished');
      resolve();
    });
    
    speaker.on('error', (err) => {
      console.error('Speaker error:', err);
      resolve();
    });
    
    // Fallback timeout
    setTimeout(() => {
      if (!written) {
        console.log('Timeout - forcing audio write');
        written = true;
        speaker.write(totalAudio);
        speaker.end();
      }
    }, 100);
    
    // Additional safety timeout
    setTimeout(resolve, 10000);
  });
}

async function main() {
  console.log('Setting up audio system...');
  
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
        console.log('Session opened');
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
  console.log('Starting conversation loop...');
  while(true) {
    try {
      await handleTurn();
      // Brief pause between turns
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch(error) {
      console.error('Error in turn handling:', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
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
  console.log('Microphone started');

  // Send audio data every 100ms
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
    process.exit();
  });

  return microphone;
}

main().catch(console.error);