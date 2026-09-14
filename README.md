# Kachun Quizer

Take a photo of your notes, and get quizzed on them. Snap a picture, the app reads the text right there in your browser, and turns it into fill-in-the-blank questions pulled straight from what you wrote. No AI, no account, no server — everything runs on-device and nothing is stored between sessions.

Live at **[marikalam.github.io/apps/kachun-quizer](https://marikalam.github.io/apps/kachun-quizer/)**, alongside [the other apps](https://marikalam.github.io/apps/).

## How it works

1. Take or upload a photo of your notes.
2. [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR, running entirely in the browser) reads the text out of the image.
3. A small heuristic in `src/quizFromText.js` picks sentences, blanks out a key word in each, and builds four-option multiple choice questions from other words in your notes.
4. You work through them one at a time with instant feedback, then see your score.

Because there's no server or API key involved, quiz quality depends on how legible the photo is — clear, well-lit handwriting or typed notes work best.

## Running it locally

```
npm install
npm run dev
```
