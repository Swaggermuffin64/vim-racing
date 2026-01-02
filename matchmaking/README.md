# Vim Racing Matchmaking Service

A lightweight WebSocket-based matchmaking server that queues players and creates Hathora rooms when matches are found.

## How It Works

```
┌─────────────┐     1. Connect & queue     ┌─────────────────────┐
│   Player A  │ ─────────────────────────► │  Matchmaking Server │
└─────────────┘                            │  (this service)     │
                                           │                     │
┌─────────────┐     2. Connect & queue     │  - Player queue     │
│   Player B  │ ─────────────────────────► │  - FIFO matching    │
└─────────────┘                            └─────────┬───────────┘
                                                     │
                                     3. Create Hathora room
                                     4. Send roomId + URL to both
                                                     ▼
┌─────────────┐                            ┌─────────────────────┐
│   Player A  │ ◄───── 5. Connect ───────► │   Hathora Room      │
│   Player B  │        to game server      │   (game server)     │
└─────────────┘                            └─────────────────────┘
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables:
   ```bash
   export HATHORA_APP_ID=your_app_id
   export HATHORA_DEV_TOKEN=your_dev_token
   export PORT=3002                    # optional, default 3002
   export PLAYERS_PER_MATCH=2          # optional, default 2
   export HATHORA_REGION=Seattle       # optional, default Seattle
   ```

3. Run in development:
   ```bash
   npm run dev
   ```

4. Build and run for production:
   ```bash
   npm run build
   npm start
   ```

## WebSocket Protocol

### Client → Server Messages

```typescript
// Join the matchmaking queue
{ type: 'queue:join', playerName: string, region?: string }

// Leave the queue
{ type: 'queue:leave' }

// Keep-alive ping
{ type: 'ping' }
```

### Server → Client Messages

```typescript
// Confirmed queue join
{ type: 'queue:joined', position: number, playerId: string }

// Queue position update (when others join/leave)
{ type: 'queue:position', position: number }

// Confirmed queue leave
{ type: 'queue:left' }

// Match found! Connect to this Hathora room
{ 
  type: 'match:found', 
  roomId: string, 
  connectionUrl: string,
  players: Array<{ id: string, name: string }>
}

// Error occurred
{ type: 'error', message: string }

// Pong response
{ type: 'pong' }
```

## Frontend Integration Example

```typescript
const MATCHMAKING_URL = 'wss://your-matchmaking-server.com';

function quickMatch(playerName: string) {
  const ws = new WebSocket(MATCHMAKING_URL);
  
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'queue:join', playerName }));
  };
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    switch (msg.type) {
      case 'queue:joined':
        console.log(`Queued at position ${msg.position}`);
        break;
        
      case 'queue:position':
        console.log(`Queue position: ${msg.position}`);
        break;
        
      case 'match:found':
        console.log(`Match found! Room: ${msg.roomId}`);
        ws.close();
        // Connect to the Hathora game server
        connectToGameServer(msg.connectionUrl, msg.roomId, playerName);
        break;
        
      case 'error':
        console.error(msg.message);
        break;
    }
  };
}
```

## Deployment

### Railway / Render / Fly.io

1. Build the project: `npm run build`
2. Deploy with the following:
   - Start command: `npm start`
   - Environment variables: `HATHORA_APP_ID`, `HATHORA_DEV_TOKEN`

### Docker

```bash
npm run build
docker build -t vim-racing-matchmaking .
docker run -p 3002:3002 \
  -e HATHORA_APP_ID=your_app_id \
  -e HATHORA_DEV_TOKEN=your_dev_token \
  vim-racing-matchmaking
```

