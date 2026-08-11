const socket = io();

const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const roomButtons = document.querySelectorAll('.room-btn');
const currentRoomTitle = document.getElementById('current-room-title');
const onlineCount = document.getElementById('online-count');
const onlineUsersList = document.getElementById('online-users-list');

let currentRoom = 'General Matrix';
let currentUser = localStorage.getItem('chat_username') || null;

if (!currentUser) {
  currentUser = prompt('Enter your callsign/username:') || 'Operator_' + Math.floor(Math.random() * 1000);
  localStorage.setItem('chat_username', currentUser);
}

socket.emit('user connected', currentUser);
socket.emit('join room', currentRoom);

roomButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetRoom = btn.getAttribute('data-room');
    if (targetRoom && targetRoom !== currentRoom) {
      currentRoom = targetRoom;
      if (currentRoomTitle) currentRoomTitle.innerText = `# ${currentRoom}`;
      messagesContainer.innerHTML = '';
      socket.emit('join room', currentRoom);
    }
  });
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (text) {
    socket.emit('chat message', { room: currentRoom, username: currentUser, message: text });
    messageInput.value = '';
  }
});

socket.on('chat history', (history) => {
  messagesContainer.innerHTML = '';
  history.forEach(msg => appendMessage(msg));
});

socket.on('chat message', (msg) => {
  if (msg.room === currentRoom) appendMessage(msg);
});

function appendMessage(msg) {
  const isMe = msg.username === currentUser;
  const div = document.createElement('div');
  div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} my-2`;
  div.innerHTML = `<span class="text-[10px] text-slate-400 mb-1">${msg.username}</span>
                   <div class="px-3.5 py-2 rounded-xl border text-sm max-w-md ${isMe ? 'bg-cyan-600/30 border-cyan-500/40 text-cyan-100' : 'bg-slate-800/60 border-slate-700 text-slate-200'}">${msg.message}</div>`;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}