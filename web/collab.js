// Live co-editing in Studio: a CodeMirror editor bound to the artifact's shared Yjs document,
// with everyone's cursors and selections. The editor bundle loads only when Studio opens.
import { realtime } from './app.js';

let lib;
const load = () => (lib ||= import('./vendor/collab.js'));

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899', '#8b5cf6', '#14b8a6'];
export const colorFor = (id) => COLORS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

const toB64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function openCollabEditor({ artifactId, type, user, onText, onSaved, onPeers, onStatus }) {
  const L = await load();
  const { Y, awarenessProtocol, EditorView, basicSetup, EditorState, keymap, yCollab, yUndoManagerKeymap } = L;
  const lang = type === 'website' ? L.html() : type === 'dashboard' || type === 'video' ? L.json() : L.markdown();
  const color = colorFor(user.id);
  const host = document.createElement('div');
  host.className = 'collab-editor';
  let doc = null, ytext = null, awareness = null, view = null, roomId = null, destroyed = false;

  const peers = () => {
    if (!awareness) return;
    const seen = new Map();
    for (const [cid, st] of awareness.getStates()) if (st?.user && cid !== doc.clientID) seen.set(st.user.id, st.user);
    onPeers?.([...seen.values()]);
  };

  function build(state, aw, readOnly) {
    view?.destroy(); awareness?.destroy(); doc?.destroy();
    doc = new Y.Doc();
    Y.applyUpdate(doc, fromB64(state), 'remote');
    ytext = doc.getText('content');
    awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalStateField('user', { id: user.id, name: user.displayName || user.username, color, colorLight: `${color}33` });
    if (aw) awarenessProtocol.applyAwarenessUpdate(awareness, fromB64(aw), 'remote');
    doc.on('update', (u, origin) => { if (origin !== 'remote') realtime.send({ kind: 'doc.update', artifactId, update: toB64(u) }); });
    awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin !== 'remote') realtime.send({ kind: 'doc.awareness', artifactId, update: toB64(awarenessProtocol.encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])) });
      peers();
    });
    ytext.observe(() => onText?.(ytext.toString()));
    const undoManager = new Y.UndoManager(ytext);
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup, lang, EditorView.lineWrapping, keymap.of(yUndoManagerKeymap),
          yCollab(ytext, awareness, { undoManager }),
          EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
        ],
      }),
    });
    peers();
  }

  const onMsg = (ev) => {
    if (ev.artifactId !== artifactId || destroyed) return;
    if (ev.kind === 'doc.sync') {
      if (doc && roomId === ev.roomId) {
        // Reconnected to the same room: take what we missed and send what we typed offline.
        Y.applyUpdate(doc, fromB64(ev.state), 'remote');
        realtime.send({ kind: 'doc.update', artifactId, update: toB64(Y.encodeStateAsUpdate(doc)) });
        awareness.setLocalStateField('user', awareness.getLocalState()?.user);
      } else {
        const reloaded = !!roomId;
        build(ev.state, ev.awareness, ev.readOnly);
        roomId = ev.roomId;
        if (reloaded) onStatus?.('reloaded');
      }
      onStatus?.('synced', ev.version);
    } else if (ev.kind === 'doc.update') Y.applyUpdate(doc, fromB64(ev.update), 'remote');
    else if (ev.kind === 'doc.awareness') awarenessProtocol.applyAwarenessUpdate(awareness, fromB64(ev.update), 'remote');
    else if (ev.kind === 'doc.saved') onSaved?.(ev);
    else if (ev.kind === 'doc.error') onStatus?.('error', ev.error);
  };
  const join = () => realtime.send({ kind: 'doc.join', artifactId });
  realtime.listeners.add(onMsg);
  realtime.openListeners.add(join);
  join();

  return {
    dom: host,
    get text() { return ytext?.toString() ?? ''; },
    get ready() { return !!view; },
    selection() {
      if (!view) return '';
      const { from, to } = view.state.selection.main;
      return view.state.sliceDoc(from, to);
    },
    save() { realtime.send({ kind: 'doc.save', artifactId }); },
    destroy() {
      destroyed = true;
      realtime.listeners.delete(onMsg);
      realtime.openListeners.delete(join);
      if (awareness) awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], 'local');
      realtime.send({ kind: 'doc.leave', artifactId });
      view?.destroy(); awareness?.destroy(); doc?.destroy();
    },
  };
}
