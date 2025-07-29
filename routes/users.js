const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAdmin } = require('../middleware/roleCheck');

// 检查用户名是否存在
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ message: '用户名不能为空' });
    }

    const user = await User.findOne({ username });
    res.json({ exists: !!user });
  } catch (error) {
    console.error('检查用户名错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建新用户
router.post('/', isAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // 验证必要字段
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: '用户名已存在' });
    }

    // 创建新用户（密码应该在实际项目中进行哈希处理）
    const newUser = new User({
      username,
      password,
      role: role || 'user' // 默认角色为user
    });

    await newUser.save();
    res.status(201).json({ message: '用户创建成功', userId: newUser._id });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;