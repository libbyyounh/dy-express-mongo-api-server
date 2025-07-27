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
  }
}, {
  timestamps: true
});

const Mobile = mongoose.model('Mobile', mobileSchema);

module.exports = Mobile;
