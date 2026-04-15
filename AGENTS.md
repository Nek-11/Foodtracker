# Agents Guide — Foodtracker

## UI & Copy Guidelines

- This is a **minimalist app**. Keep the UI clean and uncluttered.
- **Never** add developer notes, technical explanations, or implementation details in user-facing text. The user doesn't need to know how things work internally.
- Descriptions and labels should be short, natural, and written from the user's perspective — not the developer's.
- Don't add unnecessary helper text, disclaimers, or hints unless they directly help the user complete an action.
- Only use emojis if explicitly requested.

## Development Workflow

1. **Branch**: Create a new branch for every feature or change. Never commit directly to `main`.
2. **Commit often**: Make small, incremental commits with clear messages as you work.
3. **Test**: Run the test suite (`npm test`) before considering work done. All tests must pass.
4. **Push often**: Push to the feature branch regularly.
5. **Merge to main**: When the feature is complete and all tests pass, merge the branch into `main` with full commit history (no squash). Merging to `main` triggers re-deployment to GitHub Pages.

## Tech Stack

- React 18 + Vite + Tailwind CSS + Recharts
- PWA with auto-update (Workbox via vite-plugin-pwa)
- All data in localStorage — no backend, no database
- AI analysis via Claude or OpenAI APIs (user-provided keys)

## Testing

- Tests use Vitest + React Testing Library
- Run with `npm test`
- Test files live in `src/__tests__/`
- Cover: storage logic, nutrition utils, analyzer service, component rendering
