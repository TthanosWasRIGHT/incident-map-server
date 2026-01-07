require("dotenv").config();

const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// ✅ Firebase Client SDK (NO service account needed)
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, push } = require("firebase/database");

const app = express();
app.use(cors());
app.use(express.static("public"));

const port = process.env.PORT || 3001;

/* ============================
   ✅ Firebase Client SDK Init
   (Uses FIREBASE_* env vars)
============================ */
const REQUIRED_ENV = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_DATABASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
];

for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`❌ Missing env var: ${k}`);
  }
}

// If any missing, crash early (better than silent failures)
if (REQUIRED_ENV.some((k) => !process.env[k])) {
  throw new Error("Missing one or more FIREBASE_* env vars. Check Render env vars.");
}

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const appFB = initializeApp(firebaseConfig);
const db = getDatabase(appFB);

// ✅ Default to Kenya path unless you override it on Render
const INCIDENTS_PATH = process.env.INCIDENTS_PATH || "kenya/incidents";

/* ============================
   📂 Ensure upload directory
============================ */
const UPLOAD_DIR = path.join(__dirname, "upload");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ============================
   📤 Multer config
============================ */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

/* ============================
   Helpers
============================ */
function excelDateToISO(excelSerial) {
  // Excel serial date to YYYY-MM-DD
  const d = new Date(Math.round((excelSerial - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function cleanNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/* ============================
   🚀 Upload endpoint
============================ */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.path) return res.status(400).send("No file uploaded.");

    console.log("📄 File received:", req.file.path);
    console.log("📌 Writing to DB path:", INCIDENTS_PATH);

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return res.status(400).send("Excel sheet looks empty (no rows found).");
    }

    let written = 0;
    const writes = [];

    rows.forEach((row, idx) => {
      const lat = cleanNumber(row["LATITUDE"] ?? row["latitude"] ?? row["lat"]);
      const lon = cleanNumber(row["LONGITUDE"] ?? row["longitude"] ?? row["lon"]);

      if (lat === null || lon === null) return;

      const incidentDate = row["INCIDENT DATE"] ?? row["incident_date"] ?? row["date"];
      const incidentTime = row["INCIDENT TIME"] ?? row["incident_time"] ?? row["time"] ?? "";

      let formattedDate = null;
      if (typeof incidentDate === "number") formattedDate = excelDateToISO(incidentDate);
      if (!formattedDate && typeof incidentDate === "string") formattedDate = incidentDate;

      const payload = {
        // store both so your old UI doesn’t break
        county: row["COUNTY"] ?? row["County"] ?? row["county"] ?? null,
        district: row["DISTRICT"] ?? row["District"] ?? row["district"] ?? row["COUNTY"] ?? row["County"] ?? "N/A",

        title: row["INCIDENT CATEGORY"] ?? row["title"] ?? "N/A",
        description: row["INCIDENT DESCRIPTION"] ?? row["description"] ?? "",
        actor: row["ACTORS"] ?? row["actor"] ?? "",

        time: `${formattedDate || "Unknown"} ${incidentTime}`.trim(),
        lat,
        lon,
        weight: 1,
      };

      // ✅ Push to Firebase
      writes.push(push(ref(db, INCIDENTS_PATH), payload));
      written++;
    });

    await Promise.all(writes);

    console.log(`✅ Written ${written} incidents to Firebase at ${INCIDENTS_PATH}`);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Upload Success</title></head>
        <body style="font-family: Arial; text-align:center; padding:40px;">
          <h1>Upload Complete</h1>
          <p><b>${written}</b> incidents saved to <b>${INCIDENTS_PATH}</b>.</p>
          <a href="/upload.html">Upload another file</a>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Upload failed:", err);
    res.status(500).send("Internal Server Error. Check Render logs.");
  }
});

/* ============================
   🧾 Upload form route
============================ */
app.get("/upload", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "upload.html"));
});

/* ============================
   Health check
============================ */
app.get("/", (_, res) => res.send("OK"));

app.listen(port, () => console.log(`✅ Server running on port ${port}`));
