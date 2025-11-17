<template>
  <div class="min-h-screen py-8 px-4">
    <div class="max-w-5xl mx-auto">
      <!-- En-tête -->
      <header class="text-center mb-12">
        <h1 class="text-4xl font-bold text-gray-800 mb-2">
          🔗 Rakk - Import Produits
        </h1>
        <p class="text-gray-600">
          Scrapez des fiches produits et importez-les automatiquement sur Shopify
        </p>
      </header>

      <!-- Contenu principal -->
      <div class="bg-white rounded-lg shadow-lg p-8 mb-8">
        <!-- Composant d'entrée des URLs -->
        <UrlInput
          v-model="urls"
          @start-scraping="startScraping"
          :isLoading="isLoading"
        />

        <!-- Barre de progression -->
        <Progress
          v-if="isLoading || progress.current > 0"
          :current="progress.current"
          :total="progress.total"
          :status="progress.status"
          :errors="errorCount"
          :result-success="results ? results.success : null"
          :global-error="globalError"
          :failed-step="failedStep"
        />

        <!-- Console de logs -->
        <Logs
          v-if="logs.length > 0"
          :logs="logs"
        />

        <!-- Résultats -->
        <div v-if="results" class="mt-8">
          <div
            v-if="results.success"
            class="bg-green-50 border border-green-200 rounded-lg p-6"
          >
            <h3 class="text-lg font-semibold text-green-800 mb-3 flex items-center">
              ✅ Import terminé !
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div class="bg-white rounded-lg p-4 border border-green-300">
                <div class="text-2xl font-bold text-green-600">{{ results.imported || 0 }}</div>
                <div class="text-sm text-gray-600">Importé(s)</div>
              </div>

              <div v-if="results.skipped" class="bg-white rounded-lg p-4 border border-orange-300">
                <div class="text-2xl font-bold text-orange-600">{{ results.skipped || 0 }}</div>
                <div class="text-sm text-gray-600">Ignoré(s) (doublon)</div>
              </div>

              <div v-if="results.errors" class="bg-white rounded-lg p-4 border border-red-300">
                <div class="text-2xl font-bold text-red-600">{{ results.errors || 0 }}</div>
                <div class="text-sm text-gray-600">Erreur(s)</div>
              </div>
            </div>

            <p class="text-green-700">
              {{ results.scrapedProducts }} produit(s) traité(s) au total
            </p>
          </div>

          <div
            v-else
            class="bg-red-50 border border-red-200 rounded-lg p-6"
          >
            <h3 class="text-lg font-semibold text-red-800 mb-2 flex items-center">
              ❌ Erreur lors de l'import
            </h3>
            <p class="text-red-700 mb-4">{{ results.message }}</p>

            <div v-if="results.errors > 0" class="mt-4">
              <div class="bg-white rounded-lg p-4 border border-red-300">
                <div class="text-2xl font-bold text-red-600">{{ results.errors }}</div>
                <div class="text-sm text-gray-600">Erreur(s) détectée(s)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import UrlInput from './components/UrlInput.vue'
import Progress from './components/Progress.vue'
import Logs from './components/Logs.vue'

// État de l'application
const urls = ref([])
const isLoading = ref(false)
const progress = ref({ current: 0, total: 0, status: '' })
const logs = ref([])
const results = ref(null)

// Compteurs globaux exposés
const successCount = ref(0)
const skippedCount = ref(0)
const errorCount = ref(0)
const globalError = ref(false)
const failedStep = ref(null)

/**
 * Ajoute un log avec timestamp
 */
const addLog = (message, type = 'info') => {
  const timestamp = new Date().toLocaleTimeString('fr-FR')
  logs.value.push({ timestamp, message, type })
}

/**
 * Lance le processus de scraping avec EventSource pour progression temps réel
 */
const startScraping = async (urlList) => {
  // Réinitialisation
  isLoading.value = true
  progress.value = { current: 0, total: urlList.length, status: 'Initialisation...' }
  logs.value = []
  results.value = null

  addLog(`🚀 Démarrage du scrapping pour ${urlList.length} URL(s)`, 'info')

  const scraperApiUrl = (import.meta.env.VITE_SCRAPER_API_URL || 'http://51.75.29.101:3000').replace(/\/$/, '')
  console.log('[Front] VITE_SCRAPER_API_URL =', scraperApiUrl)
  // Création de l'URL avec les paramètres
  const urlsParam = encodeURIComponent(urlList.join(','))
  const eventSourceUrl = `${scraperApiUrl}/api/scrap-stream?urls=${urlsParam}`

  // Création de l'EventSource pour recevoir les mises à jour en temps réel
  const eventSource = new EventSource(eventSourceUrl)

  // Compteurs
  let successCountLocal = 0
  let skippedCountLocal = 0
  let errorCountLocal = 0

  // Événement: Démarrage
  eventSource.addEventListener('start', (e) => {
    console.log('[SSE] Event: start', e.data)
    const data = JSON.parse(e.data)
    progress.value = {
      current: 0,
      total: data.total,
      status: data.message
    }
    addLog(`🌐 ${data.message}`, 'info')
    // reset counters
    successCount.value = 0
    skippedCount.value = 0
    errorCount.value = 0
  })

  // Événement: Progression
  eventSource.addEventListener('progress', (e) => {
    console.log('[SSE] Event: progress', e.data)
    const data = JSON.parse(e.data)
    progress.value = {
      ...progress.value,
      current: data.current,
      status: data.message
    }
    addLog(data.message, 'info')
  })

  // Événement: Produit scrappé
  eventSource.addEventListener('scraped', (e) => {
    const data = JSON.parse(e.data)
    addLog(`✅ Scrappé: ${data.product.title} (${data.product.variants} variant(s), ${data.product.images} image(s))`, 'success')
  })

  // Événement: Produit importé
  eventSource.addEventListener('imported', (e) => {
    const data = JSON.parse(e.data)

    const response = data.shopifyResponse

    if (response.skipped > 0) {
      skippedCountLocal++
      skippedCount.value++
      addLog(`⏭️  ${data.product}: Produit déjà existant dans Shopify (ignoré)`, 'warning')
    } else if (response.imported > 0) {
      successCountLocal++
      successCount.value++
      addLog(`✅ ${data.product}: Importé dans Shopify avec succès`, 'success')
    }

    if (response.errors > 0) {
      errorCountLocal++
      errorCount.value++
      globalError.value = true
      failedStep.value = 2 // import step
      addLog(`⚠️ ${data.product}: ${response.errors} erreur(s) lors de l'import`, 'warning')
    }
  })

  // Événement: Erreur sur un produit (renommer pour éviter conflit avec onerror)
  eventSource.addEventListener('product-error', (e) => {
    const data = JSON.parse(e.data)
    errorCountLocal++
    errorCount.value++
    globalError.value = true
    failedStep.value = 1 // scraping or sending? assume scraping
    addLog(`❌ Erreur sur ${data.url || data.product || 'produit'}: ${data.error}`, 'error')
  })

  // Événement: Erreur fatale
  eventSource.addEventListener('fatal-error', (e) => {
    const data = JSON.parse(e.data)
    addLog(`❌ Erreur fatale: ${data.error}`, 'error')

    results.value = {
      success: false,
      message: data.error
    }

    globalError.value = true
    failedStep.value = 1

    eventSource.close()
    isLoading.value = false
    progress.value.status = '❌ Échec'
  })

  // Événement: Terminé
  eventSource.addEventListener('complete', (e) => {
    console.log('[SSE] Event: complete', e.data)
    const data = JSON.parse(e.data)

    progress.value = {
      current: data.total,
      total: data.total,
      status: '✅ Terminé !'
    }

    addLog(`🎉 ${data.message}`, data.errors > 0 ? 'warning' : 'success')

    results.value = {
      success: successCountLocal > 0,
      scrapedProducts: data.total,
      imported: successCountLocal,
      skipped: skippedCountLocal,
      errors: errorCountLocal
    }

    // mettre à jour les refs exposés
    successCount.value = successCountLocal
    skippedCount.value = skippedCountLocal
    errorCount.value = errorCountLocal

    // si erreurs lors du process, set globalError and failedStep to import step
    if (errorCountLocal > 0) {
      globalError.value = true
      failedStep.value = 2
    } else {
      globalError.value = false
      failedStep.value = null
    }

    console.log('[SSE] Fermeture EventSource et arrêt du loading')
    eventSource.close()
    isLoading.value = false
  })

  // Gestion de la fermeture de la connexion
  eventSource.onerror = (err) => {
    console.error('EventSource failed:', err)

    // Si la connexion est fermée sans événement complete, c'est une erreur
    if (isLoading.value) {
      addLog(`❌ Connexion perdue avec le serveur`, 'error')

      progress.value = {
        ...progress.value,
        status: '⚠️ Interrompu'
      }

      results.value = {
        success: successCount > 0,
        scrapedProducts: successCount + skippedCount + errorCount,
        imported: successCount,
        skipped: skippedCount,
        errors: errorCount,
        message: 'Connexion interrompue'
      }

      isLoading.value = false
    }

    eventSource.close()
  }
}
</script>

<style>
</style>
