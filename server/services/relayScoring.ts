import {
  FieldClaim,
  FieldCompare,
  RELAY_FIELD_POINTS,
  RELAY_FULL_CORRECT_BONUS,
  RELAY_WRONG_CLAIM_PENALTY,
  Theme,
} from '../types';
import { getFieldLabel } from '../types';

export interface RelayFieldClaims {
  [field: string]: FieldClaim;
}

export interface RelayScoreResult {
  scoreDelta: number;
  newClaims: RelayFieldClaims;
  breakdown: FieldClaim[];
  fullCorrect: boolean;
}

export function initRelayClaims(): RelayFieldClaims {
  return {};
}

export function parseRelayClaims(raw: RelayFieldClaims | undefined): RelayFieldClaims {
  return raw ?? {};
}

export function scoreRelayGuess(
  theme: Theme,
  fieldResults: FieldCompare[],
  isCorrect: boolean,
  claims: RelayFieldClaims,
  sessionId: string,
  playerName: string,
  roundNumber: number
): RelayScoreResult {
  let scoreDelta = 0;
  const breakdown: FieldClaim[] = [];
  const newClaims = { ...claims };

  if (isCorrect) {
    scoreDelta += RELAY_FULL_CORRECT_BONUS;
    breakdown.push({
      sessionId,
      playerName,
      round: roundNumber,
      points: RELAY_FULL_CORRECT_BONUS,
      field: '__full__',
      fieldLabel: '完全猜对',
    });
    return { scoreDelta, newClaims, breakdown, fullCorrect: true };
  }

  for (const fr of fieldResults) {
    if (fr.result !== 'hit') continue;
    const existing = newClaims[fr.field];
    if (!existing) {
      scoreDelta += RELAY_FIELD_POINTS;
      const claim: FieldClaim = {
        sessionId,
        playerName,
        round: roundNumber,
        points: RELAY_FIELD_POINTS,
        field: fr.field,
        fieldLabel: fr.label || getFieldLabel(theme, fr.field),
      };
      newClaims[fr.field] = claim;
      breakdown.push(claim);
    } else if (existing.sessionId !== sessionId) {
      scoreDelta -= RELAY_WRONG_CLAIM_PENALTY;
      breakdown.push({
        sessionId,
        playerName,
        round: roundNumber,
        points: -RELAY_WRONG_CLAIM_PENALTY,
        field: fr.field,
        fieldLabel: fr.label || getFieldLabel(theme, fr.field),
      });
    }
  }

  return { scoreDelta, newClaims, breakdown, fullCorrect: false };
}

export function applyClaimsToFieldResults(
  fieldResults: FieldCompare[],
  claims: RelayFieldClaims
): FieldCompare[] {
  return fieldResults.map((fr) => ({
    ...fr,
    claimedBy: claims[fr.field]?.playerName ?? null,
  }));
}

export function claimsToList(claims: RelayFieldClaims): FieldClaim[] {
  return Object.values(claims);
}
