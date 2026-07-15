// user-api.js - This file should NOT use authMiddleware
const express = require('express');
const router = express.Router();
const Withdraw = require('../models/Withdraw');
const Recharge = require('../models/Recharge');

// Get user's withdraw records - PUBLIC endpoint
router.get('/users/:userId/withdraws', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching withdraws for user: ${userId}`);
    
    // Query the database directly
    const records = await Withdraw.find({ 
      user_id: userId  // Make sure this matches your schema field name
    }).sort({ request_time: -1 });
    
    console.log(`✅ Found ${records.length} withdraw records`);
    
    res.json({
      records: records,
      total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user withdraws:', error);
    res.status(500).json({ error: 'Failed to fetch withdraw records' });
  }
});

// Get user's recharge records - PUBLIC endpoint
router.get('/users/:userId/recharges', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching recharges for user: ${userId}`);
    
    const records = await Recharge.find({ 
      user_id: userId 
    }).sort({ request_time: -1 });
    
    console.log(`✅ Found ${records.length} recharge records`);
    
    res.json({
      records: records,
      total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user recharges:', error);
    res.status(500).json({ error: 'Failed to fetch recharge records' });
  }
});

// Verify user exists - PUBLIC endpoint
router.get('/users/verify/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 Verifying user: ${userId}`);
    
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

// checking status 
router.get('/debug/withdraw-sample', async (req, res) => {
  try {
    // Get one sample record
    const sample = await Withdraw.findOne({});
    
    if (!sample) {
      return res.json({ 
        message: 'No withdraw records found in database',
        totalRecords: await Withdraw.countDocuments()
      });
    }
    
    const obj = sample.toObject ? sample.toObject() : sample;
    
    res.json({
      totalRecords: await Withdraw.countDocuments(),
      sampleFields: Object.keys(obj),
      sampleData: obj,
      // Check specifically for user ID fields
      userIdFields: Object.keys(obj).filter(f => 
        f.toLowerCase().includes('user') || 
        f.toLowerCase().includes('id') ||
        f.toLowerCase().includes('uid')
      )
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
