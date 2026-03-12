require("dotenv").config({ quiet: true });
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const User = require("./models/User");
const Post = require("./models/Post");

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const categoryRoutes = require("./routes/categories");
const releaseRoutes = require("./routes/releases");
const uploadRoutes = require("./routes/upload");
const commentRoutes = require("./routes/comments");
const staffRoutes = require("./routes/staff");
const metricsRoutes = require("./routes/metrics");
const newsletterRoutes = require("./routes/newsletter");
const translateRoutes = require("./routes/translate");

const app = express();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

const LOGIN_MAX_ATTEMPTS = parsePositiveInt(process.env.LOGIN_MAX_ATTEMPTS, 25);
const LOCK_MINUTES = parsePositiveInt(process.env.LOCK_MINUTES, 15);
const CACHE_HOME_TTL_SECONDS = parsePositiveInt(process.env.CACHE_HOME_TTL_SECONDS, 120);
const CACHE_ARTICLE_TTL_SECONDS = parsePositiveInt(process.env.CACHE_ARTICLE_TTL_SECONDS, 900);
const CACHE_ASSET_TTL_SECONDS = parsePositiveInt(process.env.CACHE_ASSET_TTL_SECONDS, 60 * 60 * 24 * 7);
const CACHE_IMAGE_TTL_SECONDS = parsePositiveInt(process.env.CACHE_IMAGE_TTL_SECONDS, 60 * 60 * 24 * 30);
const EN_GR_ENABLED = parseBoolean(process.env.EN_GR, true);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const requiredEnv = ["MONGO_URI", "JWT_SECRET"];
const missingEnv = requiredEnv.filter(name => !process.env[name]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

if (String(process.env.JWT_SECRET || "").length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(compression({ threshold: 1024 }));

function sanitizeMongoOperatorsInPlace(value) {
  if (Array.isArray(value)) {
    value.forEach(item => sanitizeMongoOperatorsInPlace(item));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.keys(value).forEach(key => {
    const child = value[key];
    if (key.startsWith("$") || key.includes(".")) {
      delete value[key];
      return;
    }

    sanitizeMongoOperatorsInPlace(child);
  });
}

app.use((req, res, next) => {
  sanitizeMongoOperatorsInPlace(req.body);
  sanitizeMongoOperatorsInPlace(req.params);
  sanitizeMongoOperatorsInPlace(req.query);
  next();
});

// Normalize accidental duplicate slashes in request paths (e.g. //api/...) so
// third-party webhook calls are routed consistently.
app.use((req, res, next) => {
  const rawUrl = String(req.url || "");
  const queryIndex = rawUrl.indexOf("?");
  const rawPath = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
  const rawQuery = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
  const normalizedPath = rawPath.replace(/\/{2,}/g, "/");

  if (normalizedPath && normalizedPath !== rawPath) {
    req.url = `${normalizedPath}${rawQuery}`;
  }

  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: LOCK_MINUTES * 60 * 1000,
  max: LOGIN_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again later." }
});

const loginLimiter = rateLimit({
  windowMs: LOCK_MINUTES * 60 * 1000,
  max: LOGIN_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator(req) {
    const ip = String(req.ip || "unknown-ip");
    const email = String(req.body?.email || "").trim().toLowerCase();
    return `${ip}:${email || "unknown-email"}`;
  },
  message: { error: "Too many failed login attempts. Please try again later." }
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/password", authLimiter);

function isTrustedOriginOrReferrer(req) {
  const host = String(req.get("host") || "").trim().toLowerCase();
  const protocol = req.protocol === "https" ? "https" : "http";
  const sameOrigin = host ? `${protocol}://${host}` : "";

  const dynamicAllowList = new Set(
    [sameOrigin, ...ALLOWED_ORIGINS]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const originHeader = String(req.get("origin") || "").trim().toLowerCase();
  if (originHeader) {
    return dynamicAllowList.has(originHeader);
  }

  const refererHeader = String(req.get("referer") || "").trim().toLowerCase();
  if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin.toLowerCase();
      return dynamicAllowList.has(refererOrigin);
    } catch {
      return false;
    }
  }

  return true;
}

app.use((req, res, next) => {
  const isSensitiveAuthWrite = req.method === "POST" && [
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/password",
    "/api/auth/logout"
  ].includes(req.path);

  if (!isSensitiveAuthWrite) return next();

  if (!isTrustedOriginOrReferrer(req)) {
    return res.status(403).json({ error: "Request origin not allowed" });
  }

  return next();
});

app.get("/api/public-config", (req, res) => {
  return res.status(200).json({
    features: {
      languageToggle: EN_GR_ENABLED
    }
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/releases", releaseRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/translate", translateRoutes);

app.get("/sitemap.xml", async (req, res) => {
  try {
    const host = req.get("host");
    const configuredBase = String(process.env.SITE_URL || "").trim();
    const fallbackBase = `${req.protocol}://${host}`;
    const baseUrl = (configuredBase || fallbackBase).replace(/\/$/, "");

    const staticPaths = ["/", "/privacy", "/cookies", "/tos"];

    const posts = await Post.find({ published: true })
      .select("slug createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    const xmlEscape = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const nowIso = new Date().toISOString();
    const urls = [];

    staticPaths.forEach((pathName) => {
      urls.push({
        loc: `${baseUrl}${pathName}`,
        lastmod: nowIso
      });
    });

    posts.forEach((post) => {
      const slug = String(post?.slug || "").trim();
      if (!slug) return;
      const lastmodSource = post?.updatedAt || post?.createdAt || new Date();
      urls.push({
        loc: `${baseUrl}/post?slug=${encodeURIComponent(slug)}`,
        lastmod: new Date(lastmodSource).toISOString()
      });
    });

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((entry) => [
        "  <url>",
        `    <loc>${xmlEscape(entry.loc)}</loc>`,
        `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
        "  </url>"
      ].join("\n")),
      "</urlset>"
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    return res.status(200).send(body);
  } catch (error) {
    console.error("Sitemap generation failed", error);
    return res.status(500).type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><error>unavailable</error>');
  }
});

// Serve frontend
const frontendPath = path.join(__dirname, "..", "frontend");
const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

// Clean URLs — redirect .html to clean paths in production,
// and always rewrite extensionless paths to .html internally.
app.use((req, res, next) => {
  if (req.path === "/" || req.path.startsWith("/api/") || req.path === "/sitemap.xml" || req.path === "/robots.txt" || req.path === "/sw.js") {
    return next();
  }

  // Production: redirect /page.html → /page (301 for SEO)
  if (isProduction && req.path.endsWith(".html")) {
    const cleanPath = req.path.slice(0, -5);
    const qsStart = req.originalUrl.indexOf("?");
    const qs = qsStart >= 0 ? req.originalUrl.slice(qsStart) : "";
    return res.redirect(301, cleanPath + qs);
  }

  // Clean URL: if no file extension, try serving the .html file
  if (!path.extname(req.path)) {
    const candidate = path.resolve(frontendPath, "." + req.path + ".html");
    if (candidate.startsWith(frontendPath) && fs.existsSync(candidate)) {
      const qsIndex = req.url.indexOf("?");
      if (qsIndex >= 0) {
        req.url = req.url.slice(0, qsIndex) + ".html" + req.url.slice(qsIndex);
      } else {
        req.url += ".html";
      }
    }
  }

  next();
});

app.use("/admin", async (req, res, next) => {
  const publicAdminPages = new Set(["/login.html", "/signup.html"]);
  const staffOnlyAdminPages = new Set([]);
  if (publicAdminPages.has(req.path)) {
    return next();
  }

  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/no-access");
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(payload.userId).select("role");
    if (!user) {
      return res.redirect("/no-access");
    }

    if (user.role === "admin") {
      return next();
    }

    if (user.role === "staff") {
      if (staffOnlyAdminPages.has(req.path)) {
        return res.redirect("/no-access");
      }
      return next();
    }

    if (req.path !== "/profile.html") {
      return res.redirect("/no-access");
    }
  } catch {
    return res.redirect("/no-access");
  }

  return next();
});

app.use(express.static(frontendPath, {
  etag: true,
  lastModified: true,
  maxAge: `${CACHE_HOME_TTL_SECONDS}s`,
  setHeaders(res, filePath) {
    const normalizedPath = String(filePath || "").replace(/\\/g, "/").toLowerCase();

    if (normalizedPath.endsWith("/sw.js")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return;
    }

    if (/\.html?$/i.test(filePath)) {
      const isArticlePage = normalizedPath.endsWith("/post.html");
      const ttl = isArticlePage ? CACHE_ARTICLE_TTL_SECONDS : CACHE_HOME_TTL_SECONDS;
      res.setHeader("Cache-Control", `public, max-age=${ttl}, must-revalidate`);
      return;
    }

    if (/\.(?:png|jpe?g|webp|gif|svg|avif|ico)$/i.test(filePath)) {
      res.setHeader("Cache-Control", `public, max-age=${CACHE_IMAGE_TTL_SECONDS}, immutable`);
      return;
    }

    if (/\.(?:css|js|mjs|woff2?|ttf|otf)$/i.test(filePath)) {
      res.setHeader("Cache-Control", `public, max-age=${CACHE_ASSET_TTL_SECONDS}, must-revalidate`);
      return;
    }

    res.setHeader("Cache-Control", `public, max-age=${CACHE_HOME_TTL_SECONDS}, must-revalidate`);
  }
}));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.status(404).sendFile(path.join(frontendPath, "404.html"), (err) => {
    if (err) res.status(404).end();
  });
});

app.use((err, req, res, next) => {
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: "Invalid upload payload." });
  }

  if (err?.message === "Invalid image type") {
    return res.status(400).json({ error: "Only JPEG, PNG, WEBP, and GIF images are allowed." });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

// DB
const mongoDbName = String(process.env.MONGODB_DB_NAME || "tsotras_blog").trim() || "tsotras_blog";

function getMongoReadyStateLabel() {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };
  const state = mongoose.connection.readyState;
  return states[state] || `unknown(${state})`;
}

function logMongo(event, level = "log", extra = "") {
  const timestamp = new Date().toISOString();
  const state = getMongoReadyStateLabel();
  const host = String(mongoose.connection.host || "n/a");
  const dbName = String(mongoose.connection.name || mongoDbName);
  const suffix = extra ? ` | ${extra}` : "";
  console[level](`[MongoDB] ${timestamp} | ${event} | state=${state} | host=${host} | db=${dbName}${suffix}`);
}

logMongo("connect() called");
mongoose
  .connect(process.env.MONGO_URI, { dbName: mongoDbName })
  .then(() => logMongo("initial connection established"))
  .catch((error) => {
    logMongo("initial connection failed", "error", error?.message || String(error));
  });

mongoose.connection.on("connecting", () => {
  logMongo("connecting");
});

mongoose.connection.on("connected", () => {
  logMongo("connected");
});

mongoose.connection.on("reconnected", () => {
  logMongo("reconnected");
});

mongoose.connection.on("error", (error) => {
  logMongo("runtime error", "error", error?.message || String(error));
});

mongoose.connection.on("disconnected", () => {
  logMongo("disconnected", "warn");
});

// Server
const START_PORT = parsePositiveInt(process.env.PORT, 3000);
const PORT_FALLBACK_TRIES = parsePositiveInt(process.env.PORT_FALLBACK_TRIES, 10);
let server = null;

function startServerWithFallback(basePort, maxFallbackTries) {
  const maxAttempts = maxFallbackTries + 1;

  const attemptListen = (attemptIndex) => {
    const candidatePort = basePort + attemptIndex;
    const candidateServer = app.listen(candidatePort, () => {
      server = candidateServer;
      if (attemptIndex === 0) {
        console.log("Server running on port", candidatePort);
      } else {
        console.warn(`Port ${basePort} was busy. Server running on fallback port ${candidatePort}.`);
      }
    });

    candidateServer.once("error", (error) => {
      if (error?.code === "EADDRINUSE" && attemptIndex + 1 < maxAttempts) {
        const nextPort = basePort + attemptIndex + 1;
        console.warn(`Port ${candidatePort} is in use. Trying port ${nextPort}...`);
        setImmediate(() => attemptListen(attemptIndex + 1));
        return;
      }

      if (error?.code === "EADDRINUSE") {
        const lastPort = basePort + maxAttempts - 1;
        console.error(`No available port found in range ${basePort}-${lastPort}. Set a free PORT in .env.`);
      } else {
        console.error("Server failed to start", error);
      }
      process.exit(1);
    });
  };

  attemptListen(0);
}

startServerWithFallback(START_PORT, PORT_FALLBACK_TRIES);

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);
  if (!server) {
    mongoose.connection.close().finally(() => process.exit(0));
    return;
  }

  server.close(async () => {
    try {
      await mongoose.connection.close();
    } catch {
    }
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 8000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
