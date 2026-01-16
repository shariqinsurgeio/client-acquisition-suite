const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const capture = await prisma.domCapture.findFirst({
    where: { pageType: 'best-matches' },
    orderBy: { capturedAt: 'desc' },
  });
  
  if (!capture) { console.log('No capture found'); return; }
  
  const attrs = JSON.parse(capture.dataAttributes);
  
  console.log('=== FIND-WORK PAGE JOB CONTAINERS ===');
  console.log('');
  
  // Look for anything that might be a job card
  attrs.forEach(a => {
    if (a.attr && (
      a.attr.toLowerCase().includes('job') || 
      a.attr.toLowerCase().includes('tile') ||
      a.attr.toLowerCase().includes('card') ||
      a.attr.toLowerCase().includes('feed')
    )) {
      console.log('[' + a.tag + '] data-test="' + a.attr + '"');
      if (a.textPreview) console.log('    Preview: ' + a.textPreview.substring(0, 60));
    }
  });
  
  await prisma.$disconnect();
}
main();
