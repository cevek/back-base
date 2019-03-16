import {createGraphqApp} from 'back-base';
import {config} from './config';
import {DBSchema} from './DBSchema';
import {Errors} from './Errors';
import {setGlobalDB, setGlobalLogger} from './globals';
import {GraphQLValues} from './GraphQL';

async function main() {
    const app = await createGraphqApp<DBSchema>({
        session: {
            secret: config.secret,
        },
        logger: {},
        graphql: {
            schema: require.resolve('./GraphQLSchema.d.ts'),
            values: GraphQLValues,
        },
        db: {
            user: process.env.DB_USER!,
            password: process.env.DB_PASSWORD!,
            database: process.env.DB_NAME!,
            host: process.env.DB_HOST || 'localhost',
            schema: require.resolve('./DBSchema.d.ts'),
            errorEntityNotFound: Errors.EntityNotFound,
        },
        errors: {
            unknown: Errors.SomethingWentWrong,
        },
        port: config.port,
    });

    setGlobalLogger(app.logger);
    setGlobalDB(app.db);
}

main().catch(err => console.error(err));
