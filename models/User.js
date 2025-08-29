// 在文件顶部添加
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { encrypt, generateHash } = require('../utils/cryptoUtils');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'API'], // 添加API角色
    default: 'user'
  },
  lastLogin: {
    type: Date
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  disabled: {
    type: Boolean,
    default: false
  },
  // API 凭证相关字段（使用加密存储）
  apiKey: {
    type: String,
    unique: true,
    sparse: true // 允许空值，但非空值必须唯一
  },
  apiSecretHash: {
    type: String // 存储API Secret的哈希值
  },
  apiSecretLastGenerated: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// 验证 API Secret
userSchema.methods.verifyApiSecret = function(apiSecret) {
  // 比较提供的API Secret的哈希值与存储的哈希值
  return generateHash(apiSecret) === this.apiSecretHash;
};

// Method to generate API Key and Secret
userSchema.methods.generateApiCredentials = function() {
  // 生成 API Key
  const apiKey = `api_${this._id.toString().substring(0, 10)}_${crypto.randomBytes(10).toString('hex')}`;
  
  // 生成 API Secret
  const apiSecret = crypto.randomBytes(32).toString('hex');
  
  // 存储 API Key 和 API Secret 的哈希值
  this.apiKey = apiKey;
  this.apiSecretHash = generateHash(apiSecret); // 存储哈希值而不是明文
  this.apiSecretLastGenerated = new Date();
  
  // 返回生成的凭证（注意：secret 只会返回一次）
  return { apiKey, apiSecret };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
