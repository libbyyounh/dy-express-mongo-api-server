const express = require('express');
const router = express.Router();
const Mobile = require('../models/Mobile');
// 导入node-cache模块
const NodeCache = require('node-cache');
// 创建缓存实例，设置默认过期时间为5分钟(300000毫秒)
const cache = new NodeCache({ stdTTL: 300 });

/**
 * @swagger
 * /api/mobiles:
 *   get:
 *     summary: Get all mobile numbers
 *     tags: [Mobiles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of mobile numbers
 *       500:
 *         description: Server error
 */
router.get('/mobiles', async (req, res) => {
  try {
    // 尝试从缓存获取数据
    const cacheKey = 'all_mobiles';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      // 如果缓存存在，直接返回缓存数据
      return res.json(cachedData);
    }

    // 缓存不存在，从数据库获取数据
    const mobiles = await Mobile.find();
    
    // 将数据存入缓存
    cache.set(cacheKey, mobiles);
    
    res.json(mobiles);
  } catch (error) {
    console.error('Error getting mobiles:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/mobiles:
 *   post:
 *     summary: Add a new mobile number
 *     tags: [Mobiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobile
 *             properties:
 *               mobile:
 *                 type: string
 *               disabled:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Mobile number added successfully
 *       400:
 *         description: Invalid input or duplicate mobile
 *       500:
 *         description: Server error
 */
router.post('/mobiles', async (req, res) => {
  try {
    const { mobile, disabled = false } = req.body;
    
    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    
    // Check if mobile already exists
    const existingMobile = await Mobile.findOne({ mobile });
    if (existingMobile) {
      return res.status(400).json({ message: 'Mobile number already exists' });
    }
    
    const newMobile = new Mobile({
      mobile,
      disabled
    });
    
    await newMobile.save();
    
    res.status(201).json({
      message: 'Mobile number added successfully',
      data: newMobile
    });
  } catch (error) {
    console.error('Error adding mobile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/mobiles/{id}:
 *   put:
 *     summary: Update a mobile number
 *     tags: [Mobiles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mobile ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mobile:
 *                 type: string
 *               disabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Mobile number updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Mobile not found
 *       500:
 *         description: Server error
 */
router.put('/mobiles/:id', async (req, res) => {
  try {
    const { mobile, disabled } = req.body;
    const { id } = req.params;
    
    // Check if mobile exists
    const existingMobile = await Mobile.findById(id);
    if (!existingMobile) {
      return res.status(404).json({ message: 'Mobile number not found' });
    }
    
    // If mobile number is being changed, check for duplicates
    if (mobile && mobile !== existingMobile.mobile) {
      const duplicateMobile = await Mobile.findOne({ mobile });
      if (duplicateMobile) {
        return res.status(400).json({ message: 'Mobile number already exists' });
      }
      existingMobile.mobile = mobile;
    }
    
    // Update disabled status if provided
    if (disabled !== undefined) {
      existingMobile.disabled = disabled;
    }
    
    await existingMobile.save();
    
    res.json({
      message: 'Mobile number updated successfully',
      data: existingMobile
    });
  } catch (error) {
    console.error('Error updating mobile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
