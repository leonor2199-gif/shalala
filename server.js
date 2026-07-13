const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection with better error handling
let isMongoConnected = false;

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  isMongoConnected = true;
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  isMongoConnected = false;
});

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration with fallback
let sessionMiddleware;

if (isMongoConnected) {
  // Use MongoDB session store
  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'default_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      touchAfter: 24 * 3600,
      crypto: {
        secret: process.env.SESSION_SECRET || 'default_secret_key'
      },
      // Error handling for session store
      clientPromise: mongoose.connection.asPromise()
    }),
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true
    }
  });
  console.log('✅ Using MongoDB session store');
} else {
  // Fallback to memory store (for development)
  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'default_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true
    }
  });
  console.log('⚠️ Using memory session store (fallback)');
}

app.use(sessionMiddleware);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/views'));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongoConnected: isMongoConnected
  });
});

// Test DB endpoint
app.get('/test-db', async (req, res) => {
  try {
    if (!isMongoConnected) {
      return res.json({ 
        status: 'ERROR', 
        connected: false, 
        error: 'MongoDB not connected' 
      });
    }
    const Recharge = mongoose.model('Recharge');
    const count = await Recharge.countDocuments();
    res.json({ 
      status: 'OK', 
      connected: true, 
      count: count 
    });
  } catch (error) {
    res.json({ 
      status: 'ERROR', 
      connected: false, 
      error: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('login', { 
    error: 'Page not found' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Dashboard: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/dashboard`);
  console.log(`🔐 Login: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/login`);
  console.log(`📊 MongoDB Status: ${isMongoConnected ? 'Connected ✅' : 'Disconnected ❌'}`);
});
