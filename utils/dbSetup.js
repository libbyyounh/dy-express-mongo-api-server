const mongoose = require('mongoose');
const schedule = require('node-schedule');
const moment = require('moment');
const User = require('../models/User');
const Mobile = require('../models/Mobile');

// Create daily collection model dynamically
const createUrlModel = (collectionName) => {
  const urlSchema = new mongoose.Schema({
    url: {
      type: String,
      required: true
    },
    mobile: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: 'A'
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    createTime: {
      type: String,
      default: () => moment().format('YYYY-MM-DD HH:mm:ss')
    },
    disabled: {
      type: Boolean,
      default: false
    }
  });

  // Check if model already exists to avoid OverwriteModelError
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  
  return mongoose.model(collectionName, urlSchema, collectionName);
};

// Get today's collection name
const getTodayCollectionName = () => {
  return moment().format('YYYYMMDD');
};

// Get tomorrow's collection name
const getTomorrowCollectionName = () => {
  return moment().add(1, 'day').format('YYYYMMDD');
};

// Create daily collection
const createDailyCollection = async () => {
  try {
    const collectionName = getTodayCollectionName();
    
    // Check if collection already exists
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    
    if (collections.length === 0) {
      // Create new collection
      const UrlModel = createUrlModel(collectionName);
      await mongoose.connection.createCollection(collectionName);
      console.log(`Created new daily collection: ${collectionName}`);
      
      // Clean up old collections (keep only last 14 days)
      await cleanupOldCollections();
    } else {
      console.log(`Collection ${collectionName} already exists`);
    }
  } catch (error) {
    console.error('Error creating daily collection:', error);
  }
};

// Clean up old collections (仅删除昨天及以前的集合)
const cleanupOldCollections = async () => {
    try {
        const today = moment().format('YYYYMMDD');
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        // 过滤出日期命名的集合
        const dateCollections = collections
            .filter(col => /^\d{8}$/.test(col.name))
            .map(col => ({
                name: col.name,
                date: moment(col.name, 'YYYYMMDD')
            }))
            .filter(col => col.date.isValid());
        
        // 按日期排序
        dateCollections.sort((a, b) => a.date.diff(b.date));
        
        // 仅保留今天及以后的集合，删除昨天及以前的集合
        const collectionsToRemove = dateCollections.filter(col => col.name < today);
        
        // 只删除第一个（最旧的）集合
        if (collectionsToRemove.length > 0) {
            const oldestCollection = collectionsToRemove[0];
            await mongoose.connection.db.dropCollection(oldestCollection.name);
            console.log(`Removed oldest collection: ${oldestCollection.name}`);
            
            // 移除对应的模型
            if (mongoose.models[oldestCollection.name]) {
                delete mongoose.models[oldestCollection.name];
            }
        }
    } catch (error) {
        console.error('Error cleaning up old collections:', error);
    }
};

// Initialize database with default data
const initializeDatabase = async () => {
  try {
    // 从环境变量获取敏感配置
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const defaultMobiles = (process.env.DEFAULT_MOBILES).split(',').filter(Boolean);

    // Create admin user if not exists
    const adminUser = await User.findOne({ username: adminUsername });
    if (!adminUser) {
      const newUser = new User({
        username: adminUsername,
        password: adminPassword, // Will be hashed by pre-save hook
        role: 'admin'
      });
      await newUser.save();
      console.log('Default admin user created');
    }
    
    // Create mobile numbers if not exist
    if (defaultMobiles.length > 0) {
      for (const mobile of defaultMobiles) {
        const existingMobile = await Mobile.findOne({ mobile });
        if (!existingMobile) {
          const newMobile = new Mobile({ mobile });
          await newMobile.save();
          console.log(`Added default mobile number: ${mobile}`);
        }
      }
    } else {
      console.warn('No default mobile numbers configured in environment variables');
    }
    
    // Create today's collection if not exists
    await createDailyCollection();
    
    // Schedule daily collection creation at 00:00
    schedule.scheduleJob('0 0 0 * * *', async () => {
      console.log('Running daily collection creation job');
      await createDailyCollection();
    });

    // Schedule weekly cleanup of old collections every Monday at 00:10:00
    schedule.scheduleJob('0 10 0 * * 1', async () => {
      console.log('Running weekly cleanup of old collections job');
      await cleanupOldCollections();
    });

    console.log('Database initialization completed');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

module.exports = {
  createUrlModel,
  getTodayCollectionName,
  getTomorrowCollectionName,
  createDailyCollection,
  cleanupOldCollections,
  initializeDatabase
};
