const messagesEl = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const modelSel = document.getElementById('model');
const sessionsEl = document.getElementById('sessions');
const newChatBtn = document.getElementById('new-chat');
const toggleSystemBtn = document.getElementById('toggle-system');
const systemWrap = document.getElementById('system-wrap');
const systemPromptEl = document.getElementById('system-prompt');
const tokenOverlay = document.getElementById('token-overlay');
const tokenInput = document.getElementById('token-input');
const tokenSaveBtn = document.getElementById('token-save');

let history = [];
let sessionId = null;
let streaming = false;
let models = [];
let defaultModel = 'mistral-small-latest';

function token() {
  return localStorage.getItem('accessToken') || '';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'x-access-token': token(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    tokenOverlay.classList.remove('hidden');
    throw new Error('Требуется токен доступа');
  }
  return res;
}

tokenSaveBtn.addEventListener('click', () => {
  localStorage.setItem('accessToken', tokenInput.value.trim());
  tokenOverlay.classList.add('hidden');
  init();
});

toggleSystemBtn.addEventListener('click', () => systemWrap.classList.toggle('hidden'));
newChatBtn.addEventListener('click', () => {
  sessionId = null;
  history = [];
  renderMessages();
  renderSessions();
  input.focus();
});

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function renderMessages() {
  messagesEl.innerHTML = '';
  for (const m of history) addMessage(m.role, m.content);
}

async function renderSessions() {
  sessionsEl.innerHTML = '';
  let list = [];
  try {
    list = await (await api('/api/sessions')).json();
  } catch {
    return;
  }
  for (const s of list) {
    const div = document.createElement('div');
    div.className = 'session' + (s.id === sessionId ? ' active' : '');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = s.title;
    title.title = s.title;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api('/api/sessions/' + s.id, { method: 'DELETE' });
      if (s.id === sessionId) {
        sessionId = null;
        history = [];
        renderMessages();
      }
      renderSessions();
    });
    div.appendChild(title);
    div.appendChild(del);
    div.addEventListener('click', async () => {
      const sess = await (await api('/api/sessions/' + s.id)).json();
      sessionId = sess.id;
      history = sess.messages;
      modelSel.value = sess.model;
      renderMessages();
      renderSessions();
    });
    sessionsEl.appendChild(div);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (streaming) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  streaming = true;
  sendBtn.disabled = true;

  const sys = systemPromptEl.value.trim();
  const toSend = (sys ? [{ role: 'system', content: sys }] : []).concat(history, [{ role: 'user', content: text }]);
  addMessage('user', text);
  history.push({ role: 'user', content: text });
  const bubble = addMessage('assistant', '');

  try {
    const res = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, model: modelSel.value, messages: toSend }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error([data.error, data.status && 'статус ' + data.status, data.detail].filter(Boolean).join(' — ') || 'Ошибка сервера');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        let data;
        try { data = JSON.parse(payload); } catch { continue; }
        if (data.delta) {
          full += data.delta;
          bubble.textContent = full;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        if (data.error) {
          bubble.className = 'msg error';
          bubble.textContent = 'Ошибка: ' + [data.error, data.status && 'статус ' + data.status, data.detail].filter(Boolean).join(' — ');
          history.pop();
        }
        if (data.sessionId) sessionId = data.sessionId;
      }
    }
    if (full) history.push({ role: 'assistant', content: full });
    await renderSessions();
  } catch (err) {
    bubble.className = 'msg error';
    bubble.textContent = 'Ошибка: ' + err.message;
    history.pop();
  } finally {
    streaming = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

async function init() {
  try {
    const cfg = await (await api('/api/config')).json();
    models = cfg.models;
    defaultModel = cfg.defaultModel;
    modelSel.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSel.appendChild(opt);
    }
    modelSel.value = defaultModel;
    if (cfg.authRequired && !token()) tokenOverlay.classList.remove('hidden');
    renderSessions();
  } catch {
    tokenOverlay.classList.remove('hidden');
  }
}

init();
