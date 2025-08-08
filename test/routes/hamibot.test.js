const request = require('supertest');
const app = require('../setup');
const User = require('../../models/User');
const mongoose = require('mongoose');
const { createUrlModel } = require('../../utils/dbSetup');
const Task = require('../../models/Task');

// Mock axios to avoid real API calls
jest.mock('axios');
const axios = require('axios');

// Mock setInterval and clearInterval for testing polling mechanism
jest.useFakeTimers();

describe('Hamibot Routes', () => {
  let token;
  let testUrlData;

  beforeEach(async () => {
    // 创建测试用户并获取token
    await User.create({
      username: 'testadmin',
      password: 'password123',
      role: 'admin'
    });

    const loginRes = await request(app)
      .post('/api/login')
      .send({
        username: 'testadmin',
        password: 'password123'
      });

    token = loginRes.body.token;

    // 创建测试URL数据
    const collectionName = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const UrlModel = createUrlModel(collectionName);
    testUrlData = await UrlModel.create({
      url: 'https://test.com',
      mobile: '13800138000',
      isUsed: false
    });

    // 全局模拟axios.delete和axios.post，覆盖所有测试用例
    axios.delete.mockResolvedValue({ status: 204 });
    axios.post.mockResolvedValue({ status: 204 });
  });

  afterEach(async () => {
    // 清除所有任务数据
    await Task.deleteMany({});
    // 清除所有用户数据
    await User.deleteMany({});
    // 清除所有URL数据
    const collectionName = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const UrlModel = createUrlModel(collectionName);
    await UrlModel.deleteMany({});
    // 清除定时器模拟
    jest.clearAllTimers();
  });

  describe('POST /api/hamibot/execute', () => {
    it('should execute hamibot task successfully', async () => {
      const res = await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      expect(res.statusCode).toBe(202);
      expect(res.body).toHaveProperty('taskIds');
      expect(Array.isArray(res.body.taskIds)).toBe(true);
    });

    it('should return 404 when no data found', async () => {
      const res = await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13900139000', // 不存在的手机号
          speed: 100,
          delay: 1000
        });

      expect(res.statusCode).toBe(404);
    });

    it('should handle 10 concurrent requests successfully', async () => {
      // 创建10个并发请求
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/hamibot/execute')
          .set('Authorization', `Bearer ${token}`)
          .send({
            mobile: '13800138000',
            speed: 100,
            delay: 1000
          })
      );

      // 等待所有请求完成
      const responses = await Promise.all(requests);

      // 验证所有请求都返回202状态码
      responses.forEach(res => {
        expect(res.statusCode).toBe(202);
        expect(res.body).toHaveProperty('taskIds');
        expect(Array.isArray(res.body.taskIds)).toBe(true);
      });
    });

    it('should restart polling when executing tasks after polling stopped', async () => {
      // 模拟轮询已停止
      const hamibot = require('../../routes/hamibot');
      hamibot.stopTaskPolling();
      expect(hamibot.taskPollInterval).toBeNull();

      // 调用execute接口
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 验证轮询已重新启动
      expect(hamibot.taskPollInterval).not.toBeNull();
    });
  });

  describe('POST /api/hamibot/stop', () => {
    it('should stop all tasks successfully', async () => {
      // 先创建一些任务
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 调用stop接口
      const res = await request(app)
        .post('/api/hamibot/stop')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('已成功停止');

      // 验证所有任务状态已更新
      const tasks = await Task.find({});
      tasks.forEach(task => {
        expect(task.status).toBe('stopped');
        expect(task.lockedBy).toBeNull();
        expect(task.lockedAt).toBeNull();
      });
    });

    it('should stop tasks by mobile successfully', async () => {
      // 先创建一些任务
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 为另一个手机号创建任务
      const collectionName = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const UrlModel = createUrlModel(collectionName);
      await UrlModel.create({
        url: 'https://test2.com',
        mobile: '13700137000',
        isUsed: false
      });

      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13700137000',
          speed: 100,
          delay: 1000
        });

      // 调用stop接口停止特定手机号的任务
      const res = await request(app)
        .post('/api/hamibot/stop')
        .set('Authorization', `Bearer ${token}`)
        .send({ mobile: '13800138000' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('手机号 13800138000 的所有任务已成功停止');

      // 验证指定手机号的任务已停止
      const stoppedTasks = await Task.find({ mobile: '13800138000' });
      stoppedTasks.forEach(task => {
        expect(task.status).toBe('stopped');
      });

      // 验证其他手机号的任务仍在等待
      const otherTasks = await Task.find({ mobile: '13700137000' });
      otherTasks.forEach(task => {
        expect(['pending', 'processing']).toContain(task.status);
      });
    });

    it('should handle 10 concurrent stop requests successfully', async () => {
      // 创建10个并发请求
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/hamibot/stop')
          .set('Authorization', `Bearer ${token}`)
      );

      // 等待所有请求完成
      const responses = await Promise.all(requests);

      // 验证所有请求都返回200状态码
      responses.forEach(res => {
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('已成功停止');
      });
    });
  });

  describe('GET /api/hamibot/log', () => {
    it('should get execution logs successfully', async () => {
      // 先创建一些任务
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 调用log接口
      const res = await request(app)
        .get('/api/hamibot/log')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('isProcessing');
      expect(res.body).toHaveProperty('queueLength');
      expect(res.body).toHaveProperty('processingCount');
      expect(res.body).toHaveProperty('tasks');
      expect(Array.isArray(res.body.tasks)).toBe(true);
    });

    it('should filter logs by mobile and status', async () => {
      // 先创建一些任务
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 更新一个任务的状态为failed
      const task = await Task.findOne({ mobile: '13800138000' });
      await Task.findByIdAndUpdate(task._id, {
        status: 'failed',
        error: 'Test error'
      });

      // 调用log接口过滤
      const res = await request(app)
        .get('/api/hamibot/log?mobile=13800138000&status=failed')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.tasks.length).toBe(1);
      expect(res.body.tasks[0].mobile).toBe('13800138000');
      expect(res.body.tasks[0].status).toBe('failed');
    });
  });

  describe('Task Model Static Methods', () => {
    it('should check if all tasks are completed', async () => {
      // 初始状态应该是所有任务都已完成
      let allCompleted = await Task.areAllTasksCompleted();
      expect(allCompleted).toBe(true);

      // 创建任务后，应该不是所有任务都已完成
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      allCompleted = await Task.areAllTasksCompleted();
      expect(allCompleted).toBe(false);

      // 完成所有任务后，应该是所有任务都已完成
      await Task.updateMany({}, {
        status: 'completed',
        completedAt: new Date()
      });

      allCompleted = await Task.areAllTasksCompleted();
      expect(allCompleted).toBe(true);
    });

    it('should clear all tasks with confirmation', async () => {
      // 创建任务
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 确认有任务
      let taskCount = await Task.countDocuments({});
      expect(taskCount).toBeGreaterThan(0);

      // 调用clearAllTasks方法
      await Task.clearAllTasks(true);

      // 确认任务已清空
      taskCount = await Task.countDocuments({});
      expect(taskCount).toBe(0);
    });

    it('should unlock all tasks', async () => {
      // 创建任务并锁定
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 锁定任务
      const task = await Task.findOne({ mobile: '13800138000' });
      await Task.findByIdAndUpdate(task._id, {
        status: 'processing',
        lockedBy: 'test-worker',
        lockedAt: new Date()
      });

      // 调用unlockAllTasks方法
      await Task.unlockAllTasks();

      // 确认任务已解锁
      const unlockedTask = await Task.findById(task._id);
      expect(unlockedTask.status).toBe('pending');
      expect(unlockedTask.lockedBy).toBeNull();
      expect(unlockedTask.lockedAt).toBeNull();
    });
  });

  describe('Polling Mechanism', () => {
    it('should stop polling after 10 consecutive no tasks', async () => {
      // 导入hamibot模块以访问内部函数
      const hamibot = require('../../routes/hamibot');

      // 确保轮询已启动
      hamibot.startTaskPolling();
      expect(hamibot.taskPollInterval).not.toBeNull();

      // 模拟10次无任务调用processTaskQueue
      for (let i = 0; i < 10; i++) {
        await hamibot.processTaskQueue();
      }

      // 验证轮询已停止
      expect(hamibot.taskPollInterval).toBeNull();
      expect(hamibot.noTaskCount).toBe(10);
    });

    it('should adjust polling interval between 5-9 consecutive no tasks', async () => {
      // 导入hamibot模块以访问内部函数
      const hamibot = require('../../routes/hamibot');

      // 确保轮询已启动
      hamibot.startTaskPolling();
      const initialInterval = hamibot.taskPollInterval;

      // 模拟5次无任务调用processTaskQueue
      for (let i = 0; i < 5; i++) {
        await hamibot.processTaskQueue();
      }

      // 验证轮询间隔已调整
      expect(hamibot.taskPollInterval).not.toBe(initialInterval);
      expect(hamibot.noTaskCount).toBe(5);
    });

    it('should reset polling interval when task is found', async () => {
      // 导入hamibot模块以访问内部函数
      const hamibot = require('../../routes/hamibot');

      // 先模拟5次无任务调用以调整轮询间隔
      hamibot.startTaskPolling();
      for (let i = 0; i < 5; i++) {
        await hamibot.processTaskQueue();
      }
      const adjustedInterval = hamibot.taskPollInterval;

      // 创建一个任务
      await request(app)
        .post('/api/hamibot/execute')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mobile: '13800138000',
          speed: 100,
          delay: 1000
        });

      // 调用processTaskQueue应该找到任务并重置间隔
      await hamibot.processTaskQueue();

      // 验证轮询间隔已重置
      expect(hamibot.taskPollInterval).not.toBe(adjustedInterval);
      expect(hamibot.noTaskCount).toBe(0);
    });
  });
});