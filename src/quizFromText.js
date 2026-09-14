import nlp from 'compromise';

const POS_CATEGORIES = ['Noun', 'Verb', 'Adjective', 'Adverb'];

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
  for (const { candidates } of sentences) {
    for (const c of candidates) {
      if (!pools[c.category].has(c.normal)) pools[c.category].set(c.normal, c.text);
    }
  }
  const totalPoolSize = Object.values(pools).reduce((n, m) => n + m.size, 0);

  if (sentences.length < 3 || totalPoolSize < 4) {
    return null;
  }

  const usedAnswers = new Set();

  function buildQuestion(sentenceText, candidates, allowCrossCategory) {
    const available = shuffle(candidates.filter((c) => !usedAnswers.has(c.normal))).sort(
      (a, b) => b.text.length - a.text.length,
    );

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
  const leftovers = [];

  for (const { text, candidates } of shuffle(sentences)) {
    if (questions.length >= 6) break;
    const q = buildQuestion(text, candidates, false);
    if (q) questions.push(q);
    else leftovers.push({ text, candidates });
  }

  if (questions.length < 3) {
    for (const { text, candidates } of leftovers) {
      if (questions.length >= 6) break;
      const q = buildQuestion(text, candidates, true);
      if (q) questions.push(q);
    }
  }

  if (questions.length < 3) {
    return null;
  }

  return { topic: 'your notes', questions };
}
