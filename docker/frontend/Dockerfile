FROM node:22-alpine

WORKDIR /app

COPY docker/frontend/package.json ./
RUN npm install --omit=dev

COPY --chown=node:node docker/frontend/server.js ./
COPY --chown=node:node docker/frontend/index.html ./public/index.html
COPY --chown=node:node monitoring/lib/ ./lib/

RUN mkdir -p /data && chown node:node /data

ENV PORT=3000
ENV SERVICE=front

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["npm", "start"]
