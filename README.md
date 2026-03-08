# StarTalk

Push-to-talk voice transcription for macOS. Hold a hotkey, speak, release — your words appear in whatever app you're typing in.

StarTalk runs as a menu bar app (~3MB) with no Dock icon. It records audio while you hold a global hotkey, sends it to [OpenRouter](https://openrouter.ai) for transcription via Gemini, and pastes the result into your focused input field.

## Features

- **Push-to-talk** — Hold Globe (or any modifier combo) to record, release to transcribe
- **Universal text injection** — Transcribed text is pasted into whatever app has focus (editors, browsers, Slack, etc.)
- **Floating status pill** — Minimal overlay shows recording/processing state, visible on all spaces including fullscreen
- **Recording history** — Browse, replay, copy, and delete past transcriptions with cost tracking
- **Custom vocabulary** — Define known words/phrases and spelling corrections to improve accuracy
- **Custom prompts** — Tailor the transcription behavior with your own system prompt
- **Configurable hotkey** — Record any modifier combination (Globe, Cmd+Option, etc.)
- **Menu bar only** — No Dock icon, stays out of your way

## Prerequisites

- macOS (Apple Silicon or Intel)
- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- An [OpenRouter](https://openrouter.ai) API key

## Setup

```bash
# Clone and install dependencies
git clone https://github.com/xgreenfield/startalk.git
cd startalk
pnpm install

# Start development
pnpm dev
```

On first launch, grant these permissions in **System Settings > Privacy & Security**:

- **Accessibility** — Required for global hotkey detection
- **Input Monitoring** — Required for modifier key tracking
- **Microphone** — Required for audio recording

Enter your OpenRouter API key in the settings panel to start transcribing.

## Scripts

```bash
pnpm dev          # Start Tauri dev server with hot reload
pnpm build        # Build production .dmg/.app bundle
pnpm typecheck    # TypeScript type checking (all packages)
pnpm check        # Biome lint + format check
pnpm check:fix    # Auto-fix lint and formatting issues
```

## Project Structure

```
startalk/
├── packages/core/           # @startalk/core — platform-agnostic transcription
│   └── src/
│       ├── transcription.ts # OpenRouter API integration
│       ├── types.ts         # Shared type definitions
│       ├── config.ts        # Default model, hotkey, prompts
│       └── audio.ts         # Audio encoding utilities
├── apps/macos/              # Tauri v2 macOS app
│   ├── src/                 # React frontend
│   │   ├── components/      # Settings, History, Vocabulary, StatusPill
│   │   ├── hooks/           # useRecordingFlow (orchestration)
│   │   ├── recorder.ts      # MediaRecorder with stream management
│   │   ├── injector.ts      # Clipboard + Cmd+V text injection
│   │   ├── store.ts         # Zustand state
│   │   └── db.ts            # SQLite recording storage
│   └── src-tauri/           # Rust backend
│       └── src/
│           ├── lib.rs        # App setup, window config, migrations
│           ├── hotkey.rs     # CGEventTap global modifier monitoring
│           ├── commands.rs   # IPC: shortcuts, tray, permissions, HTTP proxy
│           └── tray.rs       # System tray menu
├── biome.json               # Linter + formatter config
└── pnpm-workspace.yaml
```

## How It Works

```
Hold hotkey → Rust CGEventTap detects modifier press → Frontend starts MediaRecorder
Release     → Rust detects modifier release → Stop recording → Audio blob
            → Base64 encode → OpenRouter API (Gemini) → Transcribed text
            → Switch to English input → Clipboard + Cmd+V paste → Restore clipboard
```

The Rust backend handles global hotkey detection via `CGEventTap` (distinguishes left/right modifiers), while the frontend manages audio recording, API calls, and text injection. External API calls go through a Rust HTTP proxy to avoid CORS issues in the Tauri webview.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4, Base UI |
| State | Zustand |
| Storage | SQLite (recordings), JSON store (settings) |
| Transcription | Google Gemini via OpenRouter |
| Hotkeys | Core Graphics CGEventTap (Rust) |
| Text injection | AppleScript (clipboard + keystroke) |
| Linting | Biome |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Model | `google/gemini-3.1-flash-lite-preview` | OpenRouter model for transcription |
| Hotkey | `Globe` | Modifier combo to hold for recording |
| History retention | 24 hours | Auto-cleanup: 24h, 3d, or 7d |
| Vocabulary | Empty | Known words + spelling corrections |
| Custom prompt | Empty | Additional transcription instructions |

## Contributing

Contributions are welcome! Please open an issue to discuss what you'd like to change before submitting a PR.

```bash
# Setup
pnpm install

# Development
pnpm dev

# Before submitting
pnpm check        # Lint + format
pnpm typecheck    # Type check
```

## License

MIT &mdash; see [LICENSE](LICENSE) for details.
