FROM node:24-bookworm-slim

ARG TYPST_VERSION=v0.14.2
# App-Branch, der geklont wird (kann beim Build überschrieben werden).
ARG APP_REF=main

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
 && rm -rf /var/lib/apt/lists/*

# Typst (statischer aarch64-musl-Build – läuft unabhängig von der glibc-Version).
RUN curl -fsSL "https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-aarch64-unknown-linux-musl.tar.xz" -o /tmp/typst.tar.xz \
 && tar -xJf /tmp/typst.tar.xz -C /tmp \
 && mv /tmp/typst-aarch64-unknown-linux-musl/typst /usr/local/bin/typst \
 && rm -rf /tmp/typst* \
 && typst --version

# Cache-Buster: Inhalt ändert sich bei jedem neuen Commit auf den Branch →
# erzwingt eine frische Ausführung des nachfolgenden git-clone (statt Docker-Cache).
ADD "https://api.github.com/repos/acebarn/recipe-cards/commits/${APP_REF}" /tmp/app-commit.json

# App-Code klonen und Abhängigkeiten installieren.
RUN git clone --depth 1 --branch "${APP_REF}" https://github.com/acebarn/recipe-cards.git /app
WORKDIR /app
RUN npm ci --omit=dev

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD [ "/run.sh" ]
