FROM gamepanel-runtime:source-v1
USER root
COPY metamod-official.tar.gz sourcemod-official.tar.gz steamclient.so /opt/classic-assets/
RUN echo '3c80c8612f53001d13be94daa05c6e8ec4b8214e05b287e94893e82edd143bd0  /opt/classic-assets/metamod-official.tar.gz' | sha256sum -c - \
 && echo '1cbb57a4617e5234aa1a3a6cd2799bde6762d3028b7437263798929b5f9fcbce  /opt/classic-assets/sourcemod-official.tar.gz' | sha256sum -c - \
 && echo '1450da1206678be950d4a9916ab87d229e04076776cdd64c78f8e5419da15fb5  /opt/classic-assets/steamclient.so' | sha256sum -c - \
 && chmod 644 /opt/classic-assets/steamclient.so \
 && mkdir -p /opt/classic-frameworks/metamod /opt/classic-frameworks/sourcemod \
 && tar -xzf /opt/classic-assets/metamod-official.tar.gz -C /opt/classic-frameworks/metamod \
 && tar -xzf /opt/classic-assets/sourcemod-official.tar.gz -C /opt/classic-frameworks/sourcemod \
 && rm /opt/classic-assets/*.tar.gz
COPY classic-install classic-start /usr/local/lib/gamepanel/
RUN chmod 755 /usr/local/lib/gamepanel/classic-*
USER 1000:1000
