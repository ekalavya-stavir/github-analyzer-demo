import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import { detectNPlusOneQueries } from './src/analysis/nplusone/index.js';

const parser = new Parser();
parser.setLanguage(JavaScript);

const code = `
  async function syncData(items) {
    for (const item of items) {
      await models.Item.create(item);
    }
  }
`;
const tree = parser.parse(code);

const ORM_METHODS = new Set([
  'find', 'findOne', 'findAll', 'findMany', 'findUnique', 'findFirst',
  'findById', 'findByPk', 'query', 'execute', 'select', 'insert', 'update', 'delete',
  'findOne', 'insertOne', 'insertMany', 'create'
]);

function isDatabaseCall(node) {
  let targetNode = node;
  console.log('>>> Checking node:', node.type, node.text);
  if (node.type === 'await_expression') {
    targetNode = node.firstNamedChild;
    console.log('  unwrapped await_expression. targetNode:', targetNode?.type);
    if (!targetNode) return false;
  }

  if (targetNode.type !== 'call_expression') return false;

  const functionNode = targetNode.childForFieldName('function');

  if (!functionNode) return false;

  let methodName = '';

  if (functionNode.type === 'member_expression') {
    let currentNode = functionNode;
    while (currentNode.type === 'member_expression') {
      const propertyNode = currentNode.childForFieldName('property');
      if (propertyNode) {
        methodName = propertyNode.text;
      }
      currentNode = currentNode.childForFieldName('object');
      if (!currentNode) break;
    }
  } else if (functionNode.type === 'identifier') {
    methodName = functionNode.text;
  } else {
    return false;
  }

  console.log('  methodName extracted:', methodName);
  if (ORM_METHODS.has(methodName)) {
    return true;
  }

  return false;
}

function traverse(node, inLoop = false) {
  if (!node) return;

  const isLoop =
    node.type === 'for_statement' ||
    node.type === 'for_in_statement' ||
    node.type === 'for_of_statement' ||
    node.type === 'while_statement';

  const insideLoop = inLoop || isLoop;

  if (insideLoop) {
    isDatabaseCall(node);
  }
  for (let i = 0; i < node.childCount; i++) {
    traverse(node.child(i), insideLoop);
  }
}

traverse(tree.rootNode);
