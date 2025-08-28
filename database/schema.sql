-- Users table for storing user registration data
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    nonce VARCHAR(255) NOT NULL, -- For wallet signature verification
    auth_method VARCHAR(20) DEFAULT 'wallet', -- 'wallet' or 'email'
    is_verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User sessions table for managing login sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User portfolio tracking table
CREATE TABLE IF NOT EXISTS user_portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    portfolio_name VARCHAR(100),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Portfolio snapshots for historical tracking
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    total_value DECIMAL(20, 8),
    total_pnl DECIMAL(20, 8),
    total_pnl_percentage DECIMAL(10, 4),
    avg_apy DECIMAL(10, 4),
    positions_count INTEGER,
    snapshot_data TEXT, -- JSON data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Wallet monitoring for tracking new transactions
CREATE TABLE IF NOT EXISTS wallet_monitoring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    chain_id INTEGER DEFAULT 1, -- 1 for Ethereum, 56 for BSC, etc.
    last_checked_block INTEGER DEFAULT 0,
    last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(wallet_address, chain_id)
);

-- Transaction history for detected transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    chain_id INTEGER NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number INTEGER NOT NULL,
    block_timestamp INTEGER NOT NULL,
    from_address VARCHAR(42),
    to_address VARCHAR(42),
    value VARCHAR(50), -- Store as string to avoid precision issues
    token_address VARCHAR(42), -- NULL for ETH/native token
    token_symbol VARCHAR(20),
    token_decimals INTEGER,
    transaction_type VARCHAR(20), -- 'deposit', 'withdrawal', 'swap', etc.
    gas_used INTEGER,
    gas_price VARCHAR(50),
    transaction_fee VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tx_hash, wallet_address)
);

-- Notification log for sent notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    notification_type VARCHAR(50), -- 'new_deposit', 'large_transaction', etc.
    title VARCHAR(255),
    message TEXT,
    tx_hash VARCHAR(66),
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes after tables are created
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_portfolios_user_id ON user_portfolios(user_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_id ON portfolio_snapshots(user_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_wallet ON portfolio_snapshots(wallet_address);

CREATE INDEX IF NOT EXISTS idx_wallet_monitoring_user_id ON wallet_monitoring(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_monitoring_wallet ON wallet_monitoring(wallet_address);

CREATE INDEX IF NOT EXISTS idx_wallet_monitoring_active ON wallet_monitoring(is_active);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_block ON wallet_transactions(block_number);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_hash ON wallet_transactions(tx_hash);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(is_sent);