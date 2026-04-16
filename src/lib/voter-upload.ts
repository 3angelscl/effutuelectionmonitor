export interface VoterUploadStationRef {
  id: string;
  psCode: string;
  name: string;
}

export interface VoterUploadExistingVoterRef {
  voterId: string;
  stationId: string;
}

export interface VoterUploadRowReport {
  rowNum: number;
  voterId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: 'Male' | 'Female' | null;
  psCode: string;
  photo: string | null;
  stationName: string | null;
  status: 'valid' | 'override' | 'error';
  isOverride: boolean;
  errors: string[];
}

export interface VoterUploadValidRow {
  voterId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: 'Male' | 'Female';
  stationId: string;
  photo: string | null;
}

export interface VoterUploadValidationResult {
  rows: VoterUploadRowReport[];
  validRows: VoterUploadValidRow[];
  overrideRows: VoterUploadValidRow[];
  totalRows: number;
  validRowsCount: number;
  overrideRowsCount: number;
  invalidRowsCount: number;
  errors: string[];
}

function readOptionalPhotoUrl(row: Record<string, unknown>): { photo: string | null; error?: string } {
  const raw = String(
    row['photo_url'] ??
    row['photoUrl'] ??
    row['photo'] ??
    row['Photo'] ??
    row['PHOTO_URL'] ??
    row['cloudinary_url'] ??
    row['cloudinaryUrl'] ??
    row['Cloudinary URL'] ??
    '',
  ).trim();

  if (!raw) return { photo: null };
  if (raw.startsWith('/') || URL.canParse(raw)) return { photo: raw };
  return { photo: null, error: 'Invalid photo URL' };
}

function readGender(row: Record<string, unknown>): { gender: 'Male' | 'Female' | null; error?: string } {
  const raw = String(
    row['gender'] ??
    row['Gender'] ??
    row['sex'] ??
    row['Sex'] ??
    row['SEX'] ??
    '',
  ).trim().toLowerCase();

  if (!raw) return { gender: null, error: 'Missing gender' };
  if (['m', 'male'].includes(raw)) return { gender: 'Male' };
  if (['f', 'female'].includes(raw)) return { gender: 'Female' };
  return { gender: null, error: 'Invalid gender (use Male or Female)' };
}

function getStringField(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export function validateVoterUploadRows(
  rows: Record<string, unknown>[],
  stations: VoterUploadStationRef[],
  existingVoters: VoterUploadExistingVoterRef[],
  allowOverride = false,
): VoterUploadValidationResult {
  const stationMap = new Map(stations.map((s) => [s.psCode, s]));
  const existingKeys = new Set(existingVoters.map((v) => `${v.voterId}|${v.stationId}`));
  const seenKeys = new Set<string>();

  const reports: VoterUploadRowReport[] = [];
  const validRows: VoterUploadValidRow[] = [];
  const overrideRows: VoterUploadValidRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const voterId = getStringField(row, ['voter_id', 'voterId', 'Voter ID', 'VOTER_ID']);
    const firstName = getStringField(row, ['first_name', 'firstName', 'First Name', 'FIRST_NAME']);
    const lastName = getStringField(row, ['last_name', 'lastName', 'Last Name', 'LAST_NAME']);
    const age = parseInt(getStringField(row, ['age', 'Age', 'AGE']) || '0', 10);
    const { gender, error: genderError } = readGender(row);
    const psCode = getStringField(row, ['ps_code', 'psCode', 'PS Code', 'PS_CODE', 'polling_station_code']);
    const { photo, error: photoError } = readOptionalPhotoUrl(row);
    const rowErrors: string[] = [];

    if (!voterId || !firstName || !lastName || !psCode) {
      rowErrors.push('Missing required fields');
    }

    if (voterId && !/^\d{10}$/.test(voterId)) {
      rowErrors.push('Voter ID must be exactly 10 digits');
    }

    if (genderError) {
      rowErrors.push(genderError);
    }

    if (photoError) {
      rowErrors.push(photoError);
    }

    if (Number.isNaN(age) || age < 18) {
      rowErrors.push('Invalid age');
    }

    const station = stationMap.get(psCode);
    if (!station) {
      rowErrors.push(`Polling station ${psCode || '(blank)'} not found`);
    }

    const key = station ? `${voterId}|${station.id}` : '';
    const isExisting = key ? existingKeys.has(key) : false;

    // "already exists" is only an error when override is not allowed
    if (isExisting && !allowOverride) {
      rowErrors.push(`Voter ID ${voterId} already exists at station ${psCode}`);
    }

    if (key && seenKeys.has(key)) {
      rowErrors.push(`Duplicate voter ID ${voterId} in file`);
    }

    const hasErrors = rowErrors.length > 0;
    const isOverride = isExisting && allowOverride && !hasErrors;

    let status: VoterUploadRowReport['status'];
    if (hasErrors) {
      status = 'error';
    } else if (isOverride) {
      status = 'override';
    } else {
      status = 'valid';
    }

    if (!hasErrors && station && gender) {
      const rowData: VoterUploadValidRow = {
        voterId,
        firstName,
        lastName,
        age,
        gender,
        stationId: station.id,
        photo,
      };
      if (isOverride) {
        overrideRows.push(rowData);
      } else {
        validRows.push(rowData);
      }
      seenKeys.add(key);
      if (!isExisting) existingKeys.add(key);
    }

    if (hasErrors) {
      errors.push(`Row ${rowNum}: ${rowErrors.join('; ')}`);
    }

    reports.push({
      rowNum,
      voterId,
      firstName,
      lastName,
      age,
      gender,
      psCode,
      photo,
      stationName: station?.name || null,
      status,
      isOverride,
      errors: rowErrors,
    });
  }

  return {
    rows: reports,
    validRows,
    overrideRows,
    totalRows: rows.length,
    validRowsCount: validRows.length,
    overrideRowsCount: overrideRows.length,
    invalidRowsCount: errors.length,
    errors,
  };
}
