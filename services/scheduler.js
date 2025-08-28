const cron = require('node-cron');
const walletMonitor = require('./walletMonitor');

class Scheduler {
  constructor() {
    this.jobs = [];
  }

  // Start all scheduled jobs
  start() {
    console.log('🚀 Starting scheduler...');

    // Daily wallet monitoring at 2:00 AM
    const dailyMonitoringJob = cron.schedule('0 2 * * *', async () => {
      console.log('⏰ Running daily wallet monitoring...');
      try {
        const result = await walletMonitor.monitorAllWallets();
        console.log(`Daily monitoring completed:`, result);
      } catch (error) {
        console.error('Daily monitoring failed:', error);
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    // Every 4 hours monitoring (for more frequent checks)
    const frequentMonitoringJob = cron.schedule('0 */4 * * *', async () => {
      console.log('⏰ Running frequent wallet monitoring...');
      try {
        const result = await walletMonitor.monitorAllWallets();
        console.log(`Frequent monitoring completed:`, result);
      } catch (error) {
        console.error('Frequent monitoring failed:', error);
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    // Manual trigger for testing (every minute - disable in production)
    const testJob = cron.schedule('*/5 * * * *', async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Running test wallet monitoring...');
        try {
          const result = await walletMonitor.monitorAllWallets();
          console.log(`Test monitoring completed:`, result);
        } catch (error) {
          console.error('Test monitoring failed:', error);
        }
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    this.jobs = [
      { name: 'dailyMonitoring', job: dailyMonitoringJob, description: 'Daily wallet monitoring at 2:00 AM' },
      { name: 'frequentMonitoring', job: frequentMonitoringJob, description: 'Every 4 hours wallet monitoring' },
      { name: 'testMonitoring', job: testJob, description: 'Test monitoring every 5 minutes (dev only)' }
    ];

    // Start jobs based on environment
    if (process.env.NODE_ENV === 'production') {
      // In production, run daily and frequent monitoring
      dailyMonitoringJob.start();
      frequentMonitoringJob.start();
      console.log('✅ Production monitoring jobs started');
    } else {
      // In development, run test monitoring for immediate feedback
      testJob.start();
      console.log('✅ Development test monitoring started (every 5 minutes)');
      console.log('💡 Tip: Set NODE_ENV=production to enable production schedules');
    }

    console.log('📅 Active scheduled jobs:');
    this.jobs.forEach(job => {
      if (job.job.running) {
        console.log(`  ✅ ${job.name}: ${job.description}`);
      } else {
        console.log(`  ⏸️  ${job.name}: ${job.description} (stopped)`);
      }
    });
  }

  // Stop all jobs
  stop() {
    console.log('🛑 Stopping all scheduled jobs...');
    this.jobs.forEach(job => {
      job.job.stop();
      console.log(`  Stopped: ${job.name}`);
    });
  }

  // Get job status
  getStatus() {
    return this.jobs.map(job => ({
      name: job.name,
      description: job.description,
      running: job.job.running,
      scheduled: job.job.scheduled
    }));
  }

  // Manual trigger for immediate execution
  async triggerWalletMonitoring() {
    console.log('🔄 Manually triggering wallet monitoring...');
    try {
      const result = await walletMonitor.monitorAllWallets();
      console.log('Manual wallet monitoring completed:', result);
      return result;
    } catch (error) {
      console.error('Manual wallet monitoring failed:', error);
      throw error;
    }
  }
}

module.exports = new Scheduler();