ARG SOURCE_BASE=gamepanel-runtime:linux-v1
ARG SOURCE2_BASE=registry.gitlab.steamos.cloud/steamrt/sniper/sdk@sha256:1c33c507bc75d012e77df5727f93b0d5b8c3f7c8d4142ba5f7a16882cc92e014
ARG INSTALLER_BASE=gamepanel-installer:steamcmd-v1
FROM ${SOURCE_BASE} AS source
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 libicu72 libunwind8 libssl3 zlib1g libtinfo6 \
    && rm -rf /var/lib/apt/lists/*
COPY start.sh /usr/local/lib/gamepanel/source-start
COPY source-loaders /usr/local/lib/gamepanel/source-loaders
COPY source-console /usr/local/lib/gamepanel/source-console
COPY hltv-start /usr/local/lib/gamepanel/hltv-start
RUN chmod 755 /usr/local/lib/gamepanel/source-*
RUN chmod 755 /usr/local/lib/gamepanel/hltv-start
USER 1000:1000

FROM ${SOURCE2_BASE} AS source2
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 libicu67 libunwind8 libssl1.1 zlib1g libcurl4 \
    && rm -rf /var/lib/apt/lists/* && mkdir -p /data && chown 1000:1000 /data
COPY start.sh /usr/local/lib/gamepanel/source-start
COPY source-loaders /usr/local/lib/gamepanel/source-loaders
COPY source-console /usr/local/lib/gamepanel/source-console
RUN chmod 755 /usr/local/lib/gamepanel/source-*
ENV HOME=/data
USER 1000:1000
WORKDIR /data
ENTRYPOINT []
CMD ["/bin/false"]

FROM ${INSTALLER_BASE} AS installer
USER root
COPY install.sh /usr/local/lib/gamepanel/source-install
COPY hltv-install /usr/local/lib/gamepanel/hltv-install
RUN chmod 755 /usr/local/lib/gamepanel/source-install
RUN chmod 755 /usr/local/lib/gamepanel/hltv-install
USER 1000:1000
