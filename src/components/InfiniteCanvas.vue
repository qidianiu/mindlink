<template>
  <div
    class="infinite-canvas"
    ref="canvasRef"
    :style="{ background: bgColor }"
    @wheel="handleWheel"
    @mousedown="handleCanvasMouseDown"
    @mouseup="handleCanvasMouseUp"
    @mousemove="handleCanvasMouseMove"
    @dblclick="handleDblClick"
    @contextmenu.prevent
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <svg class="connections-layer">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#999" />
        </marker>
      </defs>
      <g
        v-for="conn in connections"
        :key="conn.id"
        class="connection-group"
        @click.stop="removeConnection(conn.id)"
      >
        <path
          :d="getConnectionPath(conn)"
          fill="none"
          stroke="transparent"
          stroke-width="16"
          class="connection-line-hitbox"
        />
        <path
          :d="getConnectionPath(conn)"
          fill="none"
          :stroke="conn.type === 'alt' ? '#2196f3' : '#e91e63'"
          stroke-width="2"
          stroke-dasharray="6 3"
          marker-end="url(#arrowhead)"
          class="connection-line"
        />
      </g>
      <line
        v-if="connectingFrom"
        :x1="connectingFromPos.x"
        :y1="connectingFromPos.y"
        :x2="mousePos.x"
        :y2="mousePos.y"
        :stroke="connectingType === 'alt' ? '#2196f3' : '#e91e63'"
        stroke-width="2"
        stroke-dasharray="4 4"
      />
      <line
        v-for="guide in alignGuides"
        :key="guide.id"
        :x1="guide.x1"
        :y1="guide.y1"
        :x2="guide.x2"
        :y2="guide.y2"
        :stroke="guide.color"
        stroke-width="1"
        stroke-dasharray="4 3"
        class="guide-line"
      />
    </svg>

    <div class="cards-layer" :style="cardsLayerStyle">
      <CardNode
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :zoom="viewport.zoom"
        :selected="selectedCardId === card.id"
        :connecting="canConnectTo(card.id)"
        :connect-type="connectingType"
        :in-connect-mode="!!connectingFrom"
        :card-number="cardNumbers[card.id] || '0'"
        :default-conn-count="getDefaultConnCount(card.id)"
        :is-chain-middle="isChainMiddleNode(card.id)"
        @select="handleSelect"
        @update="handleCardUpdate"
        @delete="removeCard"
        @duplicate="duplicateCard"
        @bring-to-front="bringToFront"
        @send-to-back="sendToBack"
        @start-connect="handleStartConnect"
        @end-connect="handleEndConnect"
        @drag-start="draggingCardId = $event"
        @drag-end="handleDragEnd"
        @resize-end="handleResizeEnd"
        @move-card="handleMoveCard"
        @start-chain-drag="handleStartChainDrag"
        @layout-chain="handleLayoutChain"
      />
    </div>

    <div class="top-left-bar">
      <div class="account-panel">
        <div class="account-icon"><i class="bi bi-person-circle"></i></div>
        <div class="account-menu" @mousedown.stop>
          <div class="account-menu-item" @click="exportData" title="导出数据"><i class="bi bi-box-arrow-up"></i></div>
          <div class="account-menu-item" @click="triggerImport" title="导入数据"><i class="bi bi-box-arrow-in-down"></i></div>
        </div>
      </div>

      <div class="doc-panel" @mouseenter="docPanelExpanded = true" @mouseleave="handleDocPanelLeave" @wheel.stop>
        <div class="doc-panel-header">
          <i class="bi bi-file-earmark-text"></i>
          <span class="doc-panel-title">{{ activeDocName }}</span>
          <i class="bi bi-chevron-down doc-panel-arrow" :class="{ 'doc-panel-arrow-expanded': docPanelExpanded }"></i>
        </div>
        <div class="doc-list" :class="{ 'doc-list-expanded': docPanelExpanded }">
          <div
            v-for="doc in docs"
            :key="doc.id"
            class="doc-item"
            :class="{ 'doc-item-active': doc.id === activeDocId }"
            @click.stop="switchDoc(doc.id)"
          >
            <template v-if="editingDocId === doc.id">
              <input
                ref="docRenameInput"
                class="doc-rename-input"
                v-model="docRenameValue"
                @keydown.enter.prevent="confirmDocRename"
                @blur="confirmDocRename"
                @mousedown.stop
              />
            </template>
            <template v-else>
              <template v-if="confirmDeleteDocId === doc.id">
                <span class="doc-delete-confirm-text">确认删除？</span>
                <button class="doc-item-delete-confirm" @mousedown.stop @click.stop="doRemoveDoc(doc.id)" title="确认"><i class="bi bi-check-lg"></i></button>
                <button class="doc-item-delete-cancel" @mousedown.stop @click.stop="confirmDeleteDocId = null" title="取消"><i class="bi bi-x-lg"></i></button>
              </template>
              <template v-else>
                <i class="bi bi-file-earmark doc-item-icon"></i>
                <span class="doc-item-name">{{ doc.name }}</span>
                <button class="doc-item-edit" @mousedown.stop @click.stop="startDocRename(doc)" title="重命名"><i class="bi bi-pencil"></i></button>
                <button v-if="docs.length > 1" class="doc-item-delete" @mousedown.stop @click.stop="confirmDeleteDocId = doc.id" title="删除"><i class="bi bi-x"></i></button>
              </template>
            </template>
          </div>
        </div>
        <div class="doc-add-area" :class="{ 'doc-add-area-expanded': docPanelExpanded }">
          <div v-if="showNewDocInput" class="doc-item doc-item-new">
            <input
              ref="newDocInputRef"
              class="doc-rename-input"
              v-model="newDocName"
              placeholder="输入文档名称"
              @keydown.enter.prevent="confirmNewDoc"
              @blur="cancelNewDoc"
              @mousedown.stop
            />
          </div>
          <button v-else class="doc-add-btn" @mousedown.stop @click.stop="startNewDoc" title="新建文档"><i class="bi bi-plus-lg"></i> 新建文档</button>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <button class="transition-bounce" @click="addNewCard" title="添加卡片"><i class="bi bi-plus-lg"></i></button>
      <button class="transition-bounce" @click="centerViewport" title="居中定位"><i class="bi bi-arrows-fullscreen"></i></button>
      <div class="bg-picker-wrap">
        <button class="transition-bounce" @click="showBgPicker = !showBgPicker" title="背景颜色"><i class="bi bi-palette"></i></button>
        <div v-if="showBgPicker" class="bg-picker anim-pop-in" @mousedown.stop>
          <div
            v-for="c in bgColors"
            :key="c.value"
            class="bg-option transition-all"
            :class="{ active: bgColor === c.value }"
            :style="{ background: c.value }"
            :title="c.label"
            @click="bgColor = c.value; showBgPicker = false"
          >
            <span class="bg-option-label">{{ c.label }}</span>
          </div>
        </div>
      </div>
      <span class="zoom-label">{{ Math.round(viewport.zoom * 100) }}%</span>
      <button class="transition-bounce" @click="enterPresentMode" title="演示模式"><i class="bi bi-easel"></i></button>
      <input ref="importInputRef" type="file" accept=".json" class="import-input" @change="importData" />
      <div class="clear-wrap">
        <button class="transition-bounce" @click="handleClearAll" title="清空所有节点"><i class="bi bi-trash3"></i></button>
        <div v-if="showClearConfirm" class="clear-confirm anim-pop-in" @mousedown.stop>
          <span class="clear-confirm-text">确认清空所有卡片？</span>
          <button class="clear-confirm-btn" @click="confirmClear"><i class="bi bi-check-circle"></i></button>
          <button class="clear-confirm-btn cancel" @click="showClearConfirm = false"><i class="bi bi-x-circle"></i></button>
        </div>
      </div>
    </div>

    <div class="minimap" @mousedown.stop.prevent="handleMinimapDown" @touchstart.stop.prevent="handleMinimapTouchStart" @touchmove.stop.prevent="handleMinimapTouchMove" @touchend.stop.prevent="handleMinimapTouchEnd">
      <canvas ref="minimapRef" class="minimap-canvas" />
      <div class="minimap-viewport" :style="minimapViewportStyle" />
    </div>

    <Teleport to="body">
      <div v-if="presentMode" class="present-overlay" @keydown="handleKeydown">
        <div class="present-container" :class="presentTransition">
          <div v-if="presentCard" class="present-card" :class="presentTransition" :key="presentIndex">
            <div class="present-card-inner">
              <div v-if="presentCard.title" class="present-title">{{ presentCard.title }}</div>
              <div v-if="presentCard.text" class="present-text">{{ presentCard.text }}</div>
              <div v-if="!presentCard.title && !presentCard.text" class="present-text present-placeholder">（空卡片）</div>
            </div>
            <div class="present-number">#{{ cardNumbers[presentCard.id] || '0' }}</div>
          </div>
          <div class="present-nav">
            <button class="present-nav-btn" :disabled="presentIndex === 0" @click="presentPrev" @mouseenter="presentHover = 'prev'" @mouseleave="presentHover = ''"><i class="bi bi-chevron-left"></i></button>
            <div v-if="presentHover === 'prev' && presentPrevCard" class="present-preview present-preview-left">
              <div v-if="presentPrevCard.title" class="present-preview-title">{{ presentPrevCard.title }}</div>
              <div v-if="presentPrevCard.text" class="present-preview-text">{{ presentPrevCard.text }}</div>
            </div>
            <span class="present-page">{{ presentIndex + 1 }} / {{ presentTotal }}</span>
            <button class="present-nav-btn" :disabled="presentIndex >= presentTotal - 1" @click="presentNext" @mouseenter="presentHover = 'next'" @mouseleave="presentHover = ''"><i class="bi bi-chevron-right"></i></button>
            <div v-if="presentHover === 'next' && presentNextCard" class="present-preview present-preview-right">
              <div v-if="presentNextCard.title" class="present-preview-title">{{ presentNextCard.title }}</div>
              <div v-if="presentNextCard.text" class="present-preview-text">{{ presentNextCard.text }}</div>
            </div>
          </div>
          <button class="present-close" @click="exitPresentMode"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, toRaw, nextTick } from 'vue'
import { useCanvasStore } from '../stores/useCanvasStore.js'
import CardNode from './CardNode.vue'

const {
  docs,
  activeDocId,
  cards,
  connections,
  viewport,
  selectedCardId,
  connectingFrom,
  connectingType,
  bgColor,
  addCard,
  updateCard,
  removeCard,
  duplicateCard,
  addConnection,
  removeConnection,
  bringToFront,
  sendToBack,
  draggingCardId,
  switchDoc,
  addDoc,
  removeDoc,
  renameDoc
} = useCanvasStore()

const bgColors = [
  { label: '樱花粉', value: '#fce4ec' },
  { label: '薄荷绿', value: '#e0f2f1' },
  { label: '天空蓝', value: '#e3f2fd' },
  { label: '暖杏色', value: '#fff3e0' },
  { label: '薰衣草', value: '#ede7f6' },
  { label: '奶油白', value: '#fffde7' },
  { label: '珊瑚橙', value: '#fbe9e7' },
  { label: '纯净白', value: '#ffffff' },
  { label: '浅灰', value: '#f5f5f5' },
  { label: '深空灰', value: '#263238' }
]
const showBgPicker = ref(false)
const showClearConfirm = ref(false)

const docPanelExpanded = ref(false)
const showNewDocInput = ref(false)
const newDocName = ref('')
const newDocInputRef = ref(null)
const editingDocId = ref(null)
const docRenameValue = ref('')
const docRenameInput = ref(null)
const confirmDeleteDocId = ref(null)

const activeDocName = computed(() => {
  const doc = docs.find(d => d.id === activeDocId.value)
  return doc ? doc.name : ''
})

function handleDocPanelLeave() {
  if (!editingDocId.value && !showNewDocInput.value) {
    docPanelExpanded.value = false
  }
}

function startNewDoc() {
  showNewDocInput.value = true
  newDocName.value = ''
  nextTick(() => {
    if (newDocInputRef.value && newDocInputRef.value[0]) {
      newDocInputRef.value[0].focus()
    } else if (newDocInputRef.value) {
      newDocInputRef.value.focus()
    }
  })
}

function confirmNewDoc() {
  const name = newDocName.value.trim()
  if (name) {
    addDoc(name)
  }
  showNewDocInput.value = false
  newDocName.value = ''
}

function cancelNewDoc() {
  showNewDocInput.value = false
  newDocName.value = ''
}

function startDocRename(doc) {
  editingDocId.value = doc.id
  docRenameValue.value = doc.name
  nextTick(() => {
    if (docRenameInput.value && docRenameInput.value[0]) {
      docRenameInput.value[0].focus()
      docRenameInput.value[0].select()
    } else if (docRenameInput.value) {
      docRenameInput.value.focus()
      docRenameInput.value.select()
    }
  })
}

function confirmDocRename() {
  if (editingDocId.value && docRenameValue.value.trim()) {
    renameDoc(editingDocId.value, docRenameValue.value)
  }
  editingDocId.value = null
  docRenameValue.value = ''
}

function doRemoveDoc(docId) {
  removeDoc(docId)
  confirmDeleteDocId.value = null
}

const presentMode = ref(false)
const presentIndex = ref(0)
const presentOrder = ref([])
const presentTransition = ref('')
const presentHover = ref('')

const canvasRef = ref(null)
const minimapRef = ref(null)
const importInputRef = ref(null)
const isPanning = ref(false)
const panStart = reactive({ x: 0, y: 0 })
const mousePos = reactive({ x: 0, y: 0 })

import { reactive } from 'vue'

const cardsLayerStyle = computed(() => ({
  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  transformOrigin: '0 0'
}))

const cardNumbers = computed(() => {
  const result = {}
  if (cards.length === 0) return result

  const parentMap = {}
  const childrenMap = {}
  const siblingNext = {}
  const connectedCards = new Set()

  connections.forEach(c => {
    connectedCards.add(c.from)
    connectedCards.add(c.to)
    if (c.type === 'alt') {
      parentMap[c.to] = c.from
      if (!childrenMap[c.from]) childrenMap[c.from] = []
      childrenMap[c.from].push(c.to)
    } else {
      if (!siblingNext[c.from]) siblingNext[c.from] = []
      siblingNext[c.from].push(c.to)
    }
  })

  cards.forEach(card => {
    if (!connectedCards.has(card.id)) {
      result[card.id] = '0'
    }
  })

  const visited = new Set()

  const getConnectedComponent = (startId) => {
    const component = new Set()
    const queue = [startId]
    while (queue.length > 0) {
      const id = queue.shift()
      if (component.has(id)) continue
      component.add(id)
      connections.forEach(c => {
        if (c.from === id && !component.has(c.to)) queue.push(c.to)
        if (c.to === id && !component.has(c.from)) queue.push(c.from)
      })
    }
    return component
  }

  const getCardPos = (id) => {
    const card = cards.find(c => c.id === id)
    return card ? { x: card.x, y: card.y } : { x: 0, y: 0 }
  }

  const sortByPos = (a, b) => {
    const posA = getCardPos(a)
    const posB = getCardPos(b)
    const dx = posA.x - posB.x
    const dy = posA.y - posB.y
    if (dx <= -30) return -1
    if (dx >= 30) return 1
    if (dy <= -30) return -1
    if (dy >= 30) return 1
    return dx !== 0 ? dx : dy
  }

  const getChainOrder = (ids) => {
    const order = []
    const localVisited = new Set()
    const inDegree = {}
    ids.forEach(id => {
      inDegree[id] = 0
    })
    ids.forEach(from => {
      const nexts = siblingNext[from] || []
      nexts.forEach(to => {
        if (ids.includes(to)) {
          inDegree[to] = (inDegree[to] || 0) + 1
        }
      })
    })

    const hasAnyConnection = ids.some(id => (siblingNext[id] || []).some(nid => ids.includes(nid)))

    let queue = ids.filter(id => inDegree[id] === 0)

    if (!hasAnyConnection && queue.length > 1) {
      queue.sort(sortByPos)
    }

    while (queue.length > 0) {
      const id = queue.shift()
      if (localVisited.has(id)) continue
      localVisited.add(id)
      order.push(id)
      const nexts = siblingNext[id] || []
      const newCandidates = []
      nexts.forEach(next => {
        if (ids.includes(next) && !localVisited.has(next)) {
          inDegree[next]--
          if (inDegree[next] === 0) {
            newCandidates.push(next)
          }
        }
      })
      if (newCandidates.length > 0) {
        queue = [...queue, ...newCandidates]
      }
    }

    const remaining = ids.filter(id => !localVisited.has(id))
    if (remaining.length > 1 && !hasAnyConnection) {
      remaining.sort(sortByPos)
    }
    order.push(...remaining)

    return order
  }

  const processNode = (id, pNum, childIdx) => {
    if (visited.has(id)) return
    visited.add(id)

    const children = (childrenMap[id] || []).filter(cid => !visited.has(cid))
    const childOrder = getChainOrder(children)
    let cNum = 1
    childOrder.forEach(childId => {
      result[childId] = `${pNum}.${cNum}`
      cNum++
      processNode(childId, result[childId])
    })
  }

  connectedCards.forEach(cardId => {
    if (visited.has(cardId)) return

    const component = getConnectedComponent(cardId)
    const rootIds = Array.from(component).filter(id => !parentMap[id])
    const rootOrder = getChainOrder(rootIds)

    let rootNum = 1
    rootOrder.forEach(id => {
      if (!visited.has(id)) {
        result[id] = `${rootNum}`
        rootNum++
        processNode(id, result[id])
      }
    })
  })

  return result
})

const connectingFromPos = computed(() => {
  if (!connectingFrom.value) return { x: 0, y: 0 }
  const card = cards.find(c => c.id === connectingFrom.value)
  if (!card) return { x: 0, y: 0 }
  return {
    x: (card.x + card.width / 2) * viewport.zoom + viewport.x,
    y: (card.y + card.height / 2) * viewport.zoom + viewport.y
  }
})

function handleWheel(e) {
  const target = e.target
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
    return
  }
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(0.1, Math.min(5, viewport.zoom * delta))
  const rect = canvasRef.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  viewport.x = mx - (mx - viewport.x) * (newZoom / viewport.zoom)
  viewport.y = my - (my - viewport.y) * (newZoom / viewport.zoom)
  viewport.zoom = newZoom
}

function handleCanvasMouseDown(e) {
  showBgPicker.value = false
  showClearConfirm.value = false
  if (e.target === canvasRef.value || e.target.classList.contains('connections-layer') || e.target.tagName === 'path') {
    if (e.button === 0) {
      isPanning.value = true
      panStart.x = e.clientX - viewport.x
      panStart.y = e.clientY - viewport.y
      selectedCardId.value = null
      connectingFrom.value = null
      connectingType.value = 'default'
    }
  }
}

function handleCanvasMouseMove(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  mousePos.x = e.clientX - rect.left
  mousePos.y = e.clientY - rect.top
  if (isPanning.value) {
    viewport.x = e.clientX - panStart.x
    viewport.y = e.clientY - panStart.y
  }
}

function handleCanvasMouseUp() {
  isPanning.value = false
}

const touchState = reactive({
  active: false,
  mode: 'none',
  startViewportX: 0,
  startViewportY: 0,
  startZoom: 1,
  startDist: 0,
  startCenterX: 0,
  startCenterY: 0,
  startX: 0,
  startY: 0,
  moved: false,
  tapTimer: null
})

function getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function getTouchCenter(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  }
}

function handleTouchStart(e) {
  const touches = e.touches
  touchState.moved = false

  if (touches.length === 1) {
    touchState.mode = 'pan'
    touchState.startX = touches[0].clientX
    touchState.startY = touches[0].clientY
    touchState.startViewportX = viewport.x
    touchState.startViewportY = viewport.y
  } else if (touches.length === 2) {
    touchState.mode = 'pinch'
    touchState.startDist = getTouchDist(touches[0], touches[1])
    const center = getTouchCenter(touches[0], touches[1])
    touchState.startCenterX = center.x
    touchState.startCenterY = center.y
    touchState.startViewportX = viewport.x
    touchState.startViewportY = viewport.y
    touchState.startZoom = viewport.zoom
  }
}

function handleTouchMove(e) {
  const touches = e.touches
  touchState.moved = true

  if (touchState.mode === 'pan' && touches.length === 1) {
    const dx = touches[0].clientX - touchState.startX
    const dy = touches[0].clientY - touchState.startY
    viewport.x = touchState.startViewportX + dx
    viewport.y = touchState.startViewportY + dy
    const rect = canvasRef.value.getBoundingClientRect()
    mousePos.x = touches[0].clientX - rect.left
    mousePos.y = touches[0].clientY - rect.top
  } else if (touchState.mode === 'pinch' && touches.length === 2) {
    const dist = getTouchDist(touches[0], touches[1])
    const scale = dist / touchState.startDist
    const newZoom = Math.max(0.1, Math.min(5, touchState.startZoom * scale))
    const rect = canvasRef.value.getBoundingClientRect()
    const cx = touchState.startCenterX - rect.left
    const cy = touchState.startCenterY - rect.top
    const ratio = newZoom / touchState.startZoom
    viewport.x = cx - (cx - touchState.startViewportX) * ratio
    viewport.y = cy - (cy - touchState.startViewportY) * ratio
    viewport.zoom = newZoom
  }
}

function handleTouchEnd(e) {
  if (touchState.mode === 'pan' && !touchState.moved && e.changedTouches.length === 1) {
    const touch = e.changedTouches[0]
    const target = document.elementFromPoint(touch.clientX, touch.clientY)
    if (target && (target === canvasRef.value || target.classList?.contains('connections-layer') || target.tagName === 'path' || target.tagName === 'svg')) {
      if (touchState.tapTimer) {
        clearTimeout(touchState.tapTimer)
        touchState.tapTimer = null
        handleTouchDblClick(touch)
      } else {
        const tapTouch = { clientX: touch.clientX, clientY: touch.clientY }
        touchState.tapTimer = setTimeout(() => {
          touchState.tapTimer = null
          handleTouchTap(tapTouch)
        }, 300)
      }
    }
  }
  if (e.touches.length === 0) {
    touchState.mode = 'none'
  } else if (e.touches.length === 1) {
    touchState.mode = 'pan'
    touchState.startX = e.touches[0].clientX
    touchState.startY = e.touches[0].clientY
    touchState.startViewportX = viewport.x
    touchState.startViewportY = viewport.y
  }
}

function handleTouchTap(touch) {
  selectedCardId.value = null
  connectingFrom.value = null
  connectingType.value = 'default'
}

function handleTouchDblClick(touch) {
  const rect = canvasRef.value.getBoundingClientRect()
  const cx = (touch.clientX - rect.left - viewport.x) / viewport.zoom
  const cy = (touch.clientY - rect.top - viewport.y) / viewport.zoom
  addNewCard(cx - 100, cy - 50)
}

function handleDblClick(e) {
  if (e.target === canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const cx = (e.clientX - rect.left - viewport.x) / viewport.zoom
    const cy = (e.clientY - rect.top - viewport.y) / viewport.zoom
    addNewCard(cx - 100, cy - 50)
  }
}

function addNewCard(x, y) {
  if (x == null || y == null) {
    const rect = canvasRef.value.getBoundingClientRect()
    x = (rect.width / 2 - viewport.x) / viewport.zoom - 100
    y = (rect.height / 2 - viewport.y) / viewport.zoom - 60
  }
  const card = {
    id: crypto.randomUUID(),
    x,
    y,
    width: 200,
    height: 120,
    rotation: 0,
    text: '',
    color: '#ffffff',
    zIndex: Date.now()
  }
  addCard(card)
  selectedCardId.value = card.id
  repelSelfToEmpty(card.id)
  repelOverlap(card.id)
}

function repelSelfToEmpty(cardId) {
  const card = cards.find(c => c.id === cardId)
  if (!card) return
  for (const other of cards) {
    if (other.id === cardId) continue
    const overlapX = Math.min(card.x + card.width, other.x + other.width) - Math.max(card.x, other.x)
    const overlapY = Math.min(card.y + card.height, other.y + other.height) - Math.max(card.y, other.y)
    if (overlapX <= 0 || overlapY <= 0) continue
    const cardCx = card.x + card.width / 2
    const cardCy = card.y + card.height / 2
    const othCx = other.x + other.width / 2
    const othCy = other.y + other.height / 2
    let dx = cardCx - othCx
    let dy = cardCy - othCy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) {
      const angle = Math.random() * Math.PI * 2
      dx = Math.cos(angle)
      dy = Math.sin(angle)
    } else {
      dx = dx / dist
      dy = dy / dist
    }
    const pushX = dx * (overlapX / 2 + REPEL_GAP)
    const pushY = dy * (overlapY / 2 + REPEL_GAP)
    updateCard(cardId, { x: card.x + pushX, y: card.y + pushY })
    const otherPushX = -dx * (overlapX / 2 + REPEL_GAP)
    const otherPushY = -dy * (overlapY / 2 + REPEL_GAP)
    updateCard(other.id, { repelling: true })
    updateCard(other.id, { x: other.x + otherPushX, y: other.y + otherPushY })
    setTimeout(() => {
      updateCard(other.id, { repelling: false })
    }, 350)
    const updated = cards.find(c => c.id === cardId)
    if (updated) {
      card.x = updated.x
      card.y = updated.y
    }
  }
}

function centerViewport() {
  if (cards.length === 0) {
    viewport.x = 0
    viewport.y = 0
    viewport.zoom = 1
    return
  }
  const minX = Math.min(...cards.map(c => c.x))
  const maxX = Math.max(...cards.map(c => c.x + c.width))
  const minY = Math.min(...cards.map(c => c.y))
  const maxY = Math.max(...cards.map(c => c.y + c.height))
  const contentWidth = maxX - minX
  const contentHeight = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const rect = canvasRef.value.getBoundingClientRect()
  const padding = 80
  const scaleX = (rect.width - padding) / contentWidth
  const scaleY = (rect.height - padding) / contentHeight
  const newZoom = Math.max(0.1, Math.min(2, Math.min(scaleX, scaleY)))
  viewport.zoom = newZoom
  viewport.x = rect.width / 2 - centerX * newZoom
  viewport.y = rect.height / 2 - centerY * newZoom
}

function handleClearAll() {
  if (cards.length === 0) return
  showClearConfirm.value = true
}

function confirmClear() {
  cards.splice(0, cards.length)
  connections.splice(0, connections.length)
  selectedCardId.value = null
  connectingFrom.value = null
  showClearConfirm.value = false
}

function exportData() {
  const doc = docs.find(d => d.id === activeDocId.value)
  const data = {
    version: 1,
    name: doc ? doc.name : '',
    cards: structuredClone(toRaw(cards)),
    connections: structuredClone(toRaw(connections)),
    viewport: { ...viewport },
    bgColor: bgColor.value
  }
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const docName = doc ? doc.name : 'mindlink'
  a.download = `${docName}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInputRef.value.value = ''
  importInputRef.value.click()
}

function importData(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result)
      if (!data.cards || !data.connections) {
        console.warn('Invalid import file: missing cards or connections')
        return
      }
      const docName = data.name || file.name.replace(/\.json$/, '')
      const newId = addDoc(docName)
      cards.splice(0, cards.length, ...data.cards)
      connections.splice(0, connections.length, ...data.connections)
      if (data.viewport) {
        viewport.x = data.viewport.x
        viewport.y = data.viewport.y
        viewport.zoom = data.viewport.zoom
      }
      if (data.bgColor) bgColor.value = data.bgColor
      selectedCardId.value = null
      connectingFrom.value = null
    } catch (err) {
      console.error('Failed to import data:', err)
    }
  }
  reader.readAsText(file)
}

const SNAP_THRESHOLD = 6

function snapValue(val, targets, threshold) {
  for (const t of targets) {
    if (Math.abs(val - t) < threshold) return t
  }
  return val
}

function handleSelect(id) {
  selectedCardId.value = id
  showBgPicker.value = false
}

function getDefaultConnCount(cardId) {
  return connections.filter(c => c.type === 'default' && (c.from === cardId || c.to === cardId)).length
}

function isChainMiddleNode(cardId) {
  const defaultConns = connections.filter(c => c.type === 'default' && (c.from === cardId || c.to === cardId))
  return defaultConns.length >= 2
}

function handleCardUpdate({ id, ...updates }) {
  updateCard(id, updates)
}

const REPEL_GAP = 10
const REPEL_MAX_ITER = 5

function repelOverlap(sourceId) {
  const processed = new Set([sourceId])
  const queue = [sourceId]
  let iter = 0
  while (queue.length > 0 && iter < REPEL_MAX_ITER) {
    iter++
    const currentId = queue.shift()
    const current = cards.find(c => c.id === currentId)
    if (!current) continue
    for (const other of cards) {
      if (processed.has(other.id) && iter > 1) continue
      if (other.id === sourceId) continue
      const overlapX = Math.min(current.x + current.width, other.x + other.width) - Math.max(current.x, other.x)
      const overlapY = Math.min(current.y + current.height, other.y + other.height) - Math.max(current.y, other.y)
      if (overlapX <= 0 || overlapY <= 0) continue
      const srcCx = current.x + current.width / 2
      const srcCy = current.y + current.height / 2
      const othCx = other.x + other.width / 2
      const othCy = other.y + other.height / 2
      let dx = othCx - srcCx
      let dy = othCy - srcCy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 1) {
        dx = 1
        dy = 0
      } else {
        dx = dx / dist
        dy = dy / dist
      }
      const pushX = dx * (overlapX / 2 + REPEL_GAP)
      const pushY = dy * (overlapY / 2 + REPEL_GAP)
      updateCard(other.id, { repelling: true })
      updateCard(other.id, { x: other.x + pushX, y: other.y + pushY })
      processed.add(other.id)
      queue.push(other.id)
      setTimeout(() => {
        updateCard(other.id, { repelling: false })
      }, 350)
    }
  }
}

function snapToAlign(id) {
  const card = cards.find(c => c.id === id)
  if (!card) return
  const w = card.width
  const h = card.height
  const snapXs = []
  const snapYs = []
  for (const other of cards) {
    if (other.id === id) continue
    const oCx = other.x + other.width / 2
    const oCy = other.y + other.height / 2
    const oL = other.x
    const oR = other.x + other.width
    const oT = other.y
    const oB = other.y + other.height
    snapXs.push(oCx - w / 2, oL, oR - w)
    snapYs.push(oCy - h / 2, oT, oB - h)
  }
  const snappedX = snapValue(card.x, snapXs, SNAP_THRESHOLD)
  const snappedY = snapValue(card.y, snapYs, SNAP_THRESHOLD)
  if (snappedX !== card.x || snappedY !== card.y) {
    updateCard(id, { x: snappedX, y: snappedY })
  }
}

function snapToAlignSize(id) {
  const card = cards.find(c => c.id === id)
  if (!card) return
  const snapWidths = []
  const snapHeights = []
  for (const other of cards) {
    if (other.id === id) continue
    const oR = other.x + other.width
    const oB = other.y + other.height
    snapWidths.push(other.width, oR - card.x)
    snapHeights.push(other.height, oB - card.y)
  }
  const snappedW = snapValue(card.width, snapWidths, SNAP_THRESHOLD)
  const snappedH = snapValue(card.height, snapHeights, SNAP_THRESHOLD)
  const w = Math.min(600, Math.max(120, snappedW))
  const h = Math.min(400, Math.max(80, snappedH))
  if (w !== card.width || h !== card.height) {
    updateCard(id, { width: w, height: h })
  }
}

function getConnectionPath(conn) {
  const from = cards.find(c => c.id === conn.from)
  const to = cards.find(c => c.id === conn.to)
  if (!from || !to) return ''
  const fx = (from.x + from.width / 2) * viewport.zoom + viewport.x
  const fy = (from.y + from.height / 2) * viewport.zoom + viewport.y
  const tx = (to.x + to.width / 2) * viewport.zoom + viewport.x
  const ty = (to.y + to.height / 2) * viewport.zoom + viewport.y
  const dx = tx - fx
  const dy = ty - fy
  const cx1 = fx + dx * 0.3
  const cy1 = fy
  const cx2 = fx + dx * 0.7
  const cy2 = ty
  return `M ${fx} ${fy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`
}

function handleStartConnect(id, type = 'default') {
  connectingFrom.value = id
  connectingType.value = type
}

function hasConnsOfType(cardId, connType, direction = 'any') {
  return connections.some(c => {
    if (c.type !== connType) return false
    if (direction === 'out') return c.from === cardId
    if (direction === 'in') return c.to === cardId
    return c.from === cardId || c.to === cardId
  })
}

function hasDirectLink(idA, idB, connType) {
  return connections.some(c =>
    c.type === connType && (
      (c.from === idA && c.to === idB) || (c.from === idB && c.to === idA)
    )
  )
}

function getNodeDepth(num) {
  return num === '0' ? 0 : (num.match(/\./g) || []).length
}

function getDescendants(cardId) {
  const result = new Set()
  const queue = [cardId]
  while (queue.length > 0) {
    const curr = queue.shift()
    if (result.has(curr)) continue
    result.add(curr)
    connections.forEach(c => {
      if (c.type === 'alt' && c.from === curr && !result.has(c.to)) queue.push(c.to)
    })
  }
  return result
}

function getAncestorSiblingNodes(ancestors, selfId) {
  const result = new Set()
  for (const ancestorId of ancestors) {
    const ancestorChain = getConnectedComponent(ancestorId)
    for (const chainNodeId of ancestorChain) {
      if (chainNodeId !== ancestorId && !ancestors.has(chainNodeId) && chainNodeId !== selfId) {
        result.add(chainNodeId)
      }
    }
  }
  return result
}

function getAltChainInfo(cardId) {
  const ancestors = new Set()
  let root = cardId
  const visited = new Set()
  let current = cardId
  while (current) {
    if (visited.has(current)) return { root: null, ancestors }
    visited.add(current)
    const parent = connections.find(c => c.type === 'alt' && c.to === current)
    if (!parent) { root = current; break }
    ancestors.add(parent.from)
    root = parent.from
    current = parent.from
  }
  return { root, ancestors }
}

function getConnectedComponent(startId, connType = 'default') {
  const component = new Set()
  const queue = [startId]
  while (queue.length > 0) {
    const id = queue.shift()
    if (component.has(id)) continue
    component.add(id)
    connections.forEach(c => {
      if (c.type === connType) {
        if (c.from === id && !component.has(c.to)) queue.push(c.to)
        if (c.to === id && !component.has(c.from)) queue.push(c.from)
      }
    })
  }
  return component
}

function wouldCreateAltCycle(startId, targetId) {
  return getDescendants(startId).has(targetId)
}

function determineParentByPos(idA, idB) {
  const cardA = cards.find(c => c.id === idA)
  const cardB = cards.find(c => c.id === idB)
  if (!cardA || !cardB) return { parent: idA, child: idB }
  if (Math.abs(cardA.x - cardB.x) < 30) {
    return cardA.y < cardB.y ? { parent: idA, child: idB } : { parent: idB, child: idA }
  }
  return cardA.x < cardB.x ? { parent: idA, child: idB } : { parent: idB, child: idA }
}

function getAltDirection(fromId, toId) {
  const fromHasParent = hasConnsOfType(fromId, 'alt', 'in')
  const toHasParent = hasConnsOfType(toId, 'alt', 'in')
  const fromHasChildren = hasConnsOfType(fromId, 'alt', 'out')
  const toHasChildren = hasConnsOfType(toId, 'alt', 'out')
  const fromIsAltRoot = !fromHasParent && fromHasChildren
  const toIsAltRoot = !toHasParent && toHasChildren
  const fromHasDefault = hasConnsOfType(fromId, 'default')
  const toHasDefault = hasConnsOfType(toId, 'default')

  if (toHasParent && !fromHasParent) return { parent: toId, child: fromId }
  if (fromHasParent && !toHasParent) return { parent: fromId, child: toId }
  if (fromIsAltRoot && !toIsAltRoot) return { parent: toId, child: fromId }
  if (toIsAltRoot && !fromIsAltRoot) return { parent: fromId, child: toId }
  if (toHasDefault && !fromHasDefault) return { parent: toId, child: fromId }
  if (fromHasDefault && !toHasDefault) return { parent: fromId, child: toId }
  return { parent: fromId, child: toId }
}

function getSiblingConns(cardId) {
  return connections.filter(c => c.type === 'default' && (c.from === cardId || c.to === cardId))
}

function isChainHead(cardId) {
  const conns = getSiblingConns(cardId)
  return conns.length === 1 && conns.every(c => c.from === cardId)
}

function isChainTail(cardId) {
  const conns = getSiblingConns(cardId)
  return conns.length === 1 && conns.every(c => c.to === cardId)
}

function isChainMiddle(cardId) {
  return getSiblingConns(cardId).length >= 2
}

function canConnectAlt(fromId, targetId, fromNum, toNum, fromAltRoot, toAltRoot, fromAncestors, toAncestors) {
  const fromIsZero = fromNum === '0'
  const toIsZero = toNum === '0'
  const fromDepth = getNodeDepth(fromNum)
  const toDepth = getNodeDepth(toNum)
  const fromHasAltParent = fromAncestors.size > 0
  const toHasAltParent = toAncestors.size > 0
  const fromHasDefault = hasConnsOfType(fromId, 'default')
  const toHasDefault = hasConnsOfType(targetId, 'default')

  if (fromHasAltParent && toHasAltParent && fromAltRoot !== toAltRoot) return false
  if (fromDepth >= 1 && toDepth >= 1) return false
  if (fromHasAltParent && !toIsZero && toDepth === 0 && toAltRoot !== fromAltRoot && toHasDefault) return false
  if (fromHasDefault && (toHasDefault || toHasAltParent)) return false
  if (toHasDefault && fromHasAltParent) return false

  if (fromHasAltParent) {
    const siblingNodes = getAncestorSiblingNodes(fromAncestors, fromId)
    const targetTree = getDescendants(targetId)
    if (siblingNodes.has(targetId)) return false
    for (const sid of siblingNodes) {
      if (targetTree.has(sid)) return false
    }
  }

  if (toHasAltParent) {
    const siblingNodes = getAncestorSiblingNodes(toAncestors, targetId)
    const fromTree = getDescendants(fromId)
    if (siblingNodes.has(fromId)) return false
    for (const sid of siblingNodes) {
      if (fromTree.has(sid)) return false
    }
  }

  if (!fromIsZero && !toIsZero) {
    if (hasDirectLink(fromId, targetId, 'default')) return false
    if (wouldCreateAltCycle(targetId, fromId)) return false
    if (wouldCreateAltCycle(fromId, targetId)) return false
  }

  return true
}

function canConnectDefault(fromId, targetId, fromNum, toNum, fromAltRoot, toAltRoot, fromAncestors, toAncestors) {
  if (toAncestors.has(fromId) || fromAncestors.has(targetId)) return false

  const fromHasAltParent = fromAncestors.size > 0
  const toHasAltParent = toAncestors.size > 0
  if (fromHasAltParent && toHasAltParent && fromAltRoot !== toAltRoot) return false

  if (toHasAltParent && !fromHasAltParent) {
    const toAltRootNode = toAltRoot
    const fromInSameTree = fromAltRoot === toAltRootNode
    if (!fromInSameTree) return false
  }
  if (fromHasAltParent && !toHasAltParent) {
    const fromAltRootNode = fromAltRoot
    const toInSameTree = toAltRoot === fromAltRootNode
    if (!toInSameTree) return false
  }

  const fromComponent = getConnectedComponent(fromId)
  if (fromComponent.has(targetId)) return false

  const fromOnlyHasAlt = !hasConnsOfType(fromId, 'default') && hasConnsOfType(fromId, 'alt', 'out')
  const toOnlyHasAlt = !hasConnsOfType(targetId, 'default') && hasConnsOfType(targetId, 'alt', 'out')
  const effectiveFromNum = fromOnlyHasAlt ? '0' : fromNum
  const effectiveToNum = toOnlyHasAlt ? '0' : toNum
  const effectiveFromIsZero = effectiveFromNum === '0'
  const effectiveToIsZero = effectiveToNum === '0'

  if (!fromOnlyHasAlt && isChainMiddle(fromId)) return false
  if (!toOnlyHasAlt && isChainMiddle(targetId)) return false

  if (!fromOnlyHasAlt && isChainHead(fromId)) return effectiveToIsZero || isChainTail(targetId)
  if (!fromOnlyHasAlt && isChainTail(fromId)) return effectiveToIsZero || isChainHead(targetId)
  if (effectiveFromIsZero) return effectiveToIsZero || isChainHead(targetId) || isChainTail(targetId) || toOnlyHasAlt
  if (effectiveToIsZero) return effectiveFromIsZero || isChainHead(fromId) || isChainTail(fromId) || fromOnlyHasAlt

  return false
}

function canConnectTo(targetId) {
  if (!connectingFrom.value) return false
  const fromId = connectingFrom.value
  if (fromId === targetId) return false

  const type = connectingType.value
  const fromNum = cardNumbers.value[fromId] || '0'
  const toNum = cardNumbers.value[targetId] || '0'
  const { root: fromAltRoot, ancestors: fromAncestors } = getAltChainInfo(fromId)
  const { root: toAltRoot, ancestors: toAncestors } = getAltChainInfo(targetId)

  if (type === 'alt') {
    return canConnectAlt(fromId, targetId, fromNum, toNum, fromAltRoot, toAltRoot, fromAncestors, toAncestors)
  }

  if (type === 'default') {
    return canConnectDefault(fromId, targetId, fromNum, toNum, fromAltRoot, toAltRoot, fromAncestors, toAncestors)
  }

  return false
}

function resolveAltDirection(fromId, toId, fromNum, toNum) {
  const fromIsZero = fromNum === '0'
  const toIsZero = toNum === '0'

  if (fromIsZero && !toIsZero) return { parent: toId, child: fromId }
  if (!fromIsZero && toIsZero) return { parent: fromId, child: toId }
  if (fromIsZero && toIsZero) return determineParentByPos(fromId, toId)
  return getAltDirection(fromId, toId)
}

function resolveDefaultDirection(fromId, toId, fromNum, toNum) {
  if (fromNum === '0' && toNum === '0') return determineParentByPos(fromId, toId)

  if (isChainHead(fromId) && isChainTail(toId)) return { parent: toId, child: fromId }
  if (isChainTail(fromId) && isChainHead(toId)) return { parent: fromId, child: toId }
  if (isChainHead(fromId) && toNum === '0') return { parent: toId, child: fromId }
  if (isChainTail(fromId) && toNum === '0') return { parent: fromId, child: toId }
  if (fromNum === '0' && isChainHead(toId)) return { parent: fromId, child: toId }
  if (fromNum === '0' && isChainTail(toId)) return { parent: toId, child: fromId }
  if (isChainHead(fromId)) return { parent: toId, child: fromId }
  if (isChainTail(fromId)) return { parent: fromId, child: toId }

  return { parent: fromId, child: toId }
}

function handleEndConnect(id) {
  if (connectingFrom.value && connectingFrom.value !== id) {
    if (!canConnectTo(id)) {
      connectingFrom.value = null
      connectingType.value = 'default'
      return
    }

    const fromId = connectingFrom.value
    const toId = id
    const type = connectingType.value
    const fromNum = cardNumbers.value[fromId] || '0'
    const toNum = cardNumbers.value[toId] || '0'

    const { parent, child } = type === 'alt'
      ? resolveAltDirection(fromId, toId, fromNum, toNum)
      : resolveDefaultDirection(fromId, toId, fromNum, toNum)

    addConnection(parent, child, type)
  }
  connectingFrom.value = null
  connectingType.value = 'default'
}

function handleDragEnd(id) {
  draggingCardId.value = null
  snapToAlign(id)
  repelOverlap(id)
}

function handleResizeEnd(id) {
  draggingCardId.value = null
  snapToAlignSize(id)
  repelOverlap(id)
}

const MOVE_STEP = 30

function getChainAndSubtree(cardId) {
  const chainIds = getConnectedComponent(cardId)
  const allIds = new Set(chainIds)
  for (const cid of chainIds) {
    const descendants = getDescendants(cid)
    for (const did of descendants) {
      allIds.add(did)
    }
  }
  return allIds
}

function handleMoveCard(id, direction) {
  const allIds = getChainAndSubtree(id)
  let dx = 0, dy = 0
  switch (direction) {
    case 'up': dy = -MOVE_STEP; break
    case 'down': dy = MOVE_STEP; break
    case 'left': dx = -MOVE_STEP; break
    case 'right': dx = MOVE_STEP; break
  }
  for (const cid of allIds) {
    const card = cards.find(c => c.id === cid)
    if (!card) continue
    updateCard(cid, { repelling: true, x: card.x + dx, y: card.y + dy })
  }
  setTimeout(() => {
    for (const cid of allIds) {
      updateCard(cid, { repelling: false })
    }
    repelOverlap(id)
  }, 350)
}

function handleStartChainDrag(id, e) {
  const allIds = getChainAndSubtree(id)
  const startX = e.clientX
  const startY = e.clientY
  const startPositions = new Map()
  for (const cid of allIds) {
    const card = cards.find(c => c.id === cid)
    if (card) startPositions.set(cid, { x: card.x, y: card.y })
  }

  function onMove(ev) {
    const dx = (ev.clientX - startX) / viewport.zoom
    const dy = (ev.clientY - startY) / viewport.zoom
    for (const [cid, pos] of startPositions) {
      updateCard(cid, { x: pos.x + dx, y: pos.y + dy })
    }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    repelOverlap(id)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function getChainOrderedIds(cardId) {
  const chainIds = [...getConnectedComponent(cardId)]
  const chainCards = chainIds.map(id => cards.find(c => c.id === id)).filter(Boolean)
  const connsInChain = connections.filter(c => c.type === 'default' && chainIds.includes(c.from) && chainIds.includes(c.to))

  const inDegree = new Map()
  for (const id of chainIds) inDegree.set(id, 0)
  for (const c of connsInChain) inDegree.set(c.to, (inDegree.get(c.to) || 0) + 1)

  const queue = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }
  const ordered = []
  while (queue.length > 0) {
    const id = queue.shift()
    ordered.push(id)
    for (const c of connsInChain) {
      if (c.from === id) {
        const newDeg = (inDegree.get(c.to) || 1) - 1
        inDegree.set(c.to, newDeg)
        if (newDeg === 0) queue.push(c.to)
      }
    }
  }
  return ordered
}

const LAYOUT_GAP = 20

function handleLayoutChain(id, direction) {
  const rootCard = cards.find(c => c.id === id)
  if (!rootCard) return

  const allIds = getChainAndSubtree(id)
  if (allIds.size <= 1) return

  let angle = 0
  switch (direction) {
    case 'cw': angle = Math.PI / 2; break
    case 'ccw': angle = -Math.PI / 2; break
  }

  const cx = rootCard.x + rootCard.width / 2
  const cy = rootCard.y + rootCard.height / 2
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)

  for (const cid of allIds) {
    if (cid === id) continue
    const card = cards.find(c => c.id === cid)
    if (!card) continue
    const pcx = card.x + card.width / 2 - cx
    const pcy = card.y + card.height / 2 - cy
    const newPcx = pcx * cosA - pcy * sinA
    const newPcy = pcx * sinA + pcy * cosA
    updateCard(cid, {
      repelling: true,
      x: cx + newPcx - card.width / 2,
      y: cy + newPcy - card.height / 2
    })
  }

  setTimeout(() => {
    for (const cid of allIds) {
      updateCard(cid, { repelling: false })
    }
    repelOverlap(id)
  }, 350)
}

const ALIGN_THRESHOLD = 6

const alignGuides = computed(() => {
  if (!draggingCardId.value) return []
  const dragCard = cards.find(c => c.id === draggingCardId.value)
  if (!dragCard) return []

  const guides = []
  const dragCx = dragCard.x + dragCard.width / 2
  const dragCy = dragCard.y + dragCard.height / 2
  const dragLeft = dragCard.x
  const dragRight = dragCard.x + dragCard.width
  const dragTop = dragCard.y
  const dragBottom = dragCard.y + dragCard.height

  for (const other of cards) {
    if (other.id === draggingCardId.value) continue

    const oCx = other.x + other.width / 2
    const oCy = other.y + other.height / 2
    const oLeft = other.x
    const oRight = other.x + other.width
    const oTop = other.y
    const oBottom = other.y + other.height

    if (Math.abs(dragCx - oCx) < ALIGN_THRESHOLD) {
      const screenX = oCx * viewport.zoom + viewport.x
      const minTop = Math.min(dragTop, oTop) * viewport.zoom + viewport.y
      const maxBot = Math.max(dragBottom, oBottom) * viewport.zoom + viewport.y
      guides.push({ id: `vcx-${other.id}`, x1: screenX, y1: minTop - 10, x2: screenX, y2: maxBot + 10, color: '#e91e63' })
    }

    if (Math.abs(dragLeft - oLeft) < ALIGN_THRESHOLD) {
      const screenX = oLeft * viewport.zoom + viewport.x
      const minTop = Math.min(dragTop, oTop) * viewport.zoom + viewport.y
      const maxBot = Math.max(dragBottom, oBottom) * viewport.zoom + viewport.y
      guides.push({ id: `vl-${other.id}`, x1: screenX, y1: minTop - 10, x2: screenX, y2: maxBot + 10, color: '#2196f3' })
    }

    if (Math.abs(dragRight - oRight) < ALIGN_THRESHOLD) {
      const screenX = oRight * viewport.zoom + viewport.x
      const minTop = Math.min(dragTop, oTop) * viewport.zoom + viewport.y
      const maxBot = Math.max(dragBottom, oBottom) * viewport.zoom + viewport.y
      guides.push({ id: `vr-${other.id}`, x1: screenX, y1: minTop - 10, x2: screenX, y2: maxBot + 10, color: '#2196f3' })
    }

    if (Math.abs(dragCy - oCy) < ALIGN_THRESHOLD) {
      const screenY = oCy * viewport.zoom + viewport.y
      const minLeft = Math.min(dragLeft, oLeft) * viewport.zoom + viewport.x
      const maxRight = Math.max(dragRight, oRight) * viewport.zoom + viewport.x
      guides.push({ id: `hcy-${other.id}`, x1: minLeft - 10, y1: screenY, x2: maxRight + 10, y2: screenY, color: '#e91e63' })
    }

    if (Math.abs(dragTop - oTop) < ALIGN_THRESHOLD) {
      const screenY = oTop * viewport.zoom + viewport.y
      const minLeft = Math.min(dragLeft, oLeft) * viewport.zoom + viewport.x
      const maxRight = Math.max(dragRight, oRight) * viewport.zoom + viewport.x
      guides.push({ id: `ht-${other.id}`, x1: minLeft - 10, y1: screenY, x2: maxRight + 10, y2: screenY, color: '#2196f3' })
    }

    if (Math.abs(dragBottom - oBottom) < ALIGN_THRESHOLD) {
      const screenY = oBottom * viewport.zoom + viewport.y
      const minLeft = Math.min(dragLeft, oLeft) * viewport.zoom + viewport.x
      const maxRight = Math.max(dragRight, oRight) * viewport.zoom + viewport.x
      guides.push({ id: `hb-${other.id}`, x1: minLeft - 10, y1: screenY, x2: maxRight + 10, y2: screenY, color: '#2196f3' })
    }
  }

  return guides
})

let guideTimer = null

function getChainOrderedCards(cardId) {
  const chainIds = getConnectedComponent(cardId)
  const chainArr = Array.from(chainIds)
  const nums = cardNumbers.value
  chainArr.sort((a, b) => {
    const na = nums[a] || ''
    const nb = nums[b] || ''
    return na.localeCompare(nb, undefined, { numeric: true })
  })
  return chainArr
}

function isChainHorizontal(chainCardIds) {
  let totalDx = 0, totalDy = 0, count = 0
  for (let i = 1; i < chainCardIds.length; i++) {
    const prev = cards.find(c => c.id === chainCardIds[i - 1])
    const curr = cards.find(c => c.id === chainCardIds[i])
    if (!prev || !curr) continue
    totalDx += Math.abs((curr.x + curr.width / 2) - (prev.x + prev.width / 2))
    totalDy += Math.abs((curr.y + curr.height / 2) - (prev.y + prev.height / 2))
    count++
  }
  if (count === 0) return true
  return totalDx >= totalDy
}

function getDfsOrder(cardId) {
  const nums = cardNumbers.value
  const sortByNum = (a, b) => (nums[a] || '').localeCompare(nums[b] || '', undefined, { numeric: true })

  const allConnected = new Set()
  const queue = [cardId]
  while (queue.length > 0) {
    const id = queue.shift()
    if (allConnected.has(id)) continue
    allConnected.add(id)
    connections.forEach(c => {
      if (c.from === id && !allConnected.has(c.to)) queue.push(c.to)
      if (c.to === id && !allConnected.has(c.from)) queue.push(c.from)
    })
  }

  const rootIds = []
  for (const id of allConnected) {
    const hasDefaultConn = connections.some(c => c.type === 'default' && (c.from === id || c.to === id))
    const hasAltParent = connections.some(c => c.type === 'alt' && c.to === id)
    if (hasAltParent) continue
    if (hasDefaultConn) rootIds.push(id)
  }
  for (const id of allConnected) {
    if (!rootIds.includes(id) && !connections.some(c => c.type === 'alt' && c.to === id)) {
      rootIds.push(id)
    }
  }
  rootIds.sort(sortByNum)

  const visited = new Set()
  const result = []

  function dfs(id) {
    if (visited.has(id)) return
    visited.add(id)
    result.push(id)
    const altChildren = connections
      .filter(c => c.type === 'alt' && c.from === id)
      .map(c => c.to)
      .sort(sortByNum)
    for (const childId of altChildren) {
      dfs(childId)
    }
  }

  for (const id of rootIds) {
    dfs(id)
  }

  const horizontal = isChainHorizontal(rootIds)
  return { order: result, horizontal }
}

function selectAndScrollTo(targetId) {
  selectedCardId.value = targetId
  const targetCard = cards.find(c => c.id === targetId)
  if (!targetCard) return
  const canvasRect = canvasRef.value.getBoundingClientRect()
  const screenX = (targetCard.x + targetCard.width / 2) * viewport.zoom + viewport.x
  const screenY = (targetCard.y + targetCard.height / 2) * viewport.zoom + viewport.y
  const cx = canvasRect.width / 2
  const cy = canvasRect.height / 2
  if (screenX < 40 || screenX > canvasRect.width - 40 || screenY < 40 || screenY > canvasRect.height - 40) {
    viewport.x = cx - (targetCard.x + targetCard.width / 2) * viewport.zoom
    viewport.y = cy - (targetCard.y + targetCard.height / 2) * viewport.zoom
  }
}

function navigateDfs(step) {
  const id = selectedCardId.value
  if (!id) return
  const { order } = getDfsOrder(id)
  const idx = order.indexOf(id)
  if (idx === -1) return
  const nextIdx = idx + step
  if (nextIdx < 0 || nextIdx >= order.length) return
  selectAndScrollTo(order[nextIdx])
}

const presentCard = computed(() => {
  if (!presentMode.value) return null
  const id = presentOrder.value[presentIndex.value]
  if (!id) return null
  return cards.find(c => c.id === id)
})

const presentTotal = computed(() => presentOrder.value.length)

const presentPrevCard = computed(() => {
  const idx = presentIndex.value - 1
  if (idx < 0) return null
  const id = presentOrder.value[idx]
  return id ? cards.find(c => c.id === id) : null
})

const presentNextCard = computed(() => {
  const idx = presentIndex.value + 1
  if (idx >= presentOrder.value.length) return null
  const id = presentOrder.value[idx]
  return id ? cards.find(c => c.id === id) : null
})

function enterPresentMode() {
  if (cards.length === 0) return
  let startId = selectedCardId.value
  if (!startId) {
    const nums = cardNumbers.value
    const rootCard = cards.find(c => nums[c.id] === '1')
    startId = rootCard ? rootCard.id : cards[0].id
  }
  const { order } = getDfsOrder(startId)
  if (order.length === 0) return
  presentOrder.value = order
  const idx = order.indexOf(startId)
  presentIndex.value = idx >= 0 ? idx : 0
  presentMode.value = true
  presentTransition.value = 'present-enter'
}

function exitPresentMode() {
  presentMode.value = false
  presentTransition.value = ''
}

function presentNext() {
  if (presentIndex.value < presentOrder.value.length - 1) {
    presentTransition.value = 'present-slide-left'
    presentIndex.value++
  }
}

function presentPrev() {
  if (presentIndex.value > 0) {
    presentTransition.value = 'present-slide-right'
    presentIndex.value--
  }
}

function handleKeydown(e) {
  if (presentMode.value) {
    if (e.key === 'Escape') { exitPresentMode(); e.preventDefault(); return }
    if (e.key === 'ArrowRight' || e.key === ' ') { presentNext(); e.preventDefault(); return }
    if (e.key === 'ArrowLeft') { presentPrev(); e.preventDefault(); return }
    return
  }
  const activeEl = document.activeElement
  if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) return
  if (!selectedCardId.value) return

  if (e.ctrlKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    const { horizontal } = getDfsOrder(selectedCardId.value)
    let step = 0
    if (horizontal) {
      if (e.key === 'ArrowRight') step = 1
      else if (e.key === 'ArrowLeft') step = -1
    } else {
      if (e.key === 'ArrowDown') step = 1
      else if (e.key === 'ArrowUp') step = -1
    }
    if (step !== 0) {
      navigateDfs(step)
    }
    return
  }

  const step = e.shiftKey ? 10 : 1
  const card = cards.find(c => c.id === selectedCardId.value)
  if (!card) return
  let moved = false
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      updateCard(selectedCardId.value, { y: card.y - step })
      moved = true
      break
    case 'ArrowDown':
      e.preventDefault()
      updateCard(selectedCardId.value, { y: card.y + step })
      moved = true
      break
    case 'ArrowLeft':
      e.preventDefault()
      updateCard(selectedCardId.value, { x: card.x - step })
      moved = true
      break
    case 'ArrowRight':
      e.preventDefault()
      updateCard(selectedCardId.value, { x: card.x + step })
      moved = true
      break
    case 'Delete':
      removeCard(selectedCardId.value)
      selectedCardId.value = null
      break
  }
  if (moved) {
    draggingCardId.value = selectedCardId.value
    clearTimeout(guideTimer)
    guideTimer = setTimeout(() => {
      if (draggingCardId.value === selectedCardId.value) {
        draggingCardId.value = null
      }
    }, 800)
  }
}

const MINIMAP_W = 180
const MINIMAP_H = 120

const minimapBounds = computed(() => {
  if (cards.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of cards) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.width)
    maxY = Math.max(maxY, c.y + c.height)
  }
  const pad = 50
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
})

const minimapScale = computed(() => {
  const b = minimapBounds.value
  const rangeX = b.maxX - b.minX || 1
  const rangeY = b.maxY - b.minY || 1
  return Math.min(MINIMAP_W / rangeX, MINIMAP_H / rangeY)
})

const minimapOffset = computed(() => {
  const b = minimapBounds.value
  const s = minimapScale.value
  const rangeX = b.maxX - b.minX || 1
  const rangeY = b.maxY - b.minY || 1
  return {
    ox: (MINIMAP_W - rangeX * s) / 2,
    oy: (MINIMAP_H - rangeY * s) / 2
  }
})

const minimapViewportStyle = computed(() => {
  const b = minimapBounds.value
  const s = minimapScale.value
  const { ox, oy } = minimapOffset.value
  const canvas = canvasRef.value
  if (!canvas) return { display: 'none' }
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const vx = (-viewport.x / viewport.zoom - b.minX) * s + ox
  const vy = (-viewport.y / viewport.zoom - b.minY) * s + oy
  const vw = (cw / viewport.zoom) * s
  const vh = (ch / viewport.zoom) * s
  return {
    left: `${vx}px`,
    top: `${vy}px`,
    width: `${vw}px`,
    height: `${vh}px`
  }
})

function drawMinimap() {
  const canvas = minimapRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  canvas.width = MINIMAP_W
  canvas.height = MINIMAP_H
  ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)
  const b = minimapBounds.value
  const s = minimapScale.value
  const { ox, oy } = minimapOffset.value
  for (const c of cards) {
    const x = (c.x - b.minX) * s + ox
    const y = (c.y - b.minY) * s + oy
    const w = c.width * s
    const h = c.height * s
    ctx.fillStyle = c.color || '#fff'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, w, h)
  }
  for (const conn of connections) {
    const from = cards.find(c => c.id === conn.from)
    const to = cards.find(c => c.id === conn.to)
    if (!from || !to) continue
    const fx = (from.x + from.width / 2 - b.minX) * s + ox
    const fy = (from.y + from.height / 2 - b.minY) * s + oy
    const tx = (to.x + to.width / 2 - b.minX) * s + ox
    const ty = (to.y + to.height / 2 - b.minY) * s + oy
    ctx.strokeStyle = conn.type === 'alt' ? '#2196f3' : '#e91e63'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(tx, ty)
    ctx.stroke()
  }
}

function handleMinimapDown(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const b = minimapBounds.value
  const s = minimapScale.value
  const { ox, oy } = minimapOffset.value
  const rect = e.currentTarget.getBoundingClientRect()
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const lerp = 0.1
  let targetX = viewport.x
  let targetY = viewport.y

  function setTarget(mx, my) {
    const worldX = (mx - ox) / s + b.minX
    const worldY = (my - oy) / s + b.minY
    targetX = -(worldX * viewport.zoom - cw / 2)
    targetY = -(worldY * viewport.zoom - ch / 2)
  }

  setTarget(e.clientX - rect.left, e.clientY - rect.top)

  let rafId = null
  function animate() {
    const dx = targetX - viewport.x
    const dy = targetY - viewport.y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      viewport.x = targetX
      viewport.y = targetY
      rafId = null
      return
    }
    viewport.x += dx * lerp
    viewport.y += dy * lerp
    rafId = requestAnimationFrame(animate)
  }

  function onMove(ev) {
    setTarget(ev.clientX - rect.left, ev.clientY - rect.top)
    if (!rafId) rafId = requestAnimationFrame(animate)
  }

  function onUp() {
    if (rafId) cancelAnimationFrame(rafId)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  rafId = requestAnimationFrame(animate)
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

let minimapTouchRaf = null
function handleMinimapTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  handleMinimapDown({ clientX: touch.clientX, clientY: touch.clientY, currentTarget: e.currentTarget })
}

function handleMinimapTouchMove(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  const canvas = canvasRef.value
  if (!canvas) return
  const b = minimapBounds.value
  const s = minimapScale.value
  const { ox, oy } = minimapOffset.value
  const rect = e.currentTarget.getBoundingClientRect()
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const mx = touch.clientX - rect.left
  const my = touch.clientY - rect.top
  const worldX = (mx - ox) / s + b.minX
  const worldY = (my - oy) / s + b.minY
  viewport.x = -(worldX * viewport.zoom - cw / 2)
  viewport.y = -(worldY * viewport.zoom - ch / 2)
}

function handleMinimapTouchEnd() {
  if (minimapTouchRaf) { cancelAnimationFrame(minimapTouchRaf); minimapTouchRaf = null }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (cards.length === 0) {
    addNewCard(200, 200)
  }
  drawMinimap()
})

const minimapWatcher = watch([cards, connections, viewport, () => cards.map(c => c.x + c.y)], () => {
  drawMinimap()
}, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.import-input {
  display: none;
}

.top-left-bar {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.account-panel {
  position: relative;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  border-radius: 20px;
  width: 40px;
  height: 40px;
  overflow: hidden;
  transition: height var(--anim-slow) var(--anim-bounce), border-radius var(--anim-slow) var(--anim-bounce), box-shadow var(--anim-normal);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.account-panel:hover {
  height: 120px;
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
}

.account-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #c2185b;
  flex-shrink: 0;
}

.account-menu {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity var(--anim-normal) 0.1s var(--anim-ease), transform var(--anim-normal) 0.1s var(--anim-ease);
  padding: 4px 0 8px;
}

.account-panel:hover .account-menu {
  opacity: 1;
  transform: translateY(0);
}

.account-menu-item {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #c2185b;
  font-size: 16px;
  transition: background var(--anim-fast) var(--anim-ease), transform var(--anim-fast) var(--anim-ease);
}

.account-menu-item:hover {
  background: #fce4ec;
  transform: scale(1.1);
}

.account-menu-item:active {
  transform: scale(0.9);
}

.account-menu-item i {
  font-size: 16px;
}

.infinite-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  touch-action: none;
  -webkit-touch-callout: none;
}

.infinite-canvas:active {
  cursor: grabbing;
}

.connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.connection-group {
  cursor: pointer;
}

.connection-group:hover .connection-line {
  stroke-width: 4;
  filter: brightness(1.2);
}

.connection-line-hitbox {
  pointer-events: stroke;
}

.connection-line {
  pointer-events: none;
  transition: stroke-width var(--anim-fast) var(--anim-ease), filter var(--anim-fast) var(--anim-ease);
}

.guide-line {
  pointer-events: none;
}

.cards-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2;
}

.toolbar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  padding: 8px 16px;
  border-radius: 24px;
  box-shadow: var(--shadow-md);
  z-index: 100;
}

.toolbar button {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: #fce4ec;
  color: #c2185b;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  outline: none;
  align-items: center;
  justify-content: center;
  transition: background var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-bounce),
              box-shadow var(--anim-fast) var(--anim-ease);
}

.toolbar button:hover {
  background: #f8bbd0;
  transform: scale(1.1);
}

.toolbar button:active {
  transform: scale(0.92);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15);
}

.zoom-label {
  font-size: 12px;
  color: #888;
  min-width: 40px;
  text-align: center;
}

.clear-wrap {
  position: relative;
}

.btn-clear {
  color: #999 !important;
}

.btn-clear:hover {
  color: #e53935 !important;
}

.clear-confirm {
  position: absolute;
  bottom: 48px;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 10px 14px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}

.clear-confirm-text {
  font-size: 13px;
  color: #333;
}

.clear-confirm-btn {
  border: none;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: #e53935;
  color: #fff;
  transition: opacity var(--anim-fast) var(--anim-ease);
}

.clear-confirm-btn:hover {
  opacity: 0.85;
}

.clear-confirm-btn.cancel {
  background: #eee;
  color: #666;
}

.bg-picker-wrap {
  position: relative;
}

.bg-picker {
  position: absolute;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 180px;
}

.bg-option {
  width: 80px;
  height: 36px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.bg-option:hover {
  transform: scale(1.05);
  border-color: #e91e63;
  transition: transform var(--anim-fast) var(--anim-ease),
              border-color var(--anim-fast) var(--anim-ease);
}

.bg-option.active {
  border-color: #e91e63;
  box-shadow: 0 0 0 2px rgba(233, 30, 99, 0.3);
}

.bg-option-label {
  font-size: 11px;
  color: #555;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
}

.minimap {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 180px;
  height: 120px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 100;
  cursor: pointer;
}

.minimap-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.minimap-viewport {
  position: absolute;
  border: 2px solid #e91e63;
  border-radius: 2px;
  background: rgba(233, 30, 99, 0.08);
  pointer-events: none;
}

.doc-panel {
  position: relative;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  width: 200px;
  overflow: hidden;
  flex-shrink: 0;
}

.doc-panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  color: #c2185b;
  font-size: 13px;
}

.doc-panel-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.doc-panel-arrow {
  font-size: 10px;
  transition: transform var(--anim-fast) var(--anim-ease);
}

.doc-panel-arrow-expanded {
  transform: rotate(180deg);
}

.doc-list {
  padding: 0 8px;
  border-top: 1px solid transparent;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 0;
  opacity: 0;
  transition: max-height var(--anim-slow) var(--anim-ease),
              opacity var(--anim-normal) var(--anim-ease),
              padding var(--anim-slow) var(--anim-ease),
              border-color var(--anim-normal) var(--anim-ease);
}

.doc-list-expanded {
  max-height: 280px;
  opacity: 1;
  padding: 4px 8px 8px;
  overflow-y: overlay;
  border-color: rgba(0, 0, 0, 0.06);
}

.doc-list::-webkit-scrollbar {
  width: 4px;
}

.doc-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
}

.doc-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #555;
  min-height: 30px;
  box-sizing: border-box;
  transition: background var(--anim-fast) var(--anim-ease);
}

.doc-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.doc-item-active {
  background: #fce4ec;
  color: #c2185b;
  font-weight: 600;
}

.doc-item-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.doc-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.doc-item-edit,
.doc-item-delete {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  color: #999;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
  width: 0;
  overflow: hidden;
  opacity: 0;
  transition: width var(--anim-fast) var(--anim-ease),
              opacity var(--anim-fast) var(--anim-ease),
              color var(--anim-fast) var(--anim-ease),
              background var(--anim-fast) var(--anim-ease);
}

.doc-item:hover .doc-item-edit,
.doc-item:hover .doc-item-delete {
  width: 22px;
  opacity: 1;
}

.doc-item-edit:hover {
  color: #333;
  background: #f0f0f0;
}

.doc-item-delete:hover {
  color: #e53935;
  background: #fce4ec;
}

.doc-delete-confirm-text {
  flex: 1;
  font-size: 12px;
  color: #e53935;
}

.doc-item-delete-confirm {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #e53935;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background var(--anim-fast) var(--anim-ease);
}

.doc-item-delete-confirm:hover {
  background: #fce4ec;
}

.doc-item-delete-cancel {
  background: none;
  border: none;
  font-size: 13px;
  cursor: pointer;
  color: #999;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background var(--anim-fast) var(--anim-ease);
}

.doc-item-delete-cancel:hover {
  background: #f0f0f0;
}

.doc-rename-input {
  flex: 1;
  border: 1px solid #e91e63;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 13px;
  outline: none;
  font-family: inherit;
  min-width: 0;
}

.doc-add-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 8px;
  margin-top: 2px;
  border: 1px dashed #ccc;
  border-radius: 6px;
  background: none;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  transition: border-color var(--anim-fast) var(--anim-ease),
              color var(--anim-fast) var(--anim-ease);
}

.doc-add-btn:hover {
  width: 100%;
  border-color: #c2185b;
  color: #c2185b;
}

.doc-add-area {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height var(--anim-slow) var(--anim-ease),
              opacity var(--anim-normal) var(--anim-ease),
              padding var(--anim-slow) var(--anim-ease);
}

.doc-add-area-expanded {
  max-height: 60px;
  opacity: 1;
  padding: 4px 8px 8px;
}

@media (max-width: 768px) {
  .toolbar {
    bottom: 12px;
    padding: 6px 10px;
    gap: 6px;
    border-radius: 20px;
  }
  .toolbar button {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }
  .zoom-label {
    font-size: 11px;
  }
  .top-left-bar {
    top: 12px;
    left: 12px;
  }
  .minimap {
    bottom: 70px;
    right: 12px;
    width: 120px;
    height: 80px;
  }
  .bg-picker {
    grid-template-columns: repeat(3, 1fr);
    min-width: 140px;
  }
  .bg-option {
    width: 60px;
    height: 28px;
  }
  .doc-panel {
    width: 180px;
  }
  .doc-item-edit,
  .doc-item-delete {
    opacity: 1;
  }
}

@media (max-width: 480px) {
  .toolbar {
    gap: 4px;
    padding: 4px 8px;
  }
  .toolbar button {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
  .minimap {
    width: 100px;
    height: 66px;
    bottom: 60px;
    right: 8px;
  }
}
</style>

<style>
.present-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: present-fade-in var(--anim-normal) var(--anim-ease);
}

@keyframes present-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.present-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 60px 80px;
}

.present-container.present-slide-left .present-card {
  animation: present-slide-left var(--anim-slow) var(--anim-decel);
}

.present-container.present-slide-right .present-card {
  animation: present-slide-right var(--anim-slow) var(--anim-decel);
}

@keyframes present-slide-left {
  from { transform: translateX(60px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes present-slide-right {
  from { transform: translateX(-60px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.present-card {
  max-width: 1080px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.present-card-inner {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 48px 56px;
  width: 100%;
  min-height: 200px;
  backdrop-filter: blur(12px);
}

.present-title {
  font-size: 38px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 24px;
  line-height: 1.3;
}

.present-text {
  font-size: 28px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.present-placeholder {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.present-number {
  margin-top: 20px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.present-nav {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 24px;
}

.present-nav-btn {
  width: 48px;
  height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--anim-fast) var(--anim-ease), border-color var(--anim-fast) var(--anim-ease);
}

.present-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
}

.present-nav-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.present-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.present-page {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 80px;
  text-align: center;
}

.present-close {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--anim-fast) var(--anim-ease);
}

.present-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.present-close:active {
  transform: scale(0.9);
}

.present-preview {
  position: fixed;
  bottom: 100px;
  max-width: 280px;
  min-width: 180px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 16px 20px;
  backdrop-filter: blur(8px);
  pointer-events: none;
  animation: present-preview-in var(--anim-fast) var(--anim-ease);
  overflow: hidden;
}

.present-preview-left {
  left: calc(50% - 120px);
}

.present-preview-right {
  right: calc(50% - 120px);
}

@keyframes present-preview-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.present-preview-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.present-preview-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
</style>
