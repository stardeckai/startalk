# StarTalk - Claude Code Guidelines

## Development

- Do NOT run builds or start dev servers. Always assume the dev server is already running.
- The app has two windows: `main` (settings/history) and `pill` (floating status overlay). Only the main window should run the recording flow.
- `currentWindowLabel` lives in `src/windowLabel.ts` — never put it in App.tsx (causes circular imports).

## Architecture

- **Monorepo**: pnpm workspaces — `packages/core` (platform-agnostic) and `apps/macos` (Tauri v2)
- **Frontend**: React 19 + TypeScript + Vite + Tailwind v4 + Base UI + Lucide Icons (NO React StrictMode — it double-fires effects)
- **Backend**: Tauri v2 Rust — handles tray, hotkeys (CGEventTap), window management, HTTP proxy
- **State**: Zustand store in `src/store.ts`. For code in useEffect with `[]` deps, read state with `useAppStore.getState()` at call time instead of closing over config (avoids re-registering listeners on config change).
- **Persistence**: `@tauri-apps/plugin-store` for settings, `tauri-plugin-sql` (SQLite) for recordings
- **Styling**: Tailwind v4 with `@theme` in App.css. Use semantic color tokens (`text-foreground`, `bg-muted`, `border-border`, etc.). For opacity variants use Tailwind syntax (`bg-destructive/10`).
- **Components**: Base UI (`@base-ui/react`) for headless components (Tabs, Select, Field). Import from subpaths: `@base-ui/react/tabs`, `@base-ui/react/select`, etc.
- **Icons**: Lucide React (`lucide-react`). Import named icons: `import { Settings, Clock } from 'lucide-react'`.

## Key Patterns

- **CORS**: Tauri webview strips auth headers on preflight. All external API calls go through `proxy_fetch` Rust command via injectable `setFetchImpl()` in `packages/core`.
- **Hotkeys**: Rust CGEventTap with left/right modifier distinction. Frontend listens via Tauri events. Press/release state managed in Rust.
- **Recording**: `getUserMedia` stream kept alive persistently; each recording clones a fresh track (WebKit suspends idle streams, so reusing the stream directly produces silence).
- **Event listeners**: Tauri `listen()` returns a Promise<unlisten>. Use `cancelled` flag pattern in useEffect cleanup to handle the case where cleanup runs before the promise resolves.
- **Shared utils**: `src/utils/format.ts` has `formatSize`, `formatDuration`, `formatDate`.
- **DB queries**: Don't load `audio_base64` in list queries — it's huge. Use `audio_size` (computed in SQL) for display, fetch audio on-demand for playback via `getRecordingAudio()`.

## Common Pitfalls

- Adding deps to useRecordingFlow's useEffect causes re-registration of hotkey listeners → duplicate events. Keep deps as `[]` and read state at call time.
- `MediaRecorder.stop()` can race with duplicate release events. Use a synchronous `handling` ref flag set before any `await`.
- AudioContext may be suspended on first use — call `audioCtx.resume()` before playing.

## Skills

- `/block-aesthetic` — Block Aesthetic Design System for Stardeck public-facing pages. See `.claude/skills/block-aesthetic.md`.
