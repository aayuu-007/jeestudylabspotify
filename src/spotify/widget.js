import './widget.css';
import * as sp from './spotify.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const svg = (d, x = '') => `<svg viewBox="0 0 24 24" ${x}>${d}</svg>`;
const ST = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const I = {
  sp: svg('<path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z"/>'),
  play: svg('<path fill="currentColor" d="M8 5.5v13l11-6.5z"/>'),
  pause: svg('<path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'),
  next: svg('<path fill="currentColor" d="M6 6l9 6-9 6zM17 6h2.2v12H17z"/>'),
  prev: svg('<path fill="currentColor" d="M18 6l-9 6 9 6zM5 6h2.2v12H5z"/>'),
  shuf: svg('<path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21M3 17h3.5c1.3 0 2.3-.4 3.1-1.2M13.4 8.3c.9-.8 1.9-1.3 3.4-1.3H21M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>', ST),
  chev: svg('<path d="M6 9l6 6 6-6"/>', ST),
  vol: svg('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9a4.2 4.2 0 010 6"/>', ST),
};
const EQ = '<b></b><b></b><b></b>';

const S = { pl: [], q: '', dev: null, st: null, ctx: '', pos: 0, at: 0, shuf: false };
let player = null, noteT = 0;

/* ---------- shell ---------- */
const root = document.createElement('div');
root.id = 'sp'; root.className = 'sp'; root.dataset.open = localStorage.getItem('sp-open') === '1' ? '1' : '0';
root.innerHTML = `
<button class="sp-fab" id="spF" type="button" aria-label="Spotify" aria-expanded="false">
  <span class="sp-disc"><i class="sp-ic">${I.sp}</i><img alt="" hidden></span><span class="sp-eq">${EQ}</span>
</button>
<section class="sp-card" role="dialog" aria-label="Spotify player">
  <header class="sp-h"><i class="sp-logo">${I.sp}</i><b>Spotify</b><span class="sp-u" id="spU"></span>
    <button class="sp-min" id="spM" type="button" aria-label="Minimise">${I.chev}</button></header>
  <div class="sp-b" id="spB"></div><div class="sp-note" id="spNote" role="status"></div>
</section>`;
document.body.appendChild(root);

const setOpen = (o) => {
  root.dataset.open = o ? '1' : '0';
  $('#spF').setAttribute('aria-expanded', String(o));
  localStorage.setItem('sp-open', o ? '1' : '0');
  if (o) accent();
};
$('#spF').onclick = () => setOpen(root.dataset.open !== '1');
$('#spM').onclick = () => setOpen(false);
root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); $('#spF').focus(); } });
setOpen(root.dataset.open === '1');

const note = (msg) => {
  const n = $('#spNote'); n.textContent = msg; n.classList.add('on');
  clearTimeout(noteT); noteT = setTimeout(() => n.classList.remove('on'), 4200);
};

/* ---------- follow the app theme (page accent, or Tasks hub theme when it is open) ---------- */
const hub = document.getElementById('hub');
function accent() {
  let acc = '#8fa6ff', ar = '143,166,255';
  const rt = hub && hub.shadowRoot && hub.shadowRoot.querySelector('.root');
  if (rt && !hub.hidden) {
    const cs = getComputedStyle(rt);
    acc = cs.getPropertyValue('--acc').trim() || acc;
    ar = cs.getPropertyValue('--ar').trim() || ar;
  }
  root.style.setProperty('--sp-acc', acc);
  root.style.setProperty('--sp-ar', ar);
}
try {
  const mo = new MutationObserver(accent);
  if (hub) mo.observe(hub, { attributes: true, attributeFilter: ['hidden', 'class'] });
  const rt = hub && hub.shadowRoot && hub.shadowRoot.querySelector('.root');
  if (rt) mo.observe(rt, { attributes: true, attributeFilter: ['data-t'] });
} catch {}
accent();

/* ---------- views ---------- */
async function connect() {
  try { await sp.login(); } catch (e) { note(e.message || 'Could not start Spotify login'); }
}

// Header is ALWAYS filled: profile + Log out when we have a user, otherwise a Connect button
function renderHeader(me) {
  const u = $('#spU');
  if (me) {
    const av = me.images && me.images[0];
    u.innerHTML = `${av ? `<img alt="" src="${esc(av.url)}">` : ''}<span>${esc(me.display_name || me.id)}</span><button type="button" id="spOut">Log out</button>`;
    $('#spOut').onclick = signOut;
  } else {
    u.innerHTML = `<button type="button" id="spHc">Connect</button>`;
    $('#spHc').onclick = connect;
  }
}

function viewLogin(msg) {
  renderHeader(null);
  const text = !sp.hasClientId
    ? 'Spotify Client ID is missing. Add <code>VITE_SPOTIFY_CLIENT_ID</code> in Netlify and redeploy.'
    : msg || 'Connect Spotify to browse your playlists and control music without leaving your plan.';
  $('#spB').innerHTML = `<div class="sp-hero"><div class="sp-orb"><s></s><s></s><s></s><i>${I.sp}</i></div>
    <h3>Study. Focus. Play.</h3><p>${text}</p>
    <button class="sp-cta" id="spLogin" type="button">Connect to Spotify</button>
    <small>In-browser playback needs Spotify Premium</small></div>`;
  $('#spLogin').onclick = connect;
}

function viewApp() {
  $('#spB').dataset.tab = 'np';
  $('#spB').innerHTML = `
  <nav class="sp-tabs"><i></i><button type="button" data-t="np" class="on">Now Playing</button><button type="button" data-t="pl">Playlists <em id="spN"></em></button></nav>
  <div class="sp-pane" data-p="np">
    <div class="sp-art"><img id="spA" alt="" hidden><span class="sp-ph">${I.sp}</span></div>
    <div class="sp-meta"><b id="spT">Nothing playing</b><span id="spAr">Pick a playlist to start</span></div>
    <div class="sp-seek" id="spSeek"><div class="sp-bar"><i id="spFill"></i></div></div>
    <div class="sp-tm"><span id="spCur">0:00</span><span id="spDur">0:00</span></div>
    <div class="sp-ctl">
      <button type="button" id="spSh" aria-label="Shuffle">${I.shuf}</button>
      <button type="button" id="spPv" aria-label="Previous">${I.prev}</button>
      <button type="button" class="sp-pp" id="spPP" aria-label="Play / pause">${I.play}</button>
      <button type="button" id="spNx" aria-label="Next">${I.next}</button>
      <button type="button" id="spVb" aria-label="Volume">${I.vol}</button>
    </div>
    <div class="sp-vol" id="spVw" hidden><input id="spV" type="range" min="0" max="100" value="60" aria-label="Volume"></div>
  </div>
  <div class="sp-pane" data-p="pl" hidden>
    <input class="sp-q" id="spQ" type="search" placeholder="Search your playlists…" autocomplete="off">
    <ul class="sp-list" id="spLs"><li class="sp-empty">Loading playlists…</li></ul>
  </div>`;

  document.querySelectorAll('.sp-tabs button').forEach((b) => (b.onclick = () => tab(b.dataset.t)));
  $('#spPP').onclick = () => {
    if (!player) return note('Player is still starting…');
    player.activateElement && player.activateElement();
    if (!S.st) { tab('pl'); return note('Pick a playlist first'); }
    player.togglePlay();
  };
  $('#spNx').onclick = () => player && player.nextTrack();
  $('#spPv').onclick = () => player && player.previousTrack();
  $('#spSh').onclick = async () => {
    S.shuf = !S.shuf; $('#spSh').classList.toggle('on', S.shuf);
    try { await sp.api('/me/player/shuffle?state=' + S.shuf + (S.dev ? '&device_id=' + S.dev : ''), { method: 'PUT' }); } catch { note('Start playback first'); }
  };
  $('#spVb').onclick = () => { const w = $('#spVw'); w.hidden = !w.hidden; $('#spVb').classList.toggle('on', !w.hidden); };
  $('#spV').oninput = (e) => player && player.setVolume(e.target.value / 100);
  $('#spSeek').onclick = (e) => {
    if (!S.st || !player) return;
    const r = e.currentTarget.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ms = f * S.st.duration; player.seek(ms); S.pos = ms; S.at = performance.now();
  };
  $('#spQ').oninput = (e) => { S.q = e.target.value; renderList(false); };
  $('#spLs').onclick = (e) => { const b = e.target.closest('button[data-u]'); if (b) playContext(b.dataset.u); };
}

function tab(t) {
  $('#spB').dataset.tab = t;
  document.querySelectorAll('.sp-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.sp-pane').forEach((p) => (p.hidden = p.dataset.p !== t));
}

function renderList() {
  const q = S.q.toLowerCase(), list = S.pl.filter((p) => p.name.toLowerCase().includes(q));
  $('#spN').textContent = S.pl.length || '';
  $('#spLs').innerHTML = list.map((p, i) => {
    const total = (p.items && p.items.total) ?? (p.tracks && p.tracks.total);
    const sub = [total != null ? total + ' tracks' : '', p.owner && p.owner.display_name].filter(Boolean).join(' · ');
    const img = p.images && p.images[0];
    return `<li style="--i:${Math.min(i, 14)}"><button type="button" data-u="${esc(p.uri)}" class="${p.uri === S.ctx ? 'on' : ''}">
      <span class="sp-cv">${img ? `<img loading="lazy" alt="" src="${esc(img.url)}">` : I.sp}</span>
      <span class="sp-pn"><b>${esc(p.name)}</b><small>${esc(sub)}</small></span><span class="sp-eq2">${EQ}</span></button></li>`;
  }).join('') || '<li class="sp-empty">No playlists found</li>';
}

/* ---------- playback ---------- */
async function playContext(uri) {
  if (player && player.activateElement) player.activateElement();
  try {
    await sp.api('/me/player/play' + (S.dev ? '?device_id=' + S.dev : ''), { method: 'PUT', body: { context_uri: uri } });
    tab('np');
  } catch (e) {
    if (e.status === 401) return signOut();
    note(e.status === 403 ? 'Spotify Premium is required to play' : e.status === 404 ? 'Player not ready yet, try again' : 'Could not start playback');
  }
}

function onState(st) {
  S.st = st;
  const has = !!st, t = has && st.track_window.current_track;
  root.dataset.play = has && !st.paused ? '1' : '0';
  if (!has) return;
  S.pos = st.position; S.at = performance.now(); S.ctx = (st.context && st.context.uri) || '';
  const art = t.album.images[0] && t.album.images[0].url;
  $('#spT').textContent = t.name; $('#spAr').textContent = t.artists.map((a) => a.name).join(', ');
  $('#spDur').textContent = fmt(st.duration);
  $('#spPP').innerHTML = st.paused ? I.play : I.pause;
  S.shuf = st.shuffle; $('#spSh').classList.toggle('on', S.shuf);
  for (const img of [$('#spA'), $('.sp-disc img')]) { if (art) { img.src = art; img.hidden = false; } }
  root.dataset.art = art ? '1' : '0';
  $('.sp-art').classList.toggle('has', !!art);
  document.querySelectorAll('.sp-list button').forEach((b) => b.classList.toggle('on', b.dataset.u === S.ctx));
}

setInterval(() => {
  if (root.dataset.open !== '1' || !S.st) return;
  const dur = S.st.duration, p = Math.min(dur, S.st.paused ? S.pos : S.pos + performance.now() - S.at);
  const f = $('#spFill'); if (!f) return;
  f.style.transform = `scaleX(${dur ? p / dur : 0})`;
  $('#spCur').textContent = fmt(p);
}, 250);

function initPlayer() {
  if (player || window.__spSdkLoading) return;
  window.__spSdkLoading = true;
  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new window.Spotify.Player({
      name: 'JEE Study Lab',
      getOAuthToken: (cb) => sp.getToken().then(cb).catch(() => signOut()),
      volume: 0.6,
    });
    player.addListener('ready', async ({ device_id }) => {
      S.dev = device_id;
      try { await sp.api('/me/player', { method: 'PUT', body: { device_ids: [device_id], play: false } }); } catch {}
    });
    player.addListener('player_state_changed', onState);
    player.addListener('authentication_error', signOut);
    player.addListener('account_error', () => note('Spotify Premium is required for in-browser playback'));
    player.addListener('initialization_error', () => note('This browser does not support the Spotify player'));
    player.connect();
  };
  const s = document.createElement('script');
  s.src = 'https://sdk.scdn.co/spotify-player.js'; s.async = true;
  s.onerror = () => { window.__spSdkLoading = false; note('Could not load the Spotify player'); };
  document.head.appendChild(s);
}

// Always ends on the Connect view
function signOut() {
  sp.logout();
  try { if (player) player.disconnect(); } catch {}
  player = null; S.st = null; S.pl = []; S.dev = null; S.ctx = '';
  window.__spSdkLoading = false;
  root.dataset.play = '0'; root.dataset.art = '0';
  viewLogin();
}

async function start() {
  viewApp();
  renderHeader(null); // never leave the header blank while loading
  const [meR, plR] = await Promise.allSettled([sp.api('/me'), sp.fetchAllPlaylists()]);

  const expired = [meR, plR].some((r) => r.status === 'rejected' && r.reason && r.reason.status === 401);
  if (expired || !sp.isLoggedIn()) return signOut(); // falls back to the Connect view

  initPlayer();

  if (meR.status === 'fulfilled') renderHeader(meR.value);
  else note('Could not load your profile'); // header keeps its Connect button

  if (plR.status === 'fulfilled') { S.pl = plR.value; renderList(); }
  else {
    $('#spLs').innerHTML = '<li class="sp-empty">Could not load playlists</li>';
    const st = plR.reason && plR.reason.status;
    note(st === 403 ? 'Add your account under User Management in the Spotify dashboard' : 'Spotify request failed');
  }
}

(async function boot() {
  viewLogin(); // render something immediately so the panel is never blank
  let loginErr = false;
  try { await sp.handleRedirect(); } catch (e) { loginErr = true; console.warn('Spotify login failed', e); }
  try {
    if (sp.isLoggedIn()) { await start(); }
    else {
      viewLogin(loginErr ? 'Login failed. Please try again.' : undefined);
      if (loginErr) setOpen(true);
    }
  } catch (e) {
    console.error(e);
    viewLogin('Something went wrong. Please reconnect.');
  }
})();
