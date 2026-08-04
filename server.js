const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'mada_super_secret_key_2026';

const app = express();
const server = http.createServer(app);

const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.json());
app.use(express.static('public'));

const dbPath = path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath);

// Initialize Tables
db.serialize(() => {
    // Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Messages Table
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL DEFAULT 'general',
            type TEXT NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            fileName TEXT,
            fileType TEXT,
            time TEXT NOT NULL,
            reactions TEXT DEFAULT '{}',
            replyTo TEXT DEFAULT NULL,
            isEdited INTEGER DEFAULT 0,
            isDeleted INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Rooms Table
    db.run(`CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)`);
    db.run(`INSERT OR IGNORE INTO rooms (name) VALUES ('general')`);
});

// Authentication API Endpoints
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username.trim(), hash], function(err) {
            if (err) return res.status(400).json({ error: 'Username is already taken!' });
            
            const token = jwt.sign({ username: username.trim() }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, username: username.trim() });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username.trim()], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'User not found or invalid password' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'User not found or invalid password' });

        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    });
});

// Socket.io Middleware for Authentication Verification
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication required"));

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Invalid session token"));
        socket.username = decoded.username;
        next();
    });
});

const roomUsers = {};

io.on('connection', (socket) => {
    let currentRoom = 'general';
    const currentUser = socket.username;

    function broadcastRooms() {
        db.all("SELECT name FROM rooms ORDER BY name ASC", [], (err, rows) => {
            if (!err) {
                const roomList = rows.map(r => r.name);
                io.emit('room_list', { rooms: roomList, roomUsers: roomUsers });
            }
        });
    }

    socket.on('join_room', (data) => {
        const room = data.room || 'general';
        socket.leave(currentRoom);
        if (roomUsers[currentRoom]) roomUsers[currentRoom] = Math.max(0, roomUsers[currentRoom] - 1);

        currentRoom = room;
        socket.join(currentRoom);

        roomUsers[currentRoom] = (roomUsers[currentRoom] || 0) + 1;
        broadcastRooms();

        db.all("SELECT * FROM messages WHERE room = ? ORDER BY id ASC", [currentRoom], (err, rows) => {
            if (!err) socket.emit('load_history', rows);
        });
    });

    socket.on('create_room', (roomName) => {
        const cleanName = roomName.toLowerCase().trim().replace(/\s+/g, '-');
        if (!cleanName) return;
        db.run("INSERT OR IGNORE INTO rooms (name) VALUES (?)", [cleanName], (err) => {
            if (!err) broadcastRooms();
        });
    });

    socket.on('send_text', (data) => {
        const stmt = db.prepare("INSERT INTO messages (room, type, sender, content, time, reactions, replyTo) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const replyStr = data.replyTo ? JSON.stringify(data.replyTo) : null;
        stmt.run(currentRoom, 'text', currentUser, data.text, data.time, '{}', replyStr, function(err) {
            if (!err) {
                data.id = this.lastID;
                data.sender = currentUser;
                data.reactions = {};
                data.isEdited = 0;
                data.isDeleted = 0;
                io.to(currentRoom).emit('receive_text', data);
            }
        });
        stmt.finalize();
    });

    socket.on('send_audio', (data) => {
        const stmt = db.prepare("INSERT INTO messages (room, type, sender, content, time, reactions, replyTo) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const replyStr = data.replyTo ? JSON.stringify(data.replyTo) : null;
        stmt.run(currentRoom, 'audio', currentUser, data.audioUrl, data.time, '{}', replyStr, function(err) {
            if (!err) {
                data.id = this.lastID;
                data.sender = currentUser;
                data.reactions = {};
                data.isEdited = 0;
                data.isDeleted = 0;
                io.to(currentRoom).emit('receive_audio', data);
            }
        });
        stmt.finalize();
    });

    socket.on('send_file', (data) => {
        const stmt = db.prepare("INSERT INTO messages (room, type, sender, content, fileName, fileType, time, reactions, replyTo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const replyStr = data.replyTo ? JSON.stringify(data.replyTo) : null;
        stmt.run(currentRoom, 'file', currentUser, data.fileData, data.fileName, data.fileType, data.time, '{}', replyStr, function(err) {
            if (!err) {
                data.id = this.lastID;
                data.sender = currentUser;
                data.reactions = {};
                data.isEdited = 0;
                data.isDeleted = 0;
                io.to(currentRoom).emit('receive_file', data);
            }
        });
        stmt.finalize();
    });

    socket.on('add_reaction', ({ msgId, emoji }) => {
        db.get("SELECT reactions FROM messages WHERE id = ?", [msgId], (err, row) => {
            if (err || !row) return;
            let reactions = JSON.parse(row.reactions || '{}');
            reactions[emoji] = (reactions[emoji] || 0) + 1;

            const updatedStr = JSON.stringify(reactions);
            db.run("UPDATE messages SET reactions = ? WHERE id = ?", [updatedStr, msgId], (uErr) => {
                if (!uErr) {
                    io.to(currentRoom).emit('update_reactions', { msgId, reactions });
                }
            });
        });
    });

    socket.on('edit_message', ({ msgId, newText }) => {
        db.run("UPDATE messages SET content = ?, isEdited = 1 WHERE id = ? AND sender = ?", [newText, msgId, currentUser], (err) => {
            if (!err) {
                io.to(currentRoom).emit('message_edited', { msgId, newText });
            }
        });
    });

    socket.on('delete_message', (msgId) => {
        db.run("UPDATE messages SET isDeleted = 1 WHERE id = ? AND sender = ?", [msgId, currentUser], (err) => {
            if (!err) {
                io.to(currentRoom).emit('message_deleted', msgId);
            }
        });
    });

    socket.on('typing', () => socket.to(currentRoom).emit('user_typing', currentUser));
    socket.on('stop_typing', () => socket.to(currentRoom).emit('user_stop_typing'));

    socket.on('disconnect', () => {
        if (roomUsers[currentRoom]) roomUsers[currentRoom] = Math.max(0, roomUsers[currentRoom] - 1);
        broadcastRooms();
    });
});

server.listen(3000, () => {
    console.log('Mada Authenticated Server running on http://localhost:3000');
});