const request = require('supertest');
const app = require('../setup');
const User = require('../../models/User');
const mongoose = require('mongoose');
const { createUrlModel } = require('../../utils/dbSetup');

// Mock axios to avoid real API calls
jest.mock('axios');
const axios = require('axios');

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

    // 全局模拟axios.delete，覆盖所有测试用例
    axios.delete.mockResolvedValue({ status: 204 });
  });

  describe('POST /api/hamibot/execute', () => {
    beforeEach(() => {
      // Mock axios responses
      axios.delete.mockResolvedValue({ status: 204 });
      axios.post.mockResolvedValue({ status: 204 });
    });

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
  });

  describe('POST /api/hamibot/stop', () => {
    it('should stop all tasks successfully', async () => {
      // 显式模拟stop接口的axios.delete响应
      axios.delete.mockResolvedValueOnce({ status: 204 });
      
      const res = await request(app)
        .post('/api/hamibot/stop')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('已成功停止');
    });
  });
});