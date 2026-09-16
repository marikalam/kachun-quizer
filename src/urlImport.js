const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// Strips tags/scripts/styles and decodes entities to leave roughly the
// visible text of a page - good enough for OCR-quality note extraction
// without pulling in a full HTML parser dependency.
function htmlToText(html) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, '\n');
  const withoutTags = withoutNoise.replace(/<[^>]+>/g, ' ');
  const doc = new DOMParser().parseFromString(withoutTags, 'text/html');
  const text = doc.documentElement.textContent || '';
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export async function fetchTextFromUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('That link doesn\'t look valid. Double-check it and try again.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Links need to start with http:// or https://.');
  }

  let response;
  try {
    response = await fetch(CORS_PROXY + encodeURIComponent(url.href));
  } catch {
    throw new Error("Couldn't reach that link. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error("Couldn't load that page. Make sure the link is public and try again.");
  }

  const html = await response.text();
  const text = htmlToText(html);
  if (text.length < 40) {
    throw new Error("Couldn't find any readable text at that link. Try pasting the notes instead.");
  }
  return text;
}
