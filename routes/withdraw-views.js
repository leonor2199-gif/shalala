const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Withdraw dashboard
router.get('/withdraw', authMiddleware, (req, res) => {
  res.render('withdraw-dashboard', { 
    title: 'Withdraw Records Dashboard',
    user: req.session.user || 'Admin'
  });
});

module.exports = router;
