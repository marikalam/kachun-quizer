const STORAGE_KEY = 'kachun-quizer-decks-v1';
const EASE_START = 2.5;
const EASE_MIN = 1.3;
const EASE_MAX = 3.2;
const EASE_DELTA_CORRECT = 0.1;
const EASE_DELTA_WRONG = 0.25;
const MASTERED_INTERVAL = 4;

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAll(decks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    /* ignore - localStorage unavailable or full */
  }
}

export function listDecks() {
  return Object.values(loadAll()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getDeck(deckId) {
  return loadAll()[deckId] || null;
}

export function createDeck(title, cardSeeds, pools) {
  const deck = {
    id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: Date.now(),
    sessionCount: 0,
    pools,
    cards: cardSeeds.map((seed) => ({
      ...seed,
      timesSeen: 0,
      timesCorrect: 0,
      interval: 0,
      easeFactor: EASE_START,
      dueAtSession: 0,
    })),
  };
  const decks = loadAll();
  decks[deck.id] = deck;
  saveAll(decks);
  return deck;
}

export function deleteDeck(deckId) {
  const decks = loadAll();
  delete decks[deckId];
  saveAll(decks);
}

export function renameDeck(deckId, title) {
  const decks = loadAll();
  if (!decks[deckId]) return;
  decks[deckId].title = title;
  saveAll(decks);
}

export function deckStats(deck) {
  const total = deck.cards.length;
  const mastered = deck.cards.filter((c) => c.interval >= MASTERED_INTERVAL).length;
  const due = deck.cards.filter((c) => c.dueAtSession <= deck.sessionCount + 1).length;
  return { total, mastered, due };
}

// Starts a new study session: bumps the session counter and returns the
// deck's next `count` cards to ask, favoring never-seen cards, then the
// most overdue, then the hardest (lowest ease). Backfills with whichever
// cards are soonest-due if there aren't enough due cards yet, so a
// session always has `count` questions once a deck has that many cards.
export function startSession(deckId, count) {
  const decks = loadAll();
  const deck = decks[deckId];
  if (!deck) return null;

  deck.sessionCount += 1;
  const session = deck.sessionCount;

  const due = deck.cards.filter((c) => c.dueAtSession <= session);
  const notDue = deck.cards.filter((c) => c.dueAtSession > session);

  due.sort((a, b) => {
    if (a.timesSeen === 0 && b.timesSeen !== 0) return -1;
    if (b.timesSeen === 0 && a.timesSeen !== 0) return 1;
    if (a.dueAtSession !== b.dueAtSession) return a.dueAtSession - b.dueAtSession;
    return a.easeFactor - b.easeFactor;
  });
  notDue.sort((a, b) => a.dueAtSession - b.dueAtSession);

  const selected = [...due, ...notDue].slice(0, count);
  saveAll(decks);
  return { deck, session, cards: selected };
}

export function recordAnswer(deckId, cardId, correct) {
  const decks = loadAll();
  const deck = decks[deckId];
  if (!deck) return;
  const card = deck.cards.find((c) => c.id === cardId);
  if (!card) return;

  card.timesSeen += 1;
  if (correct) {
    card.timesCorrect += 1;
    card.interval = card.interval <= 0 ? 1 : Math.round(card.interval * card.easeFactor);
    card.easeFactor = Math.min(card.easeFactor + EASE_DELTA_CORRECT, EASE_MAX);
    card.dueAtSession = deck.sessionCount + card.interval;
  } else {
    card.interval = 0;
    card.easeFactor = Math.max(card.easeFactor - EASE_DELTA_WRONG, EASE_MIN);
    card.dueAtSession = deck.sessionCount;
  }
  saveAll(decks);
}
