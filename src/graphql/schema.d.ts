type Float = number;
type Int = number;
type ID = number;

export interface Query {
	getAccount(args: {}): Account;
	getTodoLists(args: {}): TodoList[];
}

interface Mutation {
	login(args: { login: string; password: string }): Account;
	register(args: { login: string; password: string }): Account;
	logout(args: {}): boolean;

	createTodoList(args: { title: string }): TodoList;
	createTodo(args: { todoListId: ID; title: string; completed: boolean }): Todo;
	updateTodo(args: { id: ID; title: string; completed: boolean }): Todo;
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
