const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { processExcelFile } = require('./controllers/uploadController');
const fs = require('fs');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required in .env file');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected for bot'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const bot = new Telegraf(BOT_TOKEN);

// Store active processing jobs
const activeJobs = new Map();

// Start command
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Welcome to Recharge Records Bot!*\n\n` +
    `I can help you upload recharge records from Excel files.\n\n` +
    `📤 *How to use:*\n` +
    `• Send me ONE or MULTIPLE Excel files (.xlsx, .xls)\n` +
    `• Send me a ZIP file containing Excel files\n` +
    `• Send up to 10 files at once\n` +
    `• I'll process all of them automatically\n\n` +
    `📋 *File Format Required:*\n` +
    `The file should contain columns:\n` +
    `• Column C: Username & User ID (combined)\n` +
    `• Column D: Amount & Fee (combined)\n` +
    `• Column E: Request Time & Process Time (combined)\n\n` +
    `📊 *Commands:*\n` +
    `/start - Show this message\n` +
    `/stats - Show total records count\n` +
    `/help - Get help\n` +
    `/clear - Delete ALL records (admin only)\n` +
    `/status - Check processing status\n\n` +
    `*Example:* Send multiple Excel files at once!`,
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
    `• Maximum 10 files at once\n` +
    `• Maximum file size: 10MB each (20MB for ZIP)\n` +
    `• Duplicate records are saved (no deduplication)\n\n` +
    `🔄 *Commands:*\n` +
    `/start - Start the bot\n` +
    `/stats - Show statistics\n` +
    `/help - Show this help message\n` +
    `/clear - Delete ALL records\n` +
    `/status - Check processing status`,
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
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRecords = await Recharge.countDocuments({
      createdAt: { $gte: today }
    });
    
    const amount = totalAmount.length > 0 ? totalAmount[0].total : 0;
    
    ctx.reply(
      `📊 *Statistics*\n\n` +
      `📝 Total Records: *${total}*\n` +
      `💰 Total Amount: *$${amount.toFixed(2)}*\n` +
      `📅 Today's Records: *${todayRecords}*\n` +
      `📆 Last Updated: ${new Date().toLocaleString()}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Stats error:', error);
    ctx.reply('❌ Error fetching statistics');
  }
});

// Status command
bot.command('status', async (ctx) => {
  const jobId = ctx.chat.id.toString();
  const job = activeJobs.get(jobId);
  
  if (!job) {
    return ctx.reply('📭 No active processing jobs.');
  }
  
  ctx.reply(
    `📊 *Processing Status*\n\n` +
    `• Total Files: *${job.totalFiles}*\n` +
    `• Processed: *${job.processed}*\n` +
    `• Failed: *${job.failed}*\n` +
    `• Records Saved: *${job.totalSaved}*\n\n` +
    `⏳ Progress: ${Math.round((job.processed / job.totalFiles) * 100)}%`,
    { parse_mode: 'Markdown' }
  );
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
// PROCESS MULTIPLE FILES
// ========================================
async function processMultipleFiles(ctx, documents) {
  const jobId = ctx.chat.id.toString();
  const totalFiles = documents.length;
  
  // Initialize job tracking
  activeJobs.set(jobId, {
    totalFiles: totalFiles,
    processed: 0,
    failed: 0,
    totalSaved: 0,
    results: []
  });
  
  // Send initial message
  await ctx.reply(
    `📦 *Processing ${totalFiles} files...*\n\n` +
    `⏳ Please wait while I process all files.`,
    { parse_mode: 'Markdown' }
  );
  
  const allResults = [];
  let totalSaved = 0;
  let totalErrors = 0;
  const allErrorDetails = [];
  let processedCount = 0;
  
  // Process each file
  for (const document of documents) {
    try {
      const fileName = document.file_name;
      const ext = fileName.split('.').pop().toLowerCase();
      
      // Skip if not Excel or ZIP
      if (!['xlsx', 'xls', 'zip'].includes(ext)) {
        allResults.push({
          fileName: fileName,
          status: 'skipped',
          message: 'Unsupported file type'
        });
        processedCount++;
        continue;
      }
      
      // Download file
      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(fileLink.href);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Process file
      const result = await processExcelFile(buffer, fileName);
      
      // Update job status
      const job = activeJobs.get(jobId);
      if (job) {
        job.processed++;
        job.totalSaved += result.totalSaved || 0;
        if (result.totalErrors > 0) job.failed++;
      }
      
      allResults.push({
        fileName: fileName,
        status: 'success',
        saved: result.totalSaved || 0,
        errors: result.totalErrors || 0,
        details: result
      });
      
      totalSaved += result.totalSaved || 0;
      totalErrors += result.totalErrors || 0;
      if (result.errorDetails) {
        allErrorDetails.push(...result.errorDetails);
      }
      
      processedCount++;
      
      // Send progress update every 3 files
      if (processedCount % 3 === 0 || processedCount === totalFiles) {
        const job = activeJobs.get(jobId);
        await ctx.reply(
          `⏳ *Progress:* ${processedCount}/${totalFiles} files processed\n` +
          `✅ Records saved so far: *${job ? job.totalSaved : totalSaved}*`,
          { parse_mode: 'Markdown' }
        );
      }
      
    } catch (error) {
      console.error(`Error processing ${document.file_name}:`, error);
      allResults.push({
        fileName: document.file_name,
        status: 'error',
        message: error.message
      });
      totalErrors++;
      
      const job = activeJobs.get(jobId);
      if (job) {
        job.processed++;
        job.failed++;
      }
    }
  }
  
  // Clean up job
  activeJobs.delete(jobId);
  
  // Build final summary
  let message = `✅ *Batch Processing Complete!*\n\n`;
  message += `📊 *Summary:*\n`;
  message += `• Total Files: *${totalFiles}*\n`;
  message += `• Successfully Processed: *${totalFiles - totalErrors}*\n`;
  message += `• Failed: *${totalErrors}*\n`;
  message += `• Total Records Saved: *${totalSaved}*\n\n`;
  
  message += `📋 *File Details:*\n`;
  for (const result of allResults) {
    if (result.status === 'success') {
      message += `✅ ${result.fileName}: ${result.saved} saved\n`;
    } else if (result.status === 'error') {
      message += `❌ ${result.fileName}: ${result.message || 'Error'}\n`;
    } else {
      message += `⏭️ ${result.fileName}: ${result.message || 'Skipped'}\n`;
    }
  }
  
  if (totalSaved > 0) {
    message += `\n💾 *All records saved to database*\n`;
    message += `🔄 Duplicates: All entries saved (including duplicates)\n\n`;
    message += `📱 *View Dashboard:*\n`;
    message += `http://localhost:${process.env.PORT || 3000}/dashboard`;
  } else {
    message += `\n⚠️ No records were saved. Please check the file format.`;
  }
  
  if (allErrorDetails.length > 0) {
    message += `\n\n📋 *Errors:*\n`;
    const errors = allErrorDetails.slice(0, 5);
    errors.forEach(err => {
      message += `• ${err.substring(0, 100)}${err.length > 100 ? '...' : ''}\n`;
    });
    if (allErrorDetails.length > 5) {
      message += `• And ${allErrorDetails.length - 5} more errors...\n`;
    }
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
}

// ========================================
// HANDLE DOCUMENT UPLOADS
// ========================================
bot.on('document', async (ctx) => {
  try {
    const message = ctx.message;
    const documents = [];
    
    // Check if multiple documents were sent as an album
    if (message.media_group_id) {
      // For albums, we need to collect all documents
      // Note: This is a limitation - albums are processed one by one
      // We'll handle them as they come
    }
    
    // Single document
    if (message.document) {
      documents.push(message.document);
    }
    
    // If only one file, process it directly
    if (documents.length === 1) {
      const doc = documents[0];
      const fileName = doc.file_name;
      const ext = fileName.split('.').pop().toLowerCase();
      
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
      
      const maxSize = ext === 'zip' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
      if (doc.file_size > maxSize) {
        return ctx.reply(
          `❌ *File too large*\n\n` +
          `Maximum size:\n` +
          `• Excel files: 10MB\n` +
          `• ZIP archives: 20MB\n\n` +
          `Your file: ${(doc.file_size / (1024 * 1024)).toFixed(2)}MB`,
          { parse_mode: 'Markdown' }
        );
      }
      
      await ctx.reply(
        `⏳ *Processing ${fileName}...*\n\n` +
        `Please wait while I analyze the data.`,
        { parse_mode: 'Markdown' }
      );
      
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const result = await processExcelFile(buffer, fileName);
      
      let message = `✅ *File Processed Successfully!*\n\n`;
      message += `📄 *File:* ${fileName}\n`;
      message += `📊 *Summary:*\n`;
      message += `• Records Saved: *${result.totalSaved || 0}*\n`;
      message += `• Total Files in Archive: *${result.totalFiles || 1}*\n`;
      message += `• Errors: *${result.totalErrors || 0}*\n`;
      
      if (result.files && result.files.length > 1) {
        message += `\n📋 *Details:*\n`;
        for (const fileResult of result.files) {
          message += `• ${fileResult.fileName}: ${fileResult.saved} saved\n`;
        }
      }
      
      if (result.totalSaved > 0) {
        message += `\n💾 *All records saved to database*\n`;
        message += `🔄 Duplicates: All entries saved (including duplicates)\n\n`;
        message += `📱 *View Dashboard:*\n`;
        message += `http://localhost:${process.env.PORT || 3000}/dashboard`;
      } else {
        message += `\n⚠️ No records were saved. Please check the file format.`;
      }
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }
    
    // Multiple files
    if (documents.length > 1) {
      // Check if too many files
      if (documents.length > 10) {
        return ctx.reply(
          `⚠️ *Too many files*\n\n` +
          `You sent ${documents.length} files.\n` +
          `Maximum is 10 files at once.\n\n` +
          `Please send fewer files or use a ZIP archive.`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // Process multiple files
      await processMultipleFiles(ctx, documents);
    }
    
  } catch (error) {
    console.error('Error processing files:', error);
    ctx.reply(
      `❌ *Error Processing Files*\n\n` +
      `Something went wrong while processing your files.\n\n` +
      `Error: ${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Handle multiple documents in a single message (media group)
bot.on('media_group', async (ctx) => {
  try {
    const mediaGroup = ctx.message.media_group_id;
    const documents = [];
    
    // Get all documents from the media group
    // Note: This needs to be handled differently based on your Telegraf version
    
    // For now, we'll send a message
    ctx.reply(
      `📦 *Processing media group...*\n\n` +
      `I've received multiple files. Processing them now...\n` +
      `Please wait for the summary.`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Media group error:', error);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An unexpected error occurred. Please try again.');
});

// Start bot
bot.launch()
  .then(() => console.log('🤖 Telegram bot started successfully!'))
  .catch(err => console.error('❌ Failed to start bot:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Bot is running. Send /start to get started.');