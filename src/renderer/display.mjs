import { Player, StageView } from './player.mjs';
import { commandForKey } from '../shared/playlist.mjs';
const stage = document.querySelector('#audience');
if (window.replay) {
  const player = new Player(stage, state => window.replay.report(state));
  window.replay.on('state', state => player.setMeeting(state.meeting));
  window.replay.on('command', command => player.command(command));
  const state = await window.replay.init(); player.setMeeting(state.meeting);
  document.addEventListener('keydown', event => { const command = commandForKey(event); if (command) { event.preventDefault(); window.replay.command(command).catch(console.error); } });
} else {
  // Browser demo only: the operator preview is authoritative, this tab mirrors it.
  const view = new StageView(stage); const channel = new BroadcastChannel('isaszeg-replay-demo');
  channel.onmessage = ({ data }) => { if (data.type === 'frame') { const item = data.meeting.items.find(x => x.id === data.status.id); if (item) view.mirror(item, data.meeting, data.status); } };
  channel.postMessage({ type: 'hello' });
  document.addEventListener('keydown', event => { const command = commandForKey(event); if (command) { event.preventDefault(); if (command.type === 'fullscreen') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(console.error); } else channel.postMessage({ type: 'command', command }); } });
}
