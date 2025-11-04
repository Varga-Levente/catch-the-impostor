import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./App.css";

// API alap URL environment változóból
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:3001";

const App = () => {
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomPins, setRoomPins] = useState({});
  const [newRoomName, setNewRoomName] = useState("");
  const [isHost, setIsHost] = useState(false);

  const [gameState, setGameState] = useState("joining");
  const [timeLeft, setTimeLeft] = useState(0);
  const [myWord, setMyWord] = useState("");
  const [votes, setVotes] = useState({});
  const [impostorResult, setImpostorResult] = useState(null);

  const socketRef = useRef();
  const playerIdRef = useRef();
  const currentRoomRef = useRef();

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  // Socket.io setup - API_BASE_URL használata
  useEffect(() => {
    socketRef.current = io(API_BASE_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current.on("roomsUpdated", (roomsList) => {
      setRooms(roomsList);
    });

    socketRef.current.on("roomUpdated", (players) => {
      setCurrentRoom(prev => {
        if (!prev) return prev;
        return { ...prev, players };
      });
    });

    socketRef.current.on("gameStarted", (data) => {
      const me = data.players.find((p) => p.id === playerIdRef.current);
      if (me) {
        setMyWord(me.word);
      }
      setGameState("playing");
    });

    socketRef.current.on("timer", (time) => {
      setTimeLeft(time);
    });

    socketRef.current.on("votingStarted", (players) => {
      setVotes({});
      setGameState("voting");
    });

    socketRef.current.on("votesUpdated", (voteCount) => {
      setVotes(voteCount);
    });

    socketRef.current.on("gameEnded", (result) => {
      setImpostorResult(result);
      setGameState("ended");
    });

    socketRef.current.on("playerKicked", (kickedPlayerId) => {
      if (kickedPlayerId === playerIdRef.current) {
        alert("Ki lettél rúgva a szobából!");
        handleLeaveRoom();
      }
    });

    socketRef.current.on("connect", () => {
      if (currentRoomRef.current) {
        socketRef.current.emit("joinRoom", currentRoomRef.current.name, (resp) => {
          if (!resp.error && resp.players) {
            setCurrentRoom(prev => ({ ...prev, players: resp.players }));
          }
        });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Formátum idő átalakításához (perc:másodperc)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Név megadása - API_BASE_URL használata
  const handleSetName = async () => {
    if (!playerName.trim()) return;
    const newPlayerId = Date.now().toString();
    setPlayerId(newPlayerId);
    setGameState("lobby");

    try {
      const res = await fetch(`${API_BASE_URL}/rooms`);
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error("Nem sikerült lekérni a szobákat:", err);
    }
  };

  // Szoba létrehozása - API_BASE_URL használata
  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/create-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName, hostName: playerName }),
      });
      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      const roomData = {
        name: data.room.name,
        pin: data.pin,
        hostId: data.hostId,
        players: data.room.players
      };

      setCurrentRoom(roomData);
      setPlayerId(data.hostId);
      setIsHost(true);
      setGameState("waiting");

      setTimeout(() => {
        socketRef.current.emit("joinRoom", newRoomName, (resp) => {
          if (resp.error) {
            console.error("Socket joinRoom error:", resp.error);
          } else {
            console.log("Host successfully joined socket room:", newRoomName);
            if (resp.players) {
              setCurrentRoom(prev => ({ ...prev, players: resp.players }));
            }
          }
        });
      }, 200);

    } catch (err) {
      console.error("Create room error:", err);
    }
  };

  // Szobához csatlakozás - API_BASE_URL használata
  const handleJoinRoom = async (roomName, pin) => {
    if (!pin) {
      alert("Add meg a PIN kódot!");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/join-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName, pin, playerName }),
      });

      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }

      setPlayerId(data.id);
      const roomData = {
        name: data.room.name,
        pin: data.room.pin,
        hostId: data.room.hostId,
        players: data.room.players
      };
      setCurrentRoom(roomData);
      setIsHost(data.room.hostId === data.id);
      setGameState("waiting");

      setTimeout(() => {
        socketRef.current.emit("joinRoom", roomName, (resp) => {
          if (resp.error) {
            console.error("Socket joinRoom error:", resp.error);
          } else {
            console.log("Player successfully joined socket room:", roomName);
            if (resp.players && JSON.stringify(resp.players) !== JSON.stringify(data.room.players)) {
              setCurrentRoom(prev => ({ ...prev, players: resp.players }));
            }
          }
        });
      }, 200);
    } catch (err) {
      console.error("Join room error:", err);
    }
  };

  // Játék indítása - API_BASE_URL használata
  const handleStartGame = async () => {
    if (!currentRoom || currentRoom.players.length < 3) {
      alert("Legalább 3 játékosnak kell lennie a játék indításához!");
      return;
    }

    try {
      console.log("Starting game in room:", currentRoom.name);
      const response = await fetch(`${API_BASE_URL}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: currentRoom.name }),
      });

      const result = await response.json();
      console.log("Start game response:", result);
    } catch (err) {
      console.error("Start game error:", err);
    }
  };

  // Szavazás - API_BASE_URL használata
  const handleVote = async (votedId) => {
    try {
      await fetch(`${API_BASE_URL}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: currentRoom.name,
          voterId: playerId,
          votedId,
        }),
      });
    } catch (err) {
      console.error("Vote error:", err);
    }
  };

  // Játékos kirúgása - API_BASE_URL használata
  const handleKickPlayer = async (playerIdToKick) => {
    if (!window.confirm("Biztosan ki akarod rúgni ezt a játékost?")) return;

    try {
      await fetch(`${API_BASE_URL}/kick-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: currentRoom.name,
          playerId: playerIdToKick,
          hostId: playerId,
        }),
      });
    } catch (err) {
      console.error("Kick player error:", err);
      alert("Hiba történt a játékos kirúgása során.");
    }
  };

  // Szobából kilépés - JAVÍTOTT: üríti a mezőket
  const handleLeaveRoom = () => {
    if (currentRoom && playerId) {
      socketRef.current.emit("leaveRoom", {
        roomName: currentRoom.name,
        playerId
      });
    }
    setCurrentRoom(null);
    setIsHost(false);
    setGameState("lobby");
    setMyWord("");
    setVotes({});
    setImpostorResult(null);
    setRoomPins({});
    setNewRoomName("");
  };

  // Új játék
  const handlePlayAgain = () => {
    setGameState("lobby");
    setCurrentRoom(null);
    setIsHost(false);
    setMyWord("");
    setVotes({});
    setImpostorResult(null);
    setRoomPins({});
    setNewRoomName("");
  };

  // PIN mező változásának kezelése
  const handlePinChange = (roomName, value) => {
    setRoomPins(prev => ({
      ...prev,
      [roomName]: value
    }));
  };

  return (
      <div className="app">
        <header className="app-header">
          <h1 className="neon-title">
            <span className="impostor-title">IMPOSZTOROS</span>
            <span className="game-title">JÁTÉK</span>
          </h1>
          {currentRoom && (
              <div className="current-room-info">
                Szoba: {currentRoom.name} | Játékosok: {currentRoom.players?.length || 0}
              </div>
          )}
        </header>

        <main className="main-content">
          {/* Név megadása */}
          {gameState === "joining" && (
              <div className="join-screen">
                <h2 className="centered-text">Add meg a neved</h2>
                <input
                    className="neon-input"
                    placeholder="Add meg a neved"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={20}
                />
                <button className="neon-button" onClick={handleSetName}>
                  Folytatás
                </button>
              </div>
          )}

          {/* Lobby */}
          {gameState === "lobby" && (
              <div className="lobby-screen">
                <h2 className="centered-text">Szobák</h2>
                {rooms.length === 0 ? (
                    <p>Nincsenek elérhető szobák</p>
                ) : (
                    <div className="room-list">
                      {rooms.map((room) => (
                          <div key={room.name} className="room-item">
                            <span>{room.name} ({room.playersCount} játékos)</span>
                            <div className="room-actions">
                              <input
                                  placeholder="PIN"
                                  value={roomPins[room.name] || ''}
                                  onChange={(e) => handlePinChange(room.name, e.target.value)}
                                  className="neon-input pin-input"
                                  type="password"
                                  maxLength={4}
                              />
                              <button
                                  className="neon-button"
                                  onClick={() => handleJoinRoom(room.name, roomPins[room.name] || '')}
                              >
                                Csatlakozás
                              </button>
                            </div>
                          </div>
                      ))}
                    </div>
                )}

                <div className="create-room">
                  <h3 className="centered-text">Új szoba létrehozása</h3>
                  <input
                      placeholder="Szoba neve"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      className="neon-input"
                      maxLength={20}
                  />
                  <button className="neon-button" onClick={handleCreateRoom}>
                    Szoba létrehozása
                  </button>
                </div>
              </div>
          )}

          {/* Várakozás a játékra */}
          {gameState === "waiting" && currentRoom && (
              <div className="waiting-screen">
                <div className="room-header">
                  <h2 className="centered-text">Szoba: {currentRoom.name}</h2>
                  <p className="neon-pin">
                    Szoba PIN: <strong>{currentRoom.pin}</strong>
                  </p>
                  <button className="neon-button secondary" onClick={handleLeaveRoom}>
                    Kilépés a szobából
                  </button>
                </div>

                <h3 className="centered-text">Játékosok ({currentRoom.players?.length || 0}/10):</h3>
                <div className="players-list">
                  {currentRoom.players?.map((p) => (
                      <div key={p.id} className={`player-item ${p.id === currentRoom.hostId ? 'host-player' : ''}`}>
                  <span>
                    {p.id === currentRoom.hostId && "👑 "}
                    {p.name} {p.id === playerId && "(Te)"}
                  </span>
                        {isHost && p.id !== playerId && (
                            <button
                                className="kick-button"
                                onClick={() => handleKickPlayer(p.id)}
                                title="Játékos kirúgása"
                            >
                              ✕
                            </button>
                        )}
                      </div>
                  ))}
                </div>

                <div className="waiting-actions">
                  {isHost && (
                      <button
                          className="neon-button start-button"
                          onClick={handleStartGame}
                          disabled={!currentRoom.players || currentRoom.players.length < 3}
                      >
                        {!currentRoom.players || currentRoom.players.length < 3
                            ? `Még ${3 - (currentRoom.players?.length || 0)} játékos hiányzik`
                            : "Játék indítása"}
                      </button>
                  )}
                </div>
              </div>
          )}

          {/* Játék közben */}
          {gameState === "playing" && (
              <div className="game-screen">
                <h2 className="centered-text">Játék folyamatban</h2>
                <div className="timer">{formatTime(timeLeft)}</div>
                <div className="word-display">
                  <h3>A te szavad:</h3>
                  <div className={myWord === "IMPOSZTOR" ? "impostor-word" : "normal-word"}>
                    {myWord || "Betöltés..."}
                  </div>
                  {myWord === "IMPOSZTOR" ? (
                      <div className="impostor-hint">
                        👹 TE VAGY AZ IMPOSZTOR! 👹<br />
                        Próbálj elrejtőzni és megtéveszteni a többieket!
                      </div>
                  ) : (
                      <div className="normal-hint">
                        😇 Ártatlan vagy! 😇<br />
                        Találd ki, ki az imposztor!
                      </div>
                  )}
                </div>

                <div className="players-in-game">
                  <h3>Játékosok:</h3>
                  {currentRoom?.players?.map((p) => (
                      <div key={p.id} className={`player-item ${p.id === currentRoom.hostId ? 'host-player' : ''}`}>
                        {p.id === currentRoom.hostId && "👑 "}
                        {p.name} {p.id === playerId && "(Te)"}
                      </div>
                  ))}
                </div>

                <button className="neon-button secondary" onClick={handleLeaveRoom}>
                  Kilépés
                </button>
              </div>
          )}

          {/* Szavazás */}
          {gameState === "voting" && (
              <div className="voting-screen">
                <h2 className="centered-text">Szavazz ki valakit!</h2>
                <p>Ki lehet az imposztor? Szavazz a gomb megnyomásával!</p>
                <div className="players-list">
                  {currentRoom?.players?.map((p) => (
                      <div key={p.id} className={`player-item ${p.id === currentRoom.hostId ? 'host-player' : ''}`}>
                  <span>
                    {p.id === currentRoom.hostId && "👑 "}
                    {p.name} - Szavazatok: {votes[p.id] || 0}
                  </span>
                        <button
                            className="neon-button vote-button"
                            onClick={() => handleVote(p.id)}
                            disabled={p.id === playerId}
                        >
                          {p.id === playerId ? "Te" : "Szavazás"}
                        </button>
                      </div>
                  ))}
                </div>
              </div>
          )}

          {/* Eredmény */}
          {gameState === "ended" && impostorResult && (
              <div className="results-screen">
                <h2 className="centered-text">Játék vége!</h2>
                <div className="result-info">
                  <p>
                    Az imposztor: <strong>{
                    currentRoom?.players?.find(
                        (p) => p.id === impostorResult.impostorId
                    )?.name
                  }</strong>
                  </p>
                  <p className={impostorResult.impostorCaught ? "success" : "failure"}>
                    {impostorResult.impostorCaught
                        ? "🎉 Az imposztort elkaptátok!"
                        : "😔 Az imposztor megmenekült!"}
                  </p>
                </div>

                <div className="vote-results">
                  <h3>Szavazatok:</h3>
                  {currentRoom?.players?.map((p) => (
                      <div key={p.id} className="vote-item">
                        {p.name}: {impostorResult.voteCount?.[p.id] || 0} szavazat
                      </div>
                  ))}
                </div>

                <div className="result-actions">
                  <button className="neon-button" onClick={handlePlayAgain}>
                    Új játék
                  </button>
                  <button className="neon-button secondary" onClick={handleLeaveRoom}>
                    Vissza a lobbyba
                  </button>
                </div>
              </div>
          )}
        </main>

        <footer className="app-footer">
          <div className="footer-text">
            Code ❤️ by VLevente
          </div>
        </footer>
      </div>
  );
};

export default App;