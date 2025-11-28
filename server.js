const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from 'public' folder
app.use(express.static('public'));

// --- CONFIGURATION ---
const PORT = 3000;
const TICK_RATE = 20; // Server updates 20 times per second
const TICK_DT = 1000 / TICK_RATE;
const LATENCY_MS = 200; // REQUIRED: Simulated Network Lag

// --- GAME STATE ---
const PLAYERS = {};
const COINS = [];
const MAP_SIZE = { width: 800, height: 600 };
const PLAYER_SIZE = 20;
const COIN_SIZE = 10;
const MOVEMENT_SPEED = 5;

// Initialize some coins
function spawnCoin() {
    COINS.push({
        id: uuidv4(),
        x: Math.random() * (MAP_SIZE.width - 20) + 10,
        y: Math.random() * (MAP_SIZE.height - 20) + 10
    });
}
// Spawn 5 initial coins
for (let i = 0; i < 5; i++) spawnCoin();


// --- WEBSOCKET HANDLING ---
wss.on('connection', (ws) => {
    const playerId = uuidv4();
    const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    
    // Initialize Player Position (Authoritative)
    PLAYERS[playerId] = { 
        id: playerId, 
        x: MAP_SIZE.width / 2, 
        y: MAP_SIZE.height / 2, 
        score: 0, 
        color: color,
        // maintaining pressed-state map for continuous movement
        pressed: { up: false, down: false, left: false, right: false }
    };

    // Send initial metadata to client (ID assignment)
    // We delay this too to simulate the bad connection handshake
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'init', id: playerId }));
        }
    }, LATENCY_MS);

    ws.on('message', (message) => {
        // SIMULATE LATENCY (Client -> Server)
        // We do not process the input immediately. We wait 200ms.
        setTimeout(() => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'input' && PLAYERS[playerId]) {
                    // Input format: { type: 'input', key: 'up'|'down'|'left'|'right', action: 'start'|'stop' }
                    if (['up','down','left','right'].includes(data.key) &&
                        (data.action === 'start' || data.action === 'stop')) {
                        PLAYERS[playerId].pressed[data.key] = (data.action === 'start');
                    } else {
                        // Backward compatibility (single-shot inputs) - treat as single tick start then stop
                        if (['up','down','left','right'].includes(data.key)) {
                            // apply one-step movement immediately now (still server authoritative)
                            const key = data.key;
                            if (key === 'up') PLAYERS[playerId].y -= MOVEMENT_SPEED;
                            if (key === 'down') PLAYERS[playerId].y += MOVEMENT_SPEED;
                            if (key === 'left') PLAYERS[playerId].x -= MOVEMENT_SPEED;
                            if (key === 'right') PLAYERS[playerId].x += MOVEMENT_SPEED;
                            // clamp
                            PLAYERS[playerId].x = Math.max(0, Math.min(MAP_SIZE.width, PLAYERS[playerId].x));
                            PLAYERS[playerId].y = Math.max(0, Math.min(MAP_SIZE.height, PLAYERS[playerId].y));
                        }
                    }
                }
            } catch (e) { console.error("Invalid msg", e); }
        }, LATENCY_MS);
    });

    ws.on('close', () => {
        delete PLAYERS[playerId];
    });
});

// --- GAME LOOP (AUTHORITATIVE) ---
setInterval(() => {
    // 1. Process pressed states & Move Players continuously
    for (const id in PLAYERS) {
        const p = PLAYERS[id];
        
        // Apply movement based on pressed booleans (one tick per interval)
        if (p.pressed.up) p.y -= MOVEMENT_SPEED;
        if (p.pressed.down) p.y += MOVEMENT_SPEED;
        if (p.pressed.left) p.x -= MOVEMENT_SPEED;
        if (p.pressed.right) p.x += MOVEMENT_SPEED;

        // Boundary checks
        p.x = Math.max(0, Math.min(MAP_SIZE.width, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE.height, p.y));

        // 2. Server Authority on Collisions (Coins)
        // Clients cannot report score. Server calculates it.
        for (let i = COINS.length - 1; i >= 0; i--) {
            const c = COINS[i];
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < PLAYER_SIZE + COIN_SIZE) {
                p.score += 1;
                COINS.splice(i, 1); // Remove coin
                spawnCoin(); // Respawn elsewhere
            }
        }
    }

    // 3. Prepare State Packet
    // (IMPORTANT: strip any server-only fields (pressed) before sending)
    const playersForSend = {};
    for (const id in PLAYERS) {
        const p = PLAYERS[id];
        playersForSend[id] = {
            id: p.id,
            x: p.x,
            y: p.y,
            score: p.score,
            color: p.color
        };
    }

    const gameState = {
        players: playersForSend,
        coins: COINS,
        timestamp: Date.now() // Critical for interpolation
    };

    // 4. SIMULATE LATENCY (Server -> Client)
    const stateString = JSON.stringify({ type: 'state', state: gameState });
    
    setTimeout(() => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(stateString);
            }
        });
    }, LATENCY_MS);

}, TICK_DT);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});