const express = require('express');
const router = express.Router();
const { authMiddleware, login, logout } = require('../middleware/auth');
const Recharge = require('../models/Recharge');

// Login page
router.get('/login', (req, res) => {
  if (req.session && req.session.isLoggedIn) {
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
  res.render('dashboard', { 
    title: 'Recharge Records Dashboard',
    user: req.session.user || 'Admin'
  });
});

// Dashboard - protected (alternative route)
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