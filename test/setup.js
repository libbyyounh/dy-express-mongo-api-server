const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config();
const app = require('../app');
const { initializeDatabase } = require('../utils/dbSetup');
// 导入任务队列清理函数
const { clearTaskQueue } = require('../routes/hamibot');

let mongoServer;

// 在所有测试之前启动内存MongoDB并连接
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  // 确保连接到内存数据库
  await mongoose.connect(process.env.MONGODB_URI);
  // 初始化测试数据库
  await initializeDatabase();
});

// 在所有测试之后关闭连接并停止内存MongoDB
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// 在每个测试之后清理数据库
afterEach(async () => {
  // 先清理任务队列防止数据库操作冲突
  clearTaskQueue();
  // 再清理数据库集合
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

module.exports = app;