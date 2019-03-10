import {TodoID, TodoListID, User} from './DBSchema';
import {ClientError, Errors} from './Errors';
import {Account, Mutation, Query, Todo, TodoList} from './GraphQLSchema';
import {QueryParameters, QueryResult, removeItemOrNever, Return} from '../../base';
import {db} from './globals';

export function withAuth<Arg, T>(cb: (arg: Arg, ctx: ContextWithUser) => T) {
    return (args: Arg, req: Context) => {
        if (req.session.user === undefined) throw new ClientError(Errors.AuthRequired);
        return cb(args, req as ContextWithUser);
    };
}

export interface Context {
    session: {
        user: User | undefined;
    };
}
export interface ContextWithUser {
    session: {
        user: User;
        destroy(cb: (err: {}) => void): void;
    };
}

type Params = QueryParameters<Query & Mutation>;

export const GraphQLValues: QueryResult<Query & Mutation, Context> = {
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

async function login(args: Params['login'], ctx: Context) {
    if (ctx.session.user) throw new ClientError(Errors.YouAreAlreadyLogged);
    const user = await db.user.findOne([], {
        login: args.login,
        password: args.password,
    });
    ctx.session.user = user;
    return getAccount({}, ctx as ContextWithUser);
}

async function logout(_: {}, ctx: ContextWithUser) {
    await new Promise((res, rej) => ctx.session.destroy(err => (err ? /* istanbul ignore next */ rej(err) : res())));
    return true;
}

async function register(args: Params['register'], ctx: Context) {
    if (ctx.session.user) throw new ClientError(Errors.YouAreAlreadyLogged);
    let userExist;
    try {
        userExist = await db.user.findOne([], {login: args.login});
    } catch (e) {}
    if (userExist) throw new ClientError(Errors.UserAlreadyExists);
    if (!LOGIN_REGEXP.test(args.login)) throw new ClientError(Errors.ValidationFailed, 'login');
    if (!PASS_REGEXP.test(args.password)) throw new ClientError(Errors.ValidationFailed, 'password');
    await db.user.create({
        id: db.user.genId(),
        login: args.login,
        password: args.password,
        todoLists: [],
    });
    return login(args, ctx);
}

async function getAccount(_: {}, ctx: ContextWithUser): Return<Account> {
    return {
        login: ctx.session.user.login,
    };
}

async function getTodoLists(_: {}, ctx: ContextWithUser) {
    return ctx.session.user.todoLists.map(id => getTodoList(id, ctx));
}

async function createTodoList(args: Params['createTodoList'], ctx: ContextWithUser) {
    const user = ctx.session.user;
    const id = db.todoList.genId();
    await db.todoList.create({
        id: id,
        userId: user.id,
        title: args.title,
        todosIds: [],
    });
    await db.user.update(user.id, {todoLists: user.todoLists.concat(id)});
    ctx.session.user = await db.user.findById([], user.id);
    return getTodoList(id, ctx);
}

async function updateTodo(args: Params['updateTodo'], ctx: ContextWithUser) {
    const todo = await db.todo.findById([], args.id);
    await db.todoList.findOne([], {id: todo.todoListId, userId: ctx.session.user.id});
    await db.todo.update(args.id, {completed: args.completed, title: args.title});
    return getTodo(args.id);
}

async function removeTodo(args: Params['removeTodo'], ctx: ContextWithUser) {
    await db.transaction(async trx => {
        const todo = await trx.todo.findById([], args.id);
        const todoList = await trx.todoList.findOne([], {
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

async function createTodo(args: Params['createTodo'], ctx: ContextWithUser) {
    const todoList = await db.todoList.findOne([], {id: args.todoListId, userId: ctx.session.user.id});
    return await db.transaction(async trx => {
        const id = trx.todo.genId();
        await trx.todo.create({
            id: trx.todo.genId(),
            todoListId: todoList.id,
            completed: args.completed,
            title: args.title,
        });
        await trx.todoList.update(args.todoListId, {todosIds: todoList.todosIds.concat(id)});
        return getTodo(id);
    });
}

async function getTodo(id: TodoID): Return<Todo> {
    const todo = await db.todo.findById([], id);
    return {
        id: todo.id,
        title: todo.title,
        completed: todo.completed,
    };
}

async function getTodoList(id: TodoListID, ctx: ContextWithUser): Return<TodoList> {
    const todoList = await db.todoList.findOne(['id', 'title', 'todosIds', 'userId'], {
        id: id,
        userId: ctx.session.user.id,
    });
    return {
        id: todoList.id,
        title: todoList.title,
        todos: todoList.todosIds.map(todoId => getTodo(todoId)),
    };
}
