const express = require('express');
const router = express.Router();
const Withdraw = require('../models/Withdraw');
const { authMiddleware } = require('../middleware/auth');

// ========================================
// DELETE ALL - MUST COME BEFORE /:id
// ========================================

// Delete all withdraw records
router.delete('/delete-all', authMiddleware, async (req, res) => {
  console.log('🗑️ Delete all withdraw records requested');
  try {
    const result = await Withdraw.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} withdraw records`);
    res.json({
      message: 'All withdraw records deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all withdraw records:', error);
    res.status(500).json({ error: 'Failed to delete all withdraw records' });
  }
});

// ========================================
// GET RECORDS WITH PAGINATION AND SEARCH
// ========================================

router.get('/', authMiddleware, async (req, res) => {
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

// ========================================
// EXPORT RECORDS
// ========================================

router.get('/export', authMiddleware, async (req, res) => {
  try {
    const { search = '' } = req.query;
    
    let query = {};
    if (search.trim()) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { user_id: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const records = await Withdraw.find(query).sort({ request_time: -1 });
    
    const headers = 'Order ID,User ID,Username,VIP Level,Balance,Amount,Fee,Net Amount,Bank,Account,Holder,Status,Request Time\n';
    const rows = records.map(r => 
      `${r.order_id || ''},${r.user_id},${r.username},${r.vip_level || ''},${r.balance || ''},${r.amount},${r.fee_percent || '0%'},${r.net_amount || r.amount},${r.bank_name || ''},${r.bank_account || ''},${r.bank_holder || ''},${r.status},${r.request_time}`
    ).join('\n');
    
    const csv = headers + rows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=withdraw_export_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting withdraw records:', error);
    res.status(500).json({ error: 'Failed to export withdraw records' });
  }
});

// ========================================
// GET SINGLE RECORD
// ========================================

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await Withdraw.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    console.error('Error fetching withdraw record:', error);
    res.status(500).json({ error: 'Failed to fetch withdraw record' });
  }
});

// ========================================
// UPDATE RECORD
// ========================================

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { username, user_id, amount, status, bank_name, bank_account } = req.body;
    
    const record = await Withdraw.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    if (username) record.username = username;
    if (user_id) record.user_id = user_id;
    if (amount) record.amount = parseFloat(amount);
    if (status) record.status = status;
    if (bank_name) record.bank_name = bank_name;
    if (bank_account) record.bank_account = bank_account;
    
    await record.save();
    
    res.json({
      message: 'Record updated successfully',
      record
    });
  } catch (error) {
    console.error('Error updating withdraw record:', error);
    res.status(500).json({ error: 'Failed to update withdraw record' });
  }
});

// ========================================
// DELETE SINGLE RECORD
// ========================================

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await Withdraw.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting withdraw record:', error);
    res.status(500).json({ error: 'Failed to delete withdraw record' });
  }
});

module.exports = router;
