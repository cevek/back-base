import {createGraphqApp, logger, setService} from 'backend-base';
import {config} from './config';
import {DBSchema} from './DBSchema';
import {Errors} from './Errors';
import {graphQLResolver} from './resolvers';
import {DB} from './DB';

async function main() {
    const app = await createGraphqApp<DBSchema>({
        session: {
            secret: config.secret,
        },
        graphql: {
            schema: require.resolve('./GraphQLSchema.d.ts'),
            resolver: graphQLResolver,
        },
        db: {
            config: config.db,
            schema: require.resolve('./DBSchema.d.ts'),
            errorEntityNotFound: Errors.EntityNotFound,
        },
        errors: {
            unknown: Errors.SomethingWentWrong,
        },
        port: config.port,
    });
    setService(DB, app.db);
}

main().catch(err => logger.error(err));
