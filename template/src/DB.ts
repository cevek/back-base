import {BaseDB, service} from 'backend-base';
import {DBSchema} from './DBSchema';

export const DB = {
    get instance() {
        return service.get(DB) as BaseDB<DBSchema>;
    },
} as {new (): BaseDB<DBSchema>; instance: BaseDB<DBSchema>};
