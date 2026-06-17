import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT = 'screenshots'
if (!existsSync(OUT)) mkdirSync(OUT)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const snap = async (name, url) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
  console.log(`✓ ${name} → ${OUT}/${name}.png`)
}

await snap('login',       'http://localhost:3000/login')
await snap('dashboard',   'http://localhost:3000/dashboard')
await snap('customers',   'http://localhost:3000/ban-hang/khach-hang')
await snap('orders',      'http://localhost:3000/ban-hang/don-hang-ban')
await snap('invoice',     'http://localhost:3000/ban-hang/hoa-don')
await snap('warehouse',   'http://localhost:3000/kho-hang/tong-quan-kho')
await snap('products',    'http://localhost:3000/kho-hang/san-pham')
await snap('logistics',   'http://localhost:3000/logistics/tong-quan')
await snap('report',      'http://localhost:3000/bao-cao')

await browser.close()
console.log('\nDone! Mở thư mục screenshots/ để xem ảnh.')
