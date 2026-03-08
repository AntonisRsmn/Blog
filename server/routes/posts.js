const express = require("express");
const Post = require("../models/Post");
const auth = require("../middleware/auth");
const requireUploaderOrStaff = require("../middleware/requireUploaderOrStaff");
const User = require("../models/User");
const SearchMiss = require("../models/SearchMiss");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const FEATURED_POST_LIMIT = 6;
const CACHE_HOME_TTL_SECONDS = Number.parseInt(String(process.env.CACHE_HOME_TTL_SECONDS || "120"), 10) > 0
  ? Number.parseInt(String(process.env.CACHE_HOME_TTL_SECONDS || "120"), 10)
  : 120;
const CACHE_ARTICLE_TTL_SECONDS = Number.parseInt(String(process.env.CACHE_ARTICLE_TTL_SECONDS || "900"), 10) > 0
  ? Number.parseInt(String(process.env.CACHE_ARTICLE_TTL_SECONDS || "900"), 10)
  : 900;
const CACHE_MAX_ENTRIES = Number.parseInt(String(process.env.CACHE_MAX_ENTRIES || "300"), 10) > 0
  ? Number.parseInt(String(process.env.CACHE_MAX_ENTRIES || "300"), 10)
  : 300;
const publicResponseCache = new Map();

function getPublicCacheKey(req) {
  return `public:${req.originalUrl || req.url || req.path || "/"}`;
}

function prunePublicCache() {
  const now = Date.now();
  for (const [key, entry] of publicResponseCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      publicResponseCache.delete(key);
    }
  }

  while (publicResponseCache.size > CACHE_MAX_ENTRIES) {
    const firstKey = publicResponseCache.keys().next().value;
    if (!firstKey) break;
    publicResponseCache.delete(firstKey);
  }
}

function getPublicCachedResponse(key) {
  const entry = publicResponseCache.get(key);
  if (!entry) return null;

  if (Number(entry.expiresAt || 0) <= Date.now()) {
    publicResponseCache.delete(key);
    return null;
  }

  try {
    return JSON.parse(String(entry.payload || "null"));
  } catch {
    publicResponseCache.delete(key);
    return null;
  }
}

function setPublicCachedResponse(key, payload, ttlSeconds) {
  const ttl = Number(ttlSeconds || 0);
  if (!key || ttl <= 0) return;

  prunePublicCache();
  publicResponseCache.set(key, {
    expiresAt: Date.now() + (ttl * 1000),
    payload: JSON.stringify(payload)
  });
}

function invalidatePublicCache() {
  publicResponseCache.clear();
}

const summarizeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Summary limit reached. Try again later." }
});

function sanitizeText(value, maxLength = 300) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSlug(value) {
  return sanitizeText(value, 180)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(value) {
  const slug = String(value || "");
  if (!slug) return false;
  return !/[/?#]/.test(slug);
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const unique = new Set();
  categories.forEach(category => {
    const safe = sanitizeText(category, 40).toUpperCase();
    if (safe) unique.add(safe);
  });
  return [...unique].slice(0, 10);
}

function normalizePostCategoriesForOutput(post) {
  if (!post || !Array.isArray(post.categories)) return post;
  return {
    ...post,
    categories: normalizeCategories(post.categories)
  };
}

function extractThumbnailFromContent(content) {
  if (!Array.isArray(content)) return "";
  const imageBlock = content.find(block => block?.type === "image");
  if (!imageBlock) return "";

  const fileValue = imageBlock?.data?.file;
  if (typeof fileValue === "string") return fileValue;
  if (fileValue && typeof fileValue.url === "string") return fileValue.url;
  if (typeof imageBlock?.data?.url === "string") return imageBlock.data.url;
  return "";
}

function normalizeEditorRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "staff" || role === "uploader") return "staff";
  return role;
}

function wasPostEditedAfterCreation(post) {
  const createdAt = post?.createdAt ? new Date(post.createdAt) : null;
  const updatedAt = post?.updatedAt ? new Date(post.updatedAt) : null;
  if (!createdAt || !updatedAt) return false;

  const createdMs = createdAt.getTime();
  const updatedMs = updatedAt.getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return false;

  return updatedMs - createdMs > 1500;
}

function toListPostPayload(post) {
  const plain = typeof post?.toObject === "function" ? post.toObject() : post;
  const resolvedThumbnail = plain?.thumbnailUrl || extractThumbnailFromContent(plain?.content);
  const approvalStatus = String(plain?.approvalStatus || "approved");
  const isEditedSubmission = approvalStatus === "pending" && wasPostEditedAfterCreation(plain);
  return {
    _id: plain?._id,
    title: plain?.title || "",
    author: plain?.author || "",
    authorId: plain?.authorId || null,
    categories: normalizeCategories(Array.isArray(plain?.categories) ? plain.categories : []),
    slug: plain?.slug || "",
    excerpt: plain?.excerpt || "",
    metaDescription: plain?.metaDescription || "",
    viewCount: Number(plain?.viewCount || 0),
    createdAt: plain?.createdAt || null,
    updatedAt: plain?.updatedAt || null,
    releaseDate: plain?.releaseDate || null,
    releaseType: plain?.releaseType || "",
    includeInCalendar: !!plain?.includeInCalendar,
    featuredManual: !!plain?.featuredManual,
    featuredAddedAt: plain?.featuredAddedAt || null,
    thumbnailUrl: resolvedThumbnail,
    published: !!plain?.published,
    approvalStatus,
    approvalComment: String(plain?.approvalComment || ""),
    approvalReviewedAt: plain?.approvalReviewedAt || null,
    isEditedSubmission
  };
}

function buildValidatedPostPayload(input, isPartial = false) {
  const payload = {};

  if (!isPartial || typeof input.title === "string") {
    const title = sanitizeText(input.title, 180);
    if (!title) return { error: "Title is required" };
    payload.title = title;
  }

  if (!isPartial || typeof input.slug === "string") {
    const slug = normalizeSlug(input.slug);
    if (!slug || !isValidSlug(slug)) {
      return { error: "Slug is invalid. Remove / ? # characters and try again." };
    }
    payload.slug = slug;
  }

  if (Array.isArray(input.categories) || !isPartial) {
    payload.categories = normalizeCategories(input.categories);
  }

  if (Array.isArray(input.content) || !isPartial) {
    if (!Array.isArray(input.content) || input.content.length === 0) {
      return { error: "Content is required" };
    }
    if (input.content.length > 200) {
      return { error: "Content is too large" };
    }
    payload.content = input.content;
    payload.thumbnailUrl = extractThumbnailFromContent(input.content);
  }

  if (typeof input.excerpt === "string") {
    payload.excerpt = sanitizeText(input.excerpt, 400);
  } else if (!isPartial) {
    payload.excerpt = "";
  }

  if (typeof input.metaDescription === "string") {
    payload.metaDescription = sanitizeText(input.metaDescription, 220);
  } else if (!isPartial) {
    payload.metaDescription = "";
  }

  if (typeof input.published === "boolean") {
    payload.published = input.published;
  } else if (!isPartial) {
    payload.published = true;
  }

  if (typeof input.includeInCalendar === "boolean") {
    payload.includeInCalendar = input.includeInCalendar;
  } else if (!isPartial) {
    payload.includeInCalendar = false;
  }

  if (typeof input.releaseType === "string") {
    const releaseType = sanitizeText(input.releaseType, 20);
    if (releaseType !== "" && releaseType !== "Game" && releaseType !== "Tech") {
      return { error: "Release type is invalid" };
    }
    payload.releaseType = releaseType;
  } else if (!isPartial) {
    payload.releaseType = "";
  }

  if (Object.prototype.hasOwnProperty.call(input, "releaseDate")) {
    if (input.releaseDate === null || input.releaseDate === "") {
      payload.releaseDate = null;
    } else {
      const parsed = new Date(input.releaseDate);
      if (Number.isNaN(parsed.getTime())) {
        return { error: "Release date is invalid" };
      }
      payload.releaseDate = parsed;
    }
  } else if (!isPartial) {
    payload.releaseDate = null;
  }

  return { value: payload };
}

async function getCurrentUser(req) {
  const user = await User.findById(req.user.userId)
    .select("_id role firstName lastName username email")
    .lean();
  if (!user) return null;

  const normalizedFromMiddleware = normalizeEditorRole(req.userRole);
  const normalizedFromUser = normalizeEditorRole(user.role);
  return {
    ...user,
    role: normalizedFromMiddleware || normalizedFromUser
  };
}

function getAuthorDisplayName(user) {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || String(user?.username || "").trim() || String(user?.email || "").trim() || "Unknown";
}

function getAuthorIdentityCandidates(user) {
  const fullName = getAuthorDisplayName(user);
  const username = String(user?.username || "").trim();
  const email = String(user?.email || "").trim();
  return [...new Set([fullName, username, email].filter(Boolean))];
}

function getAuthorOwnershipCandidates(user) {
  const fullName = getAuthorDisplayName(user);
  const username = String(user?.username || "").trim();
  const email = String(user?.email || "").trim();
  return [...new Set([fullName, username, email].filter((value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return false;
    return normalized.toLowerCase() !== "unknown";
  }))];
}

function toCaseInsensitiveExactRegex(value) {
  const escaped = String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

function buildStaffOwnershipQuery(user) {
  const ownerCandidates = getAuthorOwnershipCandidates(user);
  const ownerPatterns = ownerCandidates.map(toCaseInsensitiveExactRegex);
  const fallbackQuery = ownerCandidates.length
    ? [
        {
          $and: [
            { authorId: { $exists: false } },
            { author: { $in: ownerPatterns } }
          ]
        },
        {
          $and: [
            { authorId: null },
            { author: { $in: ownerPatterns } }
          ]
        }
      ]
    : [];

  return {
    $or: [
      { authorId: user._id },
      ...fallbackQuery
    ]
  };
}

function userOwnsPost(user, post) {
  if (!user || !post) return false;

  if (post.authorId && String(post.authorId) === String(user._id)) {
    return true;
  }

  if (!post.authorId) {
    const author = String(post.author || "").trim().toLowerCase();
    const candidates = getAuthorOwnershipCandidates(user).map(item => item.toLowerCase());
    return !!author && candidates.includes(author);
  }

  return false;
}

function collectTextValues(value, result) {
  if (typeof value === "string") {
    result.push(value.replace(/<[^>]*>/g, " "));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectTextValues(item, result));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectTextValues(item, result));
  }
}

function extractPostPlainText(post) {
  const values = [];
  collectTextValues(post?.content || [], values);

  return values
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidateLink(raw, origin) {
  const value = String(raw || "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|mdash|ndash);/gi, " ")
    .replace(/[\s'"`]+$/g, "")
    .replace(/[),.;:!?\]]+$/g, "")
    .trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (lower.startsWith("#") || lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return null;
  }

  if (/[<>]/.test(value) || /<\/?[a-z][^>]*>$/i.test(value)) {
    return null;
  }

  if (/^\/(?:a|p|span|strong|em|blockquote|script|div|img|br)\b/i.test(value)) {
    return null;
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractLinksFromTextValue(text, origin) {
  const links = [];
  const value = String(text || "");
  if (!value) return links;

  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const urlRegex = /(https?:\/\/[^\s<>")']+|(?<![A-Za-z0-9.])\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+|post\.html\?[^\s<>")']+)/gi;

  let match = hrefRegex.exec(value);
  while (match) {
    const parsed = normalizeCandidateLink(match[1], origin);
    if (parsed) links.push(parsed.href);
    match = hrefRegex.exec(value);
  }

  const plainValue = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|mdash|ndash);/gi, " ")
    .replace(/\s+/g, " ");

  match = urlRegex.exec(plainValue);
  while (match) {
    const parsed = normalizeCandidateLink(match[1], origin);
    if (parsed) links.push(parsed.href);
    match = urlRegex.exec(plainValue);
  }

  return [...new Set(links)];
}

function extractLinksFromPost(post, origin) {
  const values = [];
  collectTextValues(post?.content || [], values);

  const directValues = [];
  (Array.isArray(post?.content) ? post.content : []).forEach((block) => {
    const source = block?.data?.source || block?.data?.embed || block?.data?.link;
    if (typeof source === "string" && source.trim()) {
      directValues.push(source);
    }
  });

  values.push(String(post?.excerpt || ""));
  values.push(String(post?.metaDescription || ""));
  values.push(...directValues);

  const links = values.flatMap(value => extractLinksFromTextValue(value, origin));
  return [...new Set(links)].slice(0, 60);
}

async function fetchStatusWithTimeout(url, method = "HEAD", timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "rusman-link-checker" }
    });
    return { ok: response.ok, status: response.status, reason: response.ok ? "ok" : `HTTP ${response.status}` };
  } catch {
    return { ok: false, status: 0, reason: "request-failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function evaluateLink(url, context) {
  const { origin, knownSlugs, knownIds } = context;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 0, reason: "invalid-url", type: "unknown" };
  }

  const isInternal = parsed.origin === origin;
  const type = isInternal ? "internal" : "outbound";

  if (isInternal) {
    if (parsed.pathname === "/post.html") {
      const slug = String(parsed.searchParams.get("slug") || "").trim().toLowerCase();
      const id = String(parsed.searchParams.get("id") || "").trim();
      if (slug && knownSlugs.has(slug)) return { ok: true, status: 200, reason: "ok", type };
      if (id && knownIds.has(id)) return { ok: true, status: 200, reason: "ok", type };
      return { ok: false, status: 404, reason: "post-not-found", type };
    }

    const staticOk = new Set(["/", "/privacy.html", "/tos.html", "/author.html", "/post.html", "/no-access.html"]);
    if (staticOk.has(parsed.pathname)) {
      return { ok: true, status: 200, reason: "ok", type };
    }
  }

  const headResult = await fetchStatusWithTimeout(url, "HEAD");
  if (headResult.ok) return { ...headResult, type };

  if (headResult.status === 405 || headResult.status === 403 || headResult.status === 0) {
    const getResult = await fetchStatusWithTimeout(url, "GET");
    return { ...getResult, type };
  }

  return { ...headResult, type };
}

function getAnalyticsBaseQuery(user) {
  return user.role === "admin"
    ? { published: true }
    : {
        published: true,
        ...buildStaffOwnershipQuery(user)
      };
}

function buildAnalyticsPayload(posts) {
  const orderedPosts = Array.isArray(posts) ? posts : [];

  const totals = {
    posts: orderedPosts.length,
    views: orderedPosts.reduce((sum, post) => sum + Number(post?.viewCount || 0), 0)
  };

  const rankedPosts = orderedPosts.map((post, index) => ({
    rank: index + 1,
    _id: post._id,
    title: post.title || "Untitled",
    slug: post.slug || "",
    views: Number(post.viewCount || 0)
  }));

  const categoryMap = new Map();
  const authorMap = new Map();

  orderedPosts.forEach(post => {
    const views = Number(post?.viewCount || 0);
    const categories = Array.isArray(post?.categories) && post.categories.length
      ? post.categories
      : ["UNCATEGORIZED"];

    categories.forEach(category => {
      const key = sanitizeText(category, 50).toUpperCase() || "UNCATEGORIZED";
      categoryMap.set(key, (categoryMap.get(key) || 0) + views);
    });

    const author = sanitizeText(post?.author, 80) || "Unknown";
    authorMap.set(author, (authorMap.get(author) || 0) + views);
  });

  const rankedCategories = [...categoryMap.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([name, views], index) => ({ rank: index + 1, name, views }));

  const rankedAuthors = [...authorMap.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([name, views], index) => ({ rank: index + 1, name, views }));

  return {
    totals,
    rankedPosts,
    rankedCategories,
    rankedAuthors,
    topPosts: rankedPosts.slice(0, 10),
    topCategories: rankedCategories.slice(0, 10),
    topAuthors: rankedAuthors.slice(0, 10)
  };
}

function buildFallbackSummary(post) {
  const excerpt = sanitizeText(post?.excerpt, 280);
  if (excerpt) return excerpt;

  const body = extractPostPlainText(post);
  if (!body) return "Η σύνοψη δεν είναι διαθέσιμη για αυτό το άρθρο ακόμα.";
  if (body.length <= 280) return body;
  return `${body.slice(0, 277).trimEnd()}...`;
}

async function generateAiSummary(post) {
  const providerSetting = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  const groqApiKey = String(process.env.GROQ_API_KEY || "").trim();
  const openAiApiKey = String(process.env.OPENAI_API_KEY || "").trim();

  const providers = [];
  const addGroq = () => {
    if (!groqApiKey) return;
    providers.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqApiKey,
      model: String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim()
    });
  };
  const addOpenAi = () => {
    if (!openAiApiKey) return;
    providers.push({
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openAiApiKey,
      model: String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim()
    });
  };

  if (providerSetting === "groq") {
    addGroq();
  } else if (providerSetting === "openai") {
    addOpenAi();
  } else {
    addGroq();
    addOpenAi();
  }

  if (!providers.length) {
    return { summary: buildFallbackSummary(post), source: "fallback" };
  }

  const title = sanitizeText(post?.title, 200);
  const excerpt = sanitizeText(post?.excerpt, 400);
  const contentText = extractPostPlainText(post).slice(0, 7000);

  const prompt = [
    `Title: ${title}`,
    excerpt ? `Existing excerpt: ${excerpt}` : "",
    `Content: ${contentText}`
  ].filter(Boolean).join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    for (const provider of providers) {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.3,
          max_tokens: 180,
          messages: [
            {
              role: "system",
              content: "Δημιουργείς σύντομες περιλήψεις άρθρων για αναγνώστες ιστοσελίδας. Η απάντηση ΠΑΝΤΑ στα Ελληνικά. Κράτα το κείμενο σαφές και αντικειμενικό, 2 έως 4 μικρές προτάσεις, χωρίς bullets."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      const raw = payload?.choices?.[0]?.message?.content;
      const summary = sanitizeText(raw, 520);

      if (!summary) {
        continue;
      }

      return { summary, source: provider.name };
    }

    return { summary: buildFallbackSummary(post), source: "fallback" };
  } catch {
    return { summary: buildFallbackSummary(post), source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

/* ---------- PUBLIC ---------- */

// Get all published posts
router.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const cacheKey = getPublicCacheKey(req);
  const cachedPayload = getPublicCachedResponse(cacheKey);
  if (cachedPayload) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cachedPayload);
  }

  const listMode = String(req.query?.list || "") === "1";
  const selectFields = listMode
    ? "title author authorId categories slug excerpt metaDescription createdAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl viewCount"
    : "title author authorId categories slug excerpt metaDescription createdAt content releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl published approvalStatus approvalComment approvalReviewedAt";

  const posts = await Post.find({ published: true })
    .select(selectFields)
    .sort({ createdAt: -1 })
    .lean();

  if (listMode) {
    const listPayload = posts.map(toListPostPayload);

    const missingThumbnailWrites = listPayload
      .filter(item => item?._id && item.thumbnailUrl)
      .map(item => ({
        updateOne: {
          filter: { _id: item._id, $or: [{ thumbnailUrl: { $exists: false } }, { thumbnailUrl: "" }] },
          update: { $set: { thumbnailUrl: item.thumbnailUrl } }
        }
      }));

    if (missingThumbnailWrites.length) {
      Post.bulkWrite(missingThumbnailWrites, { ordered: false }).catch(() => {});
    }

    setPublicCachedResponse(cacheKey, listPayload, CACHE_HOME_TTL_SECONDS);
    res.setHeader("X-Cache", "MISS");
    return res.json(listPayload);
  }

  const payload = posts.map(normalizePostCategoriesForOutput);
  setPublicCachedResponse(cacheKey, payload, CACHE_HOME_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
});

router.get("/manage", auth, requireUploaderOrStaff, async (req, res) => {
  const listMode = String(req.query?.list || "") === "1";
  const selectFields = listMode
    ? "title author authorId categories slug excerpt metaDescription createdAt updatedAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl content published approvalStatus approvalComment approvalReviewedAt"
    : "title author authorId categories slug excerpt metaDescription createdAt updatedAt content releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl published approvalStatus approvalComment approvalReviewedAt";

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const baseQuery = user.role === "admin"
    ? {}
    : buildStaffOwnershipQuery(user);

  const posts = await Post.find(baseQuery)
    .select(selectFields)
    .sort({ createdAt: -1 })
    .lean();

  if (listMode) {
    const listPayload = posts.map(toListPostPayload);

    const missingThumbnailWrites = listPayload
      .filter(item => item?._id && item.thumbnailUrl)
      .map(item => ({
        updateOne: {
          filter: { _id: item._id, $or: [{ thumbnailUrl: { $exists: false } }, { thumbnailUrl: "" }] },
          update: { $set: { thumbnailUrl: item.thumbnailUrl } }
        }
      }));

    if (missingThumbnailWrites.length) {
      Post.bulkWrite(missingThumbnailWrites, { ordered: false }).catch(() => {});
    }

    return res.json(listPayload);
  }

  res.json(posts.map(normalizePostCategoriesForOutput));
});

router.get("/manage/pending-count", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const baseQuery = user.role === "admin"
    ? {}
    : buildStaffOwnershipQuery(user);

  const pendingCount = await Post.countDocuments({
    ...baseQuery,
    approvalStatus: "pending"
  });

  return res.json({ pendingCount });
});

router.get("/by-slug", async (req, res) => {
  res.setHeader("Cache-Control", `public, max-age=${CACHE_ARTICLE_TTL_SECONDS}, must-revalidate`);
  const cacheKey = getPublicCacheKey(req);
  const cachedPayload = getPublicCachedResponse(cacheKey);
  if (cachedPayload) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cachedPayload);
  }

  const rawSlug = sanitizeText(req.query?.slug, 180);
  if (!rawSlug) {
    return res.status(400).json({ error: "Invalid slug" });
  }

  let post = await Post.findOne({ slug: rawSlug, published: true });
  if (!post) {
    post = await Post.findOne({ slug: rawSlug.toLowerCase(), published: true });
  }

  if (!post) return res.status(404).json({ error: "Not found" });
  const payload = normalizePostCategoriesForOutput(post.toObject());
  setPublicCachedResponse(cacheKey, payload, CACHE_ARTICLE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  return res.json(payload);
});

router.get("/by-id/:id", async (req, res) => {
  res.setHeader("Cache-Control", `public, max-age=${CACHE_ARTICLE_TTL_SECONDS}, must-revalidate`);
  const cacheKey = getPublicCacheKey(req);
  const cachedPayload = getPublicCachedResponse(cacheKey);
  if (cachedPayload) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cachedPayload);
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const post = await Post.findOne({ _id: req.params.id, published: true });
  if (!post) return res.status(404).json({ error: "Not found" });
  const payload = normalizePostCategoriesForOutput(post.toObject());
  setPublicCachedResponse(cacheKey, payload, CACHE_ARTICLE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  return res.json(payload);
});

router.get("/by-author", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const cacheKey = getPublicCacheKey(req);
  const cachedPayload = getPublicCachedResponse(cacheKey);
  if (cachedPayload) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cachedPayload);
  }

  const author = sanitizeText(req.query?.author, 120);
  if (!author) return res.status(400).json({ error: "Author is required" });

  const pattern = new RegExp(`^${escapeRegex(author)}$`, "i");
  const posts = await Post.find({ published: true, author: pattern })
    .select("title author authorId categories slug excerpt metaDescription createdAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl viewCount")
    .sort({ createdAt: -1 })
    .lean();

  const payload = posts.map(toListPostPayload);
  setPublicCachedResponse(cacheKey, payload, CACHE_HOME_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  return res.json(payload);
});

router.post("/track-view", async (req, res) => {
  const rawId = String(req.body?.id || "").trim();
  const rawSlug = sanitizeText(req.body?.slug, 180);
  const now = new Date();

  let query = null;
  if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
    query = { _id: rawId, published: true };
  } else if (rawSlug) {
    query = { slug: rawSlug, published: true };
  }

  if (!query) return res.status(400).json({ error: "Post id or slug is required" });

  const updated = await Post.findOneAndUpdate(
    query,
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } },
    { new: true }
  ).select("_id viewCount");

  if (!updated && rawSlug) {
    const fallback = await Post.findOneAndUpdate(
      { slug: rawSlug.toLowerCase(), published: true },
      { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } },
      { new: true }
    ).select("_id viewCount");

    if (!fallback) return res.status(404).json({ error: "Post not found" });
    return res.json({ success: true, viewCount: Number(fallback.viewCount || 0) });
  }

  if (!updated) return res.status(404).json({ error: "Post not found" });
  return res.json({ success: true, viewCount: Number(updated.viewCount || 0) });
});

router.post("/summarize", summarizeLimiter, async (req, res) => {
  const rawId = String(req.body?.id || "").trim();
  const rawSlug = sanitizeText(req.body?.slug, 180);

  let post = null;

  if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
    post = await Post.findOne({ _id: rawId, published: true }).lean();
  }

  if (!post && rawSlug) {
    post = await Post.findOne({ slug: rawSlug, published: true }).lean();
    if (!post) {
      post = await Post.findOne({ slug: rawSlug.toLowerCase(), published: true }).lean();
    }
  }

  if (!post) {
    return res.status(404).json({ error: "Post not found." });
  }

  const result = await generateAiSummary(post);
  return res.json(result);
});

router.get("/manage/by-id/:id", auth, requireUploaderOrStaff, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });

  if (user.role === "staff" && !userOwnsPost(user, post)) {
    return res.status(403).json({ error: "You can only access your own posts" });
  }

  return res.json(normalizePostCategoriesForOutput(post.toObject()));
});

router.get("/manage/featured", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage featured posts" });
  }

  const featuredPosts = await Post.find({ featuredManual: true })
    .select("title author authorId categories slug excerpt metaDescription createdAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl content")
    .sort({ featuredAddedAt: -1, createdAt: -1 })
    .limit(FEATURED_POST_LIMIT)
    .lean();

  return res.json(featuredPosts.map(toListPostPayload));
});

router.post("/manage/featured", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage featured posts" });
  }

  const postId = String(req.body?.postId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const targetPost = await Post.findById(postId).select("_id featuredManual");
  if (!targetPost) return res.status(404).json({ error: "Post not found" });

  const featuredNow = await Post.find({ featuredManual: true })
    .select("_id featuredAddedAt")
    .sort({ featuredAddedAt: 1, createdAt: 1 })
    .lean();

  let removedCount = 0;
  const targetAlreadyFeatured = featuredNow.some(item => String(item._id) === String(targetPost._id));

  if (!targetAlreadyFeatured && featuredNow.length >= FEATURED_POST_LIMIT) {
    const overflow = featuredNow.length - FEATURED_POST_LIMIT + 1;
    const idsToRemove = featuredNow.slice(0, overflow).map(item => item._id);
    if (idsToRemove.length) {
      await Post.updateMany(
        { _id: { $in: idsToRemove } },
        { $set: { featuredManual: false, featuredAddedAt: null } }
      );
      removedCount = idsToRemove.length;
    }
  }

  const now = new Date();
  const updated = await Post.findByIdAndUpdate(
    postId,
    { $set: { featuredManual: true, featuredAddedAt: now } },
    { new: true }
  );

  invalidatePublicCache();

  return res.json({
    success: true,
    removedCount,
    post: toListPostPayload(updated)
  });
});

router.delete("/manage/featured/:id", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage featured posts" });
  }

  const postId = String(req.params?.id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const updated = await Post.findByIdAndUpdate(
    postId,
    { $set: { featuredManual: false, featuredAddedAt: null } },
    { new: true }
  );

  if (!updated) return res.status(404).json({ error: "Post not found" });
  invalidatePublicCache();
  return res.json({ success: true });
});

router.get("/manage/analytics", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const baseQuery = getAnalyticsBaseQuery(user);

  const posts = await Post.find(baseQuery)
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);

  let topAuthors = analytics.topAuthors;
  if (user.role === "staff") {
    const globalAuthorPosts = await Post.find({ published: true })
      .select("title slug author categories createdAt viewCount")
      .sort({ viewCount: -1, createdAt: -1 })
      .lean();
    const globalAnalytics = buildAnalyticsPayload(globalAuthorPosts);
    topAuthors = globalAnalytics.topAuthors;
  }

  return res.json({
    totals: analytics.totals,
    topPosts: analytics.topPosts,
    topCategories: analytics.topCategories,
    topAuthors
  });
});

router.get("/manage/analytics/posts", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find(getAnalyticsBaseQuery(user))
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({ totals: analytics.totals, items: analytics.rankedPosts });
});

router.get("/manage/analytics/categories", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find(getAnalyticsBaseQuery(user))
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({ totals: analytics.totals, items: analytics.rankedCategories });
});

router.get("/manage/analytics/authors", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const authorsQuery = user.role === "staff"
    ? { published: true }
    : getAnalyticsBaseQuery(user);

  const posts = await Post.find(authorsQuery)
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({ totals: analytics.totals, items: analytics.rankedAuthors });
});

router.get(["/manage/analytics/search-misses", "/manage/analytics/search_misses"], auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const rawLimit = Number(req.query?.limit);
  const rawSinceDays = Number(req.query?.sinceDays);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 30;
  const sinceDays = Number.isFinite(rawSinceDays) ? Math.max(1, Math.min(365, Math.floor(rawSinceDays))) : 30;
  const sinceDate = new Date(Date.now() - (sinceDays * 24 * 60 * 60 * 1000));

  const query = { createdAt: { $gte: sinceDate } };

  const [recent, groupedRows, total] = await Promise.all([
    SearchMiss.find(query)
      .select("query normalizedQuery path locale createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    SearchMiss.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$normalizedQuery",
          count: { $sum: 1 },
          lastSeenAt: { $max: "$createdAt" },
          sampleQuery: { $first: "$query" },
          paths: { $addToSet: "$path" }
        }
      },
      { $sort: { count: -1, lastSeenAt: -1 } },
      { $limit: limit }
    ]),
    SearchMiss.countDocuments(query)
  ]);

  const topMissingQueries = groupedRows.map((row, index) => ({
    rank: index + 1,
    query: String(row?.sampleQuery || row?._id || "").trim(),
    normalizedQuery: String(row?._id || "").trim(),
    misses: Number(row?.count || 0),
    lastSeenAt: row?.lastSeenAt || null,
    paths: Array.isArray(row?.paths) ? row.paths.slice(0, 5) : []
  }));

  return res.json({
    filters: { limit, sinceDays },
    retentionDays: Number(process.env.SEARCH_ANALYTICS_RETENTION_DAYS || 120),
    total,
    topMissingQueries,
    recent: Array.isArray(recent) ? recent : []
  });
});

router.get(["/manage/analytics/link-health", "/manage/analytics/link_health"], auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const baseQuery = getAnalyticsBaseQuery(user);
  const posts = await Post.find(baseQuery)
    .select("_id title slug excerpt metaDescription content createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const origin = `${req.protocol}://${req.get("host")}`;
  const knownSlugs = new Set(posts.map(post => String(post?.slug || "").trim().toLowerCase()).filter(Boolean));
  const knownIds = new Set(posts.map(post => String(post?._id || "").trim()).filter(Boolean));

  const linkRefs = [];
  posts.forEach((post) => {
    const links = extractLinksFromPost(post, origin);
    links.forEach((url) => {
      linkRefs.push({
        postId: String(post?._id || ""),
        title: String(post?.title || "Untitled"),
        slug: String(post?.slug || ""),
        url
      });
    });
  });

  const uniqueLinks = [...new Set(linkRefs.map(item => item.url))].slice(0, 140);
  const resultsMap = new Map();

  for (const url of uniqueLinks) {
    const result = await evaluateLink(url, { origin, knownSlugs, knownIds });
    resultsMap.set(url, result);
  }

  const broken = linkRefs
    .map((ref) => {
      const check = resultsMap.get(ref.url);
      if (!check || check.ok) return null;
      return {
        postId: ref.postId,
        title: ref.title,
        slug: ref.slug,
        url: ref.url,
        type: check.type,
        status: Number(check.status || 0),
        reason: check.reason
      };
    })
    .filter(Boolean);

  const internalBroken = broken.filter(item => item.type === "internal").length;
  const outboundBroken = broken.filter(item => item.type === "outbound").length;

  return res.json({
    checkedAt: new Date().toISOString(),
    totals: {
      posts: posts.length,
      linksDiscovered: linkRefs.length,
      uniqueLinksChecked: uniqueLinks.length,
      broken: broken.length,
      internalBroken,
      outboundBroken
    },
    broken: broken.slice(0, 300)
  });
});

// Get single post by slug
router.get("/:slug", async (req, res) => {
  res.setHeader("Cache-Control", `public, max-age=${CACHE_ARTICLE_TTL_SECONDS}, must-revalidate`);
  const cacheKey = getPublicCacheKey(req);
  const cachedPayload = getPublicCachedResponse(cacheKey);
  if (cachedPayload) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cachedPayload);
  }

  const rawSlug = String(req.params.slug || "").trim();
  if (!rawSlug || rawSlug.length > 180) {
    return res.status(400).json({ error: "Invalid slug" });
  }

  let post = await Post.findOne({ slug: rawSlug, published: true });
  if (!post) {
    post = await Post.findOne({ slug: rawSlug.toLowerCase(), published: true });
  }

  if (!post) return res.status(404).json({ error: "Not found" });
  const payload = normalizePostCategoriesForOutput(post.toObject());
  setPublicCachedResponse(cacheKey, payload, CACHE_ARTICLE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
});

/* ---------- ADMIN ---------- */

// Create post
router.post("/", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { value, error } = buildValidatedPostPayload(req.body, false);
  if (error) return res.status(400).json({ error });

  const author = getAuthorDisplayName(user);
  const isAdmin = user.role === "admin";
  const createPayload = {
    ...value,
    author,
    authorId: user?._id,
    published: isAdmin,
    approvalStatus: isAdmin ? "approved" : "pending",
    approvalComment: "",
    approvalReviewedAt: isAdmin ? new Date() : null,
    approvalReviewedBy: isAdmin ? user._id : null
  };
  try {
    const post = await Post.create(createPayload);
    invalidatePublicCache();
    res.json(post);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      return res.status(409).json({ error: "A post with this slug already exists. Please choose a different slug." });
    }
    throw err;
  }
});

// Update post
router.put("/:id", auth, requireUploaderOrStaff, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { value: updates, error } = buildValidatedPostPayload(req.body, true);
  if (error) return res.status(400).json({ error });

  delete updates.author;
  delete updates.authorId;
  delete updates.approvalStatus;
  delete updates.approvalComment;
  delete updates.approvalReviewedAt;
  delete updates.approvalReviewedBy;

  const existing = await Post.findById(req.params.id).select("author authorId approvalStatus published");
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (user.role === "staff" && !userOwnsPost(user, existing)) {
    return res.status(403).json({ error: "You can only edit your own posts" });
  }

  if (!existing.author) {
    updates.author = getAuthorDisplayName(user);
    updates.authorId = user?._id;
  } else if (!existing.authorId && user.role === "staff") {
    updates.authorId = user._id;
  }

  if (user.role === "staff") {
    updates.published = false;
    updates.approvalStatus = "pending";
    updates.approvalComment = "";
    updates.approvalReviewedAt = null;
    updates.approvalReviewedBy = null;
  } else if (String(existing.approvalStatus || "approved") !== "approved") {
    updates.published = false;
    updates.approvalStatus = String(existing.approvalStatus || "pending");
  }

  try {
    const post = await Post.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    invalidatePublicCache();
    res.json(post);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      return res.status(409).json({ error: "A post with this slug already exists. Please choose a different slug." });
    }
    throw err;
  }
});

router.patch("/:id/approval", auth, requireUploaderOrStaff, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can review posts" });
  }

  const requestedStatus = String(req.body?.status || "").trim().toLowerCase();
  if (requestedStatus !== "approved" && requestedStatus !== "rejected") {
    return res.status(400).json({ error: "Status must be approved or rejected" });
  }

  const comment = sanitizeText(req.body?.comment, 600);
  const updates = {
    approvalStatus: requestedStatus,
    approvalComment: comment,
    approvalReviewedAt: new Date(),
    approvalReviewedBy: user._id,
    published: requestedStatus === "approved"
  };

  const post = await Post.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!post) return res.status(404).json({ error: "Not found" });

  invalidatePublicCache();

  return res.json(toListPostPayload(post));
});

// Delete post
router.delete("/:id", auth, requireUploaderOrStaff, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = await Post.findById(req.params.id).select("author authorId");
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (user.role === "staff" && !userOwnsPost(user, existing)) {
    return res.status(403).json({ error: "You can only delete your own posts" });
  }

  await Post.findByIdAndDelete(req.params.id);
  invalidatePublicCache();
  res.json({ success: true });
});

module.exports = router;
