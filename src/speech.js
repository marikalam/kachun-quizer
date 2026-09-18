let voicesPromise = null;

// Voice lists load asynchronously on most browsers - calling getVoices()
// right away often returns [] and silently falls back to the flattest
// default voice. Wait for the real list (via voiceschanged, with a
// timeout fallback) before picking one.
function loadVoices() {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, 1000);
  });
  return voicesPromise;
}

// The Web Speech API has no true "ChatGPT-style" neural voice - browsers
// only expose whatever voices the OS ships, for free. Edge's
// "Online (Natural)" voices are real cloud neural voices (Azure) and
// sound best by far; macOS Enhanced/Premium voices are next; flat
// compact/default voices are last.
const PREFERRED_NAME_HINTS = [
  'siri',
  'google us english',
  'samantha',
  'ava',
  'allison',
  'susan',
  'nicky',
  'zoe',
  'noelle',
  'nathan',
  'evan',
  'aaron',
  'isha',
  'tom',
  'aria',
  'jenny',
  'victoria',
  'karen',
];

function scoreVoice(voice) {
  const name = voice.name.toLowerCase();
  const isEnglish = voice.lang.toLowerCase().startsWith('en');
  let score = 0;
  if (!isEnglish) score -= 10;
  if (/online \(natural\)/.test(name)) score += 6;
  if (/neural/.test(name)) score += 6;
  if (/premium|enhanced/.test(name)) score += 4;
  if (name.includes('siri')) score += 3;
  if (PREFERRED_NAME_HINTS.some((hint) => name.includes(hint))) score += 2;
  if (voice.localService === false) score += 1;
  if (/compact/.test(name)) score -= 3;
  return score;
}

async function pickVoice() {
  const voices = await loadVoices();
  if (voices.length === 0) return null;
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

export function prewarmVoices() {
  loadVoices();
}

export async function speakResults(correct, total) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const wrong = total - correct;
  const text = correct === total ? `Perfect! You got all ${total} correct!` : `You got ${correct} correct and ${wrong} wrong.`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  const voice = await pickVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}
