const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { processExcelFile } = require('./controllers/uploadController');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ MongoDB connected for bot'))
.catch(err => console.error('❌ MongoDB connection error:', err));

const bot = new Telegraf(BOT_TOKEN);

// Commands
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Recharge Records Bot*\n\n` +
    `Send me Excel files (.xlsx, .xls) or ZIP files.\n` +
    `I'll save all records to the database.\n\n` +
    `Commands:\n` +
    `/stats - Show statistics\n` +
    `/help - Get help`,
    { parse_mode: 'Markdown' }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `📖 *Help*\n\n` +
    `Send Excel files with columns:\n` +
    `• Column C: Username & User ID (e.g., "Name\\nID")\n` +
    `• Column D: Amount & Fee (e.g., "100\\n0.00(0%)")\n` +
    `• Column E: Request & Process Time\n\n` +
    `Supported: .xlsx, .xls, .zip`,
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
    
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
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

// Use polling mode for Render (simpler)
bot.launch()
  .then(() => console.log('🤖 Bot started in polling mode'))
  .catch(err => console.error('❌ Bot launch error:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('🤖 Bot starting...');
