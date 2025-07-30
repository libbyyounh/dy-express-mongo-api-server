const express = require('express');
const router = express.Router();
const { authenticateToken, generateShortToken } = require('../middleware/auth');
const User = require('../models/User');
const axios = require('axios');
const mongoose = require('mongoose');
const AsyncLock = require('async-lock'); // 添加互斥锁
const { v4: uuidv4 } = require('uuid'); // 添加UUID生成

// 创建锁实例
const lock = new AsyncLock({ timeout: 5000 });

// Task queue for Hamibot executions
const taskQueue = [];
let isProcessingQueue = false;

// Get current date collection name (YYYYMMDD)
const getDailyCollectionName = () => {
  const date = new Date();
  return date.getFullYear().toString() +
         (date.getMonth() + 1).toString().padStart(2, '0') +
         date.getDate().toString().padStart(2, '0');
};

// Process task queue with lock protection
const processTaskQueue = async () => {
  // 使用锁确保同一时间只有一个处理器
  return lock.acquire('taskQueueLock', async () => {
      if (isProcessingQueue || taskQueue.length === 0) return;

      isProcessingQueue = true;
      while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        const { mobile, speed, data, res, taskId } = task;
        const delay = speed === 'a' ? 150000 : 230000; // 150s or 230s

        try {
          console.log(`Processing task: ${taskId}`);
          // stop current task first
          const res = await axios.delete(
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
                  // serverToken: generateShortToken(user),
                  // serverUrl: process.env.HAMIBOT_SERVER_URL,
                  remoteUrl: data.url,
                  speed: speed
                }
              }
            }
          );
          if (!res || res.status !== 204) {
            throw new Error(`Hamibot API调用停止失败: ${response ? response.status : '无响应'}`);
          }
          console.log('stop Hamibot task success');
          // Call Hamibot API
          const user = await User.findOne({ username: 'admin' });
          const response = await axios.post(
            `https://api.hamibot.com/v1/scripts/${process.env.HAMIBOT_SCRIPT_ID}/run`,
            {
              devices: [{
                _id: process.env.HAMIBOT_DEVICE_ID,
                name: process.env.HAMIBOT_DEVICE_NAME
              }],
              vars: {
                // serverToken: generateShortToken(user),
                // serverUrl: process.env.HAMIBOT_SERVER_URL,
                remoteUrl: data.url,
                speed: speed
              }
            },
            {
              headers: {
                'authorization': `${process.env.HAMIBOT_TOKEN}`
                // 'Content-Type': 'application/json'
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
          // task.result = response.data;
          task.result = res.data;

          // Directly update database
          const collectionName = getDailyCollectionName();
          const Collection = mongoose.connection.collection(collectionName);
          await Collection.updateOne(
            { _id: new mongoose.Types.ObjectId(data._id) }, // Add 'new' keyword here
            { $set: { isUsed: true } }
          );

          // 原子操作更新数据库，确保只更新未使用的记录
          const result = await Collection.updateOne(
            { 
              _id: new mongoose.Types.ObjectId(data._id), 
              isUsed: false // 确保只更新未使用的记录
            }, 
            { $set: { isUsed: true, taskId: taskId } } // 添加任务ID
          );

          // 检查更新结果
          if (result.modifiedCount === 0) {
            throw new Error(`任务数据已被处理: ${data._id}`);
          }

        } catch (error) {
          task.status = 'failed';
          task.error = error.message;
          console.error(`Task ${taskId} failed:`, error.message);
        }

      // Check if task.startTime is undefined
      if (task.startTime === undefined) {
        console.error('Error: task.startTime is undefined, terminating all tasks');
        taskQueue.length = 0; // Clear all remaining tasks
        isProcessingQueue = false;
        break; // Exit processing loop
      }

      // Calculate time remaining until next task can start
      const timeSinceStart = Date.now() - task.startTime;
      const waitTime = Math.max(0, delay - timeSinceStart);
      
      // Wait before processing next task
      if (taskQueue.length > 0 && waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    isProcessingQueue = false;
  });
}
// Execute Hamibot script
router.post('/hamibot/execute', authenticateToken, async (req, res) => {
  try {
    const { mobile, speed } = req.body;
    const collectionName = getDailyCollectionName();
    const Collection = mongoose.connection.collection(collectionName);

    // 使用原子操作查询并锁定数据
    const dataItems = await Collection.find(
      { mobile: mobile, isUsed: false, disabled: false },
      null,
      { sort: { _id: 1 }, limit: 10 } // 添加排序和限制
    ).toArray();

    if (dataItems.length === 0) {
      return res.status(404).json({ message: 'No data found for the given mobile' });
    }

    // Create tasks in queue with unique IDs
    const taskIds = dataItems.map((item, index) => {
      const taskId = uuidv4(); // 生成唯一任务ID
      taskQueue.push({
        index: index,
        id: taskId,
        taskId: taskId, // 唯一任务ID
        mobile: mobile,
        speed: speed,
        data: item,
        status: 'pending',
        createdAt: new Date(),
        res: res
      });
      return taskId;
    });

    // Start processing queue with lock
    processTaskQueue().catch(error => {
      console.error('Queue processing failed:', error);
    });

    res.status(202).json({
      message: `Task queue created with ${dataItems.length} items`,
      taskIds: taskIds
    });

  } catch (error) {
    res.status(500).json({ message: 'Error executing Hamibot script', error: error.message });
  }
});

// Stop all tasks
router.post('/hamibot/stop', authenticateToken, async (req, res) => {
  try {
    // 使用锁确保安全修改队列
    await lock.acquire('taskQueueLock', async () => {
      // Clear task queue and stop processing
      taskQueue.length = 0;
      isProcessingQueue = false;
    });

    // stop current task first
    const stopResponse = await axios.delete(
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
            remoteUrl: req.body.url || '', // 使用req.body参数
            speed: req.body.speed || 'a'
          }
        }
      }
    );

    if (!stopResponse || stopResponse.status !== 204) {
      throw new Error(`Hamibot API调用停止失败: ${stopResponse ? stopResponse.status : '无响应'}`);
    }

    res.json({ message: '所有任务已成功停止' });
    console.log('all tasks stopped');
  } catch (error) {
    res.status(500).json({ message: '停止任务失败', error: error.message });
  }
});

// Get execution logs
router.get('/hamibot/log', authenticateToken, async (req, res) => {
  try {
    // 使用锁确保读取一致性
    const logData = await lock.acquire('taskQueueLock', () => ({
      isProcessingQueue: isProcessingQueue,
      queueLength: taskQueue.length,
      tasks: taskQueue.map(task => ({
        id: task.id,
        mobile: task.mobile,
        status: task.status,
        createdAt: task.createdAt,
        error: task.error,
        taskId: task.taskId // 添加taskId便于追踪
      }))
    }));

    res.json(logData);
  } catch (error) {
    res.status(500).json({ message: '获取日志失败', error: error.message });
  }
});

module.exports = router;