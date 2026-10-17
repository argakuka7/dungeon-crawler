// The tutor's agent, on pi-durable: every question, answer and tool call is saved (files.js,
// in the browser) before it shows. The guide is one long-lived page (nav.js), so an answer runs on
// while the reader moves between rooms; if the page is reloaded or closed in the middle of one,
// the next page finishes it.
//
// One conversation (the harness's root) for the whole guide. Each question is a "tutor.ask" entry
// with the reader's words and the snapshot of the page that went with them (state.js). The
// "tutor.notebook" outlives starting over: what the tutor noted about the reader.
import { AgentDoc, Harness, JsonlStorage, createRegistry, defineDoc, defineExtension, section } from '../../vendor/pi-durable/pi-durable.js';
import { TEACHER, notebookSection } from './prompt.js';
import { createTools } from './tools.js';
import * as page from './page.js';
import { DECKS, local } from '../decks.js';

export const NotebookDoc = defineDoc({ kind: 'tutor.notebook', version: 1, scope: 'session', initial: () => ({ notes: [] }) });
const MAX_NOTES = 40;
export const THINKING = 'low';

export function guideExtension({ lang = page.pageLang() } = {}) {
  const addNote = (api, room, text, context) => api.commit(async tx => {
    const book = await tx.doc(NotebookDoc);
    if (book.notes.some(n => n.text === text)) return;
    book.notes.push({ room, text });
    if (book.notes.length > MAX_NOTES) book.notes.splice(0, book.notes.length - MAX_NOTES);
  }, context);
  return defineExtension({
    name: 'guide',
    sections: [
      section('guide', () => TEACHER, { tag: false }),
      section('rooms', () => 'The rooms of the guide, in order (link as file#slide-id):\n' + DECKS.map((d, i) => `${i + 1}. ${d.file}: ${local(d, lang).title} (${local(d, lang).teaser})`).join('\n') + '\nAlso index.html (the map) and words.html (the glossary).'),
      section('notebook', async (input, context) => notebookSection((await input.read.snapshot(NotebookDoc, context))?.notes ?? [])),
    ],
    tools: createTools({ addNote, lang }),
  });
}

// open the tutor over a file system (files.js) and a model collection (models.js)
export async function openTutor({ files, models, context, lang = page.pageLang(), onReport = e => console.warn('tutor:', e) }) {
  const registry = createRegistry();
  registry.install(guideExtension({ lang }));
  const storage = await JsonlStorage.open('/tutor', files, context);
  const harness = await Harness.open(storage, {
    models, registry, onReport,
    settings: { progress: { partialIntervalMs: 120, outputIntervalMs: 250 }, retry: { maxRetries: 2 }, stream: { timeoutMs: 120_000 } },
  }, context);
  harness.resume();   // finish whatever a page that closed left running
  const conversation = await harness.root(context);
  const view = await conversation.viewState(context);   // the active transcript, kept up to date

  // the page snapshot the last question carried, so the next one only sends what changed (after
  // starting over there is none, so the next one tells everything again)
  const lastPage = () => view.value.entries.findLast(e => e.kind === 'tutor.ask')?.data?.page ?? null;

  // ask a question; `snapshot(last)` makes the page block (state.js pageState)
  async function ask(text, snapshot, model) {
    const agent = await harness.snapshot(AgentDoc, conversation.id, context);
    if (model && (agent?.model?.provider !== model.provider || agent?.model?.modelId !== model.modelId || agent?.thinkingLevel !== THINKING))
      await conversation.configure({ model, thinkingLevel: THINKING }, context);
    const pageState = snapshot(lastPage());
    return conversation.submit({
      type: 'input',
      content: `${pageState.text}\n${text}`,
      entry: { kind: 'tutor.ask', data: { text, page: pageState.data } },
    }, context);
  }

  const notes = async () => (await harness.snapshot(NotebookDoc, context))?.notes ?? [];
  return { harness, conversation, view, ask, notes };
}
