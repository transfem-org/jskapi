#!/bin/sh
cd /jsmkapi && /usr/local/bin/node /jsmkapi/index.js
service nginx start
cron -f -L 15