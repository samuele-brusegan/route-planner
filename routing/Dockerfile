FROM node:18-alpine

# Create data directories
RUN mkdir -p /data/valhalla_tiles \
    /data/dem \
    /data/timezones \
    /data/elevation_tiles

# Copy simple routing server
COPY server.js /app/server.js
COPY package.json /app/package.json

WORKDIR /app
RUN npm install

WORKDIR /data

EXPOSE 8002

# Start routing service
CMD node /app/server.js
