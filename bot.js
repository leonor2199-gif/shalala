const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { processExcelFile } = require('./controllers/uploadController');
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

// ========================================
// BOT COMMANDS
// ========================================

// Start command
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Welcome to Recharge Records Bot!*\n\n` +
    `I can help you upload recharge records from Excel files.\n\n` +
    `📤 *How to use:*\n` +
    `• Send me Excel files (.xlsx, .xls)\n` +
    `• Send me ZIP files containing Excel files\n` +
    `• Send multiple files at once\n\n` +
    `📊 *Commands:*\n` +
    `/start - Show this message\n` +
    `/stats - Show total records count\n` +
    `/help - Get help\n` +
    `/clear - Delete ALL records (admin only)`,
    { parse_mode: 'Markdown' }
  );
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    `📖 *Help Guide*\n\n` +
    `1. Prepare your Excel files with the correct format\n` +
    `2. Send one or multiple files to this bot\n` +
    `3. The bot will process all files\n` +
    `4. You'll receive a summary for each file\n\n` +
    `⚠️ *Important:*\n` +
    `• Only .xlsx, .xls, and .zip files are supported\n` +
    `• Maximum file size: 10MB each (20MB for ZIP)\n` +
    `• Duplicate records are saved (no deduplication)\n\n` +
    `🔄 *Commands:*\n` +
    `/start - Start the bot\n` +
    `/stats - Show statistics\n` +
    `/help - Show this help message\n` +
    `/clear - Delete ALL records`,
    { parse_mode: 'Markdown' }
  );
});

// Stats command
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
      `💰 Total Amount: *$${amount.toFixed(2)}*\n` +
      `📆 Last Updated: ${new Date().toLocaleString()}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Stats error:', error);
    ctx.reply('❌ Error fetching statistics');
  }
});

// Clear all records command
bot.command('clear', async (ctx) => {
  try {
    const Recharge = mongoose.model('Recharge');
    const count = await Recharge.countDocuments();
    
    if (count === 0) {
      return ctx.reply('📭 No records to delete.');
    }
    
    await ctx.reply(
      `⚠️ *Confirm Deletion*\n\n` +
      `Are you sure you want to delete all *${count}* records?\n\n` +
      `Type: *YES DELETE ALL* to confirm.\n` +
      `(This action cannot be undone!)`,
      { parse_mode: 'Markdown' }
    );
    
    // Wait for confirmation
    const response = await new Promise((resolve) => {
      const listener = (ctx) => {
        if (ctx.message && ctx.message.text === 'YES DELETE ALL') {
          bot.off('text', listener);
          resolve(true);
        }
      };
      bot.on('text', listener);
      setTimeout(() => {
        bot.off('text', listener);
        resolve(false);
      }, 30000);
    });
    
    if (response) {
      await Recharge.deleteMany({});
      ctx.reply(`✅ All *${count}* records have been deleted successfully!`, { parse_mode: 'Markdown' });
    } else {
      ctx.reply('❌ Deletion cancelled (timeout or invalid confirmation)');
    }
    
  } catch (error) {
    console.error('Clear error:', error);
    ctx.reply('❌ Error clearing records: ' + error.message);
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
    
    // Check if supported format
    if (!['xlsx', 'xls', 'zip'].includes(ext)) {
      return ctx.reply(
        `❌ *Unsupported file format*\n\n` +
        `Please send:\n` +
        `• Excel files (.xlsx, .xls)\n` +
        `• ZIP archives (.zip)\n\n` +
        `You sent: ${fileName}`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Check file size
    const maxSize = ext === 'zip' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.file_size > maxSize) {
      return ctx.reply(
        `❌ *File too large*\n\n` +
        `Maximum size:\n` +
        `• Excel files: 10MB\n` +
        `• ZIP archives: 20MB\n\n` +
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
    
    // Download the file
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    console.log(`📥 Downloading: ${fileName}`);
    
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Process the file
    const result = await processExcelFile(buffer, fileName);
    
    // Build response
    let message = `✅ *File Processed Successfully!*\n\n`;
    message += `📄 *File:* ${fileName}\n`;
    message += `📊 *Summary:*\n`;
    
    if (result.files && result.files.length > 1) {
      message += `• Total Files: *${result.totalFiles}*\n`;
      message += `• Records Saved: *${result.totalSaved}*\n`;
      message += `• Errors: *${result.totalErrors}*\n\n`;
      
      message += `📋 *Details:*\n`;
      for (const fileResult of result.files) {
        message += `• ${fileResult.fileName}: ${fileResult.saved} saved\n`;
      }
    } else {
      message += `• Records Saved: *${result.totalSaved || 0}*\n`;
      message += `• Errors: *${result.totalErrors || 0}*\n`;
    }
    
    if (result.totalSaved > 0) {
      message += `\n💾 *All records saved to database*\n`;
      message += `📱 *View Dashboard:*\n`;
      message += `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/dashboard`;
    } else {
      message += `\n⚠️ No records were saved. Please check the file format.`;
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    console.log(`✅ Processed: ${fileName} - ${result.totalSaved || 0} records saved`);
    
  } catch (error) {
    console.error('Error processing file:', error);
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
