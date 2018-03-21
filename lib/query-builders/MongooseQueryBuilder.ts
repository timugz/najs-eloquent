import { MongooseQueryLog } from './MongooseQueryLog'
import { MongooseQuery } from './MongooseQueryBuilder'
import { QueryBuilder, QueryBuilderSoftDelete } from './QueryBuilder'
import { MongodbConditionConverter } from './MongodbConditionConverter'
import { IBasicQueryGrammar } from '../interfaces/IBasicQueryGrammar'
import { IQueryFetchResult } from '../interfaces/IQueryFetchResult'
import { IMongooseProvider } from '../interfaces/IMongooseProvider'
import { EloquentMongoose as Eloquent } from '../eloquent/EloquentMongoose'
import { make } from 'najs-binding'
import { isEmpty } from 'lodash'
import collect, { Collection } from 'collect.js'
import { Model, Document, DocumentQuery, Mongoose } from 'mongoose'
import { NotFoundError } from '../errors/NotFoundError'

export type MongooseQuery<T> =
  | DocumentQuery<Document & T | null, Document & T>
  | DocumentQuery<(Document & T)[] | null, Document & T>

export class MongooseQueryBuilder<T = {}> extends QueryBuilder
  implements IBasicQueryGrammar<T>, IQueryFetchResult<Document & T> {
  static className: string = 'MongooseQueryBuilder'
  protected mongooseModel: Model<Document & T>
  protected mongooseQuery: MongooseQuery<T>
  protected hasMongooseQuery: boolean
  protected primaryKey: string

  constructor(modelName: string)
  constructor(modelName: string, softDelete: QueryBuilderSoftDelete)
  constructor(modelName: string, softDelete: QueryBuilderSoftDelete | undefined, primaryKey: string)
  constructor(modelName: string, softDelete?: QueryBuilderSoftDelete, primaryKey: string = '_id') {
    super(softDelete)
    this.primaryKey = primaryKey
    const mongoose: Mongoose = this.getMongooseProvider().getMongooseInstance()
    if (mongoose.modelNames().indexOf(modelName) === -1) {
      throw new Error('Model ' + modelName + ' Not Found')
    }

    this.mongooseModel = mongoose.model(modelName)
  }

  protected getMongooseProvider(): IMongooseProvider {
    return make<IMongooseProvider>('MongooseProvider')
  }

  protected getQuery(isFindOne: boolean = false, logger?: MongooseQueryLog): MongooseQuery<T> {
    if (!this.hasMongooseQuery) {
      const conditions = new MongodbConditionConverter(this.getConditions()).convert()
      this.mongooseQuery = isFindOne
        ? this.mongooseModel.findOne(conditions)
        : (this.mongooseQuery = this.mongooseModel.find(conditions))

      if (logger) {
        logger.raw(this.mongooseModel.modelName).raw(isFindOne ? '.findOne(' : '.find(', conditions, ')')
      }
      this.hasMongooseQuery = true
    }
    return this.mongooseQuery
  }

  protected passDataToMongooseQuery(query: MongooseQuery<T>, logger?: MongooseQueryLog) {
    if (!isEmpty(this.selectedFields)) {
      const selectParams = this.selectedFields.join(' ')
      query.select(selectParams)
      if (logger) {
        logger.raw(`.select("${selectParams}")`)
      }
    }
    if (!isEmpty(this.distinctFields)) {
      const distinctParams = this.distinctFields.join(' ')
      query.distinct(distinctParams)
      if (logger) {
        logger.raw(`.distinct("${distinctParams}")`)
      }
    }
    if (this.limitNumber) {
      query.limit(this.limitNumber)
      if (logger) {
        logger.raw(`.limit(${this.limitNumber})`)
      }
    }
    if (this.ordering && !isEmpty(this.ordering)) {
      const sort: Object = Object.keys(this.ordering).reduce((memo, key) => {
        memo[key] = this.ordering[key] === 'asc' ? 1 : -1
        return memo
      }, {})
      query.sort(sort)
      if (logger) {
        logger.raw('.sort(', sort, ')')
      }
    }
    return query
  }

  protected createQuery(findOne: boolean, logger?: MongooseQueryLog) {
    return this.passDataToMongooseQuery(this.getQuery(findOne, logger), logger) as DocumentQuery<
      (Document & T)[] | null,
      Document & T
    >
  }

  getPrimaryKey(): string {
    return this.primaryKey
  }

  native(handler: (native: Model<Document & T> | MongooseQuery<T>) => MongooseQuery<T>): IQueryFetchResult<T> {
    this.mongooseQuery = handler.call(undefined, this.isUsed ? this.createQuery(false) : this.mongooseModel)
    this.hasMongooseQuery = true
    return this
  }

  toObject(): Object {
    const conditions = new MongodbConditionConverter(this.getConditions()).convert()
    return {
      name: this.name ? this.name : undefined,
      select: !isEmpty(this.selectedFields) ? this.selectedFields : undefined,
      distinct: !isEmpty(this.distinctFields) ? this.distinctFields : undefined,
      limit: this.limitNumber,
      orderBy: !isEmpty(this.ordering) ? this.ordering : undefined,
      conditions: !isEmpty(conditions) ? conditions : undefined
    }
  }

  protected getFieldByName(name: any) {
    if (name === 'id') {
      return '_id'
    }
    return name
  }

  // -------------------------------------------------------------------------------------------------------------------

  async get(): Promise<Collection<any>> {
    const logger = MongooseQueryLog.create(this)
    const query = this.createQuery(false, logger)
    logger
      .raw('.exec()')
      .action('get')
      .end()
    const result = await query.exec()
    if (result && !isEmpty(result)) {
      const eloquent = make<Eloquent<T>>(this.mongooseModel.modelName)
      return eloquent.newCollection(result)
    }
    return collect([])
  }

  async all(): Promise<Collection<any>> {
    return this.get()
  }

  async find(): Promise<any | null> {
    const logger = MongooseQueryLog.create(this)
    const query = this.passDataToMongooseQuery(this.getQuery(true, logger), logger)
    // change mongoose query operator from find to findOne if needed
    if (query['op'] === 'find') {
      query.findOne()
      logger.raw('.fineOne()')
    }

    logger
      .raw('.exec()')
      .action('find')
      .end()
    const result = await (query as DocumentQuery<(Document & T) | null, Document & T>).exec()
    if (result) {
      return make<Eloquent<T>>(this.mongooseModel.modelName).newInstance(result)
    }
    // tslint:disable-next-line
    return null
  }

  async findOrFail(): Promise<any> {
    const value = await this.find()
    if (!value) {
      throw new NotFoundError(this.mongooseModel.modelName)
    }
    return value
  }

  async firstOrFail(): Promise<any> {
    return this.findOrFail()
  }

  async first(): Promise<any | null> {
    return this.find()
  }

  async pluck(value: string): Promise<Object>
  async pluck(value: string, key: string): Promise<Object>
  async pluck(value: string, key?: string): Promise<Object> {
    const logger = MongooseQueryLog.create(this)
    this.selectedFields = []
    const keyName = key ? key : this.primaryKey
    this.select(value, keyName)
    const query = this.createQuery(false, logger)

    logger
      .raw('.exec()')
      .action('pluck')
      .end()
    const result: Array<Document & T> | null = await query.exec()
    if (result && !isEmpty(result)) {
      return result.reduce(function(memo: Object, item: Document) {
        memo[item[keyName]] = item[value]
        return memo
      }, {})
    }
    return {}
  }

  async count(): Promise<number> {
    const logger = MongooseQueryLog.create(this).action('count')
    this.selectedFields = []
    this.select(this.primaryKey)
    const query = this.createQuery(false, logger)
    logger.raw('.count().exec()').end()
    const result = await query.count().exec()
    return result
  }

  async update(data: Object): Promise<Object> {
    const conditions = new MongodbConditionConverter(this.getConditions()).convert()
    const query = this.mongooseModel.update(conditions, data, {
      multi: true
    })

    MongooseQueryLog.create(this)
      .action('update')
      .raw(this.mongooseModel.modelName)
      .raw(`.update(${JSON.stringify(conditions)}, ${JSON.stringify(data)}, {multi: true})`)
      .raw('.exec()')
      .end()
    return <Object>query.exec()
  }

  async delete(): Promise<Object> {
    const conditions = this.isNotUsedOrEmptyCondition()
    if (conditions === false) {
      return { n: 0, ok: 1 }
    }
    MongooseQueryLog.create(this)
      .raw(this.mongooseModel.modelName)
      .raw('.remove(', conditions, ')', '.exec()')
      .end()

    const query = this.mongooseModel.remove(conditions)
    return <Object>query.exec()
  }

  async restore(): Promise<Object> {
    if (!this.softDelete) {
      return { n: 0, nModified: 0, ok: 1 }
    }
    const conditions = this.isNotUsedOrEmptyCondition()
    if (conditions === false) {
      return { n: 0, nModified: 0, ok: 1 }
    }

    const updateData = {
      $set: { [this.softDelete.deletedAt]: this.getNullValue(this.softDelete.deletedAt) }
    }
    const query = this.mongooseModel.update(conditions, updateData, { multi: true })
    MongooseQueryLog.create(this)
      .action('restore')
      .raw(this.mongooseModel.modelName)
      .raw('.update(', conditions, ',', updateData, ', ', { multi: true }, ')')
      .raw('.exec()')
      .end()
    return <Object>query.exec()
  }

  async execute(): Promise<any> {
    const logger = MongooseQueryLog.create(this)
    const query: any = this.getQuery(false, logger)
    logger
      .raw('.exec()')
      .action('execute')
      .end()
    return query.exec()
  }

  private isNotUsedOrEmptyCondition(): false | Object {
    if (!this.isUsed) {
      return false
    }
    const conditions = new MongodbConditionConverter(this.getConditions()).convert()
    if (isEmpty(conditions)) {
      return false
    }
    return conditions
  }
}
