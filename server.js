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
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_cyber_key_2045';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ankanmahanti3_db_user:SqlQPMCUf8WJAzNm@cluster0.dhopod8.mongodb.net/neurallink?retryWrites=true&w=majority';

// Initialize Groq AI
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Public')));

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('⚡ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Warning:', err.message));

const messageSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  room: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, default: '' },
  fileUrl: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
let onlineUsers = new Set();

// Socket.io Real-Time Handlers
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
      console.log('Error fetching history:', err.message);
    }
  });

  socket.on('chat message', async (data) => {
    const { room, username, message, fileUrl } = data;
    const msgId = Date.now();

    const newMsgPayload = {
      id: msgId,
      room,
      username,
      message,
      fileUrl: fileUrl || null,
      timestamp: new Date()
    };

    // 1. Instantly send message to everyone in the room
    io.to(room).emit('chat message', newMsgPayload);

    // 2. Save in database in background
    try {
      const dbMsg = new Message(newMsgPayload);
      await dbMsg.save();
    } catch (err) {
      console.log('Database background save note:', err.message);
    }

    // 3. Handle AI Assistant trigger
    if (groq && (message.includes('@AI') || room === 'AI Assistant')) {
      const cleanPrompt = message.replace('@AI', '').trim();
      if (cleanPrompt) {
        triggerGroqAI(room, cleanPrompt);
      }
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

    const aiText = completion.choices[0]?.message?.content || 'Neural response generated.';
    const aiMsgPayload = {
      id: Date.now() + 1,
      room,
      username: 'Neural AI',
      message: aiText,
      timestamp: new Date()
    };

    io.to(room).emit('chat message', aiMsgPayload);

    const dbMsg = new Message(aiMsgPayload);
    await dbMsg.save();
  } catch (err) {
    console.error('Groq AI Error:', err.message);
  }
}

server.listen(PORT, () => {
  console.log(`🚀 Neural Link running on port ${PORT}`);
});