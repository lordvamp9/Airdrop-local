# SecureLink Space

[![Astro](https://img.shields.io/badge/built_with-Astro-ff5a03?style=flat&logo=astro&logoColor=white)](https://astro.build/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Netlify Status](https://img.shields.io/netlify/status/your-site-id?style=flat)](https://app.netlify.com/sites/your-site-id/deploys)

Private and glossy P2P file sharing for the web, rebuilt with Astro.

## Features
- Direct P2P file sharing using WebRTC (DataChannels).
- Unlimited file sizes using modern File System Access API streaming.
- Supports any file type and format bidirectionally.
- Unified dashboard for bidirectional transfers.
- No servers, no logs, complete privacy.
- User-controlled downloads (Manual Accept/Reject).
- Beautiful glossy UI optimized for mobile and desktop.

## Deployment
This project is designed to be hosted on Netlify as a static site.
1. Run `npm install`
2. Run `npm run build`
3. Deploy the `dist/` directory to Netlify manually.

## Security
- PeerJS provides end-to-end encrypted data channels.
- Your identity is ephemeral and resets on every page reload.
- The app only has access to files you explicitly select via the browser's sandbox.

Live demo: https://lordvamp9.github.io/Airdrop-local/
