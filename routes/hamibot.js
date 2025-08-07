const express = require('express');
const router = express.Router();
const { authenticateToken, generateShortToken } = require('../middleware/auth');
const User = require('../models/User');
const axios = require('axios');
const mongoose = require('mongoose');
const pLimit = require('p-limit'); // 添加并发控制依赖
const NodeCache = require('node-cache'); // 引入缓存依赖
const rateLimit = require('express-rate-limit');
const Task = require('../models/Task'); // 导入新创建的Task模型
const {getTodayCollectionName} = require('../utils/dbSetup')

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

// 初始化缓存，设置过期时间为30秒
const cache = new NodeCache({ stdTTL: 30 });

// 设置并发限制（根据实际情况调整）
// 设置并发限制（降低为5个）
const concurrencyLimit = 5; // 允许5个并发任务
const limit = pLimit(concurrencyLimit);

// 任务队列和处理状态
// 移除内存中的任务队列和处理状态
// const taskQueue = [];
// let processingTasks = new Set();

// 工作进程ID，用于锁定任务
const workerId = `worker_${process.env.PROCESS_ID || Math.random().toString(36).substr(2, 9)}`;

// 优化的任务处理函数
const processTask = async (task) => {
  try {
    console.log(`处理任务: ${task.taskId}, 手机号: ${task.mobile}`);

    // 停止当前任务
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
            remoteUrl: task.dataUrl,
            speed: task.speed
          }
        }
      }
    );

    if (!resStop || resStop.status !== 204) {
      throw new Error(`Hamibot API调用停止失败: ${resStop ? resStop.status : '无响应'}`);
    }
    console.log('停止Hamibot任务成功');

    // 添加延迟，避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 调用Hamibot API启动任务
    const response = await axiosInstance.post(
      `https://api.hamibot.com/v1/scripts/${process.env.HAMIBOT_SCRIPT_ID}/run`,
      {
        devices: [{
          _id: process.env.HAMIBOT_DEVICE_ID,
          name: process.env.HAMIBOT_DEVICE_NAME
        }],
        vars: {
          remoteUrl: task.dataUrl,
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
    console.log('启动Hamibot任务成功');

    // 更新任务状态为已完成
    await Task.findByIdAndUpdate(task._id, {
      status: 'completed',
      completedAt: new Date(),
      lockedBy: null,
      lockedAt: null
    });

    // 更新数据状态
    const Collection = mongoose.connection.collection(task.collectionName);
    await Collection.updateOne(
      { _id: task.dataId },
      { $set: { isUsed: true } }
    );

    // 检查是否所有任务都已完成
    const allTasksCompleted = await Task.areAllTasksCompleted();
    if (allTasksCompleted) {
      console.log('所有任务已完成，正在解锁并清空任务表');
      // 解锁所有任务（以防有锁定的任务）
      await Task.unlockAllTasks();
      // 清空任务表（生产环境中可根据需求决定是否启用）
      await Task.clearAllTasks(true); // 谨慎使用
    }

  } catch (error) {
    console.error(`[任务 ${task.taskId}] 执行失败: ${error.message}`, error.stack);

    // 更新任务状态为失败
    await Task.findByIdAndUpdate(task._id, {
      status: 'failed',
      error: error.message,
      lockedBy: null,
      lockedAt: null
    });
  }
};

// 优化的队列处理函数
let taskPollInterval = null; // 轮询定时器引用
let noTaskCount = 0; // 连续无任务计数
const MAX_NO_TASK_COUNT = 10; // 最大无任务计数修改为10
const BASE_POLL_INTERVAL = 15000; // 基础轮询间隔(ms)
const MAX_POLL_INTERVAL = 60000; // 最大轮询间隔(ms)

// 启动任务轮询
function startTaskPolling() {
  if (taskPollInterval) return; // 避免重复启动

  // 初始立即执行一次
  processTaskQueue();

  // 设置定时器，初始间隔为基础轮询间隔
  taskPollInterval = setInterval(processTaskQueue, BASE_POLL_INTERVAL);
}

// 停止任务轮询
function stopTaskPolling() {
  if (taskPollInterval) {
    clearInterval(taskPollInterval);
    taskPollInterval = null;
  }
}

const processTaskQueue = async () => {
  try {
    // 查找并锁定一个任务
    const task = await Task.findAndLockTask(workerId);

    if (!task) {
      // 没有可处理的任务
      noTaskCount++;
      console.log(`无任务可处理，已连续 ${noTaskCount} 次`);

      // 动态调整轮询间隔或停止轮询
      if (noTaskCount >= MAX_NO_TASK_COUNT) {
        // 达到最大无任务次数，完全停止轮询
        if (taskPollInterval) {
          console.log(`连续 ${noTaskCount} 次无任务，停止轮询`);
          stopTaskPolling();
        }
      } else if (noTaskCount >= 5 && taskPollInterval) { // 保持原有逻辑，但只在5-9次时调整间隔
        // 停止当前定时器
        clearInterval(taskPollInterval);
        // 计算新的轮询间隔（不超过最大限制）
        const newInterval = Math.min(BASE_POLL_INTERVAL * Math.pow(2, noTaskCount - 5), MAX_POLL_INTERVAL);
        console.log(`调整轮询间隔至: ${newInterval}ms`);
        // 设置新的定时器
        taskPollInterval = setInterval(processTaskQueue, newInterval);
      }
      return;
    }

    // 有任务可处理，重置无任务计数和轮询间隔
    noTaskCount = 0;
    if (!taskPollInterval) {
      // 如果轮询已停止，重新启动
      console.log('发现新任务，重新启动轮询');
      startTaskPolling();
    } else if (taskPollInterval !== BASE_POLL_INTERVAL) {
      // 恢复为基础轮询间隔
      clearInterval(taskPollInterval);
      taskPollInterval = setInterval(processTaskQueue, BASE_POLL_INTERVAL);
    }

    console.log(`锁定任务: ${task.taskId}`);

    // 更新任务开始时间
    await Task.findByIdAndUpdate(task._id, {
      startedAt: new Date()
    });

    // 获取任务数据
    const Collection = mongoose.connection.collection(task.collectionName);
    // 使用findOne替代findById
    const dataItem = await Collection.findOne({ _id: task.dataId });

    if (!dataItem) {
      console.error(`任务 ${task.taskId} 的数据项不存在`);
      await Task.releaseTaskLock(task._id, 'failed');
      return;
    }

    // 添加数据URL到任务对象
    task.dataUrl = dataItem.url;

    // 处理任务
    await processTask(task);

  } catch (error) {
    console.error('处理任务队列时出错:', error);
    // 发生错误时，尝试释放所有锁定的任务
    await Task.updateMany(
      { lockedBy: workerId },
      {
        $set: {
          lockedBy: null,
          lockedAt: null
        }
      }
    );
    // 发生错误时，增加轮询间隔
    if (taskPollInterval) {
      clearInterval(taskPollInterval);
      taskPollInterval = setInterval(processTaskQueue, MAX_POLL_INTERVAL);
    }
  }
};

// 启动任务处理队列
startTaskPolling();

// Execute Hamibot script
router.post('/hamibot/execute', authenticateToken, async (req, res) => {
  try {
    const { mobile, speed, delay } = req.body;
    const collectionName = getTodayCollectionName();
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

    // 创建任务并保存到数据库
    const tasks = [];
    for (let i = 0; i < dataItems.length; i++) {
      const item = dataItems[i];
      const taskId = `task_${Date.now()}_${i}`;

      const task = new Task({
        taskId: taskId,
        mobile: mobile,
        speed: speed,
        delay: delay,
        dataId: item._id,
        collectionName: collectionName
      });

      await task.save();
      tasks.push(taskId);
    }
    
    // 确保轮询已启动
    if (!taskPollInterval) {
      console.log('创建新任务，启动轮询');
      startTaskPolling();
    }

    res.status(202).json({
      message: `Task queue created with ${dataItems.length} items. Collection: ${collectionName}`,
      collectionName: collectionName,
      taskIds: tasks
    });

  } catch (error) {
    res.status(500).json({ message: 'Error executing Hamibot script', error: error.message });
  }
});

// Stop all tasks
router.post('/hamibot/stop', authenticateToken, async (req, res) => {
  try {
    const { mobile } = req.body;

    if (mobile) {
      // 停止指定手机号的所有任务
      await Task.stopTasksByMobile(mobile);
      console.log(`已停止手机号 ${mobile} 的所有任务`);
    } else {
      // 停止所有任务
      await Task.updateMany(
        { status: { $in: ['pending', 'processing'] } },
        {
          $set: {
            status: 'stopped',
            lockedBy: null,
            lockedAt: null
          }
        }
      );
      console.log('已停止所有任务');
    }

    // 调用Hamibot API停止当前运行的任务
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

    res.json({ message: mobile ? `手机号 ${mobile} 的所有任务已成功停止` : '所有任务已成功停止' });

  } catch (error) {
    res.status(500).json({ message: '停止任务失败', error: error.message });
  }
});

// Get execution logs
router.get('/hamibot/log', authenticateToken, async (req, res) => {
  try {
    const { mobile, status } = req.query;
    const query = {};

    if (mobile) {
      query.mobile = mobile;
    }

    if (status) {
      query.status = status;
    }

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    const processingCount = await Task.countDocuments({
      status: 'processing'
    });

    res.json({
      isProcessing: processingCount > 0,
      queueLength: await Task.countDocuments({ status: 'pending' }),
      processingCount: processingCount,
      tasks: tasks.map(task => ({
        id: task.taskId,
        mobile: task.mobile,
        status: task.status,
        createdAt: task.createdAt,
        error: task.error
      }))
    });
  } catch (error) {
    res.status(500).json({ message: '获取日志失败', error: error.message });
  }
});

// 删除原有的clearTaskQueue函数
// function clearTaskQueue() {
//   taskQueue.length = 0;
//   processingTasks.clear();
// }

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制100个并发请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后再试' }
});

// 为所有URLs接口应用限流
router.use(apiLimiter);
module.exports = { router };
