const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "mods.json");
const PUBLIC_DIR = path.join(__dirname, "public");

fs.mkdirSync(DATA_DIR, { recursive: true });

const seedMods = [
  { id: "minecraft-bedrock", name: "Minecraft Bedrock Edition", category: "Game", version: "1.26.52", description: "Get Minecraft from an official or authorized source.", downloadUrl: "https://www.minecraft.net/", downloads: 0 },
  { id: "op-chests", name: "OP Chests", category: "Utility", version: "Unspecified", description: "Powerful chest utility for Bedrock worlds.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "manhunt", name: "Manhunt Mod", category: "Challenge", version: "Unspecified", description: "Add a manhunt experience to your world.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "low-end-fps-boost", name: "Low-End FPS Boost", category: "FPS Boost", version: "Unspecified", description: "Performance-focused pack for low-end devices.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "fps-optimizer", name: "FPS Optimizer", category: "Optimization", version: "Unspecified", description: "Lightweight options designed to reduce visual load.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "low-graphics-pack", name: "Low Graphics Pack", category: "Lightweight", version: "Unspecified", description: "A lightweight visual pack for smoother gameplay.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "java-hunger", name: "Java Hunger", category: "Survival", version: "Unspecified", description: "Food and hunger mechanics inspired by Java Edition.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "smp-essentials", name: "SMP Essential", category: "SMP", version: "1.26.50", description: "Useful tools for SMP worlds.", downloadUrl: "https://mcpedl.com/", downloads: 0 },
  { id: "advancements", name: "Advancements", category: "Java Style", version: "Unspecified", description: "Advancement-style progression for Bedrock.", downloadUrl: "https://mcpedl.com/", downloads: 0 }
];

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(seedMods, null, 2));
}

function readMods() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeMods(mods) {
  const temp = DATA_FILE + "." + crypto.randomUUID() + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(mods, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function safeExternalUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: "Admin API disabled. Set ADMIN_TOKEN in your environment." });
  }
  const token = req.get("x-admin-token");
  const a = Buffer.from(token || "");
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Invalid admin token." });
  }
  next();
}

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Minecraft Mod Hub API" });
});

app.get("/api/mods", (req, res) => {
  let mods = readMods();
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim().toLowerCase();
  if (q) mods = mods.filter(m => [m.name, m.description, m.category].some(v => String(v).toLowerCase().includes(q)));
  if (category) mods = mods.filter(m => m.category.toLowerCase() === category);
  res.json({ count: mods.length, mods });
});

app.get("/api/mods/:id", (req, res) => {
  const mod = readMods().find(m => m.id === req.params.id);
  if (!mod) return res.status(404).json({ error: "Mod not found." });
  res.json(mod);
});

app.get("/api/mods/:id/download", (req, res) => {
  const mods = readMods();
  const mod = mods.find(m => m.id === req.params.id);
  if (!mod) return res.status(404).json({ error: "Mod not found." });
  if (!safeExternalUrl(mod.downloadUrl)) return res.status(500).json({ error: "This mod has no valid download URL configured." });
  mod.downloads = (Number(mod.downloads) || 0) + 1;
  writeMods(mods);
  res.redirect(302, mod.downloadUrl);
});

// Admin: create a mod. Send x-admin-token header.
app.post("/api/admin/mods", requireAdmin, (req, res) => {
  const { id, name, category, version, description, downloadUrl } = req.body || {};
  if (![id, name, category, downloadUrl].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "id, name, category and downloadUrl are required strings." });
  }
  if (!/^[a-z0-9-]{2,80}$/.test(id)) return res.status(400).json({ error: "id must use lowercase letters, numbers, and hyphens." });
  if (!safeExternalUrl(downloadUrl)) return res.status(400).json({ error: "downloadUrl must be an http(s) URL." });
  const mods = readMods();
  if (mods.some(m => m.id === id)) return res.status(409).json({ error: "A mod with this id already exists." });
  const mod = { id, name: name.trim(), category: category.trim(), version: String(version || "Unspecified"), description: String(description || ""), downloadUrl, downloads: 0 };
  mods.push(mod);
  writeMods(mods);
  res.status(201).json(mod);
});

app.patch("/api/admin/mods/:id", requireAdmin, (req, res) => {
  const mods = readMods();
  const mod = mods.find(m => m.id === req.params.id);
  if (!mod) return res.status(404).json({ error: "Mod not found." });
  const allowed = ["name", "category", "version", "description", "downloadUrl"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] !== "string") return res.status(400).json({ error: `${key} must be a string.` });
      if (key === "downloadUrl" && !safeExternalUrl(req.body[key])) return res.status(400).json({ error: "downloadUrl must be an http(s) URL." });
      mod[key] = req.body[key].trim();
    }
  }
  writeMods(mods);
  res.json(mod);
});

app.delete("/api/admin/mods/:id", requireAdmin, (req, res) => {
  const mods = readMods();
  const next = mods.filter(m => m.id !== req.params.id);
  if (next.length === mods.length) return res.status(404).json({ error: "Mod not found." });
  writeMods(next);
  res.json({ deleted: true, id: req.params.id });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`Minecraft Mod Hub running at http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) console.warn("Admin routes are disabled until ADMIN_TOKEN is set.");
});
