import { useEffect, useRef, useState } from 'react';
import { recognizeText } from './ocr.js';
import { prewarmVoices, speakResults } from './speech.js';
import { generateDeckWithClaude, getUsageStats } from './claude.js';
import { listDecks, createDeck, deleteDeck, startSession, recordAnswer, deckStats, getDeck } from './deckStore.js';

// Turns raw notes text into a deck: Claude (via the server-side proxy)
// writes real comprehension questions, understanding the material instead
// of just blanking out a word; falls back to the offline word-blanking
// generator if the request fails for any reason (offline, proxy down,
// rate-limited, etc.) so a session is never a dead end.
async function buildDeckFromNotes(text) {
  try {
    return await generateDeckWithClaude(text);
  } catch (err) {
    console.warn('Claude quiz generation failed, falling back to basic mode:', err);
  }
  const { buildDeckFromText, deriveTitle } = await import('./deckFromText.js');
  const built = buildDeckFromText(text);
  if (!built) return null;
  return { title: deriveTitle(text), cards: built.cards };
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
  const [errorMsg, setErrorMsg] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  const [activeDeckId, setActiveDeckId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [lastCorrect, setLastCorrect] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [answeredThisQuestion, setAnsweredThisQuestion] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const answerInputRef = useRef(null);

  useEffect(() => {
    prewarmVoices();
  }, []);

  useEffect(() => {
    if (view === 'results') speakResults(score, questions.length);
  }, [view]);

  useEffect(() => {
    if (view === 'quiz' && !revealed) answerInputRef.current?.focus();
  }, [view, questionIndex, revealed]);

  function refreshDecks() {
    setDecks(listDecks());
  }

  function resetToHome() {
    setView('home');
    setImageFile(null);
    setImagePreview(null);
    setPastedText('');
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
    const { cards } = startSession(deckId, SESSION_SIZE);
    import('./deckQuestions.js').then(({ buildQuestionForCard }) => {
      const built = cards.map((card) => buildQuestionForCard(card));
      setActiveDeckId(deckId);
      setQuestions(built);
      setQuestionIndex(0);
      setTypedAnswer('');
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
      const deck = createDeck(built.title, built.cards);
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
      const deck = createDeck(built.title, built.cards);
      refreshDecks();
      beginSession(deck.id);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong with that text.');
      setView('home');
    }
  }

  function handleDeleteDeck(deckId, e) {
    e.stopPropagation();
    deleteDeck(deckId);
    refreshDecks();
  }

  async function submitAnswer() {
    if (revealed || !typedAnswer.trim()) return;
    const q = questions[questionIndex];
    const { matchesAnswer } = await import('./deckQuestions.js');
    const correct = matchesAnswer(typedAnswer, q.answer);

    // Just one attempt per question - right or wrong, it counts toward
    // score/history/the SRS schedule and immediately reveals the answer.
    setAnsweredThisQuestion(true);
    setAnswers((prev) => [...prev, { question: q.question, answer: q.answer, typed: typedAnswer.trim(), correct }]);
    recordAnswer(activeDeckId, q.cardId, correct);
    if (correct) setScore((s) => s + 1);
    setLastCorrect(correct);
    setRevealed(true);
  }

  function nextQuestion() {
    if (questionIndex + 1 >= questions.length) {
      setView('results');
      return;
    }
    setQuestionIndex((i) => i + 1);
    setTypedAnswer('');
    setRevealed(false);
    setAnsweredThisQuestion(false);
  }

  const currentQuestion = questions[questionIndex];

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
            <p className="screen-sub-small">✨ Claude is writing your questions</p>

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

                <button className="capture-btn" onClick={() => cameraInputRef.current?.click()}>
                  📷 Take a photo of your notes
                </button>
                <button className="pill-btn-secondary pill-btn-full" onClick={() => libraryInputRef.current?.click()}>
                  🖼 Upload a photo
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
              Quizzes are written by Claude automatically - no setup needed. The API key lives on a small server-side
              proxy, never in this app or your browser.
            </p>

            {usageStats.calls > 0 ? (
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
                <p className="error-text-muted">Every call and its exact token counts are also logged to this browser's console.</p>
              </>
            ) : (
              <p className="screen-sub-small">No Claude calls from this browser yet.</p>
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

            {!revealed && (
              <>
                <input
                  ref={answerInputRef}
                  className="answer-input"
                  type="text"
                  placeholder="Type your answer…"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="done"
                />
                <button className="pill-btn-primary pill-btn-full" disabled={!typedAnswer.trim()} onClick={submitAnswer}>
                  Check answer →
                </button>
              </>
            )}

            {revealed && (
              <>
                <p className={lastCorrect ? 'feedback-correct-text' : 'feedback-incorrect-text'}>
                  {lastCorrect ? '✓ Correct!' : `✗ Not quite - you typed "${typedAnswer}"`}
                </p>
                <div className="answer-card-plain">
                  <div className="answer-equation">{currentQuestion.answer}</div>
                </div>
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
                    <p className="review-question">{fillBlank(a.question, a.answer)}</p>
                    {!a.correct && <p className="review-your-answer">You typed: {a.typed}</p>}
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
