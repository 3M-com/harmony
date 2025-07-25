ARG BASE_IMAGE=node:22.14.0
FROM --platform=$BUILDPLATFORM $BASE_IMAGE
ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN echo "Building for $TARGETPLATFORM on $BUILDPLATFORM"

RUN apt-get update && apt-get install -y sqlite3 libsqlite3-dev python3 python3-pip python3-venv libpq-dev build-essential libgdal-dev

RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

RUN pip install --only-binary :all: --upgrade pip awscli==1.33.37 boto3==1.34.155
RUN pip install awscli-local
RUN pip install --upgrade setuptools

RUN mkdir -p /harmony/services/harmony /harmony/packages/util
RUN chown -R node:node /harmony

COPY --chown=node:node built/packages/util/package.json built/packages/util/package-lock.json /harmony/packages/util/
WORKDIR /harmony/packages/util
RUN env NODE_ENV=production npm ci

COPY --chown=node:node built/services/harmony/package.json built/services/harmony/package-lock.json /harmony/services/harmony/
WORKDIR /harmony/services/harmony
# Use * in the filename below to only do the copy if a matching file exists (it will in the GitHub workflow)
COPY gdal-async-linux-arm64.*.gz /harmony/services/harmony/

RUN if [ "$TARGETPLATFORM" = "linux/arm64" ] && [ -f "gdal-async-linux-arm64.tar.gz" ]; then \
  echo "Installing linux/arm64 gdal-async from file" && \
  tar -xzf gdal-async-linux-arm64.tar.gz && \
  npm install ./gdal-async; \
  else \
  echo "Installing gdal-async from npmjs.com" && \
  npm install gdal-async; \
  fi

RUN env NODE_ENV=production npm ci --force --loglevel verbose

RUN npm install ts-node-dev


COPY --chown=node:node built /harmony

USER node

ENTRYPOINT [ "npm", "run", "start" ]