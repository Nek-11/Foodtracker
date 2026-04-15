# Foodtracker

AI-powered food tracker that estimates calories and macros from a photo or voice description. Built as a lightweight PWA — no backend, no database, everything stays on your device.

**[Try it live](https://nek-11.github.io/Foodtracker/)** (optimized for smartphones — add to home screen for the full experience)

## How it works

1. Snap a photo of your meal or describe it with voice/text
2. AI analyzes it and returns a full nutrition breakdown (calories, protein, carbs, fat, fiber, sugar, sodium)
3. Answer optional clarifying questions to refine estimates
4. Track your daily progress against configurable goals

## Features

- **AI analysis** via Claude or OpenAI — bring your own API key
- **Voice notes** with Whisper transcription
- **Recurring habits** — tell it things like "I always cook with a bit of butter" and it applies them only when relevant
- **Daily stats** with 7-day charts, macro tracking, and weekly insights
- **Meal history** with search, filters, edit, and reanalysis
- **Dark mode** with light/dark/system toggle
- **Pull-to-refresh** on stats and history
- **Export/import** your data as JSON (API keys are excluded from exports)
- **Installable PWA** with auto-updates — works offline for browsing history

## Privacy

Everything is stored in your browser's localStorage. Your API keys never leave your device except to call the AI provider you chose. No analytics, no telemetry, no server.

## Stack

React + Vite + Tailwind CSS + Recharts + PWA (Workbox)

## Setup for development

```bash
npm install
npm run dev
```

## Vibecoded by [nek-11](https://github.com/Nek-11)

Built entirely from a phone using Claude Code, without ever looking at the source code.
