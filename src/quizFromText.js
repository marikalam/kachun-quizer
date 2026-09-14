const STOPWORDS = new Set(
  `a an the and or but nor so yet for of to in on at by from with without
   is are was were be been being have has had do does did will would shall
   should can could may might must this that these those it its it's they
   them their there here then than as not no yes you your yours we our ours
   i my mine he him his she her hers what when where which who whom why how
   into onto over under again further once about above below up down out off
   all any both each few more most other some such only own same too very
   just also each other`
    .split(/\s+/)
    .filter(Boolean),
);

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanText(raw) {
  return raw
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractWords(sentence) {
  const matches = sentence.match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];
  return matches.filter((w) => !STOPWORDS.has(w.toLowerCase()));
}

function pickAnswerWord(sentence, usedAnswers) {
  const candidates = extractWords(sentence)
    .filter((w) => !usedAnswers.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  return candidates[0] || null;
}

function blankOut(sentence, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return sentence.replace(re, '_____');
}

export function generateQuizFromText(rawText) {
  const cleaned = cleanText(rawText);
  const sentences = splitSentences(cleaned).filter((s) => {
    const wordCount = s.split(/\s+/).length;
    return wordCount >= 4 && wordCount <= 28;
  });

  const globalPool = Array.from(
    new Set(
      sentences
        .flatMap(extractWords)
        .filter((w) => w.length >= 4),
    ),
  );

  if (sentences.length < 3 || globalPool.length < 4) {
    return null;
  }

  const usedAnswers = new Set();
  const questions = [];

  for (const sentence of shuffle(sentences)) {
    if (questions.length >= 6) break;

    const answer = pickAnswerWord(sentence, usedAnswers);
    if (!answer) continue;

    const distractorPool = globalPool.filter(
      (w) => w.toLowerCase() !== answer.toLowerCase() && !usedAnswers.has(w.toLowerCase()),
    );
    if (distractorPool.length < 3) continue;

    const distractors = shuffle(distractorPool).slice(0, 3);
    const options = shuffle([answer, ...distractors]);
    const correctIndex = options.indexOf(answer);

    questions.push({
      question: blankOut(sentence, answer),
      options,
      correctIndex,
      explanation: `The notes read: "${sentence}"`,
    });
    usedAnswers.add(answer.toLowerCase());
  }

  if (questions.length < 3) {
    return null;
  }

  return { topic: 'your notes', questions };
}
