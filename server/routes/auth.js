const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Post = require("../models/Post");
const StaffAccess = require("../models/StaffAccess");
const auth = require("../middleware/auth");

const router = express.Router();

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseDurationMs(value, fallbackMs) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallbackMs;

  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);

  const match = raw.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) return fallbackMs;

  const amount = Number.parseInt(match[1], 10);
  const unit = String(match[2] || "ms").toLowerCase();
  const unitMs = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  }[unit] || 1;

  return amount > 0 ? amount * unitMs : fallbackMs;
}

const JWT_ACCESS_TTL = String(process.env.JWT_ACCESS_TTL || "2h").trim() || "2h";
const TOKEN_TTL_MS = parseDurationMs(process.env.JWT_ACCESS_TTL, 2 * 60 * 60 * 1000);
const BCRYPT_ROUNDS = Math.max(8, parsePositiveInt(process.env.BCRYPT_ROUNDS, 12));
const COOKIE_SECURE = parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production");
const DUMMY_BCRYPT_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO4Qf0j9Y5zD6Q1e.9f9X8zW0fvkYl4a2";
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const COOKIE_SAMESITE = (() => {
  const allowed = new Set(["strict", "lax", "none"]);
  const raw = String(process.env.COOKIE_SAMESITE || "strict").trim().toLowerCase();
  return allowed.has(raw) ? raw : "strict";
})();

function getStaffEmails() {
  const raw = process.env.STAFF_EMAILS || "";
  return raw
    .split(",")
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizePlainText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
  const value = String(password || "");
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value);
  const isLongEnough = value.length >= 8;
  return hasLetter && hasNumber && hasSymbol && isLongEnough;
}

function normalizeProfileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!isHttp) return null;
    return raw;
  } catch {
    return null;
  }
}

function buildAuthorDisplayName(user) {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || String(user?.email || "").trim() || "Unknown";
}

function getCookieOptions() {
  const secure = COOKIE_SAMESITE === "none" ? true : COOKIE_SECURE;
  return {
    httpOnly: true,
    secure,
    sameSite: COOKIE_SAMESITE,
    maxAge: TOKEN_TTL_MS,
    path: "/"
  };
}

function isValidCredentialInput(email, password) {
  if (typeof email !== "string" || typeof password !== "string") return false;

  const emailTrimmed = email.trim();
  if (!emailTrimmed || emailTrimmed.length > MAX_EMAIL_LENGTH) return false;

  if (!password || password.length > MAX_PASSWORD_LENGTH) return false;

  return true;
}

async function resolveRole(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return "commenter";

  const staffEmails = getStaffEmails();
  if (staffEmails.includes(normalizedEmail)) return "admin";

  const staffEntry = await StaffAccess.findOne({ email: normalizedEmail }).select("role");
  if (!staffEntry) return "commenter";

  if (staffEntry.role === "admin") return "admin";
  if (staffEntry.role === "staff") return "staff";
  if (staffEntry.role === "uploader") return "staff";
  return "commenter";
}

router.post("/signup", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!isValidCredentialInput(email, password)) {
    return res.status(400).json({ error: "Invalid credentials format" });
  }

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: "First name, last name, email, and password are required" });
  }

  const normalizedFirstName = sanitizePlainText(firstName, 60);
  const normalizedLastName = sanitizePlainText(lastName, 60);
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (!normalizedFirstName || !normalizedLastName) {
    return res.status(400).json({ error: "First name and last name are required" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ 
      error: "Password must be at least 8 characters and include letters, numbers, and symbols" 
    });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: "This email is already registered. Please log in instead." });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const role = await resolveRole(normalizedEmail);
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    role,
    firstName: normalizedFirstName,
    lastName: normalizedLastName
  });

  const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: JWT_ACCESS_TTL
  });

  res.cookie("token", token, getCookieOptions());

  res.json({ success: true });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!isValidCredentialInput(email, password)) {
    return res.status(400).json({ error: "Invalid credentials format" });
  }

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const resolvedRole = await resolveRole(user.email);
  if (user.role !== resolvedRole) {
    user.role = resolvedRole;
    await user.save();
  }

  const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: JWT_ACCESS_TTL
  });

  res.cookie("token", token, getCookieOptions());

  res.json({ success: true });
});

router.get("/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.userId).select("email firstName lastName avatarUrl bio role");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    bio: user.bio || "",
    role: user.role
  });
});

router.get("/author", async (req, res) => {
  const authorName = sanitizePlainText(req.query?.name, 120);
  const authorId = sanitizePlainText(req.query?.id, 30);

  if (!authorName && !authorId) {
    return res.status(400).json({ error: "Author name or id is required" });
  }

  let user = null;

  // Prefer lookup by authorId if provided
  if (authorId && /^[a-fA-F0-9]{24}$/.test(authorId)) {
    user = await User.findById(authorId)
      .select("username firstName lastName avatarUrl bio")
      .lean();
  }

  // Fall back to name-based lookup
  if (!user && authorName) {
    const escaped = authorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    user = await User.findOne({ username: new RegExp(`^${escaped}$`, "i") })
      .select("username firstName lastName avatarUrl bio")
      .lean();

    if (!user) {
      user = await User.findOne({ email: String(authorName || "").trim().toLowerCase() })
        .select("username firstName lastName avatarUrl bio")
        .lean();
    }

    if (!user) {
      const normalizedAuthorName = String(authorName || "").trim().toLowerCase();
      user = await User.findOne({
        $expr: {
          $eq: [
            {
              $toLower: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ["$firstName", ""] },
                      " ",
                      { $ifNull: ["$lastName", ""] }
                    ]
                  }
                }
              }
            },
            normalizedAuthorName
          ]
        }
      })
        .select("username firstName lastName avatarUrl bio")
        .lean();
    }
  }

  if (!user) {
    return res.status(404).json({ error: "Author not found" });
  }

  const displayName = buildAuthorDisplayName(user) || authorName || "Unknown";

  return res.json({
    name: displayName,
    avatarUrl: String(user.avatarUrl || "").trim(),
    bio: String(user.bio || "").trim(),
    links: {}
  });
});

router.put("/profile", auth, async (req, res) => {
  const { firstName, lastName, avatarUrl, bio } = req.body;
  const updates = {};

  if (typeof firstName === "string") {
    updates.firstName = sanitizePlainText(firstName, 60);
  }

  if (typeof lastName === "string") {
    updates.lastName = sanitizePlainText(lastName, 60);
  }

  if (typeof bio === "string") {
    updates.bio = sanitizePlainText(bio, 500);
  }

  if (typeof avatarUrl === "string") {
    const normalizedAvatar = String(avatarUrl || "").trim();
    if (!normalizedAvatar) {
      updates.avatarUrl = "";
    } else {
      try {
        const parsed = new URL(normalizedAvatar);
        const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
        if (!isHttp) return res.status(400).json({ error: "Invalid avatar URL" });
        updates.avatarUrl = normalizedAvatar;
      } catch {
        return res.status(400).json({ error: "Invalid avatar URL" });
      }
    }
  }

  const existingUser = await User.findById(req.user.userId).select("_id email username firstName lastName");
  if (!existingUser) return res.status(404).json({ error: "User not found" });

  const previousAuthorNames = [
    buildAuthorDisplayName(existingUser),
    String(existingUser.username || "").trim(),
    String(existingUser.email || "").trim()
  ].filter(Boolean);
  const uniquePreviousAuthorNames = [...new Set(previousAuthorNames)];

  const user = await User.findByIdAndUpdate(req.user.userId, updates, {
    new: true
  }).select("email firstName lastName username avatarUrl role");

  const nextAuthorName = buildAuthorDisplayName(user);

  if (nextAuthorName && uniquePreviousAuthorNames.length) {
    await Post.updateMany(
      {
        $or: [
          { authorId: user._id },
          { authorId: { $exists: false }, author: { $in: uniquePreviousAuthorNames } },
          { authorId: null, author: { $in: uniquePreviousAuthorNames } }
        ]
      },
      {
        $set: {
          author: nextAuthorName,
          authorId: user._id
        }
      }
    );
  }

  res.json({
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role
  });
});

router.put("/password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }

  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Current password is incorrect" });

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and include letters, numbers, and symbols" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();

  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    ...getCookieOptions(),
    maxAge: undefined,
    expires: new Date(0)
  });
  res.json({ success: true });
});

module.exports = router;
