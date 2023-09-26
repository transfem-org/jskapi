# bad docker file nya~
FROM node:20-bookworm as node
RUN apt-get update && apt-get install -y cron nginx
RUN npm install -g pnpm
RUN echo "0 */12 * * * cd /jsmkapi && /usr/local/bin/node /jsmkapi/index.js >> /jsmkapi/logs 2>&1" | crontab -
WORKDIR /jsmkapi
COPY package.json pnpm-lock.yaml ./
COPY index.js getInstancesInfos.js loadyaml.js ./
COPY data/ignorehosts.yml ./data/ignorehosts.yml
COPY data/instances.yml ./data/instances.yml
RUN pnpm install
COPY run.sh /run.sh
COPY nginx.conf /etc/nginx/sites-enabled/default
ENTRYPOINT ["/bin/bash"]
EXPOSE 80
CMD ["/run.sh"]