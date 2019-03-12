import {Errors} from '../Errors';
import {config} from '../config';
import {TestSession} from '../../../base';
import '../';

class Test {
    s = new TestSession(config.port);
    async test() {
        await this.checkAuthRequiring();
        await this.register();
        await this.register(Errors.YouAreAlreadyLogged);
        await this.createTodoList();
        await this.createTodo1();
        await this.createTodo2();
        await this.updateTodo2();
        await this.removeTodo1();
        await this.removeNonExistTodo();
        await this.logout();
        await this.registerInvariants();
        await this.login();
        await this.login(Errors.YouAreAlreadyLogged);
        await this.logout();
        await this.loginInvariants();
        console.log('All tests passed');
        process.exit();
    }

    todoListId = '';
    todoId1 = '';
    todoId2 = '';
    loginStr =
        'cevek' +
        Math.random()
            .toString(33)
            .substr(3, 10);

    async checkAuthRequiring() {
        await this.s.query(`query{getAccount{login}}`, Errors.AuthRequired);
        await this.s.query(`query{getTodoLists{id}}`, Errors.AuthRequired);
        await this.s.query(`mutation{createTodo(todoListId:"1",title:"foo",completed:true){id}}`, Errors.AuthRequired);
        await this.s.query(`mutation{createTodoList(title:"foo"){id}}`, Errors.AuthRequired);
        await this.s.query(`mutation{updateTodo(id:"1",title:"foo",completed:true){id}}`, Errors.AuthRequired);
        await this.s.query(`mutation{logout}`, Errors.AuthRequired);
    }

    async register(error?: Errors) {
        await this.s.query(`mutation{register(login:"${this.loginStr}",password:"qwerty123"){login}}`, error);
    }

    async createTodo1() {
        this.todoId1 = (await this.s.query<{createTodo: {id: string}}>(
            `mutation{createTodo(todoListId:"${this.todoListId}",title:"The wolf of wall street",completed:true){id}}`,
        )).createTodo.id;
        await this.s.query(`query{getAccount{login}}`, undefined, {
            getAccount: {login: this.loginStr},
        });
        await this.s.query(`query{getTodoLists{title,todos{title,completed}}}`, undefined, {
            getTodoLists: [
                {
                    title: 'Movies',
                    todos: [{title: 'The wolf of wall street', completed: true}],
                },
            ],
        });
    }

    async createTodo2() {
        this.todoId2 = (await this.s.query<{createTodo: {id: string}}>(
            `mutation{createTodo(todoListId:"${this.todoListId}",title:"Alita",completed:false){id}}`,
        )).createTodo.id;
        await this.s.query(`query{getTodoLists{title,todos{title,completed}}}`, undefined, {
            getTodoLists: [
                {
                    title: 'Movies',
                    todos: [{title: 'The wolf of wall street', completed: true}, {title: 'Alita', completed: false}],
                },
            ],
        });
    }

    private async createTodoList() {
        this.todoListId = (await this.s.query<{createTodoList: {id: string}}>(
            `mutation{createTodoList(title:"Movies"){id}}`,
        )).createTodoList.id;
    }

    async updateTodo2() {
        await this.s.query(`mutation{updateTodo(id:"${this.todoId2}",title:"Alita: battle angel",completed:true){id}}`);
        await this.s.query(`query{getTodoLists{title,todos{title,completed}}}`, undefined, {
            getTodoLists: [
                {
                    title: 'Movies',
                    todos: [
                        {title: 'The wolf of wall street', completed: true},
                        {title: 'Alita: battle angel', completed: true},
                    ],
                },
            ],
        });
    }
    async removeTodo1() {
        await this.s.query(`mutation{removeTodo(id:"${this.todoId1}")}`);
        await this.s.query(`query{getTodoLists{title,todos{title,completed}}}`, undefined, {
            getTodoLists: [
                {
                    title: 'Movies',
                    todos: [{title: 'Alita: battle angel', completed: true}],
                },
            ],
        });
    }
    async removeNonExistTodo() {
        await this.s.query(`mutation{removeTodo(id:"10024324")}`, Errors.EntityNotFound);
    }

    async login(error?: Errors) {
        await this.s.query(`mutation{login(login:"${this.loginStr}",password:"qwerty123"){login}}`, error);
    }
    async loginInvariants() {
        await this.s.query(`mutation{login(login:"cev",password:"qwerty123"){login}}`, Errors.EntityNotFound);
        await this.s.query(`mutation{login(login:"${this.loginStr}",password:"qwerty"){login}}`, Errors.EntityNotFound);
    }
    async logout() {
        await this.s.query(`mutation{logout}`);
    }
    async registerInvariants() {
        await this.s.query(
            `mutation{register(login:"${this.loginStr}",password:"qwerty123"){login}}`,
            Errors.UserAlreadyExists,
        );
        await this.s.query(
            `mutation{register(login:"cevek abc",password:"qwerty123"){login}}`,
            Errors.ValidationFailed,
        );
        await this.s.query(`mutation{register(login:"cev",password:"qwerty123"){login}}`, Errors.ValidationFailed);
        await this.s.query(`mutation{register(login:"cevek2",password:"q"){login}}`, Errors.ValidationFailed);
    }
}

Promise.all([new Test().test(), new Test().test()]).catch(err => console.error(err));
