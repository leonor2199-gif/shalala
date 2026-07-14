const Withdraw = require('../models/Withdraw');
const XLSX = require('xlsx');

// Helper to split by <br> or \n
function splitData(str) {
  if (!str) return ['', ''];
  if (str.includes('<br>')) {
    return str.split('<br>').map(s => s.trim());
  }
  if (str.includes('\n')) {
    return str.split('\n').map(s => s.trim());
  }
  return [str.trim(), ''];
}

// Extract bank info from column F
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

// Process withdraw Excel file
const processWithdrawFile = async (fileBuffer, fileName) => {
  console.log(`\n📄 Processing Withdraw: ${fileName}`);
  
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`📊 Total rows in withdraw file: ${rawData.length}`);
    
    if (rawData.length === 0) {
      return { saved: 0, errors: 1, total: 0, errorDetails: ['File is empty'] };
    }
    
    // Find header row
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('用户信息') || rowStr.includes('提现金额') || rowStr.includes('web_scraper')) {
          headerRowIndex = i;
          console.log(`✅ Found header at row ${i}`);
          break;
        }
      }
    }
    
    // Column positions for withdraw file
    const colPositions = {
      order: 0,      // Column A
      user_info: 2,  // Column C (用户信息)
      amount: 3,     // Column D (提现金额)
      bank_info: 4,  // Column E (银行信息)
      time: 5,       // Column F (发起处理回调)
      status: 6      // Column G (代理审核2)
    };
    
    const savedRecords = [];
    let errorCount = 0;
    let errorDetails = [];
    let processedCount = 0;
    
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      
      if (!row || row.length < 7) continue;
      
      const hasData = row.some(cell => cell && cell.toString().trim() !== '');
      if (!hasData) continue;
      
      processedCount++;
      
      try {
        const orderData = row[colPositions.order] ? row[colPositions.order].toString().trim() : '';
        const userData = row[colPositions.user_info] ? row[colPositions.user_info].toString().trim() : '';
        const amountData = row[colPositions.amount] ? row[colPositions.amount].toString().trim() : '';
        const bankData = row[colPositions.bank_info] ? row[colPositions.bank_info].toString().trim() : '';
        const timeData = row[colPositions.time] ? row[colPositions.time].toString().trim() : '';
        const status = row[colPositions.status] ? row[colPositions.status].toString().trim() : '待审核';
        
        // Parse user info: "6771018282\n6771018282\nVIP1\nMXN0"
        const userParts = userData.split('\n').map(s => s.trim()).filter(s => s);
        const user_id = userParts[0] || '';
        const username = userParts[1] || '';
        const vip_level = userParts[2] || '';
        const balance = userParts[3] || '';
        
        // Parse amount: "MXN165\n3%\nMXN160"
        const amountParts = amountData.split('\n').map(s => s.trim()).filter(s => s);
        let amount = 0;
        let fee_percent = '0%';
        let net_amount = 0;
        
        if (amountParts.length >= 1) {
          const amountMatch = amountParts[0].match(/([0-9.]+)/);
          if (amountMatch) amount = parseFloat(amountMatch[1]) || 0;
        }
        if (amountParts.length >= 2) {
          fee_percent = amountParts[1] || '0%';
        }
        if (amountParts.length >= 3) {
          const netMatch = amountParts[2].match(/([0-9.]+)/);
          if (netMatch) net_amount = parseFloat(netMatch[1]) || 0;
        }
        
        // Parse bank info
        const bankInfo = parseBankInfo(bankData);
        
        // Parse time data: "2026-07-13 21:10:01\n-\n-"
        const timeParts = timeData.split('\n').map(s => s.trim()).filter(s => s);
        let request_time = null;
        let process_time1 = null;
        let process_time2 = null;
        
        if (timeParts.length >= 1 && timeParts[0] !== '-') {
          request_time = new Date(timeParts[0]);
        }
        if (timeParts.length >= 2 && timeParts[1] !== '-') {
          process_time1 = new Date(timeParts[1]);
        }
        if (timeParts.length >= 3 && timeParts[2] !== '-') {
          process_time2 = new Date(timeParts[2]);
        }
        
        // Validate
        if (!user_id || !username || !amount || !request_time) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Missing data - user_id: "${user_id}", username: "${username}", amount: ${amount}`);
          }
          continue;
        }
        
        // Create record
        const record = new Withdraw({
          order_id: orderData || `ORDER-${i}`,
          user_id: user_id,
          username: username,
          vip_level: vip_level || '',
          balance: balance || '',
          amount: amount,
          fee_percent: fee_percent,
          net_amount: net_amount || amount,
          bank_name: bankInfo.bank_name,
          bank_account: bankInfo.bank_account,
          bank_holder: bankInfo.bank_holder,
          request_time: request_time,
          process_time1: process_time1 || null,
          process_time2: process_time2 || null,
          status: status,
          raw_data: row,
          file_source: fileName
        });
        
        await record.save();
        savedRecords.push(record);
        
        if (savedRecords.length <= 3) {
          console.log(`✅ Saved: ${username} (${user_id}) - $${amount} - ${status}`);
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
      errorDetails: errorDetails
    };
    
  } catch (error) {
    console.error(`❌ Error processing withdraw file:`, error.message);
    return {
      fileName: fileName,
      saved: 0,
      errors: 1,
      total: 0,
      errorDetails: [error.message]
    };
  }
};

// Detect file type and process
const processFile = async (fileBuffer, fileName) => {
  // Check if it's a withdraw file by looking at column names
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  let isWithdrawFile = false;
  if (rawData.length > 0) {
    const firstRow = rawData[0];
    if (firstRow) {
      const rowStr = firstRow.join(' ').toLowerCase();
      if (rowStr.includes('用户信息') || rowStr.includes('提现金额') || rowStr.includes('银行信息')) {
        isWithdrawFile = true;
        console.log('🔍 Detected WITHDRAW file');
      }
    }
  }
  
  if (isWithdrawFile) {
    return await processWithdrawFile(fileBuffer, fileName);
  } else {
    // Use the existing recharge processor
    const { processSingleExcelFile } = require('./uploadController');
    return await processSingleExcelFile(fileBuffer, fileName);
  }
};

module.exports = {
  processWithdrawFile,
  processFile
};
