# Convia — travel is better together

## 1. Team & Problem Statement

**Team pacmen · KogniVera Hackathon 2026 · PS-11: WanderMatch — Social & Group Travel Planning.**

Current delivery: a working, responsive landing experience and the full product/architecture/build specifications. The shared backend and mandatory multi-browser proof are still pending. See [HACKATHON.md](HACKATHON.md) for the organizer requirements.

## 2. What we built

- A warm oat, charcoal and terracotta landing, using the submitted deck's palette and larger, readable supporting typography.
- A scroll-controlled temple sequence: carved doors rotate on their outer hinges in CSS 3D, the temple is revealed, then the camera moves forward. Includes a skip link and reduced-motion alternative.
- Trip-inspiration cards with mood filtering, save controls, detail dialogs and a travel-vibe picker. These are illustrative destinations, not live group listings.
- A local trip-idea form and an explicitly labeled voting preview that demonstrates the proposed vote-to-lock experience. This does **not** satisfy the real multi-user vote-to-commit requirement yet.
- [Product](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), and [ordered implementation plan](docs/IMPLEMENTATION_PLAN.md) covering the complete intended application.

## 3. Architecture

Implemented: React/Vite browser app → local component state and a browser-local trip draft. No application server is used by the landing.

Planned: frontend ↔ Core API/PostgreSQL/Auth/Realtime ↔ scoped Trippy and Media services. Domain writes and voting remain server-authoritative in the target design. Service boundaries and implementation order are documented in the linked specifications.

## 4. Data model

This landing does not run database migrations, query canonical tables, or claim data-model conformance. Trip inspiration is a small local fixture list.

The target architecture maps the 14 named PS-11 tables from the supplied intake pack and defines additive records. The organizer's D1–D9 correspondence still needs clarification. Database implementation, seed import and conformance validation remain pending.

## 5. AI features

The Kailasa hero is an AI-generated artistic interpretation; the generation prompt and asset provenance are in [ARTWORK.md](frontend/public/assets/ARTWORK.md).

Trippy's displayed conversation is a clearly labeled interactive product preview, not a model invocation. Live tool calling, grounded place answers, voice onboarding and photo face matching are planned and not yet connected. No API keys are required for this landing.

## 6. Run it locally

Use Node.js 22.12+ (or a compatible newer release) and npm.

```sh
cd frontend
npm ci
npm run dev
```

Open **http://localhost:4175/**. The configured port is strict; stop an existing process using it before starting another copy. No environment variables, migration or seed commands are required at this stage; [.env.example](.env.example) records that explicitly.

```sh
cd frontend
npm run build
npm run preview -- --port 4176
```

The production output is `frontend/dist/`. Google Fonts and the coastal inspiration photo currently load from external providers; the temple and mountain artwork are bundled locally.

## 7. Demo path

1. Open the landing and scroll through the doorway sequence. Reverse scrolling reverses the doors; “Skip the journey” jumps to the next section.
2. Use the mood filters, explore a destination, and open a trip-idea draft.
3. Visit Meet Trippy and cast the deciding vote. The **local preview** changes to committed/locked and can be reset.
4. Open the travel-vibe picker and choose a mood to return to filtered inspiration.
5. Repeat on a narrow screen; the mobile menu, cards and dialogs adapt to the viewport.

The mandatory two-authenticated-browser quorum → automatic commit → lock → retained vote-history path is specified in implementation step I09 and is **not implemented** by this landing preview.

## 8. Tests / proof

`cd frontend && npm run build` verifies the production bundle. Browser checks cover the three scroll stages, actual 3D transforms, desktop/mobile layouts, navigation and the preview vote state.

No backend or automated hard-proof test exists yet. The implementation plan defines those acceptance checks; a successful landing build is not evidence of realtime collaboration.
