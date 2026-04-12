# Foodtracker

Personal AI-powered food calorie and macro tracker, running as a PWA on my iPhone home screen.

## What it does

Logs meals via photo, nutrition label scan, or voice/text description. Uses AI (Claude or OpenAI) to estimate calories and macros. Tracks daily totals and 7-day history.

## Development

All changes should be committed and pushed to `main`. GitHub Actions automatically rebuilds and redeploys to GitHub Pages on every push to `main`.

```
git add <files>
git commit -m "your message"
git push origin main
```

## Stack

- React + Vite, deployed as a GitHub Pages PWA
- Tailwind CSS with a custom pine/cream palette
- Claude (`claude-sonnet-4-6`) or OpenAI (`gpt-5-mini`) for meal analysis
- All data stored in localStorage (no backend)
