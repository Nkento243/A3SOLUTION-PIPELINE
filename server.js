"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 4173;

const DATA_DIR = process.env.A3S_DATA_DIR || path.join(os.homedir(), ".a3solution-pipeline");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "pipeline.sqlite");

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    org TEXT NOT NULL,
    contact TEXT,
    email TEXT,
    phone TEXT,
    offer TEXT NOT NULL,
    amount REAL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'new',
    nextDate TEXT,
    nextNote TEXT,
    notes TEXT,
    sample INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function getKv(key) {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function setKv(key, value) {
  db.prepare(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM contacts").get().n;
  if (count > 0) return;
  const seedPath = path.join(__dirname, "seed", "a3solution-pipeline-data.json");
  if (!fs.existsSync(seedPath)) return;
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO contacts (id, org, contact, email, phone, offer, amount, stage, nextDate, nextNote, notes, sample, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  (seed.contacts || []).forEach((c) => {
    insert.run(
      crypto.randomUUID(),
      c.org || "",
      c.contact || "",
      c.email || "",
      c.phone || "",
      c.offer || "",
      Number(c.amount) || 0,
      c.stage || "new",
      c.nextDate || "",
      c.nextNote || "",
      c.notes || "",
      now,
      now
    );
  });
  if (!getKv("settings")) {
    setKv("settings", { currency: seed.currency || "€" });
  }
}
seedIfEmpty();
if (!getKv("settings")) setKv("settings", { currency: "€" });

function rowToContact(row) {
  return { ...row, amount: Number(row.amount) || 0, sample: !!row.sample };
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- contacts ----------

app.get("/api/contacts", (req, res) => {
  const rows = db.prepare("SELECT * FROM contacts ORDER BY createdAt ASC").all();
  res.json(rows.map(rowToContact));
});

app.post("/api/contacts", (req, res) => {
  const b = req.body || {};
  if (!b.org || !String(b.org).trim() || !b.offer || !String(b.offer).trim()) {
    return res.status(400).json({ error: "org et offer sont requis." });
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO contacts (id, org, contact, email, phone, offer, amount, stage, nextDate, nextNote, notes, sample, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    String(b.org).trim(),
    (b.contact || "").trim(),
    (b.email || "").trim(),
    (b.phone || "").trim(),
    String(b.offer).trim(),
    Number(b.amount) || 0,
    b.stage || "new",
    b.nextDate || "",
    (b.nextNote || "").trim(),
    (b.notes || "").trim(),
    now,
    now
  );
  const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(id);
  res.status(201).json(rowToContact(row));
});

app.put("/api/contacts/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Contact introuvable." });
  const b = req.body || {};
  const merged = {
    org: b.org !== undefined ? String(b.org).trim() : existing.org,
    contact: b.contact !== undefined ? String(b.contact).trim() : existing.contact,
    email: b.email !== undefined ? String(b.email).trim() : existing.email,
    phone: b.phone !== undefined ? String(b.phone).trim() : existing.phone,
    offer: b.offer !== undefined ? String(b.offer).trim() : existing.offer,
    amount: b.amount !== undefined ? Number(b.amount) || 0 : existing.amount,
    stage: b.stage !== undefined ? b.stage : existing.stage,
    nextDate: b.nextDate !== undefined ? b.nextDate : existing.nextDate,
    nextNote: b.nextNote !== undefined ? String(b.nextNote).trim() : existing.nextNote,
    notes: b.notes !== undefined ? String(b.notes).trim() : existing.notes,
    updatedAt: new Date().toISOString()
  };
  db.prepare(`
    UPDATE contacts SET org=?, contact=?, email=?, phone=?, offer=?, amount=?, stage=?, nextDate=?, nextNote=?, notes=?, updatedAt=?
    WHERE id=?
  `).run(
    merged.org, merged.contact, merged.email, merged.phone, merged.offer, merged.amount,
    merged.stage, merged.nextDate, merged.nextNote, merged.notes, merged.updatedAt, req.params.id
  );
  const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
  res.json(rowToContact(row));
});

app.delete("/api/contacts/:id", (req, res) => {
  const result = db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Contact introuvable." });
  res.status(204).end();
});

// ---------- settings ----------

app.get("/api/settings", (req, res) => {
  res.json(getKv("settings") || { currency: "€" });
});

app.put("/api/settings", (req, res) => {
  const current = getKv("settings") || { currency: "€" };
  const next = { ...current, ...(req.body || {}) };
  setKv("settings", next);
  res.json(next);
});

// ---------- API key (Anthropic) ----------

app.get("/api/config", (req, res) => {
  const cfg = getKv("apiConfig") || {};
  res.json({ hasApiKey: !!cfg.apiKey });
});

app.put("/api/config", (req, res) => {
  const apiKey = (req.body && req.body.apiKey || "").trim();
  if (!apiKey) return res.status(400).json({ error: "Clé API vide." });
  setKv("apiConfig", { apiKey });
  res.json({ hasApiKey: true });
});

app.delete("/api/config", (req, res) => {
  setKv("apiConfig", {});
  res.json({ hasApiKey: false });
});

// ---------- synthesis (strategic) ----------

app.get("/api/synthesis", (req, res) => {
  res.json(getKv("synthesis"));
});

function buildStrategyPrompt(contacts, currency) {
  const today = new Date();
  const todayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(today);
  const STAGE_LABELS = { new: "Nouveau contact", qualified: "Qualifié", proposal: "Proposition envoyée", client: "Client signé", lost: "Client perdu" };

  function fmtAmount(n) {
    return new Intl.NumberFormat("fr-FR").format(Number(n) || 0) + " " + currency;
  }

  const prospects = contacts.filter((c) => c.stage === "new" || c.stage === "qualified" || c.stage === "proposal");
  const clients = contacts.filter((c) => c.stage === "client");
  const lost = contacts.filter((c) => c.stage === "lost");
  const pipelineValue = prospects.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  function lines(list) {
    return list.map((c) => {
      const parts = [c.org, STAGE_LABELS[c.stage], c.offer, fmtAmount(c.amount)];
      if (c.nextDate) parts.push("relance " + c.nextDate);
      if (c.notes) parts.push("notes: " + c.notes.slice(0, 160));
      return "- " + parts.filter(Boolean).join(" | ");
    }).join("\n") || "(aucun)";
  }

  return "Tu es consultant en stratégie commerciale pour A3Solution, un cabinet de conseil. " +
    "Voici l'état de son pipeline commercial (CRM) à la date d'aujourd'hui, " + todayLabel + ".\n\n" +
    "CHIFFRES CLÉS\n" +
    "- Prospects en cours: " + prospects.length + "\n" +
    "- Clients signés: " + clients.length + "\n" +
    "- Clients perdus: " + lost.length + "\n" +
    "- Valeur estimée du pipeline (prospects non signés): " + fmtAmount(pipelineValue) + "\n\n" +
    "PROSPECTS EN COURS\n" + lines(prospects) + "\n\n" +
    "CLIENTS SIGNÉS\n" + lines(clients) + "\n\n" +
    "CLIENTS PERDUS\n" + lines(lost) + "\n\n" +
    "Rédige une synthèse stratégique pour le dirigeant du cabinet, en français, basée strictement sur ces données " +
    "(ne suppose rien au-delà). Réponds uniquement avec un JSON de cette forme exacte, sans texte autour:\n" +
    '{"summary": "un paragraphe de 3-5 phrases, vue d\'ensemble stratégique du pipeline aujourd\'hui", ' +
    '"vigilance": ["2 à 5 points de vigilance concrets, courts, un par élément"], ' +
    '"recommendations": ["2 à 5 recommandations concrètes et actionnables, courtes, une par élément"]}';
}

app.post("/api/synthesis/generate", async (req, res) => {
  const cfg = getKv("apiConfig") || {};
  if (!cfg.apiKey) {
    return res.status(400).json({ code: "not_configured", error: "Aucune clé API Anthropic configurée." });
  }
  const contacts = db.prepare("SELECT * FROM contacts ORDER BY createdAt ASC").all().map(rowToContact);
  if (!contacts.length) {
    return res.status(400).json({ code: "empty", error: "Ajoutez des contacts avant de générer une synthèse." });
  }
  const settings = getKv("settings") || { currency: "€" };
  const prompt = buildStrategyPrompt(contacts, settings.currency);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      if (response.status === 401) {
        return res.status(400).json({ code: "invalid_key", error: "Clé API invalide ou refusée." });
      }
      if (response.status === 429) {
        return res.status(429).json({ code: "rate_limited", error: "Trop de demandes pour le moment. Réessayez dans un instant." });
      }
      return res.status(502).json({ code: "api_error", error: "Erreur API Anthropic: " + errBody.slice(0, 300) });
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(502).json({ code: "invalid_json", error: "La réponse reçue n'était pas exploitable. Réessayez." });
    }

    const payload = {
      summary: String(parsed.summary || ""),
      vigilance: Array.isArray(parsed.vigilance) ? parsed.vigilance.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      generatedAt: new Date().toISOString(),
      contactCount: contacts.length
    };
    setKv("synthesis", payload);
    res.json(payload);
  } catch (err) {
    res.status(502).json({ code: "network_error", error: "Impossible de contacter l'API Anthropic." });
  }
});

function openBrowser(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`A3Solution Pipeline en écoute sur ${url}`);
  console.log(`Base de données locale : ${DB_PATH}`);
  if (!process.env.A3S_NO_BROWSER) openBrowser(url);
});
