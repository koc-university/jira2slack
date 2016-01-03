FROM node:slim

RUN apt-get update && \
    apt-get install -y git

RUN npm install -g sails grunt bower pm2 npm-check-updates
RUN mkdir -p /usr/src/app

COPY package.json /usr/src/app/
RUN cd /usr/src/app; npm install

COPY . /usr/src/app

WORKDIR /usr/src/app

EXPOSE 1337

CMD ["sails", "lift"]
