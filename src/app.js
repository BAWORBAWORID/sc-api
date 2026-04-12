const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const whatsappRoutes = require('./routes/whatsapp');
const vpsRoutes = require('./routes/vps');
const toolsRoutes = require('./routes/tools');
const telegramRoutes = require('./routes/telegram');
const { router: suxratRoutes } = require('./routes/suxrat');

// Import middleware
const authMiddleware = require('./middleware/authMiddleware');
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(bodyParser.json({ limit: '500mb' }));

// Rate limiting
app.use(rateLimitMiddleware);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', authMiddleware, userRoutes);
app.use('/api/whatsapp', authMiddleware, whatsappRoutes);
app.use('/api/vps', authMiddleware, vpsRoutes);
app.use('/api/tools', authMiddleware, toolsRoutes);
app.use('/api/telegram', authMiddleware, telegramRoutes);
app.use('/suxrat', suxratRoutes);

// Health check
app.get('/ping', (req, res) => res.send('pong'));

module.exports = app;