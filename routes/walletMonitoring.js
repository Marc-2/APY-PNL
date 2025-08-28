const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const walletMonitor = require('../services/walletMonitor');
const scheduler = require('../services/scheduler');

const router = express.Router();

// Get user's transaction history
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const transactions = await walletMonitor.getUserTransactions(req.user.id, parseInt(limit));
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user's notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, unread_only = false } = req.query;
    
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = ? ${unread_only === 'true' ? 'AND is_sent = 0' : ''}
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    
    const notifications = await new Promise((resolve, reject) => {
      const db = require('../database/db');
      db.db.all(query, [req.user.id, parseInt(limit)], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      UPDATE notifications 
      SET is_sent = 1, sent_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `;
    
    await new Promise((resolve, reject) => {
      const db = require('../database/db');
      db.db.run(query, [id, req.user.id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get wallet monitoring status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT * FROM wallet_monitoring 
      WHERE user_id = ?
      ORDER BY chain_id
    `;
    
    const walletStatus = await new Promise((resolve, reject) => {
      const db = require('../database/db');
      db.db.all(query, [req.user.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      data: walletStatus
    });
  } catch (error) {
    console.error('Get wallet status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Manual trigger wallet monitoring (admin only or for testing)
router.post('/trigger', authenticateToken, async (req, res) => {
  try {
    // In production, you might want to restrict this to admin users
    if (process.env.NODE_ENV === 'production' && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    const result = await scheduler.triggerWalletMonitoring();
    
    res.json({
      success: true,
      message: 'Wallet monitoring triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('Trigger monitoring error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get scheduler status
router.get('/scheduler/status', authenticateToken, async (req, res) => {
  try {
    const status = scheduler.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get scheduler status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Initialize wallet monitoring for existing user
router.post('/initialize', authenticateToken, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address is required'
      });
    }
    
    await walletMonitor.initializeWalletMonitoring(req.user.id, walletAddress);
    
    res.json({
      success: true,
      message: 'Wallet monitoring initialized successfully'
    });
  } catch (error) {
    console.error('Initialize monitoring error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;