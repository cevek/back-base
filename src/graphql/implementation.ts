import { DBUser } from '../db/db.schema';
import { ClientError, Errors } from '../errors';
import { db } from '../db';
import { Account, Mutation, Query, Todo, TodoList } from './schema';
import { authZone, method, MutationArg, promiseAll } from './utils';
import { ReqWithUser } from '..';
import { promisify } from 'util';

export const query: Query & Mutation = {
	login: method(login),
	register: method(register),
	logout: authZone(logout),

	getAccount: authZone(getAccount),
	createTodo: authZone(createTodo),
	createTodoList: authZone(createTodoList),
	getTodoLists: authZone(getTodoLists),
	updateTodo: authZone(updateTodo),
};

const LOGIN_REGEXP = /^[\w_~;:#$%^&*+=`!()[?.\-\]]{5,30}$/;
const PASS_REGEXP = /^.{5,128}$/;

async function getTodo(id: number): Promise<Todo> {
	const todo = await db.todo.findById(id);
	return {
		id: todo.id,
		title: todo.title,
		completed: todo.completed,
	};
}

async function login(
	args: MutationArg<'login'>,
	currUser: DBUser | undefined,
	ctx: ReqWithUser,
): Promise<Account> {
	if (currUser) throw new ClientError(Errors.YouAreAlreadyLogged);
	const user = await db.user.findBy({ login: args.login, password: args.password });
	ctx.session!.user = user;
	return getAccount({}, user);
}

async function logout(args: {}, user: DBUser, ctx: ReqWithUser) {
	await new Promise((res, rej) => ctx.session!.destroy(err => (err ? rej(err) : res())));
	return true;
}

async function register(
	args: MutationArg<'register'>,
	user: DBUser | undefined,
	ctx: ReqWithUser,
): Promise<Account> {
	if (user) throw new ClientError(Errors.YouAreAlreadyLogged);
	let userExist;
	try {
		userExist = await db.user.findBy({ login: args.login });
	} catch (e) {}
	if (userExist) throw new ClientError(Errors.UserAlreadyExists);
	if (!LOGIN_REGEXP.test(args.login)) throw new ClientError(Errors.ValidationFailed, 'login');
	if (!PASS_REGEXP.test(args.password)) throw new ClientError(Errors.ValidationFailed, 'password');
	await db.user.create({
		id: 0,
		login: args.login,
		password: args.password,
		todoLists: [],
	});
	return login(args, user, ctx);
}

async function getAccount(args: {}, user: DBUser): Promise<Account> {
	return {
		login: user.login,
	};
}

async function getTodoLists(args: {}, user: DBUser) {
	return promiseAll(user.todoLists.map(id => getTodoList(id)));
}

async function getTodoList(id: number): Promise<TodoList> {
	const todoList = await db.todoList.findById(id);
	return {
		id: todoList.id,
		title: todoList.title,
		todos: promiseAll(todoList.todosIds.map(todoId => getTodo(todoId))),
	};
}

async function createTodoList(args: MutationArg<'createTodoList'>) {
	const id = await db.todoList.create({ id: 0, title: args.title, todosIds: [] });
	return getTodoList(id);
}

async function updateTodo(args: MutationArg<'updateTodo'>) {
	const todo = await db.todoList.findById(args.id);
	await db.todo.update(todo.id, { completed: args.completed, title: args.title });
	return getTodo(todo.id);
}

async function createTodo(args: MutationArg<'createTodo'>) {
	const todoList = await db.todoList.findById(args.todoListId);
	const id = await db.todo.create({
		id: 0,
		todoListId: todoList.id,
		completed: args.completed,
		title: args.title,
	});
	await db.todoList.update(args.todoListId, { todosIds: todoList.todosIds.concat(id) });
	return getTodo(id);
}
