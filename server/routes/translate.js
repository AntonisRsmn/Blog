const express = require("express");
const Post = require("../models/Post");
const PostTranslation = require("../models/PostTranslation");
const { translatePost, computeSourceHash } = require("../services/translate");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const translateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

router.use(translateLimiter);

/**
 * GET /api/translate/post/:id?lang=en
 *
 * Returns a cached translation or translates on the fly.
 * Response: { title, excerpt, metaDescription, contentBlocks }
 */
router.get("/post/:id", async (req, res) => {
  const lang = String(req.query.lang || "en").trim().toLowerCase();
  if (lang === "el") return res.json(null);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  try {
    const post = await Post.findById(req.params.id).lean();
    if (!post || !post.published) {
      return res.status(404).json({ error: "Post not found" });
    }

    const sourceHash = computeSourceHash(post);

    // Check cache
    const cached = await PostTranslation.findOne({
      postId: post._id,
      lang
    }).lean();

    if (cached && cached.sourceHash === sourceHash) {
      return res.json({
        title: cached.title,
        excerpt: cached.excerpt,
        metaDescription: cached.metaDescription,
        contentBlocks: cached.contentBlocks
      });
    }

    // Translate
    const result = await translatePost(post, "el", lang);

    // Cache (upsert)
    await PostTranslation.findOneAndUpdate(
      { postId: post._id, lang },
      {
        title: result.title,
        excerpt: result.excerpt,
        metaDescription: result.metaDescription,
        contentBlocks: result.contentBlocks,
        sourceHash
      },
      { upsert: true, new: true }
    ).catch(() => {});

    return res.json({
      title: result.title,
      excerpt: result.excerpt,
      metaDescription: result.metaDescription,
      contentBlocks: result.contentBlocks
    });
  } catch (err) {
    console.error("[translate] single post error:", err?.message || err);
    return res.status(500).json({ error: "Translation failed" });
  }
});

/**
 * POST /api/translate/posts?lang=en
 *
 * Body: { ids: ["id1", "id2", ...] }
 * Returns: { translations: { id1: { title, excerpt }, id2: { ... }, ... } }
 *
 * Used for homepage / author page cards (title + excerpt only).
 */
router.post("/posts", async (req, res) => {
  const lang = String(req.query.lang || "en").trim().toLowerCase();
  if (lang === "el") return res.json({ translations: {} });

  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = rawIds
    .map(id => String(id || "").trim())
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .slice(0, 50);

  if (!ids.length) return res.json({ translations: {} });

  try {
    // Load posts
    const posts = await Post.find({
      _id: { $in: ids },
      published: true
    }).lean();

    const postMap = new Map(posts.map(p => [String(p._id), p]));

    // Load existing cached translations
    const cached = await PostTranslation.find({
      postId: { $in: ids },
      lang
    }).lean();

    const cachedMap = new Map(cached.map(c => [String(c.postId), c]));

    const translations = {};
    const toTranslate = [];

    for (const id of ids) {
      const post = postMap.get(id);
      if (!post) continue;

      const sourceHash = computeSourceHash(post);
      const entry = cachedMap.get(id);

      if (entry && entry.sourceHash === sourceHash) {
        translations[id] = { title: entry.title, excerpt: entry.excerpt };
      } else {
        toTranslate.push(post);
      }
    }

    // Translate missing in parallel (limited concurrency)
    const BATCH_CONCURRENCY = 3;
    for (let i = 0; i < toTranslate.length; i += BATCH_CONCURRENCY) {
      const batch = toTranslate.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (post) => {
          try {
            const result = await translatePost(post, "el", lang);
            const sourceHash = computeSourceHash(post);

            await PostTranslation.findOneAndUpdate(
              { postId: post._id, lang },
              {
                title: result.title,
                excerpt: result.excerpt,
                metaDescription: result.metaDescription,
                contentBlocks: result.contentBlocks,
                sourceHash
              },
              { upsert: true, new: true }
            ).catch(() => {});

            return { id: String(post._id), title: result.title, excerpt: result.excerpt };
          } catch {
            return { id: String(post._id), title: post.title, excerpt: post.excerpt };
          }
        })
      );

      results.forEach(r => {
        translations[r.id] = { title: r.title, excerpt: r.excerpt };
      });
    }

    return res.json({ translations });
  } catch (err) {
    console.error("[translate] batch error:", err?.message || err);
    return res.status(500).json({ error: "Translation failed" });
  }
});

module.exports = router;
