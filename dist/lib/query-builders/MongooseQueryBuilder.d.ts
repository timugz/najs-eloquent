import { MongooseQueryLog } from './MongooseQueryLog';
import { MongooseQuery } from './MongooseQueryBuilder';
import { QueryBuilder, QueryBuilderSoftDelete } from './QueryBuilder';
import { IBasicQueryGrammar } from '../interfaces/IBasicQueryGrammar';
import { IQueryFetchResult } from '../interfaces/IQueryFetchResult';
import { IMongooseProvider } from '../interfaces/IMongooseProvider';
import { Collection } from 'collect.js';
import { Model, Document, DocumentQuery } from 'mongoose';
export declare type MongooseQuery<T> = DocumentQuery<Document & T | null, Document & T> | DocumentQuery<(Document & T)[] | null, Document & T>;
export declare class MongooseQueryBuilder<T = {}> extends QueryBuilder implements IBasicQueryGrammar<T>, IQueryFetchResult<Document & T> {
    static className: string;
    protected mongooseModel: Model<Document & T>;
    protected mongooseQuery: MongooseQuery<T>;
    protected hasMongooseQuery: boolean;
    protected primaryKey: string;
    constructor(modelName: string);
    constructor(modelName: string, softDelete: QueryBuilderSoftDelete);
    constructor(modelName: string, softDelete: QueryBuilderSoftDelete | undefined, primaryKey: string);
    protected getMongooseProvider(): IMongooseProvider;
    protected getQuery(isFindOne?: boolean, logger?: MongooseQueryLog): MongooseQuery<T>;
    protected passDataToMongooseQuery(query: MongooseQuery<T>, logger?: MongooseQueryLog): MongooseQuery<T>;
    protected createQuery(findOne: boolean, logger?: MongooseQueryLog): DocumentQuery<(Document & T)[] | null, Document & T>;
    getPrimaryKey(): string;
    native(handler: (native: Model<Document & T> | MongooseQuery<T>) => MongooseQuery<T>): IQueryFetchResult<T>;
    toObject(): Object;
    protected getFieldByName(name: any): any;
    get(): Promise<Collection<any>>;
    all(): Promise<Collection<any>>;
    find(): Promise<any | null>;
    findOrFail(): Promise<any>;
    firstOrFail(): Promise<any>;
    first(): Promise<any | null>;
    pluck(value: string): Promise<Object>;
    pluck(value: string, key: string): Promise<Object>;
    count(): Promise<number>;
    update(data: Object): Promise<Object>;
    delete(): Promise<Object>;
    restore(): Promise<Object>;
    execute(): Promise<any>;
    private isNotUsedOrEmptyCondition();
}
