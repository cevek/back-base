export type UserID = 'UserID';
type TodoID = 'TodoID';
type TodoListID = 'TodoListID';

type DBSchema = {
    user: User;
    todo: Todo;
    todoList: TodoList;
}

type User = {
    id: UserID;
    login: string;
    password: string;
    todoLists: TodoListID[];
}

type Todo = {
    id: TodoID;
    todoListId: TodoListID;
    title: string;
    completed: boolean;
}

type TodoList = {
    id: TodoListID;
    userId: UserID;
    title: string;
    todosIds: TodoID[];
}
