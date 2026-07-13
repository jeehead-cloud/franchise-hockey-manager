import { seededSigned } from './budget.js';
import type { FormChange, PlayerDevelopmentConfig } from './types.js';

export function updateAnnualForm(input: {
  formBefore: number;
  config: PlayerDevelopmentConfig;
  playerId: string;
  baseSeed: string;
  effectiveDate: string;
}): FormChange {
  const { formBefore, config } = input;
  const regression =
    -formBefore * config.form.annualRegressionToMean;
  const variance = seededSigned(
    `${input.baseSeed}:form:${input.playerId}:${input.effectiveDate}`,
    2 * config.variance.attributeRandomness,
  );
  let formAfter = Math.round(formBefore + regression + variance);
  formAfter = Math.max(config.form.minimum, Math.min(config.form.maximum, formAfter));
  return {
    formBefore,
    regression: Math.round(regression * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    formAfter,
  };
}
