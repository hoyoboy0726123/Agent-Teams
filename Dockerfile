FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web
ENV HOST=0.0.0.0 PORT=3789 AGENT_TEAMS_DATA=/data
VOLUME /data
EXPOSE 3789
CMD ["node", "--no-warnings", "server/index.js"]
