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

// -------------Sending PM's------------------
/*

{
    players: [
        {
            nick,
            id
        }
    ],
    code,
    conversations: [
        convo {
            recipiants: [socketID1, socketID2],
            msgs: [
                msg {
                    txt: "Oooo Hiya",
                    sender: socketID2
                },
                msg {
                    txt: "Hiya Sexy",
                    sender: socketID1
                }
            ]
        }
    ]
}

STEPS TO SENDING A MSG

1. Oi i wanna send a msg
2. Ok ummm well who to
3. is there already a convo open
4. No? wow your social.
4.1 Lets make a new convo
4.2 add recipiants
5. Push msg to msgs
6. Oi these cunts sent a new msg

*/

function GetConvo(roomCode, id, id2) {
    console.log(rooms[roomCode]);
    console.log(roomCode);
    for (let i = 0; i<rooms[roomCode].conversations.length; i++) {
        if (rooms[roomCode].conversations[i].recipiants.includes(id) && rooms[roomCode].conversations[i].recipiants.includes(id2)) {
            return i;
        } 
    }
    return false;
}

function SendMsg(roomCode, msg, socket, recipiant) {
    let convoIdx = GetConvo(roomCode, socket.id, recipiant);
    console.log("Conversation Index :"+convoIdx);
    if (convoIdx === false) {
        // Create Convo
        rooms[roomCode].conversations.push({
            recipiants: [socket.id, recipiant],
            msgs: []
        });
        convoIdx = GetConvo(roomCode, socket.id, recipiant);
        console.log("Conversation Index :"+convoIdx);
    }
    // Add To Msg Array
    rooms[roomCode].conversations[convoIdx].msgs.push({
        txt: msg,
        sender: socket.id,
        senderNick: players[socket.id]
    });
    console.log("\n ----------------------------ROOMS-----------------------------");
    console.log(JSON.stringify(rooms, null, 2));
    // Oi They Sent A Msg
    io.to(recipiant).emit("SentMsgFrom", socket.id);
    io.to(roomCode).emit("RoomInfo", rooms[roomCode]);
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
        started: false
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
            console.log("\n ----------------------------ROOMS-----------------------------");
            console.log(JSON.stringify(rooms, null, 2));
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
    console.log("\n ----------------------------ROOMS-----------------------------");
    console.log(JSON.stringify(rooms, null, 2));
    console.log(`${socket.id} Has Disconnected :(`);
    console.log(`${io.engine.clientsCount} Clients Connected`);
}

io.on("connection", (socket) => {
    console.log(`${socket.id} Has Connected`);
    console.log(`${io.engine.clientsCount} Clients Connected`);
    socket.on("CreateNickname", (nick) => {
        if (!players.hasOwnProperty(socket.id)) {
            players[socket.id] = nick;
            console.log(JSON.stringify(players, null, 2));
        }
    })
    socket.on("CreateRoom", () => {
        let roomCode = CreateRoom();
        if (JoinRoom(roomCode, socket, true)) {
            io.to(roomCode).emit("RoomInfo", rooms[roomCode]);
        }
    })
    socket.on("JoinRoom", (roomCode) => {
        if (JoinRoom(roomCode, socket, false)) {
            io.to(roomCode).emit("RoomInfo", rooms[roomCode]);
        }
    })
    socket.on("SendMsg", (roomCode, msg, recipiant) => {
        SendMsg(roomCode, msg, socket, recipiant);
    })
    socket.on("StartGame", (roomCode) => {
        rooms[roomCode].started = true;
        io.to(roomCode).emit("RoomInfo", rooms[roomCode]);
    })
    socket.on("disconnect", () => {
        Disconnect(socket);
    })
});

server.listen(PORT, () => console.log(`Server Listening On Port: ${PORT}`));