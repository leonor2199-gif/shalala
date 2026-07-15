const express = require('express');
const router = express.Router();
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw');

// ========================================
// DEBUG ENDPOINT - Check collection structure
// ========================================

router.get('/debug/withdraw-sample', async (req, res) => {
  try {
    const totalRecords = await Withdraw.countDocuments();
    const sample = await Withdraw.findOne({});
    
    if (!sample) {
      return res.json({ 
        message: 'No withdraw records found in database',
        totalRecords: totalRecords
      });
    }
    
    const obj = sample.toObject ? sample.toObject() : sample;
    
    res.json({
      totalRecords: totalRecords,
      sampleFields: Object.keys(obj),
      sampleData: obj,
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

// ========================================
// USER VERIFICATION
// ========================================

router.get('/users/verify/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 Verifying user: ${userId}`);
    
    // Search by username field (where the actual ID is stored)
    const [rechargeUser, withdrawUser] = await Promise.all([
      Recharge.findOne({ username: userId }),
      Withdraw.findOne({ username: userId })
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

// ========================================
// USER RECHARGE RECORDS
// ========================================

router.get('/users/:userId/recharges', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching recharges for: ${userId}`);
    
    // Search by username field
    const records = await Recharge.find({ 
      username: userId 
    }).sort({ request_time: -1 }).limit(100);
    
    console.log(`✅ Found ${records.length} recharges for user ${userId}`);
    
    res.json({
      records,
      total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user recharges:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========================================
// USER WITHDRAW RECORDS
// ========================================

router.get('/users/:userId/withdraws', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching withdraws for user: ${userId}`);
    
    // Search by username field (where the actual ID is stored)
    const records = await Withdraw.find({ 
      username: userId 
    }).sort({ request_time: -1 }).limit(100);
    
    console.log(`✅ Found ${records.length} withdraws for user ${userId}`);
    
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
