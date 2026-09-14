import { generateQuiz, QuizError } from '../server/generateQuiz.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const quiz = await generateQuiz(req.body || {});
    res.status(200).json(quiz);
  } catch (err) {
    if (err instanceof QuizError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error.' });
  }
}
