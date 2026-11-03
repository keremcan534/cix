# Finance Control (github.com/keremcan534/similarclup-finance-control), the separate finance panel, on the
# same server as the API. The deploy job (server.yml) puts the panel's source next to this file in
# /opt/similar/finance and builds it; compose.yaml runs it as the "finance" service. docs/SUNUCU.md.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY web ./web
# The database lives in the "financedata" volume. A new volume takes this folder's owner, so the panel can
# write there without running as root.
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "server/main.ts"]
