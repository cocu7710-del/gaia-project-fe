import React from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';

interface Props {
  roomId: string;
  myPlayerId: string;
}

const ACTION_LABELS: Record<string, { label: string; desc: string }> = {
  TINK_TERRAFORM_1: { label: '1삽 테라포밍', desc: '테라포밍 1단계' },
  TINK_POWER_4: { label: '4파워 순환', desc: '파워 4 차징' },
  TINK_QIC_1: { label: '1 QIC', desc: 'QIC 1 획득' },
  TINK_TERRAFORM_3: { label: '3삽 테라포밍', desc: '테라포밍 3단계' },
  TINK_KNOWLEDGE_3: { label: '3 지식', desc: '지식 3 획득' },
  TINK_QIC_2: { label: '2 QIC', desc: 'QIC 2 획득' },
};

export const TinkeroidsActionChoiceDialog: React.FC<Props> = ({ roomId, myPlayerId }) => {
  const data = useGameStore(s => s.tinkeroidsActionChoice);
  const [loading, setLoading] = React.useState(false);

  const isMyChoice = data?.tinkeroidsPlayerId === myPlayerId;

  if (!data) return null;

  if (!isMyChoice) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-pink-900/90 backdrop-blur-sm border border-pink-500/40 text-pink-200 px-6 py-2.5 rounded-xl z-40 text-sm shadow-lg">
        팅커로이드가 라운드 {data.currentRound} 액션 타일을 선택 중입니다...
      </div>
    );
  }

  const handleSelect = async (actionCode: string) => {
    setLoading(true);
    try {
      const res = await roomApi.tinkeroidsActionChoice(roomId, myPlayerId, actionCode);
      if (!res.data.success) {
        alert(res.data.message ?? '액션 선택 실패');
      }
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-pink-500 rounded-xl p-5 w-[380px] text-white">
        <h3 className="text-lg font-bold text-pink-400 mb-2">팅커로이드 PI - 액션 타일 선택</h3>
        <p className="text-gray-300 text-sm mb-3">
          라운드 {data.currentRound} 사용할 액션을 선택하세요.
          {data.currentRound <= 3 ? ' (1~3라운드 풀)' : ' (4~6라운드 풀)'}
        </p>

        <div className="flex flex-col gap-2">
          {data.availableActions.map(code => {
            const info = ACTION_LABELS[code] ?? { label: code, desc: '' };
            return (
              <button key={code}
                onClick={() => !loading && handleSelect(code)}
                disabled={loading}
                className="w-full bg-pink-700 hover:bg-pink-600 disabled:opacity-50 py-2.5 px-4 rounded-lg font-semibold text-left cursor-pointer transition">
                <span className="text-white">{info.label}</span>
                <span className="text-pink-200 text-sm ml-2">— {info.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
