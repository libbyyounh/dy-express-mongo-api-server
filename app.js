require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { authenticateToken } = require('./middleware/auth');
const { initializeDatabase, createDailyCollection, cleanupOldCollections } = require('./utils/dbSetup');
const authRoutes = require('./routes/auth');
const urlRoutes = require('./routes/urls');
const mobileRoutes = require('./routes/mobiles');
// 修改hamibot路由导入方式
const { router: hamibotRouter } = require('./routes/hamibot');
const usersRouter = require('./routes/users');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
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
app.use('/api', authRoutes);
app.use('/api', authenticateToken, urlRoutes);
app.use('/api', authenticateToken, mobileRoutes);
app.use('/api', authenticateToken, hamibotRouter);
app.use('/api/users', authenticateToken, usersRouter);

// Root route serves the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Hamibot UI route
app.get('/hamibot', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hamibot.html'));
});

// 将数据库连接和服务器启动代码封装为函数
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
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
