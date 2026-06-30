/** Shared helpers extracted to avoid circular imports with progressiveHint */
import { CharacterEntry, HintInfo, Theme } from '../types';
import { formatValue } from './compareEngine';
import {
  getCharacterField,
  getNBATeamDisplay,
} from './dataLoader';
import { getFieldLabel } from '../types';
import { isHintFieldExcluded } from './footballHints';
import { isNBAHintFieldExcluded } from './nbaHints';
import { isPokemonHintFieldExcluded } from './pokemonHints';

export function buildHint(
  theme: Theme,
  answer: CharacterEntry,
  hintField: string,
  _activeFields: string[]
): HintInfo {
  if (theme === 'pokemon' && isPokemonHintFieldExcluded(hintField)) {
    throw new Error(`Field "${hintField}" cannot be used as a hint`);
  }
  if (isHintFieldExcluded(hintField)) {
    throw new Error(`Field "${hintField}" cannot be used as a hint`);
  }
  if (isNBAHintFieldExcluded(hintField)) {
    throw new Error(`Field "${hintField}" cannot be used as a hint`);
  }
  let value = getCharacterField(answer, hintField, theme);
  if (theme === 'nba' && hintField === 'team') {
    value = getNBATeamDisplay(String(value || ''));
  }
  return {
    field: hintField,
    label: getFieldLabel(theme, hintField),
    value: formatValue(value, hintField),
  };
}
