FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY *.mjs version.txt ./
COPY migrations ./migrations
USER node
CMD ["node", "index.mjs"]
