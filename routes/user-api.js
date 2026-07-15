// Add to your Render backend - user-api.js
const express = require('express');
const router = express.Router();
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw');

// Verify user exists
router.get('/users/verify/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Check in both collections
    const [rechargeUser, withdrawUser] = await Promise.all([
      Recharge.findOne({ user_id: userId }),
      Withdraw.findOne({ user_id: userId })
    ]);
    
    const user = rechargeUser || withdrawUser;
    
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
    const { page = 1, limit = 50 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const query = { user_id: userId };
    const total = await Recharge.countDocuments(query);
    const records = await Recharge.find(query)
      .sort({ request_time: -1 })
      .skip(skip)
      .limit(limitNum);
    
    res.json({
      records,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
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
    const { page = 1, limit = 50 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const query = { user_id: userId };
    const total = await Withdraw.countDocuments(query);
    const records = await Withdraw.find(query)
      .sort({ request_time: -1 })
      .skip(skip)
      .limit(limitNum);
    
    res.json({
      records,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
    
  } catch (error) {
    console.error('Error fetching user withdraws:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
