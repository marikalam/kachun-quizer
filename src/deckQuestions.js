export function blankOut(sentence, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return sentence.replace(re, '_____');
}

// Builds the question shown for one card at ask-time. Claude cards already
// carry a real question; legacy (offline) cards are a fill-in-the-blank
// built from the sentence the word was pulled from.
export function buildQuestionForCard(card) {
  if (card.question) {
    return { cardId: card.id, question: card.question, answer: card.correctAnswer, explanation: card.explanation };
  }
  return {
    cardId: card.id,
    question: blankOut(card.sentence, card.answer),
    answer: card.answer,
    explanation: `The notes read: "${card.sentence}"`,
  };
}

function normalize(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Plain Levenshtein edit distance, used to forgive a single typo on
// mobile keyboards without accepting genuinely wrong answers.
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Typed answers need to forgive case, punctuation, and the occasional
// fat-fingered letter on a phone keyboard, without turning into a real
// answer key for a completely different word.
export function matchesAnswer(typed, correctAnswer) {
  const a = normalize(typed);
  const b = normalize(correctAnswer);
  if (!a) return false;
  if (a === b) return true;
  const tolerance = b.length >= 8 ? 2 : b.length >= 4 ? 1 : 0;
  return editDistance(a, b) <= tolerance;
}
