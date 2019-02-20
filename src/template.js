class TemplatePart{
  constructor(node, expression){
    this._node = node;
    this._expression = expression;
    this._value = Symbol('uninitialized');
  }
  update(context){
    if(this._shouldUpdate(context)){
      this._applyChanges(context[this._expression]);
    }
  }
  _shouldUpdate(context) {
    return (this._expression in context) && context[this._expression] !== this._value;
  }
  _applyChanges(){
    throw new Error('Not implemented');
  }
}

class NodePart extends TemplatePart{
  constructor(node, { expression }){
    super(node, expression);
  }
  _applyChanges(value){
    this._node.textContent = value || '';
  }
}

class BooleanAttributePart extends TemplatePart{
  constructor(node, {expression, attribute}){
    super(node, expression);
    this._attribute = attribute;
  }
  _applyChanges(value){
    this._node.toggleAttribute(this._attribute, Boolean(value));
  }
}

class PropertyPart extends TemplatePart{
  constructor(node, {expression, property}){
    super(node, expression);
    this._property = property;
  }
  _applyChanges(value){
    this._node[this._property] = value;
  }
}

class AttributePart extends TemplatePart{
  constructor(node, {expression, attribute}){
    super(node, expression);
    this._attribute = attribute;
  }
  _applyChanges(value){
    this._node.setAttribute(this._attribute, value || '');
  }
}

class Template {
  constructor(template) {
    this._template = template;
    this._parts = parse(template);
  }
  createInstance(initialContext) {
    const content = document.importNode(this._template.content, true);
    const parts = instantiateParts(content, this._parts);
    return new TemplateInstance(content, parts, initialContext);
  }
}

class TemplateInstance extends DocumentFragment {
  constructor(content, parts, initialContext) {
    super();
    this.append(content);
    this._parts = parts;
    initialContext && this.update(initialContext);
  }
  update(context) {
    this._parts.forEach((part) => part.update(context));
  }
}

const expressionMatcher = /\{([\s\S]+?)\}/g;
const nodeFilter = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT;

const partTypes = {
  textNode: 1,
  property: 2,
  attribute: 3,
  booleanAttribute: 4
};

const partConstructors = {
  [partTypes.textNode]: NodePart,
  [partTypes.property]: PropertyPart,
  [partTypes.attribute]: AttributePart,
  [partTypes.booleanAttribute]: BooleanAttributePart
};

function instantiateParts(content, parts) {
  const walker = document.createTreeWalker(content, nodeFilter);
  const partInstances = [];
  let nodeIndex = 0;
  let node = walker.currentNode;
  while (node) {
    (parts[nodeIndex] || []).forEach(function (part) {
      partInstances.push(instantiatePart(node, part));
    });
    node = walker.nextNode();
    nodeIndex++;
  }
  return partInstances;
}

function instantiatePart(node, part) {
  const { type, ...params } = part;
  const PartConstructor = partConstructors[type];
  return new PartConstructor(node, params);
}

function parse(template) {
  const walker = document.createTreeWalker(template.content, nodeFilter);
  const parts = {};
  const emptyNodes = [];
  let nodeIndex = 0;
  let node = walker.currentNode;

  function removeEmptyNodes() {
    emptyNodes.forEach(node => node.remove());
  }

  function checkForEmptyNode() {
    if (!node.data) {
      emptyNodes.push(node);
    } else {
      nodeIndex++;
    }
  }

  function addPart(part) {
    parts[nodeIndex] = parts[nodeIndex] || [];
    parts[nodeIndex].push(part);
  }

  function extractNodeBeforeExpression(offset){
    node.splitText(offset);
    checkForEmptyNode();
  }

  function extractExpressionNode(match, expression){
    node = walker.nextNode();
    node.splitText(match.length);
    node.textContent = '';
    addPart({ type: partTypes.textNode, expression });
  }

  function extractNodeAfterExpression(){
    node = walker.nextNode();
    checkForEmptyNode();
  }

  function parseTextNode() {
    let search;
    while (search = expressionMatcher.exec(node.textContent)) {
      const [match, expression] = search;
      const offset = search.index;
      extractNodeBeforeExpression(offset);
      extractExpressionNode(match, expression);
      extractNodeAfterExpression();
      expressionMatcher.lastIndex = 0;
    }
  }

  function parseAttributes() {
    node.getAttributeNames().forEach(function (attribute) {
      const value = node.getAttribute(attribute);
      const search = expressionMatcher.exec(value);
      if (search) {
        const expression = search[1];
        const prefix = attribute.substring(0, 1);
        const name = attribute.substring(1);
        if (prefix === '?') {
          addPart({ type: partTypes.booleanAttribute, expression, attribute: name });
        } else if (prefix === '.') {
          addPart({ type: partTypes.property, expression, property: name });
        } else {
          addPart({ type: partTypes.attribute, expression, attribute });
        }
        node.removeAttribute(attribute);
      }
      expressionMatcher.lastIndex = 0;
    });
  }

  function parseElementNode() {
    parseAttributes();
    // TODO: templates
  }

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parseTextNode();
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      parseElementNode();
    }
    nodeIndex++;
    node = walker.nextNode();
  }
  removeEmptyNodes();
  return parts;
}

export default Template;
