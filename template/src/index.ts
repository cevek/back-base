import {createApp, logger,  createGraphQLMiddleware, service} from 'backend-base';
import {config} from './config';
import {DBSchema} from './DBSchema';
import {graphQLResolver} from './resolvers';
import {DB} from './DB';

async function main() {
    const app = await createApp<DBSchema>({
        session: {
            secret: config.secret,
        },
        db: {
            config: config.db,
            schema: require.resolve('./DBSchema.d.ts'),
        },
        routes: {
            api: {
                graphql: createGraphQLMiddleware({
                    resolver: graphQLResolver,
                    schema: require.resolve('./GraphQLSchema.d.ts'),
                }),
            },
        },
        port: config.port,
    });
    service.add(DB, app.db);
}

main().catch(err => logger.error(err));
