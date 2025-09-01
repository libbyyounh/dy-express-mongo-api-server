const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const moment = require('moment');
const Mobile = require('../models/Mobile');
const NodeCache = require('node-cache');

// 初始化缓存，设置过期时间为30秒
const cache = new NodeCache({ stdTTL: 30 });

// 创建购物卡集合模型的函数
const createShoppingCardModel = (mobile) => {
    const collectionName = `shoppingCard${mobile}`;
    const shoppingCardSchema = new mongoose.Schema({
        url: {
            type: String,
            required: true
        },
        remark: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            default: ''
        },
        disabled: {
            type: Boolean,
            default: false
        },
        createTime: {
            type: String,
            default: () => moment().format('YYYY-MM-DD HH:mm:ss')
        }
    });

    // 检查模型是否已存在
    if (mongoose.models[collectionName]) {
        return mongoose.models[collectionName];
    }

    return mongoose.model(collectionName, shoppingCardSchema, collectionName);
};

/**
 * @swagger
 * /api/shoppingCard/add:
 *   post:
 *     summary: Add a new shopping card URL
 *     tags: [ShoppingCard]
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
 *               - url
 *             properties:
 *               mobile:
 *                 type: string
 *               url:
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
router.post('/add', async (req, res) => {
    try {
        const { mobile, url, remark = '', title = '' } = req.body;

        if (!mobile || !url) {
            return res.status(400).json({ message: '手机号和URL为必填项' });
        }

        // 验证手机号是否存在且类型为B
        const mobileExists = await Mobile.findOne({ mobile, type: 'B' });
        if (!mobileExists) {
            return res.status(400).json({ message: '无效的手机号或该手机号类型不是B' });
        }

        // 创建或获取模型
        const ShoppingCardModel = createShoppingCardModel(mobile);

        // 检查集合是否存在，如果不存在则创建
        const collections = await mongoose.connection.db.listCollections({ name: `shoppingCard${mobile}` }).toArray();
        if (collections.length === 0) {
            await mongoose.connection.createCollection(`shoppingCard${mobile}`);
            console.log(`Created new collection: shoppingCard${mobile}`);
        }

        // 创建新条目
        const newItem = new ShoppingCardModel({
            url,
            remark,
            title
        });

        await newItem.save();

        res.status(201).json({
            message: 'URL添加成功',
            data: newItem
        });
    } catch (error) {
        console.error('Error adding shopping card URL:', error);
        res.status(500).json({ message: '服务器错误' });
    }
});

/**
 * @swagger
 * /api/shoppingCard/getByMobile:
 *   get:
 *     summary: Get shopping card URLs by mobile number
 *     tags: [ShoppingCard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mobile
 *         schema:
 *           type: string
 *         required: true
 *         description: Mobile number
 *     responses:
 *       200:
 *         description: List of URLs
 *       400:
 *         description: Invalid mobile
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Server error
 */
router.get('/getByMobile', async (req, res) => {
    try {
        const { mobile, id } = req.query;

        if (!mobile) {
            return res.status(400).json({ message: '手机号为必填项' });
        }

        // 验证手机号是否存在且类型为B
        const mobileExists = await Mobile.findOne({ mobile, type: 'B' });
        if (!mobileExists) {
            return res.status(400).json({ message: '无效的手机号或该手机号类型不是B' });
        }

        // 检查集合是否存在
        const collectionName = `shoppingCard${mobile}`;
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();

        if (collections.length === 0) {
            return res.status(404).json({ message: '未找到该手机号对应的购物卡集合' });
        }

        // 获取数据
        const ShoppingCardModel = createShoppingCardModel(mobile);

        if (id) {
            const cacheKey = `item_${mobile}_${id}`;
            // 从缓存中获取
            const cachedItem = cache.get(cacheKey);
            if (cachedItem) {
                return res.json(cachedItem);
            } 
            // 从数据库中获取
            const item = await ShoppingCardModel.findById(id);
            if (!item) {
                return res.status(404).json({ message: '未找到该ID对应的购物卡' });
            }
            return res.json(item);
        }

        const items = await ShoppingCardModel.find();

        res.json({
            headers: ['id', 'url', 'title', 'remark', 'createTime', 'disabled'],
            rows: items
        });
    } catch (error) {
        console.error('Error getting shopping card URLs:', error);
        res.status(500).json({ message: '服务器错误' });
    }
});

/**
 * @swagger
 * /api/shoppingCard/delete:
 *   post:
 *     summary: Delete shopping card URLs
 *     tags: [ShoppingCard]
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
 *               - ids
 *             properties:
 *               mobile:
 *                 type: string
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: URLs deleted successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/delete', async (req, res) => {
    try {
        const { mobile, ids } = req.body;

        if (!mobile || !ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: '手机号和ID数组为必填项' });
        }

        // 验证手机号是否存在且类型为B
        const mobileExists = await Mobile.findOne({ mobile, type: 'B' });
        if (!mobileExists) {
            return res.status(400).json({ message: '无效的手机号或该手机号类型不是B' });
        }

        // 检查集合是否存在
        const collectionName = `shoppingCard${mobile}`;
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();

        if (collections.length === 0) {
            return res.status(404).json({ message: '未找到该手机号对应的购物卡集合' });
        }

        // 删除数据
        const ShoppingCardModel = createShoppingCardModel(mobile);
        const result = await ShoppingCardModel.deleteMany({ _id: { $in: ids } });

        res.json({
            message: `成功删除${result.deletedCount}条数据`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error deleting shopping card URLs:', error);
        res.status(500).json({ message: '服务器错误' });
    }
});

/**
 * @swagger
 * /api/shoppingCard/updateDisabled:
 *   post:
 *     summary: Update disabled status of shopping card URLs
 *     tags: [ShoppingCard]
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
 *               - ids
 *               - disabled
 *             properties:
 *               mobile:
 *                 type: string
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               disabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/updateDisabled', async (req, res) => {
    try {
        const { mobile, ids, disabled } = req.body;

        if (!mobile || !ids || !Array.isArray(ids) || ids.length === 0 || disabled === undefined) {
            return res.status(400).json({ message: '手机号、ID数组和disabled状态为必填项' });
        }

        // 验证手机号是否存在且类型为B
        const mobileExists = await Mobile.findOne({ mobile, type: 'B' });
        if (!mobileExists) {
            return res.status(400).json({ message: '无效的手机号或该手机号类型不是B' });
        }

        // 检查集合是否存在
        const collectionName = `shoppingCard${mobile}`;
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();

        if (collections.length === 0) {
            return res.status(404).json({ message: '未找到该手机号对应的购物卡集合' });
        }

        // 更新数据
        const ShoppingCardModel = createShoppingCardModel(mobile);
        const result = await ShoppingCardModel.updateMany(
            { _id: { $in: ids } },
            { $set: { disabled } }
        );

        res.json({
            message: `成功更新${result.modifiedCount}条数据的状态`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error updating shopping card status:', error);
        res.status(500).json({ message: '服务器错误' });
    }
});

module.exports = router;