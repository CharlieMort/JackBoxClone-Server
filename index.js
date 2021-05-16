const express = require("express");
const socketIO = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
})

const rooms = {};
const players = {};

/*

----------------------- THINGS TO DO --------------------------------
1. Create Rounds
2. Msg Limit
3. Timer
4. Showcase Convo At End Of Round

GAME STAGES
lobby - when players are in lobby allow joining
game - players can msg and but no joining --countdown 120
showcase - shows off a random convo --countdown 30
nextRound - show next round screen --countdown 10
repeat

*/

function GetConvo(roomCode, id, id2) {
    for (let i = 0; i<rooms[roomCode].conversations.length; i++) {
        if (rooms[roomCode].conversations[i].recipiants.includes(id) && rooms[roomCode].conversations[i].recipiants.includes(id2)) {
            return i;
        } 
    }
    return false;
}

function SendMsg(roomCode, msg, socket, recipiant) {
    let convoIdx = GetConvo(roomCode, socket.id, recipiant);
    if (convoIdx === false) {
        // Create Convo
        rooms[roomCode].conversations.push({
            recipiants: [socket.id, recipiant],
            recipiantsNicks: [players[socket.id], players[recipiant]],
            msgs: []
        });
        convoIdx = GetConvo(roomCode, socket.id, recipiant);
    }
    // Add To Msg Array
    rooms[roomCode].conversations[convoIdx].msgs.push({
        txt: msg,
        sender: socket.id,
        senderNick: players[socket.id]
    });
    let senderIdx = null;
    for (let i = 0; i<rooms[roomCode].players.length; i++) {
        if (rooms[roomCode].players[i].id === socket.id) {
            senderIdx = i;
            break;
        }
    }
    // Oi They Sent A Msg
    io.to(recipiant).emit("NewMsg", senderIdx);
    SendRoomInfo(roomCode);
}

function MakeID(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function CreateRoom() {
    let roomCode = MakeID(5);
    while(rooms.hasOwnProperty(roomCode)) roomCode = MakeID(5);
    rooms[roomCode] = {
        players: [],
        code: roomCode,
        slotsLeft: 6,
        conversations: [],
        started: false,
        round: 0,
        maxRounds: 4,
        stage: "lobby",
        countdownTimer: null,
        showcaseConvo: undefined
    }
    return roomCode;
}

function JoinRoom(roomCode, socket, host) {
    if (rooms.hasOwnProperty(roomCode)) {
        if (rooms[roomCode].slotsLeft > 0) {
            socket.join(roomCode);
            rooms[roomCode].players.push({
                id: socket.id,
                nick: players[socket.id],
                isHost: host
            })
            rooms[roomCode].slotsLeft --;
            return true;
        }
    }
    return false;
}

function Disconnect(socket) {
    delete players[socket.id];
    for (let room in rooms) {
        for (let i = 0; i<rooms[room].players.length; i++) {
            if (rooms[room].players[i].id === socket.id) {
                rooms[room].players.splice(i, 1);
                rooms[room].slotsLeft ++;
                io.to(room).emit("RoomInfo", rooms[room]);
            }
        }
    }
    console.log(`${socket.id} Has Disconnected :(`);
    console.log(`${io.engine.clientsCount} Clients Connected`);
}

function SendRoomInfo(roomCode) {
    let roomClientCopy = Object.assign({}, rooms[roomCode]);
    delete roomClientCopy.countdownTimer;
    io.to(roomCode).emit("RoomInfo", roomClientCopy);
}

function StartGame(roomCode) {
    rooms[roomCode].started = true;
    rooms[roomCode].stage = "game";
    rooms[roomCode].countdownTimer = setTimeout(() => {
        clearTimeout(rooms[roomCode].countdownTimer);
        rooms[roomCode].stage = "showcase";
        let randConvoIdx = Math.floor(Math.random() * rooms[roomCode].conversations.length);
        rooms[roomCode].showcaseConvo = rooms[roomCode].conversations[randConvoIdx];
        SendRoomInfo(roomCode);
    }, 120000)
    SendRoomInfo(roomCode);
}

io.on("connection", (socket) => {
    console.log(`${socket.id} Has Connected`);
    console.log(`${io.engine.clientsCount} Clients Connected`);
    socket.on("CreateNickname", (nick) => {
        if (!players.hasOwnProperty(socket.id)) {
            players[socket.id] = nick;
        }
    })
    socket.on("CreateRoom", () => {
        let roomCode = CreateRoom();
        socket.join(roomCode);
        SendRoomInfo(roomCode);
    })
    socket.on("JoinRoom", (roomCode) => {
        if (JoinRoom(roomCode, socket, false)) {
            SendRoomInfo(roomCode);
        }
    })
    socket.on("SendMsg", (roomCode, msg, recipiant) => {
        SendMsg(roomCode, msg, socket, recipiant);
    })
    socket.on("StartGame", (roomCode) => {
        StartGame(roomCode);
    })
    socket.on("disconnect", () => {
        Disconnect(socket);
    })
});

server.listen(PORT, () => console.log(`Server Listening On Port: ${PORT}`));