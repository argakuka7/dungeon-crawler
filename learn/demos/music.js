// The game's real music player (src/audio/music.js) and score reader (src/audio/score.js):
// pick a song and a mood, and hear voices join and leave like they do in the game.
import { playSong, setMood, setMusicEnabled, musicInfo } from '../../src/audio/music.js';
import { loadScore, MOODS } from '../../src/audio/score.js';
import { SONGS } from '../../src/themes/index.js';
import { loop, html, t as tr } from '../deck.js';

const WHEN = () => tr({
  explore: 'nothing going on', treasure: 'a treasure chest is close', sense: 'a monster is near, but not after you',
  rise: 'a monster is chasing you from afar', fight: 'a monster is after you and close, or blows were just traded', boss: 'a guardian is after you',
}, {
  explore: 'nichts los', treasure: 'eine Schatztruhe ist nah', sense: 'ein Monster ist nah, aber nicht hinter dir her',
  rise: 'ein Monster jagt dich von weitem', fight: 'ein Monster ist hinter dir her und nah, oder es gab gerade Schläge', boss: 'ein Wächter ist hinter dir her',
});

export default function mount(el) {
  const row = html(el, `<div><div class="row"><label>${tr('song', 'Lied')} <select class="song">${SONGS.map(s => `<option ${s === 'overworld' ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <button class="play">${tr('Play', 'Abspielen')}</button><button class="stop">${tr('Stop', 'Stopp')}</button></div>
    <div class="row moods">${MOODS.map(m => `<button data-m="${m}" title="${WHEN()[m]}">${m}</button>`).join('')}</div></div>`);
  const voicesBox = html(el, '<div class="row voices"></div>');
  const out = html(el, `<div class="out">${tr('Press Play, then switch moods while it plays.', 'Drück Abspielen und wechsle dann die Stimmung, während es spielt.')}</div>`);
  const $ = s => row.querySelector(s);
  let score = null, mood = 'explore', playing = false;
  async function load(name) {
    const text = await (await fetch(new URL(`../../music/${name}.scrim`, import.meta.url))).text();
    score = loadScore(text);
    voicesBox.innerHTML = score.song.voices.map(v => `<span class="chip" data-v="${v.name}">${v.name} <small style="color:#5a6678">${v.inst ?? ''}</small></span>`).join('');
  }
  function setOn(m) {
    mood = m; setMood(m);
    row.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  }
  $('.play').onclick = async () => {
    // switch the player on (the game's saved music setting is game/settings.js's: untouched)
    setMusicEnabled(true);
    await load($('.song').value);
    playSong($('.song').value); setOn(mood); playing = true;
  };
  $('.stop').onclick = () => { playSong(null); playing = false; };
  $('.song').onchange = async () => { await load($('.song').value); if (playing) playSong($('.song').value); };
  row.querySelectorAll('[data-m]').forEach(b => b.onclick = () => setOn(b.dataset.m));
  setOn('explore');
  load($('.song').value);
  loop(el, () => {
    if (!score) return;
    const info = musicInfo(), on = new Set(playing ? info.voices : []), planned = new Set([...score.moods[mood]].map(i => score.song.voices[i].name));
    voicesBox.querySelectorAll('[data-v]').forEach(ch => {
      const v = ch.dataset.v;
      ch.style.borderColor = on.has(v) ? '#ff8a2a' : planned.has(v) ? '#6a5a30' : '';
      ch.style.color = on.has(v) ? '#fff' : planned.has(v) ? '#c9a46a' : '#5a6678';
    });
    out.innerHTML = playing
      ? (info.playing ? tr(`<b>${info.playing}</b>, mood <b>${mood}</b> (${WHEN()[mood]}): <b>${on.size}</b> of ${score.song.voices.length} voices playing.`,
        `<b>${info.playing}</b>, Stimmung <b>${mood}</b> (${WHEN()[mood]}): <b>${on.size}</b> von ${score.song.voices.length} Stimmen spielen.`) : tr('starting\u2026', 'startet\u2026'))
      : tr(`mood <b>${mood}</b> uses: ${[...planned].join(', ')}. Press Play to hear it.`, `Stimmung <b>${mood}</b> benutzt: ${[...planned].join(', ')}. Drück Abspielen, um sie zu hören.`);
  });
  // leaving the room stops the song
  return () => { if (playing) playSong(null); };
}
