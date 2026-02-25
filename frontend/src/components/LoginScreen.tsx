import { ScoreSelector } from './ScoreSelector';

type LoginScreenProps = {
    loginStep: 'SELECT' | 'FRIEND' | 'FRIEND_INPUT' | 'WAITING' | 'DIFFICULTY';
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
};

export const LoginScreen = ({
    loginStep, isCreator, loginError, inputRoom, setInputRoom, setLoginError,
    settingScore, setSettingScore, startCpuFlow, joinRandom, joinFriend,
    createRoom, enterRoomFlow, joinRoomInternal, confirmDifficulty
}: LoginScreenProps) => {
    return (
        <div className="animate-fade-in w-full max-w-4xl mx-auto h-full flex flex-col p-4">
            {loginStep === 'SELECT' && (
                <div className="flex flex-col items-center justify-center gap-8 h-full py-4">
                    <div className="flex-1 w-full max-w-md space-y-6">
                        <div className="text-center space-y-2">
                            <h2 className="text-3xl font-bold text-[#5B46F5] leading-tight">
                                相手より早く<br />人間か証明できる？
                            </h2>
                        </div>

                        <div className="bg-[#F9F9F7] p-6 rounded-3xl text-left space-y-4 shadow-sm border border-gray-100">
                            <h3 className="text-center font-bold text-gray-800 text-lg mb-2">ルール：</h3>
                            <ul className="space-y-3 text-base text-gray-700 font-medium">
                                <li className="flex items-start gap-3">
                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                    画像の該当部分をすべて選択
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                    「確認」ボタンを押して正解なら1点
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                    2連続正解で相手を妨害！
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex-1 w-full max-w-md space-y-4 pb-10">
                        <p className="text-center text-gray-400 font-bold mb-2">対戦モードを選択</p>
                        <button onClick={startCpuFlow} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-indigo-50 p-3 rounded-xl group-hover:scale-110 transition">🤖</span>
                                <div className="text-left">
                                    <p className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">CPUと対戦</p>
                                    <p className="text-sm text-gray-400 font-medium">一人で練習</p>
                                </div>
                            </div>
                            <svg className="w-6 h-6 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button onClick={joinRandom} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-pink-100 hover:border-pink-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-pink-50 p-3 rounded-xl group-hover:scale-110 transition">🌍</span>
                                <div className="text-left">
                                    <p className="text-xl font-bold text-gray-800 group-hover:text-pink-600 transition">誰かと対戦</p>
                                    <p className="text-sm text-gray-400 font-medium">ランダムマッチ</p>
                                </div>
                            </div>
                            <svg className="w-6 h-6 text-gray-300 group-hover:text-pink-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button onClick={joinFriend} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-teal-100 hover:border-teal-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-teal-50 p-3 rounded-xl group-hover:scale-110 transition">🤝</span>
                                <div className="text-left">
                                    <p className="text-xl font-bold text-gray-800 group-hover:text-teal-600 transition">友達と対戦</p>
                                    <p className="text-sm text-gray-400 font-medium">部屋を作る・入る</p>
                                </div>
                            </div>
                            <svg className="w-6 h-6 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {loginStep === 'FRIEND' && (
                <div className="flex flex-col items-center justify-center gap-6 h-full py-4">
                    <div className="text-center space-y-2">
                        <span className="bg-teal-50 text-teal-600 p-4 rounded-2xl text-4xl inline-block mb-2">🤝</span>
                        <h2 className="text-3xl font-bold text-gray-800">友達と対戦</h2>
                        <p className="text-gray-500 font-medium">メニューを選択</p>
                    </div>

                    <div className="w-full max-w-md space-y-4">
                        <button onClick={createRoom} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-indigo-50 p-3 rounded-xl group-hover:scale-110 transition">🏠</span>
                                <div className="text-left">
                                    <p className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">部屋を作る</p>
                                    <p className="text-sm text-gray-400 font-medium">ホストになる</p>
                                </div>
                            </div>
                            <svg className="w-6 h-6 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>

                        <button onClick={enterRoomFlow} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-teal-100 hover:border-teal-500 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <span className="text-3xl bg-teal-50 p-3 rounded-xl group-hover:scale-110 transition">🔑</span>
                                <div className="text-left">
                                    <p className="text-xl font-bold text-gray-800 group-hover:text-teal-600 transition">部屋に入る</p>
                                    <p className="text-sm text-gray-400 font-medium">IDを入力して参加</p>
                                </div>
                            </div>
                            <svg className="w-6 h-6 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {loginStep === 'FRIEND_INPUT' && (
                <div className="space-y-6 text-center flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-gray-700">{isCreator ? "ルームIDを決める" : "ルームIDを入力"}</h2>
                        <p className="text-sm text-gray-400">{isCreator ? "好きなIDを入力してね" : "友達から教えてもらったIDを入力してね"}</p>
                    </div>

                    <div className="relative">
                        {loginError && <p className="absolute -top-7 left-0 w-full text-red-500 font-bold text-sm">{loginError}</p>}
                        <input
                            type="text"
                            value={inputRoom}
                            onChange={(e) => {
                                setInputRoom(e.target.value);
                                if (loginError) setLoginError('');
                            }}
                            placeholder="1234"
                            className="w-full text-3xl font-bold text-center py-4 rounded-xl border-2 border-gray-200 bg-white focus:border-[#5B46F5] focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all tracking-widest placeholder-gray-200 shadow-sm"
                            autoFocus
                        />
                    </div>

                    {isCreator && <ScoreSelector settingScore={settingScore} setSettingScore={setSettingScore} />}

                    <button
                        onClick={() => joinRoomInternal(inputRoom)}
                        className="w-full bg-[#5B46F5] text-white text-lg font-bold py-4 rounded-xl hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 active:shadow-none"
                    >
                        {isCreator ? "部屋を作る" : "入室する"}
                    </button>
                </div>
            )}

            {loginStep === 'DIFFICULTY' && (
                <div className="flex flex-col items-center justify-center gap-6 h-full py-4">
                    <div className="text-center space-y-2">
                        <span className="bg-orange-100 text-orange-600 p-4 rounded-2xl text-4xl inline-block mb-2">⚡</span>
                        <h2 className="text-3xl font-black text-gray-800">設定を選択</h2>
                        <p className="text-gray-500 font-medium">チャレンジの難しさを選んでね</p>
                    </div>

                    <ScoreSelector settingScore={settingScore} setSettingScore={setSettingScore} />

                    <div className="w-full max-w-md space-y-4">
                        <button
                            onClick={() => confirmDifficulty(1)}
                            className="w-full group bg-white border-2 border-green-200 hover:border-green-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                        >
                            <div className="bg-green-100 text-green-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">1</div>
                            <div className="text-left">
                                <p className="text-xl font-bold text-green-600">よわい</p>
                                <p className="text-sm text-gray-400">のんびりプレイ向け</p>
                            </div>
                        </button>

                        <button
                            onClick={() => confirmDifficulty(2)}
                            className="w-full group bg-white border-2 border-orange-200 hover:border-orange-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                        >
                            <div className="bg-orange-100 text-orange-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">2</div>
                            <div className="text-left">
                                <p className="text-xl font-bold text-orange-600">ふつう</p>
                                <p className="text-sm text-gray-400">バランスの取れた難易度</p>
                            </div>
                        </button>

                        <button
                            onClick={() => confirmDifficulty(3)}
                            className="w-full group bg-white border-2 border-red-200 hover:border-red-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                        >
                            <div className="bg-red-100 text-red-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">3</div>
                            <div className="text-left">
                                <p className="text-xl font-bold text-red-600">つよい</p>
                                <p className="text-sm text-gray-400">本気で挑戦したい人向け</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
