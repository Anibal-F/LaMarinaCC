FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm install

COPY . /app/

EXPOSE 3010

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3010"]
