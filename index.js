const express = require("express");
const socketIO = require("socket.io");
const http = require("http");
const cors = require("cors");
const path = require("path");

const PORT = process.env.PORT || 5000;
const app = express();

app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, './build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, './build/index.html'));
});

const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
})

const rooms = {};
const players = {};

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
        round: 1,
        maxRounds: 4,
        stage: "lobby",
        countdownTimer: null,
        showcaseConvo: undefined,
        matches: {},
        matchOutcomes: [],
        leaderBoard: []
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
                isHost: host,
                score: 0,
                idx: rooms[roomCode].players.length
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
        rooms[roomCode].stage = "matches";
        rooms[roomCode].countdownTimer = setTimeout(() => {
            rooms[roomCode].stage = "showcase";
            clearTimeout(rooms[roomCode].countdownTimer);
        }, 30000)
        let randConvoIdx = Math.floor(Math.random() * rooms[roomCode].conversations.length);
        rooms[roomCode].showcaseConvo = rooms[roomCode].conversations[randConvoIdx];
        SendRoomInfo(roomCode);
    }, 120000)
    SendRoomInfo(roomCode);
}

function GetPlayerByID(roomCode, id) {
    for (let player of rooms[roomCode].players) {
        if (player.id === id) return player;
    }
}

function Compare(a, b) {
    if (a.score < b.score) return 1;
    if (a.score > b.score) return -1;
    return 0;
}

function SortLeaderBoard(roomCode) {
    rooms[roomCode].leaderBoard = rooms[roomCode].players.sort(Compare);
}

function DetermineMatchOutcome(roomCode) {
    for (let match in rooms[roomCode].matches) {
        console.log(`ME: ${match}  THEM:${rooms[roomCode].matches[match].id}`);
        // if they matched with eachother
        if (rooms[roomCode].matches[rooms[roomCode].matches[match].id].id === match) {
            console.log("Accepted");
            let alreadyMatched = false;
            // have the match already been added to match outcomes
            for (let outcome of rooms[roomCode].matchOutcomes) {
                let hasBoth = true;
                for (let player of outcome.players) {
                    if (player.id !== match && player.id !== rooms[roomCode].matches[match].id) {
                        hasBoth = false;
                    }
                }
                if (hasBoth) {
                    alreadyMatched = true;
                    break;
                }
            }
            // if it has then add it
            if (!alreadyMatched) {
                GetPlayerByID(roomCode, match).score++;
                GetPlayerByID(roomCode, rooms[roomCode].matches[match].id).score++;
                rooms[roomCode].matchOutcomes.push({
                    players: [GetPlayerByID(roomCode, match), GetPlayerByID(roomCode, rooms[roomCode].matches[match].id)],
                    outcome: "MATCHED With"
                })
            }
        }
        else {
            // feels bad man you got rejected still got to record it tho
            console.log("Denied");
            if (GetPlayerByID(roomCode, match).score > 0) GetPlayerByID(roomCode, match).score--;
            rooms[roomCode].matchOutcomes.push({
                players: [GetPlayerByID(roomCode, match), GetPlayerByID(roomCode, rooms[roomCode].matches[match].id)],
                outcome: "Got REJECTED By"
            })
        }
    }
    SortLeaderBoard(roomCode);
}

function Match(matchIdx, roomCode, socket) {
    rooms[roomCode].matches[socket.id] = {
        id: rooms[roomCode].players[matchIdx].id,
        nick: rooms[roomCode].players[matchIdx].nick,
        idx: matchIdx
    }
    console.log(`${Object.keys(rooms[roomCode].matches).length} Players:${rooms[roomCode].players.length}`);
    if (Object.keys(rooms[roomCode].matches).length === rooms[roomCode].players.length) {
        DetermineMatchOutcome(roomCode);
        rooms[roomCode].stage = "showcase";
        console.log("SHOWCASE");
        clearTimeout(rooms[roomCode].countdownTimer);
    }
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
    socket.on("PickMatch", (matchIdx, roomCode) => {
        Match(matchIdx, roomCode, socket);
    })
    socket.on("ToMatchShowcase", (roomCode) => {
        rooms[roomCode].stage = "match_showcase";
        console.log(rooms[roomCode].stage);
        SendRoomInfo(roomCode);
    })
    socket.on("NextLeaderboard", (roomCode) => {
        rooms[roomCode].stage = "leaderboard";
        SendRoomInfo(roomCode);
    })
    socket.on("NextStage", (roomCode) => {
        rooms[roomCode].stage = "show_round";
        SendRoomInfo(roomCode);
    })
    socket.on("NextRound", (roomCode) => {
        rooms[roomCode].stage = "game";
        rooms[roomCode].round++;
        rooms[roomCode].conversations = [];
        rooms[roomCode].countdownTimer = null;
        rooms[roomCode].showcaseConvo = undefined;
        rooms[roomCode].matches = {};
        rooms[roomCode].matchOutcomes = [];
        StartGame(roomCode);
    })
    socket.on("disconnect", () => {
        Disconnect(socket);
    })
});

server.listen(PORT, () => console.log(`Server Listening On Port: ${PORT}`));