const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const rechargeController = require('../controllers/rechargeController');
const { uploadFile } = require('../controllers/uploadController');
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw'); // Add this
const userApi = require('./user-api'); // Import user API

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['xlsx', 'xls', 'zip'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and ZIP (.zip) files are allowed'));
    }
  }
});

// ========================================
// USER API ROUTES - NO AUTHENTICATION REQUIRED
// ========================================
router.use('/', userApi); // User routes (no auth)

// ========================================
// ADMIN API ROUTES - AUTHENTICATION REQUIRED
// ========================================
router.use(authMiddleware); // Apply authentication to ALL routes below

// ========================================
// SPECIFIC ROUTES FIRST (No parameters)
// ========================================

// Delete all recharge records
router.delete('/records/delete-all', async (req, res) => {
  try {
    const result = await Recharge.deleteMany({});
    res.json({
      message: 'All recharge records deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all records:', error);
    res.status(500).json({ error: 'Failed to delete all records' });
  }
});

// Delete all withdraw records
router.delete('/withdraw/delete-all', async (req, res) => {
  try {
    const result = await Withdraw.deleteMany({});
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
// RECHARGE RECORDS - ADMIN
// ========================================

// Get recharge records with pagination, search, and date filter
router.get('/records', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20, startDate = '', endDate = '' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build search query
    let query = {};
    let searchConditions = [];
    
    // Text search
    if (search.trim()) {
      searchConditions = [
        { username: { $regex: search, $options: 'i' } },
        { user_id: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    let dateQuery = {};
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateQuery.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }
    }
    
    // Combine queries
    if (searchConditions.length > 0 && Object.keys(dateQuery).length > 0) {
      query = {
        $and: [
          { $or: searchConditions },
          { request_time: dateQuery }
        ]
      };
    } else if (searchConditions.length > 0) {
      query = { $or: searchConditions };
    } else if (Object.keys(dateQuery).length > 0) {
      query = { request_time: dateQuery };
    }
    
    console.log('🔍 Recharge Query:', JSON.stringify(query));
    
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
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// Export recharge records as CSV
router.get('/records/export', async (req, res) => {
  try {
    const { search = '', startDate = '', endDate = '' } = req.query;
    
    let query = {};
    let searchConditions = [];
    
    if (search.trim()) {
      searchConditions = [
        { username: { $regex: search, $options: 'i' } },
        { user_id: { $regex: search, $options: 'i' } }
      ];
    }
    
    let dateQuery = {};
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateQuery.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }
    }
    
    if (searchConditions.length > 0 && Object.keys(dateQuery).length > 0) {
      query = {
        $and: [
          { $or: searchConditions },
          { request_time: dateQuery }
        ]
      };
    } else if (searchConditions.length > 0) {
      query = { $or: searchConditions };
    } else if (Object.keys(dateQuery).length > 0) {
      query = { request_time: dateQuery };
    }
    
    const records = await Recharge.find(query).sort({ request_time: -1 });
    
    const headers = 'Username,User ID,Amount,Fee,Request Time,Process Time\n';
    const rows = records.map(r => 
      `${r.username},${r.user_id},${r.amount},${r.fee},${r.request_time},${r.process_time}`
    ).join('\n');
    
    const csv = headers + rows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=recharge_export_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting records:', error);
    res.status(500).json({ error: 'Failed to export records' });
  }
});

// ========================================
// WITHDRAW RECORDS - ADMIN
// ========================================

// Get all withdraw records with pagination, search, and date filter
router.get('/withdraw', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20, startDate = '', endDate = '' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};
    let searchConditions = [];
    
    // Text search
    if (search.trim()) {
      searchConditions = [
        { username: { $regex: search, $options: 'i' } },
        { user_id: { $regex: search, $options: 'i' } },
        { order_id: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    let dateQuery = {};
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateQuery.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }
    }
    
    // Combine queries
    if (searchConditions.length > 0 && Object.keys(dateQuery).length > 0) {
      query = {
        $and: [
          { $or: searchConditions },
          { request_time: dateQuery }
        ]
      };
    } else if (searchConditions.length > 0) {
      query = { $or: searchConditions };
    } else if (Object.keys(dateQuery).length > 0) {
      query = { request_time: dateQuery };
    }
    
    console.log('🔍 Withdraw Query:', JSON.stringify(query));
    
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

// Export withdraw records as CSV
router.get('/withdraw/export', async (req, res) => {
  try {
    const { search = '', startDate = '', endDate = '' } = req.query;
    
    let query = {};
    let searchConditions = [];
    
    if (search.trim()) {
      searchConditions = [
        { username: { $regex: search, $options: 'i' } },
        { user_id: { $regex: search, $options: 'i' } },
        { order_id: { $regex: search, $options: 'i' } }
      ];
    }
    
    let dateQuery = {};
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateQuery.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }
    }
    
    if (searchConditions.length > 0 && Object.keys(dateQuery).length > 0) {
      query = {
        $and: [
          { $or: searchConditions },
          { request_time: dateQuery }
        ]
      };
    } else if (searchConditions.length > 0) {
      query = { $or: searchConditions };
    } else if (Object.keys(dateQuery).length > 0) {
      query = { request_time: dateQuery };
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
// FILE UPLOAD
// ========================================

// Upload file (Excel or ZIP)
router.post('/upload', upload.single('file'), uploadFile);

// ========================================
// STORAGE STATS
// ========================================

// Get recharge storage stats
router.get('/storage-stats/recharge', async (req, res) => {
  try {
    const stats = await Recharge.db.collection('recharges').stats();
    res.json({
      collection: 'recharges',
      totalSizeBytes: stats.totalSize || 0,
      storageSizeBytes: stats.storageSize || 0,
      indexSizeBytes: stats.totalIndexSize || 0,
      avgObjSizeBytes: stats.avgObjSize || 0,
      count: stats.count || 0,
      totalSizeMB: ((stats.totalSize || 0) / (1024 * 1024)).toFixed(2),
      storageSizeMB: ((stats.storageSize || 0) / (1024 * 1024)).toFixed(2),
      indexSizeMB: ((stats.totalIndexSize || 0) / (1024 * 1024)).toFixed(2),
      avgObjSizeKB: ((stats.avgObjSize || 0) / 1024).toFixed(2)
    });
  } catch (error) {
    console.error('Error fetching recharge storage stats:', error);
    res.status(500).json({ error: 'Failed to fetch storage stats' });
  }
});

// Get withdraw storage stats
router.get('/storage-stats/withdraw', async (req, res) => {
  try {
    const stats = await Withdraw.db.collection('withdraws').stats();
    res.json({
      collection: 'withdraws',
      totalSizeBytes: stats.totalSize || 0,
      storageSizeBytes: stats.storageSize || 0,
      indexSizeBytes: stats.totalIndexSize || 0,
      avgObjSizeBytes: stats.avgObjSize || 0,
      count: stats.count || 0,
      totalSizeMB: ((stats.totalSize || 0) / (1024 * 1024)).toFixed(2),
      storageSizeMB: ((stats.storageSize || 0) / (1024 * 1024)).toFixed(2),
      indexSizeMB: ((stats.totalIndexSize || 0) / (1024 * 1024)).toFixed(2),
      avgObjSizeKB: ((stats.avgObjSize || 0) / 1024).toFixed(2)
    });
  } catch (error) {
    console.error('Error fetching withdraw storage stats:', error);
    res.status(500).json({ error: 'Failed to fetch storage stats' });
  }
});

// Combined storage stats
router.get('/storage-stats', async (req, res) => {
  try {
    const [rechargeStats, withdrawStats] = await Promise.all([
      Recharge.db.collection('recharges').stats(),
      Withdraw.db.collection('withdraws').stats()
    ]);
    
    res.json({
      recharges: {
        totalSizeMB: ((rechargeStats.totalSize || 0) / (1024 * 1024)).toFixed(2),
        storageSizeMB: ((rechargeStats.storageSize || 0) / (1024 * 1024)).toFixed(2),
        count: rechargeStats.count || 0
      },
      withdraws: {
        totalSizeMB: ((withdrawStats.totalSize || 0) / (1024 * 1024)).toFixed(2),
        storageSizeMB: ((withdrawStats.storageSize || 0) / (1024 * 1024)).toFixed(2),
        count: withdrawStats.count || 0
      }
    });
  } catch (error) {
    console.error('Error fetching storage stats:', error);
    res.status(500).json({ error: 'Failed to fetch storage stats' });
  }
});

// ========================================
// PARAMETERIZED ROUTES (With :id)
// ========================================

// Get single recharge record by ID
router.get('/records/:id', rechargeController.getRecord);

// Create new recharge record
router.post('/records', rechargeController.createRecord);

// Update recharge record
router.put('/records/:id', rechargeController.updateRecord);

// Delete single recharge record
router.delete('/records/:id', rechargeController.deleteRecord);

// Get single withdraw record by ID
router.get('/withdraw/:id', async (req, res) => {
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

// Update withdraw record
router.put('/withdraw/:id', async (req, res) => {
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

// Delete single withdraw record
router.delete('/withdraw/:id', async (req, res) => {
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
