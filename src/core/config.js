const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.No-Cluely');
    this.loadConfiguration();
  }

  loadConfiguration() {
    this.config = {
      app: {
        name: 'No-Cluely',
        version: '1.0.0',
        processTitle: 'No-Cluely',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      capture: {
        // Screenshots are only ever read by an LLM, so they are captured and
        // re-encoded small. Uploading a full-resolution PNG of a 4K screen adds
        // seconds before the model sees anything; a JPEG capped on the longest
        // edge is a fraction of the bytes and reads identically.
        maxEdge: 1600,
        format: 'jpeg',
        jpegQuality: 80
      },

      llm: {
        provider: 'cursor',
        claude: {
          model: 'claude-opus-5',
          timeout: 30000,
          maxOutputTokens: 8192
        },
        cursor: {
          model: 'grok-4.7-high',
          timeout: 120000
        },
        gemini: {
          model: 'gemini-3.1-flash-lite',
          fallbackModels: ['gemini-2.5-flash-lite', 'gemini-3.5-flash'],
          maxRetries: 3,
          timeout: 30000,
          // Ceiling for one logical request across every model and retry.
          // Without it, 3 models x 3 retries x a 30s timeout plus backoff can
          // leave the user staring at "thinking" for minutes before the error
          // finally surfaces.
          totalDeadlineMs: 75000,
          fallbackEnabled: true,
          enableFallbackMethod: true,
          generation: {
            temperature: 0.7,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 }
          }
        }
      },

      speech: {
        provider: 'azure',
        azure: {
          language: 'en-US',
          enableDictation: true,
          enableAudioLogging: false,
          outputFormat: 'detailed'
        },
        whisper: {
          model: 'small',
          language: 'auto',
          // segmentMs is the legacy fixed-window size and now acts as the
          // hard upper bound for a single utterance when VAD is enabled.
          segmentMs: 4000,
          // Voice-activity-detection driven segmentation. Instead of cutting
          // audio on a blind timer (which splits sentences mid-word), we flush
          // a segment when the speaker pauses. This makes transcription align
          // with natural utterance boundaries.
          vadEnabled: true,
          // Trailing silence (ms) that ends an utterance and triggers a flush.
          // Long enough that a breath does not split a sentence.
          silenceHangoverMs: 700,
          // Minimum accumulated speech (ms) before a pause counts as an
          // utterance — guards against coughs/clicks producing empty flushes.
          minUtteranceMs: 350,
          // Hard cap (ms): force-flush a long monologue even without a pause.
          // High enough that a normal answer is not cut off mid-sentence.
          maxUtteranceMs: 30000,
          // Pre-roll (ms) of audio kept before speech onset so the first
          // syllable isn't clipped when we start capturing.
          preRollMs: 450,
          // Absolute RMS energy floor (normalized 0..1). Energy below this is
          // always treated as silence regardless of the adaptive noise floor.
          vadEnergyFloor: 0.005
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey];
  }

  isUsableApiKey(value, placeholder) {
    const key = String(value || '').trim();
    if (!key) return false;
    if (placeholder && key === placeholder) return false;
    if (key === 'your-api-key-here' || key === 'your_api_key_here') return false;
    return true;
  }

  resolveLlmProvider(env = process.env) {
    const raw = String(env.LLM_PROVIDER || this.config.llm.provider || '').trim().toLowerCase();
    const hasCursor = this.isUsableApiKey(env.CURSOR_API_KEY, 'your_cursor_api_key_here');
    const hasGemini = this.isUsableApiKey(env.GEMINI_API_KEY, 'your_gemini_api_key_here');
    const hasClaude = this.isUsableApiKey(env.ANTHROPIC_API_KEY, 'your_anthropic_api_key_here');

    if (raw === 'cursor' && hasCursor) return 'cursor';
    if (raw === 'gemini' && hasGemini) return 'gemini';
    if (raw === 'claude' && hasClaude) return 'claude';
    if (hasCursor) return 'cursor';
    if (hasGemini) return 'gemini';
    if (hasClaude) return 'claude';
    if (['gemini', 'claude', 'cursor'].includes(raw)) return raw;
    return 'cursor';
  }
}

module.exports = new ConfigManager();
