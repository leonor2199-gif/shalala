const mongoose = require('mongoose');

const rechargeSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true,
    trim: true
  },
  user_id: { 
    type: String, 
    required: true,
    index: true,
    trim: true
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  fee: { 
    type: String, 
    required: true,
    trim: true
  },
  request_time: { 
    type: Date, 
    required: true 
  },
  process_time: { 
    type: Date, 
    required: true 
  },
  raw_data: { 
    type: Object 
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Create compound index for faster searches
rechargeSchema.index({ user_id: 1, request_time: -1 });
rechargeSchema.index({ username: 'text' });

module.exports = mongoose.model('Recharge', rechargeSchema);