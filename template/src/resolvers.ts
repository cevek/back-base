import {QueryParameters, RootResolver, removeItemOrNever, Return, ClientException, fromPromise} from 'backend-base';
import {TodoID, TodoListID, User} from './DBSchema';
import {Errors} from './Errors';
import {Account, Mutation, Query, Todo, TodoList} from './GraphQLSchema';
import {DB} from './DB';

export function withAuth<Arg, T>(cb: (arg: Arg, ctx: ContextWithUser) => T) {
    return (args: Arg, req: Context) => {
        if (req.session.user === undefined) throw new ClientException(Errors.AuthRequired);
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

export const graphQLResolver: RootResolver<Query & Mutation, Context> = {
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
    if (ctx.session.user) throw new ClientException(Errors.YouAreAlreadyLogged);
    const user = await DB.instance.user.findOne({
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
    if (ctx.session.user) throw new ClientException(Errors.YouAreAlreadyLogged);
    let userExist;
    const db = DB.instance;
    try {
        userExist = await db.user.findOne({login: args.login});
    } catch (e) {}
    if (userExist) throw new ClientException(Errors.UserAlreadyExists);
    if (!LOGIN_REGEXP.test(args.login)) throw new ClientException(Errors.ValidationFailed, {field: 'login'});
    if (!PASS_REGEXP.test(args.password)) throw new ClientException(Errors.ValidationFailed, {field: 'password'});
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
    return ctx.session.user.todoLists.map(id => getTodoList(id, ctx)).map(fromPromise);
}

async function createTodoList(args: Params['createTodoList'], ctx: ContextWithUser) {
    const db = DB.instance;
    const user = ctx.session.user;
    const id = db.todoList.genId();
    await db.todoList.create({
        id: id,
        userId: user.id,
        title: args.title,
        todosIds: [],
    });
    await db.user.update(user.id, {todoLists: user.todoLists.concat(id)});
    ctx.session.user = await db.user.findById(user.id);
    return getTodoList(id, ctx);
}

async function updateTodo(args: Params['updateTodo'], ctx: ContextWithUser) {
    const db = DB.instance;
    const todo = await db.todo.findById(args.id);
    await db.todoList.findOne({id: todo.todoListId, userId: ctx.session.user.id});
    await db.todo.update(args.id, {completed: args.completed, title: args.title});
    return getTodo(args.id);
}

async function removeTodo(args: Params['removeTodo'], ctx: ContextWithUser) {
    const db = DB.instance;
    await db.transaction(async trx => {
        const todo = await trx.todo.findById(args.id);
        const todoList = await trx.todoList.findOne({
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
    const db = DB.instance;
    const todoList = await db.todoList.findOne({id: args.todoListId, userId: ctx.session.user.id});
    const id = db.todo.genId();
    await db.transaction(async trx => {
        await trx.todo.create({
            id: id,
            todoListId: todoList.id,
            completed: args.completed,
            title: args.title,
        });
        await trx.todoList.update(args.todoListId, {todosIds: todoList.todosIds.concat(id)});
    });
    return getTodo(id);
}

async function getTodo(id: TodoID): Return<Todo> {
    const db = DB.instance;
    const todo = await db.todo.findById(id);
    return {
        id: todo.id,
        title: todo.title,
        completed: todo.completed,
    };
}

async function getTodoList(id: TodoListID, ctx: ContextWithUser): Return<TodoList> {
    const db = DB.instance;
    const todoList = await db.todoList.findOne({
        id: id,
        userId: ctx.session.user.id,
    });
    return {
        id: todoList.id,
        title: todoList.title,
        todos: todoList.todosIds.map(todoId => getTodo(todoId)).map(fromPromise),
    };
}
