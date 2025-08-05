const express = require('express');
const router = express.Router();
const { authenticateToken, generateShortToken } = require('../middleware/auth');
const User = require('../models/User');
const axios = require('axios');
const mongoose = require('mongoose');
const pLimit = require('p-limit'); // 添加并发控制依赖
const NodeCache = require('node-cache'); // 引入缓存依赖
const rateLimit = require('express-rate-limit');

// 初始化缓存，设置过期时间为30秒
const cache = new NodeCache({ stdTTL: 30 });

// 设置并发限制（根据实际情况调整）
// 设置并发限制（降低为5个）
const concurrencyLimit = 5; // 允许5个并发任务
const limit = pLimit(concurrencyLimit);

// 任务队列和处理状态
const taskQueue = [];
let processingTasks = new Set();

// 创建 axios 实例并配置超时
const axiosInstance = axios.create({ timeout: 10000 }); // 基础配置，不含重试

// 开发环境下的mock配置
const isDevEnvironment = process.env.NODE_ENV === 'development' && process.env.ENABLE_MOCK === 'true';

// 添加重试拦截器和mock功能
if (isDevEnvironment) {
  console.log('开发环境下启用API Mock功能');
  // 替换axios实例的delete和post方法
  const originalDelete = axiosInstance.delete;
  const originalPost = axiosInstance.post;

  axiosInstance.delete = async function(url, config) {
    // 检查是否是需要mock的Hamibot API
    if (url.includes('api.hamibot.com/v1/scripts')) {
      console.log(`Mock DELETE 请求: ${url}`);
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 100));
      // 返回模拟的成功响应
      return { status: 204, data: { success: true, message: 'Mock: 任务已停止' } };
    }
    // 非Hamibot API请求保持原样
    return originalDelete.call(this, url, config);
  };

  axiosInstance.post = async function(url, data, config) {
    // 检查是否是需要mock的Hamibot API
    if (url.includes('api.hamibot.com/v1/scripts')) {
      console.log(`Mock POST 请求: ${url}`);
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 100));
      // 返回模拟的成功响应
      return { status: 204, data: { success: true, message: 'Mock: 任务已启动' } };
    }
    // 非Hamibot API请求保持原样
    return originalPost.call(this, url, data, config);
  };
} else {
  // 生产环境下的配置
  axiosInstance.defaults.retry = 5; // 最多重试5次
  axiosInstance.defaults.retryDelay = 1000; // 重试间隔1秒

  // 添加重试拦截器
  axiosInstance.interceptors.response.use(null, async (error) => {
    const config = error.config;
    // 如果没有配置重试或已经超过重试次数，则直接返回错误
    if (!config.retry || config.currentRetry >= config.retry) {
      return Promise.reject(error);
    }

    // 增加重试计数
    config.currentRetry = (config.currentRetry || 0) + 1;

    // 对于 429 错误，使用指数退避策略
    let retryDelay = config.retryDelay;
    if (error.response && error.response.status === 429) {
      // 指数退避: 1s, 2s, 4s, ...
      retryDelay = Math.pow(2, config.currentRetry - 1) * 1000;
      console.log(`请求过于频繁，将在 ${retryDelay}ms 后重试`);
    }

    // 等待一段时间后重试
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    // 重试请求
    return axiosInstance(config);
  });
}

// Get current date collection name (YYYYMMDD)
const getDailyCollectionName = () => {
  const date = new Date();
  return date.getFullYear().toString() +
         (date.getMonth() + 1).toString().padStart(2, '0') +
         date.getDate().toString().padStart(2, '0');
};

// 优化的任务处理函数
const processTask = async (task) => {
  if (processingTasks.has(task.id)) return;

  processingTasks.add(task.id);
  try {
    console.log('running taskQueue index:' + task.index);
    // stop current task first
    const resStop = await axiosInstance.delete(
      `https://api.hamibot.com/v1/scripts/${process.env.HAMIBOT_SCRIPT_ID}/run`,
      {
        headers: {
          'authorization': `${process.env.HAMIBOT_TOKEN}`
        },
        data: {
          devices: [{
            _id: process.env.HAMIBOT_DEVICE_ID,
            name: process.env.HAMIBOT_DEVICE_NAME
          }],
          vars: {
            remoteUrl: task.data.url,
            speed: task.speed
          }
        }
      }
    );
    if (!resStop || resStop.status !== 204) {
      throw new Error(`Hamibot API调用停止失败: ${resStop ? resStop.status : '无响应'}`);
    }
    console.log('stop Hamibot task success');

    // 添加延迟，避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Call Hamibot API
    const response = await axiosInstance.post(
      `https://api.hamibot.com/v1/scripts/${process.env.HAMIBOT_SCRIPT_ID}/run`,
      {
        devices: [{
          _id: process.env.HAMIBOT_DEVICE_ID,
          name: process.env.HAMIBOT_DEVICE_NAME
        }],
        vars: {
          remoteUrl: task.data.url,
          speed: task.speed
        }
      },
      {
        headers: {
          'authorization': `${process.env.HAMIBOT_TOKEN}`
        }
      }
    );
    
    if (!response || response.status !== 204) {
      throw new Error(`Hamibot API调用执行失败: ${response ? response.status : '无响应'}`);
    }
    console.log('run Hamibot task success');

    task.startTime = Date.now(); // 记录任务开始时间

    // Update task status
    task.status = 'completed';
    task.result = resStop.data;

    // Directly update database
    const collectionName = getDailyCollectionName();
    const Collection = mongoose.connection.collection(collectionName);
    await Collection.updateOne(
      { _id: new mongoose.Types.ObjectId(task.data._id) },
      { $set: { isUsed: true } }
    );

  } catch (error) {
    task.status = 'failed';
    task.error = error.message;
    console.error(`[任务 ${task.id}] 执行失败: ${error.message}`, error.stack);
  } finally {
    processingTasks.delete(task.id);
    // 从队列中移除完成的任务
    const index = taskQueue.findIndex(t => t.id === task.id);
    if (index !== -1) {
      taskQueue.splice(index, 1);
    }
  }
};

// 优化的队列处理函数
const processTaskQueue = () => {
  // 确保 pLimit 已加载
  if (!limit) {
    console.warn('p-limit not loaded yet, retrying in 100ms');
    setTimeout(processTaskQueue, 100);
    return;
  }

  // 只处理等待中的任务
  const pendingTasks = taskQueue.filter(task => task.status === 'pending');

  if (pendingTasks.length === 0) return;

  // 串行处理任务，但添加延迟
  const processNextTask = async (index) => {
    if (index >= pendingTasks.length) {
      // 所有任务处理完毕，检查是否有新任务
      setTimeout(processTaskQueue, 100);
      return;
    }

    // 记录任务开始时间
    const startTime = Date.now();
    await limit(() => processTask(pendingTasks[index]));
    // 计算任务实际执行时间
    const executionTime = Date.now() - startTime;
    // 计算需要等待的剩余时间（任务delay减去实际执行时间）
    const waitTime = Math.max(0, (pendingTasks[index].delay || 0) - executionTime);
    console.log(`任务 ${pendingTasks[index].id} 已经开始执行，等待 ${waitTime}ms 后执行下一个任务`);
    // 等待剩余时间
    await new Promise(resolve => setTimeout(resolve, waitTime));
    processNextTask(index + 1);
  };

  processNextTask(0);

  // 移除或注释掉这段并行处理的代码
  /*
  // 并行处理任务，但受并发限制
  const promises = pendingTasks.map(task => limit(() => processTask(task)));

  Promise.allSettled(promises).then(() => {
    // 如果还有任务，继续处理
    if (taskQueue.some(task => task.status === 'pending')) {
      processTaskQueue();
    }
  });
  */
};

// Execute Hamibot script
router.post('/hamibot/execute', authenticateToken, async (req, res) => {
  try {
    const { mobile, speed, delay } = req.body;
    const collectionName = getDailyCollectionName();
    const cacheKey = `data_${collectionName}_${mobile}`;

    // 尝试从缓存获取数据
    let dataItems = cache.get(cacheKey);

    if (!dataItems) {
      // 缓存未命中，查询数据库
      const Collection = mongoose.connection.collection(collectionName);
      dataItems = await Collection.find({
        mobile: mobile,
        isUsed: false,
        disabled: false
      }).toArray();

      // 存入缓存
      cache.set(cacheKey, dataItems);
    }

    if (dataItems.length === 0) {
      return res.status(404).json({ message: 'No data found for the given mobile' });
    }

    // Create tasks in queue
    const taskIds = dataItems.map((item, index) => {
      const taskId = `task_${Date.now()}_${index}`;
      const task = {
        index: index,
        id: taskId,
        mobile: mobile,
        speed: speed,
        delay: delay,
        data: item,
        status: 'pending',
        createdAt: new Date(),
        res: res
      };
      taskQueue.push(task);
      return taskId;
    });

    // Start processing queue
    processTaskQueue();

    res.status(202).json({
      message: `Task queue created with ${dataItems.length} items. Collection: ${collectionName}`,
      taskIds: taskIds
    });

  } catch (error) {
    res.status(500).json({ message: 'Error executing Hamibot script', error: error.message });
  }
});

// Stop all tasks
router.post('/hamibot/stop', authenticateToken, async (req, res) => {
  try {
    // Clear task queue and stop processing
    taskQueue.length = 0;
    processingTasks.clear();
    // stop current task first
    const response = await axiosInstance.delete(
      `https://api.hamibot.com/v1/scripts/${process.env.HAMIBOT_SCRIPT_ID}/run`,
      {
        headers: {
          'authorization': `${process.env.HAMIBOT_TOKEN}`
        },
        data: {
          devices: [{
            _id: process.env.HAMIBOT_DEVICE_ID,
            name: process.env.HAMIBOT_DEVICE_NAME
          }]
        }
      }
    );
    if (!response || response.status !== 204) {
      throw new Error(`Hamibot API调用停止失败: ${response ? response.status : '无响应'}`);
    }
    res.json({ message: '所有任务已成功停止' });
    console.log('all tasks stopped');
  } catch (error) {
    res.status(500).json({ message: '停止任务失败', error: error.message });
  }
});

// Get execution logs
router.get('/hamibot/log', authenticateToken, (req, res) => {
  res.json({
    isProcessing: processingTasks.size > 0,
    queueLength: taskQueue.length,
    processingCount: processingTasks.size,
    tasks: taskQueue.map(task => ({
      id: task.id,
      mobile: task.mobile,
      status: task.status,
      createdAt: task.createdAt,
      error: task.error
    }))
  });
});

// 添加任务队列清理函数
function clearTaskQueue() {
  taskQueue.length = 0;
  processingTasks.clear();
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制100个并发请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后再试' }
});

// 为所有URLs接口应用限流
router.use(apiLimiter);
module.exports = { router, clearTaskQueue };
