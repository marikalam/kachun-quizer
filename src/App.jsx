import { useRef, useState } from 'react';
import { recognizeText } from './ocr.js';
import { generateQuizFromText } from './quizFromText.js';

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
  const [errorMsg, setErrorMsg] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  const [quiz, setQuiz] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [score, setScore] = useState(0);

  function resetAll() {
    setView('capture');
    setImageFile(null);
    setImagePreview(null);
    setErrorMsg(null);
    setOcrProgress(0);
    setQuiz(null);
    setQuestionIndex(0);
    setSelectedIndex(null);
    setScore(0);
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
      const generated = generateQuizFromText(text);
      if (!generated) {
        throw new Error("Couldn't find enough legible notes in that photo. Try better lighting or a closer shot.");
      }
      setQuiz(generated);
      setQuestionIndex(0);
      setSelectedIndex(null);
      setScore(0);
      setView('quiz');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong reading that photo.');
      setView('capture');
    }
  }

  function selectAnswer(idx) {
    if (selectedIndex !== null) return;
    setSelectedIndex(idx);
    const q = quiz.questions[questionIndex];
    if (idx === q.correctIndex) setScore((s) => s + 1);
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
          <div className="complete-wrap">
            <div className="complete-emoji">🎉</div>
            <h2 className="screen-title">
              {score} / {quiz.questions.length}
            </h2>
            <p className="screen-sub">on {quiz.topic}</p>
            <div className="feedback-actions">
              <button className="pill-btn-primary" onClick={resetAll}>
                New photo →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
