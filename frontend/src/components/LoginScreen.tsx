import { ScoreSelector } from './ScoreSelector';

type LoginScreenProps = {
    loginStep: 'SELECT' | 'FRIEND' | 'FRIEND_INPUT' | 'WAITING' | 'DIFFICULTY' | 'CPU_PLAYER_COUNT';
    isCreator: boolean;
    loginError: string;
    inputRoom: string;
    setInputRoom: (room: string) => void;
    setLoginError: (err: string) => void;
    settingScore: number;
    setSettingScore: (score: number) => void;
    startCpuFlow: () => void;
    joinRandom: () => void;
    joinFriend: () => void;
    createRoom: () => void;
    enterRoomFlow: () => void;
    joinRoomInternal: (room: string) => void;
    confirmDifficulty: (level: number) => void;
    confirmPlayerCount: (count: 1 | 3 | 4) => void;
    cpuPlayerCount: 1 | 3 | 4;
};

export const LoginScreen = ({
    loginStep, isCreator, loginError, inputRoom, setInputRoom, setLoginError,
    settingScore, setSettingScore, startCpuFlow, joinRandom, joinFriend,
    createRoom, enterRoomFlow, joinRoomInternal, confirmDifficulty, confirmPlayerCount, cpuPlayerCount
}: LoginScreenProps) => {
    return (
        <div className="animate-fade-in w-full max-w-4xl mx-auto h-full flex flex-col p-2 sm:p-4">
            {loginStep === 'SELECT' && (
                <div className="flex flex-col items-center justify-center gap-2 sm:gap-4 py-1 sm:py-2 mt-1 sm:mt-2">
                    <div className="w-full max-w-md space-y-2 sm:space-y-4">
                        <div className="text-center space-y-1 sm:space-y-2">
                            <h2 className="text-2xl sm:text-3xl font-bold text-[#5B46F5] leading-tight">
                                相手より早く<br />人間か証明できる？
                            </h2>
                        </div>

                        <div className="bg-[#F9F9F7] p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl text-left space-y-1 sm:space-y-2 shadow-sm border border-gray-100">
                            <h3 className="text-center font-bold text-gray-800 text-base sm:text-lg mb-0.5 sm:mb-1">ルール：</h3>
                            <ul className="space-y-1.5 sm:space-y-3 text-sm sm:text-base text-gray-700 font-medium">
                                <li className="flex items-start gap-2 sm:gap-3">
                                    <span className="text-[#5B46F5] font-bold text-lg sm:text-xl">✓</span>
                                    画像の該当部分をすべて選択
                                </li>
                                <li className="flex items-start gap-2 sm:gap-3">
                                    <span className="text-[#5B46F5] font-bold text-lg sm:text-xl">✓</span>
                                    「確認」ボタンを押して正解なら1点
                                </li>
                                <li className="flex items-start gap-2 sm:gap-3">
                                    <span className="text-[#5B46F5] font-bold text-lg sm:text-xl">✓</span>
                                    2連続正解で相手を妨害！
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="w-full max-w-md space-y-1.5 sm:space-y-2 pb-2 sm:pb-4">
                        <p className="text-center text-gray-400 text-xs sm:text-sm font-bold mb-0.5 sm:mb-1">対戦モードを選択</p>
                        <button onClick={startCpuFlow} className="group w-full flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <span className="text-2xl sm:text-3xl bg-indigo-50 p-2 sm:p-3 rounded-lg sm:rounded-xl group-hover:scale-110 transition">🤖</span>
                                <div className="text-left">
                                    <p className="text-lg sm:text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">CPUと対戦</p>
                                    <p className="text-xs sm:text-sm text-gray-400 font-medium">一人で練習</p>
                                </div>
                            </div>
                            <svg className="w-5 h-5 sm:w-6 h-6 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button onClick={joinRandom} className="group w-full flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl bg-white border-2 border-pink-100 hover:border-pink-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <span className="text-2xl sm:text-3xl bg-pink-50 p-2 sm:p-3 rounded-lg sm:rounded-xl group-hover:scale-110 transition">🌍</span>
                                <div className="text-left">
                                    <p className="text-lg sm:text-xl font-bold text-gray-800 group-hover:text-pink-600 transition">誰かと対戦</p>
                                    <p className="text-xs sm:text-sm text-gray-400 font-medium">ランダムマッチ</p>
                                </div>
                            </div>
                            <svg className="w-5 h-5 sm:w-6 h-6 text-gray-300 group-hover:text-pink-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button onClick={joinFriend} className="group w-full flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl bg-white border-2 border-teal-100 hover:border-teal-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <span className="text-2xl sm:text-3xl bg-teal-50 p-2 sm:p-3 rounded-lg sm:rounded-xl group-hover:scale-110 transition">🤝</span>
                                <div className="text-left">
                                    <p className="text-lg sm:text-xl font-bold text-gray-800 group-hover:text-teal-600 transition">友達と対戦</p>
                                    <p className="text-xs sm:text-sm text-gray-400 font-medium">部屋を作る・入る</p>
                                </div>
                            </div>
                            <svg className="w-5 h-5 sm:w-6 h-6 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {loginStep === 'FRIEND' && (
                <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 py-4 sm:py-8 mt-2 sm:mt-4">
                    <div className="text-center space-y-1 sm:space-y-2">
                        <span className="bg-teal-50 text-teal-600 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl text-3xl sm:text-4xl inline-block mb-1 sm:mb-2">🤝</span>
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">友達と対戦</h2>
                        <p className="text-sm sm:text-base text-gray-500 font-medium">メニューを選択</p>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-400 text-center px-4">友達にIDを共有して対戦しよう</p>

                    <div className="w-full max-w-md space-y-3 sm:space-y-4">
                        <button onClick={createRoom} className="group w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <span className="text-2xl sm:text-3xl bg-indigo-50 p-2 sm:p-3 rounded-lg sm:rounded-xl group-hover:scale-110 transition">🏠</span>
                                <div className="text-left">
                                    <p className="text-lg sm:text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">部屋を作る</p>
                                    <p className="text-xs sm:text-sm text-gray-400 font-medium">ホストになる</p>
                                </div>
                            </div>
                            <svg className="w-5 h-5 sm:w-6 h-6 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>

                        <button onClick={enterRoomFlow} className="group w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-white border-2 border-teal-100 hover:border-teal-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <span className="text-2xl sm:text-3xl bg-teal-50 p-2 sm:p-3 rounded-lg sm:rounded-xl group-hover:scale-110 transition">🔑</span>
                                <div className="text-left">
                                    <p className="text-lg sm:text-xl font-bold text-gray-800 group-hover:text-teal-600 transition">部屋に入る</p>
                                    <p className="text-xs sm:text-sm text-gray-400 font-medium">IDを入力して参加</p>
                                </div>
                            </div>
                            <svg className="w-5 h-5 sm:w-6 h-6 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {loginStep === 'FRIEND_INPUT' && (
                <div className="space-y-4 sm:space-y-6 text-center flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-4">
                    <div className="space-y-1 sm:space-y-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-700">{isCreator ? "ルームIDを決める" : "ルームIDを入力"}</h2>
                        <p className="text-xs sm:text-sm text-gray-400">{isCreator ? "好きなIDを入力してね" : "友達から教えてもらったIDを入力してね"}</p>
                    </div>

                    <div className="relative">
                        {loginError && <p className="absolute -top-6 sm:text-red-500 text-red-500 font-bold text-xs sm:text-sm w-full text-center">{loginError}</p>}
                        <input
                            type="text"
                            value={inputRoom}
                            onChange={(e) => {
                                setInputRoom(e.target.value);
                                if (loginError) setLoginError('');
                            }}
                            placeholder="1234"
                            className="w-full text-2xl sm:text-3xl font-bold text-center py-2.5 sm:py-4 rounded-xl border-2 border-gray-200 bg-white focus:border-[#5B46F5] focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all tracking-widest placeholder-gray-200 shadow-sm"
                            autoFocus
                        />
                    </div>

                    {isCreator && <ScoreSelector settingScore={settingScore} setSettingScore={setSettingScore} />}

                    <button
                        onClick={() => joinRoomInternal(inputRoom)}
                        className="w-full bg-[#5B46F5] text-white text-base sm:text-lg font-bold py-2.5 sm:py-4 rounded-xl hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 active:shadow-none"
                    >
                        {isCreator ? "部屋を作る" : "入室する"}
                    </button>
                </div>
            )}

            {loginStep === 'CPU_PLAYER_COUNT' && (
                <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 py-2 sm:py-3 mt-4 sm:mt-12 md:mt-28">
                    <div className="text-center space-y-0.5 sm:space-y-1">
                        <h2 className="text-xl sm:text-2xl font-black text-gray-800">何人で対戦する？</h2>
                        <p className="text-gray-500 text-xs sm:text-sm">プレイヤー数を選択してね</p>
                    </div>

                    <div className="w-full max-w-md space-y-2 sm:space-y-3">
                        <button
                            onClick={() => confirmPlayerCount(1)}
                            className={`w-full group border-2 p-2 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3 transition-all duration-200 ${cpuPlayerCount === 1
                                ? 'bg-white border-blue-500 shadow-md'
                                : 'bg-white border-blue-200 hover:border-blue-500 hover:shadow-md'
                                }`}
                        >
                            <div className="bg-blue-100 text-blue-600 font-black text-lg sm:text-xl w-8 h-8 sm:w-10 h-10 flex items-center justify-center rounded-full shrink-0">1</div>
                            <div className="text-left">
                                <p className="text-base sm:text-lg font-bold text-blue-600">1vs1</p>
                                <p className="text-[10px] sm:text-xs text-gray-400 font-medium">CPU 1体と対戦</p>
                            </div>
                        </button>

                        <button
                            onClick={() => confirmPlayerCount(3)}
                            className={`w-full group border-2 p-2 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3 transition-all duration-200 ${cpuPlayerCount === 3
                                ? 'bg-orange-50 border-orange-500 shadow-md'
                                : 'bg-white border-orange-200 hover:border-orange-500 hover:shadow-md'
                                }`}
                        >
                            <div className="bg-orange-100 text-orange-600 font-black text-lg sm:text-xl w-8 h-8 sm:w-10 h-10 flex items-center justify-center rounded-full shrink-0">3</div>
                            <div className="text-left">
                                <p className="text-base sm:text-lg font-bold text-orange-600">3人対戦</p>
                                <p className="text-[10px] sm:text-xs text-gray-400 font-medium">CPU 2体と同時対戦</p>
                            </div>
                        </button>

                        <button
                            onClick={() => confirmPlayerCount(4)}
                            className={`w-full group border-2 p-2 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3 transition-all duration-200 ${cpuPlayerCount === 4
                                ? 'bg-white border-red-300 shadow-md'
                                : 'bg-white border-red-200 hover:border-red-300 hover:shadow-md'
                                }`}
                        >
                            <div className="bg-red-100 text-red-600 font-black text-lg sm:text-xl w-8 h-8 sm:w-10 h-10 flex items-center justify-center rounded-full shrink-0">4</div>
                            <div className="text-left">
                                <p className="text-base sm:text-lg font-bold text-red-600">4人バトル</p>
                                <p className="text-[10px] sm:text-xs text-gray-400 font-medium">CPU 3体と大乱闘</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {loginStep === 'DIFFICULTY' && (
                <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 py-2 sm:py-8 mt-2 sm:mt-4">
                    <div className="text-center space-y-1 sm:space-y-2">
                        <h2 className="text-2xl sm:text-3xl font-black text-gray-800">設定を選択</h2>
                        <p className="text-gray-500 font-medium text-xs sm:text-sm">チャレンジの難しさを選んでね</p>
                    </div>

                    <ScoreSelector settingScore={settingScore} setSettingScore={setSettingScore} />

                    <div className="w-full max-w-md space-y-2.5 sm:space-y-4">
                        <button
                            onClick={() => confirmDifficulty(1)}
                            className="w-full group bg-white border-2 border-green-200 hover:border-green-500 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4"
                        >
                            <div className="bg-green-100 text-green-600 font-black text-xl sm:text-2xl w-9 h-9 sm:w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">1</div>
                            <div className="text-left">
                                <p className="text-base sm:text-xl font-bold text-green-600">よわい</p>
                                <p className="text-xs sm:text-sm text-gray-400">のんびりプレイ向け</p>
                            </div>
                        </button>

                        <button
                            onClick={() => confirmDifficulty(2)}
                            className="w-full group bg-white border-2 border-orange-200 hover:border-orange-500 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4"
                        >
                            <div className="bg-orange-100 text-orange-600 font-black text-xl sm:text-2xl w-9 h-9 sm:w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">2</div>
                            <div className="text-left">
                                <p className="text-base sm:text-xl font-bold text-orange-600">ふつう</p>
                                <p className="text-xs sm:text-sm text-gray-400">バランスの取れた難易度</p>
                            </div>
                        </button>

                        <button
                            onClick={() => confirmDifficulty(3)}
                            className="w-full group bg-white border-2 border-red-200 hover:border-red-500 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4"
                        >
                            <div className="bg-red-100 text-red-600 font-black text-xl sm:text-2xl w-9 h-9 sm:w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">3</div>
                            <div className="text-left">
                                <p className="text-base sm:text-xl font-bold text-red-600">つよい</p>
                                <p className="text-xs sm:text-sm text-gray-400">本気で挑戦したい人向け</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
