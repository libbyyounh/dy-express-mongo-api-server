require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Mobile = require('./models/Mobile');

async function initializeMongoDB() {
  // 从环境变量获取连接参数
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('错误: 未设置MONGODB_URI环境变量');
    process.exit(1);
  }

  try {
    // 连接到远程MongoDB
    await mongoose.connect(mongoUri);
    console.log('成功连接到远程MongoDB');

    // 验证集合索引
    const userIndexes = await User.collection.getIndexes();
    const mobileIndexes = await Mobile.collection.getIndexes();

    console.log('用户集合索引:', Object.keys(userIndexes));
    console.log('手机集合索引:', Object.keys(mobileIndexes));
    console.log('MongoDB初始化完成');

    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  }
}

// 执行初始化
initializeMongoDB();