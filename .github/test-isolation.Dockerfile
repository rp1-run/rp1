FROM oven/bun:1.3.5 AS boundary

USER root

RUN groupadd --gid 10001 rp1-test \
	&& useradd --uid 10001 --gid rp1-test --home-dir /home/rp1-protected --no-create-home --shell /bin/bash rp1-test \
	&& install -d --owner root --group root --mode 0555 /home/rp1-protected \
	&& printf 'rp1 protected home sentinel\n' > /home/rp1-protected/.rp1-test-home-sentinel \
	&& chmod 0444 /home/rp1-protected/.rp1-test-home-sentinel

COPY --chown=10001:10001 . /workspace

WORKDIR /workspace/cli

USER 10001:10001

ENV CI=true \
	HOME=/home/rp1-protected \
	USERPROFILE=/home/rp1-protected \
	RP1_TEST_HOME_BOUNDARY=1

FROM boundary AS test

USER root

# Bun builds the web UI's better-sqlite3 dependency from source during postinstall.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends build-essential ca-certificates git python3 \
	&& rm -rf /var/lib/apt/lists/*

COPY docker/certs/ /usr/local/share/ca-certificates/extra/

RUN update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN install -d --owner 10001 --group 10001 --mode 0755 \
	/tmp/rp1-install-home \
	/workspace/.bun-cache \
	/workspace/.puppeteer-cache

USER 10001:10001

ENV HOME=/tmp/rp1-install-home \
	USERPROFILE=/tmp/rp1-install-home \
	BUN_INSTALL_CACHE_DIR=/workspace/.bun-cache \
	PUPPETEER_CACHE_DIR=/workspace/.puppeteer-cache

RUN bun install --frozen-lockfile

USER root

RUN rm -rf /tmp/rp1-install-home \
	&& chmod 0555 /home/rp1-protected \
	&& chmod 0444 /home/rp1-protected/.rp1-test-home-sentinel

USER 10001:10001

ENV HOME=/home/rp1-protected \
	USERPROFILE=/home/rp1-protected \
	BUN_INSTALL_CACHE_DIR=/workspace/.bun-cache \
	PUPPETEER_CACHE_DIR=/workspace/.puppeteer-cache
