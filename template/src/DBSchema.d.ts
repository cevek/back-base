export type UserID = 'UserID';
type TodoID = 'TodoID';
type TodoListID = 'TodoListID';

interface DBSchema {
    user: User;
    todo: Todo;
    todoList: TodoList;
}

interface User {
    id: UserID;
    login: string;
    password: string;
    todoLists: TodoListID[];
}

interface Todo {
    id: TodoID;
    todoListId: TodoListID;
    title: string;
    completed: boolean;
}

interface TodoList {
    id: TodoListID;
    userId: UserID;
    title: string;
    todosIds: TodoID[];
}
