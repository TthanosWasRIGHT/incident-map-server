require("dotenv").config();
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.static("public"));

const port = process.env.PORT || 3001;

/* ============================
   ✅ Firebase Admin Init
============================ */
if (
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY ||
  !process.env.FIREBASE_DATABASE_URL
) {
  throw new Error("Missing Firebase Admin environment variables.");
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const INCIDENTS_PATH = process.env.INCIDENTS_PATH || "incidents";

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

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let written = 0;
    const updates = [];

    rows.forEach((row, idx) => {
      const lat = cleanNumber(row["LATITUDE"]);
      const lon = cleanNumber(row["LONGITUDE"]);
      if (lat === null || lon === null) return;

      const incidentDate = row["INCIDENT DATE"];
      const incidentTime = row["INCIDENT TIME"] || "";

      let formattedDate = null;
      if (typeof incidentDate === "number") formattedDate = excelDateToISO(incidentDate);
      if (!formattedDate && typeof incidentDate === "string") formattedDate = incidentDate;

      const payload = {
        // ✅ Keep district, but also store county for backwards compatibility if needed
        district: row["DISTRICT"] || row["district"] || row["County"] || row["COUNTY"] || "N/A",
        county: row["COUNTY"] || row["county"] || null,

        title: row["INCIDENT CATEGORY"] || row["title"] || "N/A",
        description: row["INCIDENT DESCRIPTION"] || row["description"] || "",
        actor: row["ACTORS"] || row["actor"] || "",

        time: `${formattedDate || "Unknown"} ${incidentTime}`.trim(),
        lat,
        lon,
        weight: 1,
      };

      // Batch-like push (we’ll await all pushes)
      updates.push(db.ref(INCIDENTS_PATH).push(payload));
      written++;
    });

    await Promise.all(updates);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Upload Success</title></head>
        <body style="font-family: Arial; text-align:center; padding:40px;">
          <h1>Upload Complete</h1>
          <p>${written} incidents saved to <b>${INCIDENTS_PATH}</b>.</p>
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
   🧾 Upload form
============================ */
app.get("/upload", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "upload.html"));
});

/* ============================
   Health check
============================ */
app.get("/", (_, res) => res.send("OK"));

app.listen(port, () => console.log(`✅ Server running on port ${port}`));
