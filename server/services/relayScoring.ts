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
    const fieldLabel = fr.label || getFieldLabel(theme, fr.field);
    const wasClaimed = Boolean(claims[fr.field]);

    if (fr.result === 'hit') {
      if (!claims[fr.field]) {
        scoreDelta += RELAY_FIELD_POINTS;
        const claim: FieldClaim = {
          sessionId,
          playerName,
          round: roundNumber,
          points: RELAY_FIELD_POINTS,
          field: fr.field,
          fieldLabel,
        };
        newClaims[fr.field] = claim;
        breakdown.push(claim);
      }
      // 已被他人认领的字段再次猜对：不加分也不扣分
    } else if (wasClaimed) {
      scoreDelta -= RELAY_WRONG_CLAIM_PENALTY;
      breakdown.push({
        sessionId,
        playerName,
        round: roundNumber,
        points: -RELAY_WRONG_CLAIM_PENALTY,
        field: fr.field,
        fieldLabel: `${fieldLabel}（已认领·答错）`,
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
