FROM node:22-bullseye-slim


WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3004

# Set image version environment variable
# This can be overridden at build time with --build-arg IMAGE_VERSION=<version>
ARG IMAGE_VERSION=v1.0.0
ENV IMAGE_VERSION=${IMAGE_VERSION}

CMD ["node", "dist/main"]