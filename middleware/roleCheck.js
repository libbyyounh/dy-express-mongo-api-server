const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: '禁止访问：需要管理员权限' });
};

// 添加API角色访问控制中间件
const apiRoleCheck = (req, res, next) => {
  // 首先检查是否有用户对象（通过authenticateToken中间件解析）
  if (!req.user) {
    // 如果没有用户对象，继续执行下一个中间件（可能是认证中间件）
    return next();
  }
  
  // 如果用户角色是API，检查是否在白名单URL中
  if (req.user.role === 'API') {
    // 白名单URL数组
    const whitelistUrls = [
      '/api/getAllUrl',
      '/api/updateUsed'
      // 可以根据需要添加更多白名单URL
    ];
    
    // 获取当前请求的URL路径
    const requestUrl = req.originalUrl;
    
    // 检查URL是否在白名单中
    const isAllowed = whitelistUrls.some(whitelistUrl => 
      requestUrl.startsWith(whitelistUrl)
    );
    
    if (!isAllowed) {
      return res.status(403).json({ 
        message: 'API角色访问被拒绝。只有白名单中的接口允许访问。' 
      });
    }
  }
  
  // 其他角色（如admin、普通用户）可以继续访问
  next();
};

module.exports = { isAdmin, apiRoleCheck };