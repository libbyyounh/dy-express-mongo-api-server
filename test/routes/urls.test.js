const request = require('supertest');
const app = require('../setup');
const User = require('../../models/User');
const Mobile = require('../../models/Mobile');
const mongoose = require('mongoose');

describe('URL Routes', () => {
  let token;
  const testUrl = { url: 'https://example.com/test' };

  beforeEach(async () => {
    // 创建测试用户并获取token
    await User.create({
      username: 'testadmin',
      password: 'password123',
      role: 'admin'
    });

    // 创建测试手机
    await Mobile.create({ mobile: '13800138000' });

    const loginRes = await request(app)
      .post('/api/login')
      .send({
        username: 'testadmin',
        password: 'password123'
      });

    token = loginRes.body.token;
  });

  describe('POST /api/postUrl', () => {
    it('should add new URL successfully', async () => {
      const res = await request(app)
        .post('/api/postUrl')
        .set('Authorization', `Bearer ${token}`)
        .send(testUrl);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.url).toBe(testUrl.url);
    });

    it('should return 400 for missing URL', async () => {
      const res = await request(app)
        .post('/api/postUrl')
        .set('Authorization', `Bearer ${token}`)
        .send({}); // 空请求体

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/getUrl', () => {

    it('should return 404 when no URL available', async () => {
      const res = await request(app)
        .get('/api/getUrl')
        .set('Authorization', `Bearer ${token}`)
        .query({ mobile: '13900139000' }); // 不存在的手机号

      expect(res.statusCode).toBe(404);
    });
  });
});