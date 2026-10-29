FROM node:22-alpine
# Chromium + ffmpeg + CJK/emoji fonts power MP4 export of video artifacts.
RUN apk add --no-cache chromium ffmpeg font-noto-cjk font-noto-emoji
ENV CHROMIUM_PATH=/usr/bin/chromium-browser PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web
ENV HOST=0.0.0.0 PORT=3789 AGENT_TEAMS_DATA=/data
VOLUME /data
EXPOSE 3789
CMD ["node", "--no-warnings", "server/index.js"]
