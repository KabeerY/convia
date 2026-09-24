FROM node:22.22.3-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY frontend/package.json frontend/package.json
COPY backend/core-api/package.json backend/core-api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY packages/contracts packages/contracts
COPY backend/core-api backend/core-api
RUN pnpm --filter @convia/contracts build && pnpm --filter @convia/core-api build
CMD ["node", "backend/core-api/dist/server.js"]
