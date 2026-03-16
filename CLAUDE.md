# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Cardboard?

Cardboard is a multiplayer virtual tabletop app for board games. Players connect to rooms via WebSocket, and one player (the host) can edit the game state while others play. The canvas renders game objects (cards, tokens, boards, decks, stacks) using Konva (react-konva).

## Commands

- `npm run dev` — Start Vite dev server (frontend)
- `npm run server` — Start WebSocket server (`tsx server/index.ts`)
- `npm run build` — Type-check and build frontend (`tsc -b && vite build`)
- `npm run server:build` — Compile server to `dist-server/`
- `npx tsc --noEmit` — Type-check without emitting (quick validation)
- `npm run lint` — ESLint

## Architecture

### Client (React + Konva)

**`src/App.tsx`** — Main component. Owns all state (`CanvasState`), handles keyboard/mouse input, canvas rendering (Konva Stage/Layer), drag-select, context menus, zoom/pan, and TTS import. This is the largest file and the hub of the app.

**`src/state_management/types.ts`** — Core data model: `Prototype` (template with type + props), `Instance` (placed object referencing a prototype with position + override props), `Player`, `HiddenRegion`, `CanvasState`. Instances resolve their effective props by merging prototype defaults with instance overrides via `resolveProps()`.

**`src/canvas/renderInstance.tsx`** — Maps instances to their Konva components by type. Also resolves the top-item visual (image/text/crop) for container types (deck, stack).

**`src/canvas/gridCrop.ts`** — Shared grid-crop utilities. Cards imported from TTS use image grids (sprite sheets); this module computes Konva `crop` props from grid coordinates. Used by Card, Deck, and Stack components.

**`src/components/`** — One directory per object type (card, token, board, deck, stack), plus editor modals, context menu, sidebar, and hidden-region. Components are `memo`ized Konva `Group`s.

**`src/multiplayer/`** — Socket.IO client: room joining, player claiming, state sync. `useMultiplayer` hook connects to the server and broadcasts state changes.

**`src/state_management/importTTS.ts`** — Converts Tabletop Simulator save files into `CanvasState`. Handles three categories: deck objects (CustomDeck with card grids), stack containers (Bags with token children), and standalone objects.

### Server (`server/index.ts`)

Minimal Socket.IO server. Manages rooms (6-char codes), host assignment, player claiming, and state relay. Deployed on Render (`render.yaml`). No database — state lives in memory with 30-minute cleanup after rooms empty.

## Key Patterns

- **Prototype/Instance separation**: Game objects are defined as prototypes (type + default props) and placed as instances (position + optional prop overrides). Instance props override prototype props via spread: `{ ...proto.props, ...instance.props }`.
- **Container entries**: Decks store cards and stacks store items as arrays of `{ prototypeId, props? }` entries in their instance props (`props.cards` / `props.items`), not as separate instances.
- **Grid cropping**: TTS card imports store grid metadata (`gridCol`, `gridRow`, `gridNumWidth`, `gridNumHeight`) in prototype props. At render time, `useCropProps()` converts these to Konva `crop` props. Back images use the `back` prefix (`backGridCol`, etc.) only when `UniqueBack` is true.
- **React fast-refresh constraint**: Files exporting React components must not export non-component values. Shared utilities go in separate files (e.g., `gridCrop.ts` extracted from `card.tsx`).
- **Host/edit mode**: Only the host can toggle edit mode. Non-host players are locked to play mode. Edit mode reveals hidden regions and enables prototype/player management.
