const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config();
const app = require('../app');
const { initializeDatabase } = require('../utils/dbSetup');
// 导入任务轮询控制函数
const { stopTaskPolling } = require('../routes/hamibot');

let mongoServer;

// 增加测试超时时间
jest.setTimeout(30000); // 设置为30秒

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
  // 停止任务轮询
  stopTaskPolling();
  await mongoose.disconnect();
  await mongoServer.stop();
});

// 在每个测试之后清理数据库
afterEach(async () => {
  // 清理数据库集合
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

module.exports = app;