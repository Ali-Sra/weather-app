// server/index.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json()); // برای assistant endpoints

const KEY = process.env.OPENWEATHER_KEY;
const OW = "https://api.openweathermap.org";

// ---------- helpers ----------
const needKey = (res) => {
  if (!KEY || !KEY.trim()) {
    res.status(500).json({ error: "OPENWEATHER_KEY missing" });
    return true;
  }
  return false;
};
const bad = (res, msg) => res.status(400).json({ error: msg || "bad request" });
const srv = (res, msg) => res.status(500).json({ error: msg || "server error" });

// in-memory cache (very simple)
const cache = new Map();
const getC = (k) => {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() - v.t > v.ttl) { cache.delete(k); return null; }
  return v.data;
};
const setC = (k, d, ttlSec = 60) => cache.set(k, { t: Date.now(), ttl: ttlSec * 1000, data: d });

async function cachedJson(url, ttl = 60, init = undefined) {
  const key = url.toString();
  const hit = getC(key);
  if (!init && hit) return { status: 200, ok: true, data: hit, fromCache: true };
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (r.ok && !init) setC(key, data, ttl);
  return { status: r.status, ok: r.ok, data };
}

app.use((req, res, next) => needKey(res) ? null : next());

// ---------- Geocoding ----------
app.get("/api/geocode", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return bad(res, "q required");
    const url = new URL(`${OW}/geo/1.0/direct`);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 3600);
    res.status(status).json(data);
  } catch { srv(res); }
});

app.get("/api/reverse", async (req, res) => {
  try {
    const lat = String(req.query.lat || "");
    const lon = String(req.query.lon || "");
    if (!lat || !lon) return bad(res, "lat/lon required");
    const url = new URL(`${OW}/geo/1.0/reverse`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("limit", "1");
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 3600);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- Current & Forecast ----------
app.get("/api/weather", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    const units = String(req.query.units || "metric");
    const lang = String(req.query.lang || "");
    if (!city) return bad(res, "city required");
    const url = new URL(`${OW}/data/2.5/weather`);
    url.searchParams.set("q", city);
    url.searchParams.set("units", units);
    if (lang) url.searchParams.set("lang", lang);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 60);
    res.status(status).json(data);
  } catch { srv(res); }
});

app.get("/api/forecast5", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    const units = String(req.query.units || "metric");
    const lang = String(req.query.lang || "");
    if (!city) return bad(res, "city required");
    const url = new URL(`${OW}/data/2.5/forecast`);
    url.searchParams.set("q", city);
    url.searchParams.set("units", units);
    if (lang) url.searchParams.set("lang", lang);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 120);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- One Call 3.0 (current/minutely/hourly/daily/alerts) ----------
app.get("/api/onecall", async (req, res) => {
  try {
    const lat = String(req.query.lat || "");
    const lon = String(req.query.lon || "");
    const units = String(req.query.units || "metric");
    const lang = String(req.query.lang || "");
    const exclude = String(req.query.exclude || "minutely"); // قابل تنظیم
    if (!lat || !lon) return bad(res, "lat/lon required");
    const url = new URL(`${OW}/data/3.0/onecall`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("units", units);
    if (lang) url.searchParams.set("lang", lang);
    if (exclude) url.searchParams.set("exclude", exclude);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 120);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- Air Pollution ----------
app.get("/api/air", async (req, res) => {
  try {
    const lat = String(req.query.lat || "");
    const lon = String(req.query.lon || "");
    if (!lat || !lon) return bad(res, "lat/lon required");
    const url = new URL(`${OW}/data/2.5/air_pollution`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 600);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- One Call 3.0: Timemachine (historical / point-in-time) ----------
app.get("/api/onecall/timemachine", async (req, res) => {
  try {
    const lat = String(req.query.lat || "");
    const lon = String(req.query.lon || "");
    const dt  = String(req.query.dt  || ""); // Unix (UTC)
    const units = String(req.query.units || "");
    const lang = String(req.query.lang || "");
    if (!lat || !lon || !dt) return bad(res, "lat, lon, dt required");
    const url = new URL(`${OW}/data/3.0/onecall/timemachine`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("dt", dt);
    if (units) url.searchParams.set("units", units);
    if (lang)  url.searchParams.set("lang", lang);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 300);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- One Call 3.0: Day Summary (daily aggregation) ----------
app.get("/api/onecall/day_summary", async (req, res) => {
  try {
    const lat = String(req.query.lat || "");
    const lon = String(req.query.lon || "");
    const date = String(req.query.date || ""); // YYYY-MM-DD
    const tz   = String(req.query.tz || "");   // ±HH:MM (اختیاری)
    const units = String(req.query.units || "");
    const lang = String(req.query.lang || "");
    if (!lat || !lon || !date) return bad(res, "lat, lon, date required");
    const url = new URL(`${OW}/data/3.0/onecall/day_summary`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("date", date);
    if (tz)    url.searchParams.set("tz", tz);
    if (units) url.searchParams.set("units", units);
    if (lang)  url.searchParams.set("lang", lang);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 600);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- One Call 3.0: Weather Overview (AI-generated summary) ----------
app.get("/api/onecall/overview", async (req, res) => {
  try {
    const lat = String(req.query.lat || "");
    const lon = String(req.query.lon || "");
    const date = String(req.query.date || ""); // optional YYYY-MM-DD
    const units = String(req.query.units || "");
    if (!lat || !lon) return bad(res, "lat/lon required");
    const url = new URL(`${OW}/data/3.0/onecall/overview`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    if (date)  url.searchParams.set("date", date);
    if (units) url.searchParams.set("units", units);
    url.searchParams.set("appid", KEY);
    const { status, data } = await cachedJson(url, 300);
    res.status(status).json(data);
  } catch { srv(res); }
});

// ---------- AI Weather Assistant (session start / resume) ----------
// Start a session
app.post("/api/assistant/session", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return bad(res, "prompt required");
    const url = new URL(`https://api.openweathermap.org/assistant/session`);
    // استفاده از هدر X-Api-Key طبق مستندات
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": KEY
      },
      body: JSON.stringify({ prompt })
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch { srv(res); }
});

// Resume a session
app.post("/api/assistant/session/:session_id", async (req, res) => {
  try {
    const sessionId = String(req.params.session_id || "");
    const prompt = String(req.body?.prompt || "").trim();
    if (!sessionId) return bad(res, "session_id required");
    if (!prompt) return bad(res, "prompt required");
    const url = new URL(`https://api.openweathermap.org/assistant/session/${sessionId}`);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": KEY
      },
      body: JSON.stringify({ prompt })
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch { srv(res); }
});

// ---------- Weather Map Tiles proxy (hide appid on client) ----------
const ALLOWED_LAYERS = new Set([
  "clouds_new","precipitation_new","pressure_new","wind_new","temp_new"
]);

app.get("/api/tiles/:layer/:z/:x/:y.png", async (req, res) => {
  try {
    const { layer, z, x, y } = req.params;
    if (!ALLOWED_LAYERS.has(layer)) return bad(res, "invalid layer");

    const url = new URL(`https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png`);
    url.searchParams.set("appid", KEY);

    const key = url.toString();
    const hit = getC(key);
    if (hit) {
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=3600");
      return res.status(200).send(Buffer.from(hit, "base64"));
    }

    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).send(txt);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    setC(key, buf.toString("base64"), 3600);

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(buf);
  } catch { srv(res); }
});

// ---------- boot ----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ API running on http://localhost:" + port));
