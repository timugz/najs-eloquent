"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MongooseQueryLog_1 = require("./MongooseQueryLog");
const QueryBuilder_1 = require("./QueryBuilder");
const MongodbConditionConverter_1 = require("./MongodbConditionConverter");
const najs_binding_1 = require("najs-binding");
const lodash_1 = require("lodash");
const collect_js_1 = require("collect.js");
const NotFoundError_1 = require("../errors/NotFoundError");
class MongooseQueryBuilder extends QueryBuilder_1.QueryBuilder {
    constructor(modelName, softDelete, primaryKey = '_id') {
        super(softDelete);
        this.primaryKey = primaryKey;
        const mongoose = this.getMongooseProvider().getMongooseInstance();
        if (mongoose.modelNames().indexOf(modelName) === -1) {
            throw new Error('Model ' + modelName + ' Not Found');
        }
        this.mongooseModel = mongoose.model(modelName);
    }
    getMongooseProvider() {
        return najs_binding_1.make('MongooseProvider');
    }
    getQuery(isFindOne = false, logger) {
        if (!this.hasMongooseQuery) {
            const conditions = new MongodbConditionConverter_1.MongodbConditionConverter(this.getConditions()).convert();
            this.mongooseQuery = isFindOne
                ? this.mongooseModel.findOne(conditions)
                : (this.mongooseQuery = this.mongooseModel.find(conditions));
            if (logger) {
                logger.raw(this.mongooseModel.modelName).raw(isFindOne ? '.findOne(' : '.find(', conditions, ')');
            }
            this.hasMongooseQuery = true;
        }
        return this.mongooseQuery;
    }
    passDataToMongooseQuery(query, logger) {
        if (!lodash_1.isEmpty(this.selectedFields)) {
            const selectParams = this.selectedFields.join(' ');
            query.select(selectParams);
            if (logger) {
                logger.raw(`.select("${selectParams}")`);
            }
        }
        if (!lodash_1.isEmpty(this.distinctFields)) {
            const distinctParams = this.distinctFields.join(' ');
            query.distinct(distinctParams);
            if (logger) {
                logger.raw(`.distinct("${distinctParams}")`);
            }
        }
        if (this.limitNumber) {
            query.limit(this.limitNumber);
            if (logger) {
                logger.raw(`.limit(${this.limitNumber})`);
            }
        }
        if (this.ordering && !lodash_1.isEmpty(this.ordering)) {
            const sort = Object.keys(this.ordering).reduce((memo, key) => {
                memo[key] = this.ordering[key] === 'asc' ? 1 : -1;
                return memo;
            }, {});
            query.sort(sort);
            if (logger) {
                logger.raw('.sort(', sort, ')');
            }
        }
        return query;
    }
    createQuery(findOne, logger) {
        return this.passDataToMongooseQuery(this.getQuery(findOne, logger), logger);
    }
    getPrimaryKey() {
        return this.primaryKey;
    }
    native(handler) {
        this.mongooseQuery = handler.call(undefined, this.isUsed ? this.createQuery(false) : this.mongooseModel);
        this.hasMongooseQuery = true;
        return this;
    }
    toObject() {
        const conditions = new MongodbConditionConverter_1.MongodbConditionConverter(this.getConditions()).convert();
        return {
            name: this.name ? this.name : undefined,
            select: !lodash_1.isEmpty(this.selectedFields) ? this.selectedFields : undefined,
            distinct: !lodash_1.isEmpty(this.distinctFields) ? this.distinctFields : undefined,
            limit: this.limitNumber,
            orderBy: !lodash_1.isEmpty(this.ordering) ? this.ordering : undefined,
            conditions: !lodash_1.isEmpty(conditions) ? conditions : undefined
        };
    }
    getFieldByName(name) {
        if (name === 'id') {
            return '_id';
        }
        return name;
    }
    // -------------------------------------------------------------------------------------------------------------------
    async get() {
        const logger = MongooseQueryLog_1.MongooseQueryLog.create(this);
        const query = this.createQuery(false, logger);
        logger
            .raw('.exec()')
            .action('get')
            .end();
        const result = await query.exec();
        if (result && !lodash_1.isEmpty(result)) {
            const eloquent = najs_binding_1.make(this.mongooseModel.modelName);
            return eloquent.newCollection(result);
        }
        return collect_js_1.default([]);
    }
    async all() {
        return this.get();
    }
    async find() {
        const logger = MongooseQueryLog_1.MongooseQueryLog.create(this);
        const query = this.passDataToMongooseQuery(this.getQuery(true, logger), logger);
        // change mongoose query operator from find to findOne if needed
        if (query['op'] === 'find') {
            query.findOne();
            logger.raw('.fineOne()');
        }
        logger
            .raw('.exec()')
            .action('find')
            .end();
        const result = await query.exec();
        if (result) {
            return najs_binding_1.make(this.mongooseModel.modelName).newInstance(result);
        }
        // tslint:disable-next-line
        return null;
    }
    async findOrFail() {
        const value = await this.find();
        if (!value) {
            throw new NotFoundError_1.NotFoundError(this.mongooseModel.modelName);
        }
        return value;
    }
    async firstOrFail() {
        return this.findOrFail();
    }
    async first() {
        return this.find();
    }
    async pluck(value, key) {
        const logger = MongooseQueryLog_1.MongooseQueryLog.create(this);
        this.selectedFields = [];
        const keyName = key ? key : this.primaryKey;
        this.select(value, keyName);
        const query = this.createQuery(false, logger);
        logger
            .raw('.exec()')
            .action('pluck')
            .end();
        const result = await query.exec();
        if (result && !lodash_1.isEmpty(result)) {
            return result.reduce(function (memo, item) {
                memo[item[keyName]] = item[value];
                return memo;
            }, {});
        }
        return {};
    }
    async count() {
        const logger = MongooseQueryLog_1.MongooseQueryLog.create(this).action('count');
        this.selectedFields = [];
        this.select(this.primaryKey);
        const query = this.createQuery(false, logger);
        logger.raw('.count().exec()').end();
        const result = await query.count().exec();
        return result;
    }
    async update(data) {
        const conditions = new MongodbConditionConverter_1.MongodbConditionConverter(this.getConditions()).convert();
        const query = this.mongooseModel.update(conditions, data, {
            multi: true
        });
        MongooseQueryLog_1.MongooseQueryLog.create(this)
            .action('update')
            .raw(this.mongooseModel.modelName)
            .raw(`.update(${JSON.stringify(conditions)}, ${JSON.stringify(data)}, {multi: true})`)
            .raw('.exec()')
            .end();
        return query.exec();
    }
    async delete() {
        const conditions = this.isNotUsedOrEmptyCondition();
        if (conditions === false) {
            return { n: 0, ok: 1 };
        }
        MongooseQueryLog_1.MongooseQueryLog.create(this)
            .raw(this.mongooseModel.modelName)
            .raw('.remove(', conditions, ')', '.exec()')
            .end();
        const query = this.mongooseModel.remove(conditions);
        return query.exec();
    }
    async restore() {
        if (!this.softDelete) {
            return { n: 0, nModified: 0, ok: 1 };
        }
        const conditions = this.isNotUsedOrEmptyCondition();
        if (conditions === false) {
            return { n: 0, nModified: 0, ok: 1 };
        }
        const updateData = {
            $set: { [this.softDelete.deletedAt]: this.getNullValue(this.softDelete.deletedAt) }
        };
        const query = this.mongooseModel.update(conditions, updateData, { multi: true });
        MongooseQueryLog_1.MongooseQueryLog.create(this)
            .action('restore')
            .raw(this.mongooseModel.modelName)
            .raw('.update(', conditions, ',', updateData, ', ', { multi: true }, ')')
            .raw('.exec()')
            .end();
        return query.exec();
    }
    async execute() {
        const logger = MongooseQueryLog_1.MongooseQueryLog.create(this);
        const query = this.getQuery(false, logger);
        logger
            .raw('.exec()')
            .action('execute')
            .end();
        return query.exec();
    }
    isNotUsedOrEmptyCondition() {
        if (!this.isUsed) {
            return false;
        }
        const conditions = new MongodbConditionConverter_1.MongodbConditionConverter(this.getConditions()).convert();
        if (lodash_1.isEmpty(conditions)) {
            return false;
        }
        return conditions;
    }
}
MongooseQueryBuilder.className = 'MongooseQueryBuilder';
exports.MongooseQueryBuilder = MongooseQueryBuilder;
