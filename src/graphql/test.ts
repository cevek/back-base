import request = require('request');

async function tests() {
	const jar = request.jar();
	async function getQuery(query: string) {
		return new Promise<any>((resolve, reject) => {
			return request.post(
				'http://localhost:4000/api/graphql',
				{
					jar,
					body: JSON.stringify({ query }),
					headers: {
						'content-type': 'application/json',
					},
				},
				(err, res, body) => {
					if (err) return reject(err);
					try {
						const data = JSON.parse(body.toString());
						if (data.errors) return reject(data.errors);
						return resolve(data);
					} catch (e) {
						console.log(body);
						return reject(e);
					}
				},
			);
		});
	}

	await getQuery(`mutation{register(login:"cevek",password:"qwerty123"){login}}`);
	await getQuery(`mutation{createTodoList(title:"Movies"){id}}`);
	await getQuery(`mutation{createTodo(todoListId:"1",title:"The wolf of wall street",completed:true){id}}`);
    await getQuery(`mutation{logout}`);
    await getQuery(`mutation{login(login:"cevek",password:"qwerty123"){login}}`);
    await getQuery(`query{getAccount{login}}`);
    await getQuery(`query{getTodoLists{id,title,todos{id,title,completed}}}`);
}

tests().catch(console.error);
