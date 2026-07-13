const express = require('express');
const router = express.Router();
const { authMiddleware, login, logout } = require('../middleware/auth');
const Recharge = require('../models/Recharge');

// Login page
router.get('/login', (req, res) => {
  console.log('📄 Login page requested');
  console.log('📝 Session:', req.session);
  
  // If already logged in, redirect to dashboard
  if (req.session && req.session.isLoggedIn) {
    console.log('✅ User already logged in, redirecting to dashboard');
    return res.redirect('/dashboard');
  }
  
  res.render('login', { error: null });
});

// Login handler
router.post('/login', login);

// Logout
router.get('/logout', logout);

// Dashboard - protected
router.get('/dashboard', authMiddleware, (req, res) => {
  console.log('📊 Dashboard requested');
  console.log('📝 Session:', req.session);
  res.render('dashboard', { 
    title: 'Recharge Records Dashboard',
    user: req.session.user || 'Admin'
  });
});

// Root - redirect to dashboard
router.get('/', authMiddleware, (req, res) => {
  res.redirect('/dashboard');
});

// Edit page - protected
router.get('/edit/:id', authMiddleware, async (req, res) => {
  try {
    const record = await Recharge.findById(req.params.id);
    if (!record) {
      return res.status(404).send('Record not found');
    }
    res.render('edit', { 
      title: 'Edit Record',
      record: record
    });
  } catch (error) {
    console.error('Error loading edit page:', error);
    res.status(500).send('Error loading edit page');
  }
});

module.exports = router;
