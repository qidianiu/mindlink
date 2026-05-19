<template>
  <div
    class="card-node anim-fade-in-scale transition-shadow transition-opacity transition-border"
    :class="{ selected, 'card-repelling': card.repelling, 'connect-target': connecting, 'connect-target-sibling': connecting && connectType === 'default', 'connect-target-child': connecting && connectType === 'alt' }"
    :style="cardStyle"
    @mousedown.stop="handleMouseDown"
    @click.stop="handleClick"
    @touchstart.stop="handleTouchStart"
    @touchmove.stop="handleTouchMove"
    @touchend.stop="handleTouchEnd"
  >
    <div v-if="!inConnectMode" class="connect-sidebar">
      <div v-if="!isChildNode && !isChainMiddle" class="connect-dot" @mousedown.stop @click.stop="$emit('start-connect', card.id, 'default')" title="连线（兄弟）"><i class="bi bi-link-45deg"></i></div>
      <div class="connect-dot-alt" @mousedown.stop @click.stop="$emit('start-connect', card.id, 'alt')" title="连线（子节点）"><i class="bi bi-diagram-2"></i></div>
    </div>
    <div v-if="!inConnectMode && showDirectionBar" class="direction-sidebar">
      <div class="layout-bar">
        <button class="dir-btn layout-btn" @mousedown.stop @click.stop="$emit('layout-chain', card.id, 'ccw')" title="逆时针旋转90°"><i class="bi bi-arrow-counterclockwise"></i></button>
        <button class="dir-btn layout-btn" @mousedown.stop @click.stop="$emit('layout-chain', card.id, 'cw')" title="顺时针旋转90°"><i class="bi bi-arrow-clockwise"></i></button>
      </div>
      <button class="dir-btn dir-drag" @mousedown.stop.prevent="$emit('start-chain-drag', card.id, $event)" title="自由拖拽链条"><i class="bi bi-arrows-move"></i></button>
    </div>
    <div class="card-header">
      <span class="card-index">#{{ cardNumber }}</span>
      <div v-if="!inConnectMode" class="card-actions">
        <button class="action-btn" @click.stop="$emit('bring-to-front', card.id)" title="置顶"><i class="bi bi-chevron-double-up"></i></button>
        <button class="action-btn" @click.stop="$emit('send-to-back', card.id)" title="置底"><i class="bi bi-chevron-double-down"></i></button>
        <button class="action-btn" @click.stop="$emit('duplicate', card.id)" title="复制"><i class="bi bi-copy"></i></button>
        <button class="action-btn delete" @click.stop="$emit('delete', card.id)" title="删除"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>
    <div v-if="!editing" class="card-body" @dblclick.stop="handleDblClick" @touchend.stop="handleBodyTouchEnd">
      <div v-if="card.title" class="card-title">{{ card.title }}</div>
      <div v-if="card.text" class="card-content">{{ card.text }}</div>
      <div v-else-if="!card.title" class="card-content card-content-placeholder">双击编辑...</div>
      <span v-if="charCount > 0" class="card-char-count">{{ charCount }}</span>
    </div>
    <div v-else class="card-editor-area" @focusout="handleFocusOut">
      <input
        ref="titleRef"
        v-model="editTitle"
        class="card-editor-title"
        placeholder="标题"
        @mousedown.stop
        @keydown.enter.prevent="moveToContent"
      />
      <textarea
        ref="textareaRef"
        v-model="editText"
        class="card-editor"
        placeholder="内容"
        @keydown.enter.ctrl="finishEdit"
        @mousedown.stop
      />
      <span class="card-char-count card-char-count-editing">{{ editingCharCount }}</span>
    </div>
    <div v-if="!inConnectMode" class="resize-handle" @mousedown.stop.prevent="handleResizeStart" @touchstart.stop.prevent="handleResizeTouchStart" @touchmove.stop.prevent="handleResizeTouchMove" @touchend.stop.prevent="handleResizeTouchEnd"></div>
    <div v-if="!inConnectMode" class="resize-handle-w" @mousedown.stop.prevent="handleResizeWStart" @touchstart.stop.prevent="handleResizeWTouchStart" @touchmove.stop.prevent="handleResizeWTouchMove" @touchend.stop.prevent="handleResizeWTouchEnd"></div>
    <div v-if="!inConnectMode" class="resize-handle-h" @mousedown.stop.prevent="handleResizeHStart" @touchstart.stop.prevent="handleResizeHTouchStart" @touchmove.stop.prevent="handleResizeHTouchMove" @touchend.stop.prevent="handleResizeHTouchEnd"></div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  card: Object,
  zoom: { type: Number, default: 1 },
  selected: Boolean,
  connecting: Boolean,
  connectType: { type: String, default: 'default' },
  inConnectMode: Boolean,
  cardNumber: { type: String, default: '0' },
  defaultConnCount: { type: Number, default: 0 },
  isChainMiddle: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'update', 'delete', 'duplicate', 'start-connect', 'end-connect', 'bring-to-front', 'send-to-back', 'drag-start', 'drag-end', 'resize-end', 'move-card', 'start-chain-drag', 'layout-chain'])

const editing = ref(false)
const editText = ref('')
const editTitle = ref('')
const textareaRef = ref(null)
const titleRef = ref(null)
const isDragging = ref(false)
const isResizing = ref(false)
const resizeStart = reactive({ x: 0, y: 0, w: 0, h: 0 })

import { reactive, onMounted, onBeforeUnmount } from 'vue'

const cardStyle = computed(() => ({
  left: `${props.card.x}px`,
  top: `${props.card.y}px`,
  width: `${props.card.width}px`,
  height: `${props.card.height}px`,
  zIndex: props.card.zIndex || 0,
  backgroundColor: props.card.color || '#fff'
}))

const isChildNode = computed(() => props.cardNumber.includes('.'))

const charCount = computed(() => {
  const t = (props.card.title || '').length + (props.card.text || '').length
  return t
})

const editingCharCount = computed(() => {
  return (editTitle.value || '').length + (editText.value || '').length
})

const showDirectionBar = computed(() => {
  const num = props.cardNumber
  return num === '1' && props.defaultConnCount >= 0
})

function handleMouseDown(e) {
  emit('select', props.card.id)
  isDragging.value = true
  emit('drag-start', props.card.id)
  const startX = e.clientX
  const startY = e.clientY
  const cardX = props.card.x
  const cardY = props.card.y
  const cardId = props.card.id
  const zoom = props.zoom
  emit('update', { id: cardId, zIndex: 999 })

  function onMove(ev) {
    const dx = (ev.clientX - startX) / zoom
    const dy = (ev.clientY - startY) / zoom
    emit('update', { id: cardId, x: cardX + dx, y: cardY + dy })
  }

  function onUp() {
    isDragging.value = false
    emit('drag-end', cardId)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function handleClick() {
  emit('select', props.card.id)
  emit('end-connect', props.card.id)
}

function handleDblClick() {
  editing.value = true
  editText.value = props.card.text || ''
  editTitle.value = props.card.title || ''
  nextTick(() => {
    if (titleRef.value) {
      titleRef.value.focus()
    }
  })
}

function moveToContent() {
  if (textareaRef.value) {
    textareaRef.value.focus()
  }
}

function handleFocusOut(e) {
  const area = e.currentTarget
  if (!area.contains(e.relatedTarget)) {
    finishEdit()
  }
}

function finishEdit() {
  editing.value = false
  emit('update', { id: props.card.id, text: editText.value, title: editTitle.value })
}

function handleResizeStart(e) {
  isResizing.value = true
  emit('drag-start', props.card.id)
  const startX = e.clientX
  const startY = e.clientY
  const startW = props.card.width
  const startH = props.card.height
  const cardId = props.card.id
  const zoom = props.zoom

  function onMove(ev) {
    const dw = (ev.clientX - startX) / zoom
    const dh = (ev.clientY - startY) / zoom
    emit('update', {
      id: cardId,
      width: Math.min(600, Math.max(120, startW + dw)),
      height: Math.min(400, Math.max(80, startH + dh))
    })
  }

  function onUp() {
    isResizing.value = false
    emit('resize-end', cardId)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function handleResizeWStart(e) {
  emit('drag-start', props.card.id)
  const startX = e.clientX
  const startW = props.card.width
  const cardId = props.card.id
  const zoom = props.zoom

  function onMove(ev) {
    const dw = (ev.clientX - startX) / zoom
    emit('update', {
      id: cardId,
      width: Math.min(600, Math.max(120, startW + dw))
    })
  }

  function onUp() {
    emit('resize-end', cardId)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function handleResizeHStart(e) {
  emit('drag-start', props.card.id)
  const startY = e.clientY
  const startH = props.card.height
  const cardId = props.card.id
  const zoom = props.zoom

  function onMove(ev) {
    const dh = (ev.clientY - startY) / zoom
    emit('update', {
      id: cardId,
      height: Math.min(400, Math.max(80, startH + dh))
    })
  }

  function onUp() {
    emit('resize-end', cardId)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const touchDragState = reactive({
  active: false,
  startX: 0,
  startY: 0,
  cardX: 0,
  cardY: 0,
  moved: false
})

const bodyTapTimer = ref(null)

function handleTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  emit('select', props.card.id)
  touchDragState.active = true
  touchDragState.moved = false
  touchDragState.startX = touch.clientX
  touchDragState.startY = touch.clientY
  touchDragState.cardX = props.card.x
  touchDragState.cardY = props.card.y
  emit('drag-start', props.card.id)
  emit('update', { id: props.card.id, zIndex: 999 })
}

function handleTouchMove(e) {
  if (!touchDragState.active || e.touches.length !== 1) return
  e.preventDefault()
  const touch = e.touches[0]
  const dx = (touch.clientX - touchDragState.startX) / props.zoom
  const dy = (touch.clientY - touchDragState.startY) / props.zoom
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touchDragState.moved = true
  emit('update', { id: props.card.id, x: touchDragState.cardX + dx, y: touchDragState.cardY + dy })
}

function handleTouchEnd() {
  if (!touchDragState.active) return
  touchDragState.active = false
  emit('drag-end', props.card.id)
  if (!touchDragState.moved) {
    emit('end-connect', props.card.id)
  }
}

function handleBodyTouchEnd() {
  if (bodyTapTimer.value) {
    clearTimeout(bodyTapTimer.value)
    bodyTapTimer.value = null
    handleDblClick()
  } else {
    bodyTapTimer.value = setTimeout(() => {
      bodyTapTimer.value = null
    }, 300)
  }
}

function handleResizeTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  emit('drag-start', props.card.id)
  const startX = touch.clientX
  const startY = touch.clientY
  const startW = props.card.width
  const startH = props.card.height
  const cardId = props.card.id
  const zoom = props.zoom

  function onMove(ev) {
    if (ev.touches.length !== 1) return
    ev.preventDefault()
    const t = ev.touches[0]
    const dw = (t.clientX - startX) / zoom
    const dh = (t.clientY - startY) / zoom
    emit('update', {
      id: cardId,
      width: Math.min(600, Math.max(120, startW + dw)),
      height: Math.min(400, Math.max(80, startH + dh))
    })
  }

  function onEnd() {
    emit('resize-end', cardId)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
  }

  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
}

function handleResizeWTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  emit('drag-start', props.card.id)
  const startX = touch.clientX
  const startW = props.card.width
  const cardId = props.card.id
  const zoom = props.zoom

  function onMove(ev) {
    if (ev.touches.length !== 1) return
    ev.preventDefault()
    const t = ev.touches[0]
    const dw = (t.clientX - startX) / zoom
    emit('update', { id: cardId, width: Math.min(600, Math.max(120, startW + dw)) })
  }

  function onEnd() {
    emit('resize-end', cardId)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
  }

  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
}

function handleResizeHTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  emit('drag-start', props.card.id)
  const startY = touch.clientY
  const startH = props.card.height
  const cardId = props.card.id
  const zoom = props.zoom

  function onMove(ev) {
    if (ev.touches.length !== 1) return
    ev.preventDefault()
    const t = ev.touches[0]
    const dh = (t.clientY - startY) / zoom
    emit('update', { id: cardId, height: Math.min(400, Math.max(80, startH + dh)) })
  }

  function onEnd() {
    emit('resize-end', cardId)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
  }

  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
}

function handleResizeTouchMove() {}
function handleResizeTouchEnd() {}
function handleResizeWTouchMove() {}
function handleResizeWTouchEnd() {}
function handleResizeHTouchMove() {}
function handleResizeHTouchEnd() {}
</script>

<style scoped>
.card-node {
  position: absolute;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  cursor: move;
  border: 2px solid transparent;
  touch-action: none;
  -webkit-touch-callout: none;
  transition: box-shadow var(--anim-fast) var(--anim-ease),
              border-color var(--anim-fast) var(--anim-ease),
              opacity var(--anim-normal) var(--anim-ease);
}

.card-node:hover {
  box-shadow: var(--shadow-md);
}

.card-repelling {
  transition: left var(--anim-normal) var(--anim-bounce),
              top var(--anim-normal) var(--anim-bounce),
              box-shadow var(--anim-fast) var(--anim-ease),
              border-color var(--anim-fast) var(--anim-ease),
              opacity var(--anim-normal) var(--anim-ease);
}

.card-node.selected {
  border-color: #e91e63;
  box-shadow: 0 4px 24px rgba(233, 30, 99, 0.25);
}

.card-node.connect-target {
  cursor: crosshair;
}

.card-node.connect-target-sibling {
  border-color: #e91e63;
  box-shadow: 0 4px 24px rgba(233, 30, 99, 0.3);
}

.card-node.connect-target-child {
  border-color: #2196f3;
  box-shadow: 0 4px 24px rgba(33, 150, 243, 0.3);
}

.connect-sidebar {
  position: absolute;
  left: -38px;
  top: 50%;
  transform: translateY(-50%) translateX(8px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  padding: 6px 4px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  opacity: 0;
  z-index: 10;
  transition: opacity var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.card-node:hover .connect-sidebar {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.connect-dot {
  color: #e91e63;
  font-size: 16px;
  cursor: crosshair;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: background var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.connect-dot:hover {
  background: rgba(233, 30, 99, 0.1);
  transform: scale(1.15);
}

.connect-dot-alt {
  color: #2196f3;
  font-size: 16px;
  cursor: crosshair;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: background var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.connect-dot-alt:hover {
  background: rgba(33, 150, 243, 0.1);
  transform: scale(1.15);
}

.direction-sidebar {
  position: absolute;
  top: -38px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  display: flex;
  flex-direction: row;
  gap: 2px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  padding: 4px 6px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  opacity: 0;
  z-index: 10;
  transition: opacity var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.card-node:hover .direction-sidebar {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.dir-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #666;
  padding: 0 3px;
  border-radius: 4px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  transition: background var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.dir-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.dir-btn:active {
  transform: scale(0.9);
}

.dir-drag {
  color: #2196f3;
}

.dir-drag:hover {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
}

.layout-bar {
  display: flex;
  gap: 2px;
}

.layout-btn {
  color: #ff9800;
}

.layout-btn:hover {
  background: rgba(255, 152, 0, 0.1);
  color: #f57c00;
}

.card-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.03);
  gap: 6px;
  min-height: 28px;
}

.card-index {
  font-size: 11px;
  color: #999;
  flex: 1;
}

.card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transform: translateX(4px);
  transition: opacity var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.card-node:hover .card-actions {
  opacity: 1;
  transform: translateX(0);
}

.action-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #666;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 1;
  transition: background var(--anim-fast) var(--anim-ease),
              color var(--anim-fast) var(--anim-ease),
              transform var(--anim-fast) var(--anim-ease);
}

.action-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.action-btn:active {
  transform: scale(0.88);
}

.action-btn.delete:hover {
  background: #fce4ec;
  color: #c2185b;
}

.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0 0 8px 8px;
  position: relative;
}

.card-title {
  padding: 8px 12px 2px;
  font-size: 14px;
  font-weight: 700;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}

.card-content {
  flex: 1;
  padding: 4px 12px 8px;
  font-size: 13px;
  color: #555;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}

.card-content-placeholder {
  color: #bbb;
  font-style: italic;
}

.card-char-count {
  position: absolute;
  right: 8px;
  bottom: 4px;
  font-size: 10px;
  color: #bbb;
  pointer-events: none;
  line-height: 1;
}

.card-char-count-editing {
  right: 12px;
  bottom: 8px;
}

.card-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0 0 8px 8px;
  position: relative;
}

.card-editor-title {
  padding: 8px 12px 2px;
  font-size: 14px;
  font-weight: 700;
  border: none;
  outline: none;
  background: transparent;
  color: #333;
  font-family: inherit;
}

.card-editor {
  flex: 1;
  padding: 4px 12px 8px;
  font-size: 13px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: #555;
  font-family: inherit;
}

.resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity var(--anim-fast) var(--anim-ease);
}

.card-node:hover .resize-handle {
  opacity: 1;
}

.resize-handle::after {
  content: '';
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 8px;
  height: 8px;
  border-right: 2px solid #aaa;
  border-bottom: 2px solid #aaa;
}

.resize-handle-w {
  position: absolute;
  right: -5px;
  top: 10px;
  bottom: 10px;
  width: 12px;
  cursor: ew-resize;
  opacity: 0;
  transition: opacity var(--anim-fast) var(--anim-ease);
}

.card-node:hover .resize-handle-w {
  opacity: 1;
}

.resize-handle-w::after {
  content: '';
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: #aaa;
  border-radius: 1px;
}

.resize-handle-h {
  position: absolute;
  bottom: -5px;
  left: 10px;
  right: 10px;
  height: 12px;
  cursor: ns-resize;
  opacity: 0;
  transition: opacity var(--anim-fast) var(--anim-ease);
}

.card-node:hover .resize-handle-h {
  opacity: 1;
}

.resize-handle-h::after {
  content: '';
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 2px;
  background: #aaa;
  border-radius: 1px;
}

@media (max-width: 768px) {
  .card-actions {
    opacity: 1;
    transform: translateX(0);
  }
  .connect-sidebar {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
  .direction-sidebar {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .resize-handle,
  .resize-handle-w,
  .resize-handle-h {
    opacity: 1;
  }
}
</style>
