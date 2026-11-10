// Assemble les nouveautés (compteur de lectures, personnages, chapitre, sondage) pour l'application.
import { createCounterUI } from './counter-ui.js?v=7';
import { createCharactersUI } from './characters-ui.js?v=7';
import { createChapterUI } from './chapter-ui.js?v=7';
import { createPollUI } from './poll-ui.js?v=7';

export function createCountersAndAtelier(deps) {
  const counter = createCounterUI(deps);
  const characters = createCharactersUI(deps);
  const chapter = createChapterUI(deps);
  const poll = createPollUI(deps);
  return {
    counter, characters, chapter, poll,
    // Chapitre et sondage sont publics ; personnages et liens réservés à l'auteure.
    async load(owner) {
      await Promise.all([chapter.load(), poll.load(), owner ? characters.load() : Promise.resolve()]);
    },
  };
}
