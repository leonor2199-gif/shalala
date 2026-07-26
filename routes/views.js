const express = require('express');
const router = express.Router();
const { authMiddleware, login, logout } = require('../middleware/auth');
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw');
const mongoose = require('mongoose');

// Helper function to get storage stats
async function getStorageStats() {
    try {
        const db = mongoose.connection.db;
        
        let rechargeStats = { size: 0, count: 0 };
        let withdrawStats = { size: 0, count: 0 };
        
        try {
            // Get collection sizes using aggregate
            const rechargeResult = await db.collection('recharges').aggregate([
                { $collStats: { storageStats: {} } }
            ]).toArray();
            
            const withdrawResult = await db.collection('withdraws').aggregate([
                { $collStats: { storageStats: {} } }
            ]).toArray();
            
            if (rechargeResult.length > 0) {
                rechargeStats = {
                    size: rechargeResult[0].storageStats?.totalSize || 0,
                    count: rechargeResult[0].storageStats?.count || 0
                };
            }
            
            if (withdrawResult.length > 0) {
                withdrawStats = {
                    size: withdrawResult[0].storageStats?.totalSize || 0,
                    count: withdrawResult[0].storageStats?.count || 0
                };
            }
        } catch (error) {
            console.error('Error getting collection stats via aggregate:', error);
            // Fallback to stats() method
            try {
                const rechargeStatsFallback = await db.collection('recharges').stats();
                const withdrawStatsFallback = await db.collection('withdraws').stats();
                
                rechargeStats = {
                    size: rechargeStatsFallback.totalSize || 0,
                    count: rechargeStatsFallback.count || 0
                };
                withdrawStats = {
                    size: withdrawStatsFallback.totalSize || 0,
                    count: withdrawStatsFallback.count || 0
                };
            } catch (fallbackError) {
                console.error('Fallback stats error:', fallbackError);
            }
        }
        
        const rechargeStorageMB = (rechargeStats.size || 0) / (1024 * 1024);
        const withdrawStorageMB = (withdrawStats.size || 0) / (1024 * 1024);
        const totalStorageMB = rechargeStorageMB + withdrawStorageMB;
        const totalRecords = (rechargeStats.count || 0) + (withdrawStats.count || 0);
        const avgRecordSizeKB = totalRecords > 0 ? (totalStorageMB * 1024) / totalRecords : 0;
        
        return {
            totalStorage: totalStorageMB.toFixed(2),
            recordCount: totalRecords,
            avgRecordSize: avgRecordSizeKB.toFixed(2),
            recharges: {
                size: rechargeStorageMB.toFixed(2),
                count: rechargeStats.count || 0
            },
            withdraws: {
                size: withdrawStorageMB.toFixed(2),
                count: withdrawStats.count || 0
            }
        };
    } catch (error) {
        console.error('Error getting storage stats:', error);
        return {
            totalStorage: '0.00',
            recordCount: 0,
            avgRecordSize: '0.00',
            recharges: { size: '0.00', count: 0 },
            withdraws: { size: '0.00', count: 0 }
        };
    }
}

// Login page
router.get('/login', (req, res) => {
    console.log('📄 Login page requested');
    console.log('📝 Session:', req.session);
    
    // If already logged in, redirect to dashboard
    if (req.session && req.session.isLoggedIn) {
        console.log('✅ User already logged in, redirecting to dashboard');
        return res.redirect('/dashboard');
    }
    
    res.render('login', { error: null });
});

// Login handler
router.post('/login', login);

// Logout
router.get('/logout', logout);

// Dashboard - protected with storage stats
router.get('/dashboard', authMiddleware, async (req, res) => {
    console.log('📊 Dashboard requested');
    console.log('📝 Session:', req.session);
    
    try {
        // Get storage stats
        const storageStats = await getStorageStats();
        console.log('💾 Storage Stats:', storageStats);
        
        // Get other stats for the dashboard
        const totalRecords = await Recharge.countDocuments();
        
        const totalAmountResult = await Recharge.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalAmount = totalAmountResult[0]?.total || 0;
        
        const uniqueUsers = await Recharge.distinct('user_id');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRecords = await Recharge.countDocuments({
            request_time: { $gte: today }
        });
        
        // Get recent records for the table
        const recentRecords = await Recharge.find()
            .sort({ request_time: -1 })
            .limit(20);
        
        res.render('dashboard', {
            title: 'Recharge Records Dashboard',
            user: req.session.user || 'Admin',
            records: recentRecords,
            stats: {
                totalRecords,
                totalAmount,
                uniqueUsers: uniqueUsers.length,
                todayRecords
            },
            storage: storageStats,
            currentPage: 1,
            totalPages: Math.ceil(totalRecords / 20),
            limit: 20
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        // Render with default values if there's an error
        res.render('dashboard', {
            title: 'Recharge Records Dashboard',
            user: req.session.user || 'Admin',
            records: [],
            stats: {
                totalRecords: 0,
                totalAmount: 0,
                uniqueUsers: 0,
                todayRecords: 0
            },
            storage: {
                totalStorage: '0.00',
                recordCount: 0,
                avgRecordSize: '0.00'
            },
            currentPage: 1,
            totalPages: 1,
            limit: 20
        });
    }
});

// Root - redirect to dashboard
router.get('/', authMiddleware, (req, res) => {
    res.redirect('/dashboard');
});

// Edit page - protected
router.get('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const record = await Recharge.findById(req.params.id);
        if (!record) {
            return res.status(404).send('Record not found');
        }
        res.render('edit', {
            title: 'Edit Record',
            record: record
        });
    } catch (error) {
        console.error('Error loading edit page:', error);
        res.status(500).send('Error loading edit page');
    }
});

// Withdraw Dashboard - if you have one
router.get('/withdraw-dashboard', authMiddleware, async (req, res) => {
    console.log('💳 Withdraw Dashboard requested');
    
    try {
        const storageStats = await getStorageStats();
        const totalRecords = await Withdraw.countDocuments();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRecords = await Withdraw.countDocuments({
            request_time: { $gte: today }
        });
        
        const recentRecords = await Withdraw.find()
            .sort({ request_time: -1 })
            .limit(20);
        
        res.render('withdraw-dashboard', {
            title: 'Withdraw Records Dashboard',
            user: req.session.user || 'Admin',
            records: recentRecords,
            stats: {
                totalRecords,
                todayRecords
            },
            storage: storageStats,
            currentPage: 1,
            totalPages: Math.ceil(totalRecords / 20),
            limit: 20
        });
    } catch (error) {
        console.error('Withdraw dashboard error:', error);
        res.render('withdraw-dashboard', {
            title: 'Withdraw Records Dashboard',
            user: req.session.user || 'Admin',
            records: [],
            stats: {
                totalRecords: 0,
                todayRecords: 0
            },
            storage: {
                totalStorage: '0.00',
                recordCount: 0,
                avgRecordSize: '0.00'
            },
            currentPage: 1,
            totalPages: 1,
            limit: 20
        });
    }
});

module.exports = router;
