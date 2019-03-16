import {BaseClientError} from 'backend-base';
export enum Errors {
    SomethingWentWrong = 'SomethingWentWrong',
    ValidationFailed = 'ValidationFailed',
    UserAlreadyExists = 'UserAlreadyExists',
    YouAreAlreadyLogged = 'YouAreAlreadyLogged',
    AuthRequired = 'AuthRequired',
    EntityNotFound = 'EntityNotFound',
}

export class ClientError extends BaseClientError<Errors> {}
