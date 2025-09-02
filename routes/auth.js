const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const moment = require('moment');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/getToken:
 *   post:
 *     summary: Get JWT token by username and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 expiresIn:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
router.post('/getToken', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user);
    
    res.json({
      token,
      expiresIn: process.env.JWT_EXPIRES_IN
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login authentication
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 expiresIn:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
// 合并重复的登录逻辑为公共函数
const handleLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Check if user is disabled
    if (user.disabled) {
      return res.status(401).json({ message: 'Account is disabled.' });
    }

    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    // 使用原子操作更新最后登录时间，减少写操作
    await User.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );
    
    const token = generateToken(user);
    res.json({ token, expiresIn: process.env.JWT_EXPIRES_IN, userInfo: { username: user.username, role: user.role, userId: user._id } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// 保留一个接口，删除重复定义
router.post('/login', handleLogin);
router.post('/getToken', handleLogin); // 或直接删除此路由

// 在文件底部添加新接口
/**
 * @swagger
 * /api/generateAPIToken:
 *   get:
 *     summary: Generate API token for API role user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: 
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/generateAPIToken', authenticateToken, async (req, res) => {
  try {
    // 检查是否已有role=API的用户
    let apiUser = await User.findOne({ role: 'API', username: 'API' });
    
    if (!apiUser) {
      // 创建随机密码
      const randomPassword = crypto.randomBytes(16).toString('hex');
      
      // 创建API用户
      apiUser = new User({
        username: 'API',
        password: randomPassword,
        role: 'API'
      });
      
      await apiUser.save();
      console.log('Created API user with random password');
    }
    
    // 生成token
    const token = generateToken(apiUser);
    
    res.json({ token, expiresIn: process.env.JWT_EXPIRES_IN });
  } catch (error) {
    console.error('Generate API token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/generate-api-credentials:
 *   post:
 *     summary: Generate API credentials (key and secret)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API credentials generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKey:
 *                   type: string
 *                 apiSecret:
 *                   type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/generate-api-credentials', authenticateToken, async (req, res) => {
  try {
    // 获取当前用户
    const user = await User.findById(req.user._id);
    
    // 检查用户是否为管理员
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Admin users cannot generate API credentials' });
    }
    
    // 生成 API 凭证
    const { apiKey, apiSecret } = user.generateApiCredentials();
    
    // 保存用户文档
    await user.save();
    
    res.json({
      apiKey,
      apiSecret,
      message: 'API credentials generated successfully. Please save the secret as it will not be shown again.'
    });
  } catch (error) {
    console.error('Generate API credentials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
