import { DBClient, createDB } from './Base';

import { postgresqlRunTransaction, PostgresqlCollection } from './Postgresql';

interface User {
	id: string;
	name: string;
	login: string;
	todos: string[];
}

const client: DBClient = {
	query(query, values) {
		console.log(query, values);
		return [] as any;
	},
	release() {},
};

interface Schema {
	users: User;
}
async function main() {
	const db = await createDB<Schema>({
		getClient: async () => client,
		CollectionClass: PostgresqlCollection,
		runTransaction: postgresqlRunTransaction,
	});
	const collection = db.users;
	console.log(collection);

	console.log(collection.genId());

	collection.create({
		id: collection.genId(),
		login: 'cevek',
		name: 'Arthur',
		todos: [],
	});

	collection.update('123', {
		login: 'cevek',
		name: 'Arthur',
	});
	collection.remove('123');
	collection.findByIdOrNull(['id'], '2123');
	collection.findAll(['id'], { id: '1123' }, { limit: 10, offset: 20 });
	collection.findAll(['id', 'login'], { id: { ne: '42' } }, { offset: 20 });
	collection.findAll(['id'], { id: { gt: '42', lte: '35' } }, { offset: 20 });
	collection.findAll(['id'], { id: { like: 'foo' } }, { order: { asc: 'name' } });
	collection.findAll(['id'], { todos: { contains: ['1'] } }, { order: { desc: 'login' } });
	collection.findAll(['id'], { todos: { contained: ['1'] } }, { order: { desc: 'login' }, offset: 4, limit: 2 });
	collection.findAll(['id'], { id: '12', login: { eq: 'foo' }, name: { ne: 'hey' } });
	collection.findOneOrNull([], {id: '1'});

	console.time('perf');
	// abc();
	console.timeEnd('perf');

	function abc() {
		for (let i = 0; i < 1e5; i++) {
			collection.findAll(['id'], [{ id: '12' }, { name: 'hello' }, { login: 'foo', todos: { contains: ['12'] } }]);
		}
	}
	// setInterval(() => 1, 1000);
}

main().catch(console.error);
