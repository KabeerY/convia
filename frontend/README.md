# Convia frontend

The React/Vite frontend contains the editorial landing (`/`) and the authenticated group-travel application (`/app`). For the product, architecture, data, setup and current verification boundaries, start with the [root README](../README.md).

```sh
pnpm install
pnpm --filter convia-web dev
```

Open http://localhost:4175. The landing works without credentials. To use `/app`, set the **public** Supabase URL and publishable key in ignored `frontend/.env.local`, and run the configured Core API (the Vite dev server proxies `/v1` to port 4000). The browser must never receive a database password or server-side service key.

```sh
pnpm --filter convia-web test
pnpm --filter convia-web build
```

Core-backed screens deliberately show an error when their API is unavailable; they do not silently switch to mock trip data. The Trip Inspiration catalogue is explicitly synthetic and distinct from joinable open groups. The optional Passport AI-context handoff asks the user to paste a reviewed travel-only summary from their own AI chat; it does not connect to that account or upload its entire history.

This public mirror omits the original PNG artwork and uses CSS illustration fallbacks for the landing. It still requests a coastal image from Unsplash and fonts from Google Fonts at runtime.
