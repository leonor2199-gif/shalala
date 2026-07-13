const XLSX = require('xlsx');
const Recharge = require('../models/Recharge');
const fs = require('fs');
const path = require('path');
const { extractArchive, cleanupExtractedFiles } = require('../utils/fileExtractor');

// Helper function to split by <br> or \n
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

// Process a single Excel file
const processSingleExcelFile = async (fileBuffer, fileName) => {
  console.log(`\n📄 Processing: ${fileName}`);
  console.log(`📦 File size: ${fileBuffer.length} bytes`);
  
  try {
    // Read the workbook
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
    
    // Column positions (C=2, D=3, E=4)
    const colPositions = {
      data: 2,
      amount: 3,
      time: 4
    };
    
    const savedRecords = [];
    let errorCount = 0;
    let errorDetails = [];
    let processedCount = 0;
    
    // Process each row after header
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
        
        // Debug first few rows
        if (processedCount <= 3) {
          console.log(`\n🔍 Row ${i} (processed #${processedCount}):`);
          console.log(`  Col C (data): "${cData}"`);
          console.log(`  Col D (amount): "${dData}"`);
          console.log(`  Col E (time): "${eData}"`);
        }
        
        // Parse Column C
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
          console.log(`  Parsed: username="${username}", user_id="${user_id}", amount=${amount}`);
          console.log(`  Times: request="${request_time}", process="${process_time}"`);
        }
        
        // Validate
        if (!username || !user_id || !amount || amount <= 0 || !request_time || !process_time) {
          errorCount++;
          if (errorCount <= 3) {
            errorDetails.push(`Row ${i}: Missing data - username: "${username}", user_id: "${user_id}", amount: ${amount}`);
          }
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
        
        if (savedRecords.length <= 3) {
          console.log(`✅ Saved: ${username} (${user_id}) - $${amount}`);
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
      errorDetails: errorDetails
    };
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
    return {
      fileName: fileName,
      saved: 0,
      errors: 1,
      total: 0,
      errorDetails: [error.message]
    };
  }
};

// Process uploaded file
const processExcelFile = async (fileBuffer, originalFileName) => {
  console.log(`\n📦 Processing: ${originalFileName}`);
  
  const ext = path.extname(originalFileName).toLowerCase();
  const isArchive = ['.zip'].includes(ext);
  
  if (!isArchive) {
    const result = await processSingleExcelFile(fileBuffer, originalFileName);
    return {
      files: [result],
      totalFiles: 1,
      totalSaved: result.saved,
      totalErrors: result.errors,
      errorDetails: result.errorDetails || []
    };
  }
  
  // Handle ZIP archive
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
        errorDetails: ['No Excel files found in archive']
      };
    }
    
    const results = [];
    let totalSaved = 0;
    let totalErrors = 0;
    let allErrorDetails = [];
    
    for (const filePath of extractedFiles) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const result = await processSingleExcelFile(fileBuffer, fileName);
        results.push(result);
        totalSaved += result.saved;
        totalErrors += result.errors;
        if (result.errorDetails) {
          allErrorDetails = allErrorDetails.concat(result.errorDetails);
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
      errorDetails: allErrorDetails
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
  processSingleExcelFile
};
