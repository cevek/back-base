import { db, dbTransaction } from '../db';
import { TodoID, TodoListID } from '../db/db.schema';
import { ClientError, Errors } from '../errors';
import { ContextWithUser, removeItemOrNever } from '../utils';
import { Account, Mutation, Query, Todo, TodoList } from './schema';
import { MutArgs, promiseAll, QueryResult, withAuth } from './utils';

export const query: QueryResult<Query & Mutation> = {
	login,
	register,
	logout: withAuth(logout),

	getAccount: withAuth(getAccount),
	createTodo: withAuth(createTodo),
	createTodoList: withAuth(createTodoList),
	getTodoLists: withAuth(getTodoLists),
	updateTodo: withAuth(updateTodo),
	removeTodo: withAuth(removeTodo),
};

const LOGIN_REGEXP = /^[\w_~;:#$%^&*+=`!()[?.\-\]]{5,30}$/;
const PASS_REGEXP = /^.{5,128}$/;

async function login(args: MutArgs<'login'>, ctx: ContextWithUser) {
	if (ctx.session.user) throw new ClientError(Errors.YouAreAlreadyLogged);
	const user = await db.user.findBy({ login: args.login, password: args.password });
	ctx.session.user = user;
	return getAccount({}, ctx);
}

async function logout(_: {}, ctx: ContextWithUser) {
	await new Promise((res, rej) =>
		ctx.session.destroy(err => (err ? /* istanbul ignore next */ rej(err) : res())),
	);
	return true;
}

async function register(args: MutArgs<'register'>, ctx: ContextWithUser): Promise<Account> {
	if (ctx.session.user) throw new ClientError(Errors.YouAreAlreadyLogged);
	let userExist;
	try {
		userExist = await db.user.findBy({ login: args.login });
	} catch (e) {}
	if (userExist) throw new ClientError(Errors.UserAlreadyExists);
	if (!LOGIN_REGEXP.test(args.login)) throw new ClientError(Errors.ValidationFailed, 'login');
	if (!PASS_REGEXP.test(args.password)) throw new ClientError(Errors.ValidationFailed, 'password');
	await db.user.create({
		login: args.login,
		password: args.password,
		todoLists: [],
	});
	return login(args, ctx);
}

async function getAccount(_: {}, ctx: ContextWithUser): Promise<Account> {
	return {
		login: ctx.session.user.login,
	};
}

async function getTodoLists(_: {}, ctx: ContextWithUser) {
	return promiseAll(ctx.session.user.todoLists.map(id => getTodoList(id, ctx)));
}

async function createTodoList(args: MutArgs<'createTodoList'>, ctx: ContextWithUser) {
	const user = ctx.session.user;
	const id = await db.todoList.create({
		userId: user.id,
		title: args.title,
		todosIds: [],
	});
	await db.user.update(user.id, { todoLists: user.todoLists.concat(id) });
	ctx.session.user = await db.user.findById(user.id);
	return getTodoList(id, ctx);
}

async function updateTodo(args: MutArgs<'updateTodo'>, ctx: ContextWithUser) {
	const todo = await db.todo.findById(args.id);
	await db.todoList.findBy({ id: todo.todoListId, userId: ctx.session.user.id });
	await db.todo.update(args.id, { completed: args.completed, title: args.title });
	return getTodo(args.id);
}

async function removeTodo(args: MutArgs<'removeTodo'>, ctx: ContextWithUser) {
	await dbTransaction(async trx => {
		const todo = await trx.todo.findById(args.id);
		const todoList = await trx.todoList.findBy({
			id: todo.todoListId,
			userId: ctx.session.user.id,
		});
		await trx.todo.remove(args.id);
		await trx.todoList.update(todoList.id, {
			todosIds: removeItemOrNever(todoList.todosIds, todo.id),
		});
	});
	return true;
}

async function createTodo(args: MutArgs<'createTodo'>, ctx: ContextWithUser) {
	const todoList = await db.todoList.findBy({ id: args.todoListId, userId: ctx.session.user.id });
	return await dbTransaction(async trx => {
		const id = await trx.todo.create({
			todoListId: todoList.id,
			completed: args.completed,
			title: args.title,
		});
		await trx.todoList.update(args.todoListId, { todosIds: todoList.todosIds.concat(id) });
		return getTodo(id);
	});
}

async function getTodo(id: TodoID): Promise<Todo> {
	const todo = await db.todo.findById(id);
	return {
		id: todo.id,
		title: todo.title,
		completed: todo.completed,
	};
}

async function getTodoList(id: TodoListID, ctx: ContextWithUser): Promise<TodoList> {
	const todoList = await db.todoList.findBy({ id: id, userId: ctx.session.user.id });
	return {
		id: todoList.id,
		title: todoList.title,
		todos: promiseAll(todoList.todosIds.map(todoId => getTodo(todoId))),
	};
}
