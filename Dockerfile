FROM node:22-bookworm-slim AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./dist

EXPOSE 3004

# Set image version environment variable
# This can be overridden at build time with --build-arg IMAGE_VERSION=<version>
ARG IMAGE_VERSION=v1.0.0
ENV IMAGE_VERSION=${IMAGE_VERSION}
ENV NODE_ENV=production

CMD ["node", "dist/main"]
