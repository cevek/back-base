import { TodoListID, TodoID } from '../db/db.schema';

type Float = number;
type Int = number;
type ID = string;

export interface Query {
	getAccount(args: {}): Account;
	getTodoLists(args: {}): TodoList[];
}

interface Mutation {
	login(args: { login: string; password: string }): Account;
	register(args: { login: string; password: string }): Account;
	logout(args: {}): boolean;

	createTodoList(args: { title: string }): TodoList;
	createTodo(args: { todoListId: TodoListID; title: string; completed: boolean }): Todo;
	updateTodo(args: { id: TodoID; title: string; completed: boolean }): Todo;
	removeTodo(args: { id: TodoID }): boolean;
}

interface Account {
	login: string;
}

interface TodoList {
	id: ID;
	title: string;
	todos: Todo[];
}

interface Todo {
	id: ID;
	title: string;
	completed: boolean;
}
