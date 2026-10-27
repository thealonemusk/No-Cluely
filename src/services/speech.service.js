// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: {
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => {}
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: {
      createElement: (tagName) => {
        const element = {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => {},
          removeChild: () => {},
          insertBefore: () => {},
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => {},
          click: () => {},
          focus: () => {},
          blur: () => {}
        };

        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => {},
            load: () => {},
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }

        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      }
    },
    location: {
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    console: global.console || {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    AudioContext: class AudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    URL: class URL {
      constructor(url) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() {
        return this.href;
      }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() {
        return new Blob();
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() {
        return new File([], this.name);
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;

  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      clearMarks: () => {},
      clearMeasures: () => {},
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }

  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');
const WhisperWorkerService = require('./whisper-worker.service');

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
}

let recorder = null;
try {
  recorder = require('node-record-lpcm16');
} catch (error) {
  logger.warn('Local audio recorder dependency unavailable', { error: error.message });
}

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false;
    this.provider = 'disabled';
    this.runtimeSettings = {};
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.segmentTimer = null;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.pendingFinal = false;
    this._pendingSegments = [];
    this._audioEpoch = 0;
    this._acceptAudioUntil = 0;
    this._stopEpoch = 0;
    this.audioProgram = null;
    this.whisperCommand = null;
    this.whisperWorker = new WhisperWorkerService();
    this.isProcessingAudio = false;
    this.manualStopRequested = false;
    this._resetVadState();

    this.initializeClient();
  }

  initializeClient() {
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;

    const provider = this._getConfiguredProvider();
    this.provider = provider;

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Azure or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
      }

      if (!recorder || typeof recorder.record !== 'function') {
        throw new Error('Local microphone recorder dependency is not installed');
      }

      const subscriptionKey = this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY;
      const region = this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION;

      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing Azure credentials)');
        this.emit('status', reason);
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }

      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }

      this.available = true;
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Azure speech unavailable');
    }
  }

  _initializeWhisperClient() {
    try {
      this.whisperCommand = this._resolveWhisperCommand();
      if (!this.whisperCommand) {
        const reason = 'Local Whisper unavailable. Install faster-whisper or set WHISPER_COMMAND to the venv Python.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }

      this.available = true;
      this._configureWhisperWorker();
      logger.info('Local Whisper service initialized successfully', {
        command: [this.whisperCommand.command, ...this.whisperCommand.baseArgs].join(' '),
        model: this._getWhisperModel(),
        language: this._getWhisperLanguage()
      });
      this.emit('status', 'Local Whisper ready');
    } catch (error) {
      logger.error('Failed to initialize local Whisper client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Local Whisper unavailable');
    }
  }

  startRecording() {
    try {
      if (!this.available) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      if (this.isProcessingAudio) {
        this.emit('status', 'Please wait for the current transcription to finish');
        return;
      }

      this._stopEpoch = (this._stopEpoch || 0) + 1;
      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      throw new Error(`Unsupported speech provider: ${this.provider}`);
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _startAzureRecording() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    this._cleanup();
    this.isRecording = true;

    try {
      this.pushStream = sdk.AudioInputStream.createPushStream();
      this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
    } catch (error) {
      logger.error('Failed to start Azure recording session', { error: error.message });
      this.emit('error', `Audio configuration failed: ${error.message}`);
      this.isRecording = false;
      return;
    }

    this.recognizer.recognizing = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          this.emit('interim-transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognizing handler', { error: error.message });
      }
    };

    this.recognizer.recognized = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text && e.result.text.trim()) {
          this.emit('transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognized handler', { error: error.message });
      }
    };

    this.recognizer.canceled = (s, e) => {
      logger.warn('Recognition session canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        const details = e.errorDetails || '';
        if (details.includes('1006')) {
          this.emit('error', 'Network connection failed. Please check your internet connection.');
        } else if (details.includes('InvalidServiceCredentials')) {
          this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
        } else if (details.includes('Forbidden')) {
          this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
        } else if (details.includes('AudioInputMicrophone_InitializationFailure')) {
          this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
        } else {
          this.emit('error', `Recognition error: ${details}`);
        }
      }

      this.stopRecording();
    };

    this.recognizer.sessionStarted = (s, e) => {
      logger.info('Recognition session started', { sessionId: e.sessionId });
    };

    this.recognizer.sessionStopped = () => {
      this.stopRecording();
    };

    const startTimeout = setTimeout(() => {
      logger.error('Recognition start timeout');
      this.emit('error', 'Speech recognition start timeout. Please try again.');
      this.stopRecording();
    }, 10000);

    // Windows and macOS have no usable sox/arecord capture. Feed Azure the
    // same renderer microphone the Whisper path uses.
    if (process.platform === 'win32' || process.platform === 'darwin') {
      this.useRendererCapture = true;
    } else {
      this._startMicrophoneCapture();
    }
    this.emit('recording-started');
    this.emit('status', 'Azure recording started');

    this.recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        logger.info('Continuous Azure speech recognition started successfully');
      },
      (error) => {
        clearTimeout(startTimeout);
        logger.error('Failed to start continuous recognition', { error: error.toString() });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
        this._cleanup();
      }
    );
  }

  _startWhisperRecording() {
    this._cleanup();
    this.isRecording = true;
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.pendingFinal = false;
    this.manualStopRequested = false;
    this._pendingSegments = [];
    this._resetVadState();
    this.emit('recording-started');
    this.emit('status', 'Local Whisper recording started');

    if (this.whisperWorker.isConfigured()) {
      this.whisperWorker.warmup({
        model: this._getWhisperModel(),
        modelDir: this._getWhisperModelDir(),
        device: this._getWhisperDevice(),
        computeType: this._getWhisperComputeType(),
        cpuThreads: this._getWhisperCpuThreads()
      }).then((result) => {
        logger.info('Whisper GPU warmup completed while recording', {
          model: result.model,
          device: result.device,
          gpu: result.gpu
        });
      }).catch((error) => {
        logger.warn('Whisper warmup failed; first transcription will load the model', {
          error: error.message
        });
      });
    }

    // Capture microphone audio in the renderer via the Web Audio API on Windows
    // and macOS. Windows lacks the Unix sox/rec/arecord tools node-record-lpcm16
    // needs; macOS would otherwise require a Homebrew `sox` install (not bundled)
    // and a child-process mic that the system TCC prompt can't attribute. The
    // renderer path uses getUserMedia, which macOS prompts for cleanly via the
    // app's NSMicrophoneUsageDescription. Linux keeps the native recorder path.
    this.useRendererCapture = process.platform === 'win32' || process.platform === 'darwin';
    if (this.useRendererCapture) {
      this.emit('status', 'Waiting for microphone audio…');
      // The renderer starts sending chunks once it receives the recording-started event.
      if (!this._isManualCaptureMode()) {
        this._startSegmentWatchdog();
      }
      return;
    }

    this._startMicrophoneCapture();
    if (!this._isManualCaptureMode()) {
      this._startSegmentWatchdog();
    }

  }

  /**
   * Reset the voice-activity-detection state machine. VAD replaces the old
   * fixed-interval segmentation: instead of cutting audio every N seconds
   * (which split sentences mid-word and transcribed silent windows), we
   * accumulate audio while the user is speaking and flush a segment once a
   * natural pause is detected. State is intentionally simple so it works for
   * both the renderer (Web Audio) and native (sox/arecord) capture paths.
   */
  _resetVadState() {
    this.vadSpeaking = false;        // currently inside an utterance
    this.vadSpeechMs = 0;            // accumulated voiced audio in this segment
    this.vadSilenceMs = 0;           // trailing silence since last voiced chunk
    this.vadNoiseFloor = 0;          // adaptive EMA of background energy
    this.vadNoiseInit = false;       // has the noise floor been seeded
    this.vadPreRoll = [];            // ring of recent pre-speech chunks
    this.vadPreRollMs = 0;           // duration held in the pre-roll ring
    this.vadLastChunkAt = 0;         // timestamp of the last ingested chunk
    this.vadCalibrated = false;
    this.vadCalibMs = 0;
    this.vadCalibEnergies = [];
    this.vadEnterMs = 0;
  }

  _pushVadPreRoll(buffer, chunkMs) {
    this.vadPreRoll.push(buffer);
    this.vadPreRollMs += chunkMs;
    const limit = Math.max(this._getPreRollMs(), 700);
    while (this.vadPreRollMs > limit && this.vadPreRoll.length > 1) {
      const dropped = this.vadPreRoll.shift();
      this.vadPreRollMs -= this._chunkDurationMs(dropped);
    }
  }

  _finishVadCalibration() {
    const samples = this.vadCalibEnergies.length ? this.vadCalibEnergies : [this._getVadEnergyFloor()];
    const sorted = samples.slice().sort((a, b) => a - b);
    const quiet = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2))];
    const loud = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))];
    const absolute = this._getVadEnergyFloor();
    if (loud > quiet * 2.2 && quiet > 0) {
      this.vadNoiseFloor = Math.max(absolute * 0.25, quiet);
    } else {
      // Steady level: sit the floor under it so this level can still be
      // speech, and a later drop counts as silence.
      this.vadNoiseFloor = Math.max(absolute * 0.25, quiet * 0.35);
    }
    this.vadNoiseInit = true;
    this.vadCalibrated = true;
    this.vadCalibEnergies = [];
  }

  _trackNoiseFloor(energy) {
    if (!this.vadNoiseInit) {
      this.vadNoiseFloor = energy;
      this.vadNoiseInit = true;
      return;
    }
    if (energy < this.vadNoiseFloor) {
      this.vadNoiseFloor = this.vadNoiseFloor * 0.55 + energy * 0.45;
    } else {
      const capped = Math.min(energy, this.vadNoiseFloor * 1.5);
      this.vadNoiseFloor = this.vadNoiseFloor * 0.985 + capped * 0.015;
    }
  }

  _beginUtteranceFromPreRoll() {
    this.vadSpeaking = true;
    this.vadSilenceMs = 0;
    this.vadSpeechMs = this.vadEnterMs;
    this.vadEnterMs = 0;
    for (const pre of this.vadPreRoll) {
      this.segmentBuffers.push(pre);
      this.segmentBytes += pre.length;
    }
    this.vadPreRoll = [];
    this.vadPreRollMs = 0;
  }

  /**
   * Lightweight watchdog. Silence is normally detected from incoming chunks
   * (which keep flowing at low energy), but if the capture pipeline stalls
   * mid-utterance we still want to flush what we have. The watchdog also
   * enforces the max-utterance cap as a backstop.
   */
  _startSegmentWatchdog() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
    }
    this.segmentTimer = setInterval(() => {
      if (!this.isRecording || this.provider !== 'whisper') {
        return;
      }

      // VAD disabled (fallback): preserve the legacy fixed-window behaviour by
      // flushing once the accumulated audio reaches the configured segment size.
      if (!this._isVadEnabled()) {
        if (this.segmentBytes && this.vadSpeechMs >= this._getWhisperSegmentMs()) {
          this._endUtteranceFlush();
        }
        return;
      }

      // If we're mid-utterance and no audio has arrived recently, the mic may
      // have stalled — flush what we captured rather than holding it forever.
      const sinceLastChunk = this.vadLastChunkAt ? Date.now() - this.vadLastChunkAt : 0;
      const stalled = this.vadSpeaking && sinceLastChunk > 1500;
      const tooLong = this.vadSpeaking && this.vadSpeechMs >= this._getMaxUtteranceMs();
      if (stalled || tooLong) {
        this._endUtteranceFlush();
      }
    }, 500);
  }

  /**
   * Receive raw 16kHz mono 16-bit PCM audio from the renderer and add it to
   * the current Whisper segment buffer.
   */
  _isAcceptingAudio() {
    if (this.isRecording) return true;
    return this._acceptAudioUntil && Date.now() < this._acceptAudioUntil;
  }

  handleAudioChunkFromRenderer(chunk) {
    if (!this._isAcceptingAudio() || !this.useRendererCapture) {
      return;
    }
    if (!chunk || !chunk.length) {
      return;
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (this.provider === 'azure') {
      this._handleAudioChunk(buffer);
      return;
    }
    if (this.provider === 'whisper') {
      this._ingestWhisperAudio(buffer);
    }
  }

  /**
   * Compute the RMS energy (normalized to 0..1) of a 16-bit little-endian PCM
   * buffer. Used as the voice-activity signal.
   */
  _chunkRmsEnergy(buffer) {
    const sampleCount = Math.floor(buffer.length / 2);
    if (sampleCount === 0) {
      return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = buffer.readInt16LE(i * 2) / 32768;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / sampleCount);
  }

  /**
   * Single ingest path for both capture backends. Runs the VAD state machine:
   * accumulate audio while the user speaks, and flush the segment to Whisper
   * once a natural pause (trailing silence) is detected. Falls back to plain
   * buffering when VAD is disabled.
   */
  _ingestWhisperAudio(buffer) {
    if (!buffer || !buffer.length) {
      return;
    }

    if (this._isManualCaptureMode()) {
      this.segmentBuffers.push(buffer);
      this.segmentBytes += buffer.length;
      this.vadLastChunkAt = Date.now();

      const capturedMs = this.segmentBytes / 32;
      if (!this.manualStopRequested && capturedMs >= this._getManualCaptureMaxMs()) {
        this.manualStopRequested = true;
        this.emit('status', 'Maximum recording duration reached; processing audio');
        setImmediate(() => this.stopRecording());
      }
      return;
    }

    if (!this._isVadEnabled()) {
      // Legacy behaviour: the watchdog/max-utterance cap drives flushing.
      this.segmentBuffers.push(buffer);
      this.segmentBytes += buffer.length;
      this.vadSpeaking = true;
      this.vadSpeechMs += this._chunkDurationMs(buffer);
      this.vadLastChunkAt = Date.now();
      return;
    }

    this.vadLastChunkAt = Date.now();
    const chunkMs = this._chunkDurationMs(buffer);
    const energy = this._chunkRmsEnergy(buffer);

    // Learn the room for a short moment before the first utterance. The old
    // seed clamped the floor under a constant, so ordinary mic noise looked
    // like speech for the rest of the session and pauses were never detected.
    if (!this.vadCalibrated) {
      this._pushVadPreRoll(buffer, chunkMs);
      this.vadCalibEnergies.push(energy);
      this.vadCalibMs += chunkMs;
      if (this.vadCalibMs < 400) {
        return;
      }
      this._finishVadCalibration();
      return;
    }

    const floor = this._getVadEnergyFloor();
    const enterThreshold = Math.max(floor, this.vadNoiseFloor * 2.5);
    const exitThreshold = Math.max(floor * 0.6, this.vadNoiseFloor * 1.75);
    const isVoiced = energy >= (this.vadSpeaking ? exitThreshold : enterThreshold);

    if (!this.vadSpeaking) {
      this._pushVadPreRoll(buffer, chunkMs);
      if (isVoiced) {
        this.vadEnterMs += chunkMs;
        if (this.vadEnterMs >= 90) {
          this._beginUtteranceFromPreRoll();
        }
      } else {
        this.vadEnterMs = 0;
        this._trackNoiseFloor(energy);
      }
      return;
    }

    // Already speaking: keep capturing (including trailing silence so word
    // endings aren't clipped) and watch for a pause that ends the utterance.
    this.segmentBuffers.push(buffer);
    this.segmentBytes += buffer.length;
    if (isVoiced) {
      this.vadSpeechMs += chunkMs;
      this.vadSilenceMs = 0;
    } else {
      this.vadSilenceMs += chunkMs;
      this._trackNoiseFloor(energy);
    }

    const pausedLongEnough = this.vadSilenceMs >= this._getSilenceHangoverMs();
    const haveRealSpeech = this.vadSpeechMs >= this._getMinUtteranceMs();
    const tooLong = this.vadSpeechMs >= this._getMaxUtteranceMs();

    if ((pausedLongEnough && haveRealSpeech) || tooLong) {
      this._endUtteranceFlush();
    } else if (pausedLongEnough && !haveRealSpeech) {
      // Just noise (cough/click) with no real speech — discard, don't waste a
      // Whisper spawn or risk a hallucinated transcript.
      this.segmentBuffers = [];
      this.segmentBytes = 0;
      this.vadSpeaking = false;
      this.vadSpeechMs = 0;
      this.vadSilenceMs = 0;
      this.vadEnterMs = 0;
    }
  }

  /** Flush the accumulated utterance and reset VAD for the next one. */
  _endUtteranceFlush() {
    this.vadSpeaking = false;
    this.vadSpeechMs = 0;
    this.vadSilenceMs = 0;
    this.vadEnterMs = 0;
    this.vadPreRoll = [];
    this.vadPreRollMs = 0;
    this._flushWhisperSegment({ final: false }).catch((error) => {
      logger.error('Whisper segment transcription failed', { error: error.message });
    });
  }

  _chunkDurationMs(buffer) {
    // 16kHz mono 16-bit => 2 bytes/sample => 32 bytes/ms.
    return buffer.length / 32;
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    logger.info('Stopping speech recognition session', {
      provider: this.provider,
      sessionDuration: `${sessionDuration}ms`
    });

    if (this.provider === 'azure' && this.recognizer) {
      this._acceptAudioUntil = Date.now() + 400;
      this.emit('recording-stopped');
      const epoch = this._stopEpoch;
      setTimeout(() => {
        if (epoch !== this._stopEpoch) return;
        this._acceptAudioUntil = 0;
        if (!this.recognizer) {
          this._finalizeStop('Recording stopped', { alreadyNotified: true });
          return;
        }
        try {
          this.recognizer.stopContinuousRecognitionAsync(
            () => {
              this._finalizeStop('Recording stopped', { alreadyNotified: true });
            },
            (error) => {
              logger.error('Error during recognition stop', { error: error.toString() });
              this._finalizeStop('Recording stopped', { alreadyNotified: true });
            }
          );
        } catch (error) {
          logger.error('Error stopping recognizer', { error: error.message });
          this._finalizeStop('Recording stopped', { alreadyNotified: true });
        }
      }, 300);
      return;
    }

    if (this.provider === 'whisper') {
      this.isProcessingAudio = true;
      this._acceptAudioUntil = Date.now() + 400;
      this.emit('recording-stopped');
      this.emit('status', 'Processing local speech…');
      const epoch = this._stopEpoch;
      setTimeout(() => {
        if (epoch !== this._stopEpoch || this.isRecording) return;
        this._acceptAudioUntil = 0;
        this._finalizeWhisperStop({ captureAlreadyStopped: true });
      }, 350);
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop({ captureAlreadyStopped = false } = {}) {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    try {
      await this._flushWhisperSegment({ final: true });
    } catch (error) {
      logger.error('Final Whisper transcription failed', { error: error.message });
      this.emit('error', `Whisper transcription failed: ${error.message}`);
    } finally {
      this._cleanup();
      this.isProcessingAudio = false;
      this.whisperWorker.releaseWhenIdle();
      if (!captureAlreadyStopped) {
        this.emit('recording-stopped');
      }
      this.emit('status', 'Recording stopped');
    }
  }

  _finalizeStop(statusMessage, { alreadyNotified = false } = {}) {
    this._cleanup();
    if (!alreadyNotified) {
      this.emit('recording-stopped');
    }
    this.emit('status', statusMessage);
  }

  _cleanup() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

    if (this.audioConfig) {
      try {
        if (typeof this.audioConfig.close === 'function') {
          this.audioConfig.close();
        }
      } catch (error) {
        logger.error('Error closing audio config', { error: error.message });
      }
      this.audioConfig = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    if (this.pushStream) {
      try {
        if (typeof this.pushStream.close === 'function') {
          this.pushStream.close();
        }
      } catch (error) {
        logger.error('Error closing push stream', { error: error.message });
      }
      this.pushStream = null;
    }

    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this._pendingSegments = [];
    this._audioEpoch = (this._audioEpoch || 0) + 1;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.pendingFinal = false;
    this._flushFinal = false;
    this._resetVadState();
    this._audioDataLogged = false;
    this.useRendererCapture = false;
  }

  async recognizeFromFile(audioFilePath) {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            resolve(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : '');
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });
    }

    if (this.provider === 'whisper') {
      return this._transcribeWhisperFile(audioFilePath);
    }

    throw new Error('Speech service not initialized');
  }

  async testConnection() {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        recognizer.close();
        audioConfig.close();
        return { success: true, message: 'Azure connection test successful' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    if (this.provider === 'whisper') {
      const pythonPath = this._getWhisperPythonPath();
      if (!pythonPath) {
        return { success: false, message: 'faster-whisper Python not found' };
      }
      const probe = spawnSync(
        pythonPath,
        ['-c', 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("faster_whisper") else 1)'],
        { encoding: 'utf8', timeout: 10000, windowsHide: true }
      );
      if (probe.error || probe.status !== 0) {
        const err = probe.error ? probe.error.message : `exit code ${probe.status}`;
        return {
          success: false,
          message: `faster-whisper probe failed: ${err}`
        };
      }
      return {
        success: true,
        message: `faster-whisper ready: ${pythonPath}`
      };
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  getStatus() {
    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isProcessingAudio: this.isProcessingAudio,
      isInitialized: this.provider === 'azure' ? !!this.speechConfig : !!this.whisperCommand,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.provider,
        azureKey: this._getSetting('azureKey') || '',
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        whisperCaptureMode: this._getWhisperCaptureMode(),
        whisperDevice: this._getWhisperDevice(),
        whisperSegmentMs: String(this._getWhisperSegmentMs())
      },
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        selectedProvider: this.provider
      }
    };
  }

  isAvailable() {
    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      return !!this.whisperCommand && !!this.available;
    }

    return false;
  }

  isManualCaptureMode() {
    return this.provider === 'whisper' && this._isManualCaptureMode();
  }

  shutdown() {
    this.isRecording = false;
    this.isProcessingAudio = false;
    this._cleanup();
    this.whisperWorker.close();
  }

  updateSettings(settings = {}) {
    const speechKeys = ['speechProvider', 'azureKey', 'azureRegion', 'whisperCommand', 'whisperModelDir', 'whisperModel', 'whisperLanguage', 'whisperCaptureMode', 'whisperDevice', 'whisperSegmentMs'];
    let changed = false;

    for (const key of speechKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        this.runtimeSettings[key] = settings[key];
        changed = true;
      }
    }

    if (changed) {
      this.initializeClient();
    }

    return this.getStatus();
  }

  _getConfiguredProvider() {
    const provider = String(this._getSetting('speechProvider') || process.env.SPEECH_PROVIDER || '').trim().toLowerCase();

    if (provider === 'azure' || provider === 'whisper') {
      return provider;
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      return 'azure';
    }

    return 'whisper';
  }

  _getWhisperModel() {
    return this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'small';
  }

  _getWhisperModelDir() {
    const configured = this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || '';
    // Honor an absolute configured dir. Empty or relative values (the old
    // `.whisper-models` default resolved against an unstable cwd) are replaced
    // with the stable userData location the installer downloads weights into,
    // so --model_dir and download_root always agree.
    if (configured && path.isAbsolute(configured)) {
      return configured;
    }
    return this._getUserDataModelDir() || configured;
  }

  /**
   * Absolute model-weights dir under Electron userData — matches
   * WhisperInstaller.modelDir so transcription finds downloaded models.
   */
  _getUserDataModelDir() {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), '.whisper-models');
    } catch (_) {
      return '';
    }
  }

  _getWhisperLanguage() {
    return this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'auto';
  }

  _getWhisperSegmentMs() {
    const rawValue = this._getSetting('whisperSegmentMs') || process.env.WHISPER_SEGMENT_MS || config.get('speech.whisper.segmentMs') || 4000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.max(2000, parsed) : 4000;
  }

  _vadNumber(settingKey, envKey, configPath, fallback, min) {
    const raw = this._getSetting(settingKey) || process.env[envKey] || config.get(configPath) || fallback;
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return typeof min === 'number' ? Math.max(min, value) : value;
  }

  _isVadEnabled() {
    const override = this._getSetting('whisperVadEnabled');
    if (override === false || override === 'false') return false;
    if (override === true || override === 'true') return true;
    if (process.env.WHISPER_VAD_ENABLED === 'false') return false;
    const configured = config.get('speech.whisper.vadEnabled');
    return configured !== false;
  }

  _getSilenceHangoverMs() {
    return this._vadNumber('whisperSilenceHangoverMs', 'WHISPER_SILENCE_HANGOVER_MS', 'speech.whisper.silenceHangoverMs', 700, 200);
  }

  _getMinUtteranceMs() {
    return this._vadNumber('whisperMinUtteranceMs', 'WHISPER_MIN_UTTERANCE_MS', 'speech.whisper.minUtteranceMs', 350, 100);
  }

  _getMaxUtteranceMs() {
    return this._vadNumber('whisperMaxUtteranceMs', 'WHISPER_MAX_UTTERANCE_MS', 'speech.whisper.maxUtteranceMs', 30000, 2000);
  }

  _getPreRollMs() {
    return this._vadNumber('whisperPreRollMs', 'WHISPER_PRE_ROLL_MS', 'speech.whisper.preRollMs', 450, 0);
  }

  _getVadEnergyFloor() {
    return this._vadNumber('whisperVadEnergyFloor', 'WHISPER_VAD_ENERGY_FLOOR', 'speech.whisper.vadEnergyFloor', 0.005, 0.0005);
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
  }

  _isManualCaptureMode() {
    return this._getWhisperCaptureMode() === 'manual';
  }

  _getWhisperCaptureMode() {
    const configured = String(
      this._getSetting('whisperCaptureMode') || process.env.WHISPER_CAPTURE_MODE || ''
    ).trim().toLowerCase();
    if (configured === 'manual' || configured === 'vad') {
      return configured;
    }

    // Backward compatibility for existing local configurations.
    if (process.env.WHISPER_MANUAL_CAPTURE !== undefined) {
      return process.env.WHISPER_MANUAL_CAPTURE === 'false' ? 'vad' : 'manual';
    }
    return 'vad';
  }

  _getManualCaptureMaxMs() {
    const parsed = Number(process.env.WHISPER_MANUAL_MAX_MS || 90000);
    return Number.isFinite(parsed) ? Math.max(5000, parsed) : 90000;
  }

  _getWhisperDevice() {
    return String(process.env.WHISPER_DEVICE || 'auto').trim().toLowerCase();
  }

  _getWhisperComputeType() {
    return String(process.env.WHISPER_COMPUTE_TYPE || 'auto').trim().toLowerCase();
  }

  _getWhisperCpuThreads() {
    const parsed = Number(process.env.WHISPER_CPU_THREADS || 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  _getWhisperBeamSize() {
    const parsed = Number(process.env.WHISPER_BEAM_SIZE || 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  _getWhisperPythonPath() {
    const configuredPython = String(process.env.WHISPER_PYTHON || '').trim();
    if (configuredPython) {
      const resolvedPython = path.isAbsolute(configuredPython)
        ? path.normalize(configuredPython)
        : path.resolve(configuredPython);
      if (fs.existsSync(resolvedPython)) {
        return resolvedPython;
      }
    }

    if (this.whisperCommand) {
      const fromCommand = this._pythonInterpreterForCandidate(this.whisperCommand);
      if (fromCommand) {
        return fromCommand;
      }
    }

    const projectCandidate = this._getProjectWhisperCandidate();
    if (projectCandidate) {
      return projectCandidate.command;
    }

    const userDataCandidate = this._getUserDataWhisperCandidate();
    if (userDataCandidate && fs.existsSync(userDataCandidate.command)) {
      return userDataCandidate.command;
    }

    return null;
  }

  _getWhisperWorkerScriptPath() {
    const sourcePath = path.resolve(__dirname, '..', '..', 'scripts', 'whisper_worker.py');
    return sourcePath.includes('app.asar')
      ? sourcePath.replace('app.asar', 'app.asar.unpacked')
      : sourcePath;
  }

  _configureWhisperWorker() {
    const pythonPath = this._getWhisperPythonPath();
    const scriptPath = this._getWhisperWorkerScriptPath();
    const idleUnloadMs = Math.max(10000, Number(process.env.WHISPER_GPU_IDLE_MS || 180000));
    this.whisperWorker.configure({ pythonPath, scriptPath, idleUnloadMs });

    logger.info('Whisper worker configuration', {
      configured: this.whisperWorker.isConfigured(),
      pythonPath,
      scriptPath,
      device: this._getWhisperDevice(),
      idleUnloadMs
    });
  }

  /**
   * Build a whisper candidate pointing at the app-local venv inside
   * Electron's userData directory. This is where the onboarding installer
   * creates the venv in packaged builds.
   */
  _getUserDataWhisperCandidate() {
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-whisper', binDir, `python${ext}`);
      if (fs.existsSync(python)) {
        return { command: python, baseArgs: [] };
      }
    } catch (_) {
      // electron may not be available in unit tests
    }
    return null;
  }

  _getProjectWhisperCandidate() {
    const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
    const ext = process.platform === 'win32' ? '.exe' : '';
    const python = path.join(process.cwd(), '.venv-whisper', binDir, `python${ext}`);
    if (fs.existsSync(python)) {
      return { command: python, baseArgs: [] };
    }
    return null;
  }

  _resolveWhisperCommand() {
    const configured = this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND;
    const candidates = [];

    if (configured) {
      candidates.push(...this._expandConfiguredWhisperCandidates(configured));
    }

    // Persistent app venv (highest priority after explicit config)
    const userDataVenv = this._getUserDataWhisperCandidate();
    if (userDataVenv) {
      candidates.push({ ...userDataVenv, source: 'app userData venv' });
    }

    const projectVenv = this._getProjectWhisperCandidate();
    if (projectVenv) {
      candidates.push({ ...projectVenv, source: 'project .venv-whisper' });
    }

    if (process.platform === 'win32') {
      candidates.push({ command: 'py', baseArgs: [], source: 'py launcher' });
    }
    candidates.push({ command: 'python3', baseArgs: [], source: 'python3' });
    candidates.push({ command: 'python', baseArgs: [], source: 'python' });

    for (const candidate of candidates) {
      if (!candidate || !candidate.command) {
        continue;
      }

      const resolved = this._probeWhisperCandidate(candidate);
      if (resolved) {
        logger.info('Whisper command resolved', {
          command: resolved.command,
          baseArgs: resolved.baseArgs,
          source: resolved.source || candidate.source || 'unknown'
        });
        return resolved;
      }
    }

    logger.warn('No faster-whisper Python candidate succeeded after probing all fallbacks');
    return null;
  }

  _pythonInterpreterForCandidate(candidate) {
    if (!candidate || !candidate.command) {
      return null;
    }

    const cmd = path.normalize(candidate.command);
    const moduleIndex = (candidate.baseArgs || []).indexOf('-m');
    if (moduleIndex !== -1 && fs.existsSync(cmd)) {
      return cmd;
    }

    const base = path.basename(cmd).toLowerCase();
    if (/^python(\d+(\.\d+)?)?(\.exe)?$/.test(base) || /^py(\.exe)?$/.test(base)) {
      return cmd;
    }

    const pythonName = process.platform === 'win32' ? 'python.exe' : 'python';
    const siblingPython = path.join(path.dirname(cmd), pythonName);
    return fs.existsSync(siblingPython) ? siblingPython : null;
  }

  /**
   * Confirm faster_whisper is installed without importing CTranslate2.
   * find_spec returns in well under a second so the mic can appear on first launch.
   */
  _probeWhisperModuleFast(candidate) {
    const python = this._pythonInterpreterForCandidate(candidate);
    if (!python) {
      return null;
    }
    const script = 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("faster_whisper") else 1)';
    try {
      const probe = spawnSync(python, ['-c', script], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
      if (!probe.error && probe.status === 0) {
        return { command: python, baseArgs: [], source: candidate.source };
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  /**
   * Probe a single candidate: exists check → faster_whisper find_spec.
   * Returns the working candidate object, or null on failure.
   */
  _probeWhisperCandidate(candidate) {
    const cmd = candidate.command;

    if (path.isAbsolute(cmd) || cmd.includes(path.sep) || cmd.includes('/')) {
      try {
        const normalized = path.normalize(cmd);
        if (!fs.existsSync(normalized)) {
          logger.debug('Whisper probe skipped: file does not exist', {
            command: cmd,
            normalized
          });
          return null;
        }
      } catch (e) {
        return null;
      }
    }

    const fast = this._probeWhisperModuleFast(candidate);
    if (fast) {
      logger.debug('faster-whisper confirmed via find_spec', { command: fast.command });
      return fast;
    }

    logger.debug('Whisper probe failed', { command: cmd });
    return null;
  }

  _expandConfiguredWhisperCandidates(rawCommand) {
    const parsed = this._parseCommand(rawCommand);
    if (!parsed) {
      return [];
    }

    const candidates = [];
    // Normalize forward slashes to platform separator before trying anything
    const normalizedCmd = path.normalize(parsed.command);

    candidates.push({
      command: normalizedCmd,
      baseArgs: parsed.baseArgs,
      source: 'configured (normalized)'
    });

    const resolvedPath = path.resolve(normalizedCmd);
    if (resolvedPath !== normalizedCmd) {
      candidates.push({
        command: resolvedPath,
        baseArgs: parsed.baseArgs,
        source: 'configured (resolved)'
      });
    }

    if (process.platform === 'win32') {
      const base = normalizedCmd;
      // Try .exe / .cmd / .bat variants when extension is missing
      if (!/\.(exe|cmd|bat)$/i.test(base)) {
        candidates.push({ command: `${base}.exe`, baseArgs: parsed.baseArgs, source: 'configured (.exe)' });
        candidates.push({ command: `${base}.cmd`, baseArgs: parsed.baseArgs, source: 'configured (.cmd)' });
        if (resolvedPath !== base) {
          candidates.push({ command: `${resolvedPath}.exe`, baseArgs: parsed.baseArgs, source: 'configured (resolved .exe)' });
        }
      }
      const venvPython = path.join(path.dirname(base), 'python.exe');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: [], source: 'configured (venv python)' });
      }
    } else {
      const venvPython3 = path.join(path.dirname(normalizedCmd), 'python3');
      if (fs.existsSync(venvPython3)) {
        candidates.push({ command: venvPython3, baseArgs: [], source: 'configured (venv python3)' });
      }
      const venvPython = path.join(path.dirname(normalizedCmd), 'python');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: [], source: 'configured (venv python)' });
      }
    }

    return candidates;
  }

  _parseCommand(rawCommand) {
    // Respect double-quoted segments so Windows userData paths like
    // "C:\Users\CANDAN SINGH\...\python.exe" survive intact.
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return null;
    }
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [trimmed];
    const normalized = parts.map((p) => p.replace(/^"|"$/g, '')).filter(Boolean);
    if (normalized.length === 0) {
      return null;
    }

    return {
      command: normalized[0],
      baseArgs: normalized.slice(1)
    };
  }

  _startMicrophoneCapture() {
    if (!recorder || typeof recorder.record !== 'function') {
      this.emit('error', 'Local microphone capture dependency is missing. Run npm install to restore speech recording support.');
      return;
    }

    // node-record-lpcm16 only ships two recorder modules: `sox` and `arecord`.
    // `recorder` is the option it actually reads (the old `recordProgram` name
    // was silently ignored, so every attempt fell back to sox). Each entry maps
    // the recorder module to the binary we must verify is on PATH.
    //   - macOS: sox (via Homebrew)
    //   - Linux: arecord (ALSA, usually preinstalled) then sox
    const candidates = process.platform === 'darwin'
      ? [{ recorder: 'sox', bin: 'sox' }]
      : [{ recorder: 'arecord', bin: 'arecord' }, { recorder: 'sox', bin: 'sox' }];
    this._startMicrophoneCaptureWithFallback(candidates);
  }

  /**
   * Whether an audio capture binary is on PATH. node-record-lpcm16 spawns
   * these directly and, when the binary is missing, emits an `error` on its
   * child process with no listener — which would otherwise crash the whole
   * app. We pre-filter to binaries that exist so the library never receives a
   * missing program.
   */
  _audioProgramExists(bin) {
    try {
      const r = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        [bin],
        { windowsHide: true, timeout: 4000 }
      );
      return r.status === 0;
    } catch (_) {
      return false;
    }
  }

  _startMicrophoneCaptureWithFallback(candidates) {
    const available = candidates.filter((c) => this._audioProgramExists(c.bin));

    if (available.length === 0) {
      const hint = process.platform === 'darwin'
        ? 'Install one with `brew install sox`.'
        : process.platform === 'linux'
          ? 'Install one with `sudo apt install alsa-utils` (arecord) or `sudo apt install sox`.'
          : 'No supported microphone capture tool was found.';
      logger.warn('No audio capture program available', {
        tried: candidates.map((c) => c.bin),
        platform: process.platform,
      });
      this.isRecording = false;
      this.emit('error', `Microphone capture needs sox or arecord, but none was found. ${hint}`);
      return;
    }

    const queue = [...available];

    const tryNextProgram = () => {
      const candidate = queue.shift();
      if (!candidate) {
        this.isRecording = false;
        this.emit('error', 'Could not start microphone capture with any available audio program');
        return;
      }

      const program = candidate.bin;
      try {
        this.recording = recorder.record({
          sampleRate: 16000,
          sampleRateHertz: 16000,
          channels: 1,
          threshold: 0,
          verbose: false,
          recorder: candidate.recorder,
          silence: '10.0s'
        });

        const stream = this.recording.stream();
        this.audioProgram = program;

        // Guard the spawned child process directly. A spawn failure (e.g. the
        // binary disappeared between our probe and the spawn, or a permission
        // error) emits `error` on the child, which node-record-lpcm16 leaves
        // unhandled — fatal without this listener.
        const child = this.recording.process;
        if (child && typeof child.on === 'function') {
          child.on('error', (error) => {
            logger.error('Audio recording process error', { error: error.message, program });
            if (this.recording) {
              try { this.recording.stop(); } catch (_) { /* ignore */ }
              this.recording = null;
            }
            if (this.isRecording) tryNextProgram();
          });
        }

        stream.on('error', (error) => {
          logger.error('Audio recording stream error', { error: error.message, program });
          if (this.recording) {
            try {
              this.recording.stop();
            } catch (stopError) {
              logger.error('Error stopping failed recording program', { error: stopError.message });
            }
            this.recording = null;
          }

          if (this.isRecording) {
            tryNextProgram();
          }
        });

        stream.on('data', (chunk) => {
          this._handleAudioChunk(chunk);
        });
      } catch (error) {
        logger.error('Failed to start microphone capture program', { program, error: error.message });
        tryNextProgram();
      }
    };

    tryNextProgram();
  }

  _handleAudioChunk(chunk) {
    if (!chunk || !chunk.length || !this._isAcceptingAudio()) {
      return;
    }

    if (this.provider === 'azure' && this.pushStream) {
      try {
        this.pushStream.write(chunk);
      } catch (error) {
        logger.error('Error writing audio data to Azure push stream', { error: error.message });
      }
      return;
    }

    if (this.provider === 'whisper') {
      this._ingestWhisperAudio(Buffer.from(chunk));
    }
  }

  _detachSegment() {
    if (!this.segmentBytes) return null;
    const audio = Buffer.concat(this.segmentBuffers, this.segmentBytes);
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    return audio;
  }

  async _flushWhisperSegment({ final }) {
    const epoch = this._audioEpoch || 0;
    const detached = this._detachSegment();
    if (detached) this._pendingSegments.push(detached);
    if (final) this._flushFinal = true;
    if (this.transcriptionInFlight) return;
    if (!this._pendingSegments.length && !(this._flushFinal && this.segmentBytes)) return;

    this.transcriptionInFlight = true;
    try {
      while (this._pendingSegments.length && epoch === this._audioEpoch) {
        const audio = this._pendingSegments.shift();
        try {
          await this._transcribeAndEmit(audio, epoch);
        } catch (error) {
          logger.error('Whisper segment transcription failed', { error: error.message });
          if (epoch === this._audioEpoch) {
            this.emit('error', `Whisper transcription failed: ${error.message}`);
          }
        }
      }
    } finally {
      if (epoch !== this._audioEpoch) return;
      this.transcriptionInFlight = false;
      if (this._flushFinal && this.segmentBytes) {
        const tail = this._detachSegment();
        if (tail) this._pendingSegments.push(tail);
      }
      if (this._pendingSegments.length) {
        await this._flushWhisperSegment({ final: false });
      } else {
        this._flushFinal = false;
      }
    }
  }

  async _transcribeAndEmit(audioBuffer, epoch) {
    const transcript = await this._transcribeWhisperBuffer(audioBuffer);
    if (epoch !== this._audioEpoch) return;
    const clean = this._cleanTranscript(transcript);
    if (clean) {
      this.emit('transcription', clean);
    } else if (transcript && transcript.trim()) {
      logger.debug('Dropped likely Whisper silence hallucination', { transcript });
    }
  }

  /**
   * Whisper reliably hallucinates a small set of stock phrases when fed near-
   * silence or non-speech audio (training-data artifacts from video captions).
   * VAD already prevents most silent flushes; this is the final guard so these
   * phantom phrases never reach the chat or the LLM.
   */
  _cleanTranscript(text) {
    let cleaned = String(text || '').trim();
    if (!cleaned) return '';
    const trailing = /(?:\s*[,.!]?\s*)(thanks for watching|thank you for watching|thank you so much for watching|please subscribe|like and subscribe|subtitles by the amara\.?\s*org community)[.!\s]*$/i;
    let previous;
    do {
      previous = cleaned;
      cleaned = cleaned.replace(trailing, '').trim();
    } while (cleaned && cleaned !== previous);
    if (!cleaned || this._isHallucinatedTranscript(cleaned)) return '';
    return cleaned;
  }

  _isHallucinatedTranscript(text) {
    const normalized = text.toLowerCase().replace(/[\s.,!?¡¿"'`]+/g, ' ').trim();
    if (!normalized) {
      return true;
    }
    const HALLUCINATIONS = new Set([
      'thank you for watching',
      'thanks for watching',
      'thank you so much for watching',
      'please subscribe',
      'like and subscribe',
      'subtitles by the amara org community'
    ]);
    return HALLUCINATIONS.has(normalized);
  }

  async _transcribeWhisperBuffer(audioBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'No-Cluely-whisper-'));
    const audioFilePath = path.join(tempDir, 'segment.wav');

    try {
      fs.writeFileSync(audioFilePath, this._createWavBuffer(audioBuffer));
      return await this._transcribeWhisperFile(audioFilePath);
    } finally {
      this._removeTempDir(tempDir);
    }
  }

  async _transcribeWhisperFile(audioFilePath) {
    if (!this.whisperWorker.isConfigured()) {
      throw new Error('faster-whisper worker is not configured');
    }

    const startedAt = Date.now();
    const result = await this.whisperWorker.transcribe(audioFilePath, {
      model: this._getWhisperModel(),
      language: this._getWhisperLanguage(),
      modelDir: this._getWhisperModelDir(),
      device: this._getWhisperDevice(),
      computeType: this._getWhisperComputeType(),
      cpuThreads: this._getWhisperCpuThreads(),
      beamSize: this._getWhisperBeamSize()
    });
    logger.info('Persistent Whisper transcription completed', {
      processingTime: Date.now() - startedAt,
      model: result.model,
      device: result.device,
      computeType: result.compute_type,
      gpu: result.gpu,
      detectedLanguage: result.language
    });
    return result.text || '';
  }

  _createWavBuffer(rawPcmBuffer) {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawPcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawPcmBuffer.length, 40);

    return Buffer.concat([header, rawPcmBuffer]);
  }

  _removeTempDir(tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.error('Failed to remove Whisper temp directory', {
        tempDir,
        error: error.message
      });
    }
  }
}

module.exports = new SpeechService();
