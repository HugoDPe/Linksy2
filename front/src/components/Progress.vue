<template>
  <div class="my-8">
    <!-- Statut actuel -->
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-lg font-semibold text-gray-700">
        {{ status }}
      </h3>
      <span class="text-sm font-medium text-gray-600">
        {{ current }} / {{ total }}
      </span>
    </div>

    <!-- Barre de progression -->
    <div class="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
      <div
        class="h-full rounded-full transition-all duration-500 ease-out"
        :class="progressColor"
        :style="{ width: progressPercent + '%' }"
      >
        <div class="h-full w-full animate-pulse-slow opacity-30 bg-white"></div>
      </div>
    </div>

    <!-- Pourcentage -->
    <div class="text-center mt-2">
      <span class="text-2xl font-bold text-gray-800">
        {{ progressPercent }}%
      </span>
    </div>

    <!-- Étapes détaillées -->
    <div class="mt-6 space-y-2">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="flex items-center space-x-3 p-3 rounded-lg transition-all"
        :class="getStepClass(index)"
      >
        <div class="flex-shrink-0">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center font-semibold"
            :class="getIconClass(index)"
          >
            <!-- Si cette step est celle qui a échoué, afficher une croix -->
            <span v-if="props.globalError && props.failedStep !== null && index === props.failedStep">✕</span>
            <!-- Afficher ✓ si l'étape est passée et n'est pas la step en échec -->
            <span v-else-if="index < currentStep && !(props.globalError && props.failedStep !== null && index === props.failedStep)">✓</span>
            <!-- Spinner uniquement si étape active ET non terminée et pas d'erreur sur cette step -->
            <span v-else-if="index === currentStep && !isFinished && !(props.globalError && props.failedStep !== null && index === props.failedStep)" class="animate-spin">⟳</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
        </div>
        <div class="flex-1">
          <p class="font-medium" :class="index <= currentStep ? 'text-gray-800' : 'text-gray-400'">
            {{ step }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

// Props
const props = defineProps({
  current: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    default: 'En attente...'
  },
  errors: {
    type: Number,
    default: 0
  },
  resultSuccess: {
    type: Boolean,
    default: null
  },
  globalError: {
    type: Boolean,
    default: false
  },
  failedStep: {
    type: Number,
    default: null
  }
})

// Étapes du processus
const steps = [
  '🌐 Initialisation du navigateur',
  '🔍 Scrapping des fiches produits',
  '📤 Envoi des données à Shopify',
  '✅ Import terminé'
]

/**
 * Calcul de l'étape actuelle
 */
const currentStep = computed(() => {
  if (props.current === 0) return 0
  if (props.current < props.total) return 1
  if (props.status && (props.status.includes('Envoi') || props.status.includes('📤'))) return 2
  if (props.status && (props.status.includes('Terminé') || props.status.includes('✅'))) return 3
  return 1
})

/**
 * Pourcentage de progression
 */
const progressPercent = computed(() => {
  if (!props.total) return 0
  return Math.round((props.current / props.total) * 100)
})

/**
 * Détecte si le process est terminé (100% ou statut explicite)
 */
const isFinished = computed(() => {
  return progressPercent.value === 100 || (props.status && (props.status.includes('Terminé') || props.status.includes('✅')))
})

const hasError = computed(() => {
  return props.globalError || (props.errors || 0) > 0 || props.resultSuccess === false
})

/**
 * Couleur de la barre de progression
 */
const progressColor = computed(() => {
  const percent = progressPercent.value
  if (percent === 100) return 'bg-gradient-to-r from-green-400 to-green-600'
  if (percent >= 66) return 'bg-gradient-to-r from-blue-400 to-blue-600'
  if (percent >= 33) return 'bg-gradient-to-r from-yellow-400 to-yellow-600'
  return 'bg-gradient-to-r from-purple-400 to-purple-600'
})

/**
 * Style de chaque étape
 */
const getStepClass = (index) => {
  // Si erreur globale et failedStep est définit :
  if (props.globalError && props.failedStep !== null) {
    if (index < props.failedStep) return 'bg-green-50 border border-green-200'
    if (index === props.failedStep) return 'bg-red-50 border border-red-200'
    return 'bg-gray-50 border border-gray-200'
  }

  // sinon comportement normal
  if (hasError.value && isFinished.value && index === currentStep.value) {
    return 'bg-red-50 border border-red-200'
  }
  if (index < currentStep.value) return 'bg-green-50 border border-green-200'
  if (index === currentStep.value) return 'bg-blue-50 border border-blue-200 shadow-md'
  return 'bg-gray-50 border border-gray-200'
}

/**
 * Style de l'icône de chaque étape
 */
const getIconClass = (index) => {
  if (props.globalError && props.failedStep !== null && index === props.failedStep) return 'bg-red-500 text-white'
  if (hasError.value && isFinished.value && index === currentStep.value) return 'bg-red-500 text-white'
  if (index < currentStep.value) return 'bg-green-500 text-white'
  if (index === currentStep.value) return 'bg-blue-500 text-white'
  return 'bg-gray-300 text-gray-600'
}
</script>
