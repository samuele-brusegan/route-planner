FROM node:18-alpine

# Install curl for downloading tiles
RUN apk add --no-cache curl

# Create data directories
RUN mkdir -p /data/valhalla_tiles \
    /data/dem \
    /data/timezones \
    /data/elevation_tiles

# Copy routing server files
COPY server.js /app/server.js
COPY package.json /app/package.json

# Copy and install tile download script
COPY download_tiles.sh /app/download_tiles.sh
RUN chmod +x /app/download_tiles.sh

WORKDIR /app
RUN npm install

# Note: Tiles are downloaded at runtime by the valhalla container
# This script is available for manual execution if needed

WORKDIR /data

EXPOSE 8002

# Start routing service
CMD node /app/server.js
