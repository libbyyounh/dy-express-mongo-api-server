const mongoose = require('mongoose');
const moment = require('moment');

const taskSchema = new mongoose.Schema({
  taskId: {
    type: String,
    required: true,
    unique: true
  },
  mobile: {
    type: String,
    required: true
  },
  speed: {
    type: Number,
    required: true
  },
  delay: {
    type: Number,
    default: 0
  },
  dataId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  collectionName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'stopped'],
    default: 'pending'
  },
  error: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: Date,
  completedAt: Date,
  lockedBy: String,
  lockedAt: Date
});

// 添加索引以提高查询性能
// taskSchema.index({ mobile: 1, status: 1 });
// taskSchema.index({ lockedAt: 1 });

// 静态方法：查找并锁定任务
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5分钟

taskSchema.statics.findAndLockTask = async function(lockerId) {
  const now = Date.now();
  const fiveMinutesAgo = now - LOCK_TIMEOUT;

  // 尝试锁定一个任务
  const task = await this.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', lockedAt: { $exists: false } },
        { status: 'pending', lockedAt: { $lt: fiveMinutesAgo } }
      ]
    },
    {
      $set: {
        status: 'processing',
        lockedBy: lockerId,
        lockedAt: new Date(now)
      }
    },
    {
      new: true,
      sort: { createdAt: 1 } // 按创建时间排序，先到先得
    }
  );

  return task;
};

// 静态方法：释放任务锁
taskSchema.statics.releaseTaskLock = async function(taskId, newStatus = 'pending') {
  return await this.findByIdAndUpdate(
    taskId,
    {
      $set: {
        status: newStatus,
        lockedBy: null,
        lockedAt: null
      }
    },
    {
      new: true
    }
  );
};

// 静态方法：获取指定移动设备的所有任务
taskSchema.statics.getTasksByMobile = async function(mobile) {
  return await this.find({ mobile }).sort({ createdAt: -1 });
};

// 静态方法：停止指定移动设备的所有任务
taskSchema.statics.stopTasksByMobile = async function(mobile) {
  return await this.updateMany(
    { mobile, status: { $in: ['pending', 'processing'] } },
    {
      $set: {
        status: 'stopped',
        lockedBy: null,
        lockedAt: null
      }
    }
  );
};

// 静态方法：检查所有任务是否已完成
taskSchema.statics.areAllTasksCompleted = async function() {
  const activeTasks = await this.countDocuments({
    status: { $in: ['pending', 'processing'] }
  });
  return activeTasks === 0;
};

// 静态方法：清空所有任务（谨慎使用）
 taskSchema.statics.clearAllTasks = async function(confirm = false) {
  if (!confirm) {
    throw new Error('请确认是否要清空所有任务，调用时添加confirm=true参数');
  }
  return await this.deleteMany({});
};

// 静态方法：解锁所有任务
 taskSchema.statics.unlockAllTasks = async function() {
  return await this.updateMany(
    { status: 'processing', lockedBy: { $exists: true } },
    {
      $set: {
        status: 'pending',
        lockedBy: null,
        lockedAt: null
      }
    }
  );
};

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;