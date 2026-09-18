// Quiz generation is proxied through a small Cloudflare Worker
// (../../kachun-quizer-proxy) that holds the Anthropic API key
// server-side. The key never touches this app's source, bundle, or any
// user's browser - see that project's README for deploy/setup.
const PROXY_URL = 'https://kachun-quizer-proxy.marikalam.workers.dev';

const USAGE_STORAGE = 'kachun-quizer-claude-usage-v1';
// Guards against firing two requests back-to-back (e.g. a double tap before
// the UI has a chance to disable the button) - this is the only place that
// calls Claude, and it's only ever triggered by an explicit "Generate quiz".
const MIN_CALL_INTERVAL_MS = 4000;

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

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  return JSON.parse(raw);
}

export async function generateDeckWithClaude(notesText) {
  const stats = getUsageStats();
  if (stats.lastCallAt && Date.now() - stats.lastCallAt < MIN_CALL_INTERVAL_MS) {
    throw new Error("Whoa, one at a time - give it a second and try again.");
  }

  console.log(`[Claude] Requesting quiz via proxy (${notesText.length} chars of notes)…`);

  let response;
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notesText }),
    });
  } catch (err) {
    console.error('[Claude] Request failed to send:', err);
    throw new Error("Couldn't reach the quiz service. Check your connection and try again.");
  }

  if (response.status === 429) {
    console.error('[Claude] Rate limited by proxy');
    throw new Error("Too many quizzes in a short time - give it a bit and try again.");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[Claude] Request failed with status ${response.status}:`, body.slice(0, 200));
    throw new Error(`Quiz service request failed (${response.status}).`);
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
    throw new Error("Claude couldn't generate enough questions from that. Try longer or clearer notes.");
  }

  const cards = parsed.questions
    .filter((q) => q && q.question && q.correctAnswer)
    .map((q, i) => ({
      id: `claude-${i}`,
      question: q.question,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      concept: q.concept || q.topic || 'General Knowledge',
    }));

  if (cards.length < 4) {
    throw new Error("Claude couldn't generate enough questions from that. Try longer or clearer notes.");
  }

  // If we have fewer than 10 questions, generate similar ones to reach 10
  if (cards.length < 10) {
    console.log(`[Claude] Got ${cards.length} questions, generating similar ones to reach 10...`);
    const needed = 10 - cards.length;

    try {
      const conceptsList = cards.map(c => c.concept).join(', ');
      const conceptsToFocus = [...new Set(cards.map(c => c.concept))].slice(0, 3).join(', ');

      let followUpResponse;
      try {
        followUpResponse = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            notesText: `Generate ${needed} MORE practice questions similar in style and difficulty to these ${cards.length} existing questions. Focus on these concepts: ${conceptsToFocus}. Make them varied but covering the same topics. Return as JSON array with "questions" key.`,
            isFollowUp: true
          }),
        });
      } catch (err) {
        console.warn('[Claude] Follow-up generation failed, continuing with fewer questions');
        return { title: parsed.title || 'My notes', cards };
      }

      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json();
        const followUpText = (followUpData.content || []).map((block) => block.text || '').join('');

        try {
          const followUpParsed = extractJson(followUpText);
          const followUpCards = (followUpParsed.questions || [])
            .filter((q) => q && q.question && q.correctAnswer)
            .slice(0, needed)
            .map((q, i) => ({
              id: `claude-follow-${i}`,
              question: q.question,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation || '',
              concept: q.concept || q.topic || 'General Knowledge',
            }));

          cards.push(...followUpCards);
          console.log(`[Claude] Generated ${followUpCards.length} follow-up questions, total now: ${cards.length}`);
        } catch (e) {
          console.warn('[Claude] Could not parse follow-up questions:', e);
        }
      }
    } catch (err) {
      console.warn('[Claude] Follow-up generation error:', err);
    }
  }

  return {
    title: parsed.title || 'My notes',
    cards: cards.slice(0, 10), // Ensure we cap at 10
  };
}
