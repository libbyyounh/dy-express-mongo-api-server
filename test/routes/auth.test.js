const request = require('supertest');
const app = require('../setup');
const User = require('../../models/User');

describe('Auth Routes', () => {
  // 为所有测试添加共享的用户创建逻辑
  beforeEach(async () => {
    // 在每个测试前清理并创建测试用户
    await User.deleteMany({});
    await User.create({
      username: 'testadmin',
      password: 'password123',
      role: 'admin'
    });
  });

  describe('POST /api/login', () => {
    it('should return 200 with token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/login') // 修正端点
        .send({
          username: 'testadmin',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('expiresIn');
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/getToken')
        .send({
          username: 'testadmin',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/getToken')
        .send({
          username: 'nonexistent',
          password: 'password123'
        });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/getToken', () => {
    it('should return 200 with token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/getToken')
        .send({
          username: 'testadmin',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
    });
  });
});