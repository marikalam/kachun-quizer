import { useRef, useState } from 'react';
import { recognizeText } from './ocr.js';
import { listDecks, createDeck, deleteDeck, startSession, recordAnswer, deckStats, getDeck } from './deckStore.js';

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
  const fileInputRef = useRef(null);

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
  const [wrongTried, setWrongTried] = useState(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [answeredThisQuestion, setAnsweredThisQuestion] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);

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
    const { deck, cards } = startSession(deckId, SESSION_SIZE);
    import('./deckQuestions.js').then(({ buildQuestionForCard }) => {
      const used = new Set();
      const built = cards.map((card) => {
        const q = buildQuestionForCard(deck, card, used);
        used.add(card.answer.toLowerCase());
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
      const { buildDeckFromText, deriveTitle } = await import('./deckFromText.js');
      const built = buildDeckFromText(text);
      if (!built) {
        throw new Error(
          "Couldn't build a full 10-question deck from that photo. Try a clearer/longer shot, or more notes.",
        );
      }
      const deck = createDeck(deriveTitle(text), built.cards, built.pools);
      refreshDecks();
      beginSession(deck.id);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong reading that photo.');
      setView('home');
    }
  }

  async function createDeckFromPaste() {
    if (!pastedText.trim()) return;
    setErrorMsg(null);
    const { buildDeckFromText, deriveTitle } = await import('./deckFromText.js');
    const built = buildDeckFromText(pastedText);
    if (!built) {
      setErrorMsg("Couldn't build a full 10-question deck from that text. Try pasting more notes.");
      return;
    }
    const deck = createDeck(deriveTitle(pastedText), built.cards, built.pools);
    refreshDecks();
    beginSession(deck.id);
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

  return (
    <div className="page">
      <div className="app">
        <div className="brand-row">
          <h1 className="logo">
            <span className="ink">Kachun</span> <span className="pop-blue">Quiz</span>
            <span className="pop-red">e</span>
            <span className="pop-green">r</span>
          </h1>
          <a className="games-link-btn" href="https://marikalam.github.io/apps/">
            Apps
          </a>
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

            <p className="screen-sub">Snap a photo of your notes and get quizzed on them</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
                  <button className="pill-btn-secondary" onClick={() => fileInputRef.current?.click()}>
                    Retake photo
                  </button>
                  <button className="pill-btn-primary" onClick={createDeckFromPhoto}>
                    Generate quiz →
                  </button>
                </div>
              </>
            ) : (
              <>
                {errorMsg && <p className="error-text">{errorMsg}</p>}
                <button className="capture-btn" onClick={() => fileInputRef.current?.click()}>
                  📷 Take a photo of your notes
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
