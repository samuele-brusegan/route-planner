FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache docker-cli
COPY package.json ./
RUN npm install

# Copy server code
COPY *.js ./

# Expose port
EXPOSE 3000

# Start server
CMD node server.js
