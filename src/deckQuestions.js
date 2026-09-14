const POS_CATEGORIES = ['Noun', 'Verb', 'Adjective', 'Adverb'];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function blankOut(sentence, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return sentence.replace(re, '_____');
}

// Builds the multiple-choice question for one card at ask-time, pulling
// distractors from the deck's stored word pools. `excludeNormals` keeps
// other questions' answers (in the same session) out of this one's options.
export function buildQuestionForCard(deck, card, excludeNormals = new Set()) {
  const answerNormal = card.answer.toLowerCase();
  const exclude = new Set([...excludeNormals, answerNormal]);

  let distractorPool = deck.pools[card.category].filter((w) => !exclude.has(w.toLowerCase()));
  if (distractorPool.length < 3) {
    const crossPool = POS_CATEGORIES.filter((c) => c !== card.category).flatMap((c) => deck.pools[c]);
    distractorPool = distractorPool.concat(crossPool.filter((w) => !exclude.has(w.toLowerCase())));
  }

  const distractors = shuffle(distractorPool).slice(0, 3);
  const options = shuffle([card.answer, ...distractors]);

  return {
    cardId: card.id,
    question: blankOut(card.sentence, card.answer),
    options,
    correctIndex: options.indexOf(card.answer),
    explanation: `The notes read: "${card.sentence}"`,
  };
}
