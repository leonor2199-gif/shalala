const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { processExcelFile } = require('./controllers/uploadController');
const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required in environment variables');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ MongoDB connected for bot'))
.catch(err => console.error('❌ MongoDB connection error:', err));

const bot = new Telegraf(BOT_TOKEN);

// Helper function to download file using https
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ========================================
// BOT COMMANDS
// ========================================

bot.start((ctx) => {
  ctx.reply(
    `🤖 *Welcome to Recharge Records Bot!*\n\n` +
    `Send me Excel files (.xlsx, .xls) and I'll save all records.\n\n` +
    `📊 *Commands:*\n` +
    `/start - Show this message\n` +
    `/stats - Show total records\n` +
    `/help - Get help`,
    { parse_mode: 'Markdown' }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `📖 *Help Guide*\n\n` +
    `Send Excel files with columns:\n` +
    `• Column C: Username & User ID (e.g., "Name\\nID")\n` +
    `• Column D: Amount & Fee (e.g., "100\\n0.00(0%)")\n` +
    `• Column E: Request & Process Time\n\n` +
    `Supported: .xlsx, .xls`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('stats', async (ctx) => {
  try {
    const Recharge = mongoose.model('Recharge');
    const total = await Recharge.countDocuments();
    const totalAmount = await Recharge.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const amount = totalAmount.length > 0 ? totalAmount[0].total : 0;
    
    ctx.reply(
      `📊 *Statistics*\n\n` +
      `📝 Total Records: *${total}*\n` +
      `💰 Total Amount: *$${amount.toFixed(2)}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Stats error:', error);
    ctx.reply('❌ Error fetching statistics');
  }
});

// ========================================
// HANDLE DOCUMENTS (FILES)
// ========================================

bot.on('document', async (ctx) => {
  try {
    const file = ctx.message.document;
    const fileName = file.file_name;
    const ext = fileName.split('.').pop().toLowerCase();
    
    console.log(`📄 Received file: ${fileName}, size: ${file.file_size} bytes`);
    
    // Check if supported format
    if (!['xlsx', 'xls'].includes(ext)) {
      return ctx.reply(
        `❌ *Unsupported file format*\n\n` +
        `Please send Excel files (.xlsx, .xls)\n\n` +
        `You sent: ${fileName}`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Check file size (10MB max)
    if (file.file_size > 10 * 1024 * 1024) {
      return ctx.reply(
        `❌ *File too large*\n\n` +
        `Maximum size: 10MB\n` +
        `Your file: ${(file.file_size / (1024 * 1024)).toFixed(2)}MB`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Send processing message
    await ctx.reply(
      `⏳ *Processing ${fileName}...*\n\n` +
      `Please wait while I analyze the data.`,
      { parse_mode: 'Markdown' }
    );
    
    // Get file link
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    console.log(`📥 Downloading from: ${fileLink.href}`);
    
    // Download the file using our custom function
    const buffer = await downloadFile(fileLink.href);
    console.log(`✅ Downloaded ${buffer.length} bytes`);
    
    // Process the file
    const result = await processExcelFile(buffer, fileName);
    console.log(`📊 Result:`, result);
    
    // Build response
    let message = `✅ *File Processed Successfully!*\n\n`;
    message += `📄 *File:* ${fileName}\n`;
    message += `📊 *Summary:*\n`;
    message += `• Records Saved: *${result.totalSaved || 0}*\n`;
    message += `• Errors: *${result.totalErrors || 0}*\n`;
    
    if (result.files && result.files.length > 1) {
      message += `• Files in archive: *${result.totalFiles}*\n`;
    }
    
    if (result.totalSaved > 0) {
      message += `\n💾 *Records saved to database*\n`;
      message += `📱 *View Dashboard:*\n`;
      message += `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/dashboard`;
    } else {
      message += `\n⚠️ No records were saved. Please check the file format.\n`;
      if (result.errorDetails && result.errorDetails.length > 0) {
        message += `\n📋 *First error:* ${result.errorDetails[0]}`;
      }
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    console.log(`✅ Processed: ${fileName} - ${result.totalSaved || 0} records saved`);
    
  } catch (error) {
    console.error('❌ Error processing file:', error);
    ctx.reply(
      `❌ *Error Processing File*\n\n` +
      `Something went wrong while processing your file.\n\n` +
      `Error: ${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ========================================
// ERROR HANDLING
// ========================================

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An unexpected error occurred. Please try again.');
});

// ========================================
// START BOT IN POLLING MODE
// ========================================

console.log('🤖 Starting bot in polling mode...');

bot.launch()
  .then(() => {
    console.log('✅ Bot started successfully!');
    console.log('🤖 Bot is ready to receive messages.');
  })
  .catch(err => {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('🛑 Stopping bot...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Stopping bot...');
  bot.stop('SIGTERM');
  process.exit(0);
});
