const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err.message));

// Middleware - ORDER MATTERS!
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// SIMPLE SESSION - No MongoDB store (works on Render)
app.use(session({
  secret: process.env.SESSION_SECRET || 'my_super_secret_key_123',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to true if using HTTPS (Render uses HTTPS)
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make session available in all views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Routes - ORDER MATTERS!
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/views'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    session: req.sessionID
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('login', { error: 'Page not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Dashboard: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/dashboard`);
  console.log(`🔐 Login: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/login`);
});
