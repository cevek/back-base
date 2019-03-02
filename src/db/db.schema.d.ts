export type UserID = 'UserID';
export type TodoID = 'TodoID';
export type TodoListID = 'TodoListID';

export interface DBUser {
	id: UserID;
	login: string;
	password: string;
	todoLists: TodoListID[];
}

export interface DBTodo {
	id: TodoID;
	todoListId: TodoListID;
	title: string;
	completed: boolean;
}

export interface DBTodoList {
	id: TodoListID;
	userId: UserID;
	title: string;
	todosIds: TodoID[];
}
