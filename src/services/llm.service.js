const https = require('https');
const { GoogleGenAI } = require('@google/genai');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

const CONVERSATION_TURN_LIMIT = 16;

// A DSA answer is thousands of characters, so 16 unbounded turns can push tens
// of thousands of characters of prefill into every follow-up request. Keeping
// the newest turns under a character budget is the cheapest way to cut
// time-to-first-token without losing the part of the conversation that matters.
const CONVERSATION_CHAR_BUDGET = 24000;

// One agent for the whole process. A per-request `new https.Agent({keepAlive})`
// is pointless — the pool dies with the request — so every call paid for a
// fresh TCP + TLS handshake to Google before a single byte of prompt moved.
const geminiAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 8
});

class LLMService {
  constructor() {
    this.client = null;
    this.model = null;
    this.provider = 'cursor';
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    
    this.initializeClient();
  }

  getActiveProvider() {
    return config.resolveLlmProvider();
  }

  shouldUseAlternateProvider() {
    return this.provider === 'claude' || this.provider === 'cursor';
  }

  getAlternateApiKey() {
    if (this.provider === 'cursor') {
      return (process.env.CURSOR_API_KEY || '').trim();
    }
    return (process.env.ANTHROPIC_API_KEY || '').trim();
  }

  getSessionManager() {
    return require('../managers/session.manager');
  }

  isGeminiModelUnavailable(error, errorInfo = null) {
    const message = (error && error.message) || '';
    if (errorInfo && errorInfo.type === 'RATE_LIMIT_ERROR') {
      return true;
    }
    return message.includes('503') ||
      message.includes('UNAVAILABLE') ||
      message.includes('high demand');
  }

  isGeminiQuotaOrUnavailable(error) {
    const message = (error && error.message) || '';
    return this.isGeminiModelUnavailable(error) ||
      message.includes('quota') ||
      message.includes('rate limit');
  }

  async executeGeminiWithTransportFallback(request) {
    const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
    try {
      if (preferAlternative) {
        logger.debug('Attempting alternative HTTPS method first for reliability');
        return await this.executeAlternativeRequest(request);
      }
      return await this.executeRequest(request);
    } catch (error) {
      const secondaryLabel = preferAlternative ? 'primary SDK method' : 'alternative HTTPS method';
      logger.warn(`${preferAlternative ? 'Alternative' : 'Primary'} method failed, trying ${secondaryLabel}`, {
        error: error.message,
        requestId: this.requestCount
      });
      const secondaryFn = preferAlternative
        ? this.executeRequest.bind(this)
        : this.executeAlternativeRequest.bind(this);
      try {
        return await secondaryFn(request);
      } catch (secondaryError) {
        logger.error('Both Gemini request methods failed', {
          firstError: error.message,
          secondError: secondaryError.message,
          requestId: this.requestCount
        });
        throw secondaryError;
      }
    }
  }

  buildAlternateHistory(sessionMemory) {
    if (!Array.isArray(sessionMemory)) {
      return [];
    }
    const mapped = sessionMemory
      .filter((event) => (
        event.role !== 'system' &&
        event.content &&
        typeof event.content === 'string' &&
        event.content.trim().length > 0
      ))
      .slice(-16)
      .map((event) => ({
        role: event.role === 'model' || event.role === 'assistant' ? 'assistant' : 'user',
        content: event.content.trim()
      }));

    const collapsed = [];
    for (const message of this.limitTurnsToCharBudget(mapped)) {
      const last = collapsed[collapsed.length - 1];
      if (last && last.role === message.role) {
        last.content = `${last.content}\n${message.content}`;
      } else {
        collapsed.push({ ...message });
      }
    }
    return collapsed.slice(-8);
  }

  appendAlternateUserMessage(history, userText) {
    const messages = history.map((message) => ({ ...message }));
    const text = (userText || '').trim();
    if (!text) {
      return messages;
    }

    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      if (last.content === text || text.includes(last.content) || last.content.includes(text)) {
        last.content = last.content.length >= text.length ? last.content : text;
      } else {
        last.content = `${last.content}\n${text}`;
      }
      return messages;
    }

    messages.push({ role: 'user', content: text });
    return messages;
  }

  async runAlternateProvider({ kind, text, imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage, onDelta, systemOverride, userTextOverride, skipFinalize, omitHistory, omitImages, isolate }) {
    if (!this.isInitialized) {
      const name = this.provider === 'cursor' ? 'Cursor' : 'Claude';
      throw new Error(`LLM service not initialized. Check ${name} API key configuration.`);
    }

    if (kind === 'image' && (!imageBuffer || !Buffer.isBuffer(imageBuffer))) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      let systemPrompt = '';
      let userText = text || '';

      if (systemOverride) {
        systemPrompt = systemOverride;
        userText = userTextOverride || userText;
      } else if (kind === 'image') {
        systemPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
        userText = this.formatImageInstruction(activeSkill, programmingLanguage);
      } else if (kind === 'text') {
        systemPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      } else if (kind === 'transcription') {
        systemPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
      }

      const history = this.appendAlternateUserMessage(
        omitHistory ? [] : this.buildAlternateHistory(sessionMemory),
        userText
      );
      const providerMod = this.provider === 'cursor'
        ? require('./llm-providers/cursor.provider')
        : require('./llm-providers/claude.provider');

      const timeout = this.provider === 'cursor'
        ? config.get('llm.cursor.timeout')
        : config.get('llm.claude.timeout');

      const sessionManager = this.getSessionManager();
      const problemShots = sessionManager.getProblemScreenshots();
      const latestShot = kind === 'image' ? null : sessionManager.getLatestScreenshot();
      const images = omitImages
        ? []
        : problemShots.length
          ? problemShots
          : (kind === 'image' && imageBuffer)
            ? [{ buffer: imageBuffer, mimeType: mimeType || 'image/png' }]
            : (latestShot && latestShot.buffer)
              ? [latestShot]
              : [];
      const attachedImage = images.length ? images[images.length - 1].buffer : null;

      const fullText = await providerMod.complete({
        apiKey: this.getAlternateApiKey(),
        model: this.model,
        system: systemPrompt,
        messages: history,
        imageBuffer: attachedImage,
        images,
        mimeType: (images.length && images[images.length - 1].mimeType) || mimeType || 'image/png',
        onDelta: typeof onDelta === 'function' ? onDelta : null,
        timeout,
        isolate: !!isolate
      });

      const finalResponse = skipFinalize
        ? String(fullText || '').trim()
        : this.finalizeSkillResponse(fullText, activeSkill, programmingLanguage);

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: typeof onDelta === 'function',
          isImageAnalysis: kind === 'image',
          isTranscriptionResponse: kind === 'transcription',
          mimeType: kind === 'image' ? mimeType : undefined,
          provider: this.provider
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Alternate LLM provider failed', {
        provider: this.provider,
        kind,
        error: error.message,
        requestId: this.requestCount
      });
      throw error;
    }
  }

  initializeClient() {
    this.provider = this.getActiveProvider();
    this.isInitialized = false;
    this.client = null;
    this.model = null;

    // resolveLlmProvider() silently falls back to whichever provider actually
    // has a key. That is good for first run and very confusing afterwards:
    // you pick Cursor in Settings, get Gemini's answers, and nothing says so.
    const requested = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
    if (requested && requested !== this.provider) {
      logger.warn(`Requested LLM provider "${requested}" has no usable API key; using "${this.provider}" instead`, {
        requested,
        using: this.provider
      });
    }

    if (this.provider === 'claude') {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
        logger.warn('Claude API key not configured', { keyExists: !!apiKey });
        return;
      }
      this.model = (process.env.CLAUDE_MODEL || '').trim() || config.get('llm.claude.model');
      this.isInitialized = true;
      logger.info('Claude provider initialized', { model: this.model });
      return;
    }

    if (this.provider === 'cursor') {
      const apiKey = (process.env.CURSOR_API_KEY || '').trim();
      if (!apiKey || apiKey === 'your_cursor_api_key_here') {
        logger.warn('Cursor API key not configured', { keyExists: !!apiKey });
        return;
      }
      this.model = (process.env.CURSOR_MODEL || '').trim() || config.get('llm.cursor.model');
      this.isInitialized = true;
      logger.info('Cursor provider initialized', { model: this.model });
      return;
    }

    const apiKey = config.getApiKey('GEMINI');
    
    if (!apiKey || apiKey === 'your-api-key-here') {
      logger.warn('Gemini API key not configured', { 
        keyExists: !!apiKey,
        isPlaceholder: apiKey === 'your-api-key-here'
      });
      return;
    }

    try {
      this.client = new GoogleGenAI({ apiKey });
      
      // Use the configured model name (default: gemini-3.5-flash)
      this.model = config.get('llm.gemini.model');
      this.isInitialized = true;
      
      logger.info('Gemini AI client initialized successfully', {
        model: this.model
      });
    } catch (error) {
      logger.error('Failed to initialize Gemini client', { 
        error: error.message 
      });
    }
  }

  /**
   * Wall-clock budget for one logical request. The model/retry sweep checks
   * this between attempts so a bad network cannot stretch a single question
   * across several minutes of silent retrying.
   */
  requestDeadline() {
    const budget = Number(config.get('llm.gemini.totalDeadlineMs'));
    const ms = Number.isFinite(budget) && budget > 0 ? budget : 75000;
    return Date.now() + ms;
  }

  deadlineExceeded(deadline) {
    return typeof deadline === 'number' && Date.now() >= deadline;
  }

  getGenerationConfig(overrides = {}) {
    const defaults = config.get('llm.gemini.generation') || {};
    const fallback = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 }
    };

    const merged = { ...fallback, ...defaults, ...overrides };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  applyGenerationDefaults(request, overrides = {}) {
    request.generationConfig = this.getGenerationConfig({ ...(request.generationConfig || {}), ...overrides });
    return request;
  }

  extractTextFromCandidates(response) {
    // New @google/genai SDK exposes response.text as a convenience getter.
    if (response && typeof response.text === 'string' && response.text.trim().length > 0) {
      return {
        text: response.text.trim(),
        candidate: response.candidates?.[0] || null,
        finishReason: response.candidates?.[0]?.finishReason || null
      };
    }

    const candidates = Array.isArray(response?.candidates)
      ? response.candidates
      : Array.isArray(response)
        ? response
        : [];

    if (!candidates.length) {
      throw new Error('No candidates in Gemini response');
    }

    const candidateWithText = candidates.find(candidate => {
      const parts = candidate?.content?.parts;
      return Array.isArray(parts) && parts.some(part => typeof part.text === 'string' && part.text.trim().length > 0);
    });

    if (!candidateWithText) {
      const finishReasons = candidates.map(c => c.finishReason || 'unknown').join(', ');
      throw new Error(`No text parts in candidates. Finish reasons: ${finishReasons}`);
    }

    const textParts = candidateWithText.content.parts
      .filter(part => typeof part.text === 'string' && part.text.trim().length > 0)
      .map(part => part.text.trim());

    if (!textParts.length) {
      throw new Error(`Candidate parts missing text after filtering: ${JSON.stringify(candidateWithText)}`);
    }

    const text = textParts.join('\n');

    return {
      text,
      candidate: candidateWithText,
      finishReason: candidateWithText.finishReason || null
    };
  }

  assessmentProblemText(activeSkill) {
    if (promptLoader.normalizeSkillName(activeSkill) !== 'oa') {
      return '';
    }
    const sessionManager = this.getSessionManager();
    const text = sessionManager.getAssessmentText && sessionManager.getAssessmentText();
    return text && text.trim() ? text.trim() : '';
  }

  withAssessmentText(text, activeSkill) {
    const problem = this.assessmentProblemText(activeSkill);
    if (!problem) {
      return { text, omitImages: false };
    }
    const body = String(text || '');
    const marker = problem.slice(0, Math.min(80, problem.length));
    const already = marker && body.includes(marker);
    return {
      text: already ? body : `Assessment item:\n${problem}\n\n${body}`,
      omitImages: true
    };
  }

  isUsableAssessmentText(text) {
    const body = String(text || '').trim();
    if (body.length < 40) {
      return false;
    }
    if (/^(i'm sorry|i am sorry|i cannot|i can't|sorry,|as an ai)\b/i.test(body) && body.length < 280) {
      return false;
    }
    return true;
  }

  splitOaPass(text) {
    const source = String(text || '').trim();
    const match = source.match(/^PROBLEM\s*:\s*([\s\S]*?)\nANSWER\s*:\s*([\s\S]*)$/i);
    if (!match) {
      return { problem: '', answer: source };
    }
    return { problem: match[1].trim(), answer: match[2].trim() };
  }

  streamOaAnswer(onDelta) {
    if (typeof onDelta !== 'function') {
      return null;
    }
    let pending = '';
    let mode = 'detect';
    return (delta) => {
      if (!delta) return;
      if (mode === 'stream') {
        onDelta(delta);
        return;
      }
      pending += delta;
      if (mode === 'detect') {
        const head = pending.trimStart();
        if (head.length < 8 && !head.includes('\n')) return;
        mode = /^PROBLEM\s*:/i.test(head) ? 'buffer' : 'stream';
        if (mode === 'stream') {
          onDelta(pending);
          pending = '';
          return;
        }
      }
      const marker = pending.search(/\nANSWER\s*:/i);
      if (marker === -1) return;
      const rest = pending.slice(marker).replace(/^\nANSWER\s*:/i, '');
      mode = 'stream';
      pending = '';
      if (rest) onDelta(rest);
    };
  }

  async solveOaFromTranscript(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage, onDelta) {
    const panels = this.getSessionManager().getProblemScreenshots().length;
    const read = panels >= 2
      ? 'Two screenshots of one question. One is the statement. The other is the input function where the code starts. Read both.'
      : 'Read this screenshot. The statement and the input function are often on different parts of the screen.';
    const instruction = `${read}\n\nOn this turn write exactly two parts.\nPROBLEM:\n<the question, constraints, samples, and the starter function if it is visible>\nANSWER:\n<only the final answer. A coding answer is one fenced block inside the given function, with the best time and the best space. A multiple-choice answer is only the option.>`;
    const skill = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
    const system = `${skill}\n\nOn a screenshot turn the user asks for PROBLEM: and then ANSWER:. Use that format for this turn. The ANSWER part still follows the rules above.`;
    const filtered = this.streamOaAnswer(onDelta);
    let raw = '';
    if (this.shouldUseAlternateProvider()) {
      const result = await this.runAlternateProvider({
        kind: 'image',
        imageBuffer,
        mimeType,
        activeSkill,
        sessionMemory: [],
        systemOverride: system,
        userTextOverride: instruction,
        skipFinalize: true,
        omitHistory: true,
        isolate: panels < 2,
        onDelta: filtered
      });
      raw = result && result.response ? result.response : '';
    } else {
      if (!this.isInitialized) return null;
      const request = {
        contents: [{
          role: 'user',
          parts: [{ text: instruction }, ...this.screenshotParts(imageBuffer, mimeType)]
        }],
        systemInstruction: { parts: [{ text: system }] }
      };
      this.applyGenerationDefaults(request);
      raw = filtered
        ? await this.executeStreamingRequest(request, filtered)
        : await this.executeGeminiWithTransportFallback(request);
    }
    const parts = this.splitOaPass(raw);
    if (this.isUsableAssessmentText(parts.problem)) {
      const sessionManager = this.getSessionManager();
      if (sessionManager.setAssessmentText) {
        sessionManager.setAssessmentText(parts.problem);
      }
    }
    const answer = this.shapeOaResponse(parts.answer);
    if (!answer || !answer.trim()) return null;
    return {
      response: answer,
      metadata: {
        skill: activeSkill,
        programmingLanguage,
        usedFallback: false,
        streamed: typeof onDelta === 'function',
        isImageAnalysis: true,
        mimeType,
        provider: this.provider
      }
    };
  }

  /**
   * Process an image directly with Gemini using the active skill prompt.
   * The image buffer is sent as inlineData alongside a concise instruction.
   * For image-based queries, we include the skill prompt (e.g., DSA) as systemInstruction.
   * @param {Buffer} imageBuffer - PNG/JPEG image bytes
   * @param {string} mimeType - e.g., 'image/png' or 'image/jpeg'
   * @param {string} activeSkill - current skill (e.g. 'dsa')
   * @param {Array} sessionMemory - optional (not required for image)
   * @param {string|null} programmingLanguage - optional language context for skills that need it
   * @returns {Promise<{response: string, metadata: object}>}
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (promptLoader.normalizeSkillName(activeSkill) === 'oa') {
      try {
        const fromText = await this.solveOaFromTranscript(
          imageBuffer,
          mimeType,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          null
        );
        if (fromText) {
          return fromText;
        }
      } catch (error) {
        logger.warn('OA text solve failed, using the screenshot', { error: error.message });
      }
    }
    if (this.shouldUseAlternateProvider()) {
      return this.runAlternateProvider({
        kind: 'image',
        imageBuffer,
        mimeType,
        activeSkill,
        sessionMemory,
        programmingLanguage
      });
    }

    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';

      const request = this.buildGeminiImageRequest(
        imageBuffer,
        mimeType,
        activeSkill,
        programmingLanguage,
        skillPrompt
      );

      const responseText = await this.executeGeminiWithTransportFallback(request);

      // Enforce language in code fences if provided
      const finalResponse = this.finalizeSkillResponse(responseText, activeSkill, programmingLanguage);

      logger.logPerformance('LLM image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM image processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  async processImageWithSkillStream(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (promptLoader.normalizeSkillName(activeSkill) === 'oa') {
      try {
        const fromText = await this.solveOaFromTranscript(
          imageBuffer,
          mimeType,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          onDelta
        );
        if (fromText) {
          return fromText;
        }
      } catch (error) {
        logger.warn('OA text solve failed, using the screenshot', { error: error.message });
      }
    }
    if (this.shouldUseAlternateProvider()) {
      try {
        return await this.runAlternateProvider({
          kind: 'image',
          imageBuffer,
          mimeType,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          onDelta
        });
      } catch (error) {
        logger.warn('Streaming image analysis failed, falling back to non-streaming', {
          error: error.message,
          provider: this.provider
        });
        return this.processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage);
      }
    }

    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkillStream');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      const geminiRequest = this.buildGeminiImageRequest(
        imageBuffer,
        mimeType,
        activeSkill,
        programmingLanguage,
        skillPrompt
      );

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = this.finalizeSkillResponse(fullText, activeSkill, programmingLanguage);

      logger.logPerformance('LLM image streaming', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      logger.warn('Streaming image analysis failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      return this.processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  /**
   * Keep the most recent turns that fit the character budget, oldest first.
   * Always keeps at least the newest turn so one long message still goes
   * through instead of producing an empty request.
   */
  limitTurnsToCharBudget(turns, budget = CONVERSATION_CHAR_BUDGET) {
    if (!Array.isArray(turns) || turns.length === 0) {
      return [];
    }
    const kept = [];
    let used = 0;
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      const size = this.measureTurnChars(turn);
      if (kept.length > 0 && used + size > budget) {
        break;
      }
      kept.unshift(turn);
      used += size;
    }
    return kept;
  }

  measureTurnChars(turn) {
    if (!turn) {
      return 0;
    }
    if (typeof turn.content === 'string') {
      return turn.content.length;
    }
    if (Array.isArray(turn.parts)) {
      return turn.parts.reduce((sum, part) => sum + ((part && part.text) ? part.text.length : 0), 0);
    }
    return 0;
  }

  collapseAdjacentGeminiTurns(contents) {
    const collapsed = [];
    for (const item of contents) {
      const last = collapsed[collapsed.length - 1];
      if (last && last.role === item.role) {
        last.parts.push(...item.parts);
      } else {
        collapsed.push({
          role: item.role,
          parts: [...item.parts]
        });
      }
    }
    return collapsed;
  }

  conversationContentsFromHistory(conversationHistory, limit = CONVERSATION_TURN_LIMIT) {
    const events = Array.isArray(conversationHistory) ? conversationHistory : [];
    const contents = events
      .filter((event) => (
        event.role !== 'system' &&
        event.content &&
        typeof event.content === 'string' &&
        event.content.trim().length > 0
      ))
      .slice(-limit)
      .map((event) => ({
        role: event.role === 'model' || event.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: event.content.trim() }]
      }));
    return this.collapseAdjacentGeminiTurns(this.limitTurnsToCharBudget(contents));
  }

  mergeCurrentUserTurn(contents, rawText, displayText) {
    const raw = (rawText || '').trim();
    const display = (displayText || raw).trim();
    if (!display) {
      return;
    }

    const last = contents[contents.length - 1];
    const lastText = last && last.role === 'user'
      ? (last.parts || []).map((part) => part.text || '').join('\n').trim()
      : '';
    const alreadyPresent = last && last.role === 'user' && lastText && (
      lastText === raw ||
      lastText === display ||
      (raw && (raw.includes(lastText) || lastText.includes(raw)))
    );

    if (alreadyPresent) {
      this.attachLatestScreenshotToParts(last.parts);
      return;
    }

    const currentParts = [{ text: display }];
    this.attachLatestScreenshotToParts(currentParts);
    contents.push({
      role: 'user',
      parts: currentParts
    });
  }

  screenshotParts(imageBuffer, mimeType) {
    const sessionManager = this.getSessionManager();
    const problemShots = sessionManager.getProblemScreenshots();
    const shots = problemShots.length
      ? problemShots
      : (imageBuffer && Buffer.isBuffer(imageBuffer))
        ? [{ buffer: imageBuffer, mimeType: mimeType || 'image/png', base64: imageBuffer.toString('base64') }]
        : [];
    const latest = !shots.length && sessionManager.getLatestScreenshot && sessionManager.getLatestScreenshot();
    const list = shots.length ? shots : (latest && latest.buffer ? [latest] : []);
    return list.map((shot) => ({
      inlineData: {
        data: shot.base64 || shot.buffer.toString('base64'),
        mimeType: shot.mimeType || 'image/png'
      }
    }));
  }

  attachLatestScreenshotToParts(parts) {
    if (this._omitScreenshots) {
      return parts;
    }
    parts.push(...this.screenshotParts());
    return parts;
  }

  withoutScreenshots(build, omitImages) {
    if (!omitImages) {
      return build();
    }
    const previous = this._omitScreenshots;
    this._omitScreenshots = true;
    try {
      return build();
    } finally {
      this._omitScreenshots = previous;
    }
  }

  buildGeminiImageRequest(imageBuffer, mimeType, activeSkill, programmingLanguage, skillPrompt) {
    const sessionManager = this.getSessionManager();
    const conversationHistory = sessionManager.getConversationHistory(CONVERSATION_TURN_LIMIT);
    const request = { contents: this.conversationContentsFromHistory(conversationHistory, CONVERSATION_TURN_LIMIT) };
    this.applyGenerationDefaults(request);
    if (skillPrompt && skillPrompt.trim().length > 0) {
      request.systemInstruction = { parts: [{ text: skillPrompt }] };
    }

    const imageParts = this.screenshotParts(imageBuffer, mimeType);
    const instruction = this.formatImageInstruction(activeSkill, programmingLanguage);
    if (request.contents.length && request.contents[request.contents.length - 1].role === 'user') {
      request.contents[request.contents.length - 1].parts.push({ text: instruction }, ...imageParts);
    } else {
      request.contents.push({
        role: 'user',
        parts: [{ text: instruction }, ...imageParts]
      });
    }
    return request;
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    const skill = promptLoader.normalizeSkillName(activeSkill);
    if (skill === 'hld') {
      return `This screenshot is part of our ongoing conversation. Use everything we already discussed. Analyze the on-screen high-level design problem and give requirements, architecture, APIs, data stores, bottlenecks, and trade-offs.${langNote}`;
    }
    if (skill === 'lld') {
      return `This screenshot is part of our ongoing conversation. Use everything we already discussed. Analyze the on-screen low-level design problem and give classes, APIs, and production-ready code.${langNote}`;
    }
    if (skill === 'oa') {
      const panels = this.getSessionManager().getProblemScreenshots().length;
      if (panels >= 2) {
        return 'These screenshots are one assessment question split across the screen. One section is the statement. The other is the input function where the code must start. Write the solution inside that function and keep its name, parameters, and any input code already there. Do not invent a new function. If the newer screenshot is a different question, ignore the older one. If it is multiple choice, output only the option. No explanation.';
      }
      return 'This screenshot is one section of an assessment question. The statement and the input function are often on different parts of the screen. If the function is visible, write the code inside it. If it is multiple choice, true/false, or fill-in, output only the option or value and do not write a program. No explanation.';
    }
    return `This screenshot is part of our ongoing conversation. Use everything we already discussed. Analyze the on-screen DSA problem fully: pattern, brute-force code, where that code fails, optimal approach and code, complexity, edge cases, and a dry run.${langNote}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null, options = null) {
    const prepared = this.withAssessmentText(text, activeSkill);
    text = prepared.text;
    const omitImages = (options && options.omitImages) || prepared.omitImages;
    const omitHistory = !!(options && options.omitHistory);
    if (this.shouldUseAlternateProvider()) {
      return this.runAlternateProvider({
        kind: 'text',
        text,
        activeSkill,
        sessionMemory,
        programmingLanguage,
        omitImages,
        omitHistory
      });
    }

    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.withoutScreenshots(
        () => this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage, { omitHistory }),
        omitImages
      );
      const response = await this.executeGeminiWithTransportFallback(geminiRequest);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = this.finalizeSkillResponse(response, activeSkill, programmingLanguage);

      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }

      throw error;
    }
  }

  async processTextWithSkillStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null, options = null) {
    const prepared = this.withAssessmentText(text, activeSkill);
    text = prepared.text;
    const omitImages = (options && options.omitImages) || prepared.omitImages;
    const omitHistory = !!(options && options.omitHistory);
    if (this.shouldUseAlternateProvider()) {
      try {
        return await this.runAlternateProvider({
          kind: 'text',
          text,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          onDelta,
          omitImages,
          omitHistory
        });
      } catch (error) {
        logger.warn('Streaming text failed, falling back to non-streaming', {
          error: error.message,
          provider: this.provider
        });
        return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage, { omitImages, omitHistory });
      }
    }

    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const geminiRequest = this.withoutScreenshots(
        () => this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage, { omitHistory }),
        omitImages
      );

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = this.finalizeSkillResponse(fullText, activeSkill, programmingLanguage);

      logger.logPerformance('LLM text streaming', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true
        }
      };
    } catch (error) {
      logger.warn('Streaming text failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage, { omitImages, omitHistory });
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const prepared = this.withAssessmentText(text, activeSkill);
    text = prepared.text;
    const omitImages = prepared.omitImages;
    if (this.shouldUseAlternateProvider()) {
      return this.runAlternateProvider({
        kind: 'transcription',
        text,
        activeSkill,
        sessionMemory,
        programmingLanguage,
        omitImages
      });
    }

    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.withoutScreenshots(
        () => this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage),
        omitImages
      );
      const response = await this.executeGeminiWithTransportFallback(geminiRequest);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = this.finalizeSkillResponse(response, activeSkill, programmingLanguage);

      logger.logPerformance('LLM transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill);
      }
      
      throw error;
    }
  }

  /**
   * Normalize all triple-backtick code fences to the selected programming language tag.
   * Does not alter the inner code; only ensures fence language tags are correct.
   */
  finalizeSkillResponse(text, activeSkill, programmingLanguage) {
    if (promptLoader.normalizeSkillName(activeSkill) === 'oa') {
      return this.shapeOaResponse(text);
    }
    return programmingLanguage
      ? this.enforceProgrammingLanguage(text, programmingLanguage)
      : text;
  }

  isOaChoiceLine(line) {
    const s = String(line || '').trim();
    if (!s || s.length > 200) return false;
    if (/^(here|this|the |we |note|explanation|approach|because|output|below)\b/i.test(s)) return false;
    if (/^(\d+)\s*[\).\:]\s*\S/.test(s)) return true;
    if (/^[A-E]\s*[\).\:]\s+\S/.test(s)) return true;
    if (/^[A-E](\s*[,/&]\s*[A-E])+$/i.test(s)) return true;
    if (/^(answer\s*[:\-]\s*)?(true|false)$/i.test(s)) return true;
    if (/^answers?\s*[:\-]\s*\S/i.test(s)) return true;
    return false;
  }

  isOaChoiceAnswer(text) {
    const body = String(text || '');
    if (/```/.test(body)) return false;
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length || lines.length > 15) return false;
    if (lines.every((line) => this.isOaChoiceLine(line))) return true;
    if (lines.length === 1 && lines[0].length <= 80 && !/[{}();]|def |class |#include|function /.test(lines[0])) {
      return true;
    }
    return false;
  }

  shapeOaResponse(text) {
    const source = String(text || '').trim();
    if (!source) return source;

    const blocks = [];
    const outside = [];
    const re = /```([^\n`]*)\n([\s\S]*?)```/g;
    let match;
    let last = 0;
    while ((match = re.exec(source))) {
      outside.push(source.slice(last, match.index));
      const body = (match[2] || '').trim();
      if (body) {
        blocks.push({
          tag: (match[1] || '').trim().split(/\s+/)[0],
          body
        });
      }
      last = match.index + match[0].length;
    }
    outside.push(source.slice(last));

    const lines = outside.join('\n').split('\n').map((line) => line.trim()).filter(Boolean);
    const choices = lines.filter((line) => this.isOaChoiceLine(line));

    if (blocks.length === 0) {
      if (choices.length > 0 && choices.length < lines.length) {
        return choices.join('\n');
      }
      return source;
    }

    const tag = (blocks.find((block) => block.tag) || blocks[0]).tag;
    const body = blocks.map((block) => block.body).join('\n\n');
    const code = tag ? '```' + tag + '\n' + body + '\n```' : body;
    if (choices.length === 0) return code;
    return choices.join('\n') + '\n\n' + code;
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      // Replace all triple-backtick fences' language token with the selected tag
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        // If already the desired fenceTag as the first token, keep as is
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      // Optionally normalize tildes fences to backticks with correct tag
      const normalizedTildes = replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');

      return normalizedTildes;
    } catch (_) {
      return text;
    }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage, options = null) {
    // Check if we have the new conversation history format
    const sessionManager = this.getSessionManager();
    
    if (!(options && options.omitHistory) && sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(CONVERSATION_TURN_LIMIT);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to old method for compatibility - now with programming language support
    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory,
      programmingLanguage
    );

    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt that already has programming language injected
    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: requestComponents.skillPrompt }]
      };
      
      logger.debug('Using language-enhanced system instruction for skill', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: requestComponents.skillPrompt.length,
        requiresProgrammingLanguage: requestComponents.requiresProgrammingLanguage
      });
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatUserMessage(text, activeSkill) }]
    });

    return request;
  }

  buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt from context (which may already include programming language)
    if (skillContext.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: skillContext.skillPrompt }]
      };
      
      logger.debug('Using skill context prompt as system instruction', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: skillContext.skillPrompt.length,
        requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false,
        hasLanguageInjection: programmingLanguage && skillContext.requiresProgrammingLanguage
      });
    }

    request.contents.push(...this.conversationContentsFromHistory(conversationHistory, 16));

    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) {
      throw new Error('Failed to format user message or message is empty');
    }

    this.mergeCurrentUserTurn(request.contents, text, formattedMessage);

    logger.debug('Built Gemini request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSystemInstruction: !!request.systemInstruction,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Validate input text first
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided to buildIntelligentTranscriptionRequest');
    }

    // Check if we have the new conversation history format
    const sessionManager = this.getSessionManager();
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(CONVERSATION_TURN_LIMIT);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to basic intelligent request
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Add intelligent filtering system instruction
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    if (!intelligentPrompt) {
      throw new Error('Failed to generate intelligent transcription prompt');
    }

    request.systemInstruction = {
      parts: [{ text: intelligentPrompt }]
    };

    const basicParts = [{ text: cleanText }];
    this.attachLatestScreenshotToParts(basicParts);
    request.contents.push({
      role: 'user',
      parts: basicParts
    });

    logger.debug('Built basic intelligent transcription request', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      textLength: cleanText.length,
      hasSystemInstruction: !!request.systemInstruction
    });

    return request;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

  // For chat/transcription messages, DO NOT include the full skill prompt; use only the intelligent filter prompt
  const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
  request.systemInstruction = { parts: [{ text: intelligentPrompt }] };

    request.contents.push(...this.conversationContentsFromHistory(conversationHistory, 16));

    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    this.mergeCurrentUserTurn(request.contents, cleanText, cleanText);

    // Ensure we have at least one content item
    if (request.contents.length === 0) {
      throw new Error('No valid content to send to Gemini API');
    }

    logger.debug('Built intelligent transcription request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSkillPrompt: !!skillContext.skillPrompt,
      cleanTextLength: cleanText.length,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    if (promptLoader.normalizeSkillName(activeSkill) === 'oa') {
      return promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
    }

    let prompt = `# Intelligent Transcription Response System

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to question/message with appropriate brevity.
Assume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.
Always respond to the point, do not repeat the question or unnecessary information which is not related to ${activeSkill}.`;

    // Add programming language context if provided
    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the transcription is casual conversation, greetings, or NOT related to ${activeSkill}:
- Respond with: "Yeah, I'm listening. Ask your question relevant to ${activeSkill}."
- Or similar brief acknowledgments like: "I'm here, what's your ${activeSkill} question?"

### If the transcription IS relevant to ${activeSkill}, refers to a screenshot, or is a follow-up in this conversation:
- Use the full session so far, including any attached screenshot
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers
- Do not truncate or shorten your response
- For DSA problems, always include: brute-force code, where it fails, optimal code, complexity, edge cases, and a dry run

### Examples of casual/irrelevant messages:
- "Hello", "Hi there", "How are you?"
- "What's the weather like?"
- "I'm just testing this"
- Random conversations not related to ${activeSkill}

### Examples of relevant messages:
- Actual questions about ${activeSkill} concepts
- Follow-up questions to previous responses
- Requests for clarification on ${activeSkill} topics
- Problem-solving requests related to ${activeSkill}

## Response Format:
- Keep responses detailed
- Use bullet points for structured answers
- Be encouraging and helpful
- Stay focused on ${activeSkill}

If the user's input is a coding or DSA problem statement and contains no code, solve it fully without asking for more details: brute-force code, failure cases, optimal code, complexity, edge cases, and a dry run.

Remember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ${activeSkill}.`;

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  async executeRequest(geminiRequest) {
    const maxRetries = config.get('llm.gemini.maxRetries');
    const timeout = config.get('llm.gemini.timeout');
    const primaryModel = this.model;
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels];

    logger.debug('Executing Gemini request', {
      hasModel: !!this.model,
      hasClient: !!this.client,
      requestKeys: Object.keys(geminiRequest),
      timeout,
      maxRetries,
      modelsToTry,
      nodeVersion: process.version,
      platform: process.platform
    });

    let lastError = null;
    const deadline = this.requestDeadline();

    for (const modelName of modelsToTry) {
      if (this.deadlineExceeded(deadline)) {
        logger.warn('Gemini request budget exhausted; stopping model sweep', { model: modelName });
        break;
      }
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          );

          logger.debug(`Gemini API attempt ${attempt} starting with model ${modelName}`, {
            timestamp: new Date().toISOString(),
            timeout,
            model: modelName
          });

          const requestPromise = this.client.models.generateContent({
            model: modelName,
            contents: geminiRequest.contents,
            config: geminiRequest.generationConfig,
            systemInstruction: geminiRequest.systemInstruction
          });
          const result = await Promise.race([requestPromise, timeoutPromise]);

          if (!result) {
            throw new Error('Empty response from Gemini API');
          }

          const { text, finishReason } = this.extractTextFromCandidates(result);

          if (finishReason === 'MAX_TOKENS') {
            logger.warn('Gemini response reached max tokens limit', {
              attempt,
              finishReason,
              model: modelName
            });
          }

          logger.debug('Gemini API request successful', {
            attempt,
            model: modelName,
            responseLength: text.length,
            finishReason
          });

          return text;
        } catch (error) {
          const errorInfo = this.analyzeError(error);
          lastError = error;

          // Enhanced error logging for fetch failures
          if (errorInfo.type === 'NETWORK_ERROR') {
            logger.error('Network error details', {
              attempt,
              model: modelName,
              errorMessage: error.message,
              errorStack: error.stack,
              errorName: error.name,
              nodeEnv: process.env.NODE_ENV,
              electronVersion: process.versions.electron,
              chromeVersion: process.versions.chrome,
              nodeVersion: process.versions.node,
              userAgent: this.getUserAgent()
            });
          }

          logger.warn(`Gemini API attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            errorType: errorInfo.type,
            isNetworkError: errorInfo.isNetworkError,
            suggestedAction: errorInfo.suggestedAction,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });

          // For model-unavailable / overloaded / rate-limit errors, move to
          // the next fallback model immediately instead of burning all retries.
          if (this.isGeminiModelUnavailable(error, errorInfo) && modelName !== modelsToTry[modelsToTry.length - 1]) {
            logger.info(`Switching to fallback model after ${modelName} unavailable`, {
              model: modelName,
              error: error.message
            });
            break; // exit retry loop for this model and try next model
          }

          if (attempt === maxRetries) {
            break; // exit retry loop for this model and try next model
          }

          // Use exponential backoff with jitter for network errors
          const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
          const delay = baseDelay * attempt + Math.random() * 1000;

          if (this.deadlineExceeded(deadline)) {
            logger.warn('Gemini request budget exhausted; not retrying', { model: modelName });
            break;
          }

          logger.debug(`Waiting ${delay}ms before retry ${attempt + 1}`, {
            baseDelay,
            isNetworkError: errorInfo.isNetworkError,
            model: modelName
          });

          await this.delay(delay);
        }
      }
    }

    const finalErrorInfo = this.analyzeError(lastError);
    const finalError = new Error(`Gemini API failed after trying ${modelsToTry.join(', ')}: ${lastError?.message}`);
    finalError.errorAnalysis = finalErrorInfo;
    finalError.originalError = lastError;
    throw finalError;
  }

  /**
   * Streaming sibling of processTranscriptionWithIntelligentResponse. Emits
   * incremental text via onDelta so the UI can render the answer as it is
   * generated (much faster perceived latency). Returns the same
   * {response, metadata} shape. Falls back to the non-streaming path on any
   * streaming failure so reliability is never worse than before.
   */
  async processTranscriptionWithIntelligentResponseStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    const prepared = this.withAssessmentText(text, activeSkill);
    text = prepared.text;
    const omitImages = prepared.omitImages;
    if (this.shouldUseAlternateProvider()) {
      try {
        return await this.runAlternateProvider({
          kind: 'transcription',
          text,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          onDelta,
          omitImages
        });
      } catch (error) {
        logger.warn('Streaming transcription failed, falling back to non-streaming', {
          error: error.message,
          provider: this.provider
        });
        return this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
      }
    }

    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const geminiRequest = this.withoutScreenshots(
        () => this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage),
        omitImages
      );

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = this.finalizeSkillResponse(fullText, activeSkill, programmingLanguage);

      logger.logPerformance('LLM transcription streaming', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      logger.warn('Streaming transcription failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      // Non-streaming path returns the same shape; the caller renders it as a
      // single final response.
      return this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  /** Safely pull the text delta out of a streamed Gemini chunk. */
  _extractChunkText(chunk) {
    try {
      const t = chunk && chunk.text;
      if (typeof t === 'string') {
        return t;
      }
    } catch (_) {
      // `.text` getter can throw on non-text parts; fall through to manual read.
    }
    try {
      const parts = (chunk && chunk.candidates && chunk.candidates[0] &&
        chunk.candidates[0].content && chunk.candidates[0].content.parts) || [];
      return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
    } catch (_) {
      return '';
    }
  }

  /**
   * Run a streaming Gemini request with the same model-fallback + retry policy
   * as executeRequest. Accumulates and returns the full text; invokes onDelta
   * for each chunk.
   */
  async executeStreamingRequest(geminiRequest, onDelta) {
    const maxRetries = config.get('llm.gemini.maxRetries');
    const apiKey = config.getApiKey('GEMINI');
    const primaryModel = this.model;
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels];

    let lastError = null;
    // Once a failed attempt has already pushed text to the UI, a retry would
    // append a second copy of the answer to the same bubble. Deltas are a
    // nicety; correctness of the final text is not. So we stream only until
    // the first partial failure, then fall silent and let the caller render
    // the complete response in one go.
    let emittedAnyDelta = false;
    let deltasDisabled = false;
    const guardedDelta = typeof onDelta === 'function'
      ? (piece) => {
          if (deltasDisabled) {
            return;
          }
          emittedAnyDelta = true;
          onDelta(piece);
        }
      : null;

    const deadline = this.requestDeadline();

    for (const modelName of modelsToTry) {
      if (this.deadlineExceeded(deadline)) {
        logger.warn('Gemini streaming budget exhausted; stopping model sweep', { model: modelName });
        break;
      }
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const fullText = await this._streamRequestForModel(geminiRequest, modelName, apiKey, guardedDelta);

          if (!fullText) {
            throw new Error('Empty streamed response from Gemini API');
          }

          logger.debug('Gemini streaming request successful', {
            attempt,
            model: modelName,
            responseLength: fullText.length
          });

          return fullText;
        } catch (error) {
          const errorInfo = this.analyzeError(error);
          lastError = error;

          if (emittedAnyDelta) {
            deltasDisabled = true;
          }

          logger.warn(`Gemini streaming attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            errorType: errorInfo.type,
            partialTextAlreadyStreamed: emittedAnyDelta,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });

          if (this.isGeminiModelUnavailable(error, errorInfo) && modelName !== modelsToTry[modelsToTry.length - 1]) {
            break; // try next fallback model
          }

          if (attempt === maxRetries) {
            break;
          }

          if (this.deadlineExceeded(deadline)) {
            logger.warn('Gemini streaming budget exhausted; not retrying', { model: modelName });
            break;
          }

          const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
          const delay = baseDelay * attempt + Math.random() * 1000;
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error('Gemini streaming request failed');
  }

  _streamRequestForModel(geminiRequest, modelName, apiKey, onDelta) {
    const timeout = config.get('llm.gemini.timeout');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
    const postData = JSON.stringify(geminiRequest);
    const agent = geminiAgent;

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': this.getUserAgent()
      },
      timeout,
      agent
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', (c) => { errBody += c; });
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody}`)));
          return;
        }

        let fullText = '';
        let buffer = '';

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith('data:')) {
              continue;
            }
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') {
              continue;
            }
            try {
              const json = JSON.parse(payload);
              const piece = this._extractChunkText(json);
              if (piece) {
                fullText += piece;
                if (typeof onDelta === 'function') {
                  onDelta(piece);
                }
              }
            } catch (_) {
              // Partial JSON across chunk boundaries is rare with line framing;
              // skip anything that doesn't parse cleanly.
            }
          }
        });

        res.on('end', () => resolve(fullText.trim()));
        res.on('error', (error) => reject(new Error(`Streaming response error: ${error.message}`)));
      });

      req.on('error', (error) => reject(new Error(`Streaming request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Streaming request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  getUserAgent() {
    try {
      // Try to get user agent from Electron if available
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return navigator.userAgent;
      }
      return `Node.js/${process.version} (${process.platform}; ${process.arch})`;
    } catch {
      return 'Unknown';
    }
  }

  analyzeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network connectivity errors
    if (errorMessage.includes('fetch failed') || 
        errorMessage.includes('network error') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('timeout')) {
      return {
        type: 'NETWORK_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check internet connection and firewall settings'
      };
    }
    
    // API key errors
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        isNetworkError: false,
        suggestedAction: 'Verify Gemini API key configuration'
      };
    }
    
    // Rate limiting
    if (errorMessage.includes('quota') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return {
        type: 'RATE_LIMIT_ERROR',
        isNetworkError: false,
        suggestedAction: 'Wait before retrying or check API quota'
      };
    }
    
    // Timeout errors
    if (errorMessage.includes('request timeout') || errorMessage.includes('etimedout')) {
      return {
        type: 'TIMEOUT_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check network latency or increase timeout'
      };
    }
    
    return {
      type: 'UNKNOWN_ERROR',
      isNetworkError: false,
      suggestedAction: 'Check logs for more details'
    };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = this.provider === 'claude'
      ? [
          { host: 'anthropic.com', port: 443, name: 'Anthropic (HTTPS)' },
          { host: 'api.anthropic.com', port: 443, name: 'Claude API Endpoint' }
        ]
      : this.provider === 'cursor'
        ? [
            { host: 'cursor.com', port: 443, name: 'Cursor (HTTPS)' },
            { host: 'api2.cursor.sh', port: 443, name: 'Cursor API Endpoint' }
          ]
        : [
            { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
            { host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' }
          ];

    const results = await Promise.allSettled(
      connectivityTests.map(test => this.testNetworkConnection(test))
    );

    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map((result, index) => ({
        ...connectivityTests[index],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };

    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  async testNetworkConnection({ host, port, name }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed to ${host}:${port}: ${error.message}`));
      });

      socket.connect(port, host);
    });
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill });

    const fallbackResponses = {
      dsa: 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      oa: 'Could not solve this assessment problem. Check the API key in Settings and capture the problem again.',
      lld: 'This looks like a low-level design question. Identify the core classes, public APIs, and how they collaborate, then implement the key types.',
      hld: 'This looks like a high-level design question. Cover requirements, scale, core services, data stores, APIs, and the main trade-offs.',
      default: 'I can help analyze this content. Please ensure your Gemini API key is properly configured for detailed analysis.'
    };

    const skill = promptLoader.normalizeSkillName(activeSkill);
    const response = fallbackResponses[skill] || fallbackResponses.default;
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill) {
    logger.info('Generating intelligent fallback response for transcription', { activeSkill });

    // Simple heuristic to determine if message seems skill-related
    const skillKeywords = {
      dsa: ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      lld: ['class', 'object', 'interface', 'api', 'design', 'singleton', 'factory', 'thread', 'lock'],
      hld: ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache', 'queue', 'shard']
    };

    const textLower = text.toLowerCase();
    const relevantKeywords = skillKeywords[activeSkill] || [];
    const hasRelevantKeywords = relevantKeywords.some(keyword => textLower.includes(keyword));
    
    // Check for question indicators
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', 'should i', '?'];
    const seemsLikeQuestion = questionIndicators.some(indicator => textLower.includes(indicator));

    let response;
    if (hasRelevantKeywords || seemsLikeQuestion) {
      response = `I'm having trouble processing that right now, but it sounds like a ${activeSkill} question. Could you rephrase or ask more specifically about what you need help with?`;
    } else {
      response = `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;
    }
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true
      }
    };
  }

  async testAlternateConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      const networkCheck = await this.checkNetworkConnectivity();
      const providerMod = this.provider === 'cursor'
        ? require('./llm-providers/cursor.provider')
        : require('./llm-providers/claude.provider');
      const startTime = Date.now();
      const text = await providerMod.complete({
        apiKey: this.getAlternateApiKey(),
        model: this.model,
        system: '',
        messages: [{ role: 'user', content: 'Test connection. Please respond with "OK".' }],
        timeout: this.provider === 'cursor'
          ? config.get('llm.cursor.timeout')
          : config.get('llm.claude.timeout')
      });
      return {
        success: true,
        response: text,
        latency: Date.now() - startTime,
        model: this.model,
        provider: this.provider,
        networkConnectivity: networkCheck
      };
    } catch (error) {
      logger.error('Alternate provider connection test failed', {
        provider: this.provider,
        error: error.message
      });
      return {
        success: false,
        error: error.message,
        errorType: 'UNKNOWN',
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
    }
  }

  async testConnection() {
    if (this.shouldUseAlternateProvider()) {
      return this.testAlternateConnection();
    }

    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      // First check network connectivity
      const networkCheck = await this.checkNetworkConnectivity();
      const hasNetworkIssues = networkCheck.tests.some(test => !test.success);
      
      if (hasNetworkIssues) {
        logger.warn('Network connectivity issues detected', networkCheck);
      }

      const generationConfig = this.getGenerationConfig({ temperature: 0, maxOutputTokens: 64 });
      const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
      const modelsToTry = [this.model, ...fallbackModels];

      let lastError = null;
      let result = null;
      let usedModel = null;

      for (const modelName of modelsToTry) {
        try {
          const startTime = Date.now();
          result = await this.client.models.generateContent({
            model: modelName,
            contents: 'Test connection. Please respond with "OK".',
            config: generationConfig
          });
          usedModel = modelName;
          const latency = Date.now() - startTime;
          const { text } = this.extractTextFromCandidates(result);

          logger.info('Connection test successful', {
            response: text,
            latency,
            model: usedModel,
            networkCheck: hasNetworkIssues ? 'issues_detected' : 'healthy'
          });

          return {
            success: true,
            response: text,
            latency,
            model: usedModel,
            networkConnectivity: networkCheck
          };
        } catch (error) {
          lastError = error;
          logger.warn(`Connection test failed for model ${modelName}`, {
            error: error.message,
            model: modelName
          });

          if (!this.isGeminiQuotaOrUnavailable(error) && modelName === this.model) {
            // Primary model failed for a non-availability reason; don't hide it
            break;
          }
        }
      }

      throw lastError || new Error('Connection test failed on all models');
    } catch (error) {
      const errorAnalysis = this.analyzeError(error);
      logger.error('Connection test failed', {
        error: error.message,
        errorAnalysis
      });

      // Map raw SDK errors to user-friendly messages. The wizard only
      // surfaces `error`, so any raw SDK error string would land in the
      // UI verbatim.
      const friendlyError = this._friendlyTestError(error, errorAnalysis);

      return {
        success: false,
        error: friendlyError,
        errorType: errorAnalysis?.type || 'UNKNOWN',
        errorAnalysis,
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
    }
  }

  /**
   * Translate raw SDK / network errors into something a user can act on.
   */
  _friendlyTestError(error, analysis) {
    const type = analysis?.type;
    const raw = (error?.message || '').toLowerCase();

    if (type === 'NETWORK_ERROR' || raw.includes('fetch failed') || raw.includes('enotfound')) {
      return 'Cannot reach Google servers. Check your internet connection, firewall, or VPN settings.';
    }
    if (type === 'AUTH_ERROR' || raw.includes('api key') || raw.includes('401') || raw.includes('403')) {
      return 'Invalid API key or insufficient permissions. Double-check the key at aistudio.google.com/apikey.';
    }
    if (type === 'RATE_LIMIT_ERROR' || raw.includes('429') || raw.includes('quota')) {
      return 'Rate limit or quota exceeded. Wait a moment or check your Google Cloud billing.';
    }
    if (type === 'TIMEOUT_ERROR') {
      return 'Request timed out. The Google API may be slow or unreachable right now.';
    }
    if (type === 'MODEL_ERROR' || raw.includes('model') || raw.includes('404')) {
      return 'The configured Gemini model is unavailable. Try a different model in Settings.';
    }
    if (raw.includes('503') || raw.includes('unavailable') || raw.includes('high demand')) {
      return 'Gemini is experiencing high demand. Please wait a moment and try again.';
    }
    // Fall back to a stripped-down raw message (no SDK prefix noise)
    return (error?.message || 'Connection failed').replace(/^\[(GoogleGenerativeAI|GoogleGenAI) Error\]:\s*/i, '');
  }

  updateApiKey(newApiKey) {
    process.env.GEMINI_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
    
    logger.info('API key updated and client reinitialized');
  }

  getStats() {
    const providerConfig = this.provider === 'claude'
      ? config.get('llm.claude')
      : this.provider === 'cursor'
        ? config.get('llm.cursor')
        : config.get('llm.gemini');
    return {
      isInitialized: this.isInitialized,
      provider: this.provider || 'cursor',
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: providerConfig
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeAlternativeRequest(geminiRequest) {
    const apiKey = config.getApiKey('GEMINI');
    const primaryModel = config.get('llm.gemini.model');
    const fallbackModels = config.get('llm.gemini.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels];

    logger.info('Using alternative HTTPS request method', { modelsToTry });

    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const result = await this._executeAlternativeRequestForModel(geminiRequest, modelName, apiKey);
        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`Alternative HTTPS request failed for model ${modelName}`, {
          error: error.message,
          model: modelName
        });

        if (!this.isGeminiModelUnavailable(error) && modelName === primaryModel) {
          break;
        }
      }
    }

    throw lastError || new Error('Alternative HTTPS request failed for all models');
  }

  async _executeAlternativeRequestForModel(geminiRequest, modelName, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    const postData = JSON.stringify(geminiRequest);

    const agent = geminiAgent;

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': this.getUserAgent()
      },
      timeout: config.get('llm.gemini.timeout'),
      agent
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            const response = JSON.parse(data);
            
            logger.debug('Alternative request response structure', {
              hasResponse: !!response,
              hasCandidates: !!response.candidates,
              candidatesLength: response.candidates?.length,
              responseKeys: Object.keys(response || {}),
              firstCandidateKeys: response.candidates?.[0] ? Object.keys(response.candidates[0]) : []
            });

            const { text, finishReason } = this.extractTextFromCandidates(response);

            if (finishReason === 'MAX_TOKENS') {
              logger.warn('Gemini alternative response reached max tokens limit', {
                finishReason
              });
            }
            
            logger.info('Alternative request successful', {
              responseLength: text.length,
              statusCode: res.statusCode,
              finishReason
            });
            
            resolve(text.trim());
          } catch (parseError) {
            logger.error('Failed to parse alternative response', {
              error: parseError.message,
              rawResponse: data.substring(0, 500),
              statusCode: res.statusCode
            });
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Alternative request failed: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Alternative request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }
}

module.exports = new LLMService();