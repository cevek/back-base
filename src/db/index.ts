import { DBUser, DBTodoList, DBTodo, UserID, TodoListID } from './db.schema';
import { DBCollection } from './fakedb';

export const db = {
	user: new DBCollection<DBUser>('user'),
	todoList: new DBCollection<DBTodoList>('todoList'),
	todo: new DBCollection<DBTodo>('todo'),
};

export async function dbTransaction<T>(trx: (trx: typeof db) => Promise<T>) {
	return trx(db);
}
