const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');
const mongoose = require('mongoose');

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

// Process task queue
const processTaskQueue = async () => {
  if (isProcessingQueue || taskQueue.length === 0) return;

  isProcessingQueue = true;
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    const { mobile, speed, data, res } = task;
    const delay = speed === 'a' ? 150000 : 230000; // 150s or 230s

    try {
      // Call Hamibot API
      const response = await axios.post(
        'https://api.hamibot.com/v1/scripts/6885a2626e8b56a73da87f18/run',
        JSON.stringify({
          devices: [{ _id: '6870b497f2d126b2b6c717fd', name: '精妙黄豆' }],
          vars: {
            remoteUrl: data.url,
            speed: speed
          }
        }),
        {
          headers: {
            'authorization': `${process.env.HAMIBOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      task.startTime = Date.now(); // 记录任务开始时间
      if (!response || response.status !== 204) {
        throw new Error(`Hamibot API调用失败: ${response ? response.status : '无响应'}`);
      }

      // Update task status
      task.status = 'completed';
      task.result = response.data;

      // Directly update database
      const collectionName = getDailyCollectionName();
      const Collection = mongoose.connection.collection(collectionName);
      await Collection.updateOne(
        { _id: mongoose.Types.ObjectId(data._id) },
        { $set: { isUsed: true } }
      );

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
    }

    // Check if task.startTime is undefined
    if (task.startTime === undefined) {
      addLog('Error: task.startTime is undefined, terminating all tasks');
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
};

// Execute Hamibot script
router.post('/hamibot/execute', authenticateToken, async (req, res) => {
  try {
    const { mobile, speed } = req.body;
    const collectionName = getDailyCollectionName();
    const Collection = mongoose.connection.collection(collectionName);

    // Get data from daily collection
    const dataItems = await Collection.find({
      mobile: mobile,
      isUsed: false,
      disabled: false
    }).toArray();

    if (dataItems.length === 0) {
      return res.status(404).json({ message: 'No data found for the given mobile' });
    }

    // Create tasks in queue
    const taskIds = dataItems.map((item, index) => {
      const taskId = `task_${Date.now()}_${index}`;
      taskQueue.push({
        id: taskId,
        mobile: mobile,
        speed: speed,
        data: item,
        status: 'pending',
        createdAt: new Date(),
        res: res
      });
      return taskId;
    });

    // Start processing queue
    processTaskQueue();

    res.status(202).json({
      message: `Task queue created with ${dataItems.length} items`,
      taskIds: taskIds
    });

  } catch (error) {
    res.status(500).json({ message: 'Error executing Hamibot script', error: error.message });
  }
});

// Stop all tasks
router.post('/hamibot/stop', authenticateToken, (req, res) => {
  try {
    // Clear task queue and stop processing
    taskQueue.length = 0;
    isProcessingQueue = false;
    res.json({ message: '所有任务已成功停止' });
  } catch (error) {
    res.status(500).json({ message: '停止任务失败', error: error.message });
  }
});

// Get execution logs
router.get('/hamibot/log', authenticateToken, (req, res) => {
  res.json({
    queueLength: taskQueue.length,
    tasks: taskQueue.map(task => ({
      id: task.id,
      mobile: task.mobile,
      status: task.status,
      createdAt: task.createdAt,
      error: task.error
    }))
  });
});

module.exports = router;