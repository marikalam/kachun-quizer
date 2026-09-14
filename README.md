# Kachun Quizer

Take a photo of your notes, or paste them in as text, and get quizzed on them. The app reads the notes and turns them into fill-in-the-blank questions pulled straight from what you wrote. No AI, no account, no server — everything runs on-device and nothing is stored between sessions.

Live at **[marikalam.github.io/apps/kachun-quizer](https://marikalam.github.io/apps/kachun-quizer/)**, alongside [the other apps](https://marikalam.github.io/apps/).

## How it works

1. Take/upload a photo of your notes, or paste the text directly.
2. If it's a photo, [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR, running entirely in the browser) reads the text out of the image first.
3. A small heuristic in `src/quizFromText.js` picks sentences, blanks out a key word in each, and builds four-option multiple choice questions from other words in your notes.
4. You work through them one at a time with instant feedback, then see your score.

Because there's no server or API key involved, a photo's quiz quality depends on how legible the image is — clear, well-lit handwriting or typed notes work best. Pasting text skips OCR entirely and is the most reliable option.

## Running it locally

```
npm install
npm run dev
```
