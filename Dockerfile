# syntax=docker/dockerfile:1

# One image, "worldup-app", for three services (see docker-compose.yml):
#   worldup-web     default CMD, Next.js standalone server on port 3000
#   worldup-migrate node migrate.js
#   worldup-worker  node worker.js

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/dist/migrate.js /app/dist/worker.js ./
COPY --from=build /app/drizzle ./drizzle

# Mount point of the "uploads" volume: a new named volume takes this ownership.
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 3000
CMD ["node", "server.js"]
