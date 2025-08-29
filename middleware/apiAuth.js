const User = require('../models/User');

// API Secret 认证中间件
const authenticateApiKeySecret = async (req, res, next) => {
  try {
    // 添加详细的请求信息日志
    console.log('API Auth Middleware triggered for:', req.method, req.path);
    
    // 从请求头中获取 API Key 和 Secret
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    console.log('API Key provided:', !!apiKey, 'API Secret provided:', !!apiSecret);
    
    // 如果没有提供 API Key 或 Secret，继续使用其他认证方式
    if (!apiKey || !apiSecret) {
      console.log('No API Key or Secret provided, continuing with other auth methods');
      return next();
    }
    
    // 查找用户
    const user = await User.findOne({ apiKey });
    if (!user) {
      return res.status(401).json({ message: 'Invalid API Key' });
    }
    
    // 检查用户是否为管理员，管理员不能通过API secret方式访问
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Admin users cannot access via API secret' });
    }
    
    // 检查用户是否被禁用
    if (user.disabled) {
      return res.status(401).json({ message: 'Account is disabled' });
    }
    
    // 检查 API 凭证是否过期
    if (user.apiSecretLastGenerated) {
      // 从环境变量获取过期时间配置，默认为60天
      const expiresIn = process.env.API_CREDENTIAL_EXPIRES_IN || '60d';
      
      // 解析过期时间
      const match = expiresIn.match(/^(\d+)([dhm])$/);
      if (match) {
        const [, value, unit] = match;
        let expirationMs = 0;
        
        // 转换为毫秒
        switch (unit) {
          case 'd':
            expirationMs = parseInt(value) * 24 * 60 * 60 * 1000;
            break;
          case 'h':
            expirationMs = parseInt(value) * 60 * 60 * 1000;
            break;
          case 'm':
            expirationMs = parseInt(value) * 60 * 1000;
            break;
        }
        
        // 计算过期时间点
        const expirationDate = new Date(user.apiSecretLastGenerated.getTime() + expirationMs);
        
        // 检查是否过期
        if (new Date() > expirationDate) {
          return res.status(401).json({ message: 'API credentials have expired' });
        }
      }
    }
    
    // 使用模型方法验证 API Secret（比较哈希值）
    if (!user.verifyApiSecret(apiSecret)) {
      return res.status(401).json({ message: 'Invalid API Secret' });
    }
    
    // 将用户信息附加到请求对象
    req.user = user;
    next();
  } catch (error) {
    console.error('Error in API auth middleware:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = authenticateApiKeySecret;