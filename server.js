const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// 静的ファイル提供
app.use(express.static(path.join(__dirname, 'public')));

// プレイヤーデータ管理
const players = {};

io.on('connection', (socket) => {
    console.log(`プレイヤー接続: ${socket.id}`);

    // 新規プレイヤー参加
    players[socket.id] = {
        id: socket.id,
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0,
        mode: 1,
        motion: 'm_idle1',
        health: 100,
        isAttacking: false
    };

    // 既存プレイヤー情報を送信
    socket.emit('currentPlayers', players);

    // 他のプレイヤーに新規プレイヤーを通知
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // プレイヤー位置更新
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rotationY = data.rotationY;
            players[socket.id].motion = data.motion;
            players[socket.id].mode = data.mode;

            // 他のプレイヤーに送信
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 攻撃データ
    socket.on('playerAttack', (data) => {
        if (players[socket.id]) {
            players[socket.id].isAttacking = true;
            
            // 攻撃を他のプレイヤーに送信
            socket.broadcast.emit('playerAttacked', {
                id: socket.id,
                x: data.x,
                y: data.y,
                z: data.z,
                direction: data.direction,
                mode: data.mode,
                motion: data.motion
            });

            // 攻撃終了
            setTimeout(() => {
                if (players[socket.id]) {
                    players[socket.id].isAttacking = false;
                }
            }, 800);
        }
    });

    // 魔法発射
    socket.on('magicProjectile', (data) => {
        // 全プレイヤーに魔法弾を送信
        socket.broadcast.emit('newMagicProjectile', {
            ownerId: socket.id,
            x: data.x,
            y: data.y,
            z: data.z,
            direction: data.direction
        });
    });

    // ダメージ処理
    socket.on('hitPlayer', (data) => {
        if (players[data.targetId]) {
            players[data.targetId].health -= data.damage;
            
            // ダメージを受けたプレイヤーに通知
            io.to(data.targetId).emit('tookDamage', {
                damage: data.damage,
                fromId: socket.id,
                newHealth: players[data.targetId].health
            });

            // 攻撃者に通知
            socket.emit('damageDealt', {
                targetId: data.targetId,
                damage: data.damage
            });

            // 体力0になったら
            if (players[data.targetId].health <= 0) {
                players[data.targetId].health = 100; // リスポーン
                io.to(data.targetId).emit('playerDied', {
                    killerId: socket.id
                });
            }
        }
    });

    // 切断時
    socket.on('disconnect', () => {
        console.log(`プレイヤー切断: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`サーバー起動: http://localhost:${PORT}`);
});
