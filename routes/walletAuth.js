const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');

const router = express.Router();

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Get nonce for wallet signature
router.post('/nonce', [
  body('walletAddress').isLength({ min: 42, max: 42 }).matches(/^0x[a-fA-F0-9]{40}$/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address',
        errors: errors.array()
      });
    }

    const { walletAddress } = req.body;

    // Check if user exists
    let user = await db.getUserByWalletAddress(walletAddress);
    
    if (user) {
      // Update nonce for existing user
      const { nonce } = await db.updateUserNonce(walletAddress);
      return res.json({
        success: true,
        data: { nonce, isNewUser: false }
      });
    } else {
      // Return nonce for new user (will be created on verification)
      const nonce = db.generateNonce();
      return res.json({
        success: true,
        data: { nonce, isNewUser: true }
      });
    }

  } catch (error) {
    console.error('Nonce generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify wallet signature and login/register
router.post('/verify', [
  body('walletAddress').isLength({ min: 42, max: 42 }).matches(/^0x[a-fA-F0-9]{40}$/),
  body('signature').notEmpty(),
  body('nonce').notEmpty(),
  body('firstName').optional().trim(),
  body('lastName').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { walletAddress, signature, nonce, firstName = '', lastName = '' } = req.body;

    // In a real implementation, you would verify the signature here
    // For now, we'll simulate signature verification
    // const isValidSignature = verifySignature(walletAddress, nonce, signature);
    const isValidSignature = true; // Simplified for demo

    if (!isValidSignature) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Check if user exists
    let user = await db.getUserByWalletAddress(walletAddress);
    
    if (!user) {
      // Create new user
      user = await db.createWalletUser(walletAddress, firstName, lastName);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress || walletAddress },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Save session
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.createSession(user.id, token, expiresAt.toISOString());

    res.json({
      success: true,
      message: user.id ? 'Login successful' : 'Registration and login successful',
      data: {
        user: {
          id: user.id,
          walletAddress: user.walletAddress || walletAddress,
          firstName: user.firstName || firstName,
          lastName: user.lastName || lastName,
          email: user.email || null
        },
        token,
        isNewUser: !user.id
      }
    });

  } catch (error) {
    console.error('Wallet verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user profile (optional names)
router.put('/profile', [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty()
], async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const session = await db.getSessionByToken(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { firstName, lastName } = req.body;
    
    // Update user profile
    const query = 'UPDATE users SET first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await new Promise((resolve, reject) => {
      db.db.run(query, [firstName, lastName, session.user_id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;