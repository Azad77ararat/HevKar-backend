const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Firebase - سيُفعّل لاحقاً
let admin = null;
try {
  admin = require('firebase-admin');
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized');
    }
  }
} catch (e) {
  console.error('Firebase init error (non-fatal):', e.message);
  admin = null;
}

// تصدير admin للاستخدام في routes
global.firebaseAdmin = admin;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/messages', require('./routes/messages'));

// housing route - اختياري
try {
  app.use('/api/housing', require('./routes/housing'));
} catch(e) {
  console.log('Housing route not available');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'HevKar API', version: '1.0.0' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`🚀 HevKar API running on http://localhost:${PORT}`);
});
