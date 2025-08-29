require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { authenticateToken } = require('./middleware/auth');
const { isAdmin, apiRoleCheck } = require('./middleware/roleCheck');
const { initializeDatabase, createDailyCollection, cleanupOldCollections } = require('./utils/dbSetup');
const authRoutes = require('./routes/auth');
const urlsRoutes = require('./routes/urls');
const mobilesRoutes = require('./routes/mobiles');
const { router: hamibotRoutes } = require('./routes/hamibot');
const shoppingCardRoutes = require('./routes/shoppingCard'); // 新增
const usersRouter = require('./routes/users');
const authenticateApiKeySecret = require('./middleware/apiAuth');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// 新增路由: /shoppingCard/:mobile/:id
// 先定义动态路由
app.get('/shoppingCard/:mobile/:id', (req, res) => {
  console.log('Received request for mobile:', req.params.mobile, 'id:', req.params.id);
  res.sendFile(path.join(__dirname, 'public', 'shoppingCard.html'));
});

// Serve static files
app.use(express.static('public'));

// Authentication redirect middleware
const authRedirect = (req, res, next) => {
  // Skip redirect for API requests and authenticated users
  if (req.path.startsWith('/api') || req.path.startsWith('/api-docs') || req.headers.authorization) {
    return next();
  }
  // Redirect to login if not authenticated
  if (!req.cookies.token && !req.query.token) {
    return res.redirect('/login.html');
  }
  next();
};
app.use(authRedirect);

// Swagger configuration
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Express MongoDB API',
      version: '1.0.0',
      description: 'API service with Express, MongoDB, JWT authentication and Swagger documentation',
      contact: {
        name: 'Admin'
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 3000}`
        }
      ]
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
// 修改API路由注册，添加认证和角色检查中间件
app.use('/api', authRoutes);
app.use('/api', authenticateApiKeySecret, authenticateToken, apiRoleCheck, urlsRoutes);
app.use('/api', authenticateApiKeySecret, authenticateToken, apiRoleCheck, mobilesRoutes);
app.use('/api', authenticateApiKeySecret, authenticateToken, apiRoleCheck, hamibotRoutes);
app.use('/api', authenticateApiKeySecret, authenticateToken, apiRoleCheck, shoppingCardRoutes);

// 用户路由已经有authenticateToken中间件，添加apiRoleCheck
app.use('/api/users', authenticateToken, apiRoleCheck, usersRouter);




// Root route serves the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// 将数据库连接和服务器启动代码封装为函数
const startServer = async () => {
  try {
    // 修改MongoDB连接配置
    mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 20, // 连接池大小
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('Connected to MongoDB');
    
    // Initialize database with default data
    initializeDatabase();
    
    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// 仅在直接运行时启动服务器，测试时不启动
if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer; // 导出供测试使用
