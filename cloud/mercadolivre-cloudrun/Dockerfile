# Read-only Mercado Livre egress check. No affiliate credentials or cookie state.
# Pin the Playwright runtime and browser image versions together.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-fund --no-audit --ignore-scripts
COPY src/public-origin-probe.mjs ./src/public-origin-probe.mjs
USER pwuser
ENV MAVURI_ML_PROBE_ONLY=YES_PUBLIC_READONLY
CMD ["node","src/public-origin-probe.mjs"]
