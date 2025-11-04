const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000, // 60 másodperc
  pingInterval: 25000 // 25 másodperc
});

const PORT = 3001;

// --- Beállítások és szavak betöltése ---
let WORDS = [];
let SETTINGS = {};

function loadWords() {
  try {
    const wordsPath = path.join(__dirname, 'words.json');
    if (fs.existsSync(wordsPath)) {
      const wordsData = fs.readFileSync(wordsPath, 'utf8');
      WORDS = JSON.parse(wordsData);
      console.log(`✅ ${WORDS.length} szó betöltve a words.json fájlból`);
    } else {
      WORDS = ['ALMA', 'KÖNYV', 'SZÉK', 'ASZTAL', 'BICIKLI', 'TELEFON', 'SZÁMÍTÓGÉP', 'AUTÓ', 'HÁZ', 'KERT'];
      console.log('⚠️  words.json fájl nem található, alapértelmezett szavak használata');
    }
  } catch (error) {
    console.error('❌ Hiba a words.json betöltésekor:', error);
    WORDS = ['ALMA', 'KÖNYV', 'SZÉK', 'ASZTAL', 'BICIKLI', 'TELEFON', 'SZÁMÍTÓGÉP', 'AUTÓ', 'HÁZ', 'KERT'];
  }
}

function loadSettings() {
  try {
    const settingsPath = path.join(__dirname, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      SETTINGS = JSON.parse(settingsData);
      console.log('✅ Beállítások betöltve a settings.json fájlból');
    } else {
      SETTINGS = {
        gameTime: 120,
        minPlayers: 3,
        maxPlayers: 10,
        votingTime: 60,
        reconnectionTimeout: 30000,
        roomCleanupInterval: 300000 // 5 perc - üres szobák takarítási intervalluma
      };
      console.log('⚠️  settings.json fájl nem található, alapértelmezett beállítások használata');
    }
    console.log('📊 Beállítások:', SETTINGS);
  } catch (error) {
    console.error('❌ Hiba a settings.json betöltésekor:', error);
    SETTINGS = {
      gameTime: 120,
      minPlayers: 3,
      maxPlayers: 10,
      votingTime: 60,
      reconnectionTimeout: 30000,
      roomCleanupInterval: 300000
    };
  }
}

loadWords();
loadSettings();

// --- Szobák tárolása ---
let rooms = {};

// --- Szoba takarítási időzítő ---
function startRoomCleanup() {
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(rooms).forEach(roomName => {
      const room = rooms[roomName];
      
      // Ellenőrizzük, hogy a szoba üres-e vagy inaktív
      if (room.players.length === 0) {
        // Üres szoba törlése
        delete rooms[roomName];
        cleanedCount++;
        console.log(`🧹 Üres szoba törölve: ${roomName}`);
      } else {
        // Inaktív szoba ellenőrzése - ha nincs socket kapcsolat
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        if (!roomSockets || roomSockets.size === 0) {
          // Ha nincs senki a socket room-ban, de vannak játékosok a szobában
          // Ez azt jelenti, hogy mindenki disconnectelt
          delete rooms[roomName];
          cleanedCount++;
          console.log(`🧹 Inaktív szoba törölve: ${roomName} (${room.players.length} játékos)`);
        }
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`🧹 ${cleanedCount} szoba takarítva`);
      io.emit("roomsUpdated", Object.values(rooms).map(r => ({ 
        name: r.name, 
        playersCount: r.players.length 
      })));
    }
  }, SETTINGS.roomCleanupInterval || 300000); // Alapértelmezetten 5 percenként
}

// --- Segédfüggvények ---
function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function pickRandomWord() {
  if (WORDS.length === 0) {
    console.error('❌ Nincsenek szavak betöltve!');
    return 'ALMA';
  }
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function cleanupRoom(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  
  // Timer leállítása
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  
  // Szoba törlése
  delete rooms[roomName];
  console.log(`🗑️ Szoba törölve: ${roomName}`);
}

function startGame(roomName) {
  const room = rooms[roomName];
  if (!room || room.players.length < SETTINGS.minPlayers) {
    console.log(`Cannot start game in room ${roomName}: not enough players (${room?.players?.length || 0}/${SETTINGS.minPlayers})`);
    return;
  }

  room.gameWord = pickRandomWord();
  room.votes = {};
  room.gameTime = SETTINGS.gameTime;
  room.timer = null;
  room.gameState = 'playing';

  const impostorIndex = Math.floor(Math.random() * room.players.length);
  room.players = room.players.map((p, i) => ({
    ...p,
    isImpostor: i === impostorIndex,
    word: i === impostorIndex ? "IMPOSZTOR" : room.gameWord
  }));

  console.log(`🎮 Starting game in room ${roomName}, players:`, room.players.map(p => ({ name: p.name, word: p.word })));

  io.to(roomName).emit("gameStarted", { 
    players: room.players.map(p => ({ 
      id: p.id, 
      name: p.name, 
      word: p.word 
    })) 
  });

  let timeLeft = room.gameTime;
  room.timer = setInterval(() => {
    timeLeft--;
    io.to(roomName).emit("timer", timeLeft);
    if (timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      startVoting(roomName);
    }
  }, 1000);
}

function startVoting(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  
  room.gameState = 'voting';
  console.log(`🗳️ Starting voting in room ${roomName}`);
  io.to(roomName).emit("votingStarted", room.players.map(p => ({ 
    id: p.id, 
    name: p.name 
  })));
}

function endGame(roomName) {
  const room = rooms[roomName];
  if (!room) return;

  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  const impostor = room.players.find(p => p.isImpostor);
  if (!impostor) return;

  const voteCount = {};
  Object.values(room.votes).forEach(votedId => {
    voteCount[votedId] = (voteCount[votedId] || 0) + 1;
  });

  const votesArray = Object.entries(voteCount);
  let impostorCaught = false;
  
  if (votesArray.length === 0) {
    impostorCaught = false;
  } else {
    const maxVotes = Math.max(...Object.values(voteCount));
    const playersWithMaxVotes = votesArray.filter(([_, count]) => count === maxVotes);
    
    if (playersWithMaxVotes.length === 1) {
      impostorCaught = playersWithMaxVotes[0][0] === impostor.id;
    } else {
      impostorCaught = playersWithMaxVotes.some(([playerId]) => playerId === impostor.id);
    }
  }

  console.log(`🏁 Game ended in room ${roomName}, impostor caught: ${impostorCaught}`);
  io.to(roomName).emit("gameEnded", { 
    impostorId: impostor.id, 
    impostorCaught,
    voteCount 
  });
}

// --- REST API ---

app.get("/settings", (req, res) => {
  res.json(SETTINGS);
});

app.get("/words", (req, res) => {
  res.json(WORDS);
});

app.post("/settings", (req, res) => {
  try {
    const newSettings = req.body;
    
    if (newSettings.gameTime && (newSettings.gameTime < 30 || newSettings.gameTime > 300)) {
      return res.status(400).json({ error: "Game time must be between 30 and 300 seconds" });
    }
    if (newSettings.minPlayers && (newSettings.minPlayers < 2 || newSettings.minPlayers > 10)) {
      return res.status(400).json({ error: "Minimum players must be between 2 and 10" });
    }
    if (newSettings.maxPlayers && (newSettings.maxPlayers < 3 || newSettings.maxPlayers > 15)) {
      return res.status(400).json({ error: "Maximum players must be between 3 and 15" });
    }

    SETTINGS = { ...SETTINGS, ...newSettings };
    
    const settingsPath = path.join(__dirname, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(SETTINGS, null, 2));
    
    console.log('✅ Beállítások frissítve:', SETTINGS);
    res.json({ status: "settings updated", settings: SETTINGS });
  } catch (error) {
    console.error('❌ Hiba a beállítások frissítésekor:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/words", (req, res) => {
  try {
    const newWords = req.body.words;
    
    if (!Array.isArray(newWords) || newWords.length === 0) {
      return res.status(400).json({ error: "Words must be a non-empty array" });
    }
    
    if (newWords.some(word => typeof word !== 'string' || word.length === 0)) {
      return res.status(400).json({ error: "All words must be non-empty strings" });
    }

    WORDS = [...newWords];
    
    const wordsPath = path.join(__dirname, 'words.json');
    fs.writeFileSync(wordsPath, JSON.stringify(WORDS, null, 2));
    
    console.log(`✅ ${WORDS.length} szó frissítve`);
    res.json({ status: "words updated", count: WORDS.length });
  } catch (error) {
    console.error('❌ Hiba a szavak frissítésekor:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/create-room", (req, res) => {
  const { name, hostName } = req.body;
  if (!name || name.length > 20) return res.status(400).json({ error: "Invalid room name" });
  if (rooms[name]) return res.status(400).json({ error: "Room name already exists" });

  const pin = generatePin();
  const hostId = Date.now().toString();
  const room = {
    name,
    pin,
    hostId,
    players: [{ id: hostId, name: hostName, word: null, isImpostor: false }],
    gameWord: null,
    timer: null,
    votes: {},
    gameTime: SETTINGS.gameTime,
    gameState: 'waiting',
    createdAt: Date.now()
  };
  rooms[name] = room;

  io.emit("roomsUpdated", Object.values(rooms).map(r => ({ 
    name: r.name, 
    playersCount: r.players.length 
  })));
  
  console.log(`🚪 Room created: ${name} (PIN: ${pin}) by ${hostName}`);
  res.json({ 
    room: { 
      name: room.name, 
      hostId, 
      players: room.players 
    }, 
    hostId, 
    pin 
  });
});

app.post("/join-room", (req, res) => {
  const { name, pin, playerName } = req.body;
  const room = rooms[name];
  
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.pin !== pin) return res.status(403).json({ error: "Invalid PIN" });
  if (room.gameState === 'playing' || room.gameState === 'voting') {
    return res.status(400).json({ error: "Game is already in progress" });
  }
  if (room.players.length >= SETTINGS.maxPlayers) {
    return res.status(400).json({ error: `Room is full (max ${SETTINGS.maxPlayers} players)` });
  }

  const id = Date.now().toString();
  const player = { id, name: playerName, word: null, isImpostor: false };
  room.players.push(player);

  io.to(name).emit("roomUpdated", room.players);
  io.emit("roomsUpdated", Object.values(rooms).map(r => ({ 
    name: r.name, 
    playersCount: r.players.length 
  })));
  
  console.log(`👤 ${playerName} joined room ${name}`);
  res.json({ 
    id,
    room: {
      name: room.name,
      pin: room.pin,
      players: room.players,
      hostId: room.hostId
    }
  });
});

app.post("/start", (req, res) => {
  const { roomName } = req.body;
  const room = rooms[roomName];
  
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.players.length < SETTINGS.minPlayers) {
    return res.status(400).json({ 
      error: `Not enough players to start the game (minimum ${SETTINGS.minPlayers} players required)` 
    });
  }

  startGame(roomName);
  res.json({ status: "started" });
});

app.post("/vote", (req, res) => {
  const { roomName, voterId, votedId } = req.body;
  const room = rooms[roomName];
  
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.gameState !== 'voting') return res.status(400).json({ error: "Voting not active" });

  room.votes[voterId] = votedId;

  const voteCount = {};
  Object.values(room.votes).forEach(v => voteCount[v] = (voteCount[v] || 0) + 1);
  
  io.to(roomName).emit("votesUpdated", voteCount);

  if (Object.keys(room.votes).length === room.players.length) {
    endGame(roomName);
  }

  res.json({ status: "vote received" });
});

app.post("/kick-player", (req, res) => {
  const { roomName, playerId, hostId } = req.body;
  const room = rooms[roomName];
  
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.hostId !== hostId) return res.status(403).json({ error: "Only host can kick players" });

  room.players = room.players.filter(p => p.id !== playerId);
  
  // Ha üres a szoba, töröljük
  if (room.players.length === 0) {
    cleanupRoom(roomName);
  } else {
    io.to(roomName).emit("roomUpdated", room.players);
  }
  
  io.to(roomName).emit("playerKicked", playerId);
  io.emit("roomsUpdated", Object.values(rooms).map(r => ({ 
    name: r.name, 
    playersCount: r.players.length 
  })));
  
  res.json({ status: "player kicked" });
});

app.get("/rooms", (req, res) => {
  res.json(Object.values(rooms).map(r => ({ 
    name: r.name, 
    playersCount: r.players.length 
  })));
});

// --- WebSocket ---
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  socket.on("joinRoom", (roomName, callback) => {
    const room = rooms[roomName];
    if (!room) return callback({ error: "Room not found" });
    
    socket.join(roomName);
    console.log(`📡 Socket ${socket.id} joined room ${roomName}`);
    callback({ 
      success: true, 
      players: room.players,
      gameState: room.gameState 
    });
  });

  socket.on("leaveRoom", ({ roomName, playerId }) => {
    const room = rooms[roomName];
    if (!room) return;
    
    room.players = room.players.filter(p => p.id !== playerId);
    
    if (room.players.length === 0) {
      cleanupRoom(roomName);
    } else {
      if (playerId === room.hostId) {
        room.hostId = room.players[0].id;
        console.log(`👑 New host selected for room ${roomName}: ${room.players[0].name}`);
      }
      io.to(roomName).emit("roomUpdated", room.players);
    }
    
    io.emit("roomsUpdated", Object.values(rooms).map(r => ({ 
      name: r.name, 
      playersCount: r.players.length 
    })));
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 Client disconnected:", socket.id, "Reason:", reason);
    
    Object.keys(rooms).forEach(roomName => {
      const room = rooms[roomName];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1);
        
        console.log(`👤 Player ${playerName} removed from room ${roomName} due to disconnect`);
        
        if (room.players.length === 0) {
          cleanupRoom(roomName);
        } else {
          if (socket.id === room.hostId) {
            room.hostId = room.players[0].id;
            console.log(`👑 New host selected for room ${roomName}: ${room.players[0].name}`);
          }
          io.to(roomName).emit("roomUpdated", room.players);
        }
      }
    });
    
    io.emit("roomsUpdated", Object.values(rooms).map(r => ({ 
      name: r.name, 
      playersCount: r.players.length 
    })));
  });
});

app.post("/reload-data", (req, res) => {
  try {
    loadWords();
    loadSettings();
    res.json({ 
      status: "data reloaded", 
      wordCount: WORDS.length, 
      settings: SETTINGS 
    });
  } catch (error) {
    console.error('❌ Hiba az adatok újratöltésekor:', error);
    res.status(500).json({ error: "Failed to reload data" });
  }
});

// Szoba takarítási időzítő indítása
startRoomCleanup();

server.listen(PORT, () => {
  console.log(`🎯 Server listening on http://localhost:${PORT}`);
  console.log(`📊 Loaded ${WORDS.length} words and settings:`, SETTINGS);
  console.log(`🧹 Room cleanup active (${SETTINGS.roomCleanupInterval || 300000}ms interval)`);
});