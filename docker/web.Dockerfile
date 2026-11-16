FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN HUSKY=0 bun install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
ARG API_INTERNAL_URL=http://api:8080
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web build

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ARG API_INTERNAL_URL=http://api:8080
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 API_INTERNAL_URL=$API_INTERNAL_URL
COPY --from=build --chown=bun:bun /app /app
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD bun -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["bun", "run", "--cwd", "apps/web", "start"]
