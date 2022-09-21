FROM node:14-alpine AS build
WORKDIR /app

COPY . /app
RUN npm install
RUN npm run build

FROM node:14-alpine
WORKDIR /app

ENV NODE_ENV production

COPY --from=build /app/out /app
COPY --from=build /app/node_modules /app/node_modules

RUN npm prune

ENTRYPOINT [ "node", "/app/index.js" ]