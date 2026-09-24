# Convia landing

Run `npm install` then `npm run dev` in this directory. Open http://localhost:4175. Production build: `npm run build`.

Includes a 250-viewport-height scroll sequence with hinged CSS 3D doors, carved panels, perspective, changing light and a final camera push into the temple. The warm palette uses the submitted deck's oat, charcoal, terracotta and muted sage. Larger body text, responsive layouts, mood filters, saved-card state, trip detail dialogs, a local trip-idea form, a travel-vibe picker, and an explicitly labeled local vote-to-lock interaction are included. No backend or authentication is implied by this landing implementation.

Motion is isolated in `src/TempleJourney.jsx` and `src/warm-theme.css`. Scrolling updates CSS custom properties through requestAnimationFrame, without rendering React on every scroll event. Reduced-motion preference removes the pinned sequence, doors and camera movement; a static temple remains. The skip link bypasses the sequence at any time.

The hero was generated with the built-in image-generation tool. See `public/assets/ARTWORK.md` for the prompt and provenance. The Manali asset comes from the existing prototype; the coastal inspiration image is remotely served by Unsplash. Fonts are served by Google Fonts. The beach image illustrates a coastal mood, not a verified photograph of Gokarna.

Verified: production build, browser rendering, mobile 390px composition, all three card images loaded, and the interactive deciding vote changes to the committed/locked preview state.
