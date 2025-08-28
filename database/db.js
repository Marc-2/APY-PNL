const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    // Create database directory if it doesn't exist
    const dbDir = path.join(__dirname);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Connect to SQLite database
    const dbPath = path.join(__dirname, 'debank_platform.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.createTables();
      }
    });
  }

  createTables() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split schema by semicolons and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    // Execute statements sequentially to avoid dependency issues
    const executeStatement = (index) => {
      if (index >= statements.length) {
        console.log('Database tables created successfully');
        return;
      }
      
      const statement = statements[index].trim();
      if (!statement) {
        executeStatement(index + 1);
        return;
      }
      
      this.db.run(statement, (err) => {
        if (err) {
          console.error(`Error executing statement ${index + 1}:`, err.message);
          console.error('Statement:', statement);
        }
        executeStatement(index + 1);
      });
    };
    
    executeStatement(0);
  }

  // Generate random nonce for wallet signature
  generateNonce() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // User management methods
  async createUser(userData) {
    return new Promise((resolve, reject) => {
      const { email, passwordHash, firstName, lastName, walletAddress, authMethod = 'wallet' } = userData;
      const nonce = this.generateNonce();
      
      const query = `
        INSERT INTO users (wallet_address, email, password_hash, first_name, last_name, nonce, auth_method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(query, [walletAddress, email, passwordHash, firstName, lastName, nonce, authMethod], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, walletAddress, email, firstName, lastName, authMethod });
        }
      });
    });
  }

  async createWalletUser(walletAddress, firstName = '', lastName = '') {
    return new Promise((resolve, reject) => {
      const nonce = this.generateNonce();
      const query = `
        INSERT INTO users (wallet_address, first_name, last_name, nonce, auth_method)
        VALUES (?, ?, ?, ?, 'wallet')
      `;
      
      this.db.run(query, [walletAddress, firstName, lastName, nonce], async (err) => {
        if (err) {
          reject(err);
        } else {
          const userId = this.lastID;
          
          // Initialize wallet monitoring for new user
          try {
            const walletMonitor = require('../services/walletMonitor');
            await walletMonitor.initializeWalletMonitoring(userId, walletAddress);
          } catch (monitorError) {
            console.error('Error initializing wallet monitoring:', monitorError);
            // Don't fail user creation if monitoring setup fails
          }
          
          resolve({ id: userId, walletAddress, firstName, lastName, nonce });
        }
      });
    });
  }

  async getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE email = ?';
      this.db.get(query, [email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getUserByWalletAddress(walletAddress) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE wallet_address = ?';
      this.db.get(query, [walletAddress], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateUserNonce(walletAddress) {
    return new Promise((resolve, reject) => {
      const nonce = this.generateNonce();
      const query = 'UPDATE users SET nonce = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?';
      this.db.run(query, [nonce, walletAddress], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ nonce, changes: this.changes });
        }
      });
    });
  }

  async getUserById(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE id = ?';
      this.db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateUserWallet(userId, walletAddress) {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE users SET wallet_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      this.db.run(query, [walletAddress, userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Session management methods
  async createSession(userId, token, expiresAt) {
    return new Promise((resolve, reject) => {
      const query = 'INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)';
      this.db.run(query, [userId, token, expiresAt], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  async getSessionByToken(token) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT s.*, u.email, u.first_name, u.last_name, u.wallet_address 
        FROM user_sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `;
      this.db.get(query, [token], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async deleteSession(token) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM user_sessions WHERE token = ?';
      this.db.run(query, [token], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Portfolio management methods
  async savePortfolioSnapshot(userId, walletAddress, portfolioData) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO portfolio_snapshots 
        (user_id, wallet_address, total_value, total_pnl, total_pnl_percentage, avg_apy, positions_count, snapshot_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const { overview } = portfolioData;
      const snapshotData = JSON.stringify(portfolioData);
      
      this.db.run(query, [
        userId,
        walletAddress,
        overview?.totalValue || 0,
        overview?.totalPnL || 0,
        overview?.totalPnLPercentage || 0,
        overview?.avgAPY || 0,
        overview?.positionsCount || 0,
        snapshotData
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  async getUserPortfolioHistory(userId, limit = 30) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM portfolio_snapshots 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      this.db.all(query, [userId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

module.exports = new Database();