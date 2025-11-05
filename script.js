// ================== CHAT TOGGLE (yours) ==================
const chatbotToggleBtn = document.getElementById('chatbotToggleBtn');
const chatbotPanel = document.getElementById('chatbotPanel');

if (chatbotToggleBtn && chatbotPanel) {
  chatbotToggleBtn.addEventListener('click', () => {
    chatbotPanel.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (chatbotPanel.classList.contains('open') &&
        !chatbotPanel.contains(e.target) &&
        !chatbotToggleBtn.contains(e.target)) {
      chatbotPanel.classList.remove('open');
    }
  });
}

// ================== STATUS BANNER ==================
function showStatus(msg, isError = false) {
  let el = document.getElementById('chatStatus');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chatStatus';
    el.style.cssText = 'font: 12px/1.4 system-ui; padding:6px 8px; border-bottom:1px solid #eee;';
    chatbotPanel?.prepend(el);
  }
  el.textContent = msg;
  el.style.color = isError ? '#b91c1c' : '#374151';
}

// ================== CHAT ELEMENTS ==================
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const tempSlider = document.getElementById('tempSlider');
const maxTokensInput = document.getElementById('maxTokens');

// reflect slider value next to control
const tempValueEl = document.getElementById('tempValue');
if (tempSlider && tempValueEl) {
  tempValueEl.textContent = parseFloat(tempSlider.value).toFixed(2);
  tempSlider.addEventListener('input', () => {
    tempValueEl.textContent = parseFloat(tempSlider.value).toFixed(2);
  });
}

// ================== FORMAT ASSISTANT ==================
function formatAssistant(text) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;');

  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  const labeled = blocks.map(b => {
    const m = b.match(/^([A-Za-z ]{3,20}):\s*(.*)$/s);
    if (!m) return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
    const label = esc(m[1].trim());
    const rest  = esc(m[2].trim()).replace(/\n/g, '<br>');
    return `<div class="section">
      <div class="section-label">${label}</div>
      <div class="section-body">${rest}</div>
    </div>`;
  });

  return labeled.join('\n');
}

function appendMessage(sender, content, { html = false } = {}) {
  const container = document.createElement('div');
  container.className = `message ${sender}`;

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = sender === 'user' ? 'You:' : 'WayChat:';

  const body = document.createElement('div');
  body.className = 'message-body';
  if (html) body.innerHTML = content; else body.innerText = content;

  container.appendChild(label);
  container.appendChild(body);
  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const container = document.createElement('div');
  container.className = 'message assistant typing';

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = 'WayChat:';

  const body = document.createElement('div');
  body.className = 'message-body';

  container.appendChild(label);
  container.appendChild(body);
  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return container; // return node so we can remove/replace it
}

// ================== API KEY GUARD ==================
// Prefer window.OPENAI_API_KEY; fall back to a global OPENAI_API_KEY if present in secrets.js
const OPENAI_KEY = (typeof window !== 'undefined' && window.OPENAI_API_KEY)
  ? window.OPENAI_API_KEY
  : (typeof OPENAI_API_KEY !== 'undefined' ? OPENAI_API_KEY : '');
if (!OPENAI_KEY) {
  showStatus('OPENAI_API_KEY is missing. Make sure secrets.js sets window.OPENAI_API_KEY or OPENAI_API_KEY.', true);
  console.warn('OPENAI_API_KEY is missing. Define in secrets.js as window.OPENAI_API_KEY = "..." or export a global OPENAI_API_KEY.');
}

// ================== CONVERSATION MEMORY ==================
const STORAGE_KEY = 'chat_history_v1';
const DEFAULT_HISTORY = [
  {
    role: 'system',
    content: `You are WayChat, Waymark’s friendly creative assistant.

Waymark is a video ad creation platform that helps people turn ideas, products, or messages into high-quality, ready-to-run videos. The platform is used by small businesses, agencies, and marketers to create broadcast-   ads with minimal friction.

Your job is to help users shape raw input — whether it’s a business name, a tagline, a product, a vibe, or a rough idea — into a short-form video concept.

Your responses may include suggested video structures, voiceover lines, tone and visual direction, music suggestions, and clarifying follow-up questions.

If the user's input is unclear, ask 1–2 short questions to help sharpen the direction before offering creative suggestions.

Only respond to questions related to Waymark, its tools, its platform, or the creative process of making short-form video ads. If a question is unrelated, politely explain that you're focused on helping users create video ads with Waymark.

Keep your replies concise, collaborative, and focused on helping users express their message clearly. Always align with modern marketing best practices — and stay supportive and friendly.`
  }
];

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_HISTORY];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.warn('Could not parse chat history from localStorage:', e);
  }
  return [...DEFAULT_HISTORY];
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('Could not save chat history:', e);
  }
}

let messages = loadHistory();

function renderHistoryForUI() {
  messages.forEach(m => {
    if (m.role === 'user') appendMessage('user', m.content);
    if (m.role === 'assistant') appendMessage('assistant', formatAssistant(m.content), { html: true });
  });
}
renderHistoryForUI();

// ================== SUBMIT HANDLER ==================
if (chatForm) {
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = (chatInput.value || '').trim();
    if (!userMessage) return;

    appendMessage('user', userMessage);
    messages.push({ role: 'user', content: userMessage });
    saveHistory(messages);

    const typingNode = showTyping();
    showStatus('Sending to OpenAI…');

    try {
      const MODEL = 'gpt-4o-mini';
      const TEMPERATURE = tempSlider ? parseFloat(tempSlider.value) : 0.8;
      const MAX_TOKENS = maxTokensInput ? parseInt(maxTokensInput.value, 10) : 800;

      const body = {
        model: MODEL,
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS
      };

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        mode: 'cors', // important when running locally
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (!resp.ok) {
        console.error('OpenAI error payload:', data);
        if (resp.status === 401) {
          showStatus('Auth error (401). Check your API key in secrets.js.', true);
        } else if (resp.status === 429) {
          showStatus('Rate limited (429). Try again in a bit.', true);
        } else if (resp.status === 0 || String(data?.error?.message || '').toLowerCase().includes('cors')) {
          showStatus('CORS/network error. Serve the site over http(s), not file://', true);
        } else {
          showStatus(`API error: ${data?.error?.message || resp.statusText}`, true);
        }
        throw new Error(data?.error?.message || `HTTP ${resp.status} ${resp.statusText}`);
      }

      const assistantReply = data?.choices?.[0]?.message?.content?.trim() || 'I could not generate a response.';
      if (typingNode && typingNode.parentNode) typingNode.remove();
      appendMessage('assistant', formatAssistant(assistantReply), { html: true });

      messages.push({ role: 'assistant', content: assistantReply });
      const SYSTEM = messages[0]?.role === 'system' ? [messages[0]] : [];
      const recent = messages.slice(-20);
      messages = SYSTEM.concat(recent);
      saveHistory(messages);

      showStatus('Ready');
    } catch (err) {
      if (typingNode && typingNode.parentNode) typingNode.remove();
      console.error('OpenAI request failed:', err);
      appendMessage('assistant', `Error: ${err.message || 'Failed to reach the AI.'}`);
    } finally {
      chatInput.value = '';
      chatInput.focus();
    }
  });
}

// ================== ENTER TO SEND ==================
if (chatInput && chatForm) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });
}
