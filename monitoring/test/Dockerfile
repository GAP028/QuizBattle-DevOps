# Image du banc de test, construite depuis le dossier monitoring/ (voir compose.test.yml).
FROM node:22-alpine
WORKDIR /app
COPY test/package.json ./
RUN npm install --omit=dev
COPY lib/metrics.js lib/pulse.js test/service.js ./
# /data appartient à node : un volume neuf hérite de ces droits, et le chmod 000
# de la panne 3 n'est visible que pour un utilisateur non root.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "service.js"]
