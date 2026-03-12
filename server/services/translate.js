/**
 * Translation service using the MyMemory free API.
 *
 * https://mymemory.translated.net/doc/spec.php
 *
 * Free tier with email: ~10 000 words / day (no key needed).
 * Set MYMEMORY_EMAIL in .env to increase the daily quota.
 */

const MYMEMORY_EMAIL = String(process.env.MYMEMORY_EMAIL || "").trim();
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_CHUNK_CHARS = 450;

/**
 * Translate a single text string from `sourceLang` to `targetLang`.
 * Returns the translated string or the original on failure.
 */
async function translateText(text, sourceLang = "el", targetLang = "en") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";

  const params = new URLSearchParams({
    q: trimmed,
    langpair: `${sourceLang}|${targetLang}`
  });
  if (MYMEMORY_EMAIL) params.set("de", MYMEMORY_EMAIL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
      signal: controller.signal
    });
    if (!response.ok) return trimmed;

    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) return trimmed;

    // MyMemory sometimes returns the input uppercased on failure
    if (translated.toUpperCase() === trimmed.toUpperCase() && translated !== trimmed) {
      return trimmed;
    }

    return translated;
  } catch {
    return trimmed;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Split long text at sentence boundaries into chunks ≤ maxChars.
 */
function splitIntoChunks(text, maxChars = MAX_CHUNK_CHARS) {
  if (text.length <= maxChars) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf(". ", maxChars);
    if (splitAt < maxChars * 0.3) splitAt = remaining.lastIndexOf(" ", maxChars);
    if (splitAt < maxChars * 0.3) splitAt = maxChars;

    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }

  return chunks.filter(Boolean);
}

/**
 * Translate a long text, splitting into chunks if needed.
 */
async function translateLongText(text, sourceLang = "el", targetLang = "en") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";

  const chunks = splitIntoChunks(trimmed);
  const translated = [];

  for (const chunk of chunks) {
    translated.push(await translateText(chunk, sourceLang, targetLang));
  }

  return translated.join(" ");
}

/**
 * Translate an array of text strings in parallel (with concurrency limit).
 */
async function translateTexts(texts, sourceLang = "el", targetLang = "en", concurrency = 3) {
  const results = new Array(texts.length);
  let cursor = 0;

  async function worker() {
    while (cursor < texts.length) {
      const i = cursor++;
      results[i] = await translateLongText(texts[i], sourceLang, targetLang);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, texts.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

/* ---- EditorJS content helpers ---- */

/**
 * Collect every translatable text from EditorJS content blocks and translate
 * them, returning a new content array with text fields replaced.
 */
async function translateContentBlocks(content, sourceLang = "el", targetLang = "en") {
  if (!Array.isArray(content) || !content.length) return [];

  const texts = [];
  const paths = [];

  content.forEach((block, bi) => {
    if (!block?.data) return;

    if (typeof block.data.text === "string" && block.data.text.trim()) {
      texts.push(block.data.text);
      paths.push({ bi, field: "text" });
    }

    if (typeof block.data.caption === "string" && block.data.caption.trim()) {
      texts.push(block.data.caption);
      paths.push({ bi, field: "caption" });
    }

    if (Array.isArray(block.data.items)) {
      block.data.items.forEach((item, ii) => {
        const itemText = typeof item === "string" ? item : item?.content;
        if (typeof itemText === "string" && itemText.trim()) {
          texts.push(itemText);
          paths.push({ bi, field: "items", ii });
        }
      });
    }
  });

  if (!texts.length) return JSON.parse(JSON.stringify(content));

  const translated = await translateTexts(texts, sourceLang, targetLang);

  const clone = JSON.parse(JSON.stringify(content));
  paths.forEach((p, i) => {
    const block = clone[p.bi];
    if (!block?.data) return;

    if (p.field === "text") block.data.text = translated[i];
    else if (p.field === "caption") block.data.caption = translated[i];
    else if (p.field === "items" && typeof p.ii === "number") {
      const item = block.data.items[p.ii];
      if (typeof item === "string") block.data.items[p.ii] = translated[i];
      else if (item && typeof item.content === "string") {
        block.data.items[p.ii] = { ...item, content: translated[i] };
      }
    }
  });

  return clone;
}

/**
 * High-level: translate an entire post (title, excerpt, metaDescription, content).
 */
async function translatePost(post, sourceLang = "el", targetLang = "en") {
  const title = String(post?.title || "").trim();
  const excerpt = String(post?.excerpt || "").trim();
  const metaDescription = String(post?.metaDescription || "").trim();

  const [titleT, excerptT, metaT, contentT] = await Promise.all([
    title ? translateLongText(title, sourceLang, targetLang) : Promise.resolve(""),
    excerpt ? translateLongText(excerpt, sourceLang, targetLang) : Promise.resolve(""),
    metaDescription ? translateLongText(metaDescription, sourceLang, targetLang) : Promise.resolve(""),
    translateContentBlocks(post?.content || [], sourceLang, targetLang)
  ]);

  return {
    title: titleT,
    excerpt: excerptT,
    metaDescription: metaT,
    contentBlocks: contentT
  };
}

/**
 * Create a simple hash of a post's translatable content for staleness checks.
 */
function computeSourceHash(post) {
  const parts = [
    String(post?.title || ""),
    String(post?.excerpt || ""),
    String(post?.metaDescription || "")
  ];

  const content = Array.isArray(post?.content) ? post.content : [];
  content.forEach(block => {
    if (block?.data?.text) parts.push(block.data.text);
    if (block?.data?.caption) parts.push(block.data.caption);
    if (Array.isArray(block?.data?.items)) {
      block.data.items.forEach(item => {
        parts.push(typeof item === "string" ? item : item?.content || "");
      });
    }
  });

  // Simple hash — not crypto, just for change detection
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return String(hash);
}

module.exports = {
  translateText,
  translateLongText,
  translateTexts,
  translateContentBlocks,
  translatePost,
  computeSourceHash
};
