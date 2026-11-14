# Kallan Police

## Run the multiplayer game

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in multiple browser tabs or devices on the same network. One player creates a room and shares the six-character code; the other players join it.

## Deploy to Render

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render will use [render.yaml](./render.yaml), install dependencies, and start the WebSocket server.
4. Open the generated `https://...onrender.com` URL and share it with players.

The hosted site and WebSocket server use the same URL. Use `/health` to verify the service is running.

Room sizes:

- **3 players:** King, Rani/Queen, and Thief. The Queen finds the Thief.
- **4 players:** King, Queen, Police, and Thief. The Police confirms the final Thief selection.
- **Custom:** Choose 5–12 players. Police confirms the final selection; additional players are civilians and larger rooms can contain more than one Thief.

The Node server owns room membership, readiness, role assignment, turn validation, timer expiry, and scoring. Secret roles are only sent to the player who owns them and are revealed to everyone after the round result.
