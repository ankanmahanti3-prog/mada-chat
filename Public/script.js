const socket = io();

// UI References
const messagesContainer = document.getElementById('messages-container');
const emptyState = document.getElementById('empty-state');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const headerRoomTitle = document.getElementById('header-room-title');
const channelButtons = document.querySelectorAll('.channel-btn');
const profileUsername = document.getElementById('profile-username');
const userAvatar = document.getElementById('user-avatar');
const onlineUsersList = document.getElementById('online-users-list');

// Drawer Elements
const openChannelsBtn = document.getElementById('open-channels-btn');
const closeChannelsBtn = document.getElementById('close-channels-btn');
const channelsDrawer = document.getElementById('channels-drawer');
const channelsBackdrop = document.getElementById('channels-drawer-backdrop');

const openProfileBtn = document.getElementById('open-profile-btn');
const closeProfileBtn = document.getElementById('close-profile-btn');
const profileDrawer = document.getElementById('profile-drawer');
const profileBackdrop = document.getElementById('profile-drawer-backdrop');

let currentRoom = 'General';
let currentUser = localStorage.getItem('chat_username');
let typingTimeout = null;

// Auth check
if (!currentUser) {
  currentUser = prompt('Enter your callsign / username:') || 'Operator_' + Math.floor(Math.random() * 1000);
  localStorage.setItem('chat_username', currentUser);
}

if (profileUsername) profileUsername.innerText = currentUser;
if (userAvatar) userAvatar.innerText = currentUser.charAt(0).toUpperCase();

// Initialize Socket
socket.emit('user connected', currentUser);
socket.emit('join room', currentRoom);

// Drawer Toggle Logic
function toggleDrawer(drawer, backdrop, show) {
  if (show) {
    backdrop.classList.remove('hidden');
    drawer.classList.remove('-translate-x-full', 'translate-x-full');
  } else {
    backdrop.classList.add('hidden');
    if (drawer === channelsDrawer) drawer.classList.add('-translate-x-full');
    if (drawer === profileDrawer) drawer.classList.add('translate-x-full');
  }
}

openChannelsBtn.addEventListener('click', () => toggleDrawer(channelsDrawer, channelsBackdrop, true));
closeChannelsBtn.addEventListener('click', () => toggleDrawer(channelsDrawer, channelsBackdrop, false));
channelsBackdrop.addEventListener('click', () => toggleDrawer(channelsDrawer, channelsBackdrop, false));

openProfileBtn.addEventListener('click', () => toggleDrawer(profileDrawer, profileBackdrop, true));
closeProfileBtn.addEventListener('click', () => toggleDrawer(profileDrawer, profileBackdrop, false));
profileBackdrop.addEventListener('click', () => toggleDrawer(profileDrawer, profileBackdrop, false));

// Channel Switching
channelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetRoom = btn.getAttribute('data-room');
    if (targetRoom && targetRoom !== currentRoom) {
      currentRoom = targetRoom;
      headerRoomTitle.innerText = `# ${currentRoom}`;
      
      channelButtons.forEach(b => {
        b.classList.remove('bg-purple-500/10', 'text-purple-300');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-purple-500/10', 'text-purple-300');
      btn.classList.remove('text-slate-400');

      // Clear feed and show empty state
      messagesContainer.innerHTML = '';
      messagesContainer.appendChild(emptyState);
      emptyState.style.display = 'flex';

      socket.emit('join room', currentRoom);
      toggleDrawer(channelsDrawer, channelsBackdrop, false);
    }
  });
});

// Transmit Message
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

// Typing Events
messageInput.addEventListener('input', () => {
  socket.emit('typing', { room: currentRoom, username: currentUser });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop typing', { room: currentRoom, username: currentUser });
  }, 1500);
});

// Socket Listeners
socket.on('chat history', (history) => {
  messagesContainer.innerHTML = '';
  if (history && history.length > 0) {
    emptyState.style.display = 'none';
    history.forEach(msg => appendMessage(msg));
  } else {
    messagesContainer.appendChild(emptyState);
    emptyState.style.display = 'flex';
  }
  scrollToBottom();
});

socket.on('chat message', (msg) => {
  if (msg.room === currentRoom) {
    emptyState.style.display = 'none';
    appendMessage(msg);
    scrollToBottom();
  }
});

socket.on('online users update', (users) => {
  if (onlineUsersList) {
    onlineUsersList.innerHTML = users.map(u => `
      <li class="flex items-center space-x-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span>${u}</span>
      </li>
    `).join('');
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

// Render Message Card
function appendMessage(msg) {
  const isMe = msg.username === currentUser;
  const isAI = msg.username === 'Neural AI';

  const div = document.createElement('div');
  div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1.5`;

  const metaSpan = `<span class="text-[10px] text-slate-500 mb-0.5 px-1">${msg.username}</span>`;
  
  let bubbleStyle = isMe 
    ? 'bg-[#7c3aed] text-white rounded-2xl rounded-tr-sm' 
    : 'bg-[#181924] text-slate-200 border border-white/5 rounded-2xl rounded-tl-sm';
    
  if (isAI) {
    bubbleStyle = 'bg-cyan-950/40 text-cyan-200 border border-cyan-500/30 rounded-2xl';
  }

  const contentDiv = `<div class="px-3.5 py-2 text-sm max-w-[85%] leading-relaxed ${bubbleStyle}">${msg.message}</div>`;

  div.innerHTML = metaSpan + contentDiv;
  messagesContainer.appendChild(div);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}