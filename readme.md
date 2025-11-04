# 🎯 Catch The Impostor

**Catch The Impostor** egy multiplayer játék, amelyben a játékosoknak közösen kell kitalálniuk, ki az *impostor* a csapatban.  
Minden körben a játékosok egy szót kapnak, de az impostor a szó helyett az *IMPOSZTOR* feliratot látja.

A játék menet a következő:
1. Minden játékos kap egy szót (kivéve az impostort, aki az *IMPOSZTOR* feliratot látja).
2. A játékosok sorban mondanak egy olyan szót vagy kifejezést, amely kapcsolódik a kapott szóhoz. (Ez addig mehet ameddig az idő le nem telik)
3. Miután az idő letelt, a játékosok szavaznak, hogy ki lehet az impostor.
4. Ha az impostort sikerül kitalálni, a többiek nyernek, különben az impostor győz.

---

## 🧩 Projekt technikai felépítése

A projekt két fő részből áll:

1. **Backend (Node.js Express + Socket.IO)**
    - A *real-time* kommunikációért és a játékmenet logikájáért felelős.
    - A `socket.io` segítségével kezeli a játékosok csatlakozását, üzenetváltásait, szavazásokat és új körök indítását.

2. **Frontend (React)**
    - A játékosok felhasználói felülete.
    - Csatlakozik a backendhez WebSocketen keresztül, és megjeleníti a játék állapotát, szavakat, szavazásokat stb.

---

## 📁 Könyvtárstruktúra

```plaintext
[ROOT]
├─ impostor-api/
│  ├─ index.js          # Fő indítófájl (Express + Socket.IO szerver)
│  ├─ settings.json     # Konfigurációs beállítások (pl. port, játékbeállítások)
│  ├─ words.json        # Játékszavak listája – bővíthető igény szerint
│
├─ impostor-client/
│  ├─ src/
│     └─ App.js         # Fő React komponens
│
└─ README.md