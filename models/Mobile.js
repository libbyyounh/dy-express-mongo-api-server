const mongoose = require('mongoose');

const mobileSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    unique: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: ['A', 'B'],
    default: 'A'
  },
  createByUserId: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const Mobile = mongoose.model('Mobile', mobileSchema);

module.exports = Mobile;
