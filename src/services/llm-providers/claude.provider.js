const https = require('https');

function normalizeMessages(messages) {
  const out = [];
  for (const item of messages || []) {
    if (!item || typeof item.content !== 'string' || !item.content.trim()) {
      continue;
    }
    const role = item.role === 'assistant' ? 'assistant' : 'user';
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].content += `\n\n${item.content.trim()}`;
    } else {
      out.push({ role, content: item.content.trim() });
    }
  }
  while (out.length && out[0].role !== 'user') {
    out.shift();
  }
  return out;
}

function attachImage(messages, imageBuffer, mimeType) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || !messages.length) {
    return messages;
  }
  const last = messages[messages.length - 1];
  if (last.role !== 'user') {
    return messages;
  }
  last.content = [
    { type: 'text', text: last.content },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType || 'image/png',
        data: imageBuffer.toString('base64')
      }
    }
  ];
  return messages;
}

function extractDeltaText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  if (payload.type === 'content_block_delta' && payload.delta && typeof payload.delta.text === 'string') {
    return payload.delta.text;
  }
  if (payload.delta && typeof payload.delta.text === 'string') {
    return payload.delta.text;
  }
  return '';
}

function extractCompleteText(body) {
  if (typeof body === 'string' && body.trim()) {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return body.trim();
    }
  }
  const parts = Array.isArray(body?.content) ? body.content : [];
  const text = parts
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (!text.trim()) {
    throw new Error(body?.error?.message || 'Empty response from Claude API');
  }
  return text.trim();
}

function requestClaude({ apiKey, model, system, messages, imageBuffer, mimeType, onDelta, timeout }) {
  const normalized = attachImage(normalizeMessages(messages), imageBuffer, mimeType);
  if (!normalized.length) {
    throw new Error('No user content to send to Claude');
  }

  const stream = typeof onDelta === 'function';
  const body = {
    model,
    max_tokens: 4096,
    messages: normalized,
    stream
  };
  if (system && String(system).trim()) {
    body.system = String(system).trim();
  }

  const postData = JSON.stringify(body);
  const options = {
    method: 'POST',
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: timeout || 30000
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', (chunk) => { errBody += chunk; });
        res.on('end', () => {
          let message = `HTTP ${res.statusCode}: ${errBody}`;
          try {
            const parsed = JSON.parse(errBody);
            if (parsed?.error?.message) {
              message = parsed.error.message;
            }
          } catch (_) { /* keep raw */ }
          finish(reject, new Error(message));
        });
        return;
      }

      if (!stream) {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            finish(resolve, extractCompleteText(raw));
          } catch (error) {
            finish(reject, error);
          }
        });
        res.on('error', (error) => finish(reject, new Error(`Claude response error: ${error.message}`)));
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
            if (json.type === 'error') {
              throw new Error(json.error?.message || 'Claude stream error');
            }
            const piece = extractDeltaText(json);
            if (piece) {
              fullText += piece;
              onDelta(piece);
            }
          } catch (error) {
            if (error.message && !error.message.includes('Unexpected')) {
              finish(reject, error);
            }
          }
        }
      });
      res.on('end', () => {
        if (!fullText.trim()) {
          finish(reject, new Error('Empty streamed response from Claude API'));
          return;
        }
        finish(resolve, fullText.trim());
      });
      res.on('error', (error) => finish(reject, new Error(`Claude stream error: ${error.message}`)));
    });

    req.on('error', (error) => finish(reject, new Error(`Claude request failed: ${error.message}`)));
    req.on('timeout', () => {
      req.destroy();
      finish(reject, new Error('Claude request timeout'));
    });
    req.write(postData);
    req.end();
  });
}

async function complete(options) {
  const apiKey = (options.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('Claude API key is not configured');
  }
  return requestClaude({
    apiKey,
    model: options.model || 'claude-opus-5',
    system: options.system || '',
    messages: options.messages || [],
    imageBuffer: options.imageBuffer || null,
    mimeType: options.mimeType || 'image/png',
    onDelta: options.onDelta,
    timeout: options.timeout
  });
}

module.exports = { complete };
