// Spotify auth (Authorization Code + PKCE, no client secret needed) and Web API helper
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
export const hasClientId = !!CLIENT_ID;
export const REDIRECT_URI = 'https://jee-study-lab.netlify.app/';
export const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'playlist-read-private', 'playlist-read-collaborative',
];
const TK = 'sp-tokens', VK = 'sp-verifier', SK = 'sp-state';
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

const read = () => {
  try {
    const t = JSON.parse(localStorage.getItem(TK));
    return t && t.access ? t : null;
  } catch { return null; }
};

// A session is valid if the access token is still fresh OR we can refresh it
export const isLoggedIn = () => {
  const t = read();
  return !!t && (Date.now() < t.exp || !!t.refresh);
};
export const logout = () => localStorage.removeItem(TK);

export async function login() {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is missing in the build');
  const verifier = rand(64), state = rand(12);
  localStorage.setItem(VK, verifier);
  localStorage.setItem(SK, state);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const p = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '), code_challenge_method: 'S256', code_challenge: challenge, state,
  });
  location.href = 'https://accounts.spotify.com/authorize?' + p;
}

async function tokenRequest(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!r.ok) {
    if (body.grant_type === 'refresh_token') logout(); // dead refresh token: drop the session
    throw Object.assign(new Error('token ' + r.status), { status: 401 });
  }
  const j = await r.json();
  const t = { access: j.access_token, refresh: j.refresh_token || read()?.refresh, exp: Date.now() + j.expires_in * 1000 - 60000 };
  localStorage.setItem(TK, JSON.stringify(t));
  return t;
}

// Call once on load. Returns true if we just came back from Spotify login.
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code && !q.get('error')) return false;
  history.replaceState({}, '', location.pathname + location.hash);
  if (!code || q.get('state') !== localStorage.getItem(SK)) return false;
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: localStorage.getItem(VK) });
  localStorage.removeItem(VK); localStorage.removeItem(SK);
  return true;
}

export async function getToken() {
  let t = read();
  if (!t) throw Object.assign(new Error('not logged in'), { status: 401 });
  if (Date.now() > t.exp) {
    if (!t.refresh) { logout(); throw Object.assign(new Error('session expired'), { status: 401 }); }
    t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
  }
  return t.access;
}

export async function api(path, { method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : 'https://api.spotify.com/v1' + path;
  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + (await getToken()), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204 || r.status === 202) return null;
  if (!r.ok) throw Object.assign(new Error('Spotify API ' + r.status), { status: r.status });
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// GET /me/playlists, following pagination so ALL playlists load
export async function fetchAllPlaylists() {
  let url = '/me/playlists?limit=50', out = [];
  while (url) {
    const j = await api(url);
    out = out.concat((j.items || []).filter(Boolean));
    url = j.next;
  }
  return out;
}

/* ---------- tracks: playlist contents + global search ---------- */

// Reduce a Spotify track/episode object to what the widget needs. Returns null if it can't be played.
export function normTrack(t) {
  if (!t || !t.uri || t.is_local || String(t.uri).startsWith('spotify:local:')) return null;
  const imgs = (t.album && t.album.images) || t.images || [];
  const im = imgs[Math.min(1, imgs.length - 1)];
  return {
    uri: t.uri,
    name: t.name || 'Untitled',
    artists: (t.artists || []).map((a) => a.name).join(', ') || (t.show && t.show.name) || '',
    img: im ? im.url : '',
    ms: t.duration_ms || 0,
  };
}

// One page of a playlist's tracks. Each item keeps its absolute position (idx) so we can start playback from it.
// Note: Spotify only returns these for playlists the user owns or collaborates on.
export async function fetchPlaylistItems(id, offset = 0, limit = 50) {
  const q = `?limit=${limit}&offset=${offset}&market=from_token`;
  let j;
  try { j = await api(`/playlists/${encodeURIComponent(id)}/items${q}`); }
  catch (e) {
    if (e.status === 404) j = await api(`/playlists/${encodeURIComponent(id)}/tracks${q}`); // older API shape
    else throw e;
  }
  const raw = (j && j.items) || [];
  const items = [];
  raw.forEach((e, k) => {
    const n = normTrack(e && (e.item || e.track));
    if (n) { n.idx = offset + k; items.push(n); }
  });
  return { items, total: (j && j.total) || 0, next: !!(j && j.next), offset: offset + raw.length };
}

// GET /search?type=track  (Spotify caps limit at 10 per request)
export async function searchTracks(q, offset = 0, limit = 10) {
  const p = new URLSearchParams({ q, type: 'track', limit: String(limit), offset: String(offset), market: 'from_token' });
  const j = await api('/search?' + p);
  const tr = (j && (j.tracks || j.items)) || {};
  const raw = tr.items || [];
  const nextOffset = offset + raw.length;
  return {
    items: raw.map((t) => normTrack(t)).filter(Boolean),
    offset: nextOffset,
    next: raw.length > 0 && (!!tr.next || nextOffset < (tr.total || 0)) && nextOffset < 100,
  };
}
