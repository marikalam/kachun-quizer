import { useRef, useState } from 'react';
import { recognizeText } from './ocr.js';

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

export default function App() {
  const fileInputRef = useRef(null);

  const [view, setView] = useState('capture');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  const [quiz, setQuiz] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);

  function resetAll() {
    setView('capture');
    setImageFile(null);
    setImagePreview(null);
    setPastedText('');
    setErrorMsg(null);
    setOcrProgress(0);
    setQuiz(null);
    setQuestionIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setAnswers([]);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setErrorMsg(null);
  }

  async function generateQuiz() {
    if (!imageFile) return;
    setView('generating');
    setErrorMsg(null);
    setOcrProgress(0);
    try {
      const text = await recognizeText(imageFile, setOcrProgress);
      const { generateQuizFromText } = await import('./quizFromText.js');
      const generated = generateQuizFromText(text);
      if (!generated) {
        throw new Error(
          "Couldn't build a full 10-question quiz from that photo. Try a clearer/longer shot, or more notes.",
        );
      }
      setQuiz(generated);
      setQuestionIndex(0);
      setSelectedIndex(null);
      setScore(0);
      setAnswers([]);
      setView('quiz');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong reading that photo.');
      setView('capture');
    }
  }

  async function generateQuizFromPaste() {
    if (!pastedText.trim()) return;
    setErrorMsg(null);
    const { generateQuizFromText } = await import('./quizFromText.js');
    const generated = generateQuizFromText(pastedText);
    if (!generated) {
      setErrorMsg("Couldn't build a full 10-question quiz from that text. Try pasting more notes.");
      return;
    }
    setQuiz(generated);
    setQuestionIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setAnswers([]);
    setView('quiz');
  }

  function selectAnswer(idx) {
    if (selectedIndex !== null) return;
    setSelectedIndex(idx);
    const q = quiz.questions[questionIndex];
    const correct = idx === q.correctIndex;
    if (correct) setScore((s) => s + 1);
    setAnswers((prev) => [
      ...prev,
      { question: q.question, options: q.options, selectedIndex: idx, correctIndex: q.correctIndex, correct },
    ]);
  }

  function nextQuestion() {
    if (questionIndex + 1 >= quiz.questions.length) {
      setView('results');
      return;
    }
    setQuestionIndex((i) => i + 1);
    setSelectedIndex(null);
  }

  const currentQuestion = quiz?.questions?.[questionIndex];

  function optionClass(idx) {
    if (selectedIndex === null) return 'option-btn';
    if (idx === currentQuestion.correctIndex) return 'option-btn option-correct';
    if (idx === selectedIndex) return 'option-btn option-incorrect';
    return 'option-btn option-faded';
  }

  function fillBlank(question, word) {
    return question.replace('_____', word);
  }

  const total = quiz?.questions?.length || 0;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const resultEmoji = percent >= 80 ? '🎉' : percent >= 50 ? '👍' : '📚';
  const resultMessage = percent >= 80 ? 'Nice work!' : percent >= 50 ? 'Good effort!' : 'Keep studying!';

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

        {view === 'capture' && (
          <>
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
                  <button className="pill-btn-primary" onClick={generateQuiz}>
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
                <button
                  className="pill-btn-primary"
                  disabled={!pastedText.trim()}
                  onClick={generateQuizFromPaste}
                >
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
            <ProgressDots current={questionIndex + 1} total={quiz.questions.length} />
            <h2 className="screen-title">{currentQuestion.question}</h2>
            <div className="options-grid">
              {currentQuestion.options.map((opt, idx) => (
                <button key={idx} className={optionClass(idx)} onClick={() => selectAnswer(idx)}>
                  {opt}
                </button>
              ))}
            </div>
            {selectedIndex !== null && (
              <>
                <p className="explanation-text">{currentQuestion.explanation}</p>
                <button className="pill-btn-primary" onClick={nextQuestion}>
                  {questionIndex + 1 >= quiz.questions.length ? 'See results' : 'Next question'} →
                </button>
              </>
            )}
          </>
        )}

        {view === 'results' && quiz && (
          <>
            <div className="results-header">
              <div className="complete-emoji">{resultEmoji}</div>
              <h2 className="screen-title">{resultMessage}</h2>
              <div className="results-score-ring">
                <span className="results-score-number">{score}</span>
                <span className="results-score-total">/ {total}</span>
              </div>
              <p className="screen-sub">{percent}% correct</p>
            </div>

            <div className="review-list">
              {answers.map((a, i) => (
                <div key={i} className={`review-item${a.correct ? ' review-correct' : ' review-incorrect'}`}>
                  <span className="review-icon">{a.correct ? '✓' : '✗'}</span>
                  <div className="review-text">
                    <p className="review-question">{fillBlank(a.question, a.options[a.correctIndex])}</p>
                    {!a.correct && (
                      <p className="review-your-answer">You said: {a.options[a.selectedIndex]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="feedback-actions">
              <button className="pill-btn-primary" onClick={resetAll}>
                New photo →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
