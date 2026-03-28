/* =============================================================
   QR CODE WRAPPER
   Uses qrcode-generator library for reliable QR encoding.
   ============================================================= */
const QR = {
  generate(text, canvas, size = 180) {
    try {
      const qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const cellSize = Math.floor(size / count);
      const totalSize = cellSize * count;
      canvas.width = totalSize;
      canvas.height = totalSize;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalSize, totalSize);
      ctx.fillStyle = '#1a1a2e';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }
    } catch (e) {
      // Fallback: show URL text if QR fails
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#1a1a2e';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR unavailable', size / 2, size / 2);
    }
  }
};

/* =============================================================
   APP STATE & CONFIG
   ============================================================= */
const PROFANITY = ['fuck','shit','ass','damn','bitch','dick','crap','hell','cunt','piss','bastard','slut','whore'];
const COLORS = [
  '#6c63ff','#8b83ff','#63b4ff','#34d399','#fbbf24','#f87171',
  '#a78bfa','#60a5fa','#4ade80','#f472b6','#fb923c','#38bdf8',
  '#c084fc','#22d3ee','#e879f9','#facc15'
];

let state = {
  roomId: null,
  question: 'What is one word that describes your learning goal today?',
  submissions: [],   // [{word, normalizedWord, timestamp, roomId}]
  locked: false,
  allowDuplicates: false,
  participants: new Set(),
  currentView: 'cloud'
};

let isEditing = false;
let participantSubmissions = []; // Track this participant's submissions
let lastSubmitTime = 0;

/* =============================================================
   STORAGE-BASED REAL-TIME SYNC
   Uses localStorage + storage events for cross-tab communication.
   Replace with WebSocket/Firebase for production multi-device use.
   ============================================================= */
const STORAGE_KEY_PREFIX = 'wc_';

function storageKey(roomId, key) {
  return `${STORAGE_KEY_PREFIX}${roomId}_${key}`;
}

function saveRoomState() {
  if (!state.roomId) return;
  const payload = {
    question: state.question,
    submissions: state.submissions,
    locked: state.locked,
    allowDuplicates: state.allowDuplicates,
    participants: [...state.participants],
    updatedAt: Date.now()
  };
  localStorage.setItem(storageKey(state.roomId, 'state'), JSON.stringify(payload));
}

function loadRoomState(roomId) {
  const raw = localStorage.getItem(storageKey(roomId, 'state'));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

// Listen for cross-tab updates
window.addEventListener('storage', (e) => {
  if (!state.roomId) return;
  const key = storageKey(state.roomId, 'state');
  if (e.key === key && e.newValue) {
    try {
      const data = JSON.parse(e.newValue);
      state.question = data.question;
      state.submissions = data.submissions || [];
      state.locked = data.locked;
      state.allowDuplicates = data.allowDuplicates;
      state.participants = new Set(data.participants || []);
      renderCurrentView();
    } catch {}
  }
});

// BroadcastChannel for same-origin real-time
let bc;
try {
  bc = new BroadcastChannel('wordcloud_sync');
  bc.onmessage = (e) => {
    if (e.data.roomId !== state.roomId) return;
    if (e.data.type === 'state_update') {
      state.question = e.data.state.question;
      state.submissions = e.data.state.submissions || [];
      state.locked = e.data.state.locked;
      state.allowDuplicates = e.data.state.allowDuplicates;
      state.participants = new Set(e.data.state.participants || []);
      renderCurrentView();
    }
  };
} catch {}

function broadcastState() {
  saveRoomState();
  if (bc) {
    bc.postMessage({
      type: 'state_update',
      roomId: state.roomId,
      state: {
        question: state.question,
        submissions: state.submissions,
        locked: state.locked,
        allowDuplicates: state.allowDuplicates,
        participants: [...state.participants]
      }
    });
  }
}

/* =============================================================
   ROOM MANAGEMENT
   ============================================================= */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getParticipantId() {
  let id = sessionStorage.getItem('wc_participant_id');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('wc_participant_id', id);
  }
  return id;
}

function getJoinURL(roomId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', roomId);
  return url.toString();
}

/* =============================================================
   INITIALIZATION & ROUTING
   ============================================================= */
function init() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');

  if (roomParam) {
    initParticipant(roomParam.toUpperCase());
  } else {
    initFacilitator();
  }
}

function initFacilitator() {
  // Check for existing room or create new
  const savedRoom = sessionStorage.getItem('wc_host_room');
  if (savedRoom) {
    const existing = loadRoomState(savedRoom);
    if (existing) {
      state.roomId = savedRoom;
      state.question = existing.question;
      state.submissions = existing.submissions || [];
      state.locked = existing.locked || false;
      state.allowDuplicates = existing.allowDuplicates || false;
      state.participants = new Set(existing.participants || []);
    } else {
      createNewRoom();
    }
  } else {
    createNewRoom();
  }

  document.getElementById('facilitator-view').classList.remove('hidden');
  renderFacilitator();
  // Poll for updates (fallback for storage event edge cases)
  setInterval(pollUpdates, 800);
}

function createNewRoom() {
  state.roomId = generateRoomId();
  state.submissions = [];
  state.locked = false;
  state.participants = new Set();
  sessionStorage.setItem('wc_host_room', state.roomId);
  saveRoomState();
}

function initParticipant(roomId) {
  state.roomId = roomId;
  const existing = loadRoomState(roomId);
  if (existing) {
    state.question = existing.question;
    state.locked = existing.locked;
    state.allowDuplicates = existing.allowDuplicates;
    state.submissions = existing.submissions || [];
  }

  // Register participant
  const pid = getParticipantId();
  state.participants.add(pid);
  broadcastState();

  document.getElementById('participant-view').classList.remove('hidden');
  renderParticipant();

  // Listen for enter key and auto-focus input
  const pInput = document.getElementById('p-input');
  pInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitWord();
  });
  pInput.focus();

  // Poll for question/lock changes
  setInterval(() => {
    const data = loadRoomState(roomId);
    if (data) {
      state.question = data.question;
      state.locked = data.locked;
      state.allowDuplicates = data.allowDuplicates;
      renderParticipant();
    }
  }, 1500);
}

/* =============================================================
   FACILITATOR RENDERING
   ============================================================= */
function renderFacilitator() {
  // Question
  document.getElementById('question-display').textContent = state.question;

  // Stats
  document.getElementById('stat-participants').textContent = state.participants.size;
  document.getElementById('stat-responses').textContent = state.submissions.length;
  const agg = aggregateWords();
  document.getElementById('stat-unique').textContent = agg.length;

  // Lock button
  const lockBtn = document.getElementById('lock-btn');
  lockBtn.textContent = state.locked ? 'Unlock' : 'Lock';
  lockBtn.className = state.locked ? 'btn btn-success' : 'btn btn-ghost';

  // Dupes button
  const dupesBtn = document.getElementById('dupes-btn');
  dupesBtn.textContent = state.allowDuplicates ? 'Dupes: On' : 'Dupes: Off';

  // Room code & QR
  document.getElementById('room-code-display').textContent = state.roomId;
  const joinUrl = getJoinURL(state.roomId);
  document.getElementById('join-url-display').textContent = joinUrl;
  QR.generate(joinUrl, document.getElementById('qr-canvas'), 180);

  renderCurrentView();
}

function renderCurrentView() {
  // Update stats
  document.getElementById('stat-participants').textContent = state.participants.size;
  document.getElementById('stat-responses').textContent = state.submissions.length;
  const agg = aggregateWords();
  document.getElementById('stat-unique').textContent = agg.length;

  // Update question display
  if (!isEditing) {
    document.getElementById('question-display').textContent = state.question;
  }

  // Lock button sync
  const lockBtn = document.getElementById('lock-btn');
  lockBtn.textContent = state.locked ? 'Unlock' : 'Lock';
  lockBtn.className = state.locked ? 'btn btn-success' : 'btn btn-ghost';

  if (state.currentView === 'cloud') {
    document.getElementById('word-cloud').classList.remove('hidden');
    document.getElementById('list-view').classList.add('hidden');
    renderWordCloud();
  } else {
    document.getElementById('word-cloud').classList.add('hidden');
    document.getElementById('list-view').classList.remove('hidden');
    renderListView();
  }
}

function aggregateWords() {
  const counts = {};
  for (const sub of state.submissions) {
    const key = sub.normalizedWord;
    if (!counts[key]) counts[key] = { word: sub.word, normalizedWord: key, count: 0 };
    counts[key].count++;
    // Keep the most common casing
    if (sub.word.length > counts[key].word.length) counts[key].word = sub.word;
  }
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

/* =============================================================
   WORD CLOUD RENDERER
   ============================================================= */
let placedWords = []; // Cache for positions

function renderWordCloud() {
  const container = document.getElementById('word-cloud');
  const empty = document.getElementById('cloud-empty');
  const agg = aggregateWords();

  if (agg.length === 0) {
    empty.classList.remove('hidden');
    // Clear existing words
    container.querySelectorAll('.wc-word').forEach(el => el.remove());
    return;
  }
  empty.classList.add('hidden');

  const rect = container.getBoundingClientRect();
  const W = rect.width || 800;
  const H = rect.height || 500;

  const maxCount = Math.max(...agg.map(w => w.count));
  const minSize = Math.max(14, W * 0.018);
  const maxSize = Math.min(72, W * 0.065);

  // Build or update word elements
  const existing = new Map();
  container.querySelectorAll('.wc-word').forEach(el => {
    existing.set(el.dataset.word, el);
  });

  const toPlace = [];

  agg.forEach((item, idx) => {
    const fontSize = minSize + ((item.count - 1) / Math.max(maxCount - 1, 1)) * (maxSize - minSize);
    const color = COLORS[idx % COLORS.length];

    let el = existing.get(item.normalizedWord);
    if (el) {
      el.style.fontSize = fontSize + 'px';
      el.style.color = color;
      el.textContent = item.word;
      existing.delete(item.normalizedWord);
    } else {
      el = document.createElement('div');
      el.className = 'wc-word';
      el.dataset.word = item.normalizedWord;
      el.textContent = item.word;
      el.style.fontSize = fontSize + 'px';
      el.style.color = color;
      el.title = `${item.word}: ${item.count}`;
      container.appendChild(el);
      // Animate in
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    }

    el.title = `${item.word}: ${item.count}`;
    toPlace.push({ el, fontSize, idx });
  });

  // Remove old words
  existing.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'scale(0.3)';
    setTimeout(() => el.remove(), 400);
  });

  // Position words using spiral placement
  const placed = [];
  const cx = W / 2;
  const cy = H / 2;

  toPlace.forEach(({ el, fontSize, idx }) => {
    // Measure
    el.style.visibility = 'hidden';
    el.style.left = '0px';
    el.style.top = '0px';
    el.classList.add('visible');
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    // Spiral search for position
    let bestX = cx - w / 2;
    let bestY = cy - h / 2;
    let found = false;

    for (let t = 0; t < 600; t++) {
      const angle = t * 0.15;
      const radius = 3 + t * (Math.min(W, H) * 0.0022);
      const x = cx + radius * Math.cos(angle) - w / 2;
      const y = cy + radius * Math.sin(angle) * 0.65 - h / 2;

      // Check bounds
      if (x < 4 || y < 4 || x + w > W - 4 || y + h > H - 4) continue;

      // Check overlap
      let overlaps = false;
      for (const p of placed) {
        if (rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h, 6)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        bestX = x;
        bestY = y;
        found = true;
        break;
      }
    }

    placed.push({ x: bestX, y: bestY, w, h });
    el.style.left = bestX + 'px';
    el.style.top = bestY + 'px';
    el.style.visibility = 'visible';
  });
}

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2, pad = 0) {
  return !(x1 + w1 + pad < x2 || x2 + w2 + pad < x1 || y1 + h1 + pad < y2 || y2 + h2 + pad < y1);
}

/* =============================================================
   LIST VIEW RENDERER
   ============================================================= */
function renderListView() {
  const container = document.getElementById('list-view');
  const agg = aggregateWords();
  container.innerHTML = agg.map(item => `
    <div class="f-list-item">
      <span class="word">${escapeHTML(item.word)}</span>
      <span class="count">${item.count}</span>
    </div>
  `).join('') || '<div style="color:var(--text-muted);padding:20px;text-align:center">No submissions yet</div>';
}

/* =============================================================
   PARTICIPANT RENDERING
   ============================================================= */
function renderParticipant() {
  document.getElementById('p-question').textContent = state.question;

  const form = document.getElementById('p-form');
  const lockedMsg = document.getElementById('p-locked-msg');

  if (state.locked) {
    form.classList.add('hidden');
    lockedMsg.classList.remove('hidden');
  } else {
    form.classList.remove('hidden');
    lockedMsg.classList.add('hidden');
  }

  // Render submission history
  const historyEl = document.getElementById('p-history');
  historyEl.innerHTML = participantSubmissions.map(w =>
    `<span class="p-history-tag">${escapeHTML(w)}</span>`
  ).join('');
}

/* =============================================================
   SUBMISSION HANDLING
   ============================================================= */
function submitWord() {
  const input = document.getElementById('p-input');
  const feedback = document.getElementById('p-feedback');
  let word = input.value.trim();

  // Validation
  if (!word) return showFeedback('Please enter a word', 'error');
  if (word.split(/\s+/).length > 3) return showFeedback('Please use 1-3 words only', 'error');
  if (word.length > 40) return showFeedback('Too long! Keep it brief', 'error');

  // Rate limiting (3 seconds between submissions)
  const now = Date.now();
  if (now - lastSubmitTime < 3000) return showFeedback('Slow down! Wait a moment...', 'error');

  // Profanity check
  const normalized = word.toLowerCase().trim();
  if (PROFANITY.some(p => normalized.includes(p))) {
    return showFeedback('Please keep it appropriate', 'error');
  }

  // Check for locked state
  if (state.locked) return showFeedback('Submissions are closed', 'info');

  // Check duplicates from this participant
  if (!state.allowDuplicates && participantSubmissions.some(w => w.toLowerCase() === normalized)) {
    return showFeedback('You already submitted that word', 'info');
  }

  // Reload latest state to merge
  const latest = loadRoomState(state.roomId);
  if (latest) {
    state.submissions = latest.submissions || [];
    state.participants = new Set(latest.participants || []);
  }

  // Add submission
  const submission = {
    word: word,
    normalizedWord: normalized,
    timestamp: Date.now(),
    roomId: state.roomId,
    participantId: getParticipantId()
  };

  state.submissions.push(submission);
  state.participants.add(getParticipantId());
  participantSubmissions.push(word);
  lastSubmitTime = now;

  broadcastState();

  // UI feedback
  input.value = '';
  input.focus();
  showFeedback('Your answer has been added!', 'success');
  renderParticipant();
}

function showFeedback(msg, type) {
  const el = document.getElementById('p-feedback');
  el.textContent = msg;
  el.className = `p-feedback ${type}`;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

/* =============================================================
   FACILITATOR CONTROLS
   ============================================================= */
function startEditQuestion() {
  document.getElementById('modal-q-input').value = state.question;
  document.getElementById('modal-question').classList.remove('hidden');
  document.getElementById('modal-q-input').focus();
  document.getElementById('modal-q-input').addEventListener('keydown', function handler(e) {
    if (e.key === 'Enter') { saveQuestion(); e.target.removeEventListener('keydown', handler); }
    if (e.key === 'Escape') { closeModal('modal-question'); e.target.removeEventListener('keydown', handler); }
  });
}

function saveQuestion() {
  const val = document.getElementById('modal-q-input').value.trim();
  if (val) {
    state.question = val;
    broadcastState();
    renderFacilitator();
  }
  closeModal('modal-question');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function newSession() {
  if (!confirm('Start a new session? This will clear all current submissions.')) return;
  createNewRoom();
  renderFacilitator();
  toast('New session created!');
}

function clearSubmissions() {
  if (!confirm('Clear all submissions?')) return;
  state.submissions = [];
  broadcastState();
  renderCurrentView();
  toast('Submissions cleared');
}

function toggleLock() {
  state.locked = !state.locked;
  broadcastState();
  renderCurrentView();
  toast(state.locked ? 'Submissions locked' : 'Submissions unlocked');
}

function toggleDuplicates() {
  state.allowDuplicates = !state.allowDuplicates;
  broadcastState();
  renderCurrentView();
  const btn = document.getElementById('dupes-btn');
  btn.textContent = state.allowDuplicates ? 'Dupes: On' : 'Dupes: Off';
  toast(state.allowDuplicates ? 'Duplicate words enabled' : 'Duplicate words disabled');
}

function setView(view) {
  state.currentView = view;
  document.getElementById('view-cloud-btn').classList.toggle('active', view === 'cloud');
  document.getElementById('view-list-btn').classList.toggle('active', view === 'list');
  renderCurrentView();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    document.body.classList.add('fullscreen-active');
  } else {
    document.exitFullscreen();
    document.body.classList.remove('fullscreen-active');
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('fullscreen-active');
});

function exportPNG() {
  const container = document.getElementById('cloud-container');
  // Use canvas to capture
  const canvas = document.createElement('canvas');
  const rect = container.getBoundingClientRect();
  const scale = 2;
  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Draw background
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Draw words
  const words = container.querySelectorAll('.wc-word');
  words.forEach(el => {
    const style = getComputedStyle(el);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    const x = parseFloat(el.style.left) || 0;
    const y = (parseFloat(el.style.top) || 0) + parseFloat(style.fontSize);
    ctx.fillText(el.textContent, x, y);
  });

  // Download
  const link = document.createElement('a');
  link.download = `wordcloud-${state.roomId}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('Word cloud exported!');
}

/* =============================================================
   POLLING FALLBACK
   ============================================================= */
function pollUpdates() {
  if (!state.roomId) return;
  const data = loadRoomState(state.roomId);
  if (!data) return;

  const changed = data.submissions?.length !== state.submissions.length ||
                  data.locked !== state.locked ||
                  data.question !== state.question;

  if (changed) {
    state.question = data.question;
    state.submissions = data.submissions || [];
    state.locked = data.locked;
    state.allowDuplicates = data.allowDuplicates;
    state.participants = new Set(data.participants || []);
    renderCurrentView();
  }
}

/* =============================================================
   HELPERS
   ============================================================= */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast glass';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* =============================================================
   DEMO MODE — Preload sample words if desired
   ============================================================= */
function loadDemoData() {
  const demoWords = [
    'creativity','collaboration','innovation','growth','AI',
    'learning','teamwork','creativity','data','design',
    'leadership','AI','empathy','growth','coding',
    'strategy','innovation','learning','curiosity','growth',
    'resilience','AI','creativity','design','focus'
  ];
  demoWords.forEach((word, i) => {
    state.submissions.push({
      word,
      normalizedWord: word.toLowerCase(),
      timestamp: Date.now() - (demoWords.length - i) * 1000,
      roomId: state.roomId,
      participantId: 'demo_' + i
    });
  });
  state.participants = new Set(Array.from({length: 12}, (_, i) => 'demo_' + i));
  broadcastState();
}

/* =============================================================
   LOAD DEMO — Exposes loadDemoData to UI
   ============================================================= */
function loadDemo() {
  if (state.submissions.length > 0 && !confirm('This will add demo words to existing submissions. Continue?')) return;
  loadDemoData();
  renderFacilitator();
  toast('Demo data loaded!');
}

/* =============================================================
   COPY HELPERS
   ============================================================= */
function copyJoinURL() {
  const url = getJoinURL(state.roomId);
  navigator.clipboard.writeText(url).then(() => toast('Join URL copied!')).catch(() => {});
}

function copyRoomCode() {
  navigator.clipboard.writeText(state.roomId).then(() => toast('Room code copied!')).catch(() => {});
}

/* =============================================================
   RESIZE HANDLER — Debounced re-render of word cloud
   ============================================================= */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentView === 'cloud' && document.getElementById('facilitator-view') && !document.getElementById('facilitator-view').classList.contains('hidden')) {
      renderWordCloud();
    }
  }, 300);
});

// Click handler for modal overlay background
document.getElementById('modal-question').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal('modal-question');
});

/* ===== BOOT ===== */
init();
