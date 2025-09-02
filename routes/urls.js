const express = require('express');
const mongoose = require('mongoose'); // 添加mongoose导入
const router = express.Router();
const moment = require('moment');
const Mobile = require('../models/Mobile');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5分钟缓存
// 加载环境变量
require('dotenv').config();

// 从环境变量获取配置，提供默认值
const MAX_COLLECTIONS = parseInt(process.env.MAX_COLLECTIONS) || 14;
const URLS_PER_MOBILE = parseInt(process.env.URLS_PER_MOBILE) || 6;
const URLS_PER_MOBILE_B = parseInt(process.env.URLS_PER_MOBILE_B) || 6; // 新增B类型限制

const { createUrlModel, getTodayCollectionName, getTomorrowCollectionName, createDailyCollection } = require('../utils/dbSetup');

/**
 * @swagger
 * /api/postUrl:
 *   post:
 *     summary: Add a new URL to today's collection
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               type:
 *                 type: string
 *                 enum: [A, B]
 *                 default: A
 *               mobile:
 *                 type: string
 *               remark:
 *                 type: string
 *     responses:
 *       201:
 *         description: URL added successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
// 找到/postUrl接口的实现部分，确保以下代码正确处理mobile参数
router.post('/postUrl', async (req, res) => {
  try {
    const { url, type = 'A', mobile, remark = '' } = req.body; // 获取mobile和remark参数

    if (!url) {
      return res.status(400).json({ message: 'Valid URL is required' });
    }

    // 验证type值
    if (!['A', 'B'].includes(type)) {
      return res.status(400).json({ message: 'Invalid type. Must be A or B' });
    }

    // 如果提供了mobile，验证该手机号是否存在
    let targetMobile = null;
    if (mobile) {
      targetMobile = await Mobile.findOne({ mobile, disabled: false, type });
      if (!targetMobile) {
        return res.status(400).json({ message: `无效的手机号或该手机号类型不是${type}` });
      }
    }

    // 获取所有日期命名的集合并按日期排序
    const collections = await mongoose.connection.db.listCollections().toArray();
    const dateCollections = collections
      .filter(col => /^\d{8}$/.test(col.name))
      .map(col => ({ name: col.name, date: moment(col.name, 'YYYYMMDD') }))
      .filter(col => col.date.isValid())
      .sort((a, b) => a.date.diff(b.date));

    // 检查是否已达到最大集合限制
    if (dateCollections.length >= MAX_COLLECTIONS) {
      return res.status(400).json({
        message: `已达到最大集合限制（${MAX_COLLECTIONS}个），不能再添加URL。请清理旧集合后再试。`
      });
    }

    // 如果没有提供mobile，获取活跃的手机号
    let mobiles = [];
    if (!mobile) {
      // 从缓存获取活跃手机号
      mobiles = cache.get(`active_mobiles_${type}`);
      if (!mobiles) {
        mobiles = await Mobile.find({ disabled: false, type });
        cache.set(`active_mobiles_${type}`, mobiles); // 缓存结果
      }
      if (mobiles.length === 0) {
        return res.status(500).json({ message: `No active mobile numbers available for type ${type}` });
      }
    }

    // 确定使用的限制常量
    const urlsPerMobile = type === 'A' ? URLS_PER_MOBILE : URLS_PER_MOBILE_B;

    // 逐级查找下一个可用的集合（今天→明天→后天...）
    let currentDate = moment();
    let collectionName, UrlModel, count;
    let foundAvailableCollection = false;
    const maxDaysToCheck = MAX_COLLECTIONS - dateCollections.length;

    // 最多检查未来maxDaysToCheck天（确保不超过最大集合限制）
    for (let i = 0; i < maxDaysToCheck; i++) {
      collectionName = currentDate.format('YYYYMMDD');

      // 检查集合是否存在
      const collectionExists = dateCollections.some(col => col.name === collectionName);

      if (!collectionExists) {
        // 创建新集合
        UrlModel = createUrlModel(collectionName);
        await mongoose.connection.createCollection(collectionName);
        console.log(`Created new collection: ${collectionName}`);
        count = 0;
        foundAvailableCollection = true;
        break;
      } else {
        // 集合已存在，检查是否有空间
        UrlModel = createUrlModel(collectionName);
        // 只统计相同type的URL数量
        count = await UrlModel.countDocuments({ type });

        // 如果提供了mobile，只需检查该mobile是否还有名额
        if (mobile) {
          const mobileCount = await UrlModel.countDocuments({ type, mobile });
          if (mobileCount < urlsPerMobile) {
            foundAvailableCollection = true;
            break;
          }
        } else if (count < mobiles.length * urlsPerMobile) {
          // 找到有空间的集合
          foundAvailableCollection = true;
          break;
        }
      }

      // 当前日期集合已满，检查下一天
      currentDate.add(1, 'day');
    }

    if (!foundAvailableCollection) {
      return res.status(400).json({
        message: `所有可用集合都已满，不能再添加type=${type}的URL。请清理旧集合后再试。`
      });
    }

    // 确定要使用的手机号
    let selectedMobile;
    if (mobile) {
      selectedMobile = mobile; // 如果提供了mobile，直接使用
    } else {
      // 每urlsPerMobile个条目轮换一次
      const mobileIndex = Math.floor(count / urlsPerMobile) % mobiles.length;
      selectedMobile = mobiles[mobileIndex].mobile;
    }
    const mobileCount = await UrlModel.countDocuments({ type, mobile: selectedMobile });

    // 创建新URL条目，包含type和remark
    const newUrl = new UrlModel({
      url,
      mobile: selectedMobile,
      type,
      remark,
      createTime: moment().format('YYYY-MM-DD HH:mm:ss'),
      createByUserId: req.user._id
    });

    await newUrl.save();

    res.status(201).json({
      message: `URL added successfully, collection: ${collectionName}, totalCount: ${count + 1}. Mobile: ${selectedMobile}, mobileCount: ${mobileCount + 1}`,
      data: newUrl
    });
  } catch (error) {
    console.error('Error adding URL:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/getUrl:
 *   get:
 *     summary: Get first matching URL from today's collection
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mobile
 *         schema:
 *           type: string
 *         description: Optional mobile number filter
 *     responses:
 *       200:
 *         description: Matching URL found
 *       404:
 *         description: No matching URL found
 *       500:
 *         description: Server error
 */
router.get('/getUrl', async (req, res) => {
  try {
    const { mobile, type } = req.query;
    const collectionName = getTodayCollectionName();
    const UrlModel = createUrlModel(collectionName);
    
    // Build query
    const query = { isUsed: false, disabled: false };
    if (mobile) {
      query.mobile = mobile;
    }
    if (type) {
      query.type = type;
    }
    
    // Find first matching URL
    const urlData = await UrlModel.findOne(query);
    
    if (!urlData) {
      return res.status(404).json({ message: 'No matching URL found' });
    }
    
    res.json(urlData);
  } catch (error) {
    console.error('Error getting URL:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/getAllUrl:
 *   get:
 *     summary: Get all matching URLs from today's collection
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mobile
 *         schema:
 *           type: string
 *         description: Optional mobile number filter
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Optional type filter
 *     responses:
 *       200:
 *         description: List of matching URLs
 *       500:
 *         description: Server error
 */
router.get('/getAllUrl', async (req, res) => {
  try {
    const { mobile, type } = req.query;
    const collectionName = getTodayCollectionName();
    const UrlModel = createUrlModel(collectionName);
    
    // Build query
    const query = { isUsed: false, disabled: false };
    if (mobile) {
      query.mobile = mobile;
    }
    if (type) {
      query.type = type;
    }
    
    // Find all matching URLs
    const urls = await UrlModel.find(query);
    
    res.json(urls);
  } catch (error) {
    console.error('Error getting all URLs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/updateUsed:
 *   put:
 *     summary: Update URL's isUsed status
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - isUsed
 *             properties:
 *               id:
 *                 type: string
 *               isUsed:
 *                 type: boolean
 *                 default: false
 *                 description: "New value for isUsed status (default: false)"
 *     responses:
 *       200:
 *         description: URL updated successfully
 *       404:
 *         description: URL not found
 *       500:
 *         description: Server error
 */
router.put('/updateUsed', async (req, res) => {
  try {
    const { id, isUsed } = req.body;
    
    if (id === undefined || isUsed === undefined) {
      return res.status(400).json({ message: 'ID and isUsed status are required' });
    }
    
    const collectionName = getTodayCollectionName();
    const UrlModel = createUrlModel(collectionName);
    
    const urlData = await UrlModel.findByIdAndUpdate(
      id,
      { isUsed },
      { new: true, runValidators: true }
    );
    
    if (!urlData) {
      return res.status(404).json({ message: 'URL not found' });
    }
    
    res.json({
      message: 'URL updated successfully',
      data: urlData
    });
  } catch (error) {
    console.error('Error updating URL used status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/updateUrl:
 *   put:
 *     summary: Update URL and reset isUsed to false
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - url
 *             properties:
 *               id:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: URL updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: URL not found
 *       500:
 *         description: Server error
 */
router.put('/updateUrl', async (req, res) => {
  try {
    const { id, url } = req.body;
    
    if (!id || !url || !url.startsWith('http')) {
      return res.status(400).json({ message: 'Valid ID and URL are required' });
    }
    
    const collectionName = getTodayCollectionName();
    const UrlModel = createUrlModel(collectionName);
    
    const urlData = await UrlModel.findByIdAndUpdate(
      id,
      { url, isUsed: false },
      { new: true, runValidators: true }
    );
    
    if (!urlData) {
      return res.status(404).json({ message: 'URL not found' });
    }
    
    res.json({
      message: 'URL updated successfully',
      data: urlData
    });
  } catch (error) {
    console.error('Error updating URL:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/table: 
 *   get:
 *     summary: Get URL collection data by date
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: YYYYMMDD
 *         required: true
 *         description: Date in YYYYMMDD format to query
 *     responses:
 *       200:
 *         description: Table data with headers and rows
 *       400:
 *         description: Invalid date format
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Server error
 */
router.get('/table', async (req, res) => {
  try {
    const { date } = req.query;
    // Validate date format
    if (!/^\d{8}$/.test(date)) {
      return res.status(400).json({
        message: 'Invalid date format. Please use YYYYMMDD'
      });
    }

    // Check if collection exists
    const collectionName = date;
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({
        message: `Collection for date ${date} not found`
      });
    }

    // Get table data
    const UrlModel = createUrlModel(collectionName);
    const query = {};
    // 非管理员角色
    if (req.user.role !== 'admin') {
      // 修改查询条件，过滤createByUserId等于当前用户ID或为空的记录
      query.$or = [
        { createByUserId: req.user._id },
        { createByUserId: '' }
      ];
    }
    // 获取数据
    const rows = await UrlModel.find(query);

    // Get headers from the first document
    const headers = rows.length > 0 ? Object.keys(rows[0]._doc) : [];
    // Remove _id and __v from headers
    const filteredHeaders = headers.filter(header => !['_id', '__v', 'createByUserId'].includes(header));

    res.json({
      headers: filteredHeaders,
      rows: rows.map(row => {
        const rowData = { ...row._doc };
        delete rowData.__v;
        return rowData;
      })
    });
  } catch (error) {
    console.error('Error getting table data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
/**
 * @swagger
 * /api/batch/delete: 
 *   post:
 *     summary: Batch delete URLs by IDs
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - ids
 *             properties:
 *               date:
 *                 type: string
 *                 format: YYYYMMDD
 *                 description: Date of collection
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of URL IDs to delete
 *     responses:
 *       200:
 *         description: URLs deleted successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Server error
 */
router.post('/batch/delete', async (req, res) => {
  try {
    const { date, ids } = req.body;

    // Validate input
    if (!date || !/^\d{8}$/.test(date)) {
      return res.status(400).json({ message: 'Valid date (YYYYMMDD) is required' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Array of IDs is required' });
    }

    // Check if collection exists
    const collectionName = date;
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({ message: `Collection for date ${date} not found` });
    }

    // Delete documents
    const UrlModel = createUrlModel(collectionName);
    const result = await UrlModel.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} URLs deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error batch deleting URLs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/batch/update-used:
 *   post:
 *     summary: Batch update isUsed status
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - ids
 *             properties:
 *               date:
 *                 type: string
 *                 format: YYYYMMDD
 *                 description: Date of collection
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of URL IDs to update
 *               isUsed:
 *                 type: boolean
 *                 default: false
 *                 description: "New value for isUsed status (default: false)"
 *     responses:
 *       200:
 *         description: URLs updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Server error
 */
router.post('/batch/update-used', async (req, res) => {
  try {
    const { date, ids, isUsed = false } = req.body;

    // Validate input
    if (!date || !/^\d{8}$/.test(date)) {
      return res.status(400).json({ message: 'Valid date (YYYYMMDD) is required' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Array of IDs is required' });
    }

    // Check if collection exists
    const collectionName = date;
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({ message: `Collection for date ${date} not found` });
    }

    // Update documents
    const UrlModel = createUrlModel(collectionName);
    const result = await UrlModel.updateMany(
      { _id: { $in: ids } },
      { $set: { isUsed } }
    );

    res.json({
      message: `${result.modifiedCount} URLs updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error batch updating URLs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// 全局API限流 - 100并发/分钟
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 限制100个并发请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后再试' }
});

// 为所有URLs接口应用限流
router.use(apiLimiter);
module.exports = router;
