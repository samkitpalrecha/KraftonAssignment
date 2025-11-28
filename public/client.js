const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');

// Protocol defaults
// Note: We use the browser's native WebSocket
// Permitted technology: WebSocket
const socket = new WebSocket(`ws://${location.host}`);

let myId = null;
let stateBuffer = []; // Buffer to store server snapshots
const RENDER_DELAY = 100; // ms to render in the past for smoothness

socket.onopen = () => {
    statusDiv.innerText = "Connected. Waiting for server...";
};

socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'init') {
        myId = msg.id;
        statusDiv.innerText = `Connected. Playing as: ${myId.substring(0,5)}`;
    } else if (msg.type === 'state') {
        // Data arrives at delayed intervals
        // We push the new state into our buffer
        stateBuffer.push(msg.state);
        
        // Keep buffer small (remove states older than 1 second)
        if (stateBuffer.length > 20) {
            stateBuffer.shift();
        }
    }
};

// --- INPUT HANDLING ---
// Now we send start/stop intents (keydown -> start, keyup -> stop)
const keys = {}; // local pressed map to avoid duplicate starts

window.addEventListener('keydown', e => {
    // map keys
    const k = e.key;
    if (keys[k]) return; // already pressed locally
    keys[k] = true;

    // send a start action for this direction
    const cmd = mapKeyToCmd(k);
    if (cmd && myId) {
        socket.send(JSON.stringify({ type: 'input', key: cmd, action: 'start' }));
    }
});

window.addEventListener('keyup', e => {
    const k = e.key;
    if (!keys[k]) return; // wasn't pressed
    keys[k] = false;

    // send a stop action for this direction
    const cmd = mapKeyToCmd(k);
    if (cmd && myId) {
        socket.send(JSON.stringify({ type: 'input', key: cmd, action: 'stop' }));
    }
});

function mapKeyToCmd(key) {
    if (key === 'w' || key === 'ArrowUp') return 'up';
    if (key === 's' || key === 'ArrowDown') return 'down';
    if (key === 'a' || key === 'ArrowLeft') return 'left';
    if (key === 'd' || key === 'ArrowRight') return 'right';
    return null;
}

// --- INTERPOLATION MATH ---
// Implementing entity interpolation for smooth movement
function getCurrentState() {
    // We want to render what the world looked like (Now - RENDER_DELAY)
    const renderTimestamp = Date.now() - RENDER_DELAY;

    // Find two snapshots: one before renderTimestamp, one after
    // Buffer = [Oldest .... Newest]
    let prev = null;
    let next = null;

    for (let i = 0; i < stateBuffer.length; i++) {
        if (stateBuffer[i].timestamp <= renderTimestamp) {
            prev = stateBuffer[i];
        } else {
            next = stateBuffer[i];
            break; // Found the 'future' frame relative to render time
        }
    }

    // Edge case: We haven't received enough data yet, or lag is HUGE
    if (!prev || !next) {
        // Fallback: just return the latest (might look choppy, but better than nothing)
        return stateBuffer[stateBuffer.length - 1]; 
    }

    // Calculate Interpolation Factor (t)
    // t = (TimeWeWant - TimePrev) / (TimeNext - TimePrev)
    const timeBetweenFrames = next.timestamp - prev.timestamp;
    const timeSincePrev = renderTimestamp - prev.timestamp;
    const t = timeSincePrev / timeBetweenFrames;

    // Linearly Interpolate (Lerp) Players
    const interpolatedPlayers = {};
    
    // We iterate over the 'next' snapshot players to ensure we have targets
    for (const id in next.players) {
        const pNext = next.players[id];
        const pPrev = prev.players[id];

        if (pPrev) {
            // Lerp Position
            interpolatedPlayers[id] = {
                x: pPrev.x + (pNext.x - pPrev.x) * t,
                y: pPrev.y + (pNext.y - pPrev.y) * t,
                color: pNext.color,
                score: pNext.score
            };
        } else {
            // New player just appeared, snap to position
            interpolatedPlayers[id] = pNext;
        }
    }

    return {
        players: interpolatedPlayers,
        coins: next.coins // Coins don't strictly need lerp, snapping is fine
    };
}

// --- RENDER LOOP ---
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (stateBuffer.length > 1) {
        const interpolatedState = getCurrentState();
        
        if (interpolatedState) {
            // Draw Coins
            ctx.fillStyle = 'gold';
            interpolatedState.coins.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); // Radius 10
                ctx.fill();
            });

            // Draw Players
            for (const id in interpolatedState.players) {
                const p = interpolatedState.players[id];
                ctx.fillStyle = p.color;
                
                // Draw Player Shape
                ctx.fillRect(p.x - 10, p.y - 10, 20, 20); // Center the 20x20 box

                // Draw Score
                ctx.fillStyle = 'white';
                ctx.font = '12px Arial';
                ctx.fillText(`Score: ${p.score}`, p.x - 10, p.y - 15);
                
                // Highlight 'Me'
                if (id === myId) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(p.x - 10, p.y - 10, 20, 20);
                }
            }
        }
    }

    requestAnimationFrame(render);
}

// Start rendering
requestAnimationFrame(render);