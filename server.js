// Paras Antidrone: web server + database API (PostgreSQL)
import express from "express";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it in Render → Environment.");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// One table stores every document, as JSON (same idea as Firestore collections)
await pool.query(`
  CREATE TABLE IF NOT EXISTS docs (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, id)
  )`);

const validName = s => /^[A-Za-z0-9_-]{1,60}$/.test(s);
const bad = (res, what = "bad name") => res.status(400).json({ error: what });

app.get("/api/health", (req, res) => res.json({ ok: true }));

// list a collection
app.get("/api/:collection", async (req, res) => {
  const { collection } = req.params;
  if (!validName(collection)) return bad(res);
  const r = await pool.query("SELECT id, data FROM docs WHERE collection=$1 ORDER BY id", [collection]);
  res.json(r.rows);
});

// read one document
app.get("/api/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!validName(collection) || !validName(id)) return bad(res);
  const r = await pool.query("SELECT data FROM docs WHERE collection=$1 AND id=$2", [collection, id]);
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  res.json(r.rows[0]);
});

// create or replace a document
app.put("/api/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!validName(collection) || !validName(id)) return bad(res);
  await pool.query(
    `INSERT INTO docs (collection, id, data, updated_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
    [collection, id, JSON.stringify(req.body || {})]
  );
  res.status(204).end();
});

// merge fields into an existing document (fails if it does not exist)
app.patch("/api/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!validName(collection) || !validName(id)) return bad(res);
  const r = await pool.query(
    `UPDATE docs SET data = data || $3::jsonb, updated_at=now()
     WHERE collection=$1 AND id=$2 RETURNING id`,
    [collection, id, JSON.stringify(req.body || {})]
  );
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

app.delete("/api/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!validName(collection) || !validName(id)) return bad(res);
  await pool.query("DELETE FROM docs WHERE collection=$1 AND id=$2", [collection, id]);
  res.status(204).end();
});

// the dashboard web pages
app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Paras Antidrone running on port ${port}`));
