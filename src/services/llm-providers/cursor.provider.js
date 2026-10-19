const fs = require('fs');
const os = require('os');
const path = require('path');

const EMPTY_CWD = path.join(os.tmpdir(), 'No-Cluely-cursor-empty');

// No-Cluely uses Cursor purely as a question-answering model: it never wants
// the agent to read files, run shell commands or search the web. Leaving the
// default toolset on means the agent may spend several seconds looping through
// tool calls in an empty scratch directory before it writes a single word of
// the answer. An empty list is the SDK's documented way to say "text only".
const NO_TOOLS = [];

function ensureEmptyCwd() {
  fs.mkdirSync(EMPTY_CWD, { recursive: true });
  return EMPTY_CWD;
}

function buildPrompt(system, messages) {
  const parts = [];
  if (system && String(system).trim()) {
    parts.push(String(system).trim());
  }
  for (const item of messages || []) {
    if (!item || typeof item.content !== 'string' || !item.content.trim()) {
      continue;
    }
    const label = item.role === 'assistant' ? 'Assistant' : 'User';
    parts.push(`${label}: ${item.content.trim()}`);
  }
  return parts.join('\n\n');
}

function extractAssistantText(event) {
  if (!event || event.type !== 'assistant') {
    return '';
  }
  const blocks = event.message && Array.isArray(event.message.content)
    ? event.message.content
    : [];
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

async function loadAgent() {
  try {
    const required = require('@cursor/sdk');
    const Agent = required.Agent || (required.default && required.default.Agent);
    if (Agent) {
      return Agent;
    }
  } catch (_) { /* Electron CJS may need the ESM build */ }

  try {
    const sdk = await import('@cursor/sdk');
    const Agent = sdk.Agent || (sdk.default && sdk.default.Agent);
    if (Agent) {
      return Agent;
    }
    throw new Error('Cursor SDK loaded without Agent export');
  } catch (error) {
    throw new Error(`Cursor SDK is unavailable: ${error.message}`);
  }
}

async function disposeAgent(agent) {
  if (!agent) {
    return;
  }
  try {
    if (typeof agent[Symbol.asyncDispose] === 'function') {
      await agent[Symbol.asyncDispose]();
      return;
    }
    if (typeof agent.close === 'function') {
      await agent.close();
    }
  } catch (_) { /* best effort */ }
}

/**
 * Screenshots travel on the message, not on SendOptions. `SDKUserMessage` is
 * `{ text, images? }`; SendOptions has no image field at all, so anything put
 * there is silently dropped and the model answers having never seen the image.
 */
function collectImages(imageBuffer, mimeType, images) {
  if (Array.isArray(images) && images.length) {
    return images
      .filter((shot) => shot && shot.buffer && Buffer.isBuffer(shot.buffer) && shot.buffer.length)
      .map((shot) => ({
        data: shot.base64 || shot.buffer.toString('base64'),
        mimeType: shot.mimeType || 'image/png'
      }));
  }
  if (imageBuffer && Buffer.isBuffer(imageBuffer) && imageBuffer.length) {
    return [{
      data: imageBuffer.toString('base64'),
      mimeType: mimeType || 'image/png'
    }];
  }
  return [];
}

function buildUserMessage(prompt, imageBuffer, mimeType, images) {
  const message = { text: prompt };
  const attached = collectImages(imageBuffer, mimeType, images);
  if (attached.length) {
    message.images = attached;
  }
  return message;
}

/**
 * Race a promise against a wall clock. llm.service passes `llm.cursor.timeout`
 * for exactly this, but nothing here ever read it, so a wedged SDK call left
 * the app showing "thinking" forever with no way out but a restart.
 */
function withTimeout(promise, ms, label, onTimeout) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return promise;
  }
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      if (typeof onTimeout === 'function') {
        try { onTimeout(); } catch (_) { /* best effort */ }
      }
      reject(new Error(`Cursor ${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function describeRunFailure(result) {
  const detail = result && result.error && result.error.message;
  const code = result && result.error && result.error.code;
  if (detail) {
    return code ? `Cursor run failed (${code}): ${detail}` : `Cursor run failed: ${detail}`;
  }
  if (result && result.status === 'cancelled') {
    return 'Cursor run was cancelled';
  }
  return 'Cursor agent run failed';
}

let warmAgent = null;
let warmKey = '';
let sendQueue = Promise.resolve();

function enqueue(task) {
  const run = sendQueue.then(task, task);
  sendQueue = run.then(() => {}, () => {});
  return run;
}

async function complete(options) {
  return enqueue(() => completeOnce(options));
}

async function completeOnce(options) {
  const apiKey = (options.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('Cursor API key is not configured');
  }

  const prompt = buildPrompt(options.system, options.messages);
  if (!prompt) {
    throw new Error('No user content to send to Cursor');
  }

  const Agent = await loadAgent();
  const cwd = ensureEmptyCwd();
  const modelId = options.model || 'grok-4.7-high';
  const timeout = Number(options.timeout);
  const deadline = Number.isFinite(timeout) && timeout > 0 ? Date.now() + timeout : null;
  const remaining = () => (deadline === null ? 0 : Math.max(1, deadline - Date.now()));
  const key = `${apiKey}\n${modelId}`;

  try {
    if (options.isolate || !warmAgent || warmKey !== key) {
      const previous = warmAgent;
      warmAgent = null;
      warmKey = '';
      if (previous) {
        await disposeAgent(previous);
      }
    }
    if (!warmAgent) {
      warmAgent = await withTimeout(Agent.create({
        apiKey,
        model: { id: modelId },
        tools: NO_TOOLS,
        local: {
          cwd,
          // Do not load project/user/team rule files from disk. They are
          // irrelevant here and only add startup work and stray instructions.
          settingSources: []
        }
      }), remaining(), 'agent startup');
      warmKey = key;
    }
    const agent = warmAgent;

    const wantsDeltas = typeof options.onDelta === 'function';
    let streamedText = '';
    const sendOptions = {};

    if (wantsDeltas) {
      // `text-delta` is the SDK's token-level channel. The assistant messages
      // on run.stream() arrive per block, which is far too coarse to feel live.
      sendOptions.onDelta = ({ update }) => {
        if (!update || update.type !== 'text-delta' || !update.text) {
          return;
        }
        streamedText += update.text;
        try {
          options.onDelta(update.text);
        } catch (_) {
          // A renderer that went away must not abort the run.
        }
      };
    }

    const run = await withTimeout(
      agent.send(buildUserMessage(prompt, options.imageBuffer, options.mimeType, options.images), sendOptions),
      remaining(),
      'send'
    );

    let fullText = '';
    const cancelRun = () => {
      if (run && typeof run.cancel === 'function') {
        Promise.resolve(run.cancel()).catch(() => {});
      }
    };

    if (run && typeof run.wait === 'function' && (typeof run.supports !== 'function' || run.supports('wait'))) {
      const result = await withTimeout(run.wait(), remaining(), 'response', cancelRun);
      if (result && (result.status === 'error' || result.status === 'cancelled')) {
        throw new Error(describeRunFailure(result));
      }
      if (result && typeof result.result === 'string') {
        fullText = result.result;
      }
    } else if (run && typeof run.stream === 'function') {
      for await (const event of run.stream()) {
        fullText += extractAssistantText(event);
      }
    }

    if (!fullText.trim()) {
      fullText = streamedText;
    }

    if (!fullText.trim()) {
      throw new Error('Empty response from Cursor');
    }
    return fullText.trim();
  } catch (error) {
    const failed = warmAgent;
    const reused = !options.isolate && !!failed;
    warmAgent = null;
    warmKey = '';
    if (failed) {
      await disposeAgent(failed);
    }
    if (reused && !options._retried) {
      return completeOnce({ ...options, _retried: true, isolate: true });
    }
    throw error;
  }
}

module.exports = { complete };
