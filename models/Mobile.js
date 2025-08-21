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
    default: 'A'
  }
}, {
  timestamps: true
});

const Mobile = mongoose.model('Mobile', mobileSchema);

module.exports = Mobile;
