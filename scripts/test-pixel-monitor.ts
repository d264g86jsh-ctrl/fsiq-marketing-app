import { run } from '../skills/paid-media/pixel-monitor.skill'
run().then(out => {
  console.log('\n═══ SKILL OUTPUT ═══')
  console.log(JSON.stringify(out, null, 2))
}).catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
