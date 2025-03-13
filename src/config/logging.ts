/* eslint-disable */
import * as bunyan from 'bunyan';

import { LogLevel, LoggerService } from '@nestjs/common';
import { Readable } from 'stream';

export function serializeAxiosError(err) {
  if (!err || !err.stack) {
    return err;
  }

  let data = err.response?.data;
  if (data && data instanceof Readable) {
    data = '<<stream>>';
  }

  let reqBody = err.config.data;
  if (err.config.data instanceof Readable) {
    reqBody = '<<stream>>';
  }

  if (err.isAxiosError === true) {
    let obj = {
      // Standard
      message: err.message,
      name: err.name,
      stack: err.stack,
      errno: err.errno,

      // Axios
      code: err.code,
      request: {
        url: err.config.url,
        baseURL: err.config.baseURL,
        method: err.config.method,
        timeout: err.config.timeout,
        data: reqBody,
        headers: err.config.headers,
      },
      response: {
        status: err.response?.status,
        data: data,
        headers: err.response?.headers,
      },
    };

    if (obj.request.headers?.['authorization']) {
      obj.request.headers['authorization'] = '***';
    }
    if (obj.request.headers?.['Authorization']) {
      obj.request.headers['Authorization'] = '***';
    }

    return obj;
  }

  return {
    message: err.message,
    name: err.name,
    stack: err.stack,
    code: err.code,
    signal: err.signal,
    errno: err.errno,
  };
}

// dont introduce a dependency on lodash
const pick = function (src: any, keys: string[]): any {
  const newObject = {};
  keys.forEach((key) => {
    if (key.startsWith('*')) {
      key = key.substring(1);
      if (src[key] !== undefined) {
        newObject[key] = src[key].substring(0, 12) + '***';
      }
    } else {
      newObject[key] = src[key];
    }
  });
  return newObject;
};

function serializeHttpError(err): any {
  if (err.name == 'HttpError' && typeof err.response?.toJSON == 'function') {
    const j = err.response.toJSON();
    return {
      responseBody: j.body,
      statusCode: err.statusCode,
      request: {
        uri: j.request.uri.href,
        method: j.request.method,
        headers: pick(j.request.headers, [
          'content-type', //
          '*Authorization',
          '*authorization',
        ]),
      },
    };
  }

  return err;
}

export function axiosAwareErrorSerializer(err) {
  if (err?.isAxiosError === true) {
    return serializeAxiosError(err);
  }

  if (err?.name == 'HttpError') {
    return serializeHttpError(err);
  }

  // below segment copied from https://github.com/trentm/node-bunyan/blob/master/lib/bunyan.js#L1141
  // to avoid dependency on bunyan
  if (!err || !err.stack) {
    return err;
  }

  let obj = {
    message: err.message,
    name: err.name,
    stack: err.stack,
    code: err.code,
    signal: err.signal,
    originalError: err.originalError, // https://github.com/aws/aws-sdk-js/blob/master/lib/error.d.ts
  };
  return obj;
}

function makeStream(): any {
  if (process.env.MODE == 'cli') {
    const fmt = require('bunyan-format');
    return fmt({ outputMode: 'short' }, process.stderr);
  }

  return process.stdout;
}

const streams: bunyan.Stream[] = [
  {
    stream: makeStream(),
    level: 'debug',
  },
];

export const logger = bunyan.createLogger({
  name: 'ess',
  serializers: {
    ...bunyan.stdSerializers,
    err: axiosAwareErrorSerializer,
  },
  streams: streams,
});

export class BunyanLogger implements LoggerService {
  log(message: any, ...optionalParams: any[]) {
    logger.info(message, optionalParams);
  }
  error(message: any, ...optionalParams: any[]) {
    logger.error(message, optionalParams);
  }
  warn(message: any, ...optionalParams: any[]) {
    logger.warn(message, optionalParams);
  }
  debug(message: any, ...optionalParams: any[]) {
    logger.debug(message, optionalParams);
  }
  verbose(message: any, ...optionalParams: any[]) {
    logger.trace(message, optionalParams);
  }
  setLogLevels?(levels: LogLevel[]) {
    // TODO ?? what
  }
}
