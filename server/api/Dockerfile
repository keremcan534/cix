FROM node:22-alpine
# Yönetim › Hediyeler turns a transparent source video (ffmpeg) or an SVGA (tools/svga-to-fx.py: Python, numpy,
# Pillow) into the phones' stacked MP4 (custom-gifts.mjs).
RUN apk add --no-cache ffmpeg python3 py3-numpy py3-pillow
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY *.mjs version.txt ./
COPY room-games ./room-games
COPY tools ./tools
COPY migrations ./migrations
COPY fx ./fx
COPY art ./art
# VIP seti (vip-set.mjs): the VIP 1-10 frames, bubbles and entry effects added to the shop once.
COPY vip-set ./vip-set
USER node
CMD ["node", "index.mjs"]
