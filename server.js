const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SECRET_KEY = 'mada_secret_key_change_in_production';

// Use in-memory SQLite database for reliable execution on cloud containers
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to in-memory SQLite database.');
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

// Serve HTML directly on root
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mada Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body { background: #121212; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; }
    .container { width: 90%; max-width: 450px; background: #1e1e1e; border-radius: 12px; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    h2 { text-align: center; margin-bottom: 20px; color: #bb86fc; }
    input { width: 100%; padding: 12px; margin: 8px 0; background: #2e2e2e; border: 1px solid #3e3e3e; color: #fff; border-radius: 6px; outline: none; }
    button { width: 100%; padding: 12px; margin-top: 10px; background: #bb86fc; border: none; color: #000; font-weight: bold; border-radius: 6px; cursor: pointer; }
    button:hover { background: #9965f4; }
    .switch-btn { background: transparent; color: #bb86fc; text-align: center; margin-top: 12px; font-size: 14px; cursor: pointer; text-decoration: underline; }
    #chat-screen { display: none; height: 500px; flex-direction: column; }
    #messages { flex: 1; overflow-y: auto; padding: 10px; background: #121212; border-radius: 6px; margin-bottom: 10px; }
    .msg { margin-bottom: 10px; padding: 8px 12px; background: #2e2e2e; border-radius: 6px; max-width: 80%; }
    .msg .author { font-size: 12px; color: #bb86fc; font-weight: bold; margin-bottom: 2px; }
    #chat-form { display: flex; gap: 8px; }
    #chat-form input { margin: 0; flex: 1; }
    #chat-form button { margin: 0; width: auto; padding: 0 20px; }
  </style>
</head>
<body>

<div class="container" id="auth-screen">
  <h2 id="auth-title">Login to Mada</h2>
  <input type="text" id="username" placeholder="Username" autocomplete="off">
  <input type="password" id="password" placeholder="Password">
  <button id="auth-btn" onclick="handleAuth()">Login</button>
  <div class="switch-btn" onclick="toggleAuthMode()" id="switch-text">Don't have an account? Register</div>
</div>

<div class="container" id="chat-screen">
  <h2>Mada Live Chat</h2>
  <div id="messages"></div>
  <form id="chat-form" onsubmit="sendMessage(event)">
    <input type="text" id="msg-input" placeholder="Type a message..." autocomplete="off">
    <button type="submit">Send</button>
  </form>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
  let isLogin = true;
  let currentUser = localStorage.getItem('mada_user') || null;
  const socket = io();

  if (currentUser) {
    showChat();
  }

  function toggleAuthMode() {
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? 'Login to Mada' : 'Register for Mada';
    document.getElementById('auth-btn').innerText = isLogin ? 'Login' : 'Register';
    document.getElementById('switch-text').innerText = isLogin ? "Don't have an account? Register" : "Already have an account? Login";
  }

  async function handleAuth() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) return alert('Please enter both username and password.');

    const endpoint = isLogin ? '/api/login' : '/api/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok) {
        if (isLogin) {
          currentUser = data.username;
          localStorage.setItem('mada_user', currentUser);
          showChat();
        } else {
          alert('Registered successfully! Switching to Login...');
          toggleAuthMode();
        }
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      alert('Network error connecting to server.');
    }
  }

  function showChat() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'flex';
  }

  socket.on('chat history', (history) => {
    const list = document.getElementById('messages');
    list.innerHTML = '';
    history.forEach(appendMessage);
    scrollToBottom();
  });

  socket.on('chat message', (msg) => {
    appendMessage(msg);
    scrollToBottom();
  });

  function appendMessage(msg) {
    const list = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = \`<div class="author">\${msg.username}</div><div>\${msg.message}</div>\`;
    list.appendChild(div);
  }

  function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (text && currentUser) {
      socket.emit('chat message', { username: currentUser, message: text });
      input.value = '';
    }
  }

  function scrollToBottom() {
    const list = document.getElementById('messages');
    list.scrollTop = list.scrollHeight;
  }
</script>

</body>
</html>
  `);
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