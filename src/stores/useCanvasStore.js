import { ref, reactive, watch, toRaw } from 'vue'
import defaultData from '../../public/思维链-2026-05-20.json'

const STORAGE_KEY = 'mindlink-canvas-data'
const STORAGE_VERSION = 2
const SAVE_DEBOUNCE = 300

function createDocData(name = '默认文档') {
  return {
    id: crypto.randomUUID(),
    name,
    cards: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    bgColor: '#fce4ec'
  }
}

export function useCanvasStore() {
  const docs = reactive([])
  const activeDocId = ref(null)
  const cards = reactive([])
  const connections = reactive([])
  const viewport = reactive({ x: 0, y: 0, zoom: 1 })
  const selectedCardId = ref(null)
  const connectingFrom = ref(null)
  const connectingType = ref('default')
  const bgColor = ref('#fce4ec')
  const draggingCardId = ref(null)

  const activeDoc = () => docs.find(d => d.id === activeDocId.value)

  function syncToDoc() {
    const doc = activeDoc()
    if (!doc) return
    doc.cards = structuredClone(toRaw(cards))
    doc.connections = structuredClone(toRaw(connections))
    doc.viewport = { ...viewport }
    doc.bgColor = bgColor.value
  }

  function syncFromDoc() {
    const doc = activeDoc()
    if (!doc) return
    cards.splice(0, cards.length, ...(doc.cards || []))
    connections.splice(0, connections.length, ...(doc.connections || []))
    if (doc.viewport) {
      viewport.x = doc.viewport.x
      viewport.y = doc.viewport.y
      viewport.zoom = doc.viewport.zoom
    }
    bgColor.value = doc.bgColor || '#fce4ec'
  }

  function switchDoc(docId) {
    if (docId === activeDocId.value) return
    syncToDoc()
    activeDocId.value = docId
    syncFromDoc()
    selectedCardId.value = null
    connectingFrom.value = null
    connectingType.value = 'default'
  }

  function addDoc(name) {
    const doc = createDocData(name)
    docs.push(doc)
    switchDoc(doc.id)
    return doc.id
  }

  function removeDoc(docId) {
    if (docs.length <= 1) return
    const idx = docs.findIndex(d => d.id === docId)
    if (idx === -1) return
    docs.splice(idx, 1)
    if (activeDocId.value === docId) {
      activeDocId.value = docs[Math.min(idx, docs.length - 1)].id
      syncFromDoc()
      selectedCardId.value = null
      connectingFrom.value = null
    }
  }

  function renameDoc(docId, newName) {
    const doc = docs.find(d => d.id === docId)
    if (doc && newName.trim()) {
      doc.name = newName.trim()
    }
  }

  function addCard(card) {
    cards.push(card)
  }

  function updateCard(id, updates) {
    const card = cards.find(c => c.id === id)
    if (card) {
      for (const key in updates) {
        card[key] = updates[key]
      }
    }
  }

  function removeCard(id) {
    const idx = cards.findIndex(c => c.id === id)
    if (idx !== -1) cards.splice(idx, 1)
    const connIdxs = connections
      .map((c, i) => (c.from === id || c.to === id ? i : -1))
      .filter(i => i !== -1)
      .sort((a, b) => b - a)
    connIdxs.forEach(i => connections.splice(i, 1))
  }

  function duplicateCard(id) {
    const card = cards.find(c => c.id === id)
    if (!card) return
    const newCard = {
      ...structuredClone(toRaw(card)),
      id: crypto.randomUUID(),
      x: card.x + 30,
      y: card.y + 30
    }
    cards.push(newCard)
    return newCard.id
  }

  function addConnection(from, to, type = 'default') {
    if (from === to) return
    const exists = connections.some(c =>
      (c.from === from && c.to === to) || (c.from === to && c.to === from)
    )
    if (exists) return
    connections.push({ id: crypto.randomUUID(), from, to, type })
  }

  function removeConnection(id) {
    const idx = connections.findIndex(c => c.id === id)
    if (idx !== -1) connections.splice(idx, 1)
  }

  function bringToFront(id) {
    const maxZ = cards.reduce((m, c) => Math.max(m, c.zIndex || 0), 0)
    updateCard(id, { zIndex: maxZ + 1 })
  }

  function sendToBack(id) {
    const minZ = cards.reduce((m, c) => Math.min(m, c.zIndex || 0), 0)
    updateCard(id, { zIndex: minZ - 1 })
  }

  function save() {
    syncToDoc()
    const data = {
      version: STORAGE_VERSION,
      docs: structuredClone(toRaw(docs)),
      activeDocId: activeDocId.value
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, data not saved')
      }
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        const doc = createDocData(defaultData.name || '默认文档')
        doc.cards = defaultData.cards || []
        doc.connections = defaultData.connections || []
        doc.viewport = defaultData.viewport || { x: 0, y: 0, zoom: 1 }
        doc.bgColor = defaultData.bgColor || '#fce4ec'
        docs.push(doc)
        activeDocId.value = doc.id
        syncFromDoc()
        return
      }
      const data = JSON.parse(raw)
      if (data.version === 1 && data.cards) {
        const doc = createDocData()
        doc.cards = data.cards || []
        doc.connections = data.connections || []
        doc.viewport = data.viewport || { x: 0, y: 0, zoom: 1 }
        doc.bgColor = data.bgColor || '#fce4ec'
        docs.push(doc)
        activeDocId.value = doc.id
      } else if (data.version >= 2 && data.docs) {
        docs.splice(0, docs.length, ...data.docs)
        activeDocId.value = data.activeDocId || (docs[0] && docs[0].id)
      } else {
        const doc = createDocData()
        docs.push(doc)
        activeDocId.value = doc.id
      }
      syncFromDoc()
    } catch (e) {
      console.error('Failed to load canvas data:', e)
      const doc = createDocData()
      docs.push(doc)
      activeDocId.value = doc.id
    }
  }

  let saveTimer = null
  watch([cards, connections, viewport, bgColor, docs, activeDocId], () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, SAVE_DEBOUNCE)
  }, { deep: true })

  load()

  return {
    docs,
    activeDocId,
    cards,
    connections,
    viewport,
    selectedCardId,
    connectingFrom,
    connectingType,
    bgColor,
    draggingCardId,
    addCard,
    updateCard,
    removeCard,
    duplicateCard,
    addConnection,
    removeConnection,
    bringToFront,
    sendToBack,
    switchDoc,
    addDoc,
    removeDoc,
    renameDoc,
    save,
    load
  }
}
