FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev deps for build)
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN node -e "const fs=require('node:fs');const path=require('node:path');const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const srcPath=path.join(dir,entry.name);if(entry.isDirectory()){walk(srcPath);continue;}if(!entry.name.endsWith('.json'))continue;const rel=path.relative('src',srcPath);const outPath=path.join('dist',rel);fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.copyFileSync(srcPath,outPath);}};walk('src');"

FROM node:20-slim AS production

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --create-home nodejs

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port (Fly.io uses 8080)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start server
CMD ["node", "dist/index.js"]
