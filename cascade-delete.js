'use strict';

var debug = require('debug')('loopback:mixins:cascade-delete');
var _ = require('lodash');

module.exports = function (Model, options) {

    Model.observe('after delete', function (ctx, next) {
        var name = idName(Model);
        var hasInstanceId = ctx.instance && ctx.instance[name];
        var hasWhereId = ctx.where && ctx.where[name];
        var hasMixinOption = options && _.isArray(options.relations);

        if (!(hasWhereId || hasInstanceId)) {
            debug('Skipping delete for ', Model.definition.name);
            return next();
        }

        if (!hasMixinOption) {
            debug('Skipping delete for', Model.definition.name, 'Please add mixin options');
            return next();
        }
        var modelInstanceId = getIdValue(Model, ctx.instance || ctx.where);

        var deletedRelations = _.map(cascadeDeletes(), function (deleteRelation) {
            return deleteRelation(modelInstanceId);
        });

        Promise.all(deletedRelations)
            .then(function () {
                debug('Cascade delete has successfully finished');
                next();
            })
            .catch(function (err) {
                debug('Error with cascading deletes', err);
                next(err);
            });
    });

    function cascadeDeletes() {
        return _.map(options.relations, function (relation) {
            return function (modelId) {
                var theRelation = relation;
                var theDeepDelete = options.deepDelete;
                if (typeof(relation) === 'object') {
                  theRelation = relation.relation;
                  theDeepDelete = relation.deepDelete || false;
                }
                debug('Relation ' + theRelation + ' model ' + Model.definition.name);

                if (!Model.relations[theRelation]) {
                    debug('Relation ' + theRelation + ' not found for model ' + Model.definition.name);
                    throw 'Relation ' + theRelation + ' not found for model ' + Model.definition.name;
                }


                var relationModel = Model.relations[theRelation].modelTo;
                var relationKey = Model.relations[theRelation].keyTo;

                if (Model.relations[theRelation].modelThrough) {
                    relationModel = Model.relations[theRelation].modelThrough;
                }

                var where = {};
                where[relationKey] = modelId;

                if (theDeepDelete) {
                  let relationModelIdName = relationModel.getIdName();
                  let fields = {};
                  fields[relationModelIdName] = true;
                  return relationModel.find({where: where, fields: fields}).then(function (instancesToDelete) {
                    let deleteOperations = [];
                    for (let instance of instancesToDelete) {
                      deleteOperations.push(relationModel.deleteById(instance[relationModelIdName]));
                    }
                    return Promise.all(deleteOperations);
                  });
                } else {
                  return relationModel.destroyAll(where);
                }
            };
        });
    }

    function idName(m) {
        return m.definition.idName() || 'id';
    }

    function getIdValue(m, data) {
        return data && data[idName(m)];
    }
};
