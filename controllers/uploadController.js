const XLSX = require('xlsx');
const Recharge = require('../models/Recharge');

// Helper function to split by <br> or \n
function splitData(str) {
  if (!str) return ['', ''];
  // Try <br> first, then \n
  if (str.includes('<br>')) {
    return str.split('<br>').map(s => s.trim());
  }
  if (str.includes('\n')) {
    return str.split('\n').map(s => s.trim());
  }
  return [str.trim(), ''];
}

// Process uploaded Excel file
const processExcelFile = async (fileBuffer) => {
  console.log('\n🔍 ===== STARTING FILE PROCESSING =====');
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
    
    // Find header row
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('data') || rowStr.includes('充值')) {
          headerRowIndex = i;
          console.log(`✅ Found header at row ${i}`);
          break;
        }
      }
    }
    
    // Column positions
    const colPositions = {
      data: 2,      // Column C
      amount: 3,    // Column D
      time: 4       // Column E
    };
    
    const savedRecords = [];
    let errorCount = 0;
    let errorDetails = [];
    let processedCount = 0;
    
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      
      if (!row || row.length < 5) continue;
      
      const hasData = row.some(cell => cell && cell.toString().trim() !== '');
      if (!hasData) continue;
      
      processedCount++;
      
      try {
        const cData = row[colPositions.data] ? row[colPositions.data].toString().trim() : '';
        const dData = row[colPositions.amount] ? row[colPositions.amount].toString().trim() : '';
        const eData = row[colPositions.time] ? row[colPositions.time].toString().trim() : '';
        
        if (processedCount <= 3) {
          console.log(`\n🔍 Row ${i} (processed #${processedCount}):`);
          console.log(`  Col C (data): "${cData}"`);
          console.log(`  Col D (amount): "${dData}"`);
          console.log(`  Col E (time): "${eData}"`);
        }
        
        // Parse Column C using the helper function
        const [username, user_id] = splitData(cData);
        
        // Parse Column D
        let amount = 0;
        let fee = '0.00(0%)';
        if (dData) {
          const amountMatch = dData.match(/^([0-9.]+)/);
          if (amountMatch) {
            amount = parseFloat(amountMatch[1]) || 0;
          }
          const feeMatch = dData.match(/\(([^)]+)\)/);
          if (feeMatch) {
            fee = feeMatch[1] || '0.00(0%)';
          }
        }
        
        // Parse Column E
        const [request_time, process_time] = splitData(eData);
        
        if (processedCount <= 3) {
          console.log(`  Parsed: username="${username}", user_id="${user_id}", amount=${amount}, fee="${fee}"`);
          console.log(`  Times: request="${request_time}", process="${process_time}"`);
        }
        
        // Validate
        if (!username) {
          errorCount++;
          if (errorCount <= 5) errorDetails.push(`Row ${i}: Missing username - "${cData}"`);
          continue;
        }
        
        if (!user_id) {
          errorCount++;
          if (errorCount <= 5) errorDetails.push(`Row ${i}: Missing user_id - "${cData}"`);
          continue;
        }
        
        if (!amount || amount <= 0) {
          errorCount++;
          if (errorCount <= 5) errorDetails.push(`Row ${i}: Invalid amount - "${dData}"`);
          continue;
        }
        
        if (!request_time) {
          errorCount++;
          if (errorCount <= 5) errorDetails.push(`Row ${i}: Missing request time - "${eData}"`);
          continue;
        }
        
        if (!process_time) {
          errorCount++;
          if (errorCount <= 5) errorDetails.push(`Row ${i}: Missing process time - "${eData}"`);
          continue;
        }
        
        // Create and save record
        const record = new Recharge({
          username: username,
          user_id: user_id,
          amount: amount,
          fee: fee,
          request_time: new Date(request_time),
          process_time: new Date(process_time),
          raw_data: row
        });
        
        await record.save();
        savedRecords.push(record);
        
        if (savedRecords.length <= 5) {
          console.log(`✅ Saved: ${username} (${user_id}) - $${amount}`);
        }
        
      } catch (rowError) {
        errorCount++;
        if (errorCount <= 5) {
          errorDetails.push(`Row ${i}: ${rowError.message}`);
        }
      }
    }
    
    console.log('\n📊 ===== PROCESSING SUMMARY =====');
    console.log(`✅ Records Saved: ${savedRecords.length}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total rows processed: ${processedCount}`);
    
    if (errorDetails.length > 0) {
      console.log('\n⚠️ Error Details:');
      errorDetails.slice(0, 10).forEach(err => console.log(`  • ${err}`));
    }
    
    return {
      saved: savedRecords.length,
      errors: errorCount,
      total: processedCount,
      errorDetails: errorDetails
    };
    
  } catch (error) {
    console.error('❌ Error processing Excel:', error);
    throw new Error('Failed to process Excel file: ' + error.message);
  }
};

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`📁 File received: ${req.file.originalname}, size: ${req.file.size} bytes`);
    const result = await processExcelFile(req.file.buffer);
    
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
  uploadFile
};