<template>
  <div class="mb-8">
    <label class="block text-sm font-semibold text-gray-700 mb-3">
      📋 URLs des fiches produits à scraper
    </label>

    <!-- Zone de texte pour coller les URLs -->
    <textarea
      v-model="urlText"
      placeholder="Collez ici une ou plusieurs URLs (une par ligne)&#10;&#10;Exemple:&#10;https://exemple.com/produit-1&#10;https://exemple.com/produit-2"
      rows="8"
      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
      :disabled="isLoading"
    ></textarea>

    <!-- Compteur d'URLs -->
    <div class="mt-2 text-sm text-gray-600">
      <span v-if="parsedUrls.length > 0" class="text-primary font-medium">
        ✓ {{ parsedUrls.length }} URL(s) détectée(s)
      </span>
      <span v-else class="text-gray-400">
        Aucune URL détectée
      </span>
    </div>

    <!-- Liste des URLs validées -->
    <div v-if="parsedUrls.length > 0" class="mt-4 bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
      <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">URLs à traiter :</p>
      <ul class="space-y-1">
        <li
          v-for="(url, index) in parsedUrls"
          :key="index"
          class="text-sm text-gray-700 flex items-start"
        >
          <span class="text-green-500 mr-2">✓</span>
          <span class="truncate">{{ url }}</span>
        </li>
      </ul>
    </div>

    <!-- Bouton de lancement -->
    <button
      @click="handleStart"
      :disabled="isLoading || parsedUrls.length === 0"
      class="mt-6 w-full py-3 px-6 rounded-lg font-semibold text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      :class="isLoading ? 'bg-gray-400' : 'bg-gradient-to-r from-primary to-secondary hover:shadow-lg'"
    >
      <span v-if="isLoading" class="flex items-center justify-center">
        <svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Scrapping en cours...
      </span>
      <span v-else>
        🚀 Lancer l'import ({{ parsedUrls.length }} produit{{ parsedUrls.length > 1 ? 's' : '' }})
      </span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// Props
const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

// Events
const emit = defineEmits(['update:modelValue', 'start-scraping'])

// État local
const urlText = ref('')

/**
 * Parse et valide les URLs depuis le textarea
 */
const parsedUrls = computed(() => {
  if (!urlText.value.trim()) return []

  // Découpage par lignes et filtrage
  const urls = urlText.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      // Validation basique d'URL
      try {
        const url = new URL(line)
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    })

  return [...new Set(urls)] // Suppression des doublons
})

/**
 * Synchronisation avec le v-model parent
 */
watch(parsedUrls, (newUrls) => {
  emit('update:modelValue', newUrls)
})

/**
 * Gestion du clic sur le bouton de lancement
 */
const handleStart = () => {
  if (parsedUrls.value.length > 0) {
    emit('start-scraping', parsedUrls.value)
  }
}
</script>

