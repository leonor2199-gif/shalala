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
// USER VERIFICATION - Check both collections
// ========================================

router.get('/users/verify/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 Verifying user: ${userId}`);
    
    // Check recharge by user_id, check withdraw by username (since they're swapped)
    const [rechargeUser, withdrawUser] = await Promise.all([
      Recharge.findOne({ user_id: userId }),        // Recharge uses user_id correctly
      Withdraw.findOne({ username: userId })        // Withdraw stores ID in username
    ]);
    
    const user = rechargeUser || withdrawUser;
    
    console.log(`✅ User found: ${!!user}`);
    if (user) {
      console.log(`📝 Found in: ${rechargeUser ? 'Recharge' : 'Withdraw'}`);
    }
    
    res.json({
      exists: !!user,
      username: user?.username || null,
      foundIn: rechargeUser ? 'recharge' : (withdrawUser ? 'withdraw' : null)
    });
    
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========================================
// USER RECHARGE RECORDS - Use user_id
// ========================================

router.get('/users/:userId/recharges', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching recharges for user: ${userId}`);
    
    // Recharge uses user_id correctly
    const records = await Recharge.find({ 
      user_id: userId 
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
// USER WITHDRAW RECORDS - Use username
// ========================================

router.get('/users/:userId/withdraws', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching withdraws for user: ${userId}`);
    
    // Withdraw stores the actual ID in username field (swapped)
    const records = await Withdraw.find({ 
      username: userId 
    }).sort({ request_time: -1 }).limit(100);
    
    console.log(`✅ Found ${records.length} withdraws for user ${userId}`);
    
    // If no records found, also try user_id as fallback
    if (records.length === 0) {
      console.log(`⚠️ No records found with username, trying user_id as fallback`);
      const fallbackRecords = await Withdraw.find({ 
        user_id: userId 
      }).sort({ request_time: -1 }).limit(100);
      
      if (fallbackRecords.length > 0) {
        console.log(`✅ Found ${fallbackRecords.length} withdraws using user_id fallback`);
        return res.json({
          records: fallbackRecords,
          total: fallbackRecords.length
        });
      }
    }
    
    res.json({
      records,
      total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user withdraws:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========================================
// OPTIONAL: Get both recharge and withdraw in one call
// ========================================

router.get('/users/:userId/all-records', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching all records for user: ${userId}`);
    
    const [recharges, withdraws] = await Promise.all([
      Recharge.find({ user_id: userId }).sort({ request_time: -1 }).limit(100),
      Withdraw.find({ username: userId }).sort({ request_time: -1 }).limit(100)
    ]);
    
    console.log(`✅ Found ${recharges.length} recharges and ${withdraws.length} withdraws`);
    
    res.json({
      recharges,
      withdraws,
      totals: {
        recharges: recharges.length,
        withdraws: withdraws.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching user records:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
