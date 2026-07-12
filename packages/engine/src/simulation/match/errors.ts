export class SimulationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SimulationError';
    this.code = code;
  }
}

export class InvalidSimulationInputError extends SimulationError {
  constructor(message: string) {
    super('InvalidSimulationInput', message);
    this.name = 'InvalidSimulationInputError';
  }
}

export class IncompatibleBalanceConfigError extends SimulationError {
  constructor(message: string) {
    super('IncompatibleBalanceConfig', message);
    this.name = 'IncompatibleBalanceConfigError';
  }
}

export class InvalidSnapshotError extends SimulationError {
  constructor(message: string) {
    super('InvalidSnapshot', message);
    this.name = 'InvalidSnapshotError';
  }
}

export class SafetyLimitExceededError extends SimulationError {
  constructor(message: string) {
    super('SafetyLimitExceeded', message);
    this.name = 'SafetyLimitExceededError';
  }
}

export class IllegalStateTransitionError extends SimulationError {
  constructor(message: string) {
    super('IllegalStateTransition', message);
    this.name = 'IllegalStateTransitionError';
  }
}

export class StatisticsReconciliationError extends SimulationError {
  readonly diagnostics: string[];

  constructor(message: string, diagnostics: string[] = []) {
    super('StatisticsReconciliation', message);
    this.name = 'StatisticsReconciliationError';
    this.diagnostics = diagnostics;
  }
}
