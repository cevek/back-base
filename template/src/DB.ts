import {BaseDB} from 'backend-base';
import {DBSchema} from './DBSchema';

export const DB = {} as new () => BaseDB<DBSchema>;
