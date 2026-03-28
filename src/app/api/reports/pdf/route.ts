import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function GET(request: NextRequest) {
  try {
    await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'summary';
    const electionIdParam = searchParams.get('electionId');

    if (!['turnout', 'results', 'summary'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid report type. Must be: turnout, results, or summary' },
        { status: 400 }
      );
    }

    // Get requested election, or fall back to active
    const election = electionIdParam
      ? await prisma.election.findUnique({
          where: { id: electionIdParam },
          include: { candidates: true },
        })
      : await prisma.election.findFirst({
          where: { isActive: true },
          include: { candidates: true },
        });

    if (!election) {
      return NextResponse.json({ error: 'No election found' }, { status: 404 });
    }

    // Fetch stations with voter counts
    const stations = await prisma.pollingStation.findMany({
      include: {
        voters: { select: { id: true } },
      },
      orderBy: { psCode: 'asc' },
    });

    // Fetch turnout data for this specific election
    const turnoutData = await prisma.voterTurnout.findMany({
      where: { electionId: election.id, hasVoted: true },
      select: { voterId: true, voter: { select: { stationId: true } } },
    });

    // Build per-station turnout map
    const stationVotedMap: Record<string, number> = {};
    for (const t of turnoutData) {
      const sid = t.voter.stationId;
      stationVotedMap[sid] = (stationVotedMap[sid] || 0) + 1;
    }

    // Fetch results for this specific election
    const results = await prisma.electionResult.findMany({
      where: { electionId: election.id },
      include: {
        candidate: true,
        pollingStation: { select: { name: true, psCode: true } },
      },
      orderBy: { votes: 'desc' },
    });

    const totalRegistered = stations.reduce((s, st) => s + st.voters.length, 0);
    const totalVoted = turnoutData.length;
    const turnoutPct = totalRegistered > 0 ? ((totalVoted / totalRegistered) * 100).toFixed(1) : '0.0';
    const now = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const doc = new jsPDF();

    if (type === 'summary') {
      buildSummaryReport(doc, {
        election,
        stations,
        stationVotedMap,
        results,
        totalRegistered,
        totalVoted,
        turnoutPct,
        now,
      });
    } else if (type === 'turnout') {
      buildTurnoutReport(doc, {
        election,
        stations,
        stationVotedMap,
        totalRegistered,
        totalVoted,
        turnoutPct,
        now,
      });
    } else if (type === 'results') {
      buildResultsReport(doc, {
        election,
        stations,
        stationVotedMap,
        results,
        totalRegistered,
        totalVoted,
        now,
      });
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="election-report-${type}-${dateStr}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('PDF report error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF report' }, { status: 500 });
  }
}

// ---------- Helper types ----------

interface ReportElection {
  id: string;
  name: string;
  date: Date | null;
  candidates: { id: string; name: string; party: string }[];
}

interface ReportStation {
  id: string;
  psCode: string;
  name: string;
  voters: { id: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResultRow = any;

// ---------- Add watermark helper ----------

function addWatermark(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(60);
  doc.setTextColor(220, 220, 220);
  doc.text('OFFICIAL', pageWidth / 2, pageHeight / 2, {
    align: 'center',
    angle: 45,
  });
  // Reset text color
  doc.setTextColor(0, 0, 0);
}

// ---------- Summary Report ----------

function buildSummaryReport(
  doc: jsPDF,
  opts: {
    election: ReportElection;
    stations: ReportStation[];
    stationVotedMap: Record<string, number>;
    results: ResultRow[];
    totalRegistered: number;
    totalVoted: number;
    turnoutPct: string;
    now: string;
  }
) {
  const { election, stations, stationVotedMap, results, totalRegistered, totalVoted, turnoutPct, now } = opts;

  // Watermark
  addWatermark(doc);

  // Title
  doc.setFontSize(20);
  doc.setTextColor(0, 51, 102);
  doc.text('Election Summary Report', 105, 25, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  doc.text(election.name, 105, 33, { align: 'center' });
  const electionDate = election.date
    ? new Date(election.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Date not set';
  doc.text(electionDate, 105, 40, { align: 'center' });

  // Section 1: Overall Statistics
  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text('1. Overall Statistics', 14, 55);

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total Registered Voters: ${totalRegistered.toLocaleString()}`, 20, 64);
  doc.text(`Total Votes Cast: ${totalVoted.toLocaleString()}`, 20, 71);
  doc.text(`Overall Turnout: ${turnoutPct}%`, 20, 78);
  doc.text(`Total Polling Stations: ${stations.length}`, 20, 85);

  // Section 2: Candidate Results
  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text('2. Candidate Results', 14, 98);

  // Aggregate candidate results
  const candidateTotals: Record<string, { name: string; party: string; votes: number }> = {};
  const totalVotes = results.reduce((s: number, r: ResultRow) => s + r.votes, 0);

  for (const r of results) {
    if (!candidateTotals[r.candidateId]) {
      candidateTotals[r.candidateId] = { name: r.candidate.name, party: r.candidate.party, votes: 0 };
    }
    candidateTotals[r.candidateId].votes += r.votes;
  }

  const candidateRows = Object.values(candidateTotals)
    .sort((a, b) => b.votes - a.votes)
    .map((c) => [
      c.name,
      c.party,
      c.votes.toLocaleString(),
      totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) + '%' : '0.0%',
    ]);

  autoTable(doc, {
    startY: 103,
    head: [['Candidate', 'Party', 'Votes', 'Percentage']],
    body: candidateRows,
    theme: 'striped',
    headStyles: { fillColor: [0, 51, 102] },
    styles: { fontSize: 10 },
  });

  // Section 3: Polling Station Summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY || 140;

  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text('3. Polling Station Summary', 14, afterTable + 12);

  const stationRows = stations.map((st) => {
    const registered = st.voters.length;
    const voted = stationVotedMap[st.id] || 0;
    const pct = registered > 0 ? ((voted / registered) * 100).toFixed(1) + '%' : '0.0%';
    const hasResults = results.some((r: ResultRow) => r.pollingStation.psCode === st.psCode);
    return [st.psCode, st.name, registered.toString(), voted.toString(), pct, hasResults ? 'Reported' : 'Pending'];
  });

  autoTable(doc, {
    startY: afterTable + 17,
    head: [['PS Code', 'Station Name', 'Registered', 'Voted', 'Turnout %', 'Status']],
    body: stationRows,
    theme: 'striped',
    headStyles: { fillColor: [0, 51, 102] },
    styles: { fontSize: 9 },
  });

  // Footer and signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY || 200;
  const pageHeight = doc.internal.pageSize.getHeight();
  const signatureY = Math.max(finalY + 25, pageHeight - 40);

  if (signatureY > pageHeight - 15) {
    doc.addPage();
    addWatermark(doc);
  }

  const sigY = signatureY > pageHeight - 15 ? 30 : signatureY;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Electoral Officer Signature: _______________  Date: _______________', 14, sigY);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated on ${now} \u2014 Effutu Constituency Election Monitoring System`,
    105,
    pageHeight - 10,
    { align: 'center' }
  );
}

// ---------- Turnout Report ----------

function buildTurnoutReport(
  doc: jsPDF,
  opts: {
    election: ReportElection;
    stations: ReportStation[];
    stationVotedMap: Record<string, number>;
    totalRegistered: number;
    totalVoted: number;
    turnoutPct: string;
    now: string;
  }
) {
  const { election, stations, stationVotedMap, totalRegistered, totalVoted, turnoutPct, now } = opts;

  doc.setFontSize(20);
  doc.setTextColor(0, 51, 102);
  doc.text('Voter Turnout Report', 105, 25, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  doc.text(election.name, 105, 33, { align: 'center' });

  const stationRows = stations.map((st) => {
    const registered = st.voters.length;
    const voted = stationVotedMap[st.id] || 0;
    const pct = registered > 0 ? ((voted / registered) * 100).toFixed(1) + '%' : '0.0%';
    return [st.psCode, st.name, registered.toLocaleString(), voted.toLocaleString(), pct];
  });

  // Add total row
  stationRows.push([
    '',
    'TOTAL',
    totalRegistered.toLocaleString(),
    totalVoted.toLocaleString(),
    turnoutPct + '%',
  ]);

  autoTable(doc, {
    startY: 42,
    head: [['PS Code', 'Station Name', 'Registered', 'Voted', 'Turnout %']],
    body: stationRows,
    theme: 'striped',
    headStyles: { fillColor: [0, 51, 102] },
    styles: { fontSize: 10 },
    didParseCell: (data) => {
      // Bold the total row
      if (data.row.index === stationRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 240, 250];
      }
    },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated on ${now} \u2014 Effutu Constituency Election Monitoring System`,
    105,
    pageHeight - 10,
    { align: 'center' }
  );
}

// ---------- Results Report ----------

function buildResultsReport(
  doc: jsPDF,
  opts: {
    election: ReportElection;
    stations: ReportStation[];
    stationVotedMap: Record<string, number>;
    results: ResultRow[];
    totalRegistered: number;
    totalVoted: number;
    now: string;
  }
) {
  const { election, stations, stationVotedMap, results, now } = opts;
  const candidates = election.candidates.sort((a, b) => a.name.localeCompare(b.name));

  doc.setFontSize(20);
  doc.setTextColor(0, 51, 102);
  doc.text('Election Results Report', 105, 25, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  doc.text(election.name, 105, 33, { align: 'center' });

  // Per-station results table
  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text('Results by Polling Station', 14, 48);

  const headers = ['PS Code', 'Station', ...candidates.map((c) => c.name + ' (' + c.party + ')'), 'Total'];

  // Build results map: stationId -> candidateId -> votes
  const resultsMap: Record<string, Record<string, number>> = {};
  for (const r of results) {
    if (!resultsMap[r.stationId]) resultsMap[r.stationId] = {};
    resultsMap[r.stationId][r.candidateId] = r.votes;
  }

  const bodyRows = stations.map((st) => {
    const stResults = resultsMap[st.id] || {};
    const candidateVotes = candidates.map((c) => (stResults[c.id] || 0).toLocaleString());
    const stTotal = candidates.reduce((s, c) => s + (stResults[c.id] || 0), 0);
    return [st.psCode, st.name, ...candidateVotes, stTotal.toLocaleString()];
  });

  // Grand total row
  const grandTotals = candidates.map((c) =>
    stations.reduce((s, st) => s + ((resultsMap[st.id] || {})[c.id] || 0), 0)
  );
  const grandTotal = grandTotals.reduce((s, v) => s + v, 0);
  bodyRows.push(['', 'TOTAL', ...grandTotals.map((v) => v.toLocaleString()), grandTotal.toLocaleString()]);

  autoTable(doc, {
    startY: 53,
    head: [headers],
    body: bodyRows,
    theme: 'striped',
    headStyles: { fillColor: [0, 51, 102], fontSize: 8 },
    styles: { fontSize: 8 },
    didParseCell: (data) => {
      if (data.row.index === bodyRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 240, 250];
      }
    },
  });

  // Overall Results Summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY || 100;

  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text('Overall Results Summary', 14, afterTable + 12);

  const summaryRows = candidates
    .map((c, i) => ({
      name: c.name,
      party: c.party,
      votes: grandTotals[i],
    }))
    .sort((a, b) => b.votes - a.votes)
    .map((r) => [
      r.name,
      r.party,
      r.votes.toLocaleString(),
      grandTotal > 0 ? ((r.votes / grandTotal) * 100).toFixed(1) + '%' : '0.0%',
    ]);

  autoTable(doc, {
    startY: afterTable + 17,
    head: [['Candidate', 'Party', 'Total Votes', 'Percentage']],
    body: summaryRows,
    theme: 'striped',
    headStyles: { fillColor: [0, 51, 102] },
    styles: { fontSize: 10 },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated on ${now} \u2014 Effutu Constituency Election Monitoring System`,
    105,
    pageHeight - 10,
    { align: 'center' }
  );
}
