# Image du service de statistiques. À construire depuis la racine du dépôt,
# comme le front, pour embarquer monitoring/lib :
#   docker build -f stats/Dockerfile -t quizbattle-stats .

# Étape 1 : installer les dépendances de production depuis le lockfile
FROM node:22-alpine AS dependances
WORKDIR /app
COPY stats/package.json stats/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Étape 2 : l'image finale ne garde que node_modules et le code, sans le cache npm
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 SERVICE=stats
COPY --from=dependances --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node stats/package.json stats/server.js ./
COPY --chown=node:node monitoring/lib/ ./lib/
# DATABASE_URL, VERSION et les variables du pulse sont fournies au lancement :
# aucun secret ni valeur d'environnement écrits dans l'image.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
