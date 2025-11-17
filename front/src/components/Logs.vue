<template>
  <div class="mt-8">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-700 flex items-center">
        📋 Console de logs
      </h3>
      <button
        @click="clearLogs"
        class="text-sm text-gray-500 hover:text-red-600 transition-colors"
      >
        🗑️ Effacer
      </button>
    </div>

    <!-- Console de logs -->
    <div
      ref="logsContainer"
      class="bg-gray-900 text-gray-100 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm shadow-inner"
    >
      <div
        v-for="(log, index) in logs"
        :key="index"
        class="mb-2 flex items-start space-x-2 hover:bg-gray-800 px-2 py-1 rounded transition-colors"
      >
        <!-- Timestamp -->
        <span class="text-gray-500 flex-shrink-0">
          [{{ log.timestamp }}]
        </span>

        <!-- Message avec couleur selon le type -->
        <span :class="getLogColor(log.type)" class="flex-1">
          {{ log.message }}
        </span>
      </div>

      <!-- Message si aucun log -->
      <div v-if="logs.length === 0" class="text-gray-500 text-center py-8">
        Aucun log pour le moment...
      </div>
    </div>

    <!-- Indicateur de défilement automatique -->
    <div class="mt-2 text-xs text-gray-500 flex items-center justify-end space-x-2">
      <div
        class="w-2 h-2 rounded-full"
        :class="isAutoScroll ? 'bg-green-500 animate-pulse' : 'bg-gray-400'"
      ></div>
      <span>{{ isAutoScroll ? 'Défilement auto activé' : 'Défilement manuel' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

// Props
const props = defineProps({
  logs: {
    type: Array,
    required: true
  }
})

// Emit
const emit = defineEmits(['clear'])

// Références
const logsContainer = ref(null)
const isAutoScroll = ref(true)

/**
 * Couleur du log selon son type
 */
const getLogColor = (type) => {
  switch (type) {
    case 'success':
      return 'text-green-400'
    case 'error':
      return 'text-red-400'
    case 'warning':
      return 'text-yellow-400'
    case 'info':
    default:
      return 'text-blue-400'
  }
}

/**
 * Efface tous les logs
 */
const clearLogs = () => {
  emit('clear')
}

/**
 * Défilement automatique vers le bas quand un nouveau log arrive
 */
const scrollToBottom = () => {
  if (logsContainer.value && isAutoScroll.value) {
    nextTick(() => {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    })
  }
}

/**
 * Détection du défilement manuel
 */
const handleScroll = () => {
  if (logsContainer.value) {
    const { scrollTop, scrollHeight, clientHeight } = logsContainer.value
    // Si l'utilisateur n'est pas en bas, désactive l'auto-scroll
    isAutoScroll.value = scrollTop + clientHeight >= scrollHeight - 10
  }
}

// Watch pour défilement auto
watch(() => props.logs.length, () => {
  scrollToBottom()
})

// Setup du listener de scroll
onMounted(() => {
  if (logsContainer.value) {
    logsContainer.value.addEventListener('scroll', handleScroll)
  }
})

onBeforeUnmount(() => {
  if (logsContainer.value) {
    logsContainer.value.removeEventListener('scroll', handleScroll)
  }
})
</script>

<style scoped>
/* Scrollbar personnalisée */
div[ref="logsContainer"]::-webkit-scrollbar {
  width: 8px;
}

div[ref="logsContainer"]::-webkit-scrollbar-track {
  background: #1f2937;
  border-radius: 4px;
}

div[ref="logsContainer"]::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

div[ref="logsContainer"]::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
</style>

