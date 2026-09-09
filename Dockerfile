# syntax=docker/dockerfile:1.7

# ---- frontend (web/, served from the classpath in prod — see Main#webBundlerConfig() and the
#      `docker` Maven profile in pom.xml, which embeds this dist/ into the jar) ----
FROM node:22-alpine AS frontend
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate \
    && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ---- backend ----
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build
COPY pom.xml ./
COPY src ./src
COPY --from=frontend /web/dist ./web/dist
# dev.relism:flash resolves anonymously from Gitea's Maven registry (Relism/Flash5 is a public
# repo owned by a public user — see pom.xml's flash.version comment). No credentials needed.
# Tests need Testcontainers (a real Postgres via Docker) and can't run inside an isolated
# `docker build` stage — run `mvn test` as its own CI step before this image is built, not here.
RUN mvn -B -Pdocker -DskipTests package

# ---- runtime ----
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=backend /build/target/glossa.jar ./glossa.jar
EXPOSE 8080
# Temurin is container-aware (cgroup limits visible to the JVM since JDK 10+), but only if a
# limit is actually declared on the container. JDK_JAVA_OPTIONS is the standard java launcher
# env var (JDK 9+, not Temurin-specific) — override it per-deployment without rebuilding.
ENV JDK_JAVA_OPTIONS="-XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["java", "-jar", "glossa.jar"]
