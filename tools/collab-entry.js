// Bundled into web/vendor/collab.js by `npm run build:vendor` (the app itself has no build step).
export * as Y from 'yjs';
export * as awarenessProtocol from 'y-protocols/awareness';
export { EditorView, basicSetup } from 'codemirror';
export { EditorState, Compartment } from '@codemirror/state';
export { keymap } from '@codemirror/view';
export { html } from '@codemirror/lang-html';
export { markdown } from '@codemirror/lang-markdown';
export { json } from '@codemirror/lang-json';
export { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
