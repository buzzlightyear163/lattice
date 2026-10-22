// A small, real terminal. Commands are handled by main.js.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const T = {
  esc,
  k: (s) => `<span class="k">${esc(s)}</span>`,
  v: (s) => `<span class="v">${esc(s)}</span>`,
  ok: (s) => `<span class="ok">${esc(s)}</span>`,
  err: (s) => `<span class="err">${esc(s)}</span>`,
  dim: (s) => `<span class="dimmed">${esc(s)}</span>`,
  hl: (s) => `<span class="hl">${esc(s)}</span>`,
  raw: (s) => s,
  /** "key       value" with a fixed key column */
  kv: (key, valueHtml, w = 10) => `<span class="k">${esc(key.padEnd(w))}</span>${valueHtml}`,
};

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Terminal {
  constructor(root, { onCommand }) {
    this.body = root.querySelector('[data-tty-body]');
    this.form = root.querySelector('[data-tty-form]');
    this.input = root.querySelector('[data-tty-input]');
    this.status = root.querySelector('[data-tty-status]');
    this.onCommand = onCommand;
    this.history = [];
    this.hi = -1;
    this.queue = Promise.resolve();
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.input.value.trim();
      this.input.value = '';
      if (!v) return;
      this.history.unshift(v);
      this.hi = -1;
      this.cmd(v);
      this.onCommand(v);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && this.history.length) {
        this.hi = Math.min(this.history.length - 1, this.hi + 1);
        this.input.value = this.history[this.hi];
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        this.hi = Math.max(-1, this.hi - 1);
        this.input.value = this.hi >= 0 ? this.history[this.hi] : '';
        e.preventDefault();
      }
    });
    // clicking anywhere in the body focuses the prompt (unless selecting text)
    this.body.addEventListener('mouseup', () => {
      if (!String(window.getSelection())) this.input.focus({ preventScroll: true });
    });
  }

  scroll() {
    this.body.scrollTop = this.body.scrollHeight;
  }

  line(html = '', cls = '') {
    const d = document.createElement('div');
    d.className = `l ${cls}`.trim();
    d.innerHTML = html;
    this.body.appendChild(d);
    while (this.body.children.length > 220) this.body.firstChild.remove();
    this.scroll();
    return d;
  }

  cmd(text) {
    return this.line(esc(text), 'cmd');
  }

  /** Types a command as if a person entered it. */
  async typeCmd(text, speed = 22) {
    const d = this.line('', 'cmd');
    for (let i = 1; i <= text.length; i++) {
      d.textContent = text.slice(0, i);
      await wait(speed + Math.random() * speed);
    }
    return d;
  }

  /** Line with a spinner, returns { done(html) } */
  spinner(prefixHtml) {
    const d = this.line(prefixHtml);
    let i = 0;
    const id = setInterval(() => {
      d.innerHTML = `${prefixHtml}<span class="v">${SPIN[i++ % SPIN.length]}</span>`;
    }, 80);
    return {
      done: (html) => {
        clearInterval(id);
        d.innerHTML = html;
        this.scroll();
      },
    };
  }

  busy(on, label) {
    this.status.classList.toggle('busy', !!on);
    this.status.textContent = on ? label || 'working' : label || 'local';
  }

  clear() {
    this.body.innerHTML = '';
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
