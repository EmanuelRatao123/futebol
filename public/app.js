const socket = io();

let myUser = null;
let currentPrivateTarget = null;
let isPlaying = false;
let currentChallengerId = null;

function login() {
    const username = document.getElementById('username-input').value.trim();
    if (username.length < 3) return alert('O nome deve ter pelo menos 3 letras.');
    socket.emit('login', username);
}

socket.on('login_success', (user) => {
    myUser = user;
    document.getElementById('login-screen').classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-interface').classList.remove('hidden');
    }, 300);
    
    document.getElementById('my-username').innerText = user.username;
    document.getElementById('my-pts').innerText = `${user.points} PTS`;
    document.getElementById('my-wins').innerText = `${user.wins} V`;
    document.getElementById('my-losses').innerText = `${user.losses} D`;
});

// Chats
function appendMessage(containerId, data, type) {
    const chat = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = `max-w-[85%] p-2.5 text-sm shadow-md ${type}`;
    
    if (type === 'chat-sys') {
        div.innerText = data.text;
    } else {
        div.innerHTML = `<span class="font-bold block text-[10px] uppercase opacity-70 mb-0.5">${data.sender}</span>${data.text}`;
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function sendGlobalMsg() {
    const input = document.getElementById('global-msg-input');
    if (input.value.trim()) {
        socket.emit('send_global_message', input.value.trim());
        input.value = '';
    }
}
document.getElementById('global-msg-input').addEventListener('keypress', (e) => { if(e.key==='Enter') sendGlobalMsg(); });

socket.on('global_message', (msg) => {
    let type = 'chat-other';
    if(msg.senderId === 'sys') type = 'chat-sys';
    else if(myUser && msg.senderId === myUser.id) type = 'chat-me';
    appendMessage('global-chat', msg, type);
});

function selectPrivateTarget(id, name) {
    if (id === myUser.id) return;
    currentPrivateTarget = id;
    document.getElementById('private-overlay').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('private-target-name').innerText = name;
    document.getElementById('private-msg-input').disabled = false;
    document.getElementById('btn-private').disabled = false;
    document.getElementById('private-msg-input').focus();
}

function sendPrivateMsg() {
    const input = document.getElementById('private-msg-input');
    if (input.value.trim() && currentPrivateTarget) {
        socket.emit('send_private_message', { toUserId: currentPrivateTarget, text: input.value.trim() });
        input.value = '';
    }
}
document.getElementById('private-msg-input').addEventListener('keypress', (e) => { if(e.key==='Enter') sendPrivateMsg(); });

socket.on('private_message', (msg) => {
    // Auto-focus se vier de outro
    if(!msg.isMe && currentPrivateTarget !== msg.senderId) {
        selectPrivateTarget(msg.senderId, msg.sender);
    }
    const type = msg.isMe ? 'chat-me' : 'chat-other';
    appendMessage('private-chat', msg, type);
});

// Ranking & Online
socket.on('update_ranking', (users) => {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '';
    users.forEach((u, i) => {
        if(myUser && u.username === myUser.username) {
            document.getElementById('my-pts').innerText = `${u.points} PTS`;
            document.getElementById('my-wins').innerText = `${u.wins} V`;
            document.getElementById('my-losses').innerText = `${u.losses} D`;
        }
        const isTop3 = i < 3;
        const color = i === 0 ? 'text-yellow-400' : (i===1 ? 'text-gray-300' : (i===2 ? 'text-amber-600' : 'text-gray-400'));
        const icon = i === 0 ? '🏆' : (i===1 ? '🥈' : (i===2 ? '🥉' : `#${i+1}`));
        
        list.innerHTML += `
        <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex justify-between items-center player-card">
            <div class="flex items-center gap-3">
                <span class="${color} font-bold text-lg w-6 text-center">${icon}</span>
                <span class="font-bold text-white">${u.username}</span>
            </div>
            <span class="text-[#00ff88] font-bold text-sm bg-[#00ff88]/10 px-2 py-1 rounded">${u.points} pts</span>
        </div>`;
    });
});

socket.on('update_online_users', (users) => {
    const list = document.getElementById('online-list');
    list.innerHTML = '';
    users.forEach(u => {
        if (myUser && u.id === myUser.id) return;
        list.innerHTML += `
        <div class="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between player-card">
            <span class="font-bold text-white truncate mb-2">${u.username}</span>
            <div class="flex gap-2 w-full">
                <button onclick="challenge('${u.id}')" class="flex-1 bg-emerald-600/20 text-[#00ff88] hover:bg-[#00ff88] hover:text-black border border-[#00ff88]/30 transition rounded text-xs font-bold py-1.5 flex items-center justify-center gap-1">
                    <i data-lucide="swords" class="w-3 h-3"></i> Duel
                </button>
                <button onclick="selectPrivateTarget('${u.id}', '${u.username}')" class="flex-1 bg-blue-600/20 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-400/30 transition rounded text-xs font-bold py-1.5 flex items-center justify-center gap-1">
                    <i data-lucide="message-circle" class="w-3 h-3"></i> DM
                </button>
            </div>
        </div>`;
    });
    lucide.createIcons();
});

// Sistema de Jogo
function challenge(id) {
    if(isPlaying) return alert("Você já está em campo!");
    socket.emit('challenge_player', id);
    // Notificação visual simples
    const btn = event.currentTarget;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Enviado`;
    btn.classList.add('bg-[#00ff88]', 'text-black');
    setTimeout(() => { btn.innerHTML = oldText; btn.classList.remove('bg-[#00ff88]', 'text-black'); lucide.createIcons();}, 2000);
}

socket.on('match_challenge', (data) => {
    if(isPlaying) return;
    currentChallengerId = data.challengerId;
    document.getElementById('challenger-name-display').innerText = data.challengerName;
    document.getElementById('invite-modal').classList.remove('hidden');
    document.getElementById('invite-modal').classList.add('flex');
});

document.getElementById('btn-decline').addEventListener('click', () => {
    document.getElementById('invite-modal').classList.add('hidden');
    document.getElementById('invite-modal').classList.remove('flex');
    currentChallengerId = null;
});

document.getElementById('btn-accept').addEventListener('click', () => {
    if(currentChallengerId) {
        socket.emit('accept_challenge', currentChallengerId);
        document.getElementById('invite-modal').classList.add('hidden');
        document.getElementById('invite-modal').classList.remove('flex');
    }
});

socket.on('match_start', (data) => {
    isPlaying = true;
    document.getElementById('waiting-panel').classList.add('hidden');
    document.getElementById('match-panel').classList.remove('hidden');
    document.getElementById('team1-name').innerText = data.p1;
    document.getElementById('team2-name').innerText = data.p2;
    document.getElementById('score1').innerText = '0';
    document.getElementById('score2').innerText = '0';
    document.getElementById('match-events').innerHTML = '';
    document.getElementById('match-progress').style.width = '0%';
});

socket.on('match_update', (data) => {
    document.getElementById('match-progress').style.width = `${(data.minute / 90) * 100}%`;
    document.getElementById('match-time').innerText = `${data.minute}'`;
    document.getElementById('score1').innerText = data.score1;
    document.getElementById('score2').innerText = data.score2;
    
    document.getElementById('stat-pos1-bar').style.width = data.stats.possession1 + '%';
    document.getElementById('stat-pos2-bar').style.width = data.stats.possession2 + '%';
    document.getElementById('stat-pos1').innerText = data.stats.possession1 + '%';
    document.getElementById('stat-pos2').innerText = data.stats.possession2 + '%';
    
    document.getElementById('stat-shots1').innerText = data.stats.shots1;
    document.getElementById('stat-shots2').innerText = data.stats.shots2;

    if (data.event) {
        const evDiv = document.getElementById('match-events');
        const colorClass = data.event.isGoal ? 'text-[#00ff88] font-bold text-base' : 'text-gray-300 text-sm';
        const icon = data.event.isGoal ? '⚽' : '👟';
        evDiv.innerHTML += `
            <div class="flex gap-3 items-center border-b border-white/5 pb-2 animate-[slideIn_0.3s_ease-out]">
                <span class="text-xs font-bold text-gray-500 w-6 text-right">${data.event.min}'</span>
                <span class="${colorClass}">${icon} ${data.event.text}</span>
            </div>`;
        evDiv.scrollTop = evDiv.scrollHeight;

        if(data.event.isGoal) {
            const stadium = document.getElementById('stadium-container');
            stadium.classList.add('goal-flash');
            setTimeout(() => stadium.classList.remove('goal-flash'), 1000);
        }
    }
});

// Keyframe fallback via JS pra facilitar
const style = document.createElement('style');
style.innerHTML = `@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }`;
document.head.appendChild(style);

socket.on('match_end', (data) => {
    isPlaying = false;
    document.getElementById('match-time').innerText = 'FIM';
    document.getElementById('match-progress').style.width = '100%';
    
    setTimeout(() => {
        const won = data.score1 > data.score2 && data.p1 === myUser.username || data.score2 > data.score1 && data.p2 === myUser.username;
        const draw = data.score1 === data.score2;
        
        let msg = draw ? 'EMPATE!' : (won ? 'VITÓRIA!' : 'DERROTA...');
        alert(`FIM DE JOGO: ${msg}\n${data.p1} ${data.score1} x ${data.score2} ${data.p2}`);
        
        document.getElementById('match-panel').classList.add('hidden');
        document.getElementById('waiting-panel').classList.remove('hidden');
    }, 2000);
});
