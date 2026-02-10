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
RUN node -e "const fs=require('node:fs');const path=require('node:path');const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const srcPath=path.join(dir,entry.name);if(entry.isDirectory()){walk(srcPath);continue;}if(!entry.name.endsWith('.json'))continue;const rel=path.relative('src',srcPath);const outPath=path.join('dist',rel);fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.copyFileSync(srcPath,outPath);}};walk('src');"
RUN npm prune --production

# Expose port (Fly.io uses 8080)
EXPOSE 8080

# Start server
CMD ["node", "dist/index.js"]

