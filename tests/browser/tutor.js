// The kids' guide as one long-lived page (learn/nav.js) and its tutor (learn/tutor/), on a
// scripted model. Run from the devtools of a room of the guide opened with ?dev=1 (the dev server
// serves /tests/), for example /learn/combat.html?dev=1#swing (a room with a demo on its first
// slide, and a next room):
// await (await import('/tests/browser/tutor.js')).runTutorChecks()
// It asks one question in the conversation (which stays in the panel), opens the game window
// (closed again at the end) and moves on to the next room.
const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, message, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end; await delay(50)) if (await test()) return;
  throw Error(message);
}

export async function runTutorChecks() {
  check(new URLSearchParams(location.search).has('dev'), 'Open the page with ?dev=1');
  const slides = [...document.querySelectorAll('main.deck section.slide')];
  check(slides.length > 1, 'Open a room of the guide');
  const room = location.pathname.split('/').pop(), next = document.querySelector('.qbar .door:last-child')?.getAttribute('href');
  check(next, 'Open a room that has a next room');
  window.__tutorCheck = true;   // a reload would lose it
  if (!window.learnTutor) document.querySelector('#tutor-btn').click();
  await until(() => window.learnTutor?.harness && document.querySelector('#tutor .log'), 'The tutor did not start');
  const T = window.learnTutor, P = T.pi, before = localStorage.getItem('kids.tutor.provider');
  localStorage.setItem('kids.tutor.provider', 'faux');
  try {
    const target = slides.at(-1).id;
    const demo = slides.find(s => s.classList.contains('current'))?.querySelector('[data-demo]');
    T.faux.setResponses([
      P.fauxAssistantMessage([P.fauxToolCall('read_slide', {}), ...(demo ? [P.fauxToolCall('look_at_demo', {})] : []), P.fauxToolCall('search_code', { query: 'export function' }),
        P.fauxToolCall('show_code', { ref: 'src/core/constants.js', lines: '1-6', focus: '2', note: 'the dice' })], { stopReason: 'toolUse' }),
      P.fauxAssistantMessage([P.fauxToolCall('navigate', { slide: target }), P.fauxToolCall('run_js', { code: 'return $$("section.slide").length;', show: true })], { stopReason: 'toolUse' }),
      P.fauxAssistantMessage([P.fauxToolCall('highlight', { selector: `#${target} h2`, note: 'here', seconds: 3 }), P.fauxToolCall('game', { action: 'open', seed: 7 })], { stopReason: 'toolUse' }),
      P.fauxAssistantMessage([P.fauxToolCall('run_js', { where: 'game', show: false, code: 'game.api.spawnEnemy("spider", 2); teach.lens("awareness"); await wait(200); return game.api.enemies.length;' }), P.fauxToolCall('look_at_game', {})], { stopReason: 'toolUse' }),
      P.fauxAssistantMessage([P.fauxToolCall('navigate', { room: next })], { stopReason: 'toolUse' }),
      P.fauxAssistantMessage(`What do you **guess**? Look at [the first slide](#${slides[0].id}).`),
    ]);
    const input = document.querySelector('#tutor textarea');
    input.value = 'browser check: how does this work?';
    document.querySelector('#tutor form.ask').requestSubmit();
    await until(() => T.faux.getPendingResponseCount() === 0 && !T.view.value.docs['pi.live']?.run, 'The scripted answer did not finish', 60000);
    await delay(300);

    const { entries } = T.view.value;
    const asked = entries.findLastIndex(e => e.kind === 'tutor.ask');
    check(entries[asked].data.text === 'browser check: how does this work?', 'The question is stored as the reader typed it');
    const sent = entries[asked].model[0].content;
    check(/^<page>\nwhere: room \d+\/\d+ /.test(typeof sent === 'string' ? sent : sent[0].text), 'The question carries the page');
    const results = entries.slice(asked).filter(e => e.kind === 'pi.tool-result').map(e => e.model[0]);
    check(results.every(r => !r.isError), 'A tool failed: ' + JSON.stringify(results.find(r => r.isError)?.content));
    // tools of one round run side by side, so their results come in any order
    const result = (name, i = 0) => results.filter(r => r.toolName === name)[i];
    const text = r => r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    check(/^Slide \d+\/\d+ of /.test(text(result('read_slide'))), 'read_slide reads the slide the reader is on');
    if (demo) check(result('look_at_demo').content.some(c => c.type === 'image'), 'look_at_demo takes a picture of the demo');
    check(/src\/\S+\.js:\d+:/.test(text(result('search_code'))), 'search_code finds the game\'s code');
    check(text(result('navigate')).includes(`#${target}`), 'navigate turned the page');
    check(text(result('run_js')) === `returned: ${slides.length}`, 'run_js runs in the page');
    check(/^returned: \d+$/.test(text(result('run_js', 1))) && +text(result('run_js', 1)).split(' ')[1] >= 1, 'run_js runs in the game');
    check(result('look_at_game').content.some(c => c.type === 'image') && /seed 7/.test(text(result('look_at_game'))), 'look_at_game sees the game');
    check(/lenses: awareness/.test(text(result('look_at_game'))), 'run_js has the game\'s teach helpers, and the Teacher sees what they show');
    check(location.pathname.endsWith('/' + next), 'navigate opened the next room');
    check(window.__tutorCheck, 'Moving to the next room did not reload the page');
    check(document.querySelector('#game-dock iframe')?.contentWindow.__game?.enemies.length >= 1, 'The game window stays open, with what happened in it');
    const log = document.querySelector('#tutor .log');
    check([...log.querySelectorAll('.ran pre')].at(-1)?.textContent.includes('section.slide'), 'Code the Teacher shows is in the conversation');
    const card = [...log.querySelectorAll('.shown')].at(-1);
    check(card?.querySelectorAll('.ln').length === 6 && card.querySelector('.ln.on i')?.textContent === '2' && card.querySelector('.cap')?.textContent === 'the dice', 'show_code puts the game\'s code in the panel');
    const answer = [...log.querySelectorAll('.msg.guide')].at(-1);
    check(answer?.querySelector(`a[data-slide="${slides[0].id}"]`), 'The answer links to the slide');
    check(answer.querySelector('b')?.textContent === 'guess', 'The answer is drawn as Markdown');
    check(localStorage.getItem('kids.tutor.busy') === null, 'The busy flag is cleared once the tutor is idle');
    return 'tutor checks passed';
  } finally {
    if (before) localStorage.setItem('kids.tutor.provider', before); else localStorage.removeItem('kids.tutor.provider');
    document.querySelector('#game-dock .x')?.click();
    delete window.__tutorCheck;
    if (!location.pathname.endsWith('/' + room)) history.back();
  }
}
