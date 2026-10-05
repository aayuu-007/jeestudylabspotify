const KEY = 'jsl_spotify_listen_v1';
const MAX_GAP = 120_000; // laptop sleep / tab throttling se overcount rokne ke liye

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r && r.date === dayKey()) return r;
  } catch {}
  return { date: dayKey(), ms: 0 };
}

let data = load();
let playing = false;
let lastTick = 0;
let lastSave = 0;
let timer = null;

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
const emit = () => window.dispatchEvent(new CustomEvent('spotify:listen', { detail: { ms: data.ms } }));

function tick() {
  const now = Date.now();
  if (data.date !== dayKey()) data = { date: dayKey(), ms: 0 }; // naya din
  if (playing) data.ms += Math.min(now - lastTick, MAX_GAP);
  lastTick = now;
  if (now - lastSave > 5000) { save(); lastSave = now; }
  emit();
}

function setPlaying(next) {
  if (next === playing) return;
  tick();                 // pehle purana segment flush karo
  playing = next;
  lastTick = Date.now();
  if (playing && !timer) timer = setInterval(tick, 1000);
  if (!playing && timer) { clearInterval(timer); timer = null; save(); }
}

export function onPlayerState(state) {
  setPlaying(!!state && !state.paused);
}
export const stopListenTracking = () => setPlaying(false);

export const getListenMs = () => (data.date === dayKey() ? data.ms : 0);

export function formatListen(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}hr ${m}m` : `${m}m`;
}

window.addEventListener('pagehide', () => { tick(); save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { tick(); save(); } });
window.jslListen = { getMs: getListenMs, format: formatListen };
