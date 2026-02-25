type ScoreSelectorProps = {
    settingScore: number;
    setSettingScore: (score: number) => void;
};

export const ScoreSelector = ({ settingScore, setSettingScore }: ScoreSelectorProps) => (
    <div className="flex flex-col items-center gap-2 mb-4">
        <p className="text-gray-500 font-bold text-sm">勝利条件</p>
        <div className="flex bg-gray-100 p-1 rounded-xl">
            {[3, 5, 10].map(num => (
                <button
                    key={num}
                    onClick={() => setSettingScore(num)}
                    className={`px-4 py-2 rounded-lg font-bold transition ${settingScore === num ? 'bg-white text-[#5B46F5] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    {num}回
                </button>
            ))}
        </div>
    </div>
);
