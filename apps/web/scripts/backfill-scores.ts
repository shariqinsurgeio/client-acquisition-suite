import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillScores() {
  console.log("=== Backfill Score Investigation ===\n");

  // 1. Find all jobs with NULL scoreWinLikelihood
  const nullScoreJobs = await prisma.job.findMany({
    where: { scoreWinLikelihood: null },
    select: {
      id: true,
      title: true,
      fitScore: true,
      scoreWinLikelihood: true,
      isShortlisted: true,
      createdAt: true,
    },
    orderBy: { fitScore: "desc" },
  });

  console.log(`Found ${nullScoreJobs.length} jobs with NULL scoreWinLikelihood:\n`);

  for (const job of nullScoreJobs.slice(0, 10)) {
    console.log(`  - fitScore: ${job.fitScore}% | ${job.title?.slice(0, 60)}...`);
  }
  if (nullScoreJobs.length > 10) {
    console.log(`  ... and ${nullScoreJobs.length - 10} more\n`);
  }

  // 2. Count how many have fitScore >= 80 (should be shortlisted)
  const highScoreJobs = nullScoreJobs.filter((j) => (j.fitScore ?? 0) >= 80);
  console.log(`\n${highScoreJobs.length} jobs have fitScore >= 80% and should be shortlisted:`);
  for (const job of highScoreJobs) {
    console.log(`  - ${job.fitScore}% | ${job.title?.slice(0, 60)}...`);
  }

  // 3. Perform the backfill
  console.log("\n=== Performing Backfill ===\n");

  // Update all NULL scoreWinLikelihood to match fitScore
  const updateResult = await prisma.job.updateMany({
    where: { scoreWinLikelihood: null },
    data: {}, // We can't use fitScore directly in updateMany, need to do individually
  });

  // Actually, we need to do this individually since updateMany can't reference another field
  let backfillCount = 0;
  for (const job of nullScoreJobs) {
    await prisma.job.update({
      where: { id: job.id },
      data: { scoreWinLikelihood: job.fitScore },
    });
    backfillCount++;
  }
  console.log(`Backfilled ${backfillCount} jobs with scoreWinLikelihood = fitScore`);

  // 4. Auto-shortlist jobs with scoreWinLikelihood >= 80
  const shortlistResult = await prisma.job.updateMany({
    where: {
      scoreWinLikelihood: { gte: 80 },
      isShortlisted: false,
    },
    data: {
      isShortlisted: true,
      shortlistedAt: new Date(),
    },
  });
  console.log(`Auto-shortlisted ${shortlistResult.count} jobs with scoreWinLikelihood >= 80%`);

  // 5. Verify final state
  const shortlistedJobs = await prisma.job.findMany({
    where: { isShortlisted: true },
    select: {
      id: true,
      title: true,
      fitScore: true,
      scoreWinLikelihood: true,
      shortlistedAt: true,
    },
    orderBy: { scoreWinLikelihood: "desc" },
  });

  console.log(`\n=== Final State ===`);
  console.log(`Total shortlisted jobs: ${shortlistedJobs.length}`);
  for (const job of shortlistedJobs) {
    console.log(`  - ${job.scoreWinLikelihood}% | ${job.title?.slice(0, 60)}...`);
  }
}

backfillScores()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
