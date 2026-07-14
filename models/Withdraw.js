const mongoose = require('mongoose');

const withdrawSchema = new mongoose.Schema({
  order_id: { type: String, required: true },
  user_id: { type: String, required: true, index: true },
  username: { type: String, required: true },
  vip_level: { type: String },
  balance: { type: String },
  amount: { type: Number, required: true },
  fee_percent: { type: String },
  net_amount: { type: Number },
  bank_name: { type: String },
  bank_account: { type: String },
  bank_holder: { type: String },
  request_time: { type: Date, required: true },
  process_time1: { type: Date },
  process_time2: { type: Date },
  status: { type: String, default: '待审核' },
  raw_data: { type: Object },
  file_source: { type: String }
}, {
  timestamps: true
});

// Indexes for fast search
withdrawSchema.index({ user_id: 1, request_time: -1 });
withdrawSchema.index({ username: 'text' });

module.exports = mongoose.model('Withdraw', withdrawSchema);
