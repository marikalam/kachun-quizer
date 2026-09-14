# Kachun Quizer

Take a photo of your notes, or paste them in as text, and get quizzed on them like a deck of Anki flashcards. Each set of notes becomes its own deck that remembers which facts you're shaky on and brings them back more often, while facts you know well show up less. No AI, no account, no server — everything, including your history, lives on-device.

Live at **[marikalam.github.io/apps/kachun-quizer](https://marikalam.github.io/apps/kachun-quizer/)**, alongside [the other apps](https://marikalam.github.io/apps/).

## How it works

1. Take/upload a photo of your notes, or paste the text directly.
2. If it's a photo, [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR, running entirely in the browser) reads the text out of the image first.
3. [Compromise](https://github.com/spencermountain/compromise) (a small in-browser NLP library) tags each word's part of speech. `src/deckFromText.js` turns roughly one sentence into one flashcard, blanking out its most important word (nouns/verbs are preferred over adjectives/adverbs — the fact, not the description) and saving the note's vocabulary for building distractor options later.
4. That becomes a new **deck**, saved in `localStorage`. Answering a question updates that one card's schedule (`src/deckStore.js`): get it right and it's pushed further out before it reappears; get it wrong and it comes right back next session. A never-before-asked fact always takes priority, so a deck works through all of its facts before repeating.
5. Each round is 10 questions, mixing due-for-review cards with new ones. The results screen shows your score, a review of exactly what you got right/wrong, and the deck's overall mastery (facts pushed out far enough to count as learned).
6. Decks persist on the home screen — tap one to keep studying it later, or delete it with the 🗑.

Because there's no server or API key involved, a photo's quiz quality depends on how legible the image is — clear, well-lit handwriting or typed notes work best. Pasting text skips OCR entirely and is the most reliable option.

## Running it locally

```
npm install
npm run dev
```
