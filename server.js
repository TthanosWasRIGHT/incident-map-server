require('dotenv').config();
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, push } = require('firebase/database');

const app = express();
app.use(cors());
app.use(express.static('public')); // 🔹 Serve static assets like upload.html, images, etc.

const port = process.env.PORT || 3001;

// 🔐 Firebase Config
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

// 📂 File Upload Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './upload'),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// 🚀 Upload POST Endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  data.forEach((row) => {
    const lat = parseFloat(row['LATITUDE']);
    const lon = parseFloat(row['LONGITUDE']);
    if (isNaN(lat) || isNaN(lon)) return;

    // 📅 Format date and time
    const incidentDate = row['INCIDENT DATE'];
    const incidentTime = row['INCIDENT TIME'];
    let formattedDate = 'Invalid Date';

    if (typeof incidentDate === 'number') {
      const dateObj = new Date(Math.round((incidentDate - 25569) * 86400 * 1000));
      formattedDate = dateObj.toISOString().split('T')[0];
    } else if (typeof incidentDate === 'string') {
      formattedDate = incidentDate;
    }

    const time = `${formattedDate} ${incidentTime}`;
    const county = row['COUNTY'] || 'N/A';
    const actor = row['ACTORS'] || 'N/A';
    const title = row['INCIDENT CATEGORY'] || 'N/A';
    const description = row['INCIDENT DESCRIPTION'] || 'N/A';

    const newRef = push(ref(db, 'incidents'));
    set(newRef, {
      title,
      description,
      time,
      lat,
      lon,
      county,
      actor,
    });
  });

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Upload Success</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 40px; }
          h1 { color: #004990; }
          a.button {
            background-color: #e21a23; color: white; padding: 12px 24px;
            text-decoration: none; border-radius: 4px;
            font-size: 16px;
          }
          a.button:hover { background-color: #b5000c; }
        </style>
      </head>
      <body>
        <h1>Upload Complete</h1>
        <p>Excel data uploaded to Firebase successfully!</p>
        <a class="button" href="/upload.html">Upload Another File</a>
      </body>
    </html>
  `);
});

// ✅ Serve upload form (from public/upload.html)
app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// 🟢 Start server
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
