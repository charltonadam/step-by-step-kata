// Control window (laptop screen): mode navigation, kata picker, projector window.
import { getState, update, subscribe, selectKata, ensureKatas } from '../store.js';
import { bundledKatas } from '../kata/io.js';
import { initEditor } from './editor.js';
import { initSetup } from './setup.js';
import { initRun } from './run.js';

const kataSelect = document.getElementById('kata-select');
const projStatus = document.getElementById('proj-status');
let kataSig = '';

function renderShell(s) {
  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === s.mode));
  }
  for (const panel of document.querySelectorAll('.panel')) {
    panel.hidden = panel.id !== `panel-${s.mode}`;
  }

  const katas = Object.values(s.katas).sort((a, b) => a.name.localeCompare(b.name));
  const sig = katas.map((k) => `${k.id}:${k.name}`).join('|') + '#' + s.currentKataId;
  if (sig !== kataSig) {
    kataSig = sig;
    kataSelect.replaceChildren(...katas.map((k) => new Option(k.name, k.id)));
    kataSelect.value = s.currentKataId;
  }
}

// Opens the projector window, on the second screen when the browser can tell us where it is.
async function openProjector() {
  let features = 'popup,width=1280,height=720';
  if ('getScreenDetails' in window) {
    try {
      const details = await window.getScreenDetails();
      const other = details.screens.find((sc) => sc !== details.currentScreen);
      if (other) {
        features = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
      }
    } catch {
      // Permission denied: the user can drag the window across instead.
    }
  }
  const win = window.open('projector.html', 'skk-projector', features);
  projStatus.textContent = win
    ? 'Projector window open. Move it to the projector and press F there.'
    : 'The browser blocked the window. Allow pop-ups for this page and try again.';
}

for (const btn of document.querySelectorAll('[data-mode]')) {
  btn.addEventListener('click', () => update({ mode: btn.dataset.mode }));
}
kataSelect.addEventListener('change', () => selectKata(kataSelect.value));
document.getElementById('open-projector').addEventListener('click', openProjector);

ensureKatas(bundledKatas);
initEditor();
initSetup();
initRun();
subscribe(renderShell);
renderShell(getState());
