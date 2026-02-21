# Vim Racing

Competitive vim motion racing. Practice alone or race others in real time.

**Play now at [vimgym.app](https://vimgym.app)**

## Features

- Real-time multiplayer racing via WebSocket
- Vim navigation and deletion tasks
- Solo practice mode
- Quick match and private rooms

## Tech Stack

- **Frontend:** React 19, Vite, CodeMirror 6 with [@replit/codemirror-vim](https://github.com/replit/codemirror-vim)
- **Backend:** Fastify, Socket.IO
- **Matchmaking:** Node.js, WebSocket (ws), [Hathora Cloud](https://hathora.dev)

## Local Development

### Prerequisites

- Node.js 20+
- A [Hathora](https://console.hathora.dev) account (for multiplayer; solo practice works without it)

### Environment Variables

Each service needs its own `.env` file:

**frontend/.env**

```
VITE_BACKEND_URL=http://localhost:3001
VITE_USE_HATHORA=false
```

**backend/.env**

```
HATHORA_APP_ID=your_app_id
HATHORA_TOKEN=your_token
HATHORA_APP_SECRET=your_app_secret
```

**matchmaking/.env**

```
HATHORA_APP_ID=your_app_id
HATHORA_TOKEN=your_token
HATHORA_APP_SECRET=your_app_secret
```

### Running

Start each service in its own terminal:

```bash
# Frontend (localhost:3000)
cd frontend && npm install && npm run dev

# Backend (localhost:3001)
cd backend && npm install && npm run dev

# Matchmaking (localhost:3002)
cd matchmaking && npm install && npm run dev
```

Solo practice works with just the frontend and backend. Matchmaking is only needed for quick match multiplayer.

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE).
