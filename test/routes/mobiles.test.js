const request = require('supertest');
const app = require('../setup');
const User = require('../../models/User');
const Mobile = require('../../models/Mobile');

describe('Mobile Routes', () => {
  let token;
  const testMobile = { mobile: '13800138000' };

  // 将beforeAll改为beforeEach
  beforeEach(async () => {
    // 创建测试用户并登录获取token
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
  });

  describe('GET /api/mobiles', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/mobiles');
      expect(res.statusCode).toBe(401);
    });

    it('should return list of mobiles with valid token', async () => {
      // 先创建测试手机
      await Mobile.create(testMobile);

      const res = await request(app)
        .get('/api/mobiles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].mobile).toBe(testMobile.mobile);
    });
  });

  describe('POST /api/mobiles', () => {
    it('should create new mobile with valid data', async () => {
      const res = await request(app)
        .post('/api/mobiles')
        .set('Authorization', `Bearer ${token}`)
        .send(testMobile);

      expect(res.statusCode).toBe(201);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.mobile).toBe(testMobile.mobile);
    });

    it('should return 400 for duplicate mobile', async () => {
      // 先创建一个手机
      await Mobile.create(testMobile);

      // 尝试创建相同的手机
      const res = await request(app)
        .post('/api/mobiles')
        .set('Authorization', `Bearer ${token}`)
        .send(testMobile);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('PUT /api/mobiles/:id', () => {
    it('should update existing mobile', async () => {
      // 先创建一个手机
      const mobile = await Mobile.create(testMobile);

      // 更新手机
      const res = await request(app)
        .put(`/api/mobiles/${mobile._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          disabled: true
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.disabled).toBe(true);
    });

    it('should return 404 for non-existent mobile', async () => {
      const nonExistentId = '60d21b4667d0d8992e610c85'; // 无效的ObjectId
      const res = await request(app)
        .put(`/api/mobiles/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          disabled: true
        });

      expect(res.statusCode).toBe(404);
    });
  });
});