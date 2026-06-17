import { chromium } from '@playwright/test'

const URL = process.argv[2]

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(2000)
  
  await page.screenshot({ path: 'driver_page_top.png', fullPage: false })
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'driver_page_card.png', fullPage: false })
  
  console.log('Done')
  await browser.close()
})()
