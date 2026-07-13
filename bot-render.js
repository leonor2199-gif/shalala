const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { processExcelFile } = require('./controllers/uploadController');
const express = require('express');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is required');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ MongoDB connected for bot'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

const bot = new Telegraf(BOT_TOKEN);

// ========================================
// BOT COMMANDS
// ========================================

bot.start((ctx) => {
  ctx.reply(
    `🤖 *Welcome to Recharge Records Bot!*\n\n` +
    `Send me Excel files (.xlsx, .xls) or ZIP files.\n` +
    `I'll save all recharge records to the database.\n\n` +
    `📊 *Commands:*\n` +
    `/start - Show this message\n` +
    `/stats - Show total records\n` +
    `/help - Get help\n` +
    `/clear - Delete ALL records`,
    { parse_mode: 'Markdown' }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `📖 *Help Guide*\n\n` +
    `Send Excel files with columns:\n` +
    `• Column C: Username & User ID\n` +
    `• Column D: Amount & Fee\n` +
    `• Column E: Request & Process Time\n\n` +
    `Supported formats: .xlsx, .xls, .zip`,
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

bot.command('clear', async (ctx) => {
  try {
    const Recharge = mongoose.model('Recharge');
    const count = await Recharge.countDocuments();
    
    if (count === 0) {
      return ctx.reply('📭 No records to delete.');
    }
    
    await ctx.reply(
      `⚠️ Delete all *${count}* records?\n` +
      `Type: *YES DELETE ALL* to confirm.`,
      { parse_mode: 'Markdown' }
    );
    
    // Simple confirmation
    const response = await new Promise((resolve) => {
      const listener = (ctx) => {
        if (ctx.message.text === 'YES DELETE ALL') {
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
      ctx.reply(`✅ All ${count} records deleted!`);
    } else {
      ctx.reply('❌ Deletion cancelled');
    }
    
  } catch (error) {
    console.error('Clear error:', error);
    ctx.reply('❌ Error: ' + error.message);
  }
});

// Handle documents
bot.on('document', async (ctx) => {
  try {
    const file = ctx.message.document;
    const fileName = file.file_name;
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (!['xlsx', 'xls', 'zip'].includes(ext)) {
      return ctx.reply(`❌ Unsupported: ${fileName}\nSend .xlsx, .xls, or .zip`);
    }
    
    await ctx.reply(`⏳ Processing ${fileName}...`);
    
    // Download file
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Process
    const result = await processExcelFile(buffer, fileName);
    
    let message = `✅ *${fileName}*\n`;
    message += `📊 Records Saved: *${result.totalSaved || 0}*\n`;
    message += `❌ Errors: *${result.totalErrors || 0}*`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('File error:', error);
    ctx.reply('❌ Error: ' + error.message);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Error occurred');
});

// ========================================
// START BOT
// ========================================

// Try webhook mode first
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.onrender.com';

async function startBot() {
  try {
    // Try webhook
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    console.log(`✅ Webhook set to: ${WEBHOOK_URL}/webhook`);
    
    // Create express app for webhook
    const app = express();
    app.use(express.json());
    app.post('/webhook', (req, res) => {
      bot.handleUpdate(req.body, res);
    });
    
    app.listen(PORT, () => {
      console.log(`🤖 Bot webhook listening on port ${PORT}`);
    });
    
  } catch (error) {
    console.log('⚠️ Webhook failed, using polling mode...');
    // Fallback to polling
    await bot.launch();
    console.log('🤖 Bot started in polling mode');
  }
}

startBot().catch(console.error);

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('🤖 Bot starting...');
