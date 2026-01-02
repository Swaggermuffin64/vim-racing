FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev deps for build, then prune)
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --production

# Expose port (Fly.io uses 8080)
EXPOSE 8080

# Start server
CMD ["node", "dist/index.js"]

