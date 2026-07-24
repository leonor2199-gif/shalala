const XLSX = require('xlsx');
const Recharge = require('../models/Recharge');
const Withdraw = require('../models/Withdraw');
const fs = require('fs');
const path = require('path');
const { extractArchive, cleanupExtractedFiles } = require('../utils/fileExtractor');

// Helper function to split by <br> or \n
function splitData(str) {
  if (!str) return ['', ''];
  // Remove HTML tags and handle <br>
  const cleaned = str.replace(/<br\s*\/?>/gi, '\n');
  const parts = cleaned.split('\n').map(s => s.trim()).filter(s => s);
  
  if (parts.length >= 2) {
    return [parts[0], parts[1]];
  }
  if (parts.length === 1) {
    return [parts[0], ''];
  }
  return ['', ''];
}

// Parse bank info from withdraw file
function parseBankInfo(bankData) {
  if (!bankData) return { bank_name: '', bank_account: '', bank_holder: '' };
  
  const lines = bankData.split('\n').map(s => s.trim()).filter(s => s);
  let bank_name = '';
  let bank_account = '';
  let bank_holder = '';
  
  for (const line of lines) {
    if (line.includes('银行：') || line.includes('Bank:')) {
      bank_name = line.replace(/银行：|Bank:/, '').trim();
    }
    if (line.includes('账号：') || line.includes('Account:')) {
      bank_account = line.replace(/账号：|Account:/, '').trim();
    }
    if (line.includes('姓名:') || line.includes('Name:')) {
      bank_holder = line.replace(/姓名:|Name:/, '').trim();
    }
  }
  
  return { bank_name, bank_account, bank_holder };
}

// Process Withdraw Excel file
const processWithdrawFile = async (fileBuffer, fileName) => {
  console.log(`\n📄 Processing Withdraw: ${fileName}`);
  console.log(`📦 File size: ${fileBuffer.length} bytes`);
  
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`📊 Total rows in withdraw file: ${rawData.length}`);
    
    if (rawData.length === 0) {
      return { saved: 0, errors: 1, total: 0, errorDetails: ['File is empty'] };
    }
    
    // Log first 3 rows for debugging
    console.log('📋 First 3 rows:');
    for (let i = 0; i < Math.min(3, rawData.length); i++) {
      console.log(`  Row ${i}:`, rawData[i]);
    }
    
    // Find header row
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('用户信息') || rowStr.includes('提现金额') || rowStr.includes('web_scraper')) {
          headerRowIndex = i;
          console.log(`✅ Found header at row ${i}:`, row);
          break;
        }
      }
    }
    
    // 🔥 FIXED: Correct column positions for withdraw file
    // Column A=0, B=1, C=2(empty), D=3(用户信息), E=4(所属代理), F=5(提现金额), G=6(银行信息), H=7(发起处理回调), I=8(代理审核2)
    const colPositions = {
      order: 0,      // Column A
      user_info: 3,  // Column D (用户信息)
      agent: 4,      // Column E (所属代理)
      amount: 5,     // Column F (提现金额)
      bank_info: 6,  // Column G (银行信息)
      time: 7,       // Column H (发起处理回调)
      status: 8      // Column I (代理审核2)
    };
    
    const savedRecords = [];
    let errorCount = 0;
    let errorDetails = [];
    let processedCount = 0;
    
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      
      if (!row) continue;
      
      const hasData = row.some(cell => cell && cell.toString().trim() !== '');
      if (!hasData) continue;
      
      processedCount++;
      
      try {
        const orderData = row[colPositions.order] ? row[colPositions.order].toString().trim() : '';
        const userData = row[colPositions.user_info] ? row[colPositions.user_info].toString().trim() : '';
        const agentData = row[colPositions.agent] ? row[colPositions.agent].toString().trim() : '';
        const amountData = row[colPositions.amount] ? row[colPositions.amount].toString().trim() : '';
        const bankData = row[colPositions.bank_info] ? row[colPositions.bank_info].toString().trim() : '';
        const timeData = row[colPositions.time] ? row[colPositions.time].toString().trim() : '';
        const status = row[colPositions.status] ? row[colPositions.status].toString().trim() : '待审核';
        
        // Debug first few rows
        if (processedCount <= 3) {
          console.log(`\n🔍 Row ${i} (processed #${processedCount}):`);
          console.log(`  Col D (user_info): "${userData}"`);
          console.log(`  Col E (agent): "${agentData}"`);
          console.log(`  Col F (amount): "${amountData}"`);
          console.log(`  Col G (bank_info): "${bankData}"`);
          console.log(`  Col H (time): "${timeData}"`);
          console.log(`  Col I (status): "${status}"`);
        }
        
        // Parse user info: "Josue ochoa\n9845201976\nVIP1\nMXN0"
        const userParts = userData.split('\n').map(s => s.trim()).filter(s => s);
        let username = '';
        let user_id = '';
        let vip_level = '';
        let balance = '';
        
        if (userParts.length >= 1) username = userParts[0];
        if (userParts.length >= 2) user_id = userParts[1];
        if (userParts.length >= 3) vip_level = userParts[2];
        if (userParts.length >= 4) balance = userParts[3];
        
        // Parse agent: "bz008\n13625999810"
        const agentParts = agentData.split('\n').map(s => s.trim()).filter(s => s);
        const agent_id = agentParts.length >= 1 ? agentParts[0] : '';
        const agent_phone = agentParts.length >= 2 ? agentParts[1] : '';
        
        // Parse amount: "MXN165\n3%\nMXN160"
        const amountParts = amountData.split('\n').map(s => s.trim()).filter(s => s);
        let amount = 0;
        let fee_percent = '3%';
        let net_amount = 0;
        
        if (amountParts.length >= 1) {
          const amountMatch = amountParts[0].match(/([0-9.]+)/);
          if (amountMatch) amount = parseFloat(amountMatch[1]) || 0;
        }
        if (amountParts.length >= 2) {
          fee_percent = amountParts[1] || '3%';
        }
        if (amountParts.length >= 3) {
          const netMatch = amountParts[2].match(/([0-9.]+)/);
          if (netMatch) net_amount = parseFloat(netMatch[1]) || 0;
        }
        
        // Parse bank info
        const bankInfo = parseBankInfo(bankData);
        
        // Parse time data: "2026-07-24 17:05:37\n2026-07-24 17:06:55\n-"
        const timeParts = timeData.split('\n').map(s => s.trim()).filter(s => s);
        let request_time = null;
        let process_time1 = null;
        let process_time2 = null;
        
        if (timeParts.length >= 1 && timeParts[0] !== '-' && timeParts[0] !== '') {
          request_time = new Date(timeParts[0]);
          if (isNaN(request_time.getTime())) request_time = null;
        }
        if (timeParts.length >= 2 && timeParts[1] !== '-' && timeParts[1] !== '') {
          process_time1 = new Date(timeParts[1]);
          if (isNaN(process_time1.getTime())) process_time1 = null;
        }
        if (timeParts.length >= 3 && timeParts[2] !== '-' && timeParts[2] !== '') {
          process_time2 = new Date(timeParts[2]);
          if (isNaN(process_time2.getTime())) process_time2 = null;
        }
        
        if (processedCount <= 3) {
          console.log(`  Parsed: username="${username}", user_id="${user_id}", amount=${amount}, status="${status}"`);
          console.log(`  Bank: ${bankInfo.bank_name}, Account: ${bankInfo.bank_account}`);
        }
        
        // Validate
        if (!user_id && !username) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Missing user data - user_id: "${user_id}", username: "${username}"`);
          }
          continue;
        }
        
        if (!amount || amount <= 0) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Invalid amount: ${amount}`);
          }
          continue;
        }
        
        if (!request_time) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Invalid request time`);
          }
          continue;
        }
        
        // Create and save record
        const record = new Withdraw({
          order_id: orderData || `ORDER-${i}`,
          user_id: user_id || 'Unknown',
          username: username || 'Unknown',
          vip_level: vip_level || '',
          balance: balance || '',
          agent_id: agent_id || '',
          agent_phone: agent_phone || '',
          amount: amount,
          fee_percent: fee_percent || '3%',
          net_amount: net_amount || amount,
          bank_name: bankInfo.bank_name || '',
          bank_account: bankInfo.bank_account || '',
          bank_holder: bankInfo.bank_holder || '',
          request_time: request_time,
          process_time1: process_time1 || null,
          process_time2: process_time2 || null,
          status: status || '待审核',
          raw_data: row,
          file_source: fileName
        });
        
        await record.save();
        savedRecords.push(record);
        
        if (savedRecords.length <= 3) {
          console.log(`✅ Saved Withdraw: ${username} (${user_id}) - $${amount} - ${status}`);
        }
        
      } catch (rowError) {
        errorCount++;
        if (errorCount <= 3) {
          errorDetails.push(`Row ${i}: ${rowError.message}`);
        }
      }
    }
    
    console.log(`\n📊 Summary for withdraw file ${fileName}:`);
    console.log(`  ✅ Records Saved: ${savedRecords.length}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total rows processed: ${processedCount}`);
    
    return {
      fileName: fileName,
      saved: savedRecords.length,
      errors: errorCount,
      total: processedCount,
      errorDetails: errorDetails,
      type: 'withdraw'
    };
    
  } catch (error) {
    console.error(`❌ Error processing withdraw file:`, error.message);
    return {
      fileName: fileName,
      saved: 0,
      errors: 1,
      total: 0,
      errorDetails: [error.message],
      type: 'withdraw'
    };
  }
};

// Process Recharge Excel file
const processRechargeFile = async (fileBuffer, fileName) => {
  console.log(`\n📄 Processing Recharge: ${fileName}`);
  console.log(`📦 File size: ${fileBuffer.length} bytes`);
  
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`📊 Total rows in file: ${rawData.length}`);
    
    if (rawData.length === 0) {
      return { saved: 0, errors: 1, total: 0, errorDetails: ['File is empty'] };
    }
    
    // Log first 3 rows for debugging
    console.log('📋 First 3 rows:');
    for (let i = 0; i < Math.min(3, rawData.length); i++) {
      console.log(`  Row ${i}:`, rawData[i]);
    }
    
    // Find header row
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('data') || rowStr.includes('充值') || rowStr.includes('web_scraper')) {
          headerRowIndex = i;
          console.log(`✅ Found header at row ${i}:`, row);
          break;
        }
      }
    }
    
    // 🔥 FIXED: Correct column positions for recharge file
    // Column A=0, B=1, C=2(empty), D=3(data), E=4(充值金额手续费), F=5(申请处理时间)
    const colPositions = {
      data: 3,    // Column D - contains "Eli90\n2751106642"
      amount: 4,  // Column E - contains "100\n0.00(0%)"
      time: 5     // Column F - contains "2026-07-15 11:59:43\n2026-07-15 12:00:14"
    };
    
    const savedRecords = [];
    let errorCount = 0;
    let errorDetails = [];
    let processedCount = 0;
    
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      
      if (!row) continue;
      
      const hasData = row.some(cell => cell && cell.toString().trim() !== '');
      if (!hasData) continue;
      
      processedCount++;
      
      try {
        // Get data from correct columns
        const dataCol = row[colPositions.data] ? row[colPositions.data].toString().trim() : '';
        const amountCol = row[colPositions.amount] ? row[colPositions.amount].toString().trim() : '';
        const timeCol = row[colPositions.time] ? row[colPositions.time].toString().trim() : '';
        
        if (processedCount <= 3) {
          console.log(`\n🔍 Row ${i} (processed #${processedCount}):`);
          console.log(`  Col D (data): "${dataCol}"`);
          console.log(`  Col E (amount): "${amountCol}"`);
          console.log(`  Col F (time): "${timeCol}"`);
        }
        
        // Parse data column: "Username\nUserID"
        const dataParts = dataCol.split('\n').map(s => s.trim()).filter(s => s);
        let username = '';
        let user_id = '';
        
        if (dataParts.length >= 2) {
          username = dataParts[0];
          user_id = dataParts[1];
        } else if (dataParts.length === 1) {
          // Try to determine if it's username or user_id
          const part = dataParts[0];
          if (/^\d+$/.test(part)) {
            user_id = part;
            username = part; // Use as fallback
          } else {
            username = part;
            user_id = part; // Use as fallback
          }
        }
        
        // Parse amount column: "100\n0.00(0%)"
        const amountParts = amountCol.split('\n').map(s => s.trim()).filter(s => s);
        let amount = 0;
        let fee = '0.00(0%)';
        
        if (amountParts.length >= 1) {
          const amountMatch = amountParts[0].match(/^([0-9.]+)/);
          if (amountMatch) {
            amount = parseFloat(amountMatch[1]) || 0;
          }
        }
        if (amountParts.length >= 2) {
          fee = amountParts[1] || '0.00(0%)';
        }
        
        // Parse time column: "2026-07-15 11:59:43\n2026-07-15 12:00:14"
        const timeParts = timeCol.split('\n').map(s => s.trim()).filter(s => s);
        let request_time = null;
        let process_time = null;
        
        if (timeParts.length >= 1 && timeParts[0] && timeParts[0] !== '-') {
          request_time = new Date(timeParts[0]);
          if (isNaN(request_time.getTime())) request_time = null;
        }
        if (timeParts.length >= 2 && timeParts[1] && timeParts[1] !== '-') {
          process_time = new Date(timeParts[1]);
          if (isNaN(process_time.getTime())) process_time = null;
        }
        
        if (processedCount <= 3) {
          console.log(`  Parsed: username="${username}", user_id="${user_id}", amount=${amount}`);
          console.log(`  Times: request="${request_time}", process="${process_time}"`);
        }
        
        // Validate
        if (!username && !user_id) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Missing username and user_id`);
          }
          continue;
        }
        
        if (!amount || amount <= 0) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Invalid amount: ${amount}`);
          }
          continue;
        }
        
        if (!request_time || !process_time) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Invalid time data: ${timeCol}`);
          }
          continue;
        }
        
        // Create and save record
        const record = new Recharge({
          username: username || 'Unknown',
          user_id: user_id || 'Unknown',
          amount: amount,
          fee: fee,
          request_time: request_time,
          process_time: process_time,
          raw_data: row,
          file_source: fileName
        });
        
        await record.save();
        savedRecords.push(record);
        
        if (savedRecords.length <= 3) {
          console.log(`✅ Saved Recharge: ${username} (${user_id}) - $${amount}`);
        }
        
      } catch (rowError) {
        errorCount++;
        if (errorCount <= 3) {
          errorDetails.push(`Row ${i}: ${rowError.message}`);
        }
      }
    }
    
    console.log(`\n📊 Summary for ${fileName}:`);
    console.log(`  ✅ Records Saved: ${savedRecords.length}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total rows processed: ${processedCount}`);
    
    return {
      fileName: fileName,
      saved: savedRecords.length,
      errors: errorCount,
      total: processedCount,
      errorDetails: errorDetails,
      type: 'recharge'
    };
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
    return {
      fileName: fileName,
      saved: 0,
      errors: 1,
      total: 0,
      errorDetails: [error.message],
      type: 'recharge'
    };
  }
};

// Detect file type and process
const processSingleExcelFile = async (fileBuffer, fileName) => {
  console.log(`\n📄 Processing: ${fileName}`);
  console.log(`📦 File size: ${fileBuffer.length} bytes`);
  
  try {
    // Check file type by looking at first few rows
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length === 0) {
      return { saved: 0, errors: 1, total: 0, errorDetails: ['File is empty'], type: 'unknown' };
    }
    
    // Detect file type from header row
    const firstRow = rawData[0];
    let isWithdrawFile = false;
    let isRechargeFile = false;
    
    if (firstRow) {
      const rowStr = firstRow.join(' ').toLowerCase();
      // Check for withdraw file headers
      if (rowStr.includes('用户信息') && rowStr.includes('提现金额') && rowStr.includes('银行信息')) {
        isWithdrawFile = true;
        console.log('🔍 Detected WITHDRAW file');
      } 
      // Check for recharge file headers
      else if (rowStr.includes('data') && rowStr.includes('充值金额手续费') && rowStr.includes('申请处理时间')) {
        isRechargeFile = true;
        console.log('🔍 Detected RECHARGE file');
      }
      // Fallback detection
      else if (rowStr.includes('所属代理') || rowStr.includes('代理审核')) {
        isWithdrawFile = true;
        console.log('🔍 Detected WITHDRAW file (by agent/status)');
      } else if (rowStr.includes('充值') || rowStr.includes('手续费')) {
        isRechargeFile = true;
        console.log('🔍 Detected RECHARGE file (by recharge/fee)');
      }
    }
    
    // Process based on file type
    if (isWithdrawFile) {
      return await processWithdrawFile(fileBuffer, fileName);
    } else if (isRechargeFile) {
      return await processRechargeFile(fileBuffer, fileName);
    } else {
      // Try to detect based on column count and data
      console.log('⚠️ File type not clearly detected, trying recharge parser as fallback...');
      // Check if it might be a withdraw file by looking at data
      if (rawData.length > 1) {
        const secondRow = rawData[1];
        if (secondRow && secondRow.length >= 7) {
          // Check for withdraw file patterns
          const hasWithdrawPattern = secondRow.some(cell => {
            if (typeof cell === 'string') {
              return cell.includes('VIP') || cell.includes('MXN') || cell.includes('银行：');
            }
            return false;
          });
          if (hasWithdrawPattern) {
            console.log('🔍 Detected as WITHDRAW file by data pattern');
            return await processWithdrawFile(fileBuffer, fileName);
          }
        }
      }
      return await processRechargeFile(fileBuffer, fileName);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
    return {
      fileName: fileName,
      saved: 0,
      errors: 1,
      total: 0,
      errorDetails: [error.message],
      type: 'error'
    };
  }
};

// Process uploaded file (Excel or Archive)
const processExcelFile = async (fileBuffer, originalFileName) => {
  console.log(`\n📦 Processing: ${originalFileName}`);
  
  const ext = path.extname(originalFileName).toLowerCase();
  const isArchive = ['.zip', '.rar'].includes(ext);
  
  if (!isArchive) {
    const result = await processSingleExcelFile(fileBuffer, originalFileName);
    return {
      files: [result],
      totalFiles: 1,
      totalSaved: result.saved || 0,
      totalErrors: result.errors || 0,
      errorDetails: result.errorDetails || [],
      type: result.type || 'unknown'
    };
  }
  
  // Handle ZIP/RAR archive
  const tempDir = path.join(__dirname, '../temp', Date.now().toString());
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    const archivePath = path.join(tempDir, originalFileName);
    fs.writeFileSync(archivePath, fileBuffer);
    
    const extractedFiles = await extractArchive(archivePath, tempDir);
    
    if (extractedFiles.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return {
        files: [],
        totalFiles: 0,
        totalSaved: 0,
        totalErrors: 1,
        errorDetails: ['No Excel files found in archive'],
        type: 'archive'
      };
    }
    
    const results = [];
    let totalSaved = 0;
    let totalErrors = 0;
    let allErrorDetails = [];
    let types = new Set();
    
    for (const filePath of extractedFiles) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const result = await processSingleExcelFile(fileBuffer, fileName);
        results.push(result);
        totalSaved += result.saved || 0;
        totalErrors += result.errors || 0;
        if (result.errorDetails) {
          allErrorDetails = allErrorDetails.concat(result.errorDetails);
        }
        if (result.type) {
          types.add(result.type);
        }
      } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error);
        totalErrors++;
        allErrorDetails.push(`Error processing ${path.basename(filePath)}: ${error.message}`);
      }
    }
    
    cleanupExtractedFiles(extractedFiles);
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    return {
      files: results,
      totalFiles: extractedFiles.length,
      totalSaved: totalSaved,
      totalErrors: totalErrors,
      errorDetails: allErrorDetails,
      types: Array.from(types)
    };
    
  } catch (error) {
    console.error('❌ Error processing archive:', error);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
};

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`📁 File received: ${req.file.originalname}, size: ${req.file.size} bytes`);
    const result = await processExcelFile(req.file.buffer, req.file.originalname);
    
    res.json({
      message: 'File processed successfully',
      ...result
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  processExcelFile,
  uploadFile,
  processSingleExcelFile,
  processRechargeFile,
  processWithdrawFile
};
