import { mountPodcastEditor } from '../../templates/podcast/editor.js'
import { EPISODE, INITIAL_DOCUMENTS } from '../lib/podcast-data.js'

mountPodcastEditor(document.querySelector('.podcast'), {
  value: { source: new Map(INITIAL_DOCUMENTS).get(EPISODE), documents: Object.fromEntries(INITIAL_DOCUMENTS.filter(([name]) => name !== EPISODE)) },
  storageKey: 'mdlib-podcast-sample-v2',
  reset: true,
})
