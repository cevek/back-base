export interface DBUser {
	id: number;
	login: string;
	password: string;
	todoLists: number[];
}

export interface DBTodo {
	id: number;
	todoListId: number;
	title: string;
	completed: boolean;
}

export interface DBTodoList {
	id: number;
	title: string;
	todosIds: number[];
}
