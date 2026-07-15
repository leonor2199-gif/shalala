const express = require('express');
const router = express.Router();
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw');

// ========================================
// HELPER FUNCTIONS
// ========================================

// Translate status to Spanish
function translateStatus(status) {
  const statusMap = {
    '待审核': 'Pendiente de Revisión',
    '已完成': 'Completado',
    '已拒绝': 'Rechazado',
    '处理中': 'En Proceso',
    '审核中': 'En Revisión',
    '已通过': 'Aprobado',
    '已取消': 'Cancelado',
    '待处理': 'Pendiente',
    '待确认': 'Pendiente de Confirmación',
    '已确认': 'Confirmado',
    '已失败': 'Fallido',
    '成功': 'Exitoso',
    '失败': 'Fallido'
  };
  
  return statusMap[status] || status || 'Desconocido';
}

// Get status color class for badges
function getStatusColor(status) {
  const colorMap = {
    '待审核': 'bg-yellow-100 text-yellow-800',
    '已完成': 'bg-green-100 text-green-800',
    '已拒绝': 'bg-red-100 text-red-800',
    '处理中': 'bg-blue-100 text-blue-800',
    '审核中': 'bg-purple-100 text-purple-800',
    '已通过': 'bg-green-100 text-green-800',
    '已取消': 'bg-gray-100 text-gray-800',
    '待处理': 'bg-orange-100 text-orange-800',
    '待确认': 'bg-yellow-100 text-yellow-800',
    '已确认': 'bg-green-100 text-green-800',
    '已失败': 'bg-red-100 text-red-800',
    '成功': 'bg-green-100 text-green-800',
    '失败': 'bg-red-100 text-red-800'
  };
  
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}

// ========================================
// DEBUG ENDPOINTS
// ========================================

// Check withdraw collection structure
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

// Check recharge collection structure
router.get('/debug/recharge-sample', async (req, res) => {
  try {
    const totalRecords = await Recharge.countDocuments();
    const sample = await Recharge.findOne({});
    
    if (!sample) {
      return res.json({ 
        message: 'No recharge records found in database',
        totalRecords: totalRecords
      });
    }
    
    const obj = sample.toObject ? sample.toObject() : sample;
    
    res.json({
      totalRecords: totalRecords,
      sampleFields: Object.keys(obj),
      sampleData: obj
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// USER VERIFICATION
// ========================================

// Verify user exists
router.get('/users/verify/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 Verifying user: ${userId}`);
    
    // Check recharge by user_id, check withdraw by username (since they're swapped)
    const [rechargeUser, withdrawUser] = await Promise.all([
      Recharge.findOne({ user_id: userId }),
      Withdraw.findOne({ username: userId })
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
// USER RECHARGE RECORDS
// ========================================

// Get user's recharge records
router.get('/users/:userId/recharges', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching recharges for user: ${userId}`);
    
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
// USER WITHDRAW RECORDS
// ========================================

// Get user's withdraw records with Spanish translations
router.get('/users/:userId/withdraws', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching withdraws for user: ${userId}`);
    
    // Withdraw stores the actual ID in username field (swapped)
    let records = await Withdraw.find({ 
      username: userId 
    }).sort({ request_time: -1 }).limit(100);
    
    // If no records found, try user_id as fallback
    if (records.length === 0) {
      console.log(`⚠️ No records found with username, trying user_id as fallback`);
      records = await Withdraw.find({ 
        user_id: userId 
      }).sort({ request_time: -1 }).limit(100);
    }
    
    console.log(`✅ Found ${records.length} withdraws for user ${userId}`);
    
    // Translate statuses and format dates
    const translatedRecords = records.map(record => {
      const obj = record.toObject ? record.toObject() : record;
      return {
        ...obj,
        status: translateStatus(obj.status),
        status_original: obj.status, // Keep original if needed
        status_color: getStatusColor(obj.status),
        request_time_formatted: obj.request_time ? new Date(obj.request_time).toLocaleString('es-ES') : null,
        process_time1_formatted: obj.process_time1 ? new Date(obj.process_time1).toLocaleString('es-ES') : null,
        process_time2_formatted: obj.process_time2 ? new Date(obj.process_time2).toLocaleString('es-ES') : null
      };
    });
    
    res.json({
      records: translatedRecords,
      total: translatedRecords.length,
      original_total: records.length
    });
    
  } catch (error) {
    console.error('Error fetching user withdraws:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========================================
// COMBINED RECORDS
// ========================================

// Get both recharge and withdraw records in one call
router.get('/users/:userId/all-records', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📊 Fetching all records for user: ${userId}`);
    
    const [recharges, withdraws] = await Promise.all([
      Recharge.find({ user_id: userId }).sort({ request_time: -1 }).limit(100),
      Withdraw.find({ username: userId }).sort({ request_time: -1 }).limit(100)
    ]);
    
    // Translate withdraw statuses
    const translatedWithdraws = withdraws.map(record => {
      const obj = record.toObject ? record.toObject() : record;
      return {
        ...obj,
        status: translateStatus(obj.status),
        status_original: obj.status,
        status_color: getStatusColor(obj.status),
        request_time_formatted: obj.request_time ? new Date(obj.request_time).toLocaleString('es-ES') : null
      };
    });
    
    console.log(`✅ Found ${recharges.length} recharges and ${translatedWithdraws.length} withdraws`);
    
    res.json({
      recharges,
      withdraws: translatedWithdraws,
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

// ========================================
// STATUS TRANSLATION HELPER - For frontend use
// ========================================

// Get status translations mapping
router.get('/status-translations', async (req, res) => {
  try {
    const statusMap = {
      '待审核': 'Pendiente de Revisión',
      '已完成': 'Completado',
      '已拒绝': 'Rechazado',
      '处理中': 'En Proceso',
      '审核中': 'En Revisión',
      '已通过': 'Aprobado',
      '已取消': 'Cancelado',
      '待处理': 'Pendiente',
      '待确认': 'Pendiente de Confirmación',
      '已确认': 'Confirmado',
      '已失败': 'Fallido',
      '成功': 'Exitoso',
      '失败': 'Fallido'
    };
    
    res.json({
      translations: statusMap,
      colors: {
        '待审核': 'bg-yellow-100 text-yellow-800',
        '已完成': 'bg-green-100 text-green-800',
        '已拒绝': 'bg-red-100 text-red-800',
        '处理中': 'bg-blue-100 text-blue-800',
        '审核中': 'bg-purple-100 text-purple-800',
        '已通过': 'bg-green-100 text-green-800',
        '已取消': 'bg-gray-100 text-gray-800',
        '待处理': 'bg-orange-100 text-orange-800',
        '待确认': 'bg-yellow-100 text-yellow-800',
        '已确认': 'bg-green-100 text-green-800',
        '已失败': 'bg-red-100 text-red-800',
        '成功': 'bg-green-100 text-green-800',
        '失败': 'bg-red-100 text-red-800'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// HEALTH CHECK
// ========================================

router.get('/health', async (req, res) => {
  try {
    const rechargeCount = await Recharge.countDocuments();
    const withdrawCount = await Withdraw.countDocuments();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      collections: {
        recharges: rechargeCount,
        withdraws: withdrawCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error',
      error: error.message 
    });
  }
});

module.exports = router;
