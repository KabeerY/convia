# Convia web

Run `pnpm install` at the repository root, then `pnpm --filter convia-web dev`. Open http://localhost:4175. Production build: `pnpm --filter convia-web build`.

The warm landing is at `/`. The authenticated app entry is at `/app`. The app uses Supabase Auth and calls Core under `/v1`; Vite proxies those API calls to `http://127.0.0.1:4000` in development. Add these to `frontend/.env.local` (ignored by Git):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

These are browser-public settings, not the server's database connection or secret key. With only those settings, sign-in can render, but trip actions still require Core to be running with its own server-side configuration. The app currently expects Core routes for trips, itinerary, change sets, votes, members, invites, requests, history, Passport (`GET/PUT /v1/me/passport`), and public discovery (`GET /v1/discover/trips`); unavailable routes show an error rather than mock success. Trip snapshots are refetched every five seconds while the room is open as a temporary collaboration fallback, not a final realtime implementation. Passport values are explicitly selected by the user; discovery only shows a match score if Core supplies one.

Includes a 250-viewport-height scroll sequence with hinged CSS 3D doors, carved panels, perspective, changing light and a final camera push into the temple. The warm palette uses the submitted deck's oat, charcoal, terracotta and muted sage. Larger body text, responsive layouts, mood filters, saved-card state, trip detail dialogs, a local trip-idea form, a travel-vibe picker, and an explicitly labeled local vote-to-lock interaction are included. No backend or authentication is implied by this landing implementation.

Motion is isolated in `src/TempleJourney.jsx` and `src/warm-theme.css`. Scrolling updates CSS custom properties through requestAnimationFrame, without rendering React on every scroll event. Reduced-motion preference removes the pinned sequence, doors and camera movement; a static temple remains. The skip link bypasses the sequence at any time.

The hero was generated with the built-in image-generation tool. See `public/assets/ARTWORK.md` for the prompt and provenance. The Manali asset comes from the existing prototype; the coastal inspiration image is remotely served by Unsplash. Fonts are served by Google Fonts. The beach image illustrates a coastal mood, not a verified photograph of Gokarna.

Verified: production build, browser rendering, mobile 390px composition, all three card images loaded, and the interactive deciding vote changes to the committed/locked preview state.
