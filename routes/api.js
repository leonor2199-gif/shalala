const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const rechargeController = require('../controllers/rechargeController');
const { uploadFile } = require('../controllers/uploadController');
const Recharge = require('../models/Recharge');

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

// Apply authentication to all API routes
router.use(authMiddleware);

// ========================================
// SPECIFIC ROUTES FIRST (No parameters)
// ========================================

// Delete all records - MUST come before /records/:id
router.delete('/records/delete-all', async (req, res) => {
  try {
    const result = await Recharge.deleteMany({});
    res.json({
      message: 'All records deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all records:', error);
    res.status(500).json({ error: 'Failed to delete all records' });
  }
});

// Get records with pagination, search, and date filter
router.get('/records', authMiddleware, async (req, res) => {
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

// Export records with search and date filters
router.get('/records/export', authMiddleware, async (req, res) => {
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

// Upload file (Excel or ZIP)
router.post('/upload', upload.single('file'), uploadFile);

// Get storage stats
router.get('/storage-stats', authMiddleware, async (req, res) => {
  try {
    const stats = await Recharge.db.collection('recharges').stats();
    res.json({
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
    console.error('Error fetching storage stats:', error);
    res.status(500).json({ error: 'Failed to fetch storage stats' });
  }
});

// ========================================
// PARAMETERIZED ROUTES (With :id)
// ========================================

// Get single record by ID
router.get('/records/:id', authMiddleware, rechargeController.getRecord);

// Create new record
router.post('/records', authMiddleware, rechargeController.createRecord);

// Update record
router.put('/records/:id', authMiddleware, rechargeController.updateRecord);

// Delete single record
router.delete('/records/:id', authMiddleware, rechargeController.deleteRecord);

module.exports = router;
