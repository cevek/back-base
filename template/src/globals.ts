import {Logger, DB} from '../../base';
import {DBSchema} from './DBSchema';

export let db: DB<DBSchema>;
export let logger!: Logger;

export const setGlobalLogger = (_logger: Logger) => (logger = _logger);
export const setGlobalDB = (_db: DB<DBSchema>) => (db = _db);
