const socket = io();

// UI Elements
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const chatHeaderTitle = document.getElementById('chat-header-title');
const roomButtons = document.querySelectorAll('.room-btn');

// User profile elements
const footerUsername = document.getElementById('footer-username');
const footerHandle = document.getElementById('footer-handle');
const footerAvatar = document.getElementById('footer-user-avatar');
const rightProfileUsername = document.getElementById('right-profile-username');
const rightUserAvatar = document.getElementById('right-user-avatar');

let currentRoom = 'General';
let currentUser = localStorage.getItem('chat_username') || 'Test6';
localStorage.setItem('chat_username', currentUser);

// Populate user profile info
function setUserProfile(name) {
  if (footerUsername) footerUsername.innerText = name;
  if (footerHandle) footerHandle.innerText = `@${name.toLowerCase().replace(/\s+/g, '')}`;
  if (footerAvatar) footerAvatar.innerText = name.substring(0, 2).toUpperCase();
  if (rightProfileUsername) rightProfileUsername.innerText = name;
  if (rightUserAvatar) rightUserAvatar.innerText = name.substring(0, 2).toUpperCase();
}
setUserProfile(currentUser);

// Join default channel
socket.emit('user connected', currentUser);
socket.emit('join room', currentRoom);

// Channel switching
roomButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetRoom = btn.getAttribute('data-room');
    if (targetRoom && targetRoom !== currentRoom) {
      currentRoom = targetRoom;
      chatHeaderTitle.innerHTML = `<span># ${currentRoom}</span>`;

      roomButtons.forEach(b => {
        b.className = 'room-btn w-full flex items-center px-3 py-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-slate-200 text-xs';
      });
      btn.className = 'room-btn w-full flex items-center justify-between px-3 py-2 rounded-xl bg-purple-600 text-white font-medium shadow-md shadow-purple-600/30 text-xs';

      messagesContainer.innerHTML = '';
      socket.emit('join room', currentRoom);
    }
  });
});

// Transmit Message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const msgPayload = {
    room: currentRoom,
    username: currentUser,
    message: text
  };

  socket.emit('chat message', msgPayload);
  messageInput.value = '';
});

// Socket Listeners
socket.on('chat history', (history) => {
  messagesContainer.innerHTML = '';
  if (history && history.length > 0) {
    history.forEach(msg => appendMessage(msg));
  } else {
    // Show welcome interactive AI assistant message if channel is fresh
    renderAIWelcome();
  }
  scrollToBottom();
});

socket.on('chat message', (msg) => {
  if (msg.room === currentRoom) {
    appendMessage(msg);
    scrollToBottom();
  }
});

// Render dynamic Cyber / AI Message Bubble
function appendMessage(msg) {
  const isMe = msg.username === currentUser;
  const isAI = msg.username === 'Neural AI' || msg.username === 'Nova (AI)';
  const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const wrapper = document.createElement('div');
  wrapper.className = `flex ${isMe ? 'justify-end' : 'justify-start'} items-start space-x-3 my-2`;

  if (isAI) {
    wrapper.innerHTML = `
      <div class="w-9 h-9 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0">
        AI
      </div>
      <div class="max-w-[75%] bg-[#0e1726]/80 rounded-2xl p-4 neon-border-ai text-slate-200 text-xs leading-relaxed space-y-3 backdrop-blur-md">
        <div class="flex items-center space-x-2">
          <span class="font-bold text-cyan-400">Nova (AI)</span>
          <span class="bg-cyan-500/20 text-cyan-300 text-[9px] font-bold px-1.5 py-0.5 rounded">AI</span>
        </div>
        <div>${msg.message}</div>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <button onclick="sendQuickPrompt('Summarize')" class="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg text-[10px]">Summarize</button>
          <button onclick="sendQuickPrompt('Explain')" class="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg text-[10px]">Explain</button>
          <button onclick="sendQuickPrompt('Code')" class="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg text-[10px]">Code</button>
          <button onclick="sendQuickPrompt('Analyze')" class="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg text-[10px]">Analyze</button>
        </div>
        <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1">
          <div class="flex space-x-2">
            <span class="hover:text-rose-400 cursor-pointer">❤️ 12</span>
            <span class="hover:text-amber-400 cursor-pointer">🔥 7</span>
            <span class="hover:text-cyan-400 cursor-pointer">🚀 3</span>
          </div>
          <span>${timeStr}</span>
        </div>
      </div>
    `;
  } else if (isMe) {
    wrapper.innerHTML = `
      <div class="max-w-[70%] bg-[#1a1233]/90 rounded-2xl p-3.5 neon-border-user text-slate-100 text-xs leading-relaxed space-y-1">
        <div class="flex justify-between items-center text-[10px] text-purple-300/80 mb-1">
          <span class="font-semibold">${msg.username}</span>
          <span class="text-[9px]">${timeStr} ✓✓</span>
        </div>
        <div>${msg.message}</div>
      </div>
    `;
  } else {
    wrapper.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-purple-600/20 text-purple-300 flex items-center justify-center font-bold text-xs flex-shrink-0">
        ${msg.username.substring(0, 2).toUpperCase()}
      </div>
      <div class="max-w-[70%] bg-[#121422] rounded-2xl p-3.5 border border-white/5 text-slate-200 text-xs space-y-1">
        <div class="flex justify-between items-center text-[10px] text-slate-400 mb-1">
          <span class="font-semibold text-slate-300">${msg.username}</span>
          <span class="text-[9px] text-slate-500">${timeStr}</span>
        </div>
        <div>${msg.message}</div>
      </div>
    `;
  }

  messagesContainer.appendChild(wrapper);
}

function renderAIWelcome() {
  const welcomePayload = {
    room: currentRoom,
    username: 'Nova (AI)',
    message: "Hello! 👋 I'm Neural AI, your advanced cybernetic assistant. I can help you with anything: coding, research, summaries, images, data, and more. What would you like to explore today?",
    timestamp: Date.now()
  };
  appendMessage(welcomePayload);
}

// Quick Suggestion Chips Handler
window.sendQuickPrompt = function(action) {
  const prompt = `@AI ${action} the latest neural network updates`;
  socket.emit('chat message', {
    room: currentRoom,
    username: currentUser,
    message: prompt
  });
};

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}