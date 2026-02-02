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

// ユーザーデータ管理
const users = {};

io.on('connection', (socket) => {
    console.log(`ユーザー接続: ${socket.id}`);

    // 新規ユーザー参加
    users[socket.id] = {
        id: socket.id,
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0,
        mode: 1,
        motion: 'm_idle1',
        status: 100,
        isActive: false
    };

    // 既存ユーザー情報を送信
    socket.emit('currentUsers', users);

    // 他のユーザーに新規ユーザーを通知
    socket.broadcast.emit('newUser', users[socket.id]);

    // ユーザー位置更新
    socket.on('userMovement', (data) => {
        if (users[socket.id]) {
            users[socket.id].x = data.x;
            users[socket.id].y = data.y;
            users[socket.id].z = data.z;
            users[socket.id].rotationY = data.rotationY;
            users[socket.id].motion = data.motion;
            users[socket.id].mode = data.mode;

            // 他のユーザーに送信
            socket.broadcast.emit('userMoved', users[socket.id]);
        }
    });

    // アクションデータ
    socket.on('userAction', (data) => {
        if (users[socket.id]) {
            users[socket.id].isActive = true;
            
            // アクションを他のユーザーに送信
            socket.broadcast.emit('userActioned', {
                id: socket.id,
                x: data.x,
                y: data.y,
                z: data.z,
                direction: data.direction,
                mode: data.mode,
                motion: data.motion
            });

            // アクション終了
            setTimeout(() => {
                if (users[socket.id]) {
                    users[socket.id].isActive = false;
                }
            }, 800);
        }
    });

    // 特殊効果発射
    socket.on('specialProjectile', (data) => {
        // 全ユーザーに特殊効果弾を送信
        socket.broadcast.emit('newSpecialProjectile', {
            ownerId: socket.id,
            x: data.x,
            y: data.y,
            z: data.z,
            direction: data.direction
        });
    });

    // 影響処理
    socket.on('hitUser', (data) => {
        if (users[data.targetId]) {
            users[data.targetId].status -= data.value;
            
            // 影響を受けたユーザーに通知
            io.to(data.targetId).emit('tookEffect', {
                value: data.value,
                fromId: socket.id,
                newStatus: users[data.targetId].status
            });

            // 送信者に通知
            socket.emit('effectDealt', {
                targetId: data.targetId,
                value: data.value
            });

            // 状態値0になったら
            if (users[data.targetId].status <= 0) {
                users[data.targetId].status = 100; // リセット
                io.to(data.targetId).emit('userReset', {
                    sourceId: socket.id
                });
            }
        }
    });

    // 切断時
    socket.on('disconnect', () => {
        console.log(`ユーザー切断: ${socket.id}`);
        delete users[socket.id];
        io.emit('userDisconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`サーバー起動: http://localhost:${PORT}`);
});
