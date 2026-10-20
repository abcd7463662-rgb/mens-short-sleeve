FROM node:22-slim AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec vite build \
    && pnpm exec esbuild server.ts --bundle --platform=node --format=cjs \
       --packages=external --outfile=dist/server.cjs

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
