const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const API_KEY_STORAGE = 'kachun-quizer-anthropic-key';
const USAGE_STORAGE = 'kachun-quizer-claude-usage-v1';
const MAX_NOTES_CHARS = 6000;
// Guards against firing two requests back-to-back (e.g. a double tap before
// the UI has a chance to disable the button) - this is the only place that
// calls Claude, and it's only ever triggered by an explicit "Generate quiz".
const MIN_CALL_INTERVAL_MS = 4000;

export function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* ignore - localStorage unavailable */
  }
}

export function getUsageStats() {
  try {
    return (
      JSON.parse(localStorage.getItem(USAGE_STORAGE)) || {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        lastCallAt: null,
      }
    );
  } catch {
    return { calls: 0, inputTokens: 0, outputTokens: 0, lastCallAt: null };
  }
}

function recordUsage(usage) {
  const stats = getUsageStats();
  const next = {
    calls: stats.calls + 1,
    inputTokens: stats.inputTokens + (usage?.input_tokens || 0),
    outputTokens: stats.outputTokens + (usage?.output_tokens || 0),
    lastCallAt: Date.now(),
  };
  try {
    localStorage.setItem(USAGE_STORAGE, JSON.stringify(next));
  } catch {
    /* ignore - localStorage unavailable */
  }
  return next;
}

function buildPrompt(notesText) {
  const trimmed = notesText.slice(0, MAX_NOTES_CHARS);
  return `You are creating a multiple-choice study quiz from a student's notes. Read the notes below and write clear questions that test real understanding of the material - not just recalling one missing word. Each question needs exactly one correct answer and three plausible but clearly incorrect distractor options. Vary the phrasing (what, why, how, which, when, where as fits). Keep each option short - a few words to one brief phrase. Give a one-sentence explanation for the correct answer, grounded only in the notes. Do not invent facts that aren't in the notes.

Generate as many good questions as the notes reasonably support - at least 5, at most 12, aim for 10 if the notes are rich enough.

Respond with ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
{"title": "short 3-6 word title for these notes", "questions": [{"question": "...", "correctAnswer": "...", "distractors": ["...", "...", "..."], "explanation": "..."}]}

Notes:
"""
${trimmed}
"""`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  return JSON.parse(raw);
}

export async function generateDeckWithClaude(notesText, apiKey) {
  const stats = getUsageStats();
  if (stats.lastCallAt && Date.now() - stats.lastCallAt < MIN_CALL_INTERVAL_MS) {
    throw new Error("Whoa, one at a time - give it a second and try again.");
  }

  console.log(`[Claude] Requesting quiz from ${MODEL} (${notesText.length} chars of notes)…`);

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPrompt(notesText) }],
      }),
    });
  } catch (err) {
    console.error('[Claude] Request failed to send:', err);
    throw new Error("Couldn't reach Claude. Check your connection and try again.");
  }

  if (response.status === 401) {
    console.error('[Claude] Request rejected: invalid API key');
    throw new Error('That Claude API key was rejected. Double-check it in Settings.');
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[Claude] Request failed with status ${response.status}:`, body.slice(0, 200));
    throw new Error(`Claude request failed (${response.status}). ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const usage = recordUsage(data.usage);
  console.log(
    `[Claude] Response received - ${data.usage?.input_tokens ?? '?'} input + ${data.usage?.output_tokens ?? '?'} output tokens ` +
      `(lifetime in this app: ${usage.calls} calls, ${usage.inputTokens + usage.outputTokens} tokens)`,
  );
  const text = (data.content || []).map((block) => block.text || '').join('');

  let parsed;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error("Couldn't understand Claude's response. Try again.");
  }

  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length < 4) {
    throw new Error("Claude couldn't build enough good questions from that. Try longer or clearer notes.");
  }

  const cards = parsed.questions
    .filter((q) => q && q.question && q.correctAnswer && Array.isArray(q.distractors) && q.distractors.length >= 3)
    .map((q, i) => ({
      id: `claude-${i}`,
      question: q.question,
      correctAnswer: q.correctAnswer,
      distractors: q.distractors.slice(0, 3),
      explanation: q.explanation || '',
    }));

  if (cards.length < 4) {
    throw new Error("Claude couldn't build enough good questions from that. Try longer or clearer notes.");
  }

  return {
    title: parsed.title || 'My notes',
    cards,
  };
}
