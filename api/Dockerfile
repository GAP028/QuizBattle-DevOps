FROM node:22-alpine

WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node api/src ./src

# Bibliothèque de supervision commune (métriques et pulse), comme front et stats.
# Ses fichiers sont des modules ESM alors que l'API est en CommonJS : le
# package.json local indique à Node de les lire comme modules.
COPY --chown=node:node monitoring/lib/ ./lib/
RUN echo '{ "type": "module" }' > lib/package.json

# Dossier du pavillon : appartient à node pour que la panne 3 (chmod 000) soit visible
RUN mkdir /data && chown node:node /data

# DATABASE_URL, VERSION et les variables du pulse sont fournies au lancement
ENV NODE_ENV=production \
    PORT=3000 \
    SERVICE=api

USER node

EXPOSE 3000

# wget (BusyBox) plutôt que node -e : démarrer un process Node à chaque vérification
# prenait jusqu'à 5 s sur une machine chargée et rendait le service "unhealthy" à tort.
# /sante renvoie 503 si la base ne répond pas : wget échoue alors aussi.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/sante || exit 1

CMD ["node", "src/server.js"]
