const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite',
    logging: false
});

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    points: { type: DataTypes.INTEGER, defaultValue: 1000 },
    wins: { type: DataTypes.INTEGER, defaultValue: 0 },
    losses: { type: DataTypes.INTEGER, defaultValue: 0 },
    avatar: { type: DataTypes.STRING, defaultValue: '⚽' }
});

const MatchHistory = sequelize.define('MatchHistory', {
    player1: DataTypes.STRING, player2: DataTypes.STRING,
    score1: DataTypes.INTEGER, score2: DataTypes.INTEGER,
    details: DataTypes.TEXT
});

sequelize.sync().then(() => console.log('Banco de dados SQL sincronizado.'));

let onlineUsers = {}; 
let connectedSockets = {}; 

io.on('connection', (socket) => {
    socket.on('login', async (username) => {
        let [user] = await User.findOrCreate({ where: { username } });
        onlineUsers[socket.id] = user;
        connectedSockets[user.id] = socket;
        
        socket.emit('login_success', user);
        io.emit('global_message', { sender: 'Sistema', senderId: 'sys', text: `${username} entrou na arena.` });
        broadcastRanking();
        broadcastOnlineUsers();
    });

    socket.on('send_global_message', (text) => {
        const user = onlineUsers[socket.id];
        if (user) io.emit('global_message', { sender: user.username, senderId: user.id, text });
    });

    socket.on('send_private_message', async ({ toUserId, text }) => {
        const sender = onlineUsers[socket.id];
        const targetSocket = connectedSockets[toUserId];
        if (sender && targetSocket) {
            targetSocket.emit('private_message', { sender: sender.username, senderId: sender.id, text });
            socket.emit('private_message', { sender: 'Você', senderId: sender.id, text, isMe: true, toId: toUserId });
        }
    });

    socket.on('challenge_player', (targetId) => {
        const challenger = onlineUsers[socket.id];
        const targetSocket = connectedSockets[targetId];
        if (challenger && targetSocket) {
            targetSocket.emit('match_challenge', { challengerId: challenger.id, challengerName: challenger.username });
        }
    });

    socket.on('accept_challenge', (challengerId) => {
        const p2 = onlineUsers[socket.id];
        const p1Socket = connectedSockets[challengerId];
        const p1 = onlineUsers[p1Socket.id];
        if (p1 && p2 && p1Socket) startSimulation(p1, p2, p1Socket, socket);
    });

    socket.on('disconnect', () => {
        const user = onlineUsers[socket.id];
        if (user) {
            delete connectedSockets[user.id];
            delete onlineUsers[socket.id];
            broadcastOnlineUsers();
        }
    });

    async function broadcastRanking() {
        const users = await User.findAll({ order: [['points', 'DESC'], ['wins', 'DESC']], limit: 10 });
        io.emit('update_ranking', users);
    }

    function broadcastOnlineUsers() {
        const users = Object.values(onlineUsers).map(u => ({ id: u.id, username: u.username }));
        io.emit('update_online_users', users);
    }
});

function startSimulation(p1, p2, socket1, socket2) {
    io.to(socket1.id).emit('match_start', { p1: p1.username, p2: p2.username });
    io.to(socket2.id).emit('match_start', { p1: p1.username, p2: p2.username });

    let minute = 0; let s1 = 0, s2 = 0;
    let stats = { possession1: 50, possession2: 50, shots1: 0, shots2: 0 };
    let events = [];

    const interval = setInterval(async () => {
        minute += 3; // Mais rápido para ser dinâmico
        let eventMsg = null;
        let isGoal = false;

        stats.possession1 = 40 + Math.floor(Math.random() * 20);
        stats.possession2 = 100 - stats.possession1;

        if (Math.random() > 0.88) {
            s1++; stats.shots1++; isGoal = true;
            eventMsg = `GOOOOOL! ${p1.username} fuzila as redes! ⚽🔥`;
        } else if (Math.random() > 0.88) {
            s2++; stats.shots2++; isGoal = true;
            eventMsg = `GOOOOOL! ${p2.username} marca um golaço! ⚽🔥`;
        } else if (Math.random() > 0.75) {
            stats.shots1++;
            eventMsg = `Uhhh! ${p1.username} acerta a trave!`;
        } else if (Math.random() > 0.75) {
            stats.shots2++;
            eventMsg = `Defesaça! Goleiro de ${p2.username} salva o time!`;
        }

        if (eventMsg) events.push({ min: minute, text: eventMsg, isGoal });

        const state = { minute, score1: s1, score2: s2, event: eventMsg ? { min: minute, text: eventMsg, isGoal } : null, stats };
        io.to(socket1.id).emit('match_update', state);
        io.to(socket2.id).emit('match_update', state);

        if (minute >= 90) {
            clearInterval(interval);
            let winnerId = null;
            if (s1 > s2) winnerId = p1.id;
            else if (s2 > s1) winnerId = p2.id;

            const finalData = { score1: s1, score2: s2, p1: p1.username, p2: p2.username };
            io.to(socket1.id).emit('match_end', finalData);
            io.to(socket2.id).emit('match_end', finalData);

            await MatchHistory.create({ player1: p1.username, player2: p2.username, score1: s1, score2: s2, details: JSON.stringify(events) });

            if (winnerId === p1.id) { p1.points += 25; p1.wins++; p2.points -= 10; p2.losses++; }
            else if (winnerId === p2.id) { p2.points += 25; p2.wins++; p1.points -= 10; p1.losses++; }
            else { p1.points += 5; p2.points += 5; }

            await User.update({ points: p1.points, wins: p1.wins, losses: p1.losses }, { where: { id: p1.id } });
            await User.update({ points: p2.points, wins: p2.wins, losses: p2.losses }, { where: { id: p2.id } });
            
            const users = await User.findAll({ order: [['points', 'DESC'], ['wins', 'DESC']], limit: 10 });
            io.emit('update_ranking', users);
        }
    }, 500); 
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
