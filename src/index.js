import EntitySchema from './EntitySchema';
import IterableSchema from './IterableSchema';
import UnionSchema from './UnionSchema';
import isObject from 'lodash/isObject';
import isEqual from 'lodash/isEqual';
import mapValues from 'lodash/mapValues';

function defaultAssignEntity(normalized, key, entity) {
  normalized[key] = entity;
}

function visitObject(obj, schema, bag, options) {
  const { assignEntity = defaultAssignEntity } = options;

  let normalized = {};
  for (let key in obj) {
    if ( obj.hasOwnProperty(key) && (key != 'embedded') ) {
      const entity = visit(obj[key], schema[key], bag, options);
      assignEntity.call(null, normalized, key, entity);
    }
  }

  if (obj.hasOwnProperty("embedded")) {
    let embedded = obj.embedded;
    for (let key in embedded) {
      if (embedded.hasOwnProperty(key)) {
        const entity = visit(embedded[key], schema[key], bag, options);
        assignEntity.call(null, normalized, key, entity);
      }
    }
  }

  return normalized;
}

function defaultMapper(iterableSchema, itemSchema, bag, options) {
  return (obj) => visit(obj, itemSchema, bag, options);
}

function polymorphicMapper(iterableSchema, itemSchema, bag, options) {
  return (obj) => {
    const schemaKey = iterableSchema.getSchemaKey(obj);
    const result = visit(obj, itemSchema[schemaKey], bag, options);
    return { id: result, schema: schemaKey };
  };
}

function visitIterable(obj, iterableSchema, bag, options) {
  const itemSchema = iterableSchema.getItemSchema();
  const curriedItemMapper = defaultMapper(iterableSchema, itemSchema, bag, options);

  if (Array.isArray(obj)) {
    return obj.map(curriedItemMapper);
  } else {
    return mapValues(obj, curriedItemMapper);
  }
}

function visitUnion(obj, unionSchema, bag, options) {
  const itemSchema = unionSchema.getItemSchema();
  return polymorphicMapper(unionSchema, itemSchema, bag, options)(obj);
}

function defaultMergeIntoEntity(entityA, entityB, entityKey) {
  for (let key in entityB) {
    if (!entityB.hasOwnProperty(key)) {
      continue;
    }

    if (!entityA.hasOwnProperty(key) || isEqual(entityA[key], entityB[key])) {
      entityA[key] = entityB[key];
      continue;
    }

    console.warn(
      'When merging two ' + entityKey + ', found unequal data in their "' + key + '" values. Using the earlier value.',
      entityA[key], entityB[key]
    );
  }
}

function visitEntity(entity, entitySchema, bag, options) {
  const { mergeIntoEntity = defaultMergeIntoEntity } = options;

  var id = entitySchema.getId(entity);
  if (id != null) {
    const entityKey = entitySchema.getKey();
    if (!bag.hasOwnProperty(entityKey)) {
      bag[entityKey] = {};
    }

    if (!bag[entityKey].hasOwnProperty(id)) {
      bag[entityKey][id] = {};
    }

    let stored = bag[entityKey][id];
    let normalized = visitObject(entity, entitySchema, bag, options);
    mergeIntoEntity(stored, normalized, entityKey);
  } else {
    id = visitObject(entity, entitySchema, bag, options);
  }

  return id;
}

function visit(obj, schema, bag, options) {
  if (!isObject(obj) || !isObject(schema)) {
    return obj;
  }

  if (schema instanceof EntitySchema) {
    return visitEntity(obj, schema, bag, options);
  } else if (schema instanceof IterableSchema) {
    return visitIterable(obj, schema, bag, options);
  } else if (schema instanceof UnionSchema) {
    return visitUnion(obj, schema, bag, options);
  } else {
    return visitObject(obj, schema, bag, options);
  }
}

export function arrayOf(schema, options) {
  return new IterableSchema(schema, options);
}

export function valuesOf(schema, options) {
  return new IterableSchema(schema, options);
}

export function unionOf(schema, options) {
  return new UnionSchema(schema, options);
}

export { EntitySchema as Schema };

export function normalize(obj, schema, options = {}) {
  if (!isObject(obj) && !Array.isArray(obj)) {
    throw new Error('Normalize accepts an object or an array as its input.');
  }

  if (!isObject(schema) || Array.isArray(schema)) {
    throw new Error('Normalize accepts an object for schema.');
  }

  let bag = {};
  let result;
  if ( (schema instanceof IterableSchema) && (obj.hasOwnProperty("embedded")) ) {
    let key = schema.getItemSchema().getKey();
    result = visit(obj.embedded[key], schema, bag, options);
  } else {
    result = visit(obj, schema, bag, options);
  }
  
  return {
    entities: bag,
    result
  };
}
