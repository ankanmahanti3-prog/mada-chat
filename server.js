require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const server = http.createServer(app);

// Initialize Groq AI Client safely via environment variable
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY 
});

const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024
});

const SECRET_KEY = process.env.SECRET_KEY || 'mada_secret_key_change_in_production';

// In-memory SQLite DB
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT DEFAULT 'General',
    username TEXT,
    message TEXT,
    fileUrl TEXT,
    reactions TEXT DEFAULT '{}',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room)`);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Authentication Routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function (err) {
      if (err) return res.status(400).json({ error: 'Username already exists' });
      res.json({ message: 'User registered successfully' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  });
});

// Active Users Tracking
const activeUsers = new Map();

// Groq AI Integration
async function fetchAIResponse(userMessage) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return "Neural stream offline: GROQ_API_KEY environment variable is not set.";
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are Neural AI, a high-level cybernetic AI assistant in 2045. Answer accurately, clearly, and format useful code snippets with backticks.'
        },
        { role: 'user', content: userMessage }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 450
    });

    return completion.choices[0]?.message?.content || "Neural transmission complete.";
  } catch (err) {
    console.error("Groq AI Error:", err.message);
    return "Neural stream error: Check API link status.";
  }
}

io.on('connection', (socket) => {
  socket.on('user connected', (username) => {
    if (username) {
      activeUsers.set(socket.id, username);
      io.emit('online users update', Array.from(new Set(activeUsers.values())));
    }
  });

  socket.on('join room', (room) => {
    socket.join(room);
    db.all('SELECT id, room, username, message, fileUrl, reactions, timestamp FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50', [room], (err, rows) => {
      if (!err) socket.emit('chat history', rows);
    });
  });

  socket.on('chat message', async (data) => {
    const { room, username, message, fileUrl } = data;
    if (!username || (!message && !fileUrl)) return;

    db.run('INSERT INTO messages (room, username, message, fileUrl) VALUES (?, ?, ?, ?)', [room || 'General', username, message, fileUrl], async function (err) {
      if (!err) {
        const msgData = { id: this.lastID, room: room || 'General', username, message, fileUrl, reactions: '{}', timestamp: new Date().toISOString() };
        io.to(room || 'General').emit('chat message', msgData);

        // AI Assistant Trigger
        if (message && (message.toLowerCase().includes('@ai') || room === 'AI Assistant') && username !== 'Neural AI') {
          const cleanPrompt = message.replace(/@ai/gi, '').trim() || "Greetings Neural AI";
          
          io.to(room || 'General').emit('user typing', { 
            username: 'Neural AI', 
            room: room || 'General', 
            text: 'Neural AI is computing quantum response...' 
          });

          const aiReply = await fetchAIResponse(cleanPrompt);

          db.run('INSERT INTO messages (room, username, message) VALUES (?, ?, ?)', [room || 'General', 'Neural AI', aiReply], function(err2) {
            if (!err2) {
              io.to(room || 'General').emit('stop typing', { username: 'Neural AI', room: room || 'General' });
              io.to(room || 'General').emit('chat message', {
                id: this.lastID,
                room: room || 'General',
                username: 'Neural AI',
                message: aiReply,
                reactions: '{}',
                timestamp: new Date().toISOString()
              });
            }
          });
        }
      }
    });
  });

  socket.on('add reaction', (data) => {
    const { id, room, emoji } = data;
    db.get('SELECT reactions FROM messages WHERE id = ?', [id], (err, row) => {
      if (!err && row) {
        let reactions = {};
        try { reactions = JSON.parse(row.reactions || '{}'); } catch(e) {}
        reactions[emoji] = (reactions[emoji] || 0) + 1;
        
        db.run('UPDATE messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), id], (err2) => {
          if (!err2) {
            io.to(room).emit('reaction updated', { id, reactions });
          }
        });
      }
    });
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user typing', { username: data.username, room: data.room, text: `${data.username} is transmitting... Neural activity 72%` });
  });

  socket.on('stop typing', (data) => {
    socket.to(data.room).emit('user stop typing', { username: data.username, room: data.room });
  });

  socket.on('edit message', (data) => {
    const { id, room, username, newMessage } = data;
    db.run('UPDATE messages SET message = ? WHERE id = ? AND username = ?', [newMessage, id, username], function (err) {
      if (!err && this.changes > 0) {
        io.to(room).emit('message edited', { id, newMessage });
      }
    });
  });

  socket.on('delete message', (data) => {
    const { id, room, username } = data;
    db.run('DELETE FROM messages WHERE id = ? AND username = ?', [id, username], function (err) {
      if (!err && this.changes > 0) {
        io.to(room).emit('message deleted', { id });
      }
    });
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('online users update', Array.from(new Set(activeUsers.values())));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Neural Link v2.0 Terminal running on port ${PORT}`);
});