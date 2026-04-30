FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy server code
COPY server.js ./

# Expose port
EXPOSE 3000

# Start server
CMD node server.js
