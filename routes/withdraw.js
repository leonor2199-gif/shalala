const express = require('express');
const router = express.Router();
const Withdraw = require('../models/Withdraw');
const { authMiddleware } = require('../middleware/auth');

// Get withdraw records with pagination and search
router.get('/api/withdraw', authMiddleware, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};
    if (search.trim()) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { user_id: { $regex: search, $options: 'i' } },
          { bank_name: { $regex: search, $options: 'i' } },
          { bank_holder: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
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
    console.error('Error fetching withdraw records:', error);
    res.status(500).json({ error: 'Failed to fetch withdraw records' });
  }
});

// Delete all withdraw records
router.delete('/api/withdraw/delete-all', authMiddleware, async (req, res) => {
  try {
    const result = await Withdraw.deleteMany({});
    res.json({
      message: 'All withdraw records deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting withdraw records:', error);
    res.status(500).json({ error: 'Failed to delete withdraw records' });
  }
});

// Get withdraw stats
router.get('/api/withdraw/stats', authMiddleware, async (req, res) => {
  try {
    const total = await Withdraw.countDocuments();
    const totalAmount = await Withdraw.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const statusStats = await Withdraw.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const amount = totalAmount.length > 0 ? totalAmount[0].total : 0;
    
    res.json({
      total,
      totalAmount: amount,
      statusStats
    });
  } catch (error) {
    console.error('Error fetching withdraw stats:', error);
    res.status(500).json({ error: 'Failed to fetch withdraw stats' });
  }
});

module.exports = router;
