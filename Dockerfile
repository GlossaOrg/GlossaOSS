# syntax=docker/dockerfile:1.7

# ---- build: `mvn package` builds the frontend into the jar too (flash-ext-vite-maven-plugin), so
#      this one stage needs a JDK and Node. It runs on the builder's platform: only the runtime
#      layer below is per-architecture. ----
FROM --platform=$BUILDPLATFORM node:22-slim AS node
FROM --platform=$BUILDPLATFORM maven:3.9-eclipse-temurin-21 AS build
COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
    && corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /build
# The whole repository, minus what .dockerignore drops: one line that no new directory can outdate.
COPY . .
# Flash and its Maven plugin resolve anonymously from their public registry (see pom.xml).
# Tests need Testcontainers (a real Postgres via Docker) and can't run inside an isolated
# `docker build` stage — CI runs them before this image is built, not here.
RUN --mount=type=cache,target=/root/.m2 --mount=type=cache,target=/root/.local/share/pnpm/store \
    mvn -B -DskipTests package

# ---- runtime ----
FROM eclipse-temurin:21-jre-alpine AS runtime
# Nothing here writes to disk: the jar serves its own frontend and everything else is Postgres.
RUN adduser -D -H glossa
USER glossa
WORKDIR /app
COPY --from=build /build/backend/target/glossa.jar ./glossa.jar
EXPOSE 8080
# Temurin is container-aware (cgroup limits visible to the JVM since JDK 10+), but only if a
# limit is actually declared on the container. JDK_JAVA_OPTIONS is the standard java launcher
# env var (JDK 9+, not Temurin-specific) — override it per-deployment without rebuilding.
ENV JDK_JAVA_OPTIONS="-XX:MaxRAMPercentage=75.0 -Dorg.jboss.logging.provider=slf4j -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8"
ENTRYPOINT ["java", "-jar", "glossa.jar"]
