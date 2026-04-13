/**
 * N+1 Query Detection Analyzer (AST Based)
 *
 * Detects potential N+1 query anti-patterns by identifying query-like
 * method calls inside of loop structures (for, for-of, while, foreach) or
 * iterative array methods (map, forEach, each) using Abstract Syntax Trees.
 *
 * Supports both JavaScript/TypeScript and PHP (Eloquent, Prisma, Sequelize, etc.)
 */

const ORM_METHODS = new Set([
  // Generic ORM / DB methods
  'find', 'findOne', 'findAll', 'findMany', 'findUnique', 'findFirst',
  'findById', 'findByPk', 'query', 'execute', 'select', 'insert', 'update', 'delete',
  'insertOne', 'insertMany', 'create', 'createMany', 'save', 'count',
  // Eloquent / Laravel specific
  'first', 'firstOrFail', 'firstOrCreate', 'firstOrNew', 'firstWhere',
  'get', 'all', 'pluck', 'value', 'chunk',
  'where', 'whereIn', 'whereHas', 'whereNotIn',
  'load', 'loadMissing', 'with',
  'has', 'doesntHave',
  'findOrFail', 'findOrNew',
  'refresh', 'fresh',
  'paginate', 'simplePaginate',
  'attach', 'detach', 'sync',
  'increment', 'decrement',
  'updateOrCreate', 'updateOrInsert',
  'associate', 'dissociate',
]);

const DB_OBJECTS = new Set([
  'db', 'database', 'models', 'model', 'repository', 'collection'
]);

/**
 * Traverses an AST to find instances of database queries inside loops.
 * 
 * @param {import('tree-sitter').SyntaxNode} astRoot 
 * @returns {Array<{issue: string, startLine: number, endLine: number, snippet: string}>}
 */
export function detectNPlusOneQueries(astRoot) {
  const violations = [];

  // Recursively traverse the AST
  function traverse(node, inLoop = false) {
    if (!node) return;

    // Check if we are entering a loop context
    const isLoop = isLoopNode(node) || isIterativeMethodCall(node);
    const insideLoop = inLoop || isLoop;

    // If we're inside a loop, look for database query calls
    if (insideLoop && isDatabaseCall(node)) {
      violations.push({
        issue: 'n-plus-one-query',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        snippet: node.text.substring(0, 100).replace(/\n/g, ' '),
        evidence: 'Database or API call detected inside an iteration loop.'
      });
      // Don't flag multiple inner calls within the exact same statement to avoid spam
      return;
    }

    // Traverse children
    for (let i = 0; i < node.childCount; i++) {
      traverse(node.child(i), insideLoop);
    }
  }

  traverse(astRoot);
  return violations;
}

/**
 * Checks if a node is a loop construct (JS or PHP).
 */
function isLoopNode(node) {
  return (
    node.type === 'for_statement' ||
    node.type === 'for_in_statement' ||
    node.type === 'for_of_statement' ||
    node.type === 'while_statement' ||
    node.type === 'do_statement' ||
    node.type === 'foreach_statement'       // PHP foreach
  );
}

/**
 * Checks if a node represents an iterative method call like .map(), .forEach(), .each()
 * Works for both JS call_expression and PHP member_call_expression.
 */
function isIterativeMethodCall(node) {
  // JS: call_expression, PHP: member_call_expression
  if (node.type !== 'call_expression' && node.type !== 'member_call_expression') return false;

  // Get the function being called
  const functionNode = node.childForFieldName('function')   // JS
    || node.childForFieldName('name');                       // PHP member_call_expression uses 'name'
  
  if (!functionNode) return false;

  // JS: member_expression with a property
  if (functionNode.type === 'member_expression') {
    const propertyNode = functionNode.childForFieldName('property');
    if (!propertyNode) return false;
    return ['map', 'forEach', 'filter', 'reduce', 'each', 'flatMap'].includes(propertyNode.text);
  }

  // PHP: the function node for member_call_expression is the 'name' field directly
  if (functionNode.type === 'name') {
    return ['map', 'forEach', 'filter', 'reduce', 'each', 'flatMap'].includes(functionNode.text);
  }

  return false;
}

/**
 * Checks if a node represents a database or ORM call.
 * Handles JS (call_expression), PHP (member_call_expression, scoped_call_expression).
 */
function isDatabaseCall(node) {
  let targetNode = node;

  // Unwrap await
  if (node.type === 'await_expression') {
    targetNode = node.firstNamedChild;
    if (!targetNode) return false;
  }

  // JS: call_expression, PHP: member_call_expression or scoped_call_expression
  const isCallType = (
    targetNode.type === 'call_expression' ||
    targetNode.type === 'member_call_expression' ||
    targetNode.type === 'scoped_call_expression'
  );
  if (!isCallType) return false;

  let methodName = '';

  if (targetNode.type === 'call_expression') {
    // JS call_expression
    const functionNode = targetNode.childForFieldName('function');
    if (!functionNode) return false;

    if (functionNode.type === 'member_expression') {
      const propertyNode = functionNode.childForFieldName('property');
      if (!propertyNode) return false;
      methodName = propertyNode.text;
    } else if (functionNode.type === 'identifier') {
      methodName = functionNode.text;
    } else {
      return false;
    }
  } else if (targetNode.type === 'member_call_expression') {
    // PHP: $object->method()
    const nameNode = targetNode.childForFieldName('name');
    if (!nameNode) return false;
    methodName = nameNode.text;
  } else if (targetNode.type === 'scoped_call_expression') {
    // PHP: Class::method()
    const nameNode = targetNode.childForFieldName('name');
    if (!nameNode) return false;
    methodName = nameNode.text;
  }

  return ORM_METHODS.has(methodName);
}
