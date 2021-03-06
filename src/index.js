import Template from './template.js';

class Foo extends HTMLElement {
  set prop(v) {
    this._prop = v;
  }
  connectedCallback() {
    this.innerHTML = `<h1>${this._prop}</h1>`;
  }
}

customElements.define('x-foo', Foo)

const template = new Template(document.getElementById('foo'));
const ctx = {
  bar: 'bar',
  hello: 'hello',
  hidden: false,
  asdf: {a:1},
  world: 12,
  a: 'a',
  prop: ' FOO',
  func: (hello, world) => hello + ' ' + world
};
const instance = template.createInstance(ctx);
document.body.append(instance);

const update = () => {
  instance.update({
    bar: 'basdfar',
    asdf: {b:2},
    world: 12342
  })
};

window.update = update;
