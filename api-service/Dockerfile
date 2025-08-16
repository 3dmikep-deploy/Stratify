# api-service/Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install Python for the parser service integration and curl for healthcheck
RUN apk add --no-cache python3 py3-pip python3-dev build-base curl

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/services/server.js"]
