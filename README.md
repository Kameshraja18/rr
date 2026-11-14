# Kallan Police

## Run the multiplayer game

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in multiple browser tabs or devices on the same network. One player creates a room and shares the six-character code; the other players join it.

Room sizes:

- **3 players:** King, Rani/Queen, and Thief. The Queen finds the Thief.
- **4 players:** King, Queen, Police, and Thief. The Police confirms the final Thief selection.
- **Custom:** Choose 5–12 players. Police confirms the final selection; additional players are civilians and larger rooms can contain more than one Thief.

The Node server owns room membership, readiness, role assignment, turn validation, timer expiry, and scoring. Secret roles are only sent to the player who owns them and are revealed to everyone after the round result.
