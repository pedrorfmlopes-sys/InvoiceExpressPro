// server/src/utils/logger.js
const fs = require('fs');
const path = require('path');

// Basic logger - can be enhanced later
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level}] ${message}${metaStr}`;
}

const logger = {
  info: (msg, meta) => console.log(formatMessage(LOG_LEVELS.INFO, msg, meta)),
  warn: (msg, meta) => console.warn(formatMessage(LOG_LEVELS.WARN, msg, meta)),
  error: (msg, meta) => console.error(formatMessage(LOG_LEVELS.ERROR, msg, meta)),
  debug: (msg, meta) => {
    if (process.env.DEBUG) console.debug(formatMessage(LOG_LEVELS.DEBUG, msg, meta));
  }
};

module.exports = logger;
