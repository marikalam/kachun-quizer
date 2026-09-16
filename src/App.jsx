import { useEffect, useRef, useState } from 'react';
import { recognizeText } from './ocr.js';
import { fetchTextFromUrl } from './urlImport.js';
import { prewarmVoices, speakResults } from './speech.js';
import { getApiKey, setApiKey, generateDeckWithClaude, getUsageStats } from './claude.js';
import { listDecks, createDeck, deleteDeck, startSession, recordAnswer, deckStats, getDeck } from './deckStore.js';

// Turns raw notes text into a deck: Claude writes real comprehension
// questions when an API key is set, understanding the material instead of
// just blanking out a word; falls back to the offline word-blanking
// generator (no key needed, but shallower questions) if there's no key or
// the Claude request fails for any reason.
async function buildDeckFromNotes(text) {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const { title, cards } = await generateDeckWithClaude(text, apiKey);
      return { title, cards, pools: null };
    } catch (err) {
      console.warn('Claude quiz generation failed, falling back to basic mode:', err);
    }
  }
  const { buildDeckFromText, deriveTitle } = await import('./deckFromText.js');
  const built = buildDeckFromText(text);
  if (!built) return null;
  return { title: deriveTitle(text), cards: built.cards, pools: built.pools };
}

function ProgressDots({ current, total }) {
  const items = [];
  for (let i = 1; i <= total; i++) {
    items.push(<span key={`d${i}`} className={`progress-dot${i <= current ? ' progress-dot-filled' : ''}`} />);
    if (i < total) {
      items.push(<span key={`l${i}`} className={`progress-line${i < current ? ' progress-line-filled' : ''}`} />);
    }
  }
  return (
    <div className="progress-wrap">
      <div className="progress-dots">{items}</div>
      <span className="progress-count">
        {current} / {total}
      </span>
    </div>
  );
}

const SESSION_SIZE = 10;

export default function App() {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);

  const [view, setView] = useState('home');
  const [decks, setDecks] = useState(() => listDecks());

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [linkLoading, setLinkLoading] = useState(false);

  const [activeDeckId, setActiveDeckId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [wrongTried, setWrongTried] = useState(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [answeredThisQuestion, setAnsweredThisQuestion] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);

  const [apiKeyInput, setApiKeyInput] = useState(() => getApiKey());
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    prewarmVoices();
  }, []);

  useEffect(() => {
    if (view === 'results') speakResults(score, questions.length);
  }, [view]);

  function refreshDecks() {
    setDecks(listDecks());
  }

  function saveApiKey() {
    setApiKey(apiKeyInput.trim());
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 1500);
  }

  function clearApiKey() {
    setApiKey('');
    setApiKeyInput('');
  }

  function resetToHome() {
    setView('home');
    setImageFile(null);
    setImagePreview(null);
    setPastedText('');
    setLinkUrl('');
    setErrorMsg(null);
    setOcrProgress(0);
    refreshDecks();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setErrorMsg(null);
  }

  function beginSession(deckId) {
    const { deck, cards } = startSession(deckId, SESSION_SIZE);
    import('./deckQuestions.js').then(({ buildQuestionForCard }) => {
      const used = new Set();
      const built = cards.map((card) => {
        const q = buildQuestionForCard(deck, card, used);
        used.add((card.answer ?? card.correctAnswer).toLowerCase());
        return q;
      });
      setActiveDeckId(deckId);
      setQuestions(built);
      setQuestionIndex(0);
      setWrongTried(new Set());
      setRevealed(false);
      setAnsweredThisQuestion(false);
      setScore(0);
      setAnswers([]);
      setView('quiz');
    });
  }

  async function createDeckFromPhoto() {
    if (!imageFile) return;
    setView('generating');
    setErrorMsg(null);
    setOcrProgress(0);
    try {
      const text = await recognizeText(imageFile, setOcrProgress);
      const built = await buildDeckFromNotes(text);
      if (!built) {
        throw new Error(
          "Couldn't build a full 10-question deck from that photo. Try a clearer/longer shot, or more notes.",
        );
      }
      const deck = createDeck(built.title, built.cards, built.pools);
      refreshDecks();
      beginSession(deck.id);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong reading that photo.');
      setView('home');
    }
  }

  async function createDeckFromPaste() {
    if (!pastedText.trim()) return;
    setView('generating');
    setErrorMsg(null);
    try {
      const built = await buildDeckFromNotes(pastedText);
      if (!built) {
        throw new Error("Couldn't build a full 10-question deck from that text. Try pasting more notes.");
      }
      const deck = createDeck(built.title, built.cards, built.pools);
      refreshDecks();
      beginSession(deck.id);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong with that text.');
      setView('home');
    }
  }

  async function createDeckFromLink() {
    if (!linkUrl.trim()) return;
    setErrorMsg(null);
    setLinkLoading(true);
    try {
      const text = await fetchTextFromUrl(linkUrl);
      const built = await buildDeckFromNotes(text);
      if (!built) {
        throw new Error("Couldn't build a full 10-question deck from that link. Try a longer note or page.");
      }
      const deck = createDeck(built.title, built.cards, built.pools);
      refreshDecks();
      beginSession(deck.id);
    } catch (err) {
      setErrorMsg(err.message || "Couldn't import that link.");
    } finally {
      setLinkLoading(false);
    }
  }

  function handleDeleteDeck(deckId, e) {
    e.stopPropagation();
    deleteDeck(deckId);
    refreshDecks();
  }

  function selectAnswer(idx) {
    if (revealed || wrongTried.has(idx)) return;
    const q = questions[questionIndex];
    const correct = idx === q.correctIndex;

    if (!answeredThisQuestion) {
      // Only the first attempt counts toward score, history, and the SRS
      // schedule - retries after a wrong guess are just for learning.
      setAnsweredThisQuestion(true);
      if (correct) setScore((s) => s + 1);
      setAnswers((prev) => [
        ...prev,
        { question: q.question, options: q.options, selectedIndex: idx, correctIndex: q.correctIndex, correct },
      ]);
      recordAnswer(activeDeckId, q.cardId, correct);
    }

    if (correct) {
      setRevealed(true);
    } else {
      setWrongTried((prev) => new Set(prev).add(idx));
    }
  }

  function nextQuestion() {
    if (questionIndex + 1 >= questions.length) {
      setView('results');
      return;
    }
    setQuestionIndex((i) => i + 1);
    setWrongTried(new Set());
    setRevealed(false);
    setAnsweredThisQuestion(false);
  }

  const currentQuestion = questions[questionIndex];

  function optionClass(idx) {
    if (revealed && idx === currentQuestion.correctIndex) return 'option-btn option-correct';
    if (wrongTried.has(idx)) return 'option-btn option-incorrect';
    if (revealed) return 'option-btn option-faded';
    return 'option-btn';
  }

  function fillBlank(question, word) {
    return question.replace('_____', word);
  }

  const total = questions.length;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const resultEmoji = percent >= 80 ? '🎉' : percent >= 50 ? '👍' : '📚';
  const resultMessage = percent >= 80 ? 'Nice work!' : percent >= 50 ? 'Good effort!' : 'Keep studying!';
  const activeDeck = activeDeckId ? getDeck(activeDeckId) : null;
  const activeDeckStats = activeDeck ? deckStats(activeDeck) : null;
  const usageStats = getUsageStats();

  return (
    <div className="page">
      <div className="app">
        <div className="brand-row">
          <h1 className="logo">
            <span className="ink">Kachun</span> <span className="pop-blue">Quiz</span>
            <span className="pop-red">e</span>
            <span className="pop-green">r</span>
          </h1>
          <div className="brand-row-actions">
            <button className="games-link-btn" onClick={() => setView('settings')} aria-label="Settings">
              ⚙️
            </button>
            <a className="games-link-btn" href="https://marikalam.github.io/apps/">
              Apps
            </a>
          </div>
        </div>

        {view === 'home' && (
          <>
            {decks.length > 0 && (
              <div className="deck-list">
                {decks.map((deck) => {
                  const stats = deckStats(deck);
                  return (
                    <button key={deck.id} className="deck-card" onClick={() => beginSession(deck.id)}>
                      <div className="deck-card-text">
                        <span className="deck-card-title">{deck.title}</span>
                        <span className="deck-card-sub">
                          {deck.sessionCount === 0
                            ? `${stats.total} cards · not started yet`
                            : `${stats.mastered}/${stats.total} mastered · ${stats.due} due for review`}
                        </span>
                      </div>
                      <span className="deck-card-delete" onClick={(e) => handleDeleteDeck(deck.id, e)}>
                        🗑
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="screen-sub">Snap or upload a photo of your notes and get quizzed on them</p>
            <p className="screen-sub-small">
              {getApiKey()
                ? '✨ Claude is writing your questions'
                : 'Add a Claude API key in ⚙️ Settings for smarter questions'}
            </p>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {imagePreview ? (
              <>
                <div className="photo-preview-wrap">
                  <img className="photo-preview" src={imagePreview} alt="Your notes" />
                </div>
                {errorMsg && <p className="error-text">{errorMsg}</p>}
                <div className="feedback-actions">
                  <button className="pill-btn-secondary" onClick={() => libraryInputRef.current?.click()}>
                    Choose different photo
                  </button>
                  <button className="pill-btn-primary" onClick={createDeckFromPhoto}>
                    Generate quiz →
                  </button>
                </div>
              </>
            ) : (
              <>
                {errorMsg && <p className="error-text">{errorMsg}</p>}
                <button className="capture-btn" onClick={() => cameraInputRef.current?.click()}>
                  📷 Take a photo of your notes
                </button>
                <button className="pill-btn-secondary pill-btn-full" onClick={() => libraryInputRef.current?.click()}>
                  🖼 Upload a photo
                </button>

                <div className="or-divider">or</div>

                <textarea
                  className="paste-textarea"
                  placeholder="Paste your notes here…"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={6}
                />
                <button className="pill-btn-primary" disabled={!pastedText.trim()} onClick={createDeckFromPaste}>
                  Generate quiz from text →
                </button>

                <div className="or-divider">or</div>

                <input
                  className="paste-textarea"
                  type="url"
                  placeholder="Paste a link (iCloud Notes share link or any webpage)…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <button
                  className="pill-btn-primary"
                  disabled={!linkUrl.trim() || linkLoading}
                  onClick={createDeckFromLink}
                >
                  {linkLoading ? 'Fetching…' : 'Generate quiz from link →'}
                </button>
              </>
            )}
          </>
        )}

        {view === 'settings' && (
          <>
            <button className="back-link" onClick={resetToHome}>
              ← Back
            </button>
            <h2 className="screen-title">Settings</h2>
            <p className="screen-sub">
              Add your Claude API key so quizzes are written by Claude - real comprehension questions instead of
              blanked-out words. Get a key at{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              .
            </p>
            <input
              className="paste-textarea"
              type="password"
              placeholder="sk-ant-…"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="error-text-muted">
              Stored only in this browser's local storage and sent directly to Claude's API - never to any other
              server. Don't use this on a shared or public computer.
            </p>
            <div className="feedback-actions">
              <button className="pill-btn-secondary" onClick={clearApiKey} disabled={!apiKeyInput}>
                Clear
              </button>
              <button className="pill-btn-primary" onClick={saveApiKey} disabled={!apiKeyInput.trim()}>
                {apiKeySaved ? 'Saved ✓' : 'Save key'}
              </button>
            </div>

            {usageStats.calls > 0 && (
              <>
                <div className="screen-sub-small" style={{ marginTop: 8 }}>
                  USAGE IN THIS APP
                </div>
                <div className="stat-tiles">
                  <div className="stat-tile">
                    <div className="stat-number">{usageStats.calls}</div>
                    <div className="stat-label">Claude calls</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-number">{(usageStats.inputTokens + usageStats.outputTokens).toLocaleString()}</div>
                    <div className="stat-label">Total tokens</div>
                  </div>
                </div>
                <p className="error-text-muted">
                  Every call and its exact token counts are also logged to this browser's console. Check{' '}
                  <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">
                    console.anthropic.com
                  </a>{' '}
                  for actual billing.
                </p>
              </>
            )}
          </>
        )}

        {view === 'generating' && (
          <div className="complete-wrap">
            <div className="spinner" aria-hidden="true" />
            <h2 className="screen-title">Reading your notes…</h2>
            <p className="screen-sub">{Math.round(ocrProgress * 100)}%</p>
          </div>
        )}

        {view === 'quiz' && currentQuestion && (
          <>
            <button className="back-link" onClick={resetToHome}>
              ← Back
            </button>
            <ProgressDots current={questionIndex + 1} total={questions.length} />
            <h2 className="screen-title">{currentQuestion.question}</h2>
            <div className="options-grid">
              {currentQuestion.options.map((opt, idx) => (
                <button key={idx} className={optionClass(idx)} onClick={() => selectAnswer(idx)}>
                  {opt}
                </button>
              ))}
            </div>
            {revealed && (
              <>
                <p className="explanation-text">{currentQuestion.explanation}</p>
                <button className="pill-btn-primary" onClick={nextQuestion}>
                  {questionIndex + 1 >= questions.length ? 'See results' : 'Next question'} →
                </button>
              </>
            )}
          </>
        )}

        {view === 'results' && (
          <>
            <div className="results-header">
              <div className="complete-emoji">{resultEmoji}</div>
              <h2 className="screen-title">{resultMessage}</h2>
              <div className="results-score-ring">
                <span className="results-score-number">{score}</span>
                <span className="results-score-total">/ {total}</span>
              </div>
              <p className="screen-sub">{percent}% correct this round</p>
              {activeDeckStats && (
                <p className="screen-sub">
                  {activeDeckStats.mastered}/{activeDeckStats.total} facts mastered in this deck
                </p>
              )}
            </div>

            <div className="review-list">
              {answers.map((a, i) => (
                <div key={i} className={`review-item${a.correct ? ' review-correct' : ' review-incorrect'}`}>
                  <span className="review-icon">{a.correct ? '✓' : '✗'}</span>
                  <div className="review-text">
                    <p className="review-question">{fillBlank(a.question, a.options[a.correctIndex])}</p>
                    {!a.correct && <p className="review-your-answer">You said: {a.options[a.selectedIndex]}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="feedback-actions">
              <button className="pill-btn-secondary" onClick={resetToHome}>
                Home
              </button>
              <button className="pill-btn-primary" onClick={() => beginSession(activeDeckId)}>
                Study again →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
