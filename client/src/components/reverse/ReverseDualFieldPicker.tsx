import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { getReverseValues, submitReverseQuery } from '../../api';
import type {
  GameSession,
  ReverseCondition,
  ReverseFieldMeta,
  ReverseOperator,
  ReverseValuesResponse,
} from '../../types';
import { reverseOperatorLabel } from './reverseUtils';

interface Props {
  session: GameSession;
  choices: ReverseFieldMeta[];
  onQuerySuccess: (result: {
    newlyEliminatedIds: string[];
    session: GameSession;
    matched: boolean;
    autoResolved?: boolean;
    roundScore?: number;
    answer?: { name: string; imageUrl: string | null };
  }) => void;
  disabled?: boolean;
}

function blockClass(selected: boolean, vertical = false) {
  return `${
    vertical ? 'px-2 py-1.5 text-[11px] leading-tight' : 'px-2.5 py-1.5 text-xs'
  } min-h-[32px] rounded-lg border font-medium transition-all ${
    vertical ? 'w-full text-center' : 'whitespace-nowrap'
  } ${
    selected
      ? 'border-apple-blue bg-apple-blue/10 text-apple-blue'
      : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 active:scale-[0.98]'
  }`;
}

function ReverseDualFieldPicker({
  session,
  choices,
  onQuerySuccess,
  disabled,
}: Props) {
  const [picked, setPicked] = useState<ReverseFieldMeta | null>(null);
  const [values, setValues] = useState<ReverseValuesResponse | null>(null);
  const [operator, setOperator] = useState<ReverseOperator>('==');
  const [enumValue, setEnumValue] = useState('');
  const [numericValue, setNumericValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetValueForm = useCallback(() => {
    setValues(null);
    setOperator('==');
    setEnumValue('');
    setNumericValue('');
    setError('');
  }, []);

  const handleReselect = useCallback(() => {
    setPicked(null);
    resetValueForm();
  }, [resetValueForm]);

  const handlePickField = useCallback(
    async (field: ReverseFieldMeta) => {
      if (disabled || loading) return;
      setPicked(field);
      resetValueForm();
      setOperator(field.kind === 'numeric' ? '>=' : '==');
      setLoading(true);
      try {
        const res = await getReverseValues(session.sessionId, field.field);
        setValues(res);
        if (res.kind === 'enum' && res.values.length > 0) {
          setEnumValue(res.values[0]);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [disabled, loading, resetValueForm, session.sessionId]
  );

  const handleSubmit = useCallback(async () => {
    if (!picked || loading) return;
    const condition: ReverseCondition =
      picked.kind === 'numeric'
        ? { field: picked.field, operator, value: Number(numericValue) }
        : { field: picked.field, operator, value: enumValue };

    if (picked.kind === 'numeric' && isNaN(Number(numericValue))) {
      setError('请输入有效数字');
      return;
    }
    if (picked.kind === 'enum' && !enumValue) {
      setError('请选择值');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await submitReverseQuery(session.sessionId, condition);
      onQuerySuccess({
        newlyEliminatedIds: result.newlyEliminatedIds,
        session: result.session,
        matched: result.matched,
        autoResolved: result.autoResolved,
        roundScore: result.roundScore,
        answer: result.answer,
      });
      setPicked(null);
      resetValueForm();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [
    picked,
    loading,
    operator,
    numericValue,
    enumValue,
    session.sessionId,
    onQuerySuccess,
    resetValueForm,
  ]);

  useEffect(() => {
    setPicked(null);
    resetValueForm();
  }, [session.questionIndex, choices, resetValueForm]);

  const left = choices[0];
  const right = choices[1];
  const operators = useMemo<ReverseOperator[]>(
    () => (picked?.kind === 'numeric' ? ['>=', '<='] : ['==', '!=']),
    [picked?.kind]
  );

  if (choices.length === 0) {
    return (
      <p className="text-xs text-apple-gray text-center py-1">
        当前存活池已无法继续区分，请给出终极猜测
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-center text-gray-700">
        {choices.length === 1 ? '本轮仅剩一个有效条件' : '本轮条件二选一'}
      </p>

      {!picked ? (
        <div className="flex items-stretch justify-center gap-2">
          {left && (
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => handlePickField(left)}
              className="flex-1 max-w-[140px] min-h-[3.25rem] rounded-lg border-2 border-gray-200 bg-white px-2 py-2 text-center hover:border-apple-blue/50 hover:bg-apple-blue/[0.04] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span className="block text-xs font-semibold">{left.label}</span>
              <span className="block text-[10px] text-apple-gray mt-0.5">
                {left.kind === 'numeric' ? '数值' : '属性'}
              </span>
            </button>
          )}
          {left && right && (
            <span className="self-center text-sm font-bold text-apple-gray shrink-0">或</span>
          )}
          {right && (
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => handlePickField(right)}
              className="flex-1 max-w-[140px] min-h-[3.25rem] rounded-lg border-2 border-gray-200 bg-white px-2 py-2 text-center hover:border-apple-blue/50 hover:bg-apple-blue/[0.04] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span className="block text-xs font-semibold">{right.label}</span>
              <span className="block text-[10px] text-apple-gray mt-0.5">
                {right.kind === 'numeric' ? '数值' : '属性'}
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-1.5">
            <div className="flex flex-1 min-w-0 gap-1.5 items-stretch">
              <button
                type="button"
                title="点击重选条件"
                onClick={handleReselect}
                className={`${blockClass(true)} shrink-0 flex flex-col items-center justify-center min-w-[3.25rem] max-w-[4rem] min-h-[52px]`}
              >
                <span className="font-semibold text-xs leading-tight">{picked.label}</span>
                <span className="text-[9px] text-apple-blue/80 mt-0.5 font-normal">重选</span>
              </button>

              <div className="flex flex-col gap-1 shrink-0 justify-center w-[4.5rem] sm:w-[5rem]">
                {operators.map((op) => (
                  <button
                    key={op}
                    type="button"
                    className={blockClass(operator === op, true)}
                    onClick={() => setOperator(op)}
                  >
                    {reverseOperatorLabel(op)}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0 flex items-stretch">
                {values?.kind === 'enum' ? (
                  <select
                    className="input-field w-full min-h-[52px] text-xs rounded-lg py-1"
                    value={enumValue}
                    onChange={(e) => setEnumValue(e.target.value)}
                  >
                    {values.values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : values?.kind === 'numeric' ? (
                  <input
                    type="number"
                    className="input-field w-full min-h-[52px] text-xs rounded-lg py-1 placeholder:text-gray-400"
                    value={numericValue}
                    placeholder={
                      session.theme === 'pokemon' ? '请填写种族值' : '请填写数值'
                    }
                    onChange={(e) => setNumericValue(e.target.value)}
                  />
                ) : (
                  <div className="input-field w-full min-h-[52px] flex items-center text-xs text-apple-gray">
                    ...
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn-primary hidden sm:flex shrink-0 px-4 min-h-[52px] items-center justify-center rounded-lg text-sm"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? '...' : '提交'}
            </button>
          </div>

          <button
            type="button"
            className="btn-primary w-full sm:hidden min-h-[36px] rounded-lg text-sm py-2"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '判定中...' : '确认提交'}
          </button>

        </div>
      )}

      {error && <p className="text-[11px] text-apple-red text-center">{error}</p>}
    </div>
  );
}

export default memo(ReverseDualFieldPicker);
