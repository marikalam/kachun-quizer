import nlp from 'compromise';

const POS_CATEGORIES = ['Noun', 'Verb', 'Adjective', 'Adverb'];
// Lower number = picked first as a blank. Nouns/verbs tend to be the fact
// being tested; adjectives/adverbs are usually just describing it.
const CATEGORY_PRIORITY = { Noun: 0, Verb: 1, Adjective: 2, Adverb: 3 };
const TARGET_QUESTIONS = 10;
const MIN_QUESTIONS = 10;

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function categoryFor(tags) {
  for (const tag of POS_CATEGORIES) {
    if (tags.includes(tag)) return tag;
  }
  return null;
}

function sentenceCandidateWords(sentenceTerms) {
  const candidates = [];
  for (const term of sentenceTerms) {
    const text = term.text;
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(text) || text.length < 4) continue;
    const category = categoryFor(term.tags || []);
    if (!category) continue;
    candidates.push({ text, normal: text.toLowerCase(), category });
  }
  return candidates;
}

function blankOut(sentence, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return sentence.replace(re, '_____');
}

export function generateQuizFromText(rawText) {
  const cleaned = rawText.replace(/[^\S\n]+/g, ' ').replace(/\n+/g, ' ').trim();
  if (!cleaned) return null;

  const sentences = nlp(cleaned)
    .json()
    .filter((s) => s.terms.length >= 4 && s.terms.length <= 28)
    .map((s) => ({ text: s.text, candidates: sentenceCandidateWords(s.terms) }))
    .filter((s) => s.candidates.length > 0);

  const pools = { Noun: new Map(), Verb: new Map(), Adjective: new Map(), Adverb: new Map() };
  const wordFrequency = new Map();
  for (const { candidates } of sentences) {
    for (const c of candidates) {
      if (!pools[c.category].has(c.normal)) pools[c.category].set(c.normal, c.text);
      wordFrequency.set(c.normal, (wordFrequency.get(c.normal) || 0) + 1);
    }
  }
  const totalPoolSize = Object.values(pools).reduce((n, m) => n + m.size, 0);

  if (sentences.length < 5 || totalPoolSize < MIN_QUESTIONS) {
    return null;
  }

  const usedAnswers = new Set();

  function buildQuestion(sentenceText, candidates, allowCrossCategory) {
    // Prefer nouns/verbs (the fact) over adjectives/adverbs (the description),
    // then words that recur across the notes (a sign they're a key term),
    // then longer words as a last tiebreak.
    const available = shuffle(candidates.filter((c) => !usedAnswers.has(c.normal))).sort((a, b) => {
      const categoryDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
      if (categoryDiff !== 0) return categoryDiff;
      const frequencyDiff = (wordFrequency.get(b.normal) || 0) - (wordFrequency.get(a.normal) || 0);
      if (frequencyDiff !== 0) return frequencyDiff;
      return b.text.length - a.text.length;
    });

    for (const { text: answer, normal: answerNormal, category } of available) {
      let distractorEntries = [...pools[category].entries()].filter(
        ([normal]) => normal !== answerNormal && !usedAnswers.has(normal),
      );

      if (distractorEntries.length < 3 && allowCrossCategory) {
        const crossCategoryEntries = POS_CATEGORIES.filter((c) => c !== category).flatMap((c) => [
          ...pools[c].entries(),
        ]);
        distractorEntries = distractorEntries.concat(
          shuffle(crossCategoryEntries).filter(
            ([normal]) => normal !== answerNormal && !usedAnswers.has(normal),
          ),
        );
      }

      if (distractorEntries.length < 3) continue;

      const distractors = shuffle(distractorEntries)
        .slice(0, 3)
        .map(([, text]) => text);
      const options = shuffle([answer, ...distractors]);

      usedAnswers.add(answerNormal);
      return {
        question: blankOut(sentenceText, answer),
        options,
        correctIndex: options.indexOf(answer),
        explanation: `The notes read: "${sentenceText}"`,
      };
    }
    return null;
  }

  const questions = [];

  // Repeatedly sweep every sentence (same-category distractors only). A
  // sentence with several candidate words can supply more than one
  // question this way - each pass picks its next-longest unused word.
  function fillPasses(allowCrossCategory) {
    let progressed = true;
    while (questions.length < TARGET_QUESTIONS && progressed) {
      progressed = false;
      for (const { text, candidates } of shuffle(sentences)) {
        if (questions.length >= TARGET_QUESTIONS) break;
        const q = buildQuestion(text, candidates, allowCrossCategory);
        if (q) {
          questions.push(q);
          progressed = true;
        }
      }
    }
  }

  fillPasses(false);
  if (questions.length < TARGET_QUESTIONS) fillPasses(true);

  if (questions.length < MIN_QUESTIONS) {
    return null;
  }

  return { topic: 'your notes', questions };
}
