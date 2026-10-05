# JEE Study Lab + Spotify widget

Deploy: upload this folder to Netlify (build: `npm run build`, publish: `dist` — already set in netlify.toml).

1. Netlify → Site settings → Environment variables → `VITE_SPOTIFY_CLIENT_ID` = your Spotify Client ID, then redeploy.
2. Spotify Dashboard → your app → Redirect URIs → add exactly `https://jee-study-lab.netlify.app/` (trailing slash included).
3. Dashboard → User Management: add your Spotify account email (needed while the app is in Development mode).
4. In-browser playback needs Spotify Premium and a desktop/Android browser (iOS Safari does not support the Web Playback SDK).
