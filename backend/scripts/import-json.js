// Optional one-time import of an existing local data/complaints.json file into PostgreSQL.
// Run from backend/: DATABASE_URL=... node scripts/import-json.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing.");
const file = path.join(__dirname, "..", "data", "complaints.json");
if (!fs.existsSync(file)) throw new Error(`No legacy file found at ${file}`);
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY, student_name VARCHAR(100) NOT NULL, institution_type VARCHAR(20) NOT NULL DEFAULT '',
      institution_name VARCHAR(150) NOT NULL DEFAULT '', class_name VARCHAR(30) NOT NULL, section VARCHAR(20) NOT NULL,
      roll_number VARCHAR(30) NOT NULL, phone VARCHAR(20) NOT NULL, details VARCHAR(2000) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    let imported = 0;
    for (const row of rows) {
      await pool.query(`INSERT INTO complaints (id, student_name, institution_type, institution_name, class_name, section, roll_number, phone, details, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`, [
        String(row.id || `${Date.now()}-${imported}`), row.studentName || "Unknown", row.institutionType || "", row.institutionName || "",
        row.className || "", row.section || "", row.rollNumber || "", row.phone || "", row.details || "", row.status || "Pending", row.createdAt || new Date().toISOString()
      ]);
      imported++;
    }
    console.log(`Processed ${imported} legacy complaint(s). Existing IDs were skipped.`);
  } finally { await pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
