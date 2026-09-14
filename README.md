# Kachun Quizer

Take a photo of your notes, and get quizzed on them. Snap a picture, Claude reads it and writes multiple-choice questions straight from what you wrote, then you work through them one at a time with instant feedback.

No accounts, no database — everything lives in memory for the session.

## Running it locally

You need an Anthropic API key.

```
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm install
npm run dev
```

This starts the Vite dev server and the local API server together. Open the printed `localhost` URL, or your machine's LAN IP from your phone, to use the camera directly.

## How it's deployed

The frontend is a static Vite/React app; the notes-to-quiz call lives in `api/quiz.js` as a Vercel serverless function (so the Anthropic API key never reaches the browser). `server/index.js` is the same logic wrapped in a tiny Express server, used only for local dev — both share `server/generateQuiz.js`.

Deployed on Vercel, with `ANTHROPIC_API_KEY` set as a project environment variable.
