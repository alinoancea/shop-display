# Build stage - client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built client from builder
COPY --from=client-builder /app/client/dist ./client/dist

# Install su-exec for dropping privileges
RUN apk add --no-cache su-exec

# Run as non-root user
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app && chown -R app:app /app
RUN mkdir -p /app/data && chown app:app /app/data

COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

ENV NODE_ENV=production
EXPOSE 3001
