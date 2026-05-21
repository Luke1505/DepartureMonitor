# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm install
COPY frontend ./frontend
RUN mkdir -p backend/public && cd frontend && npm run build
# Output lands at /build/backend/public (matches vite outDir: '../backend/public')

# Stage 2: Install backend production deps
FROM node:20-alpine AS backend-deps
WORKDIR /app
COPY backend/package.json ./
RUN npm install --production

# Stage 3: Final runtime image
FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/src ./src
COPY backend/package.json ./
COPY --from=frontend-builder /build/backend/public ./public
EXPOSE 3000
CMD ["node", "src/index.js"]
