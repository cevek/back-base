import { createDB } from './PostgresqlDriver';
// import { createDB } from './MemoryDriver';

type User = {
	id: string;
	name: string;
	login: string;
	todos: string[];
};

const perf = false;

type Schema = {
	users: User;
};

async function main() {
	const client = {
		async query(query: string, values?: unknown[]) {
			if (!perf) {
				console.log(query, values);
			}
			return { rows: [] };
		},
		release() {},
	};
	const db = await createDB<Schema>({
		async connect() {
			return client;
		},
	});
	const collection = db.users;

	console.log(collection.genId());

	await collection.create({
		id: collection.genId(),
		login: 'cevek',
		name: 'Arthur',
		todos: [],
	});

	await collection.update('123', {
		login: 'cevek',
		name: 'Arthur',
	});
	await collection.remove('123');
	await collection.findByIdOrNull('2123', { select: ['id', 'login'] });
	await collection.findAll({ id: '1123' }, { limit: 10, offset: 20 });
	await collection.findAll({ id: { ne: '42' } }, { offset: 20, select: ['id', 'login'] });
	await collection.findAll({ id: { gt: '42', lte: '35' } }, { offset: 20, select: ['id'] });
	await collection.findAll({ id: { like: 'foo' } }, { order: { asc: 'name' } });
	await collection.findAll({ todos: { contains: ['1'] } }, { order: { desc: 'login' } });
	await collection.findAll({ todos: { contained: ['1'] } }, { order: { desc: 'login' }, offset: 4, limit: 2 });
	await collection.findAll({ id: '12', login: { eq: 'foo' }, name: { ne: 'hey' } });
	await collection.findOneOrNull({ id: '1' });

	if (perf) {
		console.time('perf');
		abc();
		console.timeEnd('perf');
	}

	function abc() {
		for (let i = 0; i < 1e5; i++) {
			var p = collection.findAll([{ id: '12' }, { name: 'hello' }, { login: 'foo', todos: { contains: ['12'] } }], {
				select: ['id'],
			});
		}
	}
	// setInterval(() => 1, 1000);
}

main().catch(err => console.error(err));
