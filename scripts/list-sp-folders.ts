import { listChildren, getGraphToken } from '../lib/graph'

const VIDEO_CREATIVES_ID = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const STATIC_IMAGES_ID   = '015MT6T5GOWXFRTIAPSRHKYLAHPNIY5W2P'

async function main() {
  getGraphToken()
  console.log('\n═══ VIDEO CREATIVES ═══')
  const video = await listChildren(VIDEO_CREATIVES_ID)
  video.sort((a, b) => a.name.localeCompare(b.name))
  video.forEach(f => console.log(`  "${f.name}"`))

  console.log('\n═══ STATIC IMAGES ═══')
  const statics = await listChildren(STATIC_IMAGES_ID)
  statics.sort((a, b) => a.name.localeCompare(b.name))
  statics.forEach(f => console.log(`  "${f.name}"`))
}
main().catch(console.error)
