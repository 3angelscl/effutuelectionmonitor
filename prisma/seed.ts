import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import bcrypt from 'bcryptjs';

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Clean existing data (order matters — child records first)
  await prisma.notification.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.turnoutSnapshot.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.voterTurnout.deleteMany();
  await prisma.electionResult.deleteMany();
  await prisma.voter.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.pollingStation.deleteMany();
  await prisma.election.deleteMany();
  await prisma.user.deleteMany();

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

  // Create Polling Stations (global — shared across elections)
  const stationsData = [
    { psCode: 'C040101', name: 'Winneba Town Hall A', location: 'Winneba Central', latitude: 5.3525, longitude: -0.6245 },
    { psCode: 'C040102', name: 'Zongo Mosque Area', location: 'Winneba Zongo', latitude: 5.3548, longitude: -0.6230 },
    { psCode: 'C040103', name: 'UEW North Campus', location: 'University of Education, Winneba', latitude: 5.3610, longitude: -0.6310 },
    { psCode: 'C040104', name: 'Sankor School Park', location: 'Sankor, Winneba', latitude: 5.3470, longitude: -0.6180 },
    { psCode: 'C040105', name: 'Gyatakrom Community Center', location: 'Gyatakrom', latitude: 5.3680, longitude: -0.6400 },
    { psCode: 'C120101', name: 'Winneba Court House', location: 'Winneba', latitude: 5.3500, longitude: -0.6270 },
    { psCode: 'C120105', name: 'Zongo Mosque Area B', location: 'Winneba Zongo', latitude: 5.3555, longitude: -0.6215 },
    { psCode: 'C120120', name: 'UEW South Campus', location: 'Winneba', latitude: 5.3450, longitude: -0.6290 },
    { psCode: 'B100202', name: 'Alata Station', location: 'Alata, Winneba', latitude: 5.3580, longitude: -0.6350 },
    { psCode: 'B100301', name: 'Essuekyir Primary School', location: 'Essuekyir', latitude: 5.3720, longitude: -0.6450 },
  ];

  const stations = await Promise.all(
    stationsData.map((s) =>
      prisma.pollingStation.create({ data: s })
    )
  );
  console.log(`${stations.length} polling stations created`);

  // Create Agents and assign to stations
  const agentPassword = await bcrypt.hash('agent123', 12);
  const agentsData = [
    { name: 'Kwesi Mensah', email: 'kwesi@effutu.gov.gh', phone: '+233 55 123 4567' },
    { name: 'Ama Darko', email: 'ama@effutu.gov.gh', phone: '+233 55 234 5678' },
    { name: 'Kofi Asante', email: 'kofi@effutu.gov.gh', phone: '+233 55 345 6789' },
    { name: 'Abena Osei', email: 'abena@effutu.gov.gh', phone: '+233 20 567 8901' },
    { name: 'John Doe', email: 'john@effutu.gov.gh', phone: '+233 55 311 2233' },
  ];

  const agents = [];
  for (let i = 0; i < agentsData.length; i++) {
    const agent = await prisma.user.create({
      data: {
        ...agentsData[i],
        password: agentPassword,
        role: 'AGENT',
      },
    });
    agents.push(agent);
    if (i < stations.length) {
      await prisma.pollingStation.update({
        where: { id: stations[i].id },
        data: { agentId: agent.id },
      });
    }
    console.log(`Agent ${agent.name} assigned to ${i < stations.length ? stations[i].psCode : 'none'}`);
  }

  // Create Viewer
  const viewerPassword = await bcrypt.hash('viewer123', 12);
  await prisma.user.create({
    data: {
      email: 'viewer@effutu.gov.gh',
      password: viewerPassword,
      name: 'Public Viewer',
      role: 'VIEWER',
    },
  });
  console.log('Viewer created');

  // Create Election Officer
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
  console.log('Election Officer created');

  // Create Candidates for Election 2024
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
  console.log(`${candidates.length} candidates created`);

  // Generate Voters (global — shared across elections)
  const firstNames = [
    'Kofi', 'Kwame', 'Ama', 'Akua', 'Yaw', 'Esi', 'Kwesi', 'Abena',
    'Kojo', 'Adwoa', 'Kwaku', 'Afia', 'Nana', 'Efua', 'Papa', 'Maame',
    'Ekow', 'Araba', 'Kobina', 'Adjoa', 'Samuel', 'Grace', 'Isaac', 'Fatima',
    'Yaw', 'Amma', 'Fiifi', 'Akosua',
  ];

  const lastNames = [
    'Agyemang', 'Serwaa', 'Bekoe', 'Mensah', 'Preko', 'Ofori', 'Asante',
    'Boateng', 'Appiah', 'Ibrahim', 'Quansah', 'Annan', 'Amoah', 'Owusu',
    'Dadzie', 'Essien', 'Turkson', 'Inkoom', 'Gyan', 'Acquah',
  ];

  let voterCounter = 3000000000;
  const voterBatchSize: Record<string, number> = {
    'C040101': 950,
    'C040102': 800,
    'C040103': 1500,
    'C040104': 650,
    'C040105': 650,
    'C120101': 850,
    'C120105': 1120,
    'C120120': 2400,
    'B100202': 500,
    'B100301': 700,
  };

  for (const station of stations) {
    const count = voterBatchSize[station.psCode] || 500;
    const votersToCreate = [];

    for (let i = 0; i < count; i++) {
      voterCounter++;
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      votersToCreate.push({
        voterId: String(voterCounter),
        firstName: fn,
        lastName: ln,
        age: 18 + Math.floor(Math.random() * 60),
        psCode: station.psCode,
        stationId: station.id,
      });
    }

    await prisma.voter.createMany({ data: votersToCreate });
    console.log(`${count} voters created for ${station.psCode} (${station.name})`);
  }

  // Simulate voting activity using VoterTurnout (per-election)
  const activeStationCodes = ['C040101', 'C040103', 'C040105', 'C120101'];

  for (const psCode of activeStationCodes) {
    const station = stations.find((s) => s.psCode === psCode)!;
    const stationVoters = await prisma.voter.findMany({
      where: { stationId: station.id },
    });

    // Mark ~60-85% as voted
    const votePercentage = 0.6 + Math.random() * 0.25;
    const votedCount = Math.floor(stationVoters.length * votePercentage);
    const votersToMark = stationVoters.slice(0, votedCount);

    // Create VoterTurnout records for this election
    const turnoutData = votersToMark.map((v) => ({
      voterId: v.id,
      electionId: election2024.id,
      hasVoted: true,
      votedAt: new Date(),
    }));

    await prisma.voterTurnout.createMany({ data: turnoutData });

    console.log(`Simulated ${votedCount}/${stationVoters.length} votes at ${psCode}`);
  }

  // Submit results for 2 stations
  const completedCodes = ['C040101', 'C040105'];
  for (const psCode of completedCodes) {
    const station = stations.find((s) => s.psCode === psCode)!;
    const votedCount = await prisma.voterTurnout.count({
      where: {
        voter: { stationId: station.id },
        electionId: election2024.id,
        hasVoted: true,
      },
    });

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

    console.log(`Results submitted for ${psCode}: NPP=${nppVotes}, NDC=${ndcVotes}, IND=${indVotes}`);
  }

  // Generate Activity Logs for agents
  const baseDate = new Date('2024-12-07T06:00:00');

  for (let ai = 0; ai < agents.length; ai++) {
    const agent = agents[ai];
    const agentStation = ai < stations.length ? stations[ai] : null;
    const logs = [];

    // Login at start of day
    logs.push({
      userId: agent.id,
      type: 'LOGIN',
      title: 'System Login',
      detail: 'Agent logged in from mobile device',
      metadata: JSON.stringify({ device: 'Android', ip: '192.168.1.' + Math.floor(Math.random() * 255) }),
      createdAt: new Date(baseDate.getTime() + Math.floor(Math.random() * 30) * 60000),
    });

    // Arrive at station
    if (agentStation) {
      logs.push({
        userId: agent.id,
        type: 'STATION_ARRIVAL',
        title: 'Arrived at Station',
        detail: `Checked in at ${agentStation.name} (${agentStation.psCode})`,
        metadata: null,
        createdAt: new Date(baseDate.getTime() + 45 * 60000 + Math.floor(Math.random() * 15) * 60000),
      });
    }

    // Voter check-ins throughout the day
    const checkinCount = 5 + Math.floor(Math.random() * 10);
    for (let i = 0; i < checkinCount; i++) {
      const hourOffset = 1 + Math.floor(Math.random() * 10); // 7am - 4pm
      const minOffset = Math.floor(Math.random() * 60);
      logs.push({
        userId: agent.id,
        type: 'VOTER_CHECKIN',
        title: 'Voter Checked In',
        detail: `Voter ID: ${3000000000 + Math.floor(Math.random() * 10000)}`,
        metadata: JSON.stringify({ voterId: String(3000000000 + Math.floor(Math.random() * 10000)) }),
        createdAt: new Date(baseDate.getTime() + (hourOffset * 60 + minOffset) * 60000),
      });
    }

    // Random connectivity alert for some agents
    if (Math.random() > 0.5) {
      logs.push({
        userId: agent.id,
        type: 'CONNECTIVITY_ALERT',
        title: 'Connectivity Alert',
        detail: 'Network signal dropped below threshold — data sync paused',
        metadata: JSON.stringify({ signalStrength: Math.floor(Math.random() * 30) + '%' }),
        createdAt: new Date(baseDate.getTime() + (4 + Math.floor(Math.random() * 4)) * 3600000),
      });
    }

    // Results submitted for agents at completed stations
    if (agentStation && completedCodes.includes(agentStation.psCode)) {
      logs.push({
        userId: agent.id,
        type: 'RESULTS_SUBMITTED',
        title: 'Results Submitted',
        detail: `Final tally submitted for ${agentStation.psCode}`,
        metadata: null,
        createdAt: new Date(baseDate.getTime() + 11 * 3600000 + Math.floor(Math.random() * 60) * 60000),
      });
    }

    // Logout at end of day
    logs.push({
      userId: agent.id,
      type: 'LOGOUT',
      title: 'System Logout',
      detail: 'Agent logged out',
      metadata: null,
      createdAt: new Date(baseDate.getTime() + 12 * 3600000 + Math.floor(Math.random() * 60) * 60000),
    });

    await prisma.activityLog.createMany({ data: logs });
    console.log(`${logs.length} activity logs created for ${agent.name}`);
  }

  // Create sample notifications for admin
  const notificationsData = [
    { userId: admin.id, type: 'RESULT_SUBMITTED', title: 'Results submitted for C040101', message: 'Winneba Town Hall A has submitted final results', link: '/admin/stations' },
    { userId: admin.id, type: 'AGENT_LOGIN', title: 'Agent Kwesi Mensah logged in', message: 'Logged in from mobile device', link: '/admin/agents' },
    { userId: admin.id, type: 'ALERT', title: 'Connectivity alert at C040103', message: 'UEW North Campus reporting low signal', link: '/admin/stations' },
    { userId: admin.id, type: 'SYSTEM', title: 'Election day started', message: 'General Election 2024 is now ONGOING', link: '/admin' },
    { userId: admin.id, type: 'RESULT_SUBMITTED', title: 'Results submitted for C040105', message: 'Gyatakrom Community Center has submitted final results', link: '/admin/stations' },
  ];
  await prisma.notification.createMany({ data: notificationsData });
  console.log(`${notificationsData.length} notifications created for admin`);

  // Create sample chat messages
  const chatMessages = [
    { senderId: agents[0].id, receiverId: admin.id, message: 'Good morning admin. I have arrived at Winneba Town Hall A and setup is complete.' },
    { senderId: admin.id, receiverId: agents[0].id, message: 'Great work Kwesi. Please begin voter check-in when ready.' },
    { senderId: agents[0].id, receiverId: admin.id, message: 'Voter check-in has started. High turnout expected today.' },
    { senderId: agents[2].id, receiverId: admin.id, message: 'Admin, we are experiencing network issues at UEW North Campus. Using offline mode.' },
    { senderId: admin.id, receiverId: agents[2].id, message: 'Noted Kofi. Keep recording offline and sync when connection restores.' },
  ];
  for (const msg of chatMessages) {
    await prisma.chatMessage.create({ data: msg });
  }
  console.log(`${chatMessages.length} chat messages created`);

  console.log('\nSeed complete!');
  console.log('\nLogin credentials:');
  console.log('Admin:   admin@effutu.gov.gh / admin123');
  console.log('Agent:   kwesi@effutu.gov.gh / agent123');
  console.log('Officer: officer@effutu.gov.gh / officer123');
  console.log('Viewer:  viewer@effutu.gov.gh / viewer123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
