import { DBUser, DBTodoList, DBTodo, UserID, TodoListID } from './db.schema';
import { createDBCollection } from './fakedb';

export const db = {
	user: createDBCollection<DBUser>('user'),
	todoList: createDBCollection<DBTodoList>('todoList'),
	todo: createDBCollection<DBTodo>('todo'),
};
