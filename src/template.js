const expressionMatcher = /\{([\s\S]+?)\}/g;
const executableExpression = /([\s\S]+?)\(([\s|\S]*?)\)/g;
const nodeFilter = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT;

const partTypes = {
  textNode: 1,
  property: 2,
  attribute: 3,
  booleanAttribute: 4
};

class TemplatePart {
  constructor(node, expression) {
    this._node = node;
    this._expression = createExpression(expression);
    this._value = Symbol();
  }
  update(context) {
    if (this._expression.changed(context)) {
      const value = this._cast(this._expression.getValue(context));
      if (value !== this._value) {
        this._value = value;
        this._applyChanges(value);
      }
    }
  }
  _cast(value) {
    return value;
  }
  _applyChanges() {
    throw new Error('Not implemented');
  }
}

function createExpression(expression) {
  const search = executableExpression.exec(expression);
  if (!search) {
    return new StaticExpression(expression);
  }
  const [, functionName, params] = search;
  executableExpression.lastIndex = 0;
  return new DynamicExpression(functionName.trim(), params.split(',').map(p=>p.trim()));
}

class StaticExpression {
  constructor(expression) {
    this._expression = expression;
    this._value = Symbol();
  }
  changed(context) {
    return this._expression in context && this._value !== context[this._expression];
  }
  getValue(context) {
    const value = context[this._expression];
    this._value = value;
    return value;
  }
}

class DynamicExpression {
  constructor(functionName, params) {
    this._functionName = functionName;
    this._params = params;
    this._function = Symbol();
    this._paramsStore = this._initParamsStore();
  }
  _initParamsStore() {
    return this._params.reduce((store, param) => {
      store[param] = undefined;
      return store;
    }, {});
  }
  changed(context) {
    return this._paramsChanged(context) || this._functionChanged(context);
  }
  _paramsChanged(context){
    return this._params.some((key) => {
      return key in context && this._paramsStore[key] !== context[key];
    });
  }
  _functionChanged(context){
    return this._functionName in context && this._function !== context[this._functionName];
  }
  getValue(context) {
    this._updateParams(context);
    this._updateFunction(context);
    return this._function.apply(null, Object.values(this._paramsStore));
  }
  _updateParams(context) {
    this._params.forEach((param) => {
      this._paramsStore[param] = param in context
        ? context[param]
        : this._paramsStore[param];
    });
  }
  _updateFunction(context) {
    this._function = this._functionName in context
      ? context[this._functionName]
      : this._function;
  }
}

class NodePart extends TemplatePart {
  constructor(node, { expression }) {
    super(node, expression);
  }
  _cast(value) {
    return value || '';
  }
  _applyChanges(value) {
    this._node.textContent = value;
  }
}

class BooleanAttributePart extends TemplatePart {
  constructor(node, { expression, attribute }) {
    super(node, expression);
    this._attribute = attribute;
  }
  _cast(value) {
    return Boolean(value);
  }
  _applyChanges(value) {
    this._node.toggleAttribute(this._attribute, value);
  }
}

class PropertyPart extends TemplatePart {
  constructor(node, { expression, property }) {
    super(node, expression);
    this._property = property;
  }
  _applyChanges(value) {
    this._node[this._property] = value;
  }
}

class AttributePart extends TemplatePart {
  constructor(node, { expression, attribute }) {
    super(node, expression);
    this._attribute = attribute;
  }
  _cast(value) {
    return value || '';
  }
  _applyChanges(value) {
    this._node.setAttribute(this._attribute, value);
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

  function extractNodeBeforeExpression(offset) {
    node.splitText(offset);
    checkForEmptyNode();
  }

  function extractExpressionNode(match, expression) {
    node = walker.nextNode();
    node.splitText(match.length);
    node.textContent = '';
    addPart({ type: partTypes.textNode, expression });
  }

  function extractNodeAfterExpression() {
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
