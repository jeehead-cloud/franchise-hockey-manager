import type {
  CoachRow,
  CompetitionEditionRow,
  CompetitionRow,
  CountryRow,
  LeagueRow,
  Manifest,
  PlayerRow,
  TeamRow,
} from './schemas.js';

export interface EntityCounts {
  worldSeasons: number;
  countries: number;
  leagues: number;
  teams: number;
  players: number;
  coaches: number;
  competitions: number;
  competitionEditions: number;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  externalId?: string;
  path?: string;
}

export interface LoadedDataset {
  dir: string;
  manifest: Manifest;
  countries: CountryRow[];
  leagues: LeagueRow[];
  teams: TeamRow[];
  players: PlayerRow[];
  coaches: CoachRow[];
  competitions: CompetitionRow[];
  competitionEditions: CompetitionEditionRow[];
}

export interface ValidationReport {
  valid: boolean;
  dataset: {
    id: string;
    name: string;
    schemaVersion: number;
    sourceName: string;
    sourceUpdatedAt: string;
    worldSeasonLabel: string;
    fictional: boolean;
    notes?: string;
  };
  counts: EntityCounts;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface DomainCounts {
  worldSeasons: number;
  countries: number;
  leagues: number;
  teams: number;
  players: number;
  coaches: number;
  competitions: number;
  competitionEditions: number;
}

export interface WorldStatus {
  initialized: boolean;
  canInitialize: boolean;
  dataset: {
    id: string;
    name: string;
    schemaVersion: number;
    sourceName: string;
    sourceUpdatedAt: string;
    fictional: boolean;
    available: boolean;
  } | null;
  datasetError?: string;
  counts: DomainCounts;
  initializedAt?: string | null;
  datasetId?: string | null;
  schemaVersion?: number | null;
  blockReason?: string | null;
}

export interface InitializeResult {
  initialized: true;
  datasetId: string;
  initializedAt: string;
  created: EntityCounts;
  fictional: boolean;
}
