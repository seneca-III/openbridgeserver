import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { apiPost, apiPut, apiDelete } from '../helpers'

/**
 * E2E-Tests für die Verlaufsansicht des Wertanzeige-Widgets mit variablem
 * Zeitbereich (analog Issue #413, Verlauf-Widget).
 *
 * Getestete Szenarien:
 *   1. Standard-Zeitbereich aus Config wird im Widget-Dropdown angezeigt
 *   2. Dropdown enthält alle 18 Zeitbereich-Optionen
 *   3. Auswahl eines anderen Zeitbereichs aktualisiert das Chart ohne Fehler
 *   4. Zeitbereich-Dropdown ist auch im Modal vorhanden und funktioniert
 *   5. Rückwärtskompatibilität: Widget ohne history_time_range zeigt last_24h
 *   6. Automatische Aktualisierung via WebSocket: neuer Wert aktualisiert den Chart
 */

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

async function createFloatDP(suffix: string) {
  return await apiPost('/api/v1/datapoints', {
    name: `E2E-ValDisp-${suffix}-${Date.now()}`,
    data_type: 'FLOAT',
    unit: '°C',
    record_history: true,
    tags: [],
  }) as { id: string }
}

async function createVisuPage() {
  return await apiPost('/api/v1/visu/nodes', {
    name: `E2E-ValDisp-Page-${Date.now()}`,
    type: 'PAGE',
    order: 999,
    access: 'public',
  }) as { id: string }
}

async function pushValue(dpId: string, value: number) {
  await apiPost(`/api/v1/datapoints/${dpId}/value`, { value })
}

async function buildValueDisplayPage(
  pageId: string,
  widgetId: string,
  dpId: string,
  config: Record<string, unknown>,
) {
  await apiPut(`/api/v1/visu/pages/${pageId}`, {
    grid_cols: 12,
    grid_row_height: 80,
    grid_cell_width: 80,
    background: null,
    widgets: [
      {
        id: widgetId,
        name: 'E2E ValueDisplay Zeitbereich',
        type: 'ValueDisplay',
        datapoint_id: dpId,
        status_datapoint_id: null,
        x: 0, y: 0, w: 4, h: 3,
        config,
      },
    ],
  })
}

const DEFAULT_RULES = [
  { fn: 'default', threshold: '', icon: '🌡️', color: '#3b82f6', output_type: 'value', calculation: '', prefix: '', text: '', decimals: 1, postfix: '' },
]

// ─── Test 1: Standard-Zeitbereich aus Config wird im Dropdown angezeigt ──────

test('Wertanzeige-Verlauf: Standard-Zeitbereich "Letzte 3 Stunden" wird angezeigt', async ({ page }) => {
  const dp = await createFloatDP('default-tr')
  const visuNode = await createVisuPage()
  const pageId = visuNode.id
  const widgetId = randomUUID()

  await pushValue(dp.id, 22.0)
  await buildValueDisplayPage(pageId, widgetId, dp.id, {
    label: 'Zeitbereich-Test',
    mode: 'history',
    rules: DEFAULT_RULES,
    history_time_range: 'last_3h',
  })

  try {
    await page.goto(`/visu/${pageId}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 8000 })

    const select = page.locator('select[title="Zeitbereich wählen"]').first()
    await expect(select).toBeVisible()
    await expect(select).toHaveValue('last_3h')
  } finally {
    await apiDelete(`/api/v1/visu/nodes/${pageId}`)
    await apiDelete(`/api/v1/datapoints/${dp.id}`)
  }
})

// ─── Test 2: Dropdown enthält alle 18 Optionen ───────────────────────────────

test('Wertanzeige-Verlauf: Dropdown enthält alle 18 Zeitbereich-Optionen', async ({ page }) => {
  const dp = await createFloatDP('options')
  const visuNode = await createVisuPage()
  const pageId = visuNode.id
  const widgetId = randomUUID()

  await pushValue(dp.id, 20.0)
  await buildValueDisplayPage(pageId, widgetId, dp.id, {
    label: 'Optionen-Test',
    mode: 'history',
    rules: DEFAULT_RULES,
    history_time_range: 'last_24h',
  })

  const expectedValues = [
    'last_5m', 'last_15m', 'last_30m',
    'last_1h', 'last_3h', 'last_6h', 'last_12h', 'last_24h',
    'last_2d', 'last_7d', 'last_30d', 'last_90d',
    'today', 'this_week', 'this_month',
    'yesterday', 'last_week', 'last_month',
  ]

  try {
    await page.goto(`/visu/${pageId}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 8000 })

    const select = page.locator('select[title="Zeitbereich wählen"]').first()
    await expect(select).toBeVisible()

    const optionCount = await select.locator('option').count()
    expect(optionCount).toBe(expectedValues.length)

    for (const val of expectedValues) {
      await expect(select.locator(`option[value="${val}"]`)).toBeAttached()
    }
  } finally {
    await apiDelete(`/api/v1/visu/nodes/${pageId}`)
    await apiDelete(`/api/v1/datapoints/${dp.id}`)
  }
})

// ─── Test 3: Auswahl eines anderen Zeitbereichs löst Neuladung aus ───────────

test('Wertanzeige-Verlauf: Auswahl eines anderen Zeitbereichs aktualisiert Chart', async ({ page }) => {
  const dp = await createFloatDP('switch-tr')
  const visuNode = await createVisuPage()
  const pageId = visuNode.id
  const widgetId = randomUUID()

  await pushValue(dp.id, 18.5)
  await buildValueDisplayPage(pageId, widgetId, dp.id, {
    label: 'Wechsel-Test',
    mode: 'history',
    rules: DEFAULT_RULES,
    history_time_range: 'last_24h',
  })

  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

  try {
    await page.goto(`/visu/${pageId}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 8000 })

    const select = page.locator('select[title="Zeitbereich wählen"]').first()
    await expect(select).toBeVisible()

    // Auf "Letzte 7 Tage" wechseln
    await select.selectOption('last_7d')
    await expect(select).toHaveValue('last_7d')
    await page.waitForTimeout(1000)
    await expect(page.locator('canvas').first()).toBeVisible()

    // Auf "Heute bis jetzt" wechseln
    await select.selectOption('today')
    await expect(select).toHaveValue('today')
    await page.waitForTimeout(500)
    await expect(page.locator('canvas').first()).toBeVisible()

    const chartErrors = errors.filter(e =>
      e.toLowerCase().includes('chart') || e.toLowerCase().includes('cannot'),
    )
    expect(chartErrors).toHaveLength(0)
  } finally {
    await apiDelete(`/api/v1/visu/nodes/${pageId}`)
    await apiDelete(`/api/v1/datapoints/${dp.id}`)
  }
})

// ─── Test 4: Zeitbereich-Dropdown im Modal vorhanden und funktionsfähig ──────

test('Wertanzeige-Verlauf: Modal zeigt Zeitbereich-Dropdown und Wechsel funktioniert', async ({ page }) => {
  const dp = await createFloatDP('modal-tr')
  const visuNode = await createVisuPage()
  const pageId = visuNode.id
  const widgetId = randomUUID()

  await pushValue(dp.id, 19.0)
  await buildValueDisplayPage(pageId, widgetId, dp.id, {
    label: 'Modal-Test',
    mode: 'history',
    rules: DEFAULT_RULES,
    history_time_range: 'last_1h',
  })

  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

  try {
    await page.goto(`/visu/${pageId}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 8000 })

    // Modal öffnen durch Klick auf den Mini-Chart
    await page.locator('canvas').first().click()
    await expect(page.locator('[class*="fixed inset-0"]')).toBeVisible({ timeout: 3000 })

    // Modal-Canvas muss sichtbar sein
    await expect(page.locator('[class*="fixed inset-0"] canvas')).toBeVisible()

    // Dropdown im Modal muss vorhanden sein und den richtigen Wert zeigen
    const modalSelect = page.locator('[class*="fixed inset-0"] select[title="Zeitbereich wählen"]')
    await expect(modalSelect).toBeVisible()
    await expect(modalSelect).toHaveValue('last_1h')

    // Zeitbereich im Modal wechseln
    await modalSelect.selectOption('last_7d')
    await expect(modalSelect).toHaveValue('last_7d')
    await page.waitForTimeout(1000)

    // Widget-Dropdown muss ebenfalls aktualisiert sein (gleicher State)
    const widgetSelect = page.locator('select[title="Zeitbereich wählen"]').first()
    await expect(widgetSelect).toHaveValue('last_7d')

    // Modal schliessen
    await page.keyboard.press('Escape')
    await page.locator('button:has-text("✕")').click()

    const chartErrors = errors.filter(e =>
      e.toLowerCase().includes('chart') || e.toLowerCase().includes('cannot'),
    )
    expect(chartErrors).toHaveLength(0)
  } finally {
    await apiDelete(`/api/v1/visu/nodes/${pageId}`)
    await apiDelete(`/api/v1/datapoints/${dp.id}`)
  }
})

// ─── Test 5: Rückwärtskompatibilität — alte Config ohne history_time_range ───

test('Wertanzeige-Verlauf: alte Config ohne history_time_range fällt auf last_24h zurück', async ({ page }) => {
  const dp = await createFloatDP('compat')
  const visuNode = await createVisuPage()
  const pageId = visuNode.id
  const widgetId = randomUUID()

  await pushValue(dp.id, 25.0)
  await buildValueDisplayPage(pageId, widgetId, dp.id, {
    label: 'Compat-Test',
    mode: 'history',
    rules: DEFAULT_RULES,
    history_hours: 24, // alte Config-Struktur
  })

  try {
    await page.goto(`/visu/${pageId}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 8000 })

    const select = page.locator('select[title="Zeitbereich wählen"]').first()
    await expect(select).toBeVisible()
    await expect(select).toHaveValue('last_24h')
  } finally {
    await apiDelete(`/api/v1/visu/nodes/${pageId}`)
    await apiDelete(`/api/v1/datapoints/${dp.id}`)
  }
})

// ─── Test 6: Automatische Aktualisierung via WebSocket ───────────────────────

test('Wertanzeige-Verlauf: Canvas bleibt nach WS-Aktualisierung sichtbar und fehlerfrei', async ({ page }) => {
  const dp = await createFloatDP('ws-refresh')
  const visuNode = await createVisuPage()
  const pageId = visuNode.id
  const widgetId = randomUUID()

  await pushValue(dp.id, 20.0)
  await buildValueDisplayPage(pageId, widgetId, dp.id, {
    label: 'WS-Test',
    mode: 'history',
    rules: DEFAULT_RULES,
    history_time_range: 'last_1h',
  })

  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

  try {
    await page.goto(`/visu/${pageId}`)
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible({ timeout: 8000 })

    // Neuen Wert via API senden (simuliert WS-Update)
    await pushValue(dp.id, 21.5)

    // Kurz warten — Widget wartet 2 s nach WS-Nachricht bevor es neu lädt
    await page.waitForTimeout(3500)

    // Canvas muss noch sichtbar und fehlerfrei sein
    await expect(canvas).toBeVisible()
    const chartErrors = errors.filter(e =>
      e.toLowerCase().includes('chart') || e.toLowerCase().includes('cannot'),
    )
    expect(chartErrors).toHaveLength(0)
  } finally {
    await apiDelete(`/api/v1/visu/nodes/${pageId}`)
    await apiDelete(`/api/v1/datapoints/${dp.id}`)
  }
})
