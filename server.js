const socket = io();

// UI Elements
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const roomButtons = document.querySelectorAll('.room-btn');
const currentRoomTitle = document.getElementById('current-room-title');
const onlineCount = document.getElementById('online-count');
const onlineUsersList = document.getElementById('online-users-list');
const profileUsername = document.getElementById('profile-username');
const userAvatar = document.getElementById('user-avatar');
const themeSelector = document.getElementById('theme-selector');

let currentRoom = 'General Matrix';
let currentUser = localStorage.getItem('chat_username') || null;
let typingTimeout = null;

// Auth Check
if (!currentUser) {
  currentUser = prompt('Enter your callsign/username:') || 'Operator_' + Math.floor(Math.random() * 1000);
  localStorage.setItem('chat_username', currentUser);
}

// Set Profile Info
if (profileUsername) profileUsername.innerText = currentUser;
if (userAvatar) userAvatar.innerText = currentUser.charAt(0).toUpperCase();

// Socket Connection Initialization
socket.emit('user connected', currentUser);
socket.emit('join room', currentRoom);

// Handle Room Selection
roomButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetRoom = btn.getAttribute('data-room');
    if (targetRoom && targetRoom !== currentRoom) {
      currentRoom = targetRoom;
      if (currentRoomTitle) currentRoomTitle.innerText = `# ${currentRoom}`;
      
      // Update Active UI Button Styling
      roomButtons.forEach(b => b.classList.remove('bg-cyan-500/10', 'text-cyan-400', 'border-cyan-500/20'));
      btn.classList.add('bg-cyan-500/10', 'text-cyan-400', 'border-cyan-500/20');

      messagesContainer.innerHTML = '';
      socket.emit('join room', currentRoom);
    }
  });
});

// Transmit Message Handler
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (text) {
    socket.emit('chat message', {
      room: currentRoom,
      username: currentUser,
      message: text
    });
    messageInput.value = '';
    socket.emit('stop typing', { room: currentRoom, username: currentUser });
  }
});

// Typing Listeners
messageInput.addEventListener('input', () => {
  socket.emit('typing', { room: currentRoom, username: currentUser });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop typing', { room: currentRoom, username: currentUser });
  }, 2000);
});

// Socket Receivers
socket.on('chat history', (history) => {
  messagesContainer.innerHTML = '';
  history.forEach(msg => appendMessage(msg));
  scrollToBottom();
});

socket.on('chat message', (msg) => {
  if (msg.room === currentRoom) {
    appendMessage(msg);
    scrollToBottom();
  }
});

socket.on('online users update', (users) => {
  if (onlineCount) onlineCount.innerText = `${users.length} linked`;
  if (onlineUsersList) {
    onlineUsersList.innerHTML = users.map(u => `<li class="flex items-center space-x-2"><span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>${u}</span></li>`).join('');
  }
});

socket.on('user typing', (data) => {
  if (data.room === currentRoom && data.username !== currentUser) {
    typingIndicator.innerText = `${data.username} is typing...`;
  }
});

socket.on('user stop typing', (data) => {
  if (data.room === currentRoom) {
    typingIndicator.innerText = '';
  }
});

// Helper Functions
function appendMessage(msg) {
  const isMe = msg.username === currentUser;
  const isAI = msg.username === 'Neural AI';
  
  const div = document.createElement('div');
  div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} my-2`;

  const metaSpan = `<span class="text-[10px] text-slate-400 mb-1">${msg.username} • ${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
  
  let bgStyle = isMe ? 'bg-cyan-600/30 border-cyan-500/40 text-cyan-100' : 'bg-slate-800/60 border-slate-700 text-slate-200';
  if (isAI) bgStyle = 'bg-purple-900/40 border-purple-500/50 text-purple-200';

  const contentDiv = `<div class="px-3.5 py-2 rounded-xl border text-sm max-w-md backdrop-blur-md ${bgStyle}">${msg.message}</div>`;

  div.innerHTML = metaSpan + contentDiv;
  messagesContainer.appendChild(div);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Theme Selector Accent Switcher
if (themeSelector) {
  themeSelector.addEventListener('change', (e) => {
    const val = e.target.value;
    const colors = {
      cyan: '#00f2fe',
      purple: '#a855f7',
      green: '#22c55e',
      orange: '#f97316',
      red: '#ef4444'
    };
    document.documentElement.style.setProperty('--accent-glow', colors[val] || '#00f2fe');
  });
}