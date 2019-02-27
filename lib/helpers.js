/**
 * Checks a given input string.
 * @private
 * @param {String} input input string
 * @returns {Boolean}
 * `true` if is string and length != 0, `false` otherwise.
 */
function checkIfValidString(input) {
  return typeof input === 'string' && input.length > 0;
}

/**
 * Checks if the keys in `obj1`
 * are present in `obj2`.
 * @private
 * @param {Object} obj1
 * @param {Object} obj2
 * @returns {Boolean}
 */
function areKeysPresent(obj1, obj2) {
  const obj1Keys = Object.keys(obj1);
  const obj2Keys = Object.keys(obj2);

  return obj1Keys.every(key => {
    return obj2Keys.includes(key);
  });
}

/**
 * Standardizes schema so every
 * top-level property is equal to
 * an object.
 * @private
 * @param {Object} schema
 * @returns {Object}
 */
function standardizeSchema(schema) {
  const newSchema = {};

  Object.keys(schema).forEach(namedProperty => {
    if (typeof schema[namedProperty] === 'string') {
      newSchema[namedProperty] = {
        property: schema[namedProperty],
        transform: v => v
      };
    } else {
      newSchema[namedProperty] = schema[namedProperty];
    }
  });

  return newSchema;
}

module.exports = {checkIfValidString, areKeysPresent, standardizeSchema};
