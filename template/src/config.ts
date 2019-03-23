import {getEnvNullable, getEnv} from 'backend-base';

export const config = {
    secret: '',
    port: Number(getEnvNullable('PORT')) || 4000,
    db: {
        user: getEnv('DB_USER'),
        password: getEnv('DB_PASSWORD'),
        database: getEnv('DB_NAME'),
        host: getEnvNullable('DB_HOST'),
        port: getEnvNullable('DB_PORT'),
    },
};
