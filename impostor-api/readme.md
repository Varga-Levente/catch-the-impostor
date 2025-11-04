# 🎭 Imposztor Játék API Dokumentáció

## 🧩 Áttekintés
Ez egy **Node.js** alapú real-time multiplayer *Imposztor* játék API, amely **Express.js** és **Socket.IO** technológiákat használ.  
A játék célja, hogy a játékosok kitalálják, ki az impostor, aki más szót kap, mint a többiek.

### 🎮 Főbb jellemzők
- ⚡ Real-time kommunikáció WebSocket használatával
- 🏠 Többszobás architektúra párhuzamos játékokhoz
- 🧠 Konfigurálható beállítások JSON fájlokon keresztül
- 🧹 Automatikus takarítás üres és inaktív szobák számára
- 🔐 PIN védett szobák biztonságos csatlakozáshoz

---

## ⚙️ Telepítés és Indítás

### Előfeltételek
- Node.js **v14.0** vagy újabb
- **npm** csomagkezelő

### Függőségek
```json
{
  "express": "^4.18.0",
  "socket.io": "^4.0.0",
  "cors": "^2.8.0"
}
```
### Indítás
```bash
npm install && node server.js
```
A szerver a 3001-es porton indul:
http://localhost:3001

## 🧾 Konfiguráció

### Beállítási fájl ```(settings.json)```
```json
{
  "gameTime": 120,
  "minPlayers": 3,
  "maxPlayers": 10,
  "votingTime": 60,
  "reconnectionTimeout": 30000,
  "roomCleanupInterval": 300000
}
```

### Szólista fájl ```(words.json)```
```json
["ALMA", "KÖNYV", "SZÉK", "ASZTAL", "BICIKLI"]
```