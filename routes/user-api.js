// user-api.js
const express = require('express');
const router = express.Router();
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw');

// Verify user exists
router.get('/users/verify/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 Verifying user: ${userId}`);
    
    // Check in both collections
    const [rechargeUser, withdrawUser] = await Promise.all([
      Recharge.findOne({ user_id: userId }),
      Withdraw.findOne({ user_id: userId })
    ]);
    
    const user = rechargeUser || withdrawUser;
    
    console.log(`✅ User found: ${!!user}`);
    
    res.json({
      exists: !!user,
      username: user?.username || null
    });
    
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's recharge records
router.get('/users/:userId/recharges', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching recharges for: ${userId}`);
    
    const query = { user_id: userId };
    const records = await Recharge.find(query)
      .sort({ request_time: -1 })
      .limit(100);
    
    console.log(`✅ Found ${records.length} recharges`);
    
    res.json({
      records,
      total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user recharges:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's withdraw records
router.get('/users/:userId/withdraws', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching withdraws for: ${userId}`);
    
    const query = { user_id: userId };
    const records = await Withdraw.find(query)
      .sort({ request_time: -1 })
      .limit(100);
    
    console.log(`✅ Found ${records.length} withdraws`);
    
    res.json({
      records,
      total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user withdraws:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
