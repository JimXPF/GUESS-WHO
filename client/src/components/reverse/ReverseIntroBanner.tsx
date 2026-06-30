import { memo } from 'react';

function ReverseIntroBanner() {
  return (
    <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-gray-200/50 bg-white/60">
      <p className="max-w-3xl mx-auto text-xs sm:text-sm text-apple-gray text-center">
        <span className="font-medium text-gray-700">玩法介绍：</span>
        二选一配置筛选条件 → 根据对错缩小候选池 → 筛选用尽或唯一时给出答案
      </p>
    </div>
  );
}

export default memo(ReverseIntroBanner);
