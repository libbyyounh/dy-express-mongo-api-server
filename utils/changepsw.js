const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config(); // 加载环境变量

/**
 * 命令行修改用户密码脚本
 * 使用方法: node utils/changepsw.js <username> <new_password>
 */

async function changeUserPassword(username, newPassword) {
  try {
    // 连接到MongoDB数据库
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('已连接到MongoDB数据库');

    // 查找用户
    const user = await User.findOne({ username });
    if (!user) {
      console.error(`未找到用户: ${username}`);
      return false;
    }

    // 手动哈希密码（或者直接设置，让pre('save')钩子处理）
    user.password = newPassword; // 这里可以直接设置，因为User模型有pre('save')钩子会自动哈希
    
    // 保存更新后的用户信息
    await user.save();
    console.log(`用户 ${username} 的密码已成功更新`);
    return true;

  } catch (error) {
    console.error('修改密码时出错:', error);
    return false;
  } finally {
    // 关闭数据库连接
    await mongoose.connection.close();
    console.log('已关闭MongoDB数据库连接');
  }
}

// 从命令行参数获取用户名和新密码
function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.log('用法: node utils/changepsw.js <username> <new_password>');
    process.exit(1);
  }

  const [username, newPassword] = args;
  
  // 验证密码长度（可选）
  if (newPassword.length < 6) {
    console.error('密码长度至少为6个字符');
    process.exit(1);
  }

  changeUserPassword(username, newPassword)
    .then(success => {
      process.exit(success ? 0 : 1);
    });
}

// 如果直接运行脚本，则执行main函数
if (require.main === module) {
  main();
}

module.exports = { changeUserPassword }; // 导出供其他地方使用