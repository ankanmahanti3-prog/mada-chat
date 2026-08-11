require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_cyber_key_2045';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ankanmahanti3_db_user:SqlQPMCUf8WJAzNm@cluster0.dhopod8.mongodb.net/neurallink?retryWrites=true&w=majority';

// Initialize Groq SDK
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Public')));

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('⚡ Connected to Permanent Cloud Database (MongoDB Atlas)'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  room: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, default: '' },
  fileUrl: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

let onlineUsers = new Set();

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Username already taken.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid credentials.' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Socket Events
io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('user connected', (username) => {
    currentUser = username;
    if (username) onlineUsers.add(username);
    io.emit('online users update', Array.from(onlineUsers));
  });

  socket.on('join room', async (room) => {
    socket.join(room);
    try {
      const history = await Message.find({ room }).sort({ timestamp: 1 }).limit(100);
      socket.emit('chat history', history);
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  });

  socket.on('chat message', async (data) => {
    const { room, username, message, fileUrl } = data;
    const msgId = Date.now();

    const newMsg = new Message({ id: msgId, room, username, message, fileUrl });

    try {
      await newMsg.save();
      io.to(room).emit('chat message', newMsg);

      if (groq && (message.includes('@AI') || room === 'AI Assistant')) {
        const cleanPrompt = message.replace('@AI', '').trim();
        if (cleanPrompt) triggerGroqAI(room, cleanPrompt);
      }
    } catch (err) {
      console.error('Error saving chat message:', err);
    }
  });

  socket.on('typing', (data) => socket.to(data.room).emit('user typing', data));
  socket.on('stop typing', (data) => socket.to(data.room).emit('user stop typing', data));

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineUsers.delete(currentUser);
      io.emit('online users update', Array.from(onlineUsers));
    }
  });
});

async function triggerGroqAI(room, prompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 500
    });

    const aiText = completion.choices[0]?.message?.content || 'Neural processing completed.';
    const aiMsg = new Message({ id: Date.now() + 1, room, username: 'Neural AI', message: aiText });

    await aiMsg.save();
    io.to(room).emit('chat message', aiMsg);
  } catch (err) {
    console.error('Groq AI Error:', err);
  }
}

server.listen(PORT, () => {
  console.log(`🚀 NEURAL LINK v2.0 server running on port ${PORT}`);
});