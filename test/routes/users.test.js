const request = require('supertest');
const app = require('../setup');
const User = require('../../models/User');

describe('User Routes', () => {
  let token;

  // 将beforeAll改为beforeEach，确保每个测试前都有有效用户
  beforeEach(async () => {
    // 创建管理员用户并获取token
    await User.create({
      username: 'adminTest',
      password: 'admin123',
      role: 'admin'
    });

    const loginRes = await request(app)
        .post('/api/getToken')
        .send({
          username: 'adminTest',
          password: 'admin123'
        });

    token = loginRes.body.token;
  });

  describe('GET /api/users/check-username', () => {
    it('should return exists: true for existing username', async () => {
      const res = await request(app)
        .get('/api/users/check-username')
        .set('Authorization', `Bearer ${token}`)
        .query({ username: 'adminTest' });

      expect(res.statusCode).toBe(200);
      expect(res.body.exists).toBe(true);
    });

    it('should return exists: false for non-existing username', async () => {
      const res = await request(app)
        .get('/api/users/check-username')
        .set('Authorization', `Bearer ${token}`)
        .query({ username: 'nonexistentuser' });

      expect(res.statusCode).toBe(200);
      expect(res.body.exists).toBe(false);
    });
  });

  describe('POST /api/users', () => {
    it('should create new user successfully', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'newuser',
          password: 'newuser123',
          role: 'user'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toContain('创建成功');
    });

    it('should return 409 for duplicate username', async () => {
      // 先创建用户
      await User.create({
        username: 'existinguser',
        password: 'password123'
      });

      // 尝试创建同名用户
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'existinguser',
          password: 'password123'
        });

      expect(res.statusCode).toBe(409);
    });
  });
});