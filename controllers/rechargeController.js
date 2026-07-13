const Recharge = require('../models/Recharge');

// Get all records with pagination and search
const getRecords = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build search query
    let query = {};
    if (search.trim()) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { user_id: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Get total count
    const total = await Recharge.countDocuments(query);
    
    // Get records
    const records = await Recharge.find(query)
      .sort({ request_time: -1 })
      .skip(skip)
      .limit(limitNum);
    
    res.json({
      records,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
};

// Get single record by ID
const getRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Recharge.findById(id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json(record);
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
};

// Create new record
const createRecord = async (req, res) => {
  try {
    const { username, user_id, amount, fee, request_time, process_time } = req.body;
    
    // Validate required fields
    if (!username || !user_id || !amount || !fee || !request_time || !process_time) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const newRecord = new Recharge({
      username: username.trim(),
      user_id: user_id.trim(),
      amount: parseFloat(amount),
      fee: fee.trim(),
      request_time: new Date(request_time),
      process_time: new Date(process_time)
    });
    
    await newRecord.save();
    
    res.status(201).json({ 
      message: 'Record created successfully',
      record: newRecord 
    });
  } catch (error) {
    console.error('Error creating record:', error);
    res.status(500).json({ error: 'Failed to create record' });
  }
};

// Update record
const updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, user_id, amount, fee, request_time, process_time } = req.body;
    
    const record = await Recharge.findById(id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    // Update fields
    if (username) record.username = username.trim();
    if (user_id) record.user_id = user_id.trim();
    if (amount) record.amount = parseFloat(amount);
    if (fee) record.fee = fee.trim();
    if (request_time) record.request_time = new Date(request_time);
    if (process_time) record.process_time = new Date(process_time);
    
    await record.save();
    
    res.json({ 
      message: 'Record updated successfully',
      record 
    });
  } catch (error) {
    console.error('Error updating record:', error);
    res.status(500).json({ error: 'Failed to update record' });
  }
};

// Delete record
const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    
    const record = await Recharge.findByIdAndDelete(id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
};

// Export records as CSV
const exportRecords = async (req, res) => {
  try {
    const { search = '' } = req.query;
    
    let query = {};
    if (search.trim()) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { user_id: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const records = await Recharge.find(query).sort({ request_time: -1 });
    
    // Convert to CSV
    const headers = 'Username,User ID,Amount,Fee,Request Time,Process Time\n';
    const rows = records.map(r => 
      `${r.username},${r.user_id},${r.amount},${r.fee},${r.request_time},${r.process_time}`
    ).join('\n');
    
    const csv = headers + rows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=recharge_export_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting records:', error);
    res.status(500).json({ error: 'Failed to export records' });
  }
};

module.exports = {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  exportRecords
};