import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { generateQuiz, QuizError } from './generateQuiz.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.post('/api/quiz', async (req, res) => {
  try {
    const quiz = await generateQuiz(req.body || {});
    res.json(quiz);
  } catch (err) {
    if (err instanceof QuizError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error.' });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Kachun Quizer API listening on http://localhost:${PORT}`);
});
