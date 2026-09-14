import nlp from 'compromise';

const POS_CATEGORIES = ['Noun', 'Verb', 'Adjective', 'Adverb'];
// Lower number = picked first as a blank. Nouns/verbs tend to be the fact
// being tested; adjectives/adverbs are usually just describing it.
const CATEGORY_PRIORITY = { Noun: 0, Verb: 1, Adjective: 2, Adverb: 3 };
const MIN_CARDS = 10;

// Lines that are almost certainly not prose worth quizzing on - photo
// captions/credits, boilerplate, etc. Pasted articles and screenshots
// bring this stuff along, and it produces nonsense questions if it
// isn't filtered before sentence splitting.
const JUNK_LINE_PATTERNS = [
  /\bphoto\s*:/i,
  /\bcredit\s*:/i,
  /\bcourtesy\s+of\b/i,
  /\bgetty\s+images\b/i,
  /\(\s*ap\s*\)/i,
  /^\s*advertisement\s*$/i,
  /^\s*subscribe\b/i,
  /\ball rights reserved\b/i,
  /©/,
];

function isJunkLine(line) {
  return JUNK_LINE_PATTERNS.some((re) => re.test(line));
}

function categoryFor(tags) {
  for (const tag of POS_CATEGORIES) {
    if (tags.includes(tag)) return tag;
  }
  return null;
}

function sentenceHasVerb(terms) {
  return terms.some((t) => (t.tags || []).includes('Verb'));
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

export function deriveTitle(rawText) {
  const words = rawText.trim().split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  if (words.length > 4) return words.length > 40 ? `${words.slice(0, 40)}…` : words;
  return `Notes – ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

// Builds every usable fact-card from the text (roughly one per sentence,
// picking the most important word - see CATEGORY_PRIORITY), plus the
// word pools needed to generate distractor options for those cards later.
// Returns null if there isn't enough content for at least MIN_CARDS.
export function buildDeckFromText(rawText) {
  // Split into lines first and treat each as its own boundary - joining
  // everything into one blob before sentence-splitting is what let an
  // unrelated caption/credit line on its own line get merged into the
  // surrounding sentence.
  const lines = rawText
    .split(/\n+/)
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter((line) => line.length > 0 && !isJunkLine(line));

  if (lines.length === 0) return null;

  const sentences = lines
    .flatMap((line) => nlp(line).json())
    .filter((s) => s.terms.length >= 4 && s.terms.length <= 28)
    .filter((s) => sentenceHasVerb(s.terms))
    .map((s) => ({ text: s.text, candidates: sentenceCandidateWords(s.terms) }))
    .filter((s) => s.candidates.length > 0);

  const pools = { Noun: new Set(), Verb: new Set(), Adjective: new Set(), Adverb: new Set() };
  const wordFrequency = new Map();
  for (const { candidates } of sentences) {
    for (const c of candidates) {
      pools[c.category].add(c.text);
      wordFrequency.set(c.normal, (wordFrequency.get(c.normal) || 0) + 1);
    }
  }
  const totalPoolSize = Object.values(pools).reduce((n, s) => n + s.size, 0);

  if (sentences.length < MIN_CARDS || totalPoolSize < MIN_CARDS) {
    return null;
  }

  const usedAnswers = new Set();
  const cards = [];

  function pickWord(candidates) {
    const available = candidates.filter((c) => !usedAnswers.has(c.normal));
    if (available.length === 0) return null;
    available.sort((a, b) => {
      const categoryDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
      if (categoryDiff !== 0) return categoryDiff;
      const frequencyDiff = (wordFrequency.get(b.normal) || 0) - (wordFrequency.get(a.normal) || 0);
      if (frequencyDiff !== 0) return frequencyDiff;
      return b.text.length - a.text.length;
    });
    return available[0];
  }

  // Pass 1: one card per sentence (its single most important word).
  sentences.forEach(({ text, candidates }, sentenceIndex) => {
    const picked = pickWord(candidates);
    if (!picked) return;
    usedAnswers.add(picked.normal);
    cards.push({
      id: `${sentenceIndex}:${picked.normal}`,
      sentence: text,
      answer: picked.text,
      category: picked.category,
    });
  });

  // Pass 2 (only for thin notes): let sentences with leftover candidate
  // words contribute a second card, so short note sets can still reach
  // the minimum needed for a full 10-question session.
  if (cards.length < MIN_CARDS) {
    let progressed = true;
    while (cards.length < MIN_CARDS && progressed) {
      progressed = false;
      for (const [sentenceIndex, { text, candidates }] of sentences.entries()) {
        if (cards.length >= MIN_CARDS) break;
        const picked = pickWord(candidates);
        if (!picked) continue;
        usedAnswers.add(picked.normal);
        cards.push({
          id: `${sentenceIndex}:${picked.normal}`,
          sentence: text,
          answer: picked.text,
          category: picked.category,
        });
        progressed = true;
      }
    }
  }

  if (cards.length < MIN_CARDS) {
    return null;
  }

  return {
    cards,
    pools: {
      Noun: [...pools.Noun],
      Verb: [...pools.Verb],
      Adjective: [...pools.Adjective],
      Adverb: [...pools.Adverb],
    },
  };
}
