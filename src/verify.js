// §5 — verify any seal file locally.
import { verifySeal } from './forge.js';
import { T } from './terminal.js';

export class Verifier {
  constructor(root, { getMine, makeSample }) {
    this.root = root;
    this.input = root.querySelector('[data-verify-input]');
    this.out = root.querySelector('[data-verify-out]');
    this.mineBtn = root.querySelector('[data-verify-mine]');
    this.getMine = getMine;
    this.makeSample = makeSample;
    const drop = root.querySelector('[data-drop]');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      this.input.value = await f.text();
      this.run();
    });
    root.querySelector('[data-verify-run]').addEventListener('click', () => this.run());
    this.mineBtn.addEventListener('click', () => {
      const mine = this.getMine();
      if (mine) {
        this.input.value = JSON.stringify(mine, null, 2);
        this.run();
      }
    });
    root.querySelector('[data-verify-sample]').addEventListener('click', async () => {
      this.render([{ label: 'Forging a sample seal', ok: null, detail: 'in your browser' }]);
      const sample = await this.makeSample();
      this.input.value = JSON.stringify(sample, null, 2);
      this.run();
    });
  }

  enableMine(on) {
    this.mineBtn.disabled = !on;
  }

  async run() {
    let obj;
    try {
      obj = JSON.parse(this.input.value);
    } catch {
      this.render([], { ok: false, text: 'That is not valid JSON. Paste the whole seal file.' });
      return;
    }
    this.render([{ label: 'Checking', ok: null, detail: 'on this device' }]);
    try {
      const res = await verifySeal(obj);
      this.render(res.steps, {
        ok: res.ok,
        text: res.ok ? 'Valid seal. The lattice key signed this pledge.' : 'Invalid seal. At least one check failed.',
      });
    } catch (e) {
      this.render([], { ok: false, text: `Could not verify: ${e.message}` });
    }
  }

  render(steps, result) {
    const li = steps.map((s) => {
      const ic = s.ok === true ? '✓' : s.ok === false ? '✕' : '·';
      const cls = s.ok === false ? 'bad' : '';
      return `<li class="${cls}"><span class="ic">${ic}</span><span><b>${T.esc(s.label)}</b><small>${T.esc(s.detail || '')}</small></span></li>`;
    });
    if (result) li.push(`<li class="result ${result.ok ? '' : 'bad'}">${T.esc(result.text)}</li>`);
    this.out.innerHTML = li.join('');
  }
}
