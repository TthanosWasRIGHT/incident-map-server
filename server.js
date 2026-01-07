require('dotenv').config();
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push } = require('firebase/database');

const app = express();
app.use(cors());
app.use(express.static('public'));

const port = process.env.PORT || 3001;

/* ============================
   Firebase (Kenya)
============================ */
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

/* ============================
   Ensure upload directory
============================ */
const UPLOAD_DIR = path.join(__dirname, 'upload');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

/* ============================
   Multer config
============================ */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });

/* ============================
   Upload endpoint (KENYA)
============================ */
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let written = 0;

    rows.forEach(row => {
      const lat = parseFloat(row['LATITUDE']);
      const lon = parseFloat(row['LONGITUDE']);
      if (isNaN(lat) || isNaN(lon)) return;

      push(ref(db, 'incidents/kenya'), {
        county: row['COUNTY'] || 'N/A',
        title: row['INCIDENT CATEGORY'] || 'N/A',
        description: row['INCIDENT DESCRIPTION'] || '',
        actor: row['ACTORS'] || '',
        time: `${row['INCIDENT DATE']} ${row['INCIDENT TIME'] || ''}`,
        lat,
        lon,
        weight: 1,
      });

      written++;
    });

    res.send(`
      <h1>Upload Complete</h1>
      <p>${written} Kenya incidents saved.</p>
      <a href="/upload.html">Upload another file</a>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Upload failed');
  }
});

/* ============================
   Upload form
============================ */
app.get('/upload', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.listen(port, () =>
  console.log(`✅ Kenya server running on port ${port}`)
);
