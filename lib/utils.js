/**
 * Checks a given input string.
 * @private
 * @param {String} input input string
 * @returns {Boolean}
 * `true` if is string and length != 0, `false` otherwise.
 */
function isValidString(input) {
  return typeof input === 'string' && input.length > 0;
}

module.exports = {isValidString};
