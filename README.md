# Multiplayer State Synchronization - Coin Collector

This project is a raw implementation of a real-time multiplayer game using **Node.js** and **WebSockets**. [cite_start]It demonstrates **Server Authority**, **Latency Simulation (200ms)**, and **Entity Interpolation** without the use of game engines or high-level networking frameworks (like Photon or Mirror).

## Project Overview

The game consists of a central authoritative server and multiple connecting clients. Players control a shape to collect coins. The server manages all game logic (physics, collisions, scoring), while the clients purely render the state.

### Key Features
* **Authoritative Server:** The server is the single source of truth. [cite_start]It resolves collisions and validates score events.
* [cite_start]**Latency Simulation:** A forced **200ms delay** is injected into all network traffic (both Input and State packets) to simulate degraded network conditions.
* [cite_start]**Entity Interpolation:** Clients implement snapshot interpolation (rendering ~100ms in the past) to ensure smooth player movement despite the network lag and jitter.
* **Cheat Prevention:** Clients send only "Intent" (inputs), not coordinates. [cite_start]Clients cannot spoof positions or self-report scores.

---

## Technology Stack

* **Runtime:** Node.js
* [cite_start]**Networking:** `ws` (Raw WebSockets)
* **Client:** HTML5 Canvas + Vanilla JavaScript (No engines)
* **Architecture:** Client-Server (Authoritative)

---

## Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone <repository_url>
    cd multiplayer-test
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run the Server**
    ```bash
    node server.js
    ```
    *The server runs on port 3000 by default.*

4.  **Play**
    * Open your browser to `http://localhost:3000`.
    * [cite_start]Open a **second tab/window** to the same URL to test multiplayer sync.
    * **Note:** Arrange windows side-by-side to observe the interpolation smoothness vs. the input latency.

---

## Controls

* **Movement:** `W`, `A`, `S`, `D` or `Arrow Keys`.
* **Goal:** Move your square over the **Gold Circles** (Coins) to increase your score.

---

## Technical Implementation Details

### 1. Server Authority (The "Truth")
The server runs a game loop at **20Hz (50ms ticks)**.
* **Input Handling:** Clients send keystrokes (`'up'`, `'left'`). These are queued and processed during the server tick.
* **Collision:** The server calculates the distance between the authoritative player position and the coins. If `distance < radii`, the score is updated.
* **State Broadcast:** The server sends a snapshot of the entire world (`{ players, coins, timestamp }`) to all clients after every tick.

### 2. Network Simulation (The 200ms Constraint)
[cite_start]To meet the resilience requirement, `setTimeout` wrappers are used on both ends:
* **Client:** `sendInput` waits 200ms before actually emitting the WebSocket message.
* **Server:** `broadcast` waits 200ms before sending the state snapshot to clients.
* **Result:** A minimum 400ms Round-Trip-Time (RTT) delay between pressing a key and receiving the confirmed position.

### 3. Client-Side Interpolation (Smoothness)
Because data arrives late and in discrete chunks (20Hz), naive rendering would result in choppy teleportation.
* **The Solution:** The client does not render the *current* server state. Instead, it maintains a **State Buffer**.
* **Render Time:** The client renders the world at `Date.now() - 100ms`.
* **Linear Interpolation (Lerp):** The client finds two snapshots surrounding the render time (one in the past, one in the future relative to render time) and calculates the exact intermediate position.
    ```javascript
    // Concept
    Position = StartPos + (EndPos - StartPos) * percentComplete
    ```

---

## Folder Structure

```
KraftonAssignment/
├── package.json          # Dependencies (express, ws, uuid)
├── server.js             # Authoritative Game Server + 200ms Lag Simulation
└── public/
    ├── index.html        # Game container and UI
    └── client.js         # Client logic: interpolation, rendering, input handling
```

---

## Evaluation Checklist

| Requirement | Implementation Status |
| :--- | :--- |
| **No Frameworks** | **Pass:** Used only native `ws` and standard HTML5/JS. |
| **Server Authority** | **Pass:** Server calculates position/score. Inputs are sanitized. |
| **200ms Latency** | **Pass:** Hardcoded latency injection in `server.js` and input handling. |
| **Smoothness** | **Pass:** Client uses a buffer and interpolates between frames. |
| **Correct Scoring** | **Pass:** Collision logic is strictly server-side. |