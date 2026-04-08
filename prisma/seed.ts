import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Effutu constituency area
function getRandomCoordinates() {
  const baseLat = 5.355;
  const baseLon = -0.630;
  const variance = 0.13;
  return {
    latitude: baseLat + (Math.random() - 0.5) * variance,
    longitude: baseLon + (Math.random() - 0.5) * variance,
  };
}

// 18 Electoral Areas with exact station counts (total = 142)
const ELECTORAL_AREAS = [
  { name: 'PONKOREKYIR',             count: 4  },
  { name: 'NDAAMBA',                 count: 3  },
  { name: 'MBURABAMU',               count: 4  },
  { name: 'ALATAKOKODO',             count: 6  },
  { name: 'DOMEABRA-POLICE DEPOT',   count: 2  },
  { name: 'DOMEABRA-OTOTOASE',       count: 5  },
  { name: 'PENKYE',                  count: 5  },
  { name: 'OSAKAM-FETTEH',           count: 11 },
  { name: 'EYIPEY',                  count: 9  },
  { name: 'SANKOR-DON BOSCO',        count: 20 },
  { name: 'DWOMBA',                  count: 8  },
  { name: 'ABASRABA SOUTH',          count: 6  },
  { name: 'DONKORYIEM-OBRAWOGUM',    count: 7  },
  { name: 'ABASRABA NORTH',          count: 8  },
  { name: 'KOJO BEEDU SOUTH',        count: 8  },
  { name: 'KOJO BEEDU NORTH',        count: 23 },
  { name: 'GYAHADZE',                count: 5  },
  { name: 'ESSUEKYIR',               count: 8  },
];

const TOTAL_VOTERS      = 137_812;
const TOTAL_STATIONS    = 142;
const TOTAL_AGENTS      = 143;   // 142 get a station, 1 doesn't
const ACTIVE_STATIONS   = 120;   // stations with votes + results (= stationsReporting)
async function main() {
  console.log('Seeding database...');

  // ── Clean ──────────────────────────────────────────────────────────────────
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
  console.log('✓ Cleaned existing data');

  // ── Elections ──────────────────────────────────────────────────────────────
  const election = await prisma.election.create({
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
  console.log('✓ Elections created');

  // ── Admin ──────────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@2024!', 12);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@effutu.gov.gh',
      password: adminPassword,
      name: 'Election Admin',
      role: 'ADMIN',
      phone: '+233 55 000 0001',
    },
  });
  console.log('✓ Admin created:', admin.email);

  // ── Support accounts ──────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      email: 'viewer@effutu.gov.gh',
      password: await bcrypt.hash('viewer123', 12),
      name: 'Public Viewer',
      role: 'VIEWER',
    },
  });
  await prisma.user.create({
    data: {
      email: 'officer@effutu.gov.gh',
      password: await bcrypt.hash('officer123', 12),
      name: 'Election Officer',
      role: 'OFFICER',
      phone: '+233 55 000 0003',
    },
  });
  console.log('✓ Viewer and Officer created');

  // ── 142 Polling Stations across 18 Electoral Areas ───────────────────────
  console.log(`Creating ${TOTAL_STATIONS} polling stations across ${ELECTORAL_AREAS.length} electoral areas...`);
  const stations: { id: string }[] = [];

  // Build flat station list ordered by electoral area
  const stationDefs: { psCode: string; name: string; location: string; electoralArea: string; latitude: number; longitude: number }[] = [];
  let stationCounter = 0;
  for (const area of ELECTORAL_AREAS) {
    for (let j = 0; j < area.count; j++) {
      stationCounter++;
      const coords = getRandomCoordinates();
      stationDefs.push({
        psCode: `PS${String(stationCounter).padStart(4, '0')}`,
        name: `Polling Station ${stationCounter}`,
        location: `${area.name}, Effutu District`,
        electoralArea: area.name,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }
  }

  const stationBatch = 50;
  for (let b = 0; b < Math.ceil(stationDefs.length / stationBatch); b++) {
    const batch = stationDefs.slice(b * stationBatch, (b + 1) * stationBatch);
    const created = await Promise.all(batch.map((s) => prisma.pollingStation.create({ data: s })));
    stations.push(...created);
  }
  console.log(`✓ ${stations.length} polling stations created`);

  // ── 156 Agents ─────────────────────────────────────────────────────────────
  console.log(`Creating ${TOTAL_AGENTS} agents...`);
  const agents: { id: string }[] = [];
  const agentPassword = await bcrypt.hash('agent123', 12);
  const firstNames = ['Kwesi', 'Ama', 'Kofi', 'Abena', 'Yaw', 'Akua', 'Kwame', 'Esi', 'Jude', 'Grace', 'Nana', 'Efua'];
  const lastNames  = ['Mensah', 'Darko', 'Asante', 'Osei', 'Boateng', 'Appiah', 'Annan', 'Owusu', 'Amoah', 'Ibrahim', 'Quansah', 'Bekoe'];
  const agentBatch = 50;
  for (let b = 0; b < Math.ceil(TOTAL_AGENTS / agentBatch); b++) {
    const start = b * agentBatch;
    const end = Math.min(start + agentBatch, TOTAL_AGENTS);
    const batch = [];
    for (let i = start; i < end; i++) {
      batch.push({
        email: `agent${String(i + 1).padStart(3, '0')}@effutu.gov.gh`,
        password: agentPassword,
        name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]} ${i + 1}`,
        role: 'AGENT' as const,
        phone: `+233 55 ${String(100000 + i).slice(-6)}`,
      });
    }
    const created = await Promise.all(batch.map((a) => prisma.user.create({ data: a })));
    agents.push(...created);
  }
  console.log(`✓ ${agents.length} agents created`);

  // Assign 142 stations to the first 142 agents (agent 143 gets no station)
  console.log('Assigning all 142 stations to agents...');
  for (let i = 0; i < stations.length; i++) {
    await prisma.pollingStation.update({
      where: { id: stations[i].id },
      data: { agentId: agents[i].id },
    });
  }
  console.log(`✓ All ${stations.length} stations assigned`);

  // ── Candidates ─────────────────────────────────────────────────────────────
  const candidatesData = [
    { name: 'Alexander Afenyo-Markin', party: 'NPP', partyFull: 'New Patriotic Party',       color: '#1E40AF' },
    { name: 'James Kofi Annan',        party: 'NDC', partyFull: 'National Democratic Congress', color: '#15803D' },
    { name: 'Independent Candidate',   party: 'IND', partyFull: 'Independent',                 color: '#9333EA' },
  ];
  const candidates = await Promise.all(
    candidatesData.map((c) => prisma.candidate.create({ data: { ...c, electionId: election.id } }))
  );
  console.log(`✓ ${candidates.length} candidates created`);

  // ── Voters + Turnout + Results ─────────────────────────────────────────────
  // Voter distribution: floor(137812/142)=970, remainder=72
  // 72 stations get 971 voters, 70 stations get 970 voters
  const baseVotersPerStation = Math.floor(TOTAL_VOTERS / TOTAL_STATIONS);
  const remainder = TOTAL_VOTERS - baseVotersPerStation * TOTAL_STATIONS;

  // To hit 63% total with only ACTIVE_STATIONS having turnout:
  // We'll let each active station have its own realistic turnout around 74-75%
  // (94739 target voted / 127099 voters in 131 stations = 74.5%)
  // The 24 pending stations have 0 turnout.

  const voterFirstNames = ['Kofi','Kwame','Ama','Akua','Yaw','Esi','Kwesi','Abena','Kojo','Adwoa','Kwaku','Afia','Nana','Efua','Papa','Maame'];
  const voterLastNames  = ['Agyemang','Serwaa','Bekoe','Mensah','Preko','Ofori','Asante','Boateng','Appiah','Ibrahim','Quansah','Annan','Amoah','Owusu'];
  const voterGenders = ['Male', 'Female'] as const;

  let voterIdCounter = 3_000_000_000;
  let totalCreatedVoters = 0;
  let totalVotedCreated = 0;
  const VOTER_BATCH = 2000;

  console.log(`Creating ${TOTAL_VOTERS.toLocaleString()} voters across ${TOTAL_STATIONS} stations (18 electoral areas)...`);
  console.log(`${ACTIVE_STATIONS} active stations will have turnout + results, ${TOTAL_STATIONS - ACTIVE_STATIONS} pending.`);

  for (let si = 0; si < stations.length; si++) {
    const station = stations[si];
    const stationVoterCount = baseVotersPerStation + (si < remainder ? 1 : 0);
    const isActive = si < ACTIVE_STATIONS;

    // ── Create voters for this station ────────────────────────────────────
    const voterIds: string[] = [];

    for (let b = 0; b < Math.ceil(stationVoterCount / VOTER_BATCH); b++) {
      const bStart = b * VOTER_BATCH;
      const bEnd = Math.min(bStart + VOTER_BATCH, stationVoterCount);
      const batch = [];
      for (let i = bStart; i < bEnd; i++) {
        voterIdCounter++;
        batch.push({
          voterId: String(voterIdCounter),
          firstName: voterFirstNames[Math.floor(Math.random() * voterFirstNames.length)],
          lastName:  voterLastNames[Math.floor(Math.random() * voterLastNames.length)],
          age: 18 + Math.floor(Math.random() * 60),
          gender: voterGenders[Math.floor(Math.random() * voterGenders.length)],
          stationId: station.id,
        });
      }
      await prisma.voter.createMany({ data: batch });
    }

    totalCreatedVoters += stationVoterCount;

    if (!isActive) {
      if ((si + 1) % 20 === 0 || si === stations.length - 1) {
        console.log(`  Station ${si + 1}/${TOTAL_STATIONS} — pending (no turnout)`);
      }
      continue;
    }

    // ── Fetch voter IDs for turnout (query back in batches) ────────────────
    const stationVoters = await prisma.voter.findMany({
      where: { stationId: station.id },
      select: { id: true },
    });

    // Target ~74.5% per active station (gives 63% overall)
    const turnoutRate = 0.73 + Math.random() * 0.04; // 73–77% variance per station
    const votedCount = Math.round(stationVoters.length * turnoutRate);
    const votingVoters = stationVoters.slice(0, votedCount);
    voterIds.push(...votingVoters.map((v) => v.id));

    // ── Create VoterTurnout records ────────────────────────────────────────
    for (let b = 0; b < Math.ceil(votingVoters.length / VOTER_BATCH); b++) {
      const batchVoters = votingVoters.slice(b * VOTER_BATCH, (b + 1) * VOTER_BATCH);
      await prisma.voterTurnout.createMany({
        data: batchVoters.map((v) => ({
          voterId: v.id,
          electionId: election.id,
          hasVoted: true,
          votedAt: new Date('2024-12-07T07:00:00Z'),
        })),
      });
    }

    totalVotedCreated += votedCount;

    // ── Submit ElectionResult for this station ────────────────────────────
    // NPP ~54%, NDC ~40%, IND remainder
    const nppVotes = Math.round(votedCount * (0.51 + Math.random() * 0.06));
    const ndcVotes = Math.round(votedCount * (0.37 + Math.random() * 0.06));
    const indVotes = Math.max(0, votedCount - nppVotes - ndcVotes);

    await prisma.electionResult.createMany({
      data: [
        { stationId: station.id, candidateId: candidates[0].id, votes: nppVotes, submittedById: admin.id, electionId: election.id },
        { stationId: station.id, candidateId: candidates[1].id, votes: ndcVotes, submittedById: admin.id, electionId: election.id },
        { stationId: station.id, candidateId: candidates[2].id, votes: indVotes, submittedById: admin.id, electionId: election.id },
      ],
    });

    if ((si + 1) % 20 === 0 || si === ACTIVE_STATIONS - 1) {
      console.log(`  Station ${si + 1}/${TOTAL_STATIONS} — ${votedCount} voted (${(turnoutRate * 100).toFixed(1)}%), results submitted`);
    }
  }

  const overallTurnout = ((totalVotedCreated / totalCreatedVoters) * 100).toFixed(1);
  console.log(`\n✓ ${totalCreatedVoters.toLocaleString()} voters created`);
  console.log(`✓ ${totalVotedCreated.toLocaleString()} voted (${overallTurnout}% turnout)`);
  console.log(`✓ ${ACTIVE_STATIONS} stations reported (results submitted)`);

  // ── Check-ins for active agents ────────────────────────────────────────────
  // Create CHECK_IN records for agents assigned to active stations
  const checkinData = [];
  for (let i = 0; i < ACTIVE_STATIONS; i++) {
    checkinData.push({
      userId: agents[i].id,
      stationId: stations[i].id,
      type: 'CHECK_IN',
      createdAt: new Date('2024-12-07T06:30:00Z'),
    });
  }
  await prisma.agentCheckIn.createMany({ data: checkinData });
  console.log(`✓ ${ACTIVE_STATIONS} agent check-ins created`);

  console.log('\n✅ Seed complete!');
  console.log(`   Voters:            ${totalCreatedVoters.toLocaleString()}`);
  console.log(`   Voted:             ${totalVotedCreated.toLocaleString()} (${overallTurnout}%)`);
  console.log(`   Stations:          ${TOTAL_STATIONS} across 18 electoral areas (${ACTIVE_STATIONS} reporting, ${TOTAL_STATIONS - ACTIVE_STATIONS} pending)`);
  console.log(`   Agents:            ${TOTAL_AGENTS} (${TOTAL_STATIONS} with stations, 1 unassigned)`);
  console.log(`   Candidates:        ${candidates.length}`);
  console.log('\nDefault accounts:');
  console.log(`   Admin:   admin@effutu.gov.gh  / Admin@2024!`);
  console.log(`   Officer: officer@effutu.gov.gh / officer123`);
  console.log(`   Viewer:  viewer@effutu.gov.gh  / viewer123`);
  console.log(`   Agents:  agent001@effutu.gov.gh … agent143@effutu.gov.gh / agent123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
