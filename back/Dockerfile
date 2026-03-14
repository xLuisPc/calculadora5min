FROM node:20-alpine

WORKDIR /app/back

COPY back/package*.json ./
RUN npm install

COPY back ./
COPY front ../front

EXPOSE 3000

CMD ["npm", "start"]
