import type { ReverseOperator } from '../../types';

export function reverseOperatorLabel(op: ReverseOperator): string {
  switch (op) {
    case '==':
      return '是';
    case '!=':
      return '不是';
    case '>=':
      return '大于等于';
    case '<=':
      return '小于等于';
    default:
      return op;
  }
}
