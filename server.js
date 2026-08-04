const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SECRET_KEY = 'mada_secret_key_change_in_production';

// Database setup
const db = new sqlite3.Database('./chat.db', (err) => {
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
    username TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

app.use(express.json());

// Serving static files (index.html) directly
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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

// Real-time Chat Sockets
io.on('connection', (socket) => {
  // Send chat history to new connection
  db.all('SELECT username, message, timestamp FROM messages ORDER BY id ASC LIMIT 50', [], (err, rows) => {
    if (!err) socket.emit('chat history', rows);
  });

  socket.on('chat message', (data) => {
    const { username, message } = data;
    if (!username || !message) return;

    db.run('INSERT INTO messages (username, message) VALUES (?, ?)', [username, message], function (err) {
      if (!err) {
        io.emit('chat message', { username, message, timestamp: new Date().toISOString() });
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mada Authenticated Server running on port ${PORT}`);
});