const express = require("express");
const crypto = require("crypto");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const StaffAccess = require("../models/StaffAccess");
const User = require("../models/User");

const router = express.Router();
const STAFF_CACHE_TTL_SECONDS = Number.parseInt(String(process.env.CACHE_STAFF_TTL_SECONDS || "30"), 10) > 0
  ? Number.parseInt(String(process.env.CACHE_STAFF_TTL_SECONDS || "30"), 10)
  : 30;
let staffEntriesCache = {
  expiresAt: 0,
  etag: "",
  serialized: ""
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeAccessRole(value) {
  if (value === "admin") return "admin";
  if (value === "staff") return "staff";
  if (value === "uploader") return "staff";
  return "admin";
}

function normalizeUserRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "staff" || role === "uploader") return "staff";
  if (role === "commenter") return "commenter";
  return "";
}

function getEnvStaffEmails() {
  const raw = process.env.STAFF_EMAILS || "";
  return raw
    .split(",")
    .map(entry => normalizeEmail(entry))
    .filter(Boolean);
}

function buildWeakEtag(serialized) {
  const hash = crypto
    .createHash("sha1")
    .update(String(serialized || ""))
    .digest("hex");
  return `W/"${hash}"`;
}

function requestHasMatchingEtag(req, etag) {
  if (!etag) return false;
  const ifNoneMatch = String(req.headers["if-none-match"] || "").trim();
  if (!ifNoneMatch) return false;
  if (ifNoneMatch === "*") return true;
  return ifNoneMatch
    .split(",")
    .map(value => value.trim())
    .includes(etag);
}

function getFreshStaffCacheEntry() {
  if (!staffEntriesCache.serialized || Number(staffEntriesCache.expiresAt || 0) <= Date.now()) {
    return null;
  }

  return staffEntriesCache;
}

function setStaffCacheEntry(payload) {
  const serialized = JSON.stringify(payload);
  const etag = buildWeakEtag(serialized);
  staffEntriesCache = {
    expiresAt: Date.now() + (STAFF_CACHE_TTL_SECONDS * 1000),
    etag,
    serialized
  };
  return staffEntriesCache;
}

function invalidateStaffCacheEntry() {
  staffEntriesCache = {
    expiresAt: 0,
    etag: "",
    serialized: ""
  };
}

function applyStaffCacheHeaders(res, etag) {
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  if (etag) {
    res.setHeader("ETag", etag);
  }
}

async function buildStaffEntriesPayload() {
  const dbEntries = await StaffAccess.find().select("email role updatedAt").sort({ email: 1 });
  const envEmails = getEnvStaffEmails();

  const emailMap = new Map();

  dbEntries.forEach(entry => {
    emailMap.set(entry.email, {
      email: entry.email,
      source: "database",
      role: normalizeAccessRole(entry.role),
      updatedAt: entry.updatedAt
    });
  });

  envEmails.forEach(email => {
    if (emailMap.has(email)) {
      const current = emailMap.get(email);
      emailMap.set(email, {
        ...current,
        source: "env+database",
        role: "admin"
      });
    } else {
      emailMap.set(email, {
        email,
        source: "env",
        role: "admin",
        updatedAt: null
      });
    }
  });

  const emails = [...emailMap.keys()];
  const users = emails.length
    ? await User.find({ email: { $in: emails } }).select("email username firstName lastName role")
    : [];

  const userByEmail = new Map();
  users.forEach(user => {
    userByEmail.set(user.email, {
      username: user.username || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: normalizeUserRole(user.role)
    });
  });

  const entries = [...emailMap.values()]
    .sort((a, b) => a.email.localeCompare(b.email))
    .map(entry => {
      const linkedUser = userByEmail.get(entry.email) || {
        username: "",
        firstName: "",
        lastName: ""
      };

      const role = entry.source === "env" || entry.source === "env+database"
        ? "admin"
        : normalizeAccessRole(entry.role);

      return {
        ...entry,
        role,
        user: linkedUser,
        canPost: linkedUser.role === "admin" || linkedUser.role === "staff"
      };
    });

  return { entries };
}

router.get("/", auth, requireStaff, async (req, res) => {
  const cached = getFreshStaffCacheEntry();
  if (cached) {
    applyStaffCacheHeaders(res, cached.etag);
    if (requestHasMatchingEtag(req, cached.etag)) {
      return res.status(304).end();
    }

    return res.type("application/json").send(cached.serialized);
  }

  const payload = await buildStaffEntriesPayload();
  const cacheEntry = setStaffCacheEntry(payload);
  applyStaffCacheHeaders(res, cacheEntry.etag);
  if (requestHasMatchingEtag(req, cacheEntry.etag)) {
    return res.status(304).end();
  }

  return res.type("application/json").send(cacheEntry.serialized);
});

router.post("/", auth, requireStaff, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const role = "staff";
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  const linkedUser = await User.findOne({ email }).select("_id email");
  if (!linkedUser) {
    return res.status(404).json({ error: "No account found for this email. Ask them to sign up first." });
  }

  await StaffAccess.findOneAndUpdate(
    { email },
    { email, role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.updateMany({ email }, { $set: { role: "commenter" } });
  invalidateStaffCacheEntry();

  res.json({ success: true, email, role, canPost: false });
});

router.delete("/:email", auth, requireStaff, async (req, res) => {
  const email = normalizeEmail(decodeURIComponent(req.params.email));
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  const envStaffEmails = getEnvStaffEmails();
  if (envStaffEmails.includes(email)) {
    return res.status(400).json({ error: "This email is managed by STAFF_EMAILS and cannot be removed here." });
  }

  await StaffAccess.deleteOne({ email });
  await User.updateMany({ email }, { $set: { role: "commenter" } });
  invalidateStaffCacheEntry();

  res.json({ success: true, email });
});

router.patch("/:email/post-access", auth, requireStaff, async (req, res) => {
  const email = normalizeEmail(decodeURIComponent(req.params.email));
  const canPost = Boolean(req.body?.canPost);

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  const envStaffEmails = getEnvStaffEmails();
  if (envStaffEmails.includes(email)) {
    return res.status(400).json({ error: "This email is managed by STAFF_EMAILS and post access cannot be changed here." });
  }

  const staffEntry = await StaffAccess.findOne({ email }).select("email role");
  if (!staffEntry) {
    return res.status(404).json({ error: "Staff entry not found." });
  }

  const nextRole = canPost ? normalizeAccessRole(staffEntry.role) : "commenter";
  await User.updateMany({ email }, { $set: { role: nextRole } });
  invalidateStaffCacheEntry();

  return res.json({ success: true, email, canPost });
});

module.exports = router;
