import { Operator } from '../../lib/interfaces/IBasicQueryGrammar';
export declare type SimpleCondition = {
    bool: 'and' | 'or';
    field: string;
    operator: Operator;
    value: any;
};
export declare type GroupOfCondition = {
    bool: 'and' | 'or';
    queries: Condition[];
};
export declare type Condition = SimpleCondition | GroupOfCondition;
export declare class MongodbConditionConverter {
    queryConditions: Object[];
    constructor(queryConditions: Object[]);
    convert(): Object;
    protected convertConditions(conditions: Condition[]): any;
    protected hasAnyIntersectKey(a: Object, b: Object): boolean;
    protected convertConditionsWithAnd(bucket: Object, conditions: Condition[]): void;
    protected convertConditionsWithOr(bucket: Object, conditions: Condition[]): void;
    protected convertCondition(condition: Condition): Object;
    protected convertGroupOfCondition(condition: GroupOfCondition): Object;
    protected convertSimpleCondition(condition: SimpleCondition): Object;
}
