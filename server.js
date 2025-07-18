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
app.use(express.static('public')); // (Optional for static images or styles)

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

    // Handle incident date conversion
    const incidentDate = row['INCIDENT DATE'];
    const incidentTime = row['INCIDENT TIME'];
    let formattedDate = 'Invalid Date';

    if (typeof incidentDate === 'number') {
      const dateObj = new Date(Math.round((incidentDate - 25569) * 86400 * 1000));
      formattedDate = dateObj.toISOString().split('T')[0]; // 'YYYY-MM-DD'
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

  // Response on successful upload
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Upload Success</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #fff;
          text-align: center;
          padding: 40px 20px;
        }
        h1 {
          color: #004990;
        }
        .message {
          font-size: 18px;
          margin: 20px 0;
        }
        a.button {
          background-color: #e21a23;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          font-size: 16px;
        }
        a.button:hover {
          background-color: #b5000c;
        }
      </style>
    </head>
    <body>
      <h1>Upload Complete</h1>
      <p class="message">Excel data uploaded to Firebase successfully!</p>
      <a class="button" href="/upload">Upload Another File</a>
    </body>
    </html>
  `);
});

// 🧭 Serve Upload Page via Route
app.get('/upload', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Upload Excel File to Firebase</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #ffffff;
          text-align: center;
          padding: 50px;
          color: #002352;
        }
        h2 {
          color: #004990;
        }
        form {
          margin-top: 20px;
        }
        input[type="file"] {
          margin-bottom: 20px;
        }
        button {
          background-color: #e21a23;
          color: white;
          padding: 10px 20px;
          border: none;
          font-size: 16px;
          border-radius: 5px;
          cursor: pointer;
        }
        button:hover {
          background-color: #b5000c;
        }
      </style>
    </head>
    <body>
      <h2>Upload Excel File to Firebase</h2>
      <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="file" accept=".xlsx, .xls" required />
        <br />
        <button type="submit">Upload</button>
      </form>
    </body>
    </html>
  `);
});

// 🟢 Start the Server
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
