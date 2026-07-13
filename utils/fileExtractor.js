const fs = require('fs');
const path = require('path');
const stream = require('stream');
const util = require('util');
const pipeline = util.promisify(stream.pipeline);
const unzipper = require('unzipper');
const { StreamZip } = require('node-stream-zip');

// Extract ZIP files
async function extractZip(filePath, outputDir) {
  const zip = new StreamZip.async({ file: filePath });
  const entries = await zip.entries();
  const extractedFiles = [];
  
  for (const entry of Object.values(entries)) {
    if (!entry.isDirectory) {
      const fileName = entry.name;
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const outputPath = path.join(outputDir, path.basename(fileName));
        await zip.extract(entry.name, outputPath);
        extractedFiles.push(outputPath);
        console.log(`📄 Extracted: ${fileName}`);
      }
    }
  }
  
  await zip.close();
  return extractedFiles;
}

// Extract RAR files using a different approach
// Note: For RAR, we'll use a workaround since there's no reliable Node.js RAR parser
async function extractRar(filePath, outputDir) {
  // First check if unrar is installed on the system
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  const extractedFiles = [];
  
  try {
    // Try using unrar command (needs to be installed)
    await execAsync(`unrar x -inul "${filePath}" "${outputDir}"`);
    
    // Read the extracted files
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
      if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
        extractedFiles.push(path.join(outputDir, file));
      }
    }
  } catch (error) {
    console.log('⚠️ unrar not found, trying alternative method...');
    // Alternative: Use a Node.js RAR parser (limited functionality)
    // For now, we'll throw an error
    throw new Error('RAR extraction requires "unrar" to be installed. Please install unrar or use ZIP files.');
  }
  
  return extractedFiles;
}

// Detect file type and extract
async function extractArchive(filePath, outputDir) {
  const ext = path.extname(filePath).toLowerCase();
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`📦 Extracting: ${path.basename(filePath)}`);
  
  let extractedFiles = [];
  
  if (ext === '.zip') {
    extractedFiles = await extractZip(filePath, outputDir);
  } else if (ext === '.rar') {
    extractedFiles = await extractRar(filePath, outputDir);
  } else {
    // Not an archive, return the file itself
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      extractedFiles = [filePath];
    }
  }
  
  console.log(`✅ Extracted ${extractedFiles.length} Excel files`);
  return extractedFiles;
}

// Clean up extracted files
function cleanupExtractedFiles(files) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (error) {
      console.log(`⚠️ Could not delete: ${file}`);
    }
  }
}

module.exports = {
  extractArchive,
  extractZip,
  extractRar,
  cleanupExtractedFiles
};