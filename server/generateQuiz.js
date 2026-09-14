import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const QUIZ_PROMPT = `You are looking at a photo of someone's handwritten or typed notes.

1. Read everything you can make out in the notes.
2. Write 6 multiple-choice quiz questions that test understanding of the material in the notes. Base every question strictly on content that appears in the notes - do not invent facts that aren't there.
3. Each question has exactly 4 answer options, with exactly one correct.

Respond with ONLY raw JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "topic": "short title for what the notes are about",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "one short sentence on why that's correct, referencing the notes"
    }
  ]
}

If the image contains no legible notes, respond with ONLY this JSON instead: {"error": "no_notes_found"}`;

export class QuizError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export async function generateQuiz({ image, mediaType }) {
  if (!image || !mediaType) {
    throw new QuizError(400, 'Missing image or mediaType');
  }

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4096,
      output_config: { effort: 'medium' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: QUIZ_PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic auth error:', err.message);
      throw new QuizError(500, 'Server is missing a valid ANTHROPIC_API_KEY.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new QuizError(429, 'Rate limited - try again in a moment.');
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', err.status, err.message);
      throw new QuizError(502, 'The quiz generator had a problem. Try again.');
    }
    console.error(err);
    throw new QuizError(500, 'Unexpected server error.');
  }

  if (response.stop_reason === 'refusal') {
    throw new QuizError(422, 'Could not generate a quiz from this photo.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new QuizError(502, 'No response from model.');
  }

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch {
    throw new QuizError(502, 'Could not parse a quiz from the notes. Try a clearer photo.');
  }

  if (parsed.error === 'no_notes_found') {
    throw new QuizError(422, 'No legible notes found in that photo. Try again with better lighting/focus.');
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new QuizError(502, 'Could not generate quiz questions from this photo.');
  }

  return parsed;
}
