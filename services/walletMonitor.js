const axios = require('axios');
const db = require('../database/db');

class WalletMonitor {
  constructor() {
    this.etherscanApiKey = process.env.ETHERSCAN_API_KEY || 'YourEtherscanApiKey'; // Add your API key
    this.bscscanApiKey = process.env.BSCSCAN_API_KEY || 'YourBscscanApiKey'; // Add your API key
    
    // Chain configurations
    this.chains = {
      1: { // Ethereum
        name: 'Ethereum',
        apiUrl: 'https://api.etherscan.io/api',
        apiKey: this.etherscanApiKey,
        nativeSymbol: 'ETH'
      },
      56: { // BSC
        name: 'BSC',
        apiUrl: 'https://api.bscscan.com/api',
        apiKey: this.bscscanApiKey,
        nativeSymbol: 'BNB'
      }
    };
  }

  // Initialize wallet monitoring for a new user
  async initializeWalletMonitoring(userId, walletAddress) {
    try {
      console.log(`Initializing wallet monitoring for user ${userId}, wallet ${walletAddress}`);
      
      // Get current block numbers for each chain
      for (const [chainId, config] of Object.entries(this.chains)) {
        const currentBlock = await this.getCurrentBlockNumber(parseInt(chainId));
        
        // Insert or update wallet monitoring record
        await this.upsertWalletMonitoring(userId, walletAddress, parseInt(chainId), currentBlock);
      }
      
      console.log(`Wallet monitoring initialized for ${walletAddress}`);
    } catch (error) {
      console.error('Error initializing wallet monitoring:', error);
    }
  }

  // Get current block number from blockchain
  async getCurrentBlockNumber(chainId) {
    try {
      const config = this.chains[chainId];
      if (!config) throw new Error(`Unsupported chain ID: ${chainId}`);

      const response = await axios.get(config.apiUrl, {
        params: {
          module: 'proxy',
          action: 'eth_blockNumber',
          apikey: config.apiKey
        }
      });

      if (response.data.status === '1' || response.data.result) {
        return parseInt(response.data.result, 16);
      } else {
        throw new Error(`Failed to get block number: ${response.data.message}`);
      }
    } catch (error) {
      console.error(`Error getting current block number for chain ${chainId}:`, error);
      return 0; // Fallback to 0 if API fails
    }
  }

  // Upsert wallet monitoring record
  async upsertWalletMonitoring(userId, walletAddress, chainId, lastCheckedBlock) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO wallet_monitoring 
        (user_id, wallet_address, chain_id, last_checked_block, last_checked_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      db.db.run(query, [userId, walletAddress, chainId, lastCheckedBlock], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  // Get all active wallets for monitoring
  async getActiveWallets() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT wm.*, u.first_name, u.last_name, u.email 
        FROM wallet_monitoring wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.is_active = 1
        ORDER BY wm.last_checked_at ASC
      `;
      
      db.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get new transactions for a wallet since last check
  async getNewTransactions(walletAddress, chainId, fromBlock) {
    try {
      const config = this.chains[chainId];
      if (!config) throw new Error(`Unsupported chain ID: ${chainId}`);

      console.log(`Checking transactions for ${walletAddress} on ${config.name} from block ${fromBlock}`);

      // Get normal transactions
      const normalTxResponse = await axios.get(config.apiUrl, {
        params: {
          module: 'account',
          action: 'txlist',
          address: walletAddress,
          startblock: fromBlock + 1,
          endblock: 'latest',
          page: 1,
          offset: 100,
          sort: 'asc',
          apikey: config.apiKey
        }
      });

      // Get internal transactions
      const internalTxResponse = await axios.get(config.apiUrl, {
        params: {
          module: 'account',
          action: 'txlistinternal',
          address: walletAddress,
          startblock: fromBlock + 1,
          endblock: 'latest',
          page: 1,
          offset: 100,
          sort: 'asc',
          apikey: config.apiKey
        }
      });

      // Get ERC-20 token transfers
      const tokenTxResponse = await axios.get(config.apiUrl, {
        params: {
          module: 'account',
          action: 'tokentx',
          address: walletAddress,
          startblock: fromBlock + 1,
          endblock: 'latest',
          page: 1,
          offset: 100,
          sort: 'asc',
          apikey: config.apiKey
        }
      });

      const normalTxs = normalTxResponse.data.status === '1' ? normalTxResponse.data.result : [];
      const internalTxs = internalTxResponse.data.status === '1' ? internalTxResponse.data.result : [];
      const tokenTxs = tokenTxResponse.data.status === '1' ? tokenTxResponse.data.result : [];

      return {
        normal: normalTxs,
        internal: internalTxs,
        token: tokenTxs
      };
    } catch (error) {
      console.error(`Error getting transactions for ${walletAddress}:`, error);
      return { normal: [], internal: [], token: [] };
    }
  }

  // Process and store new transactions
  async processTransactions(userId, walletAddress, chainId, transactions) {
    const allTransactions = [];
    const config = this.chains[chainId];

    // Process normal transactions
    for (const tx of transactions.normal) {
      if (tx.to.toLowerCase() === walletAddress.toLowerCase() && tx.value !== '0') {
        allTransactions.push({
          userId,
          walletAddress,
          chainId,
          txHash: tx.hash,
          blockNumber: parseInt(tx.blockNumber),
          blockTimestamp: parseInt(tx.timeStamp),
          fromAddress: tx.from,
          toAddress: tx.to,
          value: tx.value,
          tokenAddress: null,
          tokenSymbol: config.nativeSymbol,
          tokenDecimals: 18,
          transactionType: 'deposit',
          gasUsed: parseInt(tx.gasUsed),
          gasPrice: tx.gasPrice,
          transactionFee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice)).toString()
        });
      }
    }

    // Process internal transactions
    for (const tx of transactions.internal) {
      if (tx.to.toLowerCase() === walletAddress.toLowerCase() && tx.value !== '0') {
        allTransactions.push({
          userId,
          walletAddress,
          chainId,
          txHash: tx.hash,
          blockNumber: parseInt(tx.blockNumber),
          blockTimestamp: parseInt(tx.timeStamp),
          fromAddress: tx.from,
          toAddress: tx.to,
          value: tx.value,
          tokenAddress: null,
          tokenSymbol: config.nativeSymbol,
          tokenDecimals: 18,
          transactionType: 'deposit',
          gasUsed: parseInt(tx.gasUsed || 0),
          gasPrice: tx.gasPrice || '0',
          transactionFee: '0'
        });
      }
    }

    // Process token transactions
    for (const tx of transactions.token) {
      if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
        allTransactions.push({
          userId,
          walletAddress,
          chainId,
          txHash: tx.hash,
          blockNumber: parseInt(tx.blockNumber),
          blockTimestamp: parseInt(tx.timeStamp),
          fromAddress: tx.from,
          toAddress: tx.to,
          value: tx.value,
          tokenAddress: tx.contractAddress,
          tokenSymbol: tx.tokenSymbol,
          tokenDecimals: parseInt(tx.tokenDecimal),
          transactionType: 'deposit',
          gasUsed: parseInt(tx.gasUsed),
          gasPrice: tx.gasPrice,
          transactionFee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice)).toString()
        });
      }
    }

    // Store transactions in database
    for (const tx of allTransactions) {
      await this.storeTransaction(tx);
    }

    return allTransactions;
  }

  // Store transaction in database
  async storeTransaction(tx) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR IGNORE INTO wallet_transactions 
        (user_id, wallet_address, chain_id, tx_hash, block_number, block_timestamp, 
         from_address, to_address, value, token_address, token_symbol, token_decimals, 
         transaction_type, gas_used, gas_price, transaction_fee)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.db.run(query, [
        tx.userId, tx.walletAddress, tx.chainId, tx.txHash, tx.blockNumber, tx.blockTimestamp,
        tx.fromAddress, tx.toAddress, tx.value, tx.tokenAddress, tx.tokenSymbol, tx.tokenDecimals,
        tx.transactionType, tx.gasUsed, tx.gasPrice, tx.transactionFee
      ], function(err) {
        if (err) {
          console.error('Error storing transaction:', err);
          reject(err);
        } else {
          if (this.changes > 0) {
            console.log(`Stored new transaction: ${tx.txHash}`);
          }
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Update last checked block for wallet
  async updateLastCheckedBlock(walletAddress, chainId, blockNumber) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE wallet_monitoring 
        SET last_checked_block = ?, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ? AND chain_id = ?
      `;
      
      db.db.run(query, [blockNumber, walletAddress, chainId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Main monitoring function - run daily
  async monitorAllWallets() {
    try {
      console.log('🔍 Starting daily wallet monitoring...');
      
      const wallets = await this.getActiveWallets();
      console.log(`Found ${wallets.length} wallets to monitor`);

      let totalNewTransactions = 0;

      for (const wallet of wallets) {
        try {
          console.log(`Checking wallet: ${wallet.wallet_address} on chain ${wallet.chain_id}`);
          
          // Get new transactions since last check
          const transactions = await this.getNewTransactions(
            wallet.wallet_address,
            wallet.chain_id,
            wallet.last_checked_block
          );

          // Process and store transactions
          const newTxs = await this.processTransactions(
            wallet.user_id,
            wallet.wallet_address,
            wallet.chain_id,
            transactions
          );

          totalNewTransactions += newTxs.length;

          if (newTxs.length > 0) {
            console.log(`✅ Found ${newTxs.length} new transactions for ${wallet.wallet_address}`);
            
            // Create notifications for new deposits
            for (const tx of newTxs) {
              await this.createNotification(wallet.user_id, tx);
            }
          }

          // Update last checked block
          const currentBlock = await this.getCurrentBlockNumber(wallet.chain_id);
          await this.updateLastCheckedBlock(wallet.wallet_address, wallet.chain_id, currentBlock);

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
          console.error(`Error monitoring wallet ${wallet.wallet_address}:`, error);
        }
      }

      console.log(`🎉 Wallet monitoring completed. Found ${totalNewTransactions} new transactions.`);
      return { walletsChecked: wallets.length, newTransactions: totalNewTransactions };

    } catch (error) {
      console.error('Error in wallet monitoring:', error);
      throw error;
    }
  }

  // Create notification for new transaction
  async createNotification(userId, transaction) {
    return new Promise((resolve, reject) => {
      const value = parseFloat(transaction.value) / Math.pow(10, transaction.tokenDecimals);
      const title = `New ${transaction.tokenSymbol} Deposit`;
      const message = `Received ${value.toFixed(6)} ${transaction.tokenSymbol} in your wallet`;

      const query = `
        INSERT INTO notifications 
        (user_id, wallet_address, notification_type, title, message, tx_hash)
        VALUES (?, ?, 'new_deposit', ?, ?, ?)
      `;
      
      db.db.run(query, [userId, transaction.walletAddress, title, message, transaction.txHash], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  // Get recent transactions for a user
  async getUserTransactions(userId, limit = 50) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM wallet_transactions 
        WHERE user_id = ? 
        ORDER BY block_timestamp DESC 
        LIMIT ?
      `;
      
      db.db.all(query, [userId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

module.exports = new WalletMonitor();