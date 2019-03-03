import { Errors } from '../errors';
import { TestSession } from './utils';

class Test {
	s = new TestSession();
	async test() {
		// init app
		require('..');
		this.s.init();
		await this.checkAuthRequiring();
		await this.register();
		await this.register(Errors.YouAreAlreadyLogged);
		await this.createTodoList();
		await this.createTodo1();
		await this.createTodo2();
		await this.updateTodo2();
		await this.removeTodo1();
		await this.removeNonExistTodo();
		await this.logout();
		await this.registerInvariants();
		await this.login();
		await this.login(Errors.YouAreAlreadyLogged);
		await this.logout();
		await this.loginInvariants();
		console.log('All tests passed');
		process.exit();
	}

	async checkAuthRequiring() {
		await this.s.query(`query{getAccount{login}}`, Errors.AuthRequired);
		await this.s.query(`query{getTodoLists{id}}`, Errors.AuthRequired);
		await this.s.query(
			`mutation{createTodo(todoListId:"1",title:"foo",completed:true){id}}`,
			Errors.AuthRequired,
		);
		await this.s.query(`mutation{createTodoList(title:"foo"){id}}`, Errors.AuthRequired);
		await this.s.query(
			`mutation{updateTodo(id:"1",title:"foo",completed:true){id}}`,
			Errors.AuthRequired,
		);
		await this.s.query(`mutation{logout}`, Errors.AuthRequired);
	}

	async register(error?: Errors) {
		await this.s.query(`mutation{register(login:"cevek",password:"qwerty123"){login}}`, error);
	}

	async createTodo1() {
		await this.s.query(
			`mutation{createTodo(todoListId:"1",title:"The wolf of wall street",completed:true){id}}`,
		);
		await this.s.query(`query{getAccount{login}}`, undefined, { getAccount: { login: 'cevek' } });
		await this.s.query(`query{getTodoLists{id,title,todos{id,title,completed}}}`, undefined, {
			getTodoLists: [
				{
					id: '1',
					title: 'Movies',
					todos: [{ id: '2', title: 'The wolf of wall street', completed: true }],
				},
			],
		});
	}

	private async createTodoList() {
		await this.s.query(`mutation{createTodoList(title:"Movies"){id}}`);
	}

	async updateTodo2() {
		await this.s.query(
			`mutation{updateTodo(id:"3",title:"Alita: battle angel",completed:true){id}}`,
		);
		await this.s.query(`query{getTodoLists{id,title,todos{id,title,completed}}}`, undefined, {
			getTodoLists: [
				{
					id: '1',
					title: 'Movies',
					todos: [
						{ id: '2', title: 'The wolf of wall street', completed: true },
						{ id: '3', title: 'Alita: battle angel', completed: true },
					],
				},
			],
		});
	}
	async removeTodo1() {
		await this.s.query(`mutation{removeTodo(id:"2")}`);
		await this.s.query(`query{getTodoLists{id,title,todos{id,title,completed}}}`, undefined, {
			getTodoLists: [
				{
					id: '1',
					title: 'Movies',
					todos: [{ id: '3', title: 'Alita: battle angel', completed: true }],
				},
			],
		});
	}
	async removeNonExistTodo() {
		await this.s.query(`mutation{removeTodo(id:"100")}`, Errors.EntityNotFound);
	}

	async createTodo2() {
		await this.s.query(`mutation{createTodo(todoListId:"1",title:"Alita",completed:false){id}}`);
		await this.s.query(`query{getTodoLists{id,title,todos{id,title,completed}}}`, undefined, {
			getTodoLists: [
				{
					id: '1',
					title: 'Movies',
					todos: [
						{ id: '2', title: 'The wolf of wall street', completed: true },
						{ id: '3', title: 'Alita', completed: false },
					],
				},
			],
		});
	}

	async login(error?: Errors) {
		await this.s.query(`mutation{login(login:"cevek",password:"qwerty123"){login}}`, error);
	}
	async loginInvariants() {
		await this.s.query(
			`mutation{login(login:"cev",password:"qwerty123"){login}}`,
			Errors.EntityNotFound,
		);
		await this.s.query(
			`mutation{login(login:"cevek",password:"qwerty"){login}}`,
			Errors.EntityNotFound,
		);
	}
	async logout() {
		await this.s.query(`mutation{logout}`);
	}
	async registerInvariants() {
		await this.s.query(
			`mutation{register(login:"cevek",password:"qwerty123"){login}}`,
			Errors.UserAlreadyExists,
		);
		await this.s.query(
			`mutation{register(login:"cevek abc",password:"qwerty123"){login}}`,
			Errors.ValidationFailed,
		);
		await this.s.query(
			`mutation{register(login:"cev",password:"qwerty123"){login}}`,
			Errors.ValidationFailed,
		);
		await this.s.query(
			`mutation{register(login:"cevek2",password:"q"){login}}`,
			Errors.ValidationFailed,
		);
	}
}

new Test().test().catch(console.error);
