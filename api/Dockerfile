FROM node:22-alpine

WORKDIR /app

# Dépendances de production uniquement, installées depuis le lockfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Dans le conteneur, l'API écoute toujours sur 3000 (publié sur l'hôte en 3002).
# DATABASE_URL est fourni au lancement : jamais de secret dans l'image.
ENV NODE_ENV=production \
    PORT=3000

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node en PID 1 reçoit directement le SIGTERM de docker stop
CMD ["node", "src/server.js"]
