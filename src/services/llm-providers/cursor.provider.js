const fs = require('fs');
const os = require('os');
const path = require('path');

const EMPTY_CWD = path.join(os.tmpdir(), 'opencluely-cursor-empty');

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

async function complete(options) {
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
  const modelId = options.model || 'grok-4.6';
  let agent = null;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd }
    });

    const sendOptions = {};
    if (options.imageBuffer && Buffer.isBuffer(options.imageBuffer)) {
      sendOptions.images = [{
        data: options.imageBuffer.toString('base64'),
        mimeType: options.mimeType || 'image/png'
      }];
    }

    const run = await agent.send(prompt, sendOptions);
    let fullText = '';

    if (run && typeof run.stream === 'function') {
      for await (const event of run.stream()) {
        const piece = extractAssistantText(event);
        if (piece) {
          fullText += piece;
          if (typeof options.onDelta === 'function') {
            options.onDelta(piece);
          }
        }
      }
    }

    if (run && typeof run.wait === 'function') {
      const result = await run.wait();
      if (result && result.status === 'error') {
        throw new Error('Cursor agent run failed');
      }
      if (!fullText.trim() && result && typeof result.result === 'string') {
        fullText = result.result;
      }
    }

    if (!fullText.trim()) {
      throw new Error('Empty response from Cursor');
    }
    return fullText.trim();
  } finally {
    await disposeAgent(agent);
  }
}

module.exports = { complete };
