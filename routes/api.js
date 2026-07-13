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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for ZIP files
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

// Get records with pagination and search
router.get('/records', rechargeController.getRecords);

// Export records as CSV
router.get('/records/export', rechargeController.exportRecords);

// Upload file (Excel or ZIP)
router.post('/upload', upload.single('file'), uploadFile);

// ========================================
// PARAMETERIZED ROUTES (With :id)
// ========================================

// Get single record by ID
router.get('/records/:id', rechargeController.getRecord);

// Create new record
router.post('/records', rechargeController.createRecord);

// Update record
router.put('/records/:id', rechargeController.updateRecord);

// Delete single record
router.delete('/records/:id', rechargeController.deleteRecord);

module.exports = router;