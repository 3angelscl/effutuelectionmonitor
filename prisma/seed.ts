import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Helper to generate random coordinates in Ghana
function getRandomCoordinates() {
  const baseLatitude = 5.35;
  const baseLongitude = -0.62;
  const variance = 0.15;
  return {
    latitude: baseLatitude + (Math.random() - 0.5) * variance,
    longitude: baseLongitude + (Math.random() - 0.5) * variance,
  };
}

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.turnoutSnapshot.deleteMany();
  await prisma.agentCheckIn.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.voterTurnout.deleteMany();
  await prisma.electionResult.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.tallyPhoto.deleteMany();
  await prisma.voter.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.pollingStation.deleteMany();
  await prisma.election.deleteMany();
  await prisma.user.deleteMany();

  console.log('Cleaned existing data');

  // Create Elections
  const election2024 = await prisma.election.create({
    data: {
      name: 'General Election 2024',
      description: 'December 2024 General Elections - Effutu Constituency',
      date: new Date('2024-12-07'),
      isActive: true,
      status: 'ONGOING',
    },
  });

  await prisma.election.create({
    data: {
      name: 'By-Election 2025',
      description: 'Effutu Constituency By-Election 2025',
      date: new Date('2025-06-15'),
      isActive: false,
      status: 'UPCOMING',
    },
  });

  console.log('Elections created');

  // Create Admin
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@effutu.gov.gh',
      password: adminPassword,
      name: 'Election Admin',
      role: 'ADMIN',
      phone: '+233 55 000 0001',
    },
  });

  console.log('Admin created:', admin.email);

  // Create 155 Polling Stations
  console.log('Creating 155 polling stations...');
  const stations = [];
  const stationBatchSize = 50;

  for (let batch = 0; batch < Math.ceil(155 / stationBatchSize); batch++) {
    const stationBatch = [];
    const start = batch * stationBatchSize;
    const end = Math.min(start + stationBatchSize, 155);

    for (let i = start; i < end; i++) {
      const coords = getRandomCoordinates();
      stationBatch.push({
        psCode: `PS${String(i + 1).padStart(4, '0')}`,
        name: `Polling Station ${i + 1}`,
        location: `Location ${i + 1}, Effutu District`,
        ward: `Ward ${Math.floor(i / 15) + 1}`,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }

    const batchStations = await Promise.all(
      stationBatch.map((s) => prisma.pollingStation.create({ data: s }))
    );
    stations.push(...batchStations);
  }

  console.log(`✓ ${stations.length} polling stations created`);

  // Create 160 Agents
  console.log('Creating 160 agents...');
  const agents = [];
  const agentPassword = await bcrypt.hash('agent123', 12);
  const firstNames = ['Kwesi', 'Ama', 'Kofi', 'Abena', 'Yaw', 'Akua', 'Kwame', 'Esi', 'Jude', 'Grace'];
  const lastNames = ['Mensah', 'Darko', 'Asante', 'Osei', 'Boateng', 'Appiah', 'Annan', 'Owusu', 'Amoah', 'Ibrahim'];

  const agentBatchSize = 50;
  for (let batch = 0; batch < Math.ceil(160 / agentBatchSize); batch++) {
    const agentBatch = [];
    const start = batch * agentBatchSize;
    const end = Math.min(start + agentBatchSize, 160);

    for (let i = start; i < end; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[i % lastNames.length];
      agentBatch.push({
        email: `agent${String(i + 1).padStart(3, '0')}@effutu.gov.gh`,
        password: agentPassword,
        name: `${fn} ${ln} ${i + 1}`,
        role: 'AGENT' as const,
        phone: `+233 55 ${String(100000 + i).slice(-6)}`,
      });
    }

    const batchAgents = await Promise.all(
      agentBatch.map((a) => prisma.user.create({ data: a }))
    );
    agents.push(...batchAgents);
  }

  console.log(`✓ ${agents.length} agents created`);

  // Assign all 155 stations to 160 agents (5 agents will not get a station)
  console.log('Assigning all stations to agents...');
  for (let i = 0; i < stations.length; i++) {
    const agentIndex = i % agents.length;
    await prisma.pollingStation.update({
      where: { id: stations[i].id },
      data: { agentId: agents[agentIndex].id },
    });
  }
  console.log(`✓ All ${stations.length} stations assigned to agents`);

  // Create other user roles
  const viewerPassword = await bcrypt.hash('viewer123', 12);
  await prisma.user.create({
    data: {
      email: 'viewer@effutu.gov.gh',
      password: viewerPassword,
      name: 'Public Viewer',
      role: 'VIEWER',
    },
  });

  const officerPassword = await bcrypt.hash('officer123', 12);
  await prisma.user.create({
    data: {
      email: 'officer@effutu.gov.gh',
      password: officerPassword,
      name: 'Election Officer',
      role: 'OFFICER',
      phone: '+233 55 000 0003',
    },
  });

  console.log('Viewer and Officer created');

  // Create Candidates
  const candidatesData = [
    { name: 'Alexander Afenyo-Markin', party: 'NPP', partyFull: 'New Patriotic Party', color: '#1E40AF' },
    { name: 'James Kofi Annan', party: 'NDC', partyFull: 'National Democratic Congress', color: '#15803D' },
    { name: 'Independent Candidate', party: 'IND', partyFull: 'Independent', color: '#9333EA' },
  ];

  const candidates = await Promise.all(
    candidatesData.map((c) =>
      prisma.candidate.create({
        data: { ...c, electionId: election2024.id },
      })
    )
  );
  console.log(`✓ ${candidates.length} candidates created`);

  // Create 170,000 voters distributed across stations
  console.log('Creating 170,000 voters across stations...');
  const votersPerStation = Math.floor(170000 / stations.length);
  const remainingVoters = 170000 % stations.length;

  const firstNames_voters = [
    'Kofi', 'Kwame', 'Ama', 'Akua', 'Yaw', 'Esi', 'Kwesi', 'Abena',
    'Kojo', 'Adwoa', 'Kwaku', 'Afia', 'Nana', 'Efua', 'Papa', 'Maame',
  ];

  const lastNames_voters = [
    'Agyemang', 'Serwaa', 'Bekoe', 'Mensah', 'Preko', 'Ofori', 'Asante',
    'Boateng', 'Appiah', 'Ibrahim', 'Quansah', 'Annan', 'Amoah', 'Owusu',
  ];

  let voterCounter = 3000000000;
  const voterBatchSize = 5000;

  for (let si = 0; si < stations.length; si++) {
    const station = stations[si];
    const voterCount = votersPerStation + (si < remainingVoters ? 1 : 0);

    for (let batch = 0; batch < Math.ceil(voterCount / voterBatchSize); batch++) {
      const voterBatch = [];
      const batchStart = batch * voterBatchSize;
      const batchEnd = Math.min(batchStart + voterBatchSize, voterCount);

      for (let i = batchStart; i < batchEnd; i++) {
        voterCounter++;
        voterBatch.push({
          voterId: String(voterCounter),
          firstName: firstNames_voters[Math.floor(Math.random() * firstNames_voters.length)],
          lastName: lastNames_voters[Math.floor(Math.random() * lastNames_voters.length)],
          age: 18 + Math.floor(Math.random() * 60),
          stationId: station.id,
        });
      }

      await prisma.voter.createMany({ data: voterBatch });
    }

    if ((si + 1) % 20 === 0) {
      console.log(`  Voters created for ${si + 1}/155 stations...`);
    }
  }

  console.log(`✓ 170,000 voters created across ${stations.length} stations`);

  // Simulate voting activity for first 20 stations
  const activeStations = stations.slice(0, 20);
  console.log('Simulating voting activity for first 20 stations...');

  for (const station of activeStations) {
    const stationVoters = await prisma.voter.findMany({
      where: { stationId: station.id },
      select: { id: true },
      take: 100, // Sample first 100 voters
    });

    if (stationVoters.length === 0) continue;

    const votePercentage = 0.6 + Math.random() * 0.25;
    const votedCount = Math.floor(stationVoters.length * votePercentage);
    const votersToMark = stationVoters.slice(0, votedCount);

    const turnoutData = votersToMark.map((v) => ({
      voterId: v.id,
      electionId: election2024.id,
      hasVoted: true,
      votedAt: new Date(),
    }));

    await prisma.voterTurnout.createMany({ data: turnoutData });
  }

  console.log(`✓ Voting activity simulated for ${activeStations.length} stations`);

  // Submit results for first 5 stations
  const completedStations = stations.slice(0, 5);
  for (const station of completedStations) {
    const votedCount = await prisma.voterTurnout.count({
      where: {
        voter: { stationId: station.id },
        electionId: election2024.id,
        hasVoted: true,
      },
    });

    if (votedCount === 0) continue;

    const nppVotes = Math.floor(votedCount * (0.45 + Math.random() * 0.15));
    const ndcVotes = Math.floor(votedCount * (0.35 + Math.random() * 0.1));
    const indVotes = votedCount - nppVotes - ndcVotes;

    const votesMap: Record<number, number> = {
      0: nppVotes,
      1: ndcVotes,
      2: indVotes,
    };

    for (let i = 0; i < candidates.length; i++) {
      await prisma.electionResult.create({
        data: {
          stationId: station.id,
          candidateId: candidates[i].id,
          votes: votesMap[i],
          submittedById: admin.id,
          electionId: election2024.id,
        },
      });
    }
  }

  console.log(`✓ Results submitted for ${completedStations.length} stations`);

  console.log('\n✅ Seed complete!');
  console.log(`   • 155 polling stations with 1,096+ voters each`);
  console.log(`   • 160 agents assigned to all 155 stations`);
  console.log(`   • 170,000 total voters`);
  console.log(`   • 3 candidates`);
  console.log(`   • 2 elections (1 active)`);
  console.log(`\nDefault accounts:`);
  console.log(`   Admin: admin@effutu.gov.gh / admin123`);
  console.log(`   Officer: officer@effutu.gov.gh / officer123`);
  console.log(`   Viewer: viewer@effutu.gov.gh / viewer123`);
  console.log(`   Agents: agent001@effutu.gov.gh - agent160@effutu.gov.gh / agent123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
