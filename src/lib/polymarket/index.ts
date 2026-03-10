/**
 * Polymarket API Client
 * Aggregates Gamma, Data, and CLOB API clients
 */

import { gammaClient } from './gamma';
import { dataClient } from './data';
import { clobClient } from './clob';

export const polymarketClient = {
  gamma: gammaClient,
  data: dataClient,
  clob: clobClient,
};

export { gammaClient } from './gamma';
export { dataClient } from './data';
export { clobClient } from './clob';
