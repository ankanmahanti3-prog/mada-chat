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
let currentUser = localStorage.getItem('chat_username') || 'Ankan';
localStorage.setItem('chat_username', currentUser);

if (profileUsername) profileUsername.innerText = currentUser;
if (userAvatar) userAvatar.innerText = currentUser.charAt(0).toUpperCase();

// Connect and join room
socket.emit('user connected', currentUser);
socket.emit('join room', currentRoom);

// Drawer Controls
function toggleDrawer(drawer, backdrop, show) {
  if (!drawer || !backdrop) return;
  if (show) {
    backdrop.classList.remove('hidden');
    drawer.classList.remove('-translate-x-full', 'translate-x-full');
  } else {
    backdrop.classList.add('hidden');
    if (drawer === channelsDrawer) drawer.classList.add('-translate-x-full');
    if (drawer === profileDrawer) drawer.classList.add('translate-x-full');
  }
}

if (openChannelsBtn) openChannelsBtn.addEventListener('click', () => toggleDrawer(channelsDrawer, channelsBackdrop, true));
if (closeChannelsBtn) closeChannelsBtn.addEventListener('click', () => toggleDrawer(channelsDrawer, channelsBackdrop, false));
if (channelsBackdrop) channelsBackdrop.addEventListener('click', () => toggleDrawer(channelsDrawer, channelsBackdrop, false));

if (openProfileBtn) openProfileBtn.addEventListener('click', () => toggleDrawer(profileDrawer, profileBackdrop, true));
if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => toggleDrawer(profileDrawer, profileBackdrop, false));
if (profileBackdrop) profileBackdrop.addEventListener('click', () => toggleDrawer(profileDrawer, profileBackdrop, false));

// Channel Switching
channelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetRoom = btn.getAttribute('data-room');
    if (targetRoom && targetRoom !== currentRoom) {
      currentRoom = targetRoom;
      if (headerRoomTitle) headerRoomTitle.innerText = `# ${currentRoom}`;
      
      channelButtons.forEach(b => {
        b.classList.remove('bg-purple-500/10', 'text-purple-300');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-purple-500/10', 'text-purple-300');
      btn.classList.remove('text-slate-400');

      messagesContainer.innerHTML = '';
      if (emptyState) {
        messagesContainer.appendChild(emptyState);
        emptyState.style.display = 'flex';
      }

      socket.emit('join room', currentRoom);
      toggleDrawer(channelsDrawer, channelsBackdrop, false);
    }
  });
});

// Transmit Message Form
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const msgPayload = {
    room: currentRoom,
    username: currentUser,
    message: text
  };

  // Send to socket server
  socket.emit('chat message', msgPayload);
  messageInput.value = '';
});

// Socket Listeners
socket.on('chat history', (history) => {
  messagesContainer.innerHTML = '';
  if (history && history.length > 0) {
    if (emptyState) emptyState.style.display = 'none';
    history.forEach(msg => appendMessage(msg));
  } else if (emptyState) {
    messagesContainer.appendChild(emptyState);
    emptyState.style.display = 'flex';
  }
  scrollToBottom();
});

socket.on('chat message', (msg) => {
  if (msg.room === currentRoom) {
    if (emptyState) emptyState.style.display = 'none';
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

// Render Message
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