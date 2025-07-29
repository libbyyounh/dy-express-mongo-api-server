const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: '禁止访问：需要管理员权限' });
};

module.exports = { isAdmin };