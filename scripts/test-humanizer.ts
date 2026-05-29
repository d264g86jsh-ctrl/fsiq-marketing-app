import { humanize } from '../skills/cmo/humanizer.skill'

const before = `FoodServiceIQ stands as a testament to the transformative potential of data-driven procurement. It's not just about saving money — it's about empowering independent restaurants to thrive in today's challenging landscape. Our groundbreaking approach underscores the vital role of buying power, ensuring that restaurants can achieve their goals. Additionally, our performance-based model highlights our commitment to excellence.`

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('BEFORE')
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log(before)
  console.log('\nHumanizing...\n')

  const after = await humanize(before, 'paid-ads')

  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('AFTER')
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log(after)
}

main().catch(err => { console.error(err); process.exit(1) })
