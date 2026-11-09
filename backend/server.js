require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://teamvijrumbhana-main-public.vercel.app,http://localhost:5500,http://127.0.0.1:5500")
  .split(",").map(value => value.trim()).filter(Boolean);
const usePostgres = Boolean(process.env.DATABASE_URL);
const pool = usePostgres ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } }) : null;
const localDataDir = path.join(__dirname, "data");
const localDataFile = path.join(localDataDir, "complaints.json");

if (!ADMIN_PASSWORD || TOKEN_SECRET.length < 32) {
  console.error("Set ADMIN_PASSWORD and a TOKEN_SECRET of at least 32 characters.");
  process.exit(1);
}
if (!usePostgres) {
  fs.mkdirSync(localDataDir, { recursive: true });
  if (!fs.existsSync(localDataFile)) fs.writeFileSync(localDataFile, "[]", "utf8");
  console.warn("DATABASE_URL is missing: using local JSON storage. Do not use this mode for persistent Render production data.");
}

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && !allowedOrigins.includes(origin) ? 403 : 204);
  next();
});
app.use(express.json({ limit: "20kb" }));

async function initializeDatabase() {
  if (!usePostgres) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    institution_type VARCHAR(20) NOT NULL,
    institution_name VARCHAR(150) NOT NULL,
    class_name VARCHAR(30) NOT NULL,
    section VARCHAR(20) NOT NULL,
    roll_number VARCHAR(30) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    details VARCHAR(2000) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

function localRead() { return JSON.parse(fs.readFileSync(localDataFile, "utf8")); }
function localWrite(rows) { fs.writeFileSync(localDataFile, JSON.stringify(rows, null, 2), "utf8"); }
async function createComplaint(item) {
  if (!usePostgres) { const rows = localRead(); rows.unshift(item); localWrite(rows); return; }
  await pool.query(`INSERT INTO complaints (id, student_name, institution_type, institution_name, class_name, section, roll_number, phone, details, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [item.id,item.studentName,item.institutionType,item.institutionName,item.className,item.section,item.rollNumber,item.phone,item.details,item.status,item.createdAt]);
}
async function getComplaints() {
  if (!usePostgres) return localRead();
  const result = await pool.query(`SELECT id, student_name AS "studentName", institution_type AS "institutionType", institution_name AS "institutionName", class_name AS "className", section, roll_number AS "rollNumber", phone, details, status, created_at AS "createdAt" FROM complaints ORDER BY created_at DESC`);
  return result.rows;
}
async function changeStatus(id, status) {
  if (!usePostgres) { const rows = localRead(); const item = rows.find(row => row.id === id); if (!item) return false; item.status = status; localWrite(rows); return true; }
  const result = await pool.query("UPDATE complaints SET status = $1 WHERE id = $2", [status, id]);
  return result.rowCount > 0;
}
function makeToken() {
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function verifyToken(token) {
  if (typeof token !== "string") return false;
  const parts = token.split("."); if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(parts[0]).digest();
  let actual; try { actual = Buffer.from(parts[1], "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try { const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); return payload.role === "admin" && payload.exp > Date.now(); } catch { return false; }
}
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!verifyToken(token)) return res.status(401).json({ error: "Unauthorized. Please log in again." });
  next();
}
async function sendWhatsAppNotification(complaint) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ADMIN_NUMBER, WHATSAPP_TEMPLATE_NAME } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ADMIN_NUMBER || !WHATSAPP_TEMPLATE_NAME) return;
  const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: WHATSAPP_ADMIN_NUMBER, type: "template",
      template: { name: WHATSAPP_TEMPLATE_NAME, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" },
        components: [{ type: "body", parameters: [
          { type: "text", text: complaint.studentName }, { type: "text", text: complaint.className },
          { type: "text", text: complaint.rollNumber }, { type: "text", text: complaint.section },
          { type: "text", text: complaint.details }
        ] }] }
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

function validateText(value, max) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }

app.get("/api/health", (req, res) => res.json({ status: "ok", storage: usePostgres ? "postgresql" : "local-json" }));
app.post("/api/complaints", async (req, res) => {
  const fields = { studentName: 100, institutionType: 20, institutionName: 150, className: 30, section: 20, rollNumber: 30, phone: 20, details: 2000 };
  for (const [field, max] of Object.entries(fields)) {
    if (!validateText(req.body?.[field], max)) return res.status(400).json({ error: `Please enter a valid ${field} (maximum ${max} characters).` });
  }
  if (!["School", "College"].includes(req.body.institutionType.trim())) return res.status(400).json({ error: "Institution type must be School or College." });
  const complaint = { id: crypto.randomUUID(), ...Object.fromEntries(Object.keys(fields).map(key => [key, req.body[key].trim()])), status: "Pending", createdAt: new Date().toISOString() };
  try {
    await createComplaint(complaint);
    try { await sendWhatsAppNotification(complaint); } catch (notificationError) { console.error("WhatsApp notification failed:", notificationError.message); }
    res.status(201).json({ message: "Your complaint has been submitted.", id: complaint.id });
  }
  catch (error) { console.error("Complaint insert failed:", error); res.status(500).json({ error: "Could not save your complaint. Please try again." }); }
});
app.post("/api/admin/login", (req, res) => {
  const password = req.body?.password;
  if (typeof password !== "string" || password.length > 300) return res.status(400).json({ error: "Enter your admin password." });
  const submitted = Buffer.from(password); const expected = Buffer.from(ADMIN_PASSWORD);
  const valid = submitted.length === expected.length && crypto.timingSafeEqual(submitted, expected);
  if (!valid) return res.status(401).json({ error: "Incorrect admin password." });
  res.json({ message: "Login successful.", token: makeToken(), expiresIn: 28800 });
});
app.get("/api/admin/complaints", requireAdmin, async (req, res) => {
  try { res.json(await getComplaints()); } catch (error) { console.error(error); res.status(500).json({ error: "Could not load complaints." }); }
});
app.patch("/api/admin/complaints/:id", requireAdmin, async (req, res) => {
  const allowed = ["Pending", "In Progress", "Resolved"];
  if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: "Invalid complaint status." });
  try { const updated = await changeStatus(req.params.id, req.body.status); if (!updated) return res.status(404).json({ error: "Complaint not found." }); res.json({ message: "Status updated." }); }
  catch (error) { console.error(error); res.status(500).json({ error: "Could not update complaint status." }); }
});
app.get("/", (req, res) => res.json({ name: "Team Vijrumbhana Complaint API", health: "/api/health" }));

initializeDatabase().then(() => app.listen(PORT, () => console.log(`Complaint API listening on port ${PORT}; storage: ${usePostgres ? "PostgreSQL" : "local JSON"}`)))
  .catch(error => { console.error("Database initialization failed:", error); process.exit(1); });

process.on("SIGTERM", async () => { if (pool) await pool.end(); process.exit(0); });
