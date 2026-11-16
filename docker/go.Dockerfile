FROM golang:1.27.4-alpine AS build
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/jot-api ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/jot-worker ./cmd/worker \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/jot-migrate ./cmd/migrate

FROM alpine:3.24.4 AS runtime
RUN apk add --no-cache ca-certificates wget \
 && addgroup -S jot && adduser -S -G jot -u 10001 jot \
 && mkdir -p /data/uploads && chown jot:jot /data/uploads
COPY --from=build /out/ /usr/local/bin/
WORKDIR /app
USER jot
ENV API_ADDR=:8080 UPLOAD_DIR=/data/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1
CMD ["jot-api"]
