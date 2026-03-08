const express = require("express");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const requireAdmin = require("../middleware/requireAdmin");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const brevo = require("../services/brevo");

const router = express.Router();

function sanitizeString(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value) {
  return sanitizeString(value, 180).toLowerCase();
}

function isValidEmail(email) {
  const value = String(email || "").trim();
  if (!value || value.length > 180) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

router.post("/subscribe", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const source = sanitizeString(req.body?.source, 80) || "site-footer";
    const sourcePath = sanitizeString(req.body?.sourcePath, 200);
    const postId = sanitizeString(req.body?.postId, 80);
    const postSlug = sanitizeString(req.body?.postSlug, 180);
    const postTitle = sanitizeString(req.body?.postTitle, 220);
    const locale = sanitizeString(req.body?.locale, 40);
    const userAgent = sanitizeString(req.get("user-agent"), 300);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const existing = await NewsletterSubscriber.findOne({ email }).select("_id").lean();
    if (existing?._id) {
      return res.json({ success: true, alreadySubscribed: true });
    }

    await NewsletterSubscriber.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          source,
          sourcePath,
          postId,
          postSlug,
          postTitle,
          locale,
          userAgent
        }
      },
      { upsert: true, new: false }
    );

    // Sync to Brevo contact list (fire-and-forget – never blocks the response)
    brevo.addContact(email, { source, sourcePath }).catch(() => {});

    return res.json({ success: true, alreadySubscribed: false });
  } catch {
    return res.status(500).json({ error: "Could not subscribe right now. Please try again in a moment." });
  }
});

router.get("/subscribers", auth, requireStaff, requireAdmin, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(2000, Math.floor(limitRaw)))
      : 300;

    const items = await NewsletterSubscriber.find({})
      .select("email source sourcePath postId postSlug postTitle locale createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const total = await NewsletterSubscriber.countDocuments({});

    return res.json({
      total,
      limit,
      items: Array.isArray(items) ? items : []
    });
  } catch {
    return res.status(500).json({ error: "Could not load subscribers right now." });
  }
});

// ─── Brevo webhook – auto-remove subscribers who unsubscribe via email ───
// Brevo sends a POST to this URL when a contact unsubscribes.
// Configure the webhook in Brevo → Settings → Webhooks:
//   URL:    https://yourdomain.com/api/newsletter/webhook/brevo
//   Events: unsubscribed  (and optionally: spam, contact_deleted)
// Secured with BREVO_WEBHOOK_SECRET (shared query-string token).
const BREVO_WEBHOOK_SECRET = (process.env.BREVO_WEBHOOK_SECRET || "").trim();

function extractBrevoWebhookValue(payload, paths) {
  for (const path of paths) {
    const segments = String(path || "").split(".").filter(Boolean);
    let cursor = payload;
    let found = true;

    for (const segment of segments) {
      if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
        found = false;
        break;
      }
      cursor = cursor[segment];
    }

    if (found && cursor != null) {
      return cursor;
    }
  }
  return "";
}

function extractBrevoWebhookEvent(payload) {
  const raw = extractBrevoWebhookValue(payload, ["event", "eventType", "type", "data.event"]);
  return sanitizeString(raw, 80).toLowerCase();
}

function extractBrevoWebhookEmail(payload) {
  const raw = extractBrevoWebhookValue(payload, [
    "email",
    "contact.email",
    "data.email",
    "data.contact.email",
    "recipient",
    "data.recipient"
  ]);
  return normalizeEmail(raw);
}

function isBrevoUnsubscribeEvent(eventName) {
  const event = sanitizeString(eventName, 120).toLowerCase();
  if (!event) return false;
  if (event.includes("unsub")) return true;
  if (event.includes("spam")) return true;
  if (event.includes("contact_deleted")) return true;
  if (event.includes("deleted")) return true;
  if (event.includes("blacklist")) return true;
  return false;
}

function normalizeBrevoWebhookPayloadList(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.events)) return body.events;
  if (body && Array.isArray(body.data)) return body.data;
  return [body];
}

router.post("/webhook/brevo", async (req, res) => {
  try {
    // ── Verify shared secret ──
    if (!BREVO_WEBHOOK_SECRET) {
      // Webhook not configured – silently accept so Brevo doesn't retry
      return res.json({ ok: true, skipped: true });
    }

    const token = req.query.secret || req.headers["x-brevo-secret"] || "";
    if (token !== BREVO_WEBHOOK_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ── Parse single or batched events ──
    const payloadItems = normalizeBrevoWebhookPayloadList(req.body);
    let processed = 0;
    let removed = 0;
    let ignored = 0;

    for (const item of payloadItems) {
      const event = extractBrevoWebhookEvent(item);
      const email = extractBrevoWebhookEmail(item);

      if (!email || !isValidEmail(email)) {
        ignored += 1;
        continue;
      }

      if (!isBrevoUnsubscribeEvent(event)) {
        ignored += 1;
        continue;
      }

      const result = await NewsletterSubscriber.deleteOne({ email });
      processed += 1;
      if (result?.deletedCount) {
        removed += 1;
      }

      console.log(
        `[Brevo Webhook] ${event || "unknown-event"} - ${email} - ` +
        (result?.deletedCount ? "removed from DB" : "not found in DB")
      );
    }

    return res.json({
      ok: true,
      received: payloadItems.length,
      processed,
      removed,
      ignored
    });
  } catch (err) {
    console.error("[Brevo Webhook] Error:", err?.message || err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Simple health endpoint so external webhook validators can verify the URL.
router.get("/webhook/brevo", (req, res) => {
  return res.status(200).json({ ok: true, service: "newsletter-brevo-webhook" });
});

router.delete("/subscribers", auth, requireStaff, requireAdmin, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const result = await NewsletterSubscriber.deleteOne({ email });
    if (!result?.deletedCount) {
      return res.status(404).json({ error: "Subscriber not found." });
    }

    // Remove from Brevo list (fire-and-forget)
    brevo.removeContactFromList(email).catch(() => {});

    return res.json({ success: true, removedEmail: email });
  } catch {
    return res.status(500).json({ error: "Could not remove subscriber right now." });
  }
});

module.exports = router;
