import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { sendReportEmail } from '@/lib/email';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportType = 'summary' | 'turnout' | 'results';

// ── Validation ────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── PDF helpers (same logic as /api/reports/pdf) ──────────────────────────────

function addWatermark(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(60);
  doc.setTextColor(220, 220, 220);
  doc.text('OFFICIAL', w / 2, h / 2, { align: 'center', angle: 45 });
  doc.setTextColor(0, 0, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSummaryPdf(doc: jsPDF, data: any) {
  const { election, stations, stationVotedMap, results, totalRegistered, totalVoted, turnoutPct, now } = data;
  addWatermark(doc);
  doc.setFontSize(20); doc.setTextColor(0, 51, 102);
  doc.text('Election Summary Report', 105, 25, { align: 'center' });
  doc.setFontSize(12); doc.setTextColor(80, 80, 80);
  doc.text(election.name, 105, 33, { align: 'center' });
  const electionDate = election.date
    ? new Date(election.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Date not set';
  doc.text(electionDate, 105, 40, { align: 'center' });
  doc.setFontSize(14); doc.setTextColor(0, 51, 102); doc.text('1. Overall Statistics', 14, 55);
  doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text(`Total Registered Voters: ${totalRegistered.toLocaleString()}`, 20, 64);
  doc.text(`Total Votes Cast: ${totalVoted.toLocaleString()}`, 20, 71);
  doc.text(`Overall Turnout: ${turnoutPct}%`, 20, 78);
  doc.text(`Total Polling Stations: ${stations.length}`, 20, 85);
  doc.setFontSize(14); doc.setTextColor(0, 51, 102); doc.text('2. Candidate Results', 14, 98);
  const candidateTotals: Record<string, { name: string; party: string; votes: number }> = {};
  const totalVotes = results.reduce((s: number, r: { votes: number }) => s + r.votes, 0);
  for (const r of results) {
    if (!candidateTotals[r.candidateId]) candidateTotals[r.candidateId] = { name: r.candidate.name, party: r.candidate.party, votes: 0 };
    candidateTotals[r.candidateId].votes += r.votes;
  }
  const candidateRows = Object.values(candidateTotals).sort((a, b) => b.votes - a.votes).map((c) => [
    c.name, c.party, c.votes.toLocaleString(), totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) + '%' : '0.0%',
  ]);
  autoTable(doc, { startY: 103, head: [['Candidate', 'Party', 'Votes', 'Percentage']], body: candidateRows, theme: 'striped', headStyles: { fillColor: [0, 51, 102] }, styles: { fontSize: 10 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY || 140;
  doc.setFontSize(14); doc.setTextColor(0, 51, 102); doc.text('3. Polling Station Summary', 14, afterTable + 12);
  const stationRows = stations.map((st: { id: string; psCode: string; name: string; voters: { id: string }[] }) => {
    const registered = st.voters.length;
    const voted = stationVotedMap[st.id] || 0;
    const pct = registered > 0 ? ((voted / registered) * 100).toFixed(1) + '%' : '0.0%';
    const hasResults = results.some((r: { pollingStation: { psCode: string } }) => r.pollingStation.psCode === st.psCode);
    return [st.psCode, st.name, registered.toString(), voted.toString(), pct, hasResults ? 'Reported' : 'Pending'];
  });
  autoTable(doc, { startY: afterTable + 17, head: [['PS Code', 'Station Name', 'Registered', 'Voted', 'Turnout %', 'Status']], body: stationRows, theme: 'striped', headStyles: { fillColor: [0, 51, 102] }, styles: { fontSize: 9 } });
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text(`Generated on ${now} \u2014 Effutu Constituency Election Monitoring System`, 105, ph - 10, { align: 'center' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTurnoutPdf(doc: jsPDF, data: any) {
  const { election, stations, stationVotedMap, totalRegistered, totalVoted, turnoutPct, now } = data;
  doc.setFontSize(20); doc.setTextColor(0, 51, 102); doc.text('Voter Turnout Report', 105, 25, { align: 'center' });
  doc.setFontSize(12); doc.setTextColor(80, 80, 80); doc.text(election.name, 105, 33, { align: 'center' });
  const stationRows = stations.map((st: { id: string; psCode: string; name: string; voters: { id: string }[] }) => {
    const registered = st.voters.length;
    const voted = stationVotedMap[st.id] || 0;
    const pct = registered > 0 ? ((voted / registered) * 100).toFixed(1) + '%' : '0.0%';
    return [st.psCode, st.name, registered.toLocaleString(), voted.toLocaleString(), pct];
  });
  stationRows.push(['', 'TOTAL', totalRegistered.toLocaleString(), totalVoted.toLocaleString(), turnoutPct + '%']);
  autoTable(doc, {
    startY: 42, head: [['PS Code', 'Station Name', 'Registered', 'Voted', 'Turnout %']], body: stationRows,
    theme: 'striped', headStyles: { fillColor: [0, 51, 102] }, styles: { fontSize: 10 },
    didParseCell: (d) => { if (d.row.index === stationRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [230, 240, 250]; } },
  });
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text(`Generated on ${now} \u2014 Effutu Constituency Election Monitoring System`, 105, ph - 10, { align: 'center' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildResultsPdf(doc: jsPDF, data: any) {
  const { election, stations, results, now } = data;
  const candidates = election.candidates.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  doc.setFontSize(20); doc.setTextColor(0, 51, 102); doc.text('Election Results Report', 105, 25, { align: 'center' });
  doc.setFontSize(12); doc.setTextColor(80, 80, 80); doc.text(election.name, 105, 33, { align: 'center' });
  doc.setFontSize(14); doc.setTextColor(0, 51, 102); doc.text('Results by Polling Station', 14, 48);
  const headers = ['PS Code', 'Station', ...candidates.map((c: { name: string; party: string }) => `${c.name} (${c.party})`), 'Total'];
  const resultsMap: Record<string, Record<string, number>> = {};
  for (const r of results) {
    if (!resultsMap[r.stationId]) resultsMap[r.stationId] = {};
    resultsMap[r.stationId][r.candidateId] = r.votes;
  }
  const bodyRows = stations.map((st: { id: string; psCode: string; name: string }) => {
    const stResults = resultsMap[st.id] || {};
    const candidateVotes = candidates.map((c: { id: string }) => (stResults[c.id] || 0).toLocaleString());
    const stTotal = candidates.reduce((s: number, c: { id: string }) => s + (stResults[c.id] || 0), 0);
    return [st.psCode, st.name, ...candidateVotes, stTotal.toLocaleString()];
  });
  const grandTotals = candidates.map((c: { id: string }) => stations.reduce((s: number, st: { id: string }) => s + ((resultsMap[st.id] || {})[c.id] || 0), 0));
  const grandTotal = grandTotals.reduce((s: number, v: number) => s + v, 0);
  bodyRows.push(['', 'TOTAL', ...grandTotals.map((v: number) => v.toLocaleString()), grandTotal.toLocaleString()]);
  autoTable(doc, {
    startY: 53, head: [headers], body: bodyRows, theme: 'striped',
    headStyles: { fillColor: [0, 51, 102], fontSize: 8 }, styles: { fontSize: 8 },
    didParseCell: (d) => { if (d.row.index === bodyRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [230, 240, 250]; } },
  });
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text(`Generated on ${now} \u2014 Effutu Constituency Election Monitoring System`, 105, ph - 10, { align: 'center' });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const body = await request.json();
    const { type, electionId, recipients } = body as {
      type: ReportType;
      electionId?: string;
      recipients: string[];
    };

    if (!type || !['summary', 'turnout', 'results'].includes(type)) {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 });
    }

    const invalidEmails = recipients.filter((e) => !isValidEmail(e));
    if (invalidEmails.length > 0) {
      return NextResponse.json({ error: `Invalid email addresses: ${invalidEmails.join(', ')}` }, { status: 400 });
    }

    if (recipients.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 recipients allowed' }, { status: 400 });
    }

    // Fetch election
    const election = electionId
      ? await prisma.election.findUnique({ where: { id: electionId }, include: { candidates: true } })
      : await prisma.election.findFirst({ where: { isActive: true }, include: { candidates: true } });

    if (!election) {
      return NextResponse.json({ error: 'No election found' }, { status: 404 });
    }

    // Fetch supporting data
    const stations = await prisma.pollingStation.findMany({
      include: { voters: { select: { id: true } } },
      orderBy: { psCode: 'asc' },
    });

    const turnoutData = await prisma.voterTurnout.findMany({
      where: { electionId: election.id, hasVoted: true },
      select: { voter: { select: { stationId: true } } },
    });

    const stationVotedMap: Record<string, number> = {};
    for (const t of turnoutData) {
      const sid = t.voter.stationId;
      stationVotedMap[sid] = (stationVotedMap[sid] || 0) + 1;
    }

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
    const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    // Build PDF
    const doc = new jsPDF();
    const reportData = { election, stations, stationVotedMap, results, totalRegistered, totalVoted, turnoutPct, now };

    if (type === 'summary')  buildSummaryPdf(doc, reportData);
    if (type === 'turnout')  buildTurnoutPdf(doc, reportData);
    if (type === 'results')  buildResultsPdf(doc, reportData);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `election-report-${type}-${dateStr}.pdf`;

    const typeLabel =
      type === 'summary' ? 'Summary Report' :
      type === 'turnout' ? 'Turnout Report' : 'Results Report';

    await sendReportEmail({
      recipients,
      reportType: type,
      electionName: election.name,
      senderName: user.name,
      pdfBuffer,
      fileName,
    });

    return NextResponse.json({
      success: true,
      message: `${typeLabel} sent to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`,
      recipients: recipients.length,
      fileName,
      electionName: election.name,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Report email error:', error);
    return NextResponse.json({ error: 'Failed to generate or send report' }, { status: 500 });
  }
}
