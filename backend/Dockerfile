# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install production deps only
COPY package*.json ./
COPY yarn.lock ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nodejs

# Hathora injects HATHORA_PORT at runtime
# For local testing, default to 3001
ENV PORT=3001

# Expose port (Hathora will override via HATHORA_PORT)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${HATHORA_PORT:-${PORT:-3001}}/ || exit 1

# Start the server
CMD ["node", "dist/index.js"]
